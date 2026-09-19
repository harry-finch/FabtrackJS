---
name: fabtrack-dev
description: >-
  Expert guide and workflow standards for FabtrackJS development, architecture, testing, and deployment.
  Activate this skill when modifying FabtrackJS backend routes, services, EJS templates, admin pages,
  Prisma database schemas, writing tests, or preparing git commits and deployment commands.
---

# FabtrackJS Development & Workflow Skill

This skill guides development on **FabtrackJS** (Fablab activity tracking platform).
For detailed deep-dives into the architecture, refer to [DEVELOPMENT.md](../../DEVELOPMENT.md).

---

## 1. Core Architecture & Stack

- **Runtime & Framework**: Node.js (v18+) with Express.js.
- **Database & ORM**: MariaDB / MySQL accessed via **Prisma ORM** (`@prisma/client`) with the `@prisma/adapter-mariadb` connection pool singleton defined in [`utilities/db.js`](../../utilities/db.js).
- **Service Layer**: Business logic belongs in [`services/`](../../services/) (`mailService.js`, `settingsService.js`, `dateService.js`, `i18nService.js`, `setupService.js`), not directly inside route controllers.
- **Validation**: Incoming HTTP requests must be validated using **Zod** schemas in [`schemas/`](../../schemas/) via [`middleware/validate.js`](../../middleware/validate.js).
- **Extensibility**: Features like RFID scanning, BookStack documentation, Repair Café, and Workshops are modular plugins in [`plugins/`](../../plugins/) orchestrated by [`core/HookManager.js`](../../core/HookManager.js).
- **Templating**: Server-rendered EJS templates in [`views/`](../../views/) with Bootstrap 5 and FontAwesome.
- **Reverse Proxy**: Deployed behind Nginx, supporting both root domains and subpaths (e.g. `/fabtrackjs/`).

---

## 2. Testing Guidelines (Pragmatic & Targeted)

Run the automated test suite **only when changes may impact functional behavior**:

### When to run tests:
- Modifications to backend routes (`routes/`).
- Modifications to business logic (`services/`).
- Changes to database models or queries (`prisma/`, `utilities/db.js`).
- Changes to authentication, session, or middleware (`middleware/`).
- Modifications to Zod validation schemas (`schemas/`).

### When NOT to run tests:
- Purely cosmetic or visual styling changes (CSS in `public/stylesheets/`, visual HTML tweaks without modifying form fields/actions).
- Updating documentation (`README.md`, `DEVELOPMENT.md`, comments).
- Updating static text or translations in locale files when no validation rules are changed.

### How to execute tests efficiently:
Prefer targeted test runs with `--forceExit` to prevent database handle hanging:
```bash
# Targeted unit tests (fastest)
npx jest tests/unit/ --forceExit

# Targeted integration test for a specific feature
npx jest tests/integration/charterAndKiosk.test.js --forceExit

# Full test suite (when doing major architectural changes)
npm test
```

---

## 3. Systematic Admin Cross-Verification Rule

Whenever a fix, improvement, or refactoring is applied to an admin view or controller:
**Systematically check if the same correction applies to the other admin pages!**

Key areas to cross-verify across `views/admin/*.ejs` and `routes/admin/*.js`:
1. **Back Buttons & Breadcrumbs**: Verify that `<a href="/admin/<feature>/manage">` points to the actual route and not a non-existent parent route (avoiding 404s).
2. **Form Accessibility & Labels**: Ensure every form `<input id="XYZ">` has a matching `<label for="XYZ">`.
3. **Session Flash Notifications**: Ensure `req.session.notification` and `clearNotification` middleware are present on GET views.
4. **Delete Confirmations**: Ensure destructive actions have `onclick="return confirm('...');"` or modal confirmations.
5. **Base URL Handling**: Use relative or `getAppBaseUrl()`-aware paths for links and AJAX requests.

---

## 4. Reverse Proxy & URL Path Rules

FabtrackJS is commonly deployed behind an Nginx reverse proxy under a subpath (e.g. `https://domain.org/fabtrackjs/`):

1. **Email Links**:
   Always use `mailService.resolveBaseUrl()` (which prioritizes `HOSTURL` from `.env`). Never rely solely on `req.get("host")`.
2. **Client-side Fetch / AJAX**:
   Always wrap API URLs with `window.getAppBaseUrl(...)` (defined in `views/includes/pagehead.html`), for example:
   ```javascript
   const url = window.getAppBaseUrl ? window.getAppBaseUrl("api/my-endpoint") : "/api/my-endpoint";
   fetch(url);
   ```
3. **Relative HTML Assets**:
   Do not hardcode leading slashes for assets that rely on `<base href>` in `views/includes/pagehead.html`.

---

## 5. Mandatory Deployment Checklist

At the end of **every** intervention that alters project files, systematically provide the user with the exact list of terminal commands to commit and deploy the changes:

```bash
# 1. Stage and commit changes
git add <modified_file_1> <modified_file_2>
git commit -m "<conventional_commit_message>"
git push

# 2. Deploy on remote server
git pull
npm install --omit=dev   # Only if package.json dependencies changed
pm2 restart fabtrack     # Or the appropriate systemd/process manager
```
