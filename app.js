const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const logger = require("morgan");
const dotenv = require("dotenv");
dotenv.config();

const { prisma } = require("./utilities/db");
const createError = require("http-errors");
const helmet = require("helmet");
const fs = require("fs");

const loadPlugins = require("./core/pluginLoader");
loadPlugins();
const hookManager = require("./core/HookManager");
const settingsService = require("./services/settingsService");
const setupService = require("./services/setupService");
const dateService = require("./services/dateService");
const i18nService = require("./services/i18nService");
const referenceCacheService = require("./services/referenceCacheService");
const { PrismaSessionStore } = require("./services/prismaSessionStore");
const { applyUploadStaticHeaders } = require("./services/uploadSecurityService");
const { csrfTokenMiddleware, csrfProtection } = require("./middleware/csrf");
const { escapeHtml, safeJson, safeHttpUrl, sanitizeWarningIcon } = require("./utilities/xssHelpers");
const i18n = require("./config/i18n");
const compression = require("compression");
const isProduction = process.env.NODE_ENV === "production";

const DEFAULT_DEV_SESSION_SECRET = "fabtrack-secret-key-2024";

/**
 * Résout le secret de session en refusant tout démarrage en production
 * sans variable SECRET explicitement configurée et distincte de la valeur par défaut.
 *
 * @param {NodeJS.ProcessEnv} [env=process.env]
 * @returns {string}
 */
function resolveSessionSecret(env = process.env) {
  const isProd = env.NODE_ENV === "production";
  const rawSecret = typeof env.SECRET === "string" ? env.SECRET.trim() : "";

  if (isProd) {
    if (!rawSecret || rawSecret === DEFAULT_DEV_SESSION_SECRET) {
      throw new Error(
        "FATAL: La variable d'environnement SECRET doit être définie avec une valeur aléatoire forte (différente de la valeur par défaut) en production (NODE_ENV=production).",
      );
    }
    return rawSecret;
  }

  return rawSecret || DEFAULT_DEV_SESSION_SECRET;
}

/**
 * Résout le paramètre Express `trust proxy` à partir de `TRUST_PROXY`.
 * Par défaut `1` (derrière un reverse proxy Nginx/Apache) ; configurable à `false`/`0`
 * si l'instance est exposée directement, ou un nombre de sauts / sous-réseau.
 *
 * @param {NodeJS.ProcessEnv} [env=process.env]
 * @returns {boolean|number|string}
 */
function resolveTrustProxy(env = process.env) {
  const raw = env.TRUST_PROXY;
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return 1;
  }
  const normalized = String(raw).trim().toLowerCase();
  if (normalized === "false" || normalized === "0") {
    return false;
  }
  if (normalized === "true") {
    return true;
  }
  if (/^\d+$/.test(normalized)) {
    return parseInt(normalized, 10);
  }
  return String(raw).trim();
}

const sessionSecret = resolveSessionSecret(process.env);
const trustProxyValue = resolveTrustProxy(process.env);

/**
 * Creates the Express session store.
 * Uses persistent MariaDB storage via Prisma (`PrismaSessionStore`) by default,
 * falling back to Express MemoryStore in `NODE_ENV=test` or when `SESSION_STORE=memory`.
 *
 * @param {NodeJS.ProcessEnv} [env=process.env]
 * @returns {PrismaSessionStore | undefined}
 */
function createSessionStore(env = process.env) {
  if (env.NODE_ENV === "test" || env.SESSION_STORE === "memory") {
    return undefined;
  }
  const ttlMs = parseInt(env.SESSION_DURATION || "86400000", 10);
  return new PrismaSessionStore({
    prisma,
    ttlMs: Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : 86400000,
    autoStartCleanup: env.NODE_ENV === "production",
  });
}

const sessionStore = createSessionStore(process.env);

const app = express();

// Enable Gzip/Deflate compression for all responses
app.use(compression());

// ******************************************************************************
// Middleware Setup
// ******************************************************************************

