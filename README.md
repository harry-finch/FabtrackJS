# FabtrackJS

FabtrackJS is a modern, open-source platform designed to track user activity, projects, equipment, and consumables inventory in fablabs and makerspaces. Built with Node.js, Express, MySQL, and Prisma ORM, it provides a clean, modular, and extensible architecture tailored for fablab managers, staff, and visitors.

---

## Table of Contents

- [Background](#background)
- [Key Features](#key-features)
- [Screenshots & Interface Preview](#screenshots--interface-preview)
- [Security Features](#security-features)
- [Plugins System](#plugins-system)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Automated Testing](#automated-testing)
- [Architecture & Tech Stack](#architecture--tech-stack)
- [Maintainers & License](#maintainers--license)

---

## Background

Initially developed in PHP/MySQL for the [Sorbonne University Fablab](https://fablab.sorbonne-universite.fr), FabtrackJS was rewritten from scratch in Node.js and Express to be modular, robust, and adaptable to any fablab, makerspace, or shared workshop.

I built the first two thirds of this version in 2023 with little to no AI-help. I then left the project on hold for 2 years and came back in 2026 to finish it with the help of the Antigravity IDE and Gemini 3.8 Flash.  

---

## Key Features

### 👥 User & Visitor Tracking
- Fast user check-in / check-out kiosk (`/fabtrack`) for daily visits.
- Detailed user profiles with usage statistics, activity history, and project affiliations.
- Disciplinary warnings system with categorization and admin email alerts.
- RFID reader integration for automated contactless badge scanning.

### 🛠️ Machine & Equipment Inventory
- Machine catalog with specifications, documentation links, locations, warranty dates, and maintenance tracking.
- Machine usage logs linked to users and projects.
- **Machine Incident & Breakdown Reporting** (`/report-issue`):
  - Completely public, mobile-first responsive reporting page accessible by anyone without login.
  - Smartphone camera button (`capture="environment"`) to directly photograph broken parts or error screens.
  - Pre-selection support via QR codes (`/report-issue/:machineId`).
  - Integrated directly into the machine's administrative history (`/admin/machines/view/:id#issues`).
  - Admin intervention workflow: mark as resolved with technical notes, reopen, or delete.
- **Equipment Loans & Restitution Tracking** (`/admin/equipment` & user profiles):
  - Loan duration configuration in days (default 7 days) with automated calculation of expected return dates.
  - Kiosk visual badge indicators (`fa-hand-holding-box`) alerting staff when a checked-in user holds unreturned equipment.
  - User profile loan section (`/users/edit/:id#loans`) with quick restitution confirmation modal.
  - Centralized admin supervision table displaying active loans, borrower names, checkout timestamps, overdue status highlights, and one-click return confirmation.

### 📦 Consumables & Stock Management
- Consumable inventory tracking with custom units (grams, meters, liters, units).
- Low stock threshold monitoring with automated email notifications to administrators.
- Project material consumption tracking and cost calculation.

### 🏢 Workspace & Category Organization
- Multi-workspace support (e.g. 3D printing lab, electronics lab, wood shop).
- Fast workspace switcher for multi-room fablabs.
- Equipment categorization by workspace.

### 📧 Automated Email & Notification Center (`/admin/emails`)
- Full SMTP configuration dashboard with live STARTTLS / direct SSL support.
- Live test email utility to verify SMTP settings.
- Independent notification toggles:
  - Consumable low-stock alerts.
  - User warning notifications.
  - Staff registration requests.
  - User safety charter & agreement activation links.
  - Machine breakdown & incident alerts.
  - Platform bug & feedback reports.
- Live visual previews of email templates in the admin interface.

### 🐛 Platform Bug & Feedback Reporting
- Direct reporting modal accessible from any page via the top navigation bar (`fa-bug`) and user dropdown menu.
- Categorized submissions (Bug / Defect, UI / Ergonomics, Feature Request).
- Automatic capture of the current page URL and user contact information.
- Sends instant structured HTML alert emails directly to the system administrator.

### 🌐 Internationalization (i18n) & Dynamic Translation
- Native multilingual support with dynamic locale detection.
- Fast language switcher in the bottom-right corner displaying flags and native names.
- **Dynamic CSV Export & Import Workflow** (`/admin/settings`):
  - Export all platform strings into a clean, UTF-8 BOM encoded spreadsheet (`translations.csv`) compatible with Microsoft Excel, LibreOffice, and Google Sheets.
  - Re-import updated translations directly through the web UI or CLI (`npm run i18n:import`).
  - **Automatic Language Creation**: adding a new column (e.g. `ES`, `DE`, `IT`) to the CSV automatically creates the corresponding language files and registers it throughout the entire platform.
  - Safe fallback system: untranslated phrases automatically fallback to French without breaking layouts.

### 🎨 Customizable Branding & Regional Settings (`/admin/settings`)
- Custom platform name and subtitle.
- Logo and favicon upload with automatic SVG/PNG/ICO handling.
- **Configurable Date Display Format**:
  - `JJ/MM/AAAA` (French standard — default)
  - `AAAA-MM-JJ` (ISO 8601 standard)
  - `MM/JJ/AAAA` (US standard)
  - `JJ.MM.AAAA` (Swiss / German standard)
  - `Format long` (e.g., 13 septembre 2026)
  - Synchronized with French and English locales across all histories, profiles, and logs.
- Dynamic session expiration timeout.
- Configurable currency symbol (€, $, CHF, etc.).
- Configurable project type mappings for specialized plugins.

---

## Screenshots & Interface Preview

### 1. Visitor Check-in Kiosk (`/fabtrack`)
The main daily interface used by visitors and mediators to register entry, associate projects, and test RFID contactless badges. Features direct access to report issues and the admin panel in the top-right header.

![Kiosk Dashboard](docs/screenshots/01-kiosk-dashboard.png)

---

### 2. Central Administration Hub (`/admin`)
The modular administrative dashboard organizing analytics, history, consumables, communications, academic billing, and extensible plugins (BookStack, Repair Café, Workshops).

![Admin Hub](docs/screenshots/02-admin-dashboard.png)

---

### 3. Machine Details & Breakdown History (`/admin/machines/view/:id`)
Comprehensive machine tracking including technical specifications, warranty dates, location, documentation, and the **Incidents & Pannes signalées** resolution tracker.

![Machine Details & Issues](docs/screenshots/03-machine-view.png)

---

### 4. Public Issue & Breakdown Reporting (`/report-issue`)
A completely public, mobile-first responsive reporting page allowing visitors or mediators to describe an issue, select a machine, and directly snap a photo with their smartphone camera (`capture="environment"`).

![Public Breakdown Reporting](docs/screenshots/04-report-issue.png)

---

### 5. Automated Email & Notification Center (`/admin/emails`)
Centralized management of the SMTP delivery server with live testing and customizable automatic notifications (low stock, user warnings, staff accounts, machine breakdowns) with template previews.

![Email & Notification Settings](docs/screenshots/05-email-settings.png)

---

## Security Features

FabtrackJS implements rigorous security practices:

- **Strict Schema-Based Input Validation**: All form submissions and API endpoints are strictly validated and sanitized using [Zod](https://zod.dev/) schemas (`schemas/`). Features automatic type coercion, whitespace trimming, email normalization, and strict NaN protection on balance transactions. Form submissions redirect back with user-friendly flash error toasts, while API calls receive standard `400 Bad Request` JSON payloads (`middleware/validate.js`).
- **HTTP Security Headers**: Enforced with [Helmet](https://helmetjs.github.io/) including Content Security Policy (CSP), frame protection, and HSTS.
- **Password Security**: Strong bcrypt password hashing (10 salt rounds) for staff accounts.
- **Role-Based Access Control (RBAC)**: Distinct permissions for `admin`, `staff`, and `user` (mediator) with dedicated route protection middleware (`isAdmin`, `isAuthenticated`).
- **Anti-Bot Honeypot**: Protection against automated form submissions on registration endpoints.
- **Secure Password Reset**: Cryptographically secure UUID reset tokens with short expiration times and one-time use invalidation.
- **Secure File Uploads**: File size limits, strict MIME-type and extension validation with [Multer](https://github.com/expressjs/multer), and random unique filenames to eliminate directory traversal risks.
- **Input Sanitization & Error Handling**: Centralized asynchronous error handling (`asyncHandler`) and error isolation to prevent database credential leaks.

---

## Plugins System

FabtrackJS features an extensible plugin architecture built on an asynchronous hook manager (`core/HookManager.js`):

- **BookStack Wiki Plugin** (`plugins/bookstackPlugin.js`):
  - Integrates with the BookStack documentation platform.
  - Automatically pre-fills project documentation URLs.
  - Checks if documentation has been updated since the user's last visit.
  - Displays dynamic green/red status indicators.
  - Admin dashboard displaying API metrics and documentation compliance rates.
- **Repair Café Plugin** (`plugins/repairCafePlugin.js`):
  - Specialized workflow for community Repair Café events.
  - Dynamic form fields for repaired items and diagnostic notes.
  - Post-visit resolution modal tracking whether items were successfully repaired.
  - Statistics dashboard showing repair rates, visitor counts, and success metrics.
- **Workshop (Ateliers) Plugin** (`plugins/workshopPlugin.js`):
  - Tracks user registrations, interests, and completions of training workshops.
  - Automatically awards badges and unlocks machine access permissions upon workshop completion.
- **Academic / Teaching Units (UE) Plugin** (`plugins/uePlugin.js`):
  - Student project tracking and billing integration for university courses.
- **Borne RFID Plugin** (`plugins/rfidPlugin.js`):
  - Contactless badge-in/out integration for quick kiosk identification.

---

## Prerequisites

- [Node.js](https://nodejs.org/) (v18.x or v20.x recommended)
- [npm](https://www.npmjs.com/) (v9 or higher)
- [MySQL](https://www.mysql.com/) server (v5.7, v8.0 or MariaDB equivalent)
- Git

---

## Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/harry-finch/FabtrackJS.git
   cd FabtrackJS
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment variables**:
   Create a `.env` file in the root directory (or copy `.env.example` if available):
   ```env
   # Database connection string
   DATABASE_URL="mysql://username:password@localhost:3306/fabtrack"

   # Session Secret & Expiration (milliseconds)
   SECRET="your-strong-random-session-secret"
   SESSION_DURATION=86400000

   # Server Port
   PORT=3000
   HOSTURL="http://localhost:3000"

   # Default Admin Email (fallback)
   ADMIN="admin@example.com"
   MAILFROM="Fabtrack <noreply@fabtrack.local>"

   # SMTP Credentials (optional, can also be configured in Admin UI)
   HOST="smtp.example.com"
   PORT="587"
   USR="smtp-user"
   PASSWD="smtp-password"
   ```

4. **Initialize Database Schema with Prisma**:
   ```bash
   # Push schema directly to your MySQL database
   npx prisma db push

   # Seed initial reference data and admin account
   npx prisma db seed
   ```

---

## Usage

### Development Mode (with automatic restart)
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

Access the application in your browser at `http://localhost:3000`.

- **Admin Account**: `admin` / `admin` (or credentials created during seed)
- **Mediator Account**: `mediateur` / `mediateur`
- **Public Reporting**: `http://localhost:3000/report-issue`

---

## Automated Testing

FabtrackJS includes a comprehensive automated test suite powered by [Jest](https://jestjs.io/) and [Supertest](https://github.com/ladjs/supertest), covering both unit logic and end-to-end integration flows.

```bash
# Run the entire test suite
npm test

# Run a specific integration or unit test file
npx jest tests/integration/equipmentBorrow.test.js
npx jest tests/unit/validation.test.js
```

### Test Coverage Highlights
- **User Creation & Duplicate Protection**: Account provisioning, default charter state, unique email enforcement (`tests/integration/userCreation.test.js`).
- **Balance & Transaction Logic**: User balance top-ups, debiting, and zero/negative balance handling (`tests/integration/balance.test.js`).
- **Safety Charter & Kiosk Access**: Access rules, badge scan enforcement, and charter agreement workflows (`tests/integration/charterAndKiosk.test.js`).
- **Equipment Borrowing & Restitution**: Loan creation with loan duration, expected return dates, user profile restitution, and admin supervision (`tests/integration/equipmentBorrow.test.js`).
- **Input Validation Middleware**: Zod form redirection with flash errors, API 400 responses, and NaN prevention (`tests/integration/validationMiddleware.test.js`).
- **Bug Reporting Flow**: Submission validation and administrative email dispatch (`tests/integration/bugReport.test.js`).
- **RFID Scanner Plugin & Hooks**: Badge check-in, check-out, and charter status enforcement (`tests/unit/rfidPlugin.test.js`).
- **Zod Schema Unit Tests**: Schema isolation, type coercion, and edge case input sanitization (`tests/unit/validation.test.js`).

---

## Architecture & Tech Stack

| Layer | Technology |
|---|---|
| **Runtime** | Node.js |
| **Framework** | Express.js |
| **Database** | MySQL |
| **ORM** | Prisma ORM (v5.22+) |
| **Input Validation** | Zod (v4) + Custom Validation Middleware |
| **Testing Suite** | Jest + Supertest |
| **Template Engine** | EJS |
| **CSS & Components** | Bootstrap 5, FontAwesome 6 |
| **Authentication** | Express Session + Bcrypt |
| **Localization (i18n)** | node-i18n + Dynamic CSV Engine |
| **Date & Time** | Moment.js + Centralized DateService |
| **File Uploads** | Multer |
| **Email Delivery** | Nodemailer |
| **Security** | Helmet, CSRF/Honeypot, CSP, Zod Sanitization |

---

## Maintainers & License

- Original Author: Stéphane Muller
- Current Repository: [harry-finch/FabtrackJS](https://github.com/harry-finch/FabtrackJS)
- Licensed under [Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)](https://creativecommons.org/licenses/by-nc-sa/4.0/) or [MIT](LICENSE) where applicable.
