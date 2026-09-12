const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const logger = require("morgan");
const dotenv = require("dotenv");
const createError = require("http-errors");
const helmet = require("helmet");
const { PrismaClient } = require("@prisma/client");
const fs = require("fs");

const loadPlugins = require("./core/pluginLoader");
const hookManager = require("./core/HookManager");
loadPlugins();

dotenv.config();

const app = express();
const prisma = new PrismaClient();

// ******************************************************************************
// Middleware Setup
// ******************************************************************************

// Add security headers with helmet
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
        connectSrc: ["'self'"],
      },
    },
  }),
);

app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

// Ensure uploads directory exists and is statically accessible
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use("/uploads", express.static(uploadsDir));

app.use(
  session({
    secret: process.env.SECRET || "fabtrack-secret-key-2024",
    resave: false,
    saveUninitialized: true,
    cookie: {
      httpOnly: true,
      maxAge: parseInt(process.env.SESSION_DURATION || "86400000"),
    },
  }),
);

// Add session data to response locals for easier access in templates
app.use((req, res, next) => {
  res.locals.role = req.session.role;
  res.locals.username = req.session.username;
  res.locals.isPluginUeEnabled = hookManager.isPluginEnabled("ue");
  next();
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
      req.session.equipment = await prisma.equipment.findMany();
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
  if (req.xhr || req.headers.accept === 'application/json') {
    res.status(statusCode).json({ error: errorDetail });
  } else {
    res.status(statusCode);
    res.locals.error = req.app.get('env') === 'development' ? errorDetail : { message: errorDetail.message, status: statusCode };
    res.locals.message = errorDetail.message;
    res.render('error');
  }
});

// ******************************************************************************
// Export App
// ******************************************************************************

module.exports = app;
