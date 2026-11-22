const settingsService = require("./settingsService");
const { prisma } = require("../utilities/db");
const { executeReadOnlyQuery } = require("../utilities/aiReadOnlyDb");
const { assertOutboundUrlSafe } = require("../utilities/ssrfGuard");

// Schéma v1.0 simplifié et sécurisé de la base de données transmis au LLM
// (strictement sans données personnelles PII, ni tables d'authentification/système)
const SAFE_SCHEMA_PROMPT = `
Vous êtes un expert MySQL / MariaDB pour l'application FabtrackJS (gestion de Fablab).
Votre rôle est de traduire les questions des administrateurs en requêtes SQL valides, sécurisées et performantes en lecture seule.

ATTENTION CRITIQUE : RESPECTEZ SCRUPULEUSEMENT LES NOMS EXACTS DES TABLES ET DES COLONNES CI-DESSOUS (LA CASSE DES TABLES EST IMPORTANTE SOUS LINUX/MARIADB).

SCHÉMA DES TABLES / VUES MARIADB (SANS PII) :

1. Table \`User\` (Contributeurs / Usagers du Fablab — NE JAMAIS sélectionner email, token ou rfid) :
   - id (INT, PRIMARY KEY)
   - name (VARCHAR) : Prénom
   - surname (VARCHAR) : Nom de famille
   - usertypeId (INT) : Référence à Usertype(id)
   - createdAt (DATETIME) : Date d'inscription
   - birthYear (INT, NULL) : Année de naissance
   - balance (DECIMAL) : Solde financier en euros
   - termsAccepted (BOOLEAN) : Charte acceptée (1=oui, 0=non)
   - isExpert (BOOLEAN) : Statut bénévole / expert
   - deletedAt (DATETIME, NULL) : Date d'archivage si supprimé

2. Table \`Usertype\` : id, name
3. Table \`Project\` : id, url, projecttypeId, teachingUnitId, sorbonneEntity, createdAt, active
4. Table \`Projecttype\` : id, name
5. Table \`UserProject\` : id, userId, projectId (liaison N-à-N entre User et Project)
6. Table \`History\` : id, arrival, departure, userId, userprojectId, teachingUnitId, sorbonneEntity, workspaceId, repairObject, repairStatus, workshopId
7. Table \`Activity\` : id, createdAt, historyId, userId, resourceId, resourceType ('MACHINE', 'EQUIPMENT', 'CONSUMABLE'), quantity, borrowDurationDays, expectedReturnAt, returnedAt, startedAt, endedAt, gcodeName, filamentQuantity, filamentType, printDuration, settled, settledAt
8. Table \`Machine\` : id, name, machinetypeId, categoryId, locationId, make, model, accessId
9. Table \`MachineType\` : id, name
10. Table \`Consumable\` : id, name, cost, stock, reorderThreshold, status, unit, categoryId
11. Table \`Equipment\` : id, name, workspaceId, status
12. Table \`Workspace\` : id, name, location
13. Table \`TeachingUnit\` : id, code, name, department, active
14. Table \`Category\` : id, name, workspaceId
15. Table \`Location\` : id, name, description
16. Table \`Workshop\` : id, name, accessId, active, createdAt
17. Table \`UserWorkshopCompletion\` : id, userId, workshopId, awardedAt
18. Table \`MachineIssue\` : id, machineId, status ('OPEN', 'RESOLVED'), createdAt, resolvedAt
19. Table \`MachineMaintenance\` : id, machineId, maintenanceDate, type, cost
20. Table \`InventoryMovement\` : id, createdAt, itemType, itemId, itemName, quantity, unit, reason

RÈGLES ABSOLUES POUR LA REQUÊTE SQL :
1. STRICTEMENT EN LECTURE SEULE : UNIQUEMENT SELECT (ou WITH ... SELECT). Aucun INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, REPLACE.
2. INTERDICTION FORMELLE d'utiliser SELECT * (sauf COUNT(*)), des commentaires SQL (-- , /* */ , #), ou d'accéder aux tables Staff, SystemSetting, Session, Log, information_schema, mysql, performance_schema.
3. INTERDICTION FORMELLE de sélectionner des champs sensibles ou PII : password, pwdToken, token, rfid, email, reporterEmail, responsibleEmail.
4. Ne jamais insérer de point-virgule multiple ou plusieurs requêtes.

FORMAT DE RÉPONSE OBLIGATOIRE :
Répondre UNIQUEMENT par un objet JSON valide sans Markdown ni texte additionnel :
{
  "sql": "SELECT ...",
  "explanation": "Explication claire en 1 ou 2 phrases en français",
  "chartType": "kpi" | "bar" | "line" | "pie" | "doughnut" | "table",
  "title": "Titre synthétique du résultat",
  "xKey": "nom_colonne_pour_les_libelles_ou_null",
  "yKey": "nom_colonne_pour_les_valeurs_numeriques_ou_null"
}
`;

