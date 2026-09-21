const settingsService = require("./settingsService");
const { prisma } = require("../utilities/db");

// Schéma simplifié et sécurisé de la base de données transmis au LLM (sans données personnelles ni tables d'authentification sensibles)
const SAFE_SCHEMA_PROMPT = `
Vous êtes un expert MySQL / MariaDB pour l'application FabtrackJS (gestion de Fablab).
Votre rôle est de traduire les questions des administrateurs en requêtes SQL valides, sécurisées et performantes en lecture seule.

SCHÉMA DES TABLES AUTORISÉES DANS MARIADB :

1. Table \`User\` (Usagers du Fablab) :
   - id (INT, PRIMARY KEY)
   - name (VARCHAR) : Prénom de l'usager
   - surname (VARCHAR) : Nom de famille
   - email (VARCHAR)
   - usertypeId (INT) : Référence à UserType(id)
   - createdAt (DATETIME) : Date d'inscription
   - birthYear (INT) : Année de naissance
   - balance (DECIMAL) : Solde financier du compte en euros
   - termsAccepted (BOOLEAN) : Charte acceptée ou non
   - isExpert (BOOLEAN) : Statut expert bénévole
   - deletedAt (DATETIME, NULL) : Date de suppression / archivage (si non NULL, compte supprimé)

2. Table \`UserType\` (Typologies d'usagers) :
   - id (INT, PRIMARY KEY)
   - name (VARCHAR) : Libellé (ex. "Étudiant", "Personnel", "Enseignant-Chercheur", "Externe")

3. Table \`History\` (Visites et présences au Fablab) :
   - id (INT, PRIMARY KEY)
   - userId (INT, NULL) : Référence à User(id)
   - createdAt (DATETIME) : Date et heure d'arrivée / enregistrement de la visite
   - departureDate (DATETIME, NULL) : Date et heure de départ
   - workspaceId (INT, NULL) : Référence à Workspace(id)
   - projectTypeId (INT, NULL) : Référence à ProjectType(id)
   - projectId (INT, NULL) : Référence à Project(id)
   - teachingUnitId (INT, NULL) : Référence à TeachingUnit(id)
   - unregisteredUeName (VARCHAR, NULL) : Nom d'UE non enregistrée
   - sorbonneEntity (VARCHAR, NULL) : Nom de l'entité/UFR Sorbonne rattachée
   - repairObject (VARCHAR, NULL) : Objet apporté en Repair Café
   - repairStatus (VARCHAR, NULL) : "REPAIRED", "PARTIALLY_REPAIRED", "NOT_REPAIRED"

4. Table \`Activity\` (Activités machines et consommations de matière lors d'une visite) :
   - id (INT, PRIMARY KEY)
   - historyId (INT) : Référence à History(id)
   - machineId (INT, NULL) : Référence à Machine(id)
   - consumableId (INT, NULL) : Référence à Consumable(id)
   - quantity (INT) : Quantité consommée (ou 1 pour une session machine)
   - cost (DECIMAL) : Montant en euros de la consommation
   - settled (BOOLEAN) : Pour les projets Sorbonne, indique si la consommation a été réglée
   - settledAt (DATETIME, NULL) : Date du règlement

5. Table \`Machine\` (Parc de machines du Fablab) :
   - id (INT, PRIMARY KEY)
   - name (VARCHAR) : Nom de la machine
   - typeId (INT) : Référence à MachineType(id)
   - locationId (INT) : Référence à Location(id)
   - categoryId (INT) : Référence à Category(id)
   - active (BOOLEAN) : 1 si active, 0 si désactivée
   - brand (VARCHAR), model (VARCHAR)

6. Table \`MachineType\` : id, name (ex. "Imprimante 3D", "Découpeuse Laser", "Fraiseuse CNC")
7. Table \`Location\` : id, name (ex. "Atelier Principal", "Salle Électronique")
8. Table \`Category\` : id, name (ex. "Fabrication Numérique", "Électronique")

9. Table \`Consumable\` (Matières et consommables) :
   - id (INT, PRIMARY KEY)
   - name (VARCHAR) : Nom du matériau (ex. "PLA Blanc", "Contreplaqué 3mm")
   - quantity (INT) : Stock restant
   - unit (VARCHAR) : Unité (ex. "g", "m", "unité", "plaque")
   - unitPrice (DECIMAL) : Prix unitaire

10. Table \`Project\` (Projets réalisés) :
    - id (INT, PRIMARY KEY)
    - name (VARCHAR) : Titre du projet
    - projectTypeId (INT) : Référence à ProjectType(id)
    - userId (INT) : Propriétaire (User.id)
    - sorbonneEntity (VARCHAR, NULL) : Entité Sorbonne rattachée
    - active (BOOLEAN) : 1 si actif

11. Table \`ProjectType\` : id, name (ex. "Personnel", "Académique", "Sorbonne", "Prototypage")
12. Table \`Workspace\` : id, name, location
13. Table \`TeachingUnit\` : id, code, name
14. Table \`MachineIssue\` : id, machineId, description, status ('OPEN' | 'RESOLVED'), createdAt, resolvedAt

RÈGLES ABSOLUES POUR LA REQUÊTE SQL :
1. STRICTEMENT EN LECTURE SEULE : Utilisez UNIQUEMENT des requêtes commençant par SELECT (ou WITH ... SELECT). Aucun INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, REPLACE, etc.
2. INTERDICTION FORMELLE d'accéder aux tables Staff ou SystemSetting.
3. Toujours utiliser les noms exacts des tables avec des majuscules ou backticks : \`User\`, \`History\`, \`Activity\`, \`Machine\`, \`Consumable\`, \`Project\`, etc.
4. Pour compter les usagers venus une seule fois : sous-requête groupant par userId avec HAVING COUNT(*) = 1.
5. Toujours ajouter une clause LIMIT 200 à la fin si la requête n'est pas une agrégation retournant une seule ligne.
6. Ne jamais insérer de point-virgule multiple ou plusieurs instructions.

FORMAT DE RÉPONSE OBLIGATOIRE :
Vous devez répondre UNIQUEMENT par un objet JSON valide sans texte avant ni après, ayant la structure exacte suivante :
{
  "sql": "SELECT ...",
  "explanation": "Explication claire en 1 ou 2 phrases en français de ce que la requête calcule",
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
    const fetch = global.fetch || require("node-fetch");
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
          throw new Error(`Erreur API OpenAI (${res.status}): ${errText}`);
        }
        const data = await res.json();
        return data.choices?.[0]?.message?.content || "";
      }

      if (provider === "gemini") {
        if (!config.geminiApiKey) {
          throw new Error("Clé API Google Gemini non renseignée.");
        }
        // Utilisation de l'endpoint compatible OpenAI de Google Gemini v1beta
        const model = config.geminiModel || "gemini-1.5-flash";
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
          }
        );
        if (!res.ok) {
          // Fallback sur l'API native Google si l'endpoint OpenAI n'est pas activé
          const nativeRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.geminiApiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
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
            }
          );
          if (!nativeRes.ok) {
            const errBody = await nativeRes.text();
            throw new Error(`Erreur Gemini API (${nativeRes.status}): ${errBody}`);
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
          throw new Error(`Erreur API Claude (${res.status}): ${errText}`);
        }
        const data = await res.json();
        return data.content?.[0]?.text || "";
      }

      if (provider === "local") {
        let base = (config.localUrl || "http://localhost:11434/v1").trim().replace(/\/+$/, "");
        if (!base.endsWith("/chat/completions")) {
          base = `${base}/chat/completions`;
        }
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
          throw new Error(`Erreur LLM Local (${res.status}): ${errText}`);
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
   * Pare-feu de validation SQL strict pour empêcher toute injection ou mutation
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

    // 1. Vérification stricte que la requête commence par SELECT ou WITH
    if (!/^(SELECT|WITH)\s+/i.test(cleanSql)) {
      throw new Error("Requête refusée : Seules les requêtes de lecture (SELECT) sont autorisées.");
    }

    // 2. Interdiction des requêtes multiples (point-virgule interne)
    if (/;/.test(cleanSql)) {
      throw new Error("Requête refusée : Les requêtes multiples chaînées sont interdites.");
    }

    // 3. Mots-clés destructeurs ou modificateurs interdits
    const forbiddenKeywordsRegex =
      /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|REPLACE|GRANT|REVOKE|LOCK|CREATE|SET|FLUSH|KILL|RESET|SHUTDOWN|SYSTEM_USER|BENCHMARK|SLEEP|INTO\s+OUTFILE|INTO\s+DUMPFILE|LOAD_FILE)\b/i;
    if (forbiddenKeywordsRegex.test(cleanSql)) {
      throw new Error("Requête refusée : Contient une commande interdite ou potentiellement destructive.");
    }

    // 4. Interdiction formelle des tables et colonnes confidentielles
    const forbiddenTablesRegex = /\b(Staff|SystemSetting)\b/i;
    if (forbiddenTablesRegex.test(cleanSql)) {
      throw new Error("Requête refusée : L'accès aux tables d'administration et de sécurité est bloqué.");
    }

    const forbiddenColsRegex = /\b(password|pwdToken|token)\b/i;
    if (forbiddenColsRegex.test(cleanSql)) {
      throw new Error("Requête refusée : Tentative d'accès à des champs de sécurité ou jetons confidentiels.");
    }

    // 5. Encadrement de la limite de résultats (LIMIT 200)
    const isSingleRowAggregate =
      /^SELECT\s+(COUNT|SUM|AVG|MIN|MAX)\s*\([^)]*\)\s*(?:AS\s+[\w`]+)?\s+FROM\s+/i.test(cleanSql) &&
      !/GROUP\s+BY/i.test(cleanSql);

    if (!isSingleRowAggregate) {
      if (!/LIMIT\s+\d+/i.test(cleanSql)) {
        cleanSql = `${cleanSql} LIMIT 200`;
      }
    }

    return cleanSql;
  }

  /**
   * Exécute la requête sécurisée en base MariaDB
   */
  async executeSafeQuery(sql) {
    const startTime = Date.now();
    try {
      const rawRows = await prisma.$queryRawUnsafe(sql);
      const durationMs = Date.now() - startTime;

      // Normalisation des BigInt / Décimaux pour sérialisation JSON propre
      const rows = JSON.parse(
        JSON.stringify(rawRows, (key, value) =>
          typeof value === "bigint" ? Number(value) : value
        )
      );

      return {
        rows: Array.isArray(rows) ? rows : [],
        durationMs,
      };
    } catch (dbErr) {
      console.error(`[AI SQL Execution Error] Query: ${sql} | Error: ${dbErr.message}`);
      throw new Error(`Erreur lors de l'exécution SQL MariaDB : ${dbErr.message}`);
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
    const rawAiResponse = await this.callProvider(config.provider, config, messages);

    // 2. Parsing JSON
    const aiParsed = this.parseJsonResponse(rawAiResponse);

    // 3. Pare-feu de validation SQL
    const sanitizedSql = this.validateAndSanitizeSql(aiParsed.sql);

    // 4. Exécution en base de données MariaDB
    const { rows, durationMs } = await this.executeSafeQuery(sanitizedSql);

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
