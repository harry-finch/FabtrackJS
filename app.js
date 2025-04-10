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
      useDefaults: true,
      directives: {
        // Allow scripts from specific trusted sources
        "script-src": [
          "'self'", // Allow scripts from the same origin
          "https://cdnjs.cloudflare.com", // Example: CDNJS
          "https://cdn.jsdelivr.net", // Example: jsDelivr
        ],
        // Allow styles from specific trusted sources
        "style-src": [
          "'self'", // Allow inline styles from the same origin
          "'unsafe-inline'", // Allow inline styles (use sparingly)
          "https://fonts.googleapis.com", // Example: Google Fonts
          "https://cdnjs.cloudflare.com", // Example: CDNJS
          "https://cdn.jsdelivr.net",
        ],
        // Allow fonts from specific trusted sources
        "font-src": [
          "'self'",
          "https://fonts.gstatic.com", // Example: Google Fonts
        ],
        // Allow images from all sources (adjust as needed)
        "img-src": ["'self'", "data:", "https:"],
        // Allow connections to APIs or WebSocket services (adjust as needed)
        "connect-src": ["'self'", "https://api.example.com"], // Example: API
      },
    },
  }),
);

app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    secret: process.env.SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
      httpOnly: true,
      maxAge: parseInt(process.env.SESSION_DURATION),
    },
  }),
);

// Add session data to response locals for easier access in templates
app.use((req, res, next) => {
  res.locals.role = req.session.role;
  res.locals.username = req.session.username;
  next();
});

// Workspace middleware
async function workspaceSwitcher(req, res, next) {
  try {
    if (!req.session.availableWorkspaces) {
      // Fetch workspaces only if not already cached
      req.session.availableWorkspaces = await prisma.workspace.findMany();
    }

    // Set a default workspace if none is selected
    if (!req.session.selectedWorkspace && req.session.availableWorkspaces.length > 0) {
      req.session.selectedWorkspace = req.session.availableWorkspaces[0];
    }

    res.locals.availableWorkspaces = req.session.availableWorkspaces;
    res.locals.selectedWorkspace = req.session.selectedWorkspace;

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
    if (!req.session.usertypes) {
      req.session.usertypes = await prisma.usertype.findMany();
      req.session.projecttypes = await prisma.projecttype.findMany();
      req.session.machinetypes = await prisma.machineType.findMany();
      req.session.warningtypes = await prisma.warningtype.findMany();
      req.session.categories = await prisma.category.findMany();
      req.session.locations = await prisma.location.findMany();
      req.session.access = await prisma.access.findMany();
    }

    res.locals.usertypes = req.session.usertypes;
    res.locals.projecttypes = req.session.projecttypes;
    res.locals.machinetypes = req.session.machinetypes;
    res.locals.warningtypes = req.session.warningtypes;
    res.locals.categories = req.session.categories;
    res.locals.locations = req.session.locations;
    res.locals.access = req.session.access;

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
