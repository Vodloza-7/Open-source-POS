# Open-Source POS — Developer Map

## 1) System Overview
- **Frontend app shell (SPA):** `public/index.html` + `public/app.js`
- **Routing/navigation:** `public/js/router.js`
- **Auth/session (browser-side):** `public/js/login.js`, `public/js/auth.js`
- **API client:** `public/js/api.js`
- **Main backend API server (active):** `server.js`
- **Active database config (Node API):** `config/server.config.js`
- **Primary active DB:** XAMPP/MySQL (configured in `config/server.config.js`)

## 2) Main Pages and Their Files
- **Login Page**
  - UI: `public/pages/login.html`
  - Logic: `public/js/login.js`
- **POS Page**
  - UI: `public/pages/pos.html`
  - Logic: `public/js/pos.js`
- **Products Management Page**
  - UI: `public/pages/products.html`
  - Logic: `public/js/products.js`
- **Sales History Page**
  - UI: `public/pages/sales.html`
  - Logic: `public/js/sales.js`
- **Admin Dashboard**
  - UI: `public/pages/admin.html`
  - Logic: `public/js/admin.js`

## 3) Where to Edit by Feature

### Authentication and Access Security
- Login flow and redirect behavior: `public/js/login.js`
- User session storage (current logged-in user): `public/js/auth.js`
- Route restrictions (protect pages after login): `public/js/router.js`
- Login/register backend endpoints: `server.js` (`/api/login`, `/api/register`)

### POS Sales Flow
- Cart, checkout, barcode scan, receipt, payment handling: `public/js/pos.js`
- POS page structure/modals/buttons: `public/pages/pos.html`
- Sale creation endpoint + stock deduction + transaction save: `server.js` (`/api/sales`)

### Products and Stock
- Product form/table/edit/delete actions: `public/js/products.js`
- Product management page fields (including cost price): `public/pages/products.html`
- Admin stock adjustment panel (add/remove/view stock): `public/pages/admin.html`, `public/js/admin.js`
- Backend stock/product endpoints: `server.js`
  - `/api/products`
  - `/api/products/:id`
  - `/api/products/:id/stock`
  - `/api/stock/adjust`

### Currency and Tax Settings
- Admin currency + tax UI: `public/pages/admin.html`
- Save/load of settings (including tax percent): `public/js/admin.js`
- POS tax calculation usage: `public/js/pos.js`

### Reports, Audit Trail, Email
- Report UI + preview/download/email actions: `public/pages/admin.html`, `public/js/admin.js`
- Report API endpoints (sales by cashier, audit trail, cash sales, end-of-day profit): `server.js` (`/api/reports`)
- Email send endpoint for reports: `server.js` (`/api/reports/email`)
- Audit logging writes (what happened + when): `server.js` (`logAudit(...)` + `audit_logs` table)

### Database Connection Management (XAMPP)
- Admin DB settings panel UI (host/port/db/user/password): `public/pages/admin.html`
- DB settings logic (save/test/restart): `public/js/admin.js`
- API endpoints for DB settings: `server.js`
  - `/api/admin/connection-settings`
  - `/api/admin/connection-settings/test`
  - `/api/admin/restart`
- Runtime config file written by admin panel: `config/server.config.js`

## 4) Active Database Tables (XAMPP/MySQL)
Defined/managed by `server.js` startup logic:
- `users`
- `products`
- `sales`
- `sale_items`
- `transactions`
- `notifications`
- `audit_logs`
- `sales_usd`
- `sales_zar`
- `sales_zig`

## 5) Legacy/Secondary Files (Not the primary runtime path)
- Legacy JSON files (historical/fallback data):
  - `db/users.json`
  - `db/products.json`
  - `db/sales.json`
  - `db/notifications.json`
- Legacy PHP path (exists but not primary active flow):
  - `api/` (PHP scripts)
  - `config/database.php`

## 6) Quick Start for Editing Safely
1. Edit matching UI file in `public/pages/*.html`.
2. Edit matching page/module logic in `public/js/*.js`.
3. If data/API is involved, update `server.js` endpoint and DB query.
4. If connection behavior changes, update `config/server.config.js` handling.
5. Start server and verify:
   - `npm.cmd start`
   - Open Admin/POS and test the changed flow end-to-end.

## 7) Useful Commands
- Install deps: `npm.cmd install`
- Run server: `npm.cmd start`
- Dev mode: `npm.cmd run dev`

---
If a feature spans UI + API + DB, always trace these 3 files first:
1. `public/pages/<page>.html`
2. `public/js/<module>.js`
3. `server.js`