// Add security headers with helmet
const isHttpsProduction = isProduction && process.env.ENABLE_HTTPS === "true";
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // Allow scripts from trusted sources and inline scripts for templates
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://cdnjs.cloudflare.com",
          "https://cdn.jsdelivr.net",
        ],
        // Allow inline event attributes like onclick
        scriptSrcAttr: ["'unsafe-inline'"],
        // Allow styles from specific trusted sources and inline styles
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://fonts.googleapis.com",
          "https://cdnjs.cloudflare.com",
          "https://cdn.jsdelivr.net",
        ],
        // Allow fonts from trusted sources
        fontSrc: [
          "'self'",
          "https://fonts.gstatic.com",
          "https://cdnjs.cloudflare.com",
        ],
        // Allow images from all sources
        imgSrc: ["'self'", "data:", "https:"],
        // Allow connections
        connectSrc: [
          "'self'",
          "https://cdn.jsdelivr.net",
          "https://cdnjs.cloudflare.com",
        ],
        // Do not force browser to upgrade HTTP to HTTPS on local/LAN IPs
        upgradeInsecureRequests: isHttpsProduction ? [] : null,
      },
    },
    // Only send HSTS header if running in real HTTPS production with a valid certificate
    strictTransportSecurity: isHttpsProduction,
  }),
);

app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

const staticOptions = {
  maxAge: isProduction ? "7d" : 0,
  etag: true,
};
app.use(express.static(path.join(__dirname, "public"), staticOptions));
app.use(
  "/vendor/fontawesome",
  express.static(path.join(__dirname, "node_modules/@fortawesome/fontawesome-free"), staticOptions),
);

// Ensure uploads directory exists and is statically accessible with hardened headers
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use(
  "/uploads",
  express.static(uploadsDir, {
    ...staticOptions,
    dotfiles: "deny",
    index: false,
    setHeaders: applyUploadStaticHeaders,
  }),
);

// Enable trust proxy when behind Nginx / reverse proxy (configurable via TRUST_PROXY)
app.set("trust proxy", trustProxyValue);

app.use(
  session({
    name: "fabtrack.sid", // Avoid session collision with other apps on the same domain
    secret: sessionSecret,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: isHttpsProduction,
      maxAge: parseInt(process.env.SESSION_DURATION || "86400000", 10),
    },
  }),
);

// Expose lazy res.locals.csrfToken & req.csrfToken() without creating sessions for anonymous probes
app.use(csrfTokenMiddleware);

// Initialize i18n
app.use(i18n.init);

