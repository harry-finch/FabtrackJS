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
const dateService = require("./services/dateService");
const i18nService = require("./services/i18nService");
const i18n = require("./config/i18n");
const compression = require("compression");
const isProduction = process.env.NODE_ENV === "production";

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

// Ensure uploads directory exists and is statically accessible
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use("/uploads", express.static(uploadsDir, staticOptions));

// Enable trust proxy when behind Nginx / reverse proxy
app.set("trust proxy", 1);

app.use(
  session({
    name: "fabtrack.sid", // Avoid session collision with other apps on the same domain
    secret: process.env.SECRET || "fabtrack-secret-key-2024",
    resave: false,
    saveUninitialized: true,
    cookie: {
      httpOnly: true,
      maxAge: parseInt(process.env.SESSION_DURATION || "86400000"),
    },
  }),
);

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

    next();
  } catch (err) {
    console.error("Error in settings middleware:", err);
    next();
  }
});

// Workspace middleware
async function workspaceSwitcher(req, res, next) {
  try {
    if (!req.session.availableWorkspaces || req.session.invalidateCache) {
      req.session.availableWorkspaces = await prisma.workspace.findMany();
    }

    if (!req.session.selectedWorkspace && req.session.availableWorkspaces.length > 0) {
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
        const foundCandidate = req.session.availableWorkspaces.find((w) => w.id === candidateId);
        if (foundCandidate) {
          req.session.selectedWorkspace = foundCandidate;
        }
      }

      // 3. Fallback to first available workspace if none found
      if (!req.session.selectedWorkspace) {
        req.session.selectedWorkspace = req.session.availableWorkspaces[0];
      }
    } else if (req.session.selectedWorkspace) {
      // Ensure selected workspace still exists in database
      const found = req.session.availableWorkspaces.find((w) => w.id === req.session.selectedWorkspace.id);
      req.session.selectedWorkspace = found || (req.session.availableWorkspaces.length > 0 ? req.session.availableWorkspaces[0] : null);
    }

    res.locals.availableWorkspaces = req.session.availableWorkspaces || [];
    res.locals.selectedWorkspace = req.session.selectedWorkspace || { id: 0, name: "Fablab" };

    next();
  } catch (error) {
    console.error("Error in workspace switcher middleware:", error);
    next(new ApiError(500, "Failed to load workspace information"));
  }
}

app.use(workspaceSwitcher);

// Load types, categories and such in cache to avoid repeated db queries
async function loadCache(req, res, next) {
  try {
    if (!req.session.usertypes || req.session.invalidateCache) {
      req.session.usertypes = await prisma.usertype.findMany();
      req.session.projecttypes = await prisma.projecttype.findMany();
      req.session.machinetypes = await prisma.machineType.findMany();
      req.session.warningtypes = await prisma.warningtype.findMany();
      req.session.categories = await prisma.category.findMany({ include: { workspace: true } });
      req.session.locations = await prisma.location.findMany();
      req.session.access = await prisma.access.findMany();
      req.session.machines = await prisma.machine.findMany();
      req.session.equipment = await prisma.equipment.findMany({ include: { workspace: true }, orderBy: { name: "asc" } });
      req.session.invalidateCache = false;
    }

    res.locals.usertypes = req.session.usertypes || [];
    res.locals.projecttypes = req.session.projecttypes || [];
    res.locals.machinetypes = req.session.machinetypes || [];
    res.locals.warningtypes = req.session.warningtypes || [];
    res.locals.categories = req.session.categories || [];
    res.locals.locations = req.session.locations || [];
    res.locals.access = req.session.access || [];
    res.locals.machines = req.session.machines || [];
    res.locals.equipment = req.session.equipment || [];

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

module.exports = app;
