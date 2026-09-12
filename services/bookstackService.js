const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const settingsService = require("./settingsService.js");
const logger = require("../utilities/simpleLogger.js");

// In-memory cache for BookStack API responses (TTL: 5 minutes)
const docCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

class BookstackService {
  /**
   * Retrieves BookStack settings and prepares HTTP headers.
   */
  async getConfig() {
    const settings = await settingsService.getSettings();
    let baseUrl = (settings.bookstack_url || "https://wiki.fablab.sorbonne-universite.fr/BookStack/").trim();
    if (!baseUrl.endsWith("/")) baseUrl += "/";

    const apiBaseUrl = `${baseUrl}api/`;
    const tokenId = (settings.bookstack_token_id || process.env.BOOKSTACK_TOKEN_ID || "").trim();
    const tokenSecret = (settings.bookstack_token_secret || process.env.BOOKSTACK_TOKEN_SECRET || "").trim();
    const isConfigured = Boolean(tokenId && tokenSecret);
    const isEnabled = settings.plugin_bookstack_enabled !== "false";

    return {
      baseUrl,
      apiBaseUrl,
      tokenId,
      tokenSecret,
      isConfigured,
      isEnabled,
      autoPrefill: settings.bookstack_auto_prefill !== "false",
    };
  }

  /**
   * Tests API connection by requesting a single book.
   */
  async testConnection() {
    const config = await this.getConfig();

    if (!config.isConfigured) {
      return {
        success: false,
        error: "Les identifiants API BookStack (Token ID ou Secret) ne sont pas configurés.",
      };
    }

    try {
      const endpoint = `${config.apiBaseUrl}books?count=1`;
      const response = await fetch(endpoint, {
        method: "GET",
        headers: {
          Authorization: `Token ${config.tokenId}:${config.tokenSecret}`,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        let errDetails = `Code HTTP ${response.status} (${response.statusText})`;
        try {
          const body = await response.json();
          if (body && body.error && body.error.message) {
            errDetails += ` : ${body.error.message}`;
          }
        } catch (_) {}
        return { success: false, error: errDetails };
      }

      const data = await response.json();
      return {
        success: true,
        message: "Connexion réussie à l'API BookStack !",
        totalBooks: data.total || (data.data ? data.data.length : 0),
      };
    } catch (err) {
      console.error("[BookstackService] testConnection error:", err.message);
      return {
        success: false,
        error: `Impossible de joindre le serveur BookStack : ${err.message}`,
      };
    }
  }

  /**
   * Extracts slug or identifier from a BookStack URL.
   */
  parseUrl(url) {
    if (!url || typeof url !== "string") return null;

    try {
      const parsed = new URL(url);
      const pathname = parsed.pathname;

      // Pattern 1: /books/<book-slug>/page/<page-slug>
      const pageMatch = pathname.match(/\/page\/([^/?#]+)/i);
      if (pageMatch && pageMatch[1]) {
        return { type: "page", slug: decodeURIComponent(pageMatch[1]) };
      }

      // Pattern 2: /books/<book-slug>
      const bookMatch = pathname.match(/\/books\/([^/?#]+)/i);
      if (bookMatch && bookMatch[1]) {
        return { type: "book", slug: decodeURIComponent(bookMatch[1]) };
      }

      // Pattern 3: /link/<id>
      const linkMatch = pathname.match(/\/link\/([0-9]+)/i);
      if (linkMatch && linkMatch[1]) {
        return { type: "id", id: parseInt(linkMatch[1], 10) };
      }

      return { type: "search", query: pathname.split("/").filter(Boolean).pop() || url };
    } catch (e) {
      return null;
    }
  }

  /**
   * Fetches metadata (title, updated_at) for a given BookStack URL.
   */
  async fetchDocMetadata(url) {
    const config = await this.getConfig();

    if (!config.isConfigured) {
      return {
        configured: false,
        error: "Identifiants API BookStack non renseignés",
      };
    }

    // Check cache
    const cacheKey = url.trim();
    const cached = docCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }

    const parsed = this.parseUrl(url);
    if (!parsed) {
      return { exists: false, error: "URL invalide ou non reconnue" };
    }

    const headers = {
      Authorization: `Token ${config.tokenId}:${config.tokenSecret}`,
      Accept: "application/json",
    };

    let result = null;

    try {
      // Strategy 1: If page slug, filter by slug
      if (parsed.type === "page") {
        const res = await fetch(`${config.apiBaseUrl}pages?filter[slug]=${encodeURIComponent(parsed.slug)}`, { headers });
        if (res.ok) {
          const body = await res.json();
          if (body.data && body.data.length > 0) {
            const page = body.data[0];
            result = {
              exists: true,
              title: page.name,
              updatedAt: new Date(page.updated_at || page.created_at),
              type: "page",
              id: page.id,
            };
          }
        }
      }

      // Strategy 2: If book slug
      if (!result && (parsed.type === "book" || parsed.type === "page")) {
        const res = await fetch(`${config.apiBaseUrl}books?filter[slug]=${encodeURIComponent(parsed.slug)}`, { headers });
        if (res.ok) {
          const body = await res.json();
          if (body.data && body.data.length > 0) {
            const book = body.data[0];
            result = {
              exists: true,
              title: book.name,
              updatedAt: new Date(book.updated_at || book.created_at),
              type: "book",
              id: book.id,
            };
          }
        }
      }

      // Strategy 3: Global search fallback
      if (!result) {
        const queryTerm = parsed.slug || parsed.query || "";
        if (queryTerm) {
          const res = await fetch(`${config.apiBaseUrl}search?query=${encodeURIComponent(queryTerm)}&count=1`, { headers });
          if (res.ok) {
            const body = await res.json();
            if (body.data && body.data.length > 0) {
              const item = body.data[0];
              result = {
                exists: true,
                title: item.name,
                updatedAt: new Date(item.updated_at || item.created_at),
                type: item.type || "page",
                id: item.id,
              };
            }
          }
        }
      }

      if (!result) {
        result = { exists: false, error: "Documentation introuvable sur le wiki" };
      }

      // Save to cache
      docCache.set(cacheKey, { timestamp: Date.now(), data: result });
      return result;
    } catch (err) {
      console.error("[BookstackService] fetchDocMetadata error:", err.message);
      return { exists: false, error: `Erreur d'accès à l'API: ${err.message}` };
    }
  }

  /**
   * Checks whether a project's documentation is up-to-date relative to the user's last visit.
   */
  async checkProjectDocStatus(projectId, userId) {
    const config = await this.getConfig();

    if (!config.isEnabled) {
      return { success: false, enabled: false, message: "Plugin BookStack désactivé" };
    }

    const pId = Number(projectId);
    const uId = Number(userId);

    if (!pId || isNaN(pId)) {
      return { success: false, error: "ID de projet invalide" };
    }

    const project = await prisma.project.findUnique({
      where: { id: pId },
      include: { projecttype: true },
    });

    if (!project) {
      return { success: false, error: "Projet introuvable" };
    }

    // Retrieve the user's previous visit date from History
    let lastVisitDate = null;
    if (uId && !isNaN(uId)) {
      const lastHistory = await prisma.history.findFirst({
        where: {
          userId: uId,
          arrival: { not: undefined },
        },
        orderBy: { arrival: "desc" },
      });
      if (lastHistory && lastHistory.arrival) {
        lastVisitDate = new Date(lastHistory.arrival);
      }
    }

    // If the user has never visited before, any documentation is considered up to date
    if (!lastVisitDate) {
      return {
        success: true,
        isUpToDate: true,
        reason: "first_visit",
        message: "Première visite de l'usager : documentation considérée à jour.",
        projectUrl: project.url,
      };
    }

    // If API credentials are not configured, return informative status
    if (!config.isConfigured) {
      return {
        success: true,
        isUpToDate: true, // fallback to non-blocking
        notConfigured: true,
        message: "Clés API BookStack non configurées dans l'administration.",
        projectUrl: project.url,
        lastVisitDate,
      };
    }

    const docMeta = await this.fetchDocMetadata(project.url);

    if (!docMeta.exists || !docMeta.updatedAt) {
      return {
        success: true,
        isUpToDate: false,
        reason: "doc_not_found",
        message: docMeta.error || "Page de documentation non trouvée sur BookStack.",
        projectUrl: project.url,
        lastVisitDate,
      };
    }

    const docUpdatedAt = new Date(docMeta.updatedAt);
    // Documentation is up-to-date if modified on or after the last visit date
    // (with a 5-minute tolerance to account for same-session check-ins)
    const toleranceMs = 5 * 60 * 1000;
    const isUpToDate = docUpdatedAt.getTime() + toleranceMs >= lastVisitDate.getTime();

    return {
      success: true,
      isUpToDate,
      docTitle: docMeta.title,
      docUpdatedAt,
      lastVisitDate,
      projectUrl: project.url,
      message: isUpToDate
        ? `Documentation à jour (mise à jour le ${docUpdatedAt.toLocaleDateString("fr-FR")})`
        : `Documentation en retard (dernière modif le ${docUpdatedAt.toLocaleDateString("fr-FR")}, dernière visite le ${lastVisitDate.toLocaleDateString("fr-FR")})`,
    };
  }

  /**
   * Calculates overall documentation metrics across all active projects.
   */
  async getOverallDocumentationStats() {
    const config = await this.getConfig();

    const activeProjects = await prisma.project.findMany({
      where: { active: true },
      include: {
        projecttype: true,
        users: {
          include: {
            user: true,
            history: {
              orderBy: { arrival: "desc" },
              take: 1,
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const wikiBase = config.baseUrl.toLowerCase();
    const wikiProjects = activeProjects.filter((p) => {
      const u = (p.url || "").toLowerCase();
      return u.startsWith(wikiBase) || u.includes("bookstack") || u.includes("wiki.fablab");
    });

    const projectList = [];
    let upToDateCount = 0;
    let outdatedCount = 0;
    let unverifiedCount = 0;

    for (const p of wikiProjects) {
      // Find latest arrival among all associated users
      let latestArrival = null;
      let primaryUser = p.users.length > 0 ? p.users[0].user : null;

      for (const up of p.users) {
        if (up.history && up.history.length > 0 && up.history[0].arrival) {
          const arr = new Date(up.history[0].arrival);
          if (!latestArrival || arr > latestArrival) {
            latestArrival = arr;
            primaryUser = up.user;
          }
        }
      }

      let status = "unknown";
      let docUpdatedAt = null;
      let docTitle = null;

      if (!latestArrival) {
        // No recorded visit yet
        status = "up_to_date";
        upToDateCount++;
      } else if (config.isConfigured) {
        const meta = await this.fetchDocMetadata(p.url);
        if (meta.exists && meta.updatedAt) {
          docUpdatedAt = meta.updatedAt;
          docTitle = meta.title;
          const toleranceMs = 5 * 60 * 1000;
          if (docUpdatedAt.getTime() + toleranceMs >= latestArrival.getTime()) {
            status = "up_to_date";
            upToDateCount++;
          } else {
            status = "outdated";
            outdatedCount++;
          }
        } else {
          status = "not_found";
          outdatedCount++;
        }
      } else {
        status = "unconfigured";
        unverifiedCount++;
      }

      projectList.push({
        id: p.id,
        url: p.url,
        projectType: p.projecttype ? p.projecttype.name : "Projet",
        userFullName: primaryUser ? `${primaryUser.name} ${primaryUser.surname}` : "Usager non associé",
        userCount: p.users.length,
        lastVisitDate: latestArrival,
        docUpdatedAt,
        docTitle,
        status,
      });
    }

    const totalWiki = wikiProjects.length;
    const evaluatedTotal = upToDateCount + outdatedCount;
    const upToDatePercentage = evaluatedTotal > 0 ? Math.round((upToDateCount / evaluatedTotal) * 100) : totalWiki > 0 ? 100 : 0;

    return {
      totalWiki,
      totalActiveProjects: activeProjects.length,
      upToDateCount,
      outdatedCount,
      unverifiedCount,
      upToDatePercentage,
      projects: projectList,
      config,
    };
  }
}

module.exports = new BookstackService();