// System settings middleware: inject settings and apply dynamic session timeout & plugin sync
app.use(async (req, res, next) => {
  try {
    const settings = await settingsService.getSettings();
    res.locals.settings = settings;

    // Configurable base URL for reverse proxy subpaths (e.g. /fabtrack/)
    const rawBasePath = (process.env.APP_BASE_PATH || "").trim().replace(/^\/|\/$/g, "");
    res.locals.baseUrl = rawBasePath ? `/${rawBasePath}/` : "/";
    res.locals.basePath = rawBasePath ? `/${rawBasePath}` : "";

    // Automatically prefix server-side redirects with the subpath in reverse proxy deployments
    if (rawBasePath && !res.__baseRedirectPatched) {
      res.__baseRedirectPatched = true;
      const originalRedirect = res.redirect.bind(res);
      res.redirect = function (url) {
        let address = url;
        let status = 302;
        if (arguments.length === 2) {
          if (typeof arguments[0] === "number") {
            status = arguments[0];
            address = arguments[1];
          } else {
            address = arguments[0];
            status = arguments[1];
          }
        }
        if (typeof address === "string" && address.startsWith("/") && !address.startsWith("//")) {
          const prefix = `/${rawBasePath}`;
          if (address !== prefix && !address.startsWith(`${prefix}/`)) {
            address = `${prefix}${address}`;
          }
        }
        return originalRedirect(status, address);
      };
    }

    // Check platform installation status
    let isInstalled = settings.platform_installed === "true";
    if (!isInstalled) {
      isInstalled = await setupService.checkIsInstalled();
    }
    res.locals.isPlatformInstalled = isInstalled;

    const isSetupRoute = req.path.startsWith("/setup");
    const isStaticOrAsset =
      req.path.startsWith("/stylesheets") ||
      req.path.startsWith("/javascripts") ||
      req.path.startsWith("/images") ||
      req.path.startsWith("/uploads") ||
      req.path.includes("favicon");

    if (!isInstalled && !isSetupRoute && !isStaticOrAsset) {
      return res.redirect("/setup");
    }

    // Internationalization (i18n) setup
    const supportedLocales = i18nService.getAvailableLocales();
    const localesMeta = i18nService.getAvailableLanguagesWithMeta();
    let targetLang = req.session && req.session.lang;
    if (!targetLang && req.cookies && req.cookies.fabtrack_lang) {
      targetLang = req.cookies.fabtrack_lang;
    }
    if (!targetLang || !supportedLocales.includes(targetLang)) {
      targetLang = settings.default_language || "fr";
    }
    if (!supportedLocales.includes(targetLang)) {
      targetLang = "fr";
    }
    req.setLocale(targetLang);
    res.locals.currentLocale = req.getLocale();
    const currentMeta = i18nService.getLanguageMeta(res.locals.currentLocale);
    res.locals.currentLocaleFlag = currentMeta.flag;
    res.locals.currentLocaleName = currentMeta.name;
    res.locals.locales = supportedLocales;
    res.locals.localesMeta = localesMeta;

    // Fallback translation: if a string in targetLang is missing or empty, fallback to French
    if (res.locals.__) {
      const origT = res.locals.__;
      res.locals.__ = function (...args) {
        const val = origT.apply(this, args);
        if ((!val || val === args[0]) && typeof args[0] === "string") {
          return i18n.__({ phrase: args[0], locale: "fr" }) || val;
        }
        return val;
      };
    }
    res.locals.platformName = settings.platform_name || "FabtrackJS";
    res.locals.platformSubtitle = settings.platform_subtitle || "Track your fablab's activity";
    res.locals.platformLogoType = settings.platform_logo_type || "default";
    res.locals.platformLogoPath = settings.platform_logo_path || "";
    res.locals.platformFaviconPath = settings.platform_favicon_path || "";
    res.locals.currencySymbol = settings.currency_symbol || "€";
    res.locals.currentDateFormat = settings.date_format || "DD/MM/YYYY";

    // Date formatting helpers
    dateService.setLocale(targetLang);
    res.locals.formatDate = dateService.formatDate;
    res.locals.formatDateTime = dateService.formatDateTime;
    res.locals.formatTime = dateService.formatTime;

    // Sync plugin states with settings
    const isUeEnabled = settings.plugin_ue_enabled !== "false";
    hookManager.setPluginEnabled("ue", isUeEnabled);
    res.locals.isPluginUeEnabled = isUeEnabled;
    res.locals.ueProjectTypeName = settings.ue_projecttype_name || "Academic";

    const isRfidEnabled = settings.plugin_rfid_enabled !== "false";
    hookManager.setPluginEnabled("rfid", isRfidEnabled);
    res.locals.isPluginRfidEnabled = isRfidEnabled;

    const isBookstackEnabled = settings.plugin_bookstack_enabled !== "false";
    hookManager.setPluginEnabled("bookstack", isBookstackEnabled);
    res.locals.isPluginBookstackEnabled = isBookstackEnabled;
    res.locals.bookstackBaseUrl = settings.bookstack_url || "https://wiki.fablab.sorbonne-universite.fr/BookStack/";
    res.locals.bookstackAutoPrefill = settings.bookstack_auto_prefill !== "false";

    const isRepairCafeEnabled = settings.plugin_repaircafe_enabled !== "false";
    hookManager.setPluginEnabled("repaircafe", isRepairCafeEnabled);
    res.locals.isPluginRepairCafeEnabled = isRepairCafeEnabled;
    res.locals.repairCafeProjectTypeName = settings.repaircafe_projecttype_name || "Repair Café";

    const isWorkshopEnabled = settings.plugin_workshop_enabled !== "false";
    hookManager.setPluginEnabled("workshop", isWorkshopEnabled);
    res.locals.isPluginWorkshopEnabled = isWorkshopEnabled;
    res.locals.workshopProjectTypeName = settings.workshop_projecttype_name || "Atelier";

    const isSorbonneEnabled = settings.plugin_sorbonne_enabled !== "false";
    hookManager.setPluginEnabled("sorbonne", isSorbonneEnabled);
    res.locals.isPluginSorbonneEnabled = isSorbonneEnabled;
    res.locals.sorbonneProjectTypeName = settings.sorbonne_projecttype_name || "Sorbonne";

    // Apply dynamic session timeout if configured
    if (req.session && req.session.cookie) {
      const timeoutHours = parseInt(settings.session_timeout_hours || "24", 10);
      if (!isNaN(timeoutHours) && timeoutHours > 0) {
        req.session.cookie.maxAge = timeoutHours * 3600 * 1000;
      }
    }

    res.locals.role = req.session ? req.session.role : undefined;
    res.locals.username = req.session ? req.session.username : undefined;
    res.locals.currentPath = req.originalUrl ? req.originalUrl.split("?")[0] : req.path;

    // Expose centralized XSS / URL / JSON / icon sanitization helpers to all EJS views
    res.locals.escapeHtml = escapeHtml;
    res.locals.safeJson = safeJson;
    res.locals.safeHttpUrl = safeHttpUrl;
    res.locals.sanitizeWarningIcon = sanitizeWarningIcon;

    next();
  } catch (err) {
    console.error("Error in settings middleware:", err);
    next();
  }
});

