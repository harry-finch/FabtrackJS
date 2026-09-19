# FabtrackJS Operational Rules

## 1. Automated Testing Policy
- Run unit and integration tests (`npx jest ...` or `npm test`) ONLY when changes modify functional logic, routes, database access, authentication, or input validation.
- DO NOT run tests for cosmetic/visual changes (CSS, layout adjustments, pure text/translation changes, documentation updates).
- Prefer targeted test runs with `--forceExit` (e.g. `npx jest tests/unit/ --forceExit` or `npx jest tests/integration/<test>.test.js --forceExit`).

## 2. Admin Pages Cross-Verification
- Whenever fixing or improving an admin view (`views/admin/*.ejs`) or controller (`routes/admin/*.js`), systematically verify if the same pattern or bug exists in other admin pages (back buttons, label/input bindings, flash notifications, delete confirmations, routing prefixes).

## 3. Reverse Proxy & URL Resolution
- Always use `mailService.resolveBaseUrl()` for email links (prioritizing `process.env.HOSTURL`).
- Always use `window.getAppBaseUrl(...)` for client-side API `fetch()` calls to support subpath deployments (e.g. `/fabtrackjs/`).

## 4. Mandatory Deployment Commands
- At the end of every code modification turn, systematically provide the user with the exact terminal command sequence to stage, commit, push, pull on server, and restart the process.