class AiQueryService {
  /**
   * Retourne la configuration actuelle de l'IA
   */
  async getConfig() {
    const settings = await settingsService.getSettings();
    return {
      provider: settings.ai_provider || "none",
      openaiApiKey: settings.ai_openai_api_key || "",
      openaiModel: settings.ai_openai_model || "gpt-4o-mini",
      geminiApiKey: settings.ai_gemini_api_key || "",
      geminiModel: settings.ai_gemini_model || "gemini-1.5-flash",
      anthropicApiKey: settings.ai_anthropic_api_key || "",
      anthropicModel: settings.ai_anthropic_model || "claude-3-5-haiku-20241022",
      localUrl: settings.ai_local_url || "http://localhost:11434/v1",
      localModel: settings.ai_local_model || "llama3.2",
      localApiKey: settings.ai_local_api_key || "",
    };
  }

  /**
   * Teste la connexion avec le fournisseur configuré
   */
  async testConnection(customConfig = null) {
    const config = customConfig || (await this.getConfig());
    const provider = config.provider;

    if (!provider || provider === "none") {
      throw new Error("Aucun fournisseur d'IA n'est actuellement activé.");
    }

    const testPrompt = "Réponds uniquement par le mot OK au format JSON: {\"status\": \"OK\"}";

    try {
      const response = await this.callProvider(provider, config, [
        { role: "user", content: testPrompt },
      ]);
      return {
        success: true,
        provider,
        message: `Connexion réussie avec ${this.getProviderLabel(provider)} !`,
        raw: response,
      };
    } catch (err) {
      console.error(`[AI Test Connection] Error for provider ${provider}: ${err.message}`);
      throw new Error(`Échec de connexion avec ${this.getProviderLabel(provider)} : ${err.message}`);
    }
  }

  getProviderLabel(provider) {
    switch (provider) {
      case "openai":
        return "OpenAI (ChatGPT)";
      case "gemini":
        return "Google Gemini";
      case "anthropic":
        return "Anthropic (Claude)";
      case "local":
        return "LLM Local (Ollama / Compatible OpenAI)";
      default:
        return provider;
    }
  }

