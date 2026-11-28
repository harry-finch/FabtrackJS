const { prisma } = require("../utilities/db.js");
const bookstackService = require("./bookstackService.js");

/**
 * Resolves the canonical display label for a project according to R-038 priority:
 * 1. customTitle (local Fabtrack name defined by staff/admin)
 * 2. wikiTitle / docTitle (last known BookStack wiki title)
 * 3. url (raw project URL or fallback identifier)
 *
 * @param {{ customTitle?: string|null, wikiTitle?: string|null, docTitle?: string|null, url?: string|null } | null | undefined} project
 * @returns {string}
 */
function resolveProjectDisplayTitle(project) {
  if (!project || typeof project !== "object") return "";
  const custom = typeof project.customTitle === "string" ? project.customTitle.trim() : "";
  if (custom) return custom;
  const wiki = typeof project.wikiTitle === "string" ? project.wikiTitle.trim() : "";
  if (wiki) return wiki;
  const doc = typeof project.docTitle === "string" ? project.docTitle.trim() : "";
  if (doc) return doc;
  const url = typeof project.url === "string" ? project.url.trim() : "";
  return url;
}

/**
 * Returns full title metadata (resolved display title + origin source).
 *
 * @param {object|null|undefined} project
 * @returns {{ displayTitle: string, customTitle: string|null, wikiTitle: string|null, url: string, source: "custom"|"wiki"|"url"|"none" }}
 */
function getProjectTitleMeta(project) {
  if (!project || typeof project !== "object") {
    return { displayTitle: "", customTitle: null, wikiTitle: null, url: "", source: "none" };
  }
  const customTitle = typeof project.customTitle === "string" && project.customTitle.trim() ? project.customTitle.trim() : null;
  const rawWiki =
    (typeof project.wikiTitle === "string" && project.wikiTitle.trim()) ||
    (typeof project.docTitle === "string" && project.docTitle.trim()) ||
    "";
  const wikiTitle = rawWiki || null;
  const url = typeof project.url === "string" ? project.url.trim() : "";

  if (customTitle) {
    return { displayTitle: customTitle, customTitle, wikiTitle, url, source: "custom" };
  }
  if (wikiTitle) {
    return { displayTitle: wikiTitle, customTitle: null, wikiTitle, url, source: "wiki" };
  }
  if (url) {
    return { displayTitle: url, customTitle: null, wikiTitle: null, url, source: "url" };
  }
  return { displayTitle: "", customTitle: null, wikiTitle: null, url: "", source: "none" };
}

class ProjectTitleService {
  resolveProjectDisplayTitle(project) {
    return resolveProjectDisplayTitle(project);
  }

  getProjectTitleMeta(project) {
    return getProjectTitleMeta(project);
  }

  /**
   * Sets or clears a project's local Fabtrack custom title.
   * Empty / whitespace-only input clears customTitle (restoring wikiTitle || url).
   *
   * @param {number|string} projectId
   * @param {string|null|undefined} rawCustomTitle
   */
  async updateCustomTitle(projectId, rawCustomTitle) {
    const id = Number(projectId);
    if (!Number.isInteger(id) || id <= 0) {
      const err = new Error("Identifiant de projet invalide.");
      err.status = 400;
      throw err;
    }

    const existing = await prisma.project.findUnique({
      where: { id },
      select: { id: true, url: true, customTitle: true, wikiTitle: true },
    });

    if (!existing) {
      const err = new Error("Projet introuvable.");
      err.status = 404;
      throw err;
    }

    const cleaned =
      typeof rawCustomTitle === "string" && rawCustomTitle.trim() !== ""
        ? rawCustomTitle.trim().slice(0, 255)
        : null;

    const updated = await prisma.project.update({
      where: { id },
      data: { customTitle: cleaned },
      select: { id: true, url: true, customTitle: true, wikiTitle: true },
    });

    return {
      ...updated,
      ...getProjectTitleMeta(updated),
    };
  }

  /**
   * Resolves and caches a single project's BookStack wiki title in DB (fail-safe).
   * Never throws and never alters customTitle.
   *
   * @param {{ id: number, url: string, wikiTitle?: string|null, customTitle?: string|null }} project
   * @param {{ forceRefresh?: boolean }} [options]
   */
  async syncProjectWikiTitle(project, options = {}) {
    if (!project || !project.id || !project.url) return null;
    if (!/^https?:\/\//i.test(project.url.trim())) return null;

    try {
      const config = await bookstackService.getConfig();
      if (!config.isEnabled || !config.isConfigured) {
        return null;
      }

      if (options.forceRefresh && typeof bookstackService.clearCache === "function") {
        bookstackService.clearCache();
      }

      const meta = await bookstackService.fetchDocMetadata(project.url);
      if (meta && meta.exists && typeof meta.title === "string" && meta.title.trim()) {
        const fetchedTitle = meta.title.trim().slice(0, 255);
        if (fetchedTitle !== (project.wikiTitle || "").trim()) {
          await prisma.project.update({
            where: { id: project.id },
            data: { wikiTitle: fetchedTitle },
          });
        }
        return fetchedTitle;
      }
      return null;
    } catch (err) {
      console.error("[ProjectTitleService] syncProjectWikiTitle failed (non-blocking):", err.message);
      return null;
    }
  }

  /**
   * Refreshes cached BookStack wiki titles for all active BookStack-linked projects.
   * Clears in-memory BookStack cache first so renamed remote pages/books are picked up.
   */
  async refreshAllBookstackTitles() {
    const config = await bookstackService.getConfig();
    if (!config.isEnabled || !config.isConfigured) {
      return { refreshed: 0, total: 0, configured: false };
    }

    bookstackService.clearCache();

    const activeProjects = await prisma.project.findMany({
      where: { active: true },
      select: { id: true, url: true, wikiTitle: true, customTitle: true },
    });

    const wikiBase = config.baseUrl.toLowerCase();
    const wikiProjects = activeProjects.filter((p) => {
      const u = (p.url || "").toLowerCase();
      return u.startsWith(wikiBase) || u.includes("bookstack") || u.includes("wiki.fablab");
    });

    let refreshed = 0;
    await bookstackService.runWithConcurrency(wikiProjects, bookstackService.CONCURRENCY_LIMIT || 5, async (p) => {
      const title = await this.syncProjectWikiTitle(p);
      if (title) refreshed += 1;
    });

    return { refreshed, total: wikiProjects.length, configured: true };
  }
}

const instance = new ProjectTitleService();
instance.resolveProjectDisplayTitle = resolveProjectDisplayTitle;
instance.getProjectTitleMeta = getProjectTitleMeta;
module.exports = instance;