// Enforce session-synchronized CSRF protection on state-changing requests
// (mounted after settings middleware so error views have baseUrl/platformName/i18n)
app.use(csrfProtection);

// Workspace middleware (backed by global referenceCacheService instead of per-session arrays)
async function workspaceSwitcher(req, res, next) {
  try {
    if (!req.session || !req.session.loggedin) {
      res.locals.availableWorkspaces = [];
      res.locals.selectedWorkspace = { id: 0, name: "Fablab" };
      return next();
    }

    const availableWorkspaces = await referenceCacheService.getWorkspaces();

    if (!req.session.selectedWorkspace && availableWorkspaces.length > 0) {
      let candidateId = null;

      // 1. If staff is logged in and lastWorkspaceId is in session or database
      if (req.session.lastWorkspaceId) {
        candidateId = req.session.lastWorkspaceId;
      } else if (req.session.username) {
        const staff = await prisma.staff.findUnique({
          where: { name: req.session.username },
          select: { lastWorkspaceId: true },
        });
        if (staff && staff.lastWorkspaceId) {
          candidateId = staff.lastWorkspaceId;
          req.session.lastWorkspaceId = staff.lastWorkspaceId;
        }
      }

      // 2. Persistent cookie fallback
      if (!candidateId && req.cookies && req.cookies.fabtrack_last_workspace_id) {
        candidateId = Number(req.cookies.fabtrack_last_workspace_id);
      }

      if (candidateId) {
        const foundCandidate = availableWorkspaces.find((w) => w.id === candidateId);
        if (foundCandidate) {
          req.session.selectedWorkspace = { id: foundCandidate.id, name: foundCandidate.name };
        }
      }

      // 3. Fallback to first available workspace if none found
      if (!req.session.selectedWorkspace) {
        const first = availableWorkspaces[0];
        req.session.selectedWorkspace = { id: first.id, name: first.name };
      }
    } else if (req.session.selectedWorkspace) {
      // Ensure selected workspace still exists in database and stays synced with renamed title
      const found = availableWorkspaces.find((w) => w.id === req.session.selectedWorkspace.id);
      if (found) {
        if (req.session.selectedWorkspace.name !== found.name) {
          req.session.selectedWorkspace = { id: found.id, name: found.name };
        }
      } else if (availableWorkspaces.length > 0) {
        req.session.selectedWorkspace = { id: availableWorkspaces[0].id, name: availableWorkspaces[0].name };
      } else {
        req.session.selectedWorkspace = null;
      }
    }

    res.locals.availableWorkspaces = availableWorkspaces || [];
    res.locals.selectedWorkspace = req.session.selectedWorkspace || { id: 0, name: "Fablab" };

    next();
  } catch (error) {
    console.error("Error in workspace switcher middleware:", error);
    next(new ApiError(500, "Failed to load workspace information"));
  }
}

app.use(workspaceSwitcher);

