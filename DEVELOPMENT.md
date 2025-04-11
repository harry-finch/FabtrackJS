# FabtrackJS Developer Documentation

Welcome to the FabtrackJS development guide! This document will help you understand the project architecture, codebase organization, and how to contribute effectively.

## Table of Contents

- [Project Overview](#project-overview)
- [Architecture](#architecture)
- [Database Structure](#database-structure)
- [Core Components](#core-components)
- [Plugin System](#plugin-system)
- [Development Workflow](#development-workflow)
- [Testing](#testing)
- [Documentation](#documentation)
- [Contributing Guidelines](#contributing-guidelines)

## Project Overview

FabtrackJS is an open-source platform designed to track user activity, projects, and inventory in fablabs. Built with NodeJS and Express, it provides a modular system for monitoring and managing a fablab's resources, users, and activities.

### Key Features

- User management and tracking
- Project tracking
- Machine and equipment inventory
- Workspace management
- Activity logging
- Plugin system for extensibility
- Real-time notifications with Socket.io

## Architecture

FabtrackJS follows a modular architecture based on Express.js with a plugin system for extensibility.

### High-Level Architecture

```FabtrackJS/architecture.png#L1-20
+----------------+     +----------------+     +----------------+
|                |     |                |     |                |
|  Web Interface |     |    REST API    |     | Socket.io API  |
|                |     |                |     |                |
+-------+--------+     +-------+--------+     +-------+--------+
        |                      |                      |
+-------v-----------------------v----------------------v--------+
|                                                               |
|                        Express Application                    |
|                                                               |
+-------+---------------------+------------------+--------------+
        |                     |                  |
+-------v-------+   +---------v---------+   +----v-------------+
|               |   |                   |   |                  |
| Core Modules  |   |  Plugin System    |   | Hook System      |
|               |   |                   |   |                  |
+-------+-------+   +---------+---------+   +------------------+
        |                     |
+-------v---------------------v----------------------------------+
|                                                               |
|                      Prisma ORM Layer                         |
|                                                               |
+---------------------------------------------------------------+
                              |
                      +-------v-------+
                      |               |
                      |  MySQL DB     |
                      |               |
                      +---------------+
```

### Directory Structure

```FabtrackJS/directory.txt#L1-20
FabtrackJS/
├── bin/                  # Application entry points
│   └── www               # Server startup script
├── core/                 # Core functionality
│   ├── HookManager.js    # Hook management system
│   ├── hookLoader.js     # Loads hooks from hooks directory
│   └── pluginLoader.js   # Loads plugins from plugins directory
├── hooks/                # Custom hooks
├── middleware/           # Express middleware
├── plugins/              # Extensibility plugins
├── prisma/               # Database schema and migrations
│   ├── migrations/       # Database migrations
│   └── schema.prisma     # Prisma schema
├── public/               # Static assets
├── routes/               # API routes
├── views/                # EJS templates
├── app.js                # Main application file
├── package.json          # Dependencies and scripts
└── .env                  # Environment configuration
```

## Database Structure

FabtrackJS uses MySQL with Prisma ORM for database operations. The schema is designed to handle user tracking, project management, equipment inventory, and activity logging.

### Entity Relationship Diagram

The database is structured around several key entities:

1. **Users & Staff** - People who use or manage the fablab
2. **Projects** - Work being done in the fablab
3. **Machines & Equipment** - Physical resources
4. **Workspaces & Locations** - Physical organization
5. **Activities & History** - Tracking usage and visits

### Main Entities

#### User Management

- **Staff** - Admin users who can log into the system
- **User** - People being tracked (visitors, students)
- **Usertype** - Types of users (e.g., student, teacher)

#### Project Tracking

- **Project** - Project information
- **Projecttype** - Categories of projects
- **UserProject** - Many-to-many relationship between users and projects

#### Equipment Management

- **Machine** - Detailed machine information
- **MachineType** - Categories of machines
- **Equipment** - Tools and other equipment
- **Consumable** - Expendable materials with inventory tracking

#### Workspace Management

- **Workspace** - Different areas in the fablab
- **Category** - Types of equipment within workspaces
- **Location** - Physical locations for assets

#### Activity Tracking

- **History** - User visits to the fablab
- **Activity** - Usage of machines, equipment, and consumables
- **Warning** - Issues recorded for users
- **Warningtype** - Categories of warnings
- **Log** - Audit trail of system activities

## Core Components

### Express Application (app.js)

The main application file sets up middleware, session management, and dynamically loads routes:

```FabtrackJS/app.js#L142-165
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
```

### Middleware

FabtrackJS includes several middleware components:

1. **Security Headers** - Using Helmet for security best practices
2. **Session Management** - For authenticated users
3. **Workspace Switcher** - For switching between different areas of the fablab
4. **Data Caching** - To improve performance by caching common queries

Example of the workspace switcher middleware:

```FabtrackJS/app.js#L78-97
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
```

### Error Handling

A custom error handling system provides structured error reporting:

```FabtrackJS/app.js#L180-222
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
```

## Plugin System

FabtrackJS includes a plugin system for extensibility. Plugins can hook into various parts of the application to add features without modifying the core code.

### Hook Manager

The hook system allows registering callbacks for specific events:

```FabtrackJS/core/HookManager.js#L1-20
class HookManager {
  constructor() {
    this.hooks = {};
  }

  // Register a new hook
  addHook(name, callback) {
    if (!this.hooks[name]) {
      this.hooks[name] = [];
    }
    this.hooks[name].push(callback);
  }

  // Call all callbacks registered for a hook
  async callHook(name, data) {
    if (!this.hooks[name]) return data;

    let result = data;
    for (const callback of this.hooks[name]) {
      result = await callback(result);
    }
    return result;
  }
}

module.exports = new HookManager();
```

### Creating Plugins

Plugins are JavaScript modules that export a registration function:

```FabtrackJS/plugins/examplePlugin.js#L1-20
// Example plugin
module.exports = {
  name: "Example Plugin",
  version: "1.0.0",

  register: function(hookManager) {
    // Register hooks for this plugin
    hookManager.addHook("beforeUserCreate", async (userData) => {
      // Modify or validate user data before creation
      console.log("Processing user before creation:", userData);
      return userData;
    });

    hookManager.addHook("afterUserLogin", async (user) => {
      // Do something after a user logs in
      console.log("User logged in:", user.name);
      return user;
    });
  }
};
```

## Development Workflow

### Setting Up the Development Environment

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/fabtrackjs.git
   cd fabtrackjs
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Set up environment variables by creating a `.env` file:
   ```
   # Database connection
   DATABASE_URL="mysql://username:password@localhost:3306/fabtrack"

   # Session configuration
   SECRET="your-secret-key-here"
   SESSION_DURATION=86400000  # 24 hours in milliseconds

   # Server configuration
   PORT=8080
   ```

4. Initialize the database:
   ```
   npx prisma migrate reset
   ```

5. Start the development server:
   ```
   npm start
   ```

### Code Style and Conventions

- Use camelCase for variable and function names
- Use PascalCase for class names
- Add JSDoc comments for functions and classes
- Keep functions small and focused on a single responsibility
- Use async/await for asynchronous code

### Database Changes

When making changes to the database schema:

1. Update the `schema.prisma` file
2. Create a new migration:
   ```
   npx prisma migrate dev --name descriptive_name
   ```
3. Apply the migration:
   ```
   npx prisma migrate deploy
   ```

## Testing

Currently, FabtrackJS doesn't have automated tests. This is an area for improvement. Consider adding:

1. Unit tests with Jest for core functionality
2. Integration tests for API endpoints
3. End-to-end tests for critical user flows

## Documentation

### Code Documentation

Add JSDoc comments to functions and classes:

```FabtrackJS/exampleDoc.js#L1-15
/**
 * Process a user registration.
 *
 * @param {Object} userData - The user data from the registration form
 * @param {string} userData.name - User's full name
 * @param {string} userData.email - User's email address
 * @param {string} userData.password - User's password (plaintext)
 * @param {number} userData.usertypeId - ID of the user type
 * @returns {Promise<Object>} - The created user object
 * @throws {Error} - If validation fails or database error occurs
 */
async function processUserRegistration(userData) {
  // Implementation
}
```

### API Documentation

Consider using Swagger/OpenAPI to document API endpoints.

## Contributing Guidelines

### Pull Request Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run linting and tests
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Code Review Checklist

- Does the code follow our style guidelines?
- Are there appropriate comments and documentation?
- Does the code have appropriate error handling?
- Are there any security concerns?
- Does the code include appropriate tests?

### Commit Message Format

Use conventional commits format:

```
feat: Add user registration validation
fix: Resolve login issue on Safari
docs: Update API documentation
refactor: Improve error handling middleware
```

## Next Steps for Project Improvement

1. Finish inventory management
2. Add automated testing
3. Implement TypeScript for better type safety
4. Update Express to the latest version
5. Improve error handling and logging
6. Add comprehensive API documentation
7. Create a UI component library for consistent design