  /**
   * Appelle l'API du fournisseur sélectionné
   */
  async callProvider(provider, config, messages) {
    const fetch = global.fetch;
    const timeoutMs = 30000;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      if (provider === "openai") {
        if (!config.openaiApiKey) {
          throw new Error("Clé API OpenAI non renseignée.");
        }
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.openaiApiKey}`,
          },
          body: JSON.stringify({
            model: config.openaiModel || "gpt-4o-mini",
            messages,
            temperature: 0.1,
            response_format: { type: "json_object" },
          }),
          signal: controller.signal,
        });
        if (!res.ok) {
          const errText = await res.text();
          console.error(`[AI OpenAI Error] HTTP ${res.status}: ${errText.slice(0, 500)}`);
          throw new Error(`Erreur API OpenAI (HTTP ${res.status}). Vérifiez la clé API et le modèle configurés.`);
        }
        const data = await res.json();
        return data.choices?.[0]?.message?.content || "";
      }

      if (provider === "gemini") {
        if (!config.geminiApiKey) {
          throw new Error("Clé API Google Gemini non renseignée.");
        }
        // Utilisation de l'endpoint compatible OpenAI de Google Gemini v1beta
        const model = String(config.geminiModel || "gemini-1.5-flash").trim();
        const encodedModel = encodeURIComponent(model);
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${config.geminiApiKey}`,
            },
            body: JSON.stringify({
              model,
              messages,
              temperature: 0.1,
              response_format: { type: "json_object" },
            }),
            signal: controller.signal,
          },
        );
        if (!res.ok) {
          // Fallback sur l'API native Google avec la clé en en-tête x-goog-api-key (jamais en query string)
          const nativeRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${encodedModel}:generateContent`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": config.geminiApiKey,
              },
              body: JSON.stringify({
                contents: messages.map((m) => ({
                  role: m.role === "assistant" ? "model" : "user",
                  parts: [{ text: m.content }],
                })),
                generationConfig: {
                  responseMimeType: "application/json",
                  temperature: 0.1,
                },
              }),
              signal: controller.signal,
            },
          );
          if (!nativeRes.ok) {
            const errBody = await nativeRes.text();
            console.error(`[AI Gemini Error] HTTP ${nativeRes.status}: ${errBody.slice(0, 500)}`);
            throw new Error(`Erreur API Gemini (HTTP ${nativeRes.status}). Vérifiez la clé API et le modèle configurés.`);
          }
          const nativeData = await nativeRes.json();
          return nativeData.candidates?.[0]?.content?.parts?.[0]?.text || "";
        }
        const data = await res.json();
        return data.choices?.[0]?.message?.content || "";
      }

      if (provider === "anthropic") {
        if (!config.anthropicApiKey) {
          throw new Error("Clé API Anthropic non renseignée.");
        }
        // Format Anthropic Messages API : le message système est passé à la racine
        const systemMsg = messages.find((m) => m.role === "system")?.content || "";
        const userMessages = messages.filter((m) => m.role !== "system");

        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": config.anthropicApiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: config.anthropicModel || "claude-3-5-haiku-20241022",
            max_tokens: 1500,
            system: systemMsg,
            messages: userMessages.map((m) => ({
              role: m.role === "assistant" ? "assistant" : "user",
              content: m.content,
            })),
            temperature: 0.1,
          }),
          signal: controller.signal,
        });
        if (!res.ok) {
          const errText = await res.text();
          console.error(`[AI Anthropic Error] HTTP ${res.status}: ${errText.slice(0, 500)}`);
          throw new Error(`Erreur API Claude (HTTP ${res.status}). Vérifiez la clé API et le modèle configurés.`);
        }
        const data = await res.json();
        return data.content?.[0]?.text || "";
      }

      if (provider === "local") {
        let base = (config.localUrl || "http://localhost:11434/v1").trim().replace(/\/+$/, "");
        if (!base.endsWith("/chat/completions")) {
          base = `${base}/chat/completions`;
        }
        await assertOutboundUrlSafe(base, {
          allowlistEnvKeys: ["AI_LOCAL_ALLOWED_HOSTS", "SSRF_ALLOWED_HOSTS"],
          label: "URL LLM Local",
        });
        const headers = { "Content-Type": "application/json" };
        if (config.localApiKey) {
          headers["Authorization"] = `Bearer ${config.localApiKey}`;
        }
        const res = await fetch(base, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: config.localModel || "llama3.2",
            messages,
            temperature: 0.1,
          }),
          signal: controller.signal,
        });
        if (!res.ok) {
          const errText = await res.text();
          console.error(`[AI Local Error] HTTP ${res.status}: ${errText.slice(0, 500)}`);
          throw new Error(`Erreur LLM Local (HTTP ${res.status}). Vérifiez l'endpoint et le modèle configurés.`);
        }
        const data = await res.json();
        return data.choices?.[0]?.message?.content || "";
      }

      throw new Error(`Fournisseur non supporté : ${provider}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Analyse et nettoie la réponse brute du LLM pour extraire le JSON
   */
  parseJsonResponse(rawText) {
    if (!rawText || typeof rawText !== "string") {
      throw new Error("Réponse vide reçue du modèle d'IA.");
    }

    let cleaned = rawText.trim();
    // Suppression des blocs markdown ```json ... ```
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    }

    try {
      return JSON.parse(cleaned);
    } catch (e) {
      // Tentative d'extraction par regex d'un objet JSON {}
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        return JSON.parse(match[0]);
      }
      throw new Error(`La réponse de l'IA n'est pas un JSON valide : ${cleaned.slice(0, 150)}...`);
    }
  }

  /**
   * Pare-feu de validation SQL strict pour empêcher toute injection, mutation ou fuite PII/système
   */
  validateAndSanitizeSql(sql) {
    if (!sql || typeof sql !== "string") {
      throw new Error("Aucune requête SQL n'a été générée par l'IA.");
    }

    let cleanSql = sql.trim();
    // Enlever un éventuel point-virgule final unique
    if (cleanSql.endsWith(";")) {
      cleanSql = cleanSql.slice(0, -1).trim();
    }

    // 1. Interdiction stricte des commentaires SQL (-- , /* */ , #)
    if (/\/\*|\*\/|--|#/.test(cleanSql)) {
      throw new Error("Requête refusée : Les commentaires SQL sont interdits.");
    }

    // 2. Vérification stricte que la requête commence par SELECT ou WITH
    if (!/^(SELECT|WITH)\s+/i.test(cleanSql)) {
      throw new Error("Requête refusée : Seules les requêtes de lecture (SELECT) sont autorisées.");
    }

    // 3. Interdiction des requêtes multiples (point-virgule interne)
    if (/;/.test(cleanSql)) {
      throw new Error("Requête refusée : Les requêtes multiples chaînées sont interdites.");
    }

    // 4. Mots-clés destructeurs, modificateurs ou d'exfiltration interdits
    const forbiddenKeywordsRegex =
      /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|REPLACE|GRANT|REVOKE|LOCK|CREATE|SET|FLUSH|KILL|RESET|SHUTDOWN|SYSTEM_USER|BENCHMARK|SLEEP|HANDLER|CALL|DO|EXECUTE|PREPARE|INTO\s+OUTFILE|INTO\s+DUMPFILE|LOAD_FILE)\b/i;
    if (forbiddenKeywordsRegex.test(cleanSql)) {
      throw new Error("Requête refusée : Contient une commande interdite ou potentiellement destructive.");
    }

    // 5. Interdiction formelle des tables d'administration, journaux, sessions et schémas système
    const forbiddenTablesRegex =
      /\b(Staff|SystemSetting|Session|Log|information_schema|mysql|performance_schema|sys)\b/i;
    if (forbiddenTablesRegex.test(cleanSql)) {
      throw new Error("Requête refusée : L'accès aux tables d'administration et de sécurité est bloqué.");
    }

    // 6. Interdiction des colonnes sensibles / PII
    const forbiddenColsRegex =
      /\b(password|pwdToken|tokenExpiry|token|rfid|email|reporterEmail|responsibleEmail)\b/i;
    if (forbiddenColsRegex.test(cleanSql)) {
      throw new Error("Requête refusée : Tentative d'accès à des champs de sécurité ou jetons confidentiels.");
    }

    // 7. Interdiction de SELECT * / SELECT alias.* (COUNT(*) reste autorisé)
    if (/(?:^|[\s,(])SELECT\s+(?:DISTINCT\s+)?(?:[\w`]+\.)?\*(?:\s|,|$)/i.test(cleanSql)) {
      throw new Error("Requête refusée : SELECT * est interdit, veuillez sélectionner explicitement les colonnes autorisées.");
    }

    // 8. Encadrement strict de la limite de résultats (LIMIT 200)
    const isSingleRowAggregate =
      /^SELECT\s+(COUNT|SUM|AVG|MIN|MAX)\s*\([^)]*\)\s*(?:AS\s+[\w`]+)?\s+FROM\s+/i.test(cleanSql) &&
      !/GROUP\s+BY/i.test(cleanSql);

    if (!isSingleRowAggregate) {
      if (/^SELECT\s+/i.test(cleanSql)) {
        cleanSql = `SELECT * FROM (${cleanSql}) AS _q LIMIT 200`;
      } else if (!/LIMIT\s+\d+/i.test(cleanSql)) {
        cleanSql = `${cleanSql} LIMIT 200`;
      }
    }

    return cleanSql;
  }

  /**
   * Exécute la requête sécurisée en base MariaDB via le pool lecture seule dédié
   */
  async executeSafeQuery(sql, options = {}) {
    const startTime = Date.now();
    try {
      const rawRows = await executeReadOnlyQuery(sql, {
        fallbackPrisma: prisma,
        ...options,
      });
      const durationMs = Date.now() - startTime;

      // Normalisation des BigInt / Décimaux pour sérialisation JSON propre
      const rows = JSON.parse(
        JSON.stringify(rawRows, (key, value) =>
          typeof value === "bigint" ? Number(value) : value,
        ),
      );

      return {
        rows: Array.isArray(rows) ? rows : [],
        durationMs,
      };
    } catch (dbErr) {
      console.error(`[AI SQL Execution Error] Query: ${sql} | Error: ${dbErr.message}`);
      if (dbErr.message && dbErr.message.includes("DATABASE_URL_AI_RO")) {
        throw dbErr;
      }
      throw new Error("Erreur lors de l'exécution de la requête SQL MariaDB.");
    }
  }

  /**
   * Analyse adaptative du résultat pour choisir la meilleure visualisation (KPI, Chart.js, Tableau)
   */
  buildVisualization(rows, aiMetadata = {}) {
    const rowCount = rows.length;

    if (rowCount === 0) {
      return {
        chartType: "table",
        title: aiMetadata.title || "Résultat",
        isKpi: false,
        kpiValue: null,
        kpiLabel: null,
        chartConfig: null,
      };
    }

    const columns = Object.keys(rows[0]);

    // Cas 1 : Résultat scalaire unique (1 ligne, 1 colonne, ou 1 ligne avec valeur numérique claire) -> Carte KPI
    if (rowCount === 1) {
      const col = columns[0];
      const val = rows[0][col];
      if (typeof val === "number" || !isNaN(Number(val))) {
        return {
          chartType: "kpi",
          title: aiMetadata.title || "Valeur clé",
          isKpi: true,
          kpiValue: typeof val === "number" ? val : Number(val),
          kpiLabel: aiMetadata.title || col,
          chartConfig: null,
        };
      }
    }

    // Cas 2 : Données tabulaires avec recommandation de graphique par le LLM (bar, line, pie, doughnut)
    let chartType = (aiMetadata.chartType || "").toLowerCase();
    if (!["bar", "line", "pie", "doughnut"].includes(chartType)) {
      // Détection heuristique
      if (rowCount <= 20 && columns.length === 2) {
        chartType = "bar";
      } else {
        chartType = "table";
      }
    }

    if (chartType === "table" || columns.length < 2) {
      return {
        chartType: "table",
        title: aiMetadata.title || "Résultats",
        isKpi: false,
        kpiValue: null,
        kpiLabel: null,
        chartConfig: null,
      };
    }

    // Détermination des colonnes X (labels) et Y (valeurs numériques)
    let xCol = aiMetadata.xKey && columns.includes(aiMetadata.xKey) ? aiMetadata.xKey : null;
    let yCol = aiMetadata.yKey && columns.includes(aiMetadata.yKey) ? aiMetadata.yKey : null;

    if (!xCol || !yCol) {
      // Trouver la première colonne non-numérique pour X et numérique pour Y
      for (const c of columns) {
        const sampleVal = rows[0][c];
        const isNum = typeof sampleVal === "number" || (!isNaN(Number(sampleVal)) && sampleVal !== null && sampleVal !== "");
        if (!xCol && !isNum) xCol = c;
        else if (!yCol && isNum) yCol = c;
      }
      // Fallback si tout est numérique ou texte
      if (!xCol) xCol = columns[0];
      if (!yCol) yCol = columns[1] || columns[0];
    }

    const labels = rows.map((r) => String(r[xCol] ?? "Inconnu"));
    const data = rows.map((r) => Number(r[yCol]) || 0);

    // Palette de couleurs harmonieuse pour Chart.js
    const colorPalette = [
      "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
      "#ec4899", "#06b6d4", "#14b8a6", "#f97316", "#6366f1",
      "#84cc16", "#a855f7"
    ];

    const chartConfig = {
      type: chartType,
      data: {
        labels,
        datasets: [
          {
            label: aiMetadata.title || yCol,
            data,
            backgroundColor:
              chartType === "pie" || chartType === "doughnut"
                ? labels.map((_, i) => colorPalette[i % colorPalette.length])
                : "rgba(59, 130, 246, 0.7)",
            borderColor:
              chartType === "pie" || chartType === "doughnut"
                ? "#ffffff"
                : "#2563eb",
            borderWidth: 1,
            borderRadius: chartType === "bar" ? 6 : 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: chartType === "pie" || chartType === "doughnut",
          },
        },
      },
    };

    return {
      chartType,
      title: aiMetadata.title || "Graphique",
      isKpi: false,
      kpiValue: null,
      kpiLabel: null,
      chartConfig,
    };
  }

  /**
   * Traitement complet d'une question en langage naturel
   */
  async processNaturalLanguageQuery(question) {
    if (!question || typeof question !== "string" || !question.trim()) {
      throw new Error("Veuillez formuler une question.");
    }

    const config = await this.getConfig();
    if (!config.provider || config.provider === "none") {
      throw new Error(
        "Aucun moteur d'IA n'est configuré. Rendez-vous dans Paramètres > Intelligence Artificielle pour activer un fournisseur (ChatGPT, Gemini, Claude ou Local)."
      );
    }

    const messages = [
      { role: "system", content: SAFE_SCHEMA_PROMPT },
      {
        role: "user",
        content: `Question de l'administrateur : "${question.trim()}". Générez l'objet JSON correspondant avec la requête SQL et les métadonnées de visualisation.`,
      },
    ];

    console.log(`[AI Query] Question received: "${question.trim()}" (Provider: ${config.provider})`);

    // 1. Appel du LLM
    let rawAiResponse = await this.callProvider(config.provider, config, messages);

    // 2. Parsing JSON
    let aiParsed = this.parseJsonResponse(rawAiResponse);

    // 3. Pare-feu de validation SQL
    let sanitizedSql = this.validateAndSanitizeSql(aiParsed.sql);

    // 4. Exécution en base de données MariaDB avec tentative d'auto-correction en cas d'erreur de schéma
    let rows;
    let durationMs;
    try {
      const execResult = await this.executeSafeQuery(sanitizedSql);
      rows = execResult.rows;
      durationMs = execResult.durationMs;
    } catch (dbErr) {
      if (dbErr.message && dbErr.message.includes("DATABASE_URL_AI_RO")) {
        throw dbErr;
      }
      console.warn("[AI Query Self-Correction] First SQL execution failed. Retrying with generic schema hint...");
      const retryMessages = [
        ...messages,
        { role: "assistant", content: rawAiResponse },
        {
          role: "user",
          content: `La requête SQL précédente a échoué lors de son exécution MariaDB (erreur de syntaxe, nom de table ou de colonne invalide).
Veuillez corriger la requête SQL pour respecter strictement le schéma fourni (sans SELECT *, sans commentaires SQL, et en passant par UserProject pour lier User et Project).
Répondez UNIQUEMENT avec le JSON corrigé.`,
        },
      ];
      rawAiResponse = await this.callProvider(config.provider, config, retryMessages);
      aiParsed = this.parseJsonResponse(rawAiResponse);
      sanitizedSql = this.validateAndSanitizeSql(aiParsed.sql);
      const execResult = await this.executeSafeQuery(sanitizedSql);
      rows = execResult.rows;
      durationMs = execResult.durationMs;
    }

    // 5. Détection et construction de la visualisation
    const visualization = this.buildVisualization(rows, aiParsed);

    return {
      success: true,
      question: question.trim(),
      provider: config.provider,
      sql: sanitizedSql,
      explanation: aiParsed.explanation || "Requête exécutée avec succès.",
      title: aiParsed.title || visualization.title,
      durationMs,
      rowCount: rows.length,
      columns: rows.length > 0 ? Object.keys(rows[0]) : [],
      data: rows,
      visualization,
    };
  }
}

module.exports = new AiQueryService();
