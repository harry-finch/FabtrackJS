# FabtrackJS — Developer & AI Agent Guide

Welcome to the **FabtrackJS** development guide. This document serves as a comprehensive reference for both human engineers and AI coding agents to navigate, understand, and extend the FabtrackJS codebase safely, efficiently, and consistently.

---

## Table of Contents

1. [Architecture & Design Principles](#1-architecture--design-principles)
2. [Directory & File Organization](#2-directory--file-organization)
3. [Database & Prisma ORM Workflow](#3-database--prisma-orm-workflow)
4. [Routing & Middleware Conventions](#4-routing--middleware-conventions)
5. [Cache & Session Lifecycle](#5-cache--session-lifecycle)
6. [Plugin Architecture & HookManager](#6-plugin-architecture--hookmanager)
7. [Internationalization (i18n) & Dynamic CSV Workflow](#7-internationalization-i18n--dynamic-csv-workflow)
8. [Date & Time Formatting (dateService)](#8-date--time-formatting-dateservice)
9. [Email & Notification Subsystem](#9-email--notification-subsystem)
10. [File Uploads with Multer](#10-file-uploads-with-multer)
11. [UI & Templating Guidelines (EJS & Bootstrap 5)](#11-ui--templating-guidelines-ejs--bootstrap-5)
12. [Input Validation Architecture (Zod & Middleware)](#12-input-validation-architecture-zod--middleware)
13. [Equipment Loan Lifecycle & Restitution](#13-equipment-loan-lifecycle--restitution)
14. [Platform Bug & Feedback Reporting Workflow](#14-platform-bug--feedback-reporting-workflow)
15. [Automated Testing Suite (npm test)](#15-automated-testing-suite-npm-test)
16. [Platform Setup & Installation Architecture](#16-platform-setup--installation-architecture)
17. [AI Agent Verification & Troubleshooting Checklist](#17-ai-agent-verification--troubleshooting-checklist)

---

## 1. Architecture & Design Principles

FabtrackJS is built on Node.js and Express with a layered architecture:

- **Data Access Layer**: MySQL accessed exclusively via **Prisma ORM** (`@prisma/client`).
- **Service Layer (`services/`)**: Encapsulates business logic, external API integrations, email dispatching, internationalization, date formatting, and system settings.
- **Routing Layer (`routes/`)**: Automatically discovered and recursively mounted based on filesystem structure.
- **Validation Layer (`schemas/` & `middleware/validate.js`)**: Strictly parses, type-coerces, and sanitizes incoming HTTP payloads using **Zod**.
- **Testing Layer (`tests/`)**: Automated test suite with **Jest** and **Supertest** covering unit schemas and full-stack integration workflows.
- **Extensibility Layer (`plugins/` & `core/HookManager.js`)**: Decoupled feature modules hook into system lifecycle events without mutating core controllers.
- **Localization Layer (`locales/`, `config/i18n.js`, `services/i18nService.js`)**: Dynamic multi-language catalog with CSV export/import and automated language creation.
- **Presentation Layer (`views/`)**: Server-side rendered EJS templates styled with Bootstrap 5, FontAwesome 6, and custom modern CSS variables supporting dark/light modes.

---

## 2. Directory & File Organization

```
FabtrackJS/
├── bin/
│   └── www                       # HTTP server entrypoint (port binding, startup)
├── config/
│   └── i18n.js                   # Dynamic i18n configuration & runtime locale reloader
├── core/
│   ├── HookManager.js            # Central hook registry and async event dispatcher
│   ├── hookLoader.js             # Discovers and registers hooks
│   └── pluginLoader.js           # Auto-loads plugins from plugins/ directory
├── locales/                      # Active JSON translation catalogs (fr.json, en.json, ...)
│   ├── fr.json                   # French source translations (default fallback)
│   └── en.json                   # English translations
├── middleware/
│   ├── asyncHandler.js           # Wraps async routes to forward errors to next()
│   ├── checkAdmin.js             # Protects admin routes (requires role === 'admin')
│   ├── checkSession.js           # Protects staff routes (requires loggedin === true)
│   ├── clearNotification.js      # Resets session flash notification after rendering
│   ├── cacheHelper.js            # Helper to invalidate reference data cache
│   └── validate.js               # Zod request validation middleware (body, params, query)
├── plugins/                      # Self-contained feature plugins
│   ├── bookstackPlugin.js        # BookStack wiki documentation sync
│   ├── repairCafePlugin.js       # Repair café event tracking & resolution
│   ├── workshopPlugin.js         # Workshops, badges, and machine access control
│   ├── uePlugin.js               # Sorbonne University academic units & billing
│   └── rfidPlugin.js             # RFID scanner & kiosk integration
├── prisma/
│   ├── schema.prisma             # Primary Prisma schema & relation definitions
│   └── seed.js                   # Database seed script for test/dev environment
├── public/                       # Publicly accessible static assets
│   ├── javascripts/              # Client-side scripts (color mode, autocomplete, sorting)
│   └── stylesheets/              # Global CSS styles (main.css)
├── routes/                       # Express routes (auto-loaded dynamically)
│   ├── admin/                    # Admin management endpoints (/admin/*)
│   │   ├── emails.js             # SMTP settings & notification toggles
│   │   ├── equipment.js          # Equipment catalog, loan supervision, & restitution
│   │   ├── machines.js           # Machine catalog & history views
│   │   ├── settings.js           # Platform branding, i18n, & general configuration
│   │   ├── staff.js              # Staff permissions & account management
│   │   └── ...                   # Consumables, workshops, categories, etc.
│   ├── fabtrack.js               # Visitor kiosk check-in / check-out interface
│   ├── report-issue.js           # Public responsive machine issue reporting
│   ├── setup.js                  # First-run guided web setup wizard (/setup)
│   ├── users.js                  # User profile and history management
│   └── index.js                  # Auth, bug reporting (/report-bug), language switcher
├── schemas/                      # Modular Zod input validation schemas
│   ├── user.schema.js            # User creation, editing, balance & warning schemas
│   ├── equipment.schema.js       # Equipment creation, editing, & borrowing schemas
│   ├── history.schema.js         # Kiosk check-in/out, activity, and borrow sessions
│   ├── bug.schema.js             # Platform bug & feedback report schema
│   ├── consumable.schema.js      # Consumable stock & consumption schemas
│   ├── auth.schema.js            # Login, registration, & password reset schemas
│   ├── issue.schema.js           # Machine breakdown report schema
│   ├── warning.schema.js         # Disciplinary warning schema
│   ├── api.schema.js             # RFID scanning & internal API schemas
│   ├── setup.schema.js           # Setup wizard validation schema
│   └── index.js                  # Central schema export hub
├── scripts/
│   ├── i18n-csv.js               # CLI script for npm run i18n:export & i18n:import
│   └── setup.js                  # Interactive terminal setup tool (npm run setup)
├── services/                     # Business logic services (singletons)
│   ├── settingsService.js        # Persistent platform settings (cached)
│   ├── setupService.js           # Unified installation & database bootstrapping
│   ├── dateService.js            # Centralized date/time formatting & moment locales
│   ├── i18nService.js            # CSV spreadsheet import/export & dynamic language engine
│   ├── mailService.js            # Nodemailer transport & HTML layout rendering
│   ├── bookstackService.js       # BookStack REST API integration
│   ├── repairCafeService.js      # Repair café statistics & operations
│   └── workshopService.js        # Workshop completion & machine unlocking
├── tests/                        # Automated Jest + Supertest test suite
│   ├── helpers/
│   │   ├── testDb.js             # Database setup, fixture helpers, & cleanup
│   │   └── authHelper.js         # Authenticated session generator for Supertest
│   ├── integration/              # Full-stack HTTP route and database workflow tests
│   │   ├── userCreation.test.js  # User registration & duplicate email validation
│   │   ├── balance.test.js       # User credit top-up, debit, & transaction rules
│   │   ├── charterAndKiosk.test.js # Charter acceptance & kiosk admission
│   │   ├── equipmentBorrow.test.js # Equipment loan creation, return dates, & restitution
│   │   ├── validationMiddleware.test.js # Zod redirection, flash toasts, & API 400s
│   │   ├── bugReport.test.js     # Bug report submission & admin email alert
│   │   └── setup.test.js         # Installation wizard & route protection tests
│   └── unit/                     # Fast isolated unit tests
│       ├── validation.test.js    # Schema unit validation, coercion, & edge cases
│       └── rfidPlugin.test.js    # RFID scanner hooks & check-in/out logic
├── uploads/                      # Uploaded files (logos, favicons, issue photos)
│   └── issues/                   # Machine breakdown photos
├── utilities/
│   └── simpleLogger.js           # Database-backed and console activity logger
├── views/                        # EJS templates
│   ├── admin/                    # Admin views (manage-*.ejs, view-machine.ejs)
│   ├── fabtrack/                 # Kiosk & user profile views (index.ejs, edit-user.ejs)
│   ├── includes/                 # Common partials (header.html, bug-report-modal.html, ...)
│   ├── public/                   # Public unauthenticated views (report-issue.ejs)
│   ├── setup/                    # Setup wizard views (index.ejs)
│   └── index/                    # Auth views (login.ejs, register.ejs, reset.ejs)
├── app.js                        # Express app initialization, middleware, routes loader
├── package.json                  # Dependencies, test runner, and scripts
├── translations.csv              # Single-file translation spreadsheet (UTF-8 BOM)
└── .env                          # Local environment variables
```

---

## 3. Database & Prisma ORM Workflow

### Modifying the Database Schema
1. Edit [prisma/schema.prisma](file:///Users/mugen/Documents/01_Projets/FabtrackJS/prisma/schema.prisma).
2. Apply changes and regenerate the Prisma Client:
   ```bash
   npx prisma db push
   ```
   > **Note for AI Agents**: `npx prisma db push` is preferred over migrations in this development environment as it directly synchronizes MySQL tables and immediately regenerates `./node_modules/@prisma/client`.
3. Verify the generated client by running a lightweight Node test script if needed.

### Key Prisma Models Reference
- **`Staff`**: Authenticated managers/mediators (`name`, `email`, `password` (bcrypt), `role: "admin"|"staff"|"user"`, `approved: Boolean`).
- **`User`**: Fablab visitors and participants.
- **`Machine`**: Fablab machinery. Linked to `MachineType`, `Location`, `Access`, `Category`, and `issues: MachineIssue[]`.
- **`MachineIssue`**: Breakdown reports (`machineId`, `description`, `photoPath`, `reporterName`, `reporterEmail`, `status: "OPEN"|"RESOLVED"`, `resolvedAt`, `resolutionNotes`).
- **`Consumable`**: Expendable materials (`name`, `quantity`, `unit`, `alertThreshold`).
- **`History` & `Activity`**: Visitor sessions, machine usage, project affiliations, and departure timestamps.
- **`SystemSetting`**: Key-value pairs for all runtime platform configurations.

---

## 4. Routing & Middleware Conventions

### Dynamic Route Discovery (`app.js`)
Routes in the `routes/` directory are loaded recursively at server startup:
```javascript
// File: routes/report-issue.js -> Mounted at: /report-issue
// File: routes/admin/machines.js -> Mounted at: /admin/machines
```
- A route file must export an `express.Router()` instance.
- **Do not manually register routes in `app.js`** unless you are defining top-level middleware. Placing the file in `routes/` or subdirectories is sufficient.

### Controller Best Practices
- Always wrap route handlers with `asyncHandler`:
  ```javascript
  const asyncHandler = require("../middleware/asyncHandler.js");

  router.post("/example", asyncHandler(async (req, res) => {
    // Unhandled rejections will automatically forward to global error handler
  }));
  ```
- Protect admin routes with `isAdmin`:
  ```javascript
  const isAdmin = require("../../middleware/checkAdmin.js");
  router.use(isAdmin);
  ```
- Use session notifications for flash feedback:
  ```javascript
  req.session.notification = "Success: Opération effectuée avec succès.";
  // or "Error: Description de l'erreur."
  res.redirect("/target");
  ```

---

## 5. Cache & Session Lifecycle

To maintain responsiveness, `app.js` runs a `loadCache` middleware that preloads reference tables into `req.session`:
- `req.session.machines`
- `req.session.machinetypes`
- `req.session.categories`
- `req.session.locations`
- `req.session.equipment`
- `req.session.usertypes`

### Critical Cache Invalidation Rule
Whenever you create, update, or delete records in these reference tables (e.g. adding a machine, updating an equipment category), **you must invalidate the cache**:
```javascript
// In your route handler:
const { invalidateCache } = require("../../middleware/cacheHelper.js");
invalidateCache(req);
// OR directly:
req.session.invalidateCache = true;
```
Failing to do so will result in stale dropdown options in user sessions.

---

## 6. Plugin Architecture & HookManager

Plugins reside in `plugins/` and communicate through `core/HookManager.js`.

### Creating a New Plugin
```javascript
// plugins/myFeaturePlugin.js
module.exports = {
  name: "Plugin My Feature",
  version: "1.0.0",

  register: function (hookManager) {
    hookManager.addHook("myEventHook", async (context) => {
      // Execute logic, modify context if necessary
      return context;
    });
  },
};
```

### Enabling / Disabling Plugins
Plugin states are linked to system settings via `services/settingsService.js` and synchronized on every request in `app.js`:
```javascript
hookManager.setPluginEnabled("my_plugin_key", isEnabled);
res.locals.isMyPluginEnabled = isEnabled;
```

---

## 7. Internationalization (i18n) & Dynamic CSV Workflow

FabtrackJS features a dynamic internationalization system powered by the `i18n` engine, configured in [config/i18n.js](file:///Users/mugen/Documents/01_Projets/FabtrackJS/config/i18n.js) and orchestrated by [services/i18nService.js](file:///Users/mugen/Documents/01_Projets/FabtrackJS/services/i18nService.js).

### Architecture & Capabilities:
- **Default & Fallback Locale**: French (`fr`) is the reference language and fallback if a translation string is missing.
- **Dynamic Locale Discovery**: The platform dynamically scans the `locales/` directory for `*.json` files. When a new locale file is added, `i18n.refreshLocales()` registers it without requiring an application rewrite.
- **Language Detection & Persistence**:
  1. Cookie: `req.cookies.fabtrack_lang`
  2. URL Query Param: `?lang=<code>` (automatically updates the cookie)
  3. Header / Footer modal picker allows users to switch languages at any time.
- **Dynamic CSV Import & Auto-Creation**:
  - Exporting via CLI or Web creates a clean flattened CSV: `KEY,FR,EN,...`.
  - Adding a new column (e.g., `ES`, `DE`, `IT`) to `translations.csv` and importing it will automatically create `locales/es.json` (or corresponding language), parse nested dot-notation keys, and immediately make that language selectable across the platform.

### EJS Translation Pattern:
In templates, always use the global `__` translation helper with defensive checks:
```html
<!-- Simple key translation -->
<%= typeof __ !== 'undefined' ? __('nav.kiosk') : 'Kiosque' %>

<!-- Translation with variable interpolation -->
<%= typeof __ !== 'undefined' ? __('user.welcome', { name: user.firstname }) : `Bonjour ${user.firstname}` %>
```

### CLI Commands:
```bash
# Export all locale JSON files into translations.csv
npm run i18n:export

# Import translations.csv back into JSON locales and auto-create new languages
npm run i18n:import
```

---

## 8. Date & Time Formatting (dateService)

Date and time presentation is centralized through [services/dateService.js](file:///Users/mugen/Documents/01_Projets/FabtrackJS/services/dateService.js), ensuring uniform formatting that respects both the system's configured date preset and the user's active language locale.

### Configurable Date Presets:
Configured via General Settings (`date_format_preset`):
- `DD/MM/YYYY`: French / European (`JJ/MM/AAAA`)
- `YYYY-MM-DD`: ISO (`AAAA-MM-JJ`)
- `MM/DD/YYYY`: US Standard (`MM/JJ/AAAA`)
- `DD.MM.YYYY`: Swiss / German (`JJ.MM.AAAA`)
- `LL`: Long localized date (`14 septembre 2026` in FR / `September 14, 2026` in EN)

### Available Helpers on `res.locals`:
Middleware in `app.js` injects date helpers into every template:
- `formatDate(date, [presetKey])`: Formats date only according to the active setting.
- `formatDateTime(date, [presetKey])`: Formats date and time (`HH:mm`).
- `formatTime(date)`: Formats time only (`HH:mm`).

### Usage in EJS Templates:
```html
<span><%= formatDate(machine.createdAt) %></span>
<span><%= formatDateTime(reservation.startTime) %></span>
```

---

## 9. Email & Notification Subsystem

Automated emails are handled via `services/mailService.js` backed by `nodemailer`.

### Adding a New Automated Email Notification:
1. **Add default setting** in [services/settingsService.js](file:///Users/mugen/Documents/01_Projets/FabtrackJS/services/settingsService.js):
   ```javascript
   DEFAULT_SETTINGS = {
     // ...
     mail_notif_my_event: "true",
   };
   ```
2. **Add dispatch method** in [services/mailService.js](file:///Users/mugen/Documents/01_Projets/FabtrackJS/services/mailService.js):
   - Check `if (settings.mail_notif_my_event !== "true") return { skipped: true };`
   - Use `this.renderEmailLayout({...})` for consistent branding and responsive HTML.
   - Use `await this.sendMail({ to, subject, html })`.
3. **Add toggle switch & modal preview** in [views/admin/manage-emails.ejs](file:///Users/mugen/Documents/01_Projets/FabtrackJS/views/admin/manage-emails.ejs).
4. **Handle field in POST route** in [routes/admin/emails.js](file:///Users/mugen/Documents/01_Projets/FabtrackJS/routes/admin/emails.js).

---

## 10. File Uploads with Multer

Uploads are served statically via `/uploads` mapped to `uploads/`.

### Storage Pattern:
```javascript
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const targetDir = path.join(__dirname, "../../uploads/my_category");
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, targetDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `file-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (req, file, cb) => {
    // Validate extensions and mime types
  },
});
```

---

## 11. UI & Templating Guidelines (EJS & Bootstrap 5)

FabtrackJS uses server-side rendered EJS templates.

### Standard Page Layout:
```html
<!doctype html>
<html lang="fr" data-bs-theme="auto">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Title - <%= platformName %></title>
    <%- include('../includes/pagehead.html') %>
  </head>
  <body class="d-flex justify-content-center bg-body-tertiary py-4">
    <%- include('../includes/light-dark.html') %>

    <main class="main-container">
      <%- include('../includes/header.html') %>

      <!-- Page Content -->

      <%- include('../includes/footer.html') %>
    </main>
  </body>
</html>
```

### Visual & Component Standards:
- **Language**: Standard user interface copy must be written in **French** (labels, buttons, modal titles, error messages) and wrapped in i18n translation functions where dynamic localization is desired.
- **Pill Badges**: Use rounded pill badges (`rounded-pill px-2.5 py-1`) with soft semantic colors (`bg-primary-subtle text-primary border border-primary-subtle`).
- **Icons**: Use FontAwesome 6 icons (`fa-solid fa-...`).
- **Header Actions**: Action buttons in header use `.header-action-btn` and `.header-icon-circle`. Tooltips should be used for compact icon-only action bars.
- **Card Aesthetics**: Cards should feature subtle borders (`border-0 shadow-sm rounded-3` or `border rounded-3 bg-body`).

---

---

## 12. Input Validation Architecture (Zod & Middleware)

FabtrackJS uses [Zod](https://zod.dev/) for centralized, strictly typed request validation across both web forms and internal API routes via [middleware/validate.js](file:///Users/mugen/Documents/01_Projets/FabtrackJS/middleware/validate.js).

### Directory & Schema Organization (`schemas/`)
Validation schemas are modularized by domain in the `schemas/` directory and exported via `schemas/index.js`:
- `user.schema.js`: User creation (`createUserSchema`), profile updates (`updateUserSchema`), balance modifications (`creditSchema`).
- `equipment.schema.js`: Equipment inventory creation/editing (`createEquipmentSchema`) and borrow sessions (`borrowEquipmentSchema`).
- `history.schema.js`: Kiosk check-in/out (`rfidScanSchema`, `createVisitSchema`), activity logs, and loan restitution.
- `bug.schema.js`: Platform bug and feedback report submissions (`bugReportSchema`).
- `consumable.schema.js`: Stock replenishment, edits, and project consumption.
- `auth.schema.js`: Staff login (`loginSchema`), registration (`registerSchema`), and password resets.
- `issue.schema.js`: Public machine breakdown reports (`reportIssueSchema`).
- `warning.schema.js`: Disciplinary warnings (`createWarningSchema`).
- `api.schema.js`: RFID hardware scanners and AJAX endpoints.

### Middleware Helper Usage:
```javascript
const { validateBody, validateParams, validateQuery } = require("../../middleware/validate.js");
const { createEquipmentSchema } = require("../../schemas/equipment.schema.js");

// Applied to an Express route:
router.post(
  "/equipment/create",
  validateBody(createEquipmentSchema, {
    redirectUrl: "/admin/equipment",
    defaultMessage: "Erreur dans le formulaire d'équipement."
  }),
  asyncHandler(async (req, res) => {
    // req.body is now strictly validated, trimmed, and type-coerced!
  })
);
```

### Dual Error Handling Behavior:
- **Web Forms (`POST` from HTML forms)**:
  When validation fails, `validateBody` automatically formats errors using `formatZodErrors`, populates `req.session.notification = "Error: " + formattedErrors`, and redirects back (either to `options.redirectUrl` or `req.header('Referer')`).
- **REST / API Calls (`/api/*` or requests with `Accept: application/json`)**:
  Returns a standard HTTP `400 Bad Request` JSON payload:
  ```json
  {
    "success": false,
    "message": "Validation error",
    "errors": [
      { "field": "email", "message": "Email invalide" }
    ]
  }
  ```

### Design Guidelines for Schemas:
- **Coerce Numbers & Dates**: HTML forms submit strings. Always use `z.coerce.number()` or `z.coerce.date()` where numeric or temporal values are required.
- **Trim Strings**: Use `.trim()` on text fields to strip leading and trailing whitespace.
- **Defensive Against NaN**: In balance calculations, always enforce `z.coerce.number().refine(n => !isNaN(n), { message: "Montant invalide" })`.

---

## 13. Equipment Loan Lifecycle & Restitution

FabtrackJS provides end-to-end tracking for borrowed equipment (power tools, electronic instruments, accessories).

### Loan Flow:
1. **Borrowing Session**:
   - In the visitor kiosk (`/fabtrack`), when adding an activity modal (`views/includes/activity-modal.html`), the user selects an equipment item.
   - The user or mediator specifies a loan duration (`borrowDays`, default: 7 days).
   - Submitted to `POST /fabtrack/history` with `type: "BORROW"`.
   - Validated via `createBorrowSessionSchema`.
   - Controller computes expected return timestamp: `dateExpectedReturn = new Date(Date.now() + borrowDays * 86400000)`.
2. **Kiosk Visual Alert**:
   - In the active visitor list, users who currently hold unreturned equipment display a distinct hand-holding box icon (`fa-solid fa-hand-holding-box text-warning`) with an interactive tooltip.
3. **User Profile Section (`/users/edit/:id#loans`)**:
   - Displays complete active and past equipment loans.
   - Active loans feature an overdue badge if `dateExpectedReturn < new Date()`.
   - A quick restitution button triggers a confirmation modal (`views/fabtrack/edit-user.ejs`).
4. **Admin Equipment Supervision (`/admin/equipment`)**:
   - The equipment management table features dedicated KPI cards (Total items, In circulation, Overdue).
   - "Restituer" icon action button with confirmation modal triggers immediate return.
5. **Restitution Action**:
   - Route `POST /users/return-equipment/:historyId` or `POST /admin/equipment/return/:historyId`.
   - Updates the `History` entry: sets `dateEnd = new Date()`.
   - Marks the equipment as returned and removes kiosk alerts immediately.

---

## 14. Platform Bug & Feedback Reporting Workflow

FabtrackJS features an integrated bug and improvement reporting mechanism accessible to all users and administrators.

### Architectural Workflow:
1. **Trigger & Modal**:
   - Accessible from the top header navigation bar (`fa-solid fa-bug`) and user dropdown menu via [views/includes/bug-report-modal.html](file:///Users/mugen/Documents/01_Projets/FabtrackJS/views/includes/bug-report-modal.html).
   - Automatically pre-fills the reporter's name and email if logged in, and attaches `window.location.href` to trace the exact page where the issue occurred.
2. **Endpoint & Validation**:
   - Route: `POST /report-bug` in [routes/index.js](file:///Users/mugen/Documents/01_Projets/FabtrackJS/routes/index.js).
   - Validated via `bugReportSchema` in [schemas/bug.schema.js](file:///Users/mugen/Documents/01_Projets/FabtrackJS/schemas/bug.schema.js):
     - `category`: `"bug" | "ui" | "feature"`
     - `description`: String (minimum 10 characters)
     - `userEmail`: Valid email format
     - `currentUrl`: Optional string
3. **Email Dispatch**:
   - Calls `mailService.sendBugReportAlert(bugData)`.
   - Formats a branded HTML email layout including category badge, user message, page URL, and reporter contact details.
   - Respects notification setting `mail_notif_bug_report`.

---

## 15. Automated Testing Suite (npm test)

FabtrackJS includes an automated test suite based on [Jest](https://jestjs.io/) and [Supertest](https://github.com/ladjs/supertest).

### Test Directory Structure:
```
tests/
├── helpers/
│   ├── testDb.js             # Database setup, fixture creation, & transactional teardown
│   └── authHelper.js         # Supertest authenticated session mock generator
├── integration/              # Full HTTP request / database integration tests
│   ├── userCreation.test.js  # Account provisioning & duplicate email prevention
│   ├── balance.test.js       # Credit top-up, debit, and transaction isolation
│   ├── charterAndKiosk.test.js # Safety charter agreement & kiosk check-in access
│   ├── equipmentBorrow.test.js # Borrow sessions, expected return dates, & restitution
│   ├── validationMiddleware.test.js # Zod redirection, flash toasts, & API 400 responses
│   └── bugReport.test.js     # Bug reporting validation & admin email dispatch
└── unit/                     # Isolated unit tests
    ├── validation.test.js    # Schema validation, type coercion, and edge case assertions
    └── rfidPlugin.test.js    # RFID badge hook lifecycle and admission rules
```

### Running Tests:
```bash
# Execute the entire test suite sequentially
npm test

# Run a specific test suite
npx jest tests/integration/equipmentBorrow.test.js

# Run tests matching a specific description
npx jest -t "restitution"
```

### Writing Integration Tests Guidelines:
- **Clean Database Fixtures**: Always use helpers in `tests/helpers/testDb.js` (`createTestUser`, `createTestEquipment`, etc.) and ensure records are cleaned up in `afterAll()` or `afterEach()`.
- **Authenticate with Supertest**: Use `createAuthenticatedAgent(app, { role: 'admin' })` from `tests/helpers/authHelper.js` to simulate logged-in sessions without manual cookie handling.
- **Force Exit & Open Handles**: Jest runs with `--detectOpenHandles --forceExit` in `package.json` to handle Prisma database pools and asynchronous background tasks cleanly.

---

## 16. Platform Setup & Installation Architecture

FabtrackJS provides a unified setup workflow available as both a web wizard (`/setup`) and a terminal CLI script (`npm run setup`).

### Core Setup Service (`services/setupService.js`)
All installation logic is centralized in `setupService` to ensure 100% consistency across web and CLI:
- **Installation Detection (`checkIsInstalled()`)**:
  Verifies that at least one `Staff` member with role `"admin"` exists and the `SystemSetting` key `platform_installed === "true"`.
- **Essential Reference Seeding (`seedEssentialReferenceData(tx, lang)`)**:
  Populates baseline `usertype` (Étudiant, Enseignant, etc.), `projecttype` (Personnel, Académique, etc.), and `warningtype` records without injecting mock user data.
- **Transactional Execution (`runSetup(config)`)**:
  Within a single Prisma transaction:
  1. Hashes the administrator password with bcrypt (`saltRounds = 10`).
  2. Creates or updates the administrator `Staff` record (`role: "admin", approved: true`).
  3. Writes platform settings (`platform_name`, `default_language`, `currency_symbol`, `admin_email`, `platform_installed`).
  4. Creates user-specified `Workspace` records and links the admin's `lastWorkspaceId`.
  5. Seeds reference tables.
  6. Flushes settings memory cache.

### Web Setup Wizard (`routes/setup.js` & `views/setup/index.ejs`)
- **Auto-Redirection**: If `isInstalled` is `false`, any unauthenticated page request is automatically redirected to `/setup` by middleware in `app.js`.
- **Multi-Step Guided Form**:
  - Step 1: Admin Account (Username, Email, Password, Confirmation).
  - Step 2: Platform & Localization (Name, Subtitle, Language, Currency).
  - Step 3: Workspaces (Interactive tag adder + quick presets).
  - Step 4: Review & Final Confirmation.
- **Route Protection**: Once installed, subsequent `GET /setup` requests redirect to `/login` and `POST /setup` requests are rejected with `403 Forbidden`.

### Interactive CLI Tool (`scripts/setup.js` & `npm run setup`)
- Interactive terminal prompts with sensible defaults using `readline/promises`.
- Non-interactive flag support (`--quick` or `-y`) for continuous integration (CI) and automated container deployments.

---

## 17. AI Agent Verification & Troubleshooting Checklist

Before concluding any coding task, an AI agent must perform the following validation steps:

1. **Run Automated Test Suite**:
   ```bash
   npm test
   ```
   Ensure all test suites pass with 0 failures before deploying or committing changes.
2. **Verify JavaScript Syntax**:
   ```bash
   node -c path/to/modifiedFile.js
   ```
3. **Verify EJS Compilation**:
   Validate templates without running the full browser:
   ```bash
   node -e 'const ejs = require("ejs"); const fs = require("fs"); ejs.compile(fs.readFileSync("views/path/to/view.ejs", "utf8"), { filename: "views/path/to/view.ejs" });'
   ```
4. **Verify Database Sync**:
   If `prisma/schema.prisma` was modified:
   ```bash
   npx prisma db push
   ```
5. **Test Route Discovery & App Boot**:
   Ensure no unhandled exceptions during initialization:
   ```bash
   node -e 'require("./app.js"); console.log("App boots successfully");'
   ```
6. **Git Hygiene**:
   Run `git status` to verify that no temporary or unintended test artifacts remain unstaged or untracked.