// Load reference data from global cache (immediately invalidated across all sessions on admin mutations)
async function loadCache(req, res, next) {
  try {
    if (!req.session || !req.session.loggedin) {
      res.locals.usertypes = [];
      res.locals.projecttypes = [];
      res.locals.machinetypes = [];
      res.locals.warningtypes = [];
      res.locals.categories = [];
      res.locals.locations = [];
      res.locals.access = [];
      res.locals.equipment = [];
      return next();
    }

    const refData = await referenceCacheService.getReferenceData();

    res.locals.usertypes = refData.usertypes || [];
    res.locals.projecttypes = refData.projecttypes || [];
    res.locals.machinetypes = refData.machinetypes || [];
    res.locals.warningtypes = refData.warningtypes || [];
    res.locals.categories = refData.categories || [];
    res.locals.locations = refData.locations || [];
    res.locals.access = refData.access || [];
    res.locals.equipment = refData.equipment || [];

    next();
  } catch (error) {
    console.error("Error loading reference data cache:", error);
    next(new ApiError(500, "Failed to load application reference data"));
  }
}

app.use(loadCache);

// ******************************************************************************
// View Engine Setup
// ******************************************************************************

app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");
if (isProduction) {
  app.enable("view cache");
}

// ******************************************************************************
// Dynamic Route Loading
// ******************************************************************************

/**
 * Recursively load all route files in the directory.
 * @param {String} dirPath - The base directory for routes.
 * @param {String} baseRoute - The base route path for the directory.
 */

function loadRoutes(dirPath, baseRoute = "") {
  fs.readdirSync(dirPath).forEach((file) => {
    const fullPath = path.join(dirPath, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      // Recurse into subdirectory
      const subRoute = `${baseRoute}/${file}`;
      loadRoutes(fullPath, subRoute);
    } else if (file.endsWith(".js")) {
      // Load route file and mount it
      const routePath = `${baseRoute}/${file.replace(".js", "")}`.replace(/\/index$/, "/");
      const router = require(fullPath);

      console.log(`Registering route: ${routePath}`);
      app.use(routePath, router);
    }
  });
}

// Load routes starting from the "routes" directory
const routesDir = path.join(__dirname, "routes");
loadRoutes(routesDir);

// ******************************************************************************
// Error Handling
// ******************************************************************************

// Custom error for API errors
class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Catch 404 errors
app.use((req, res, next) => {
  next(new ApiError(404, `Not Found: ${req.originalUrl}`));
});

// General error handler
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || err.status || 500;
  const errorDetail = {
    message: err.message || 'Internal Server Error',
    status: statusCode,
    stack: req.app.get('env') === 'development' ? err.stack : undefined,
    path: req.originalUrl,
    timestamp: new Date().toISOString()
  };
  
  // Log error details in any environment but more verbose in production
  console.error(`[${errorDetail.timestamp}] ${statusCode} - ${errorDetail.message}`);
  if (req.app.get('env') === 'production' && statusCode >= 500) {
    console.error(err.stack);
  }

  // Respond appropriately based on request type (API/web)
  const isApiOrJson = Boolean(
    req.xhr ||
    (req.headers.accept && req.headers.accept.includes("application/json")) ||
    (req.headers["content-type"] && req.headers["content-type"].includes("application/json")) ||
    req.is("json") ||
    req.path.startsWith("/api/") ||
    req.path.includes("/ai/")
  );

  if (isApiOrJson) {
    res.status(statusCode).json({ error: errorDetail, message: errorDetail.message, success: false });
  } else {
    res.status(statusCode);
    res.locals.error = req.app.get('env') === 'development' ? errorDetail : { message: errorDetail.message, status: statusCode };
    res.locals.message = errorDetail.message;
    res.locals.role = req.session ? req.session.role : null;
    res.locals.loggedin = req.session ? req.session.loggedin : false;
    res.locals.requestedPath = req.originalUrl;
    res.locals.notification = req.session ? req.session.notification || "" : "";

    if (statusCode === 404) {
      res.render('404');
    } else {
      res.render('error');
    }
  }
});

// ******************************************************************************
// Export App
// ******************************************************************************

app.resolveSessionSecret = resolveSessionSecret;
app.resolveTrustProxy = resolveTrustProxy;
app.createSessionStore = createSessionStore;
app.sessionStore = sessionStore;

module.exports = app;
