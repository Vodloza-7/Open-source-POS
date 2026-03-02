const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mysql = require('mysql2/promise');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const config = require('./config/server.config');

const app = express();
const PORT = config.app.port;
const DB_HOST = config.db.host;
const DB_PORT = config.db.port;
const DB_USER = config.db.user;
const DB_PASSWORD = config.db.password;
const DB_NAME = config.db.name;
const SMTP_HOST = config.smtp.host;
const SMTP_PORT = config.smtp.port;
const SMTP_USER = config.smtp.user;
const SMTP_PASS = config.smtp.pass;
const SMTP_FROM = config.smtp.from;
const CONFIG_FILE_PATH = path.join(__dirname, 'config', 'server.config.js');
const LEGACY_USERS_FILE_PATH = path.join(__dirname, 'db', 'users.json');
const SERVER_STARTED_AT = new Date();
let pool;

const PERMISSION_CATALOG = [
  { key: 'customer_transactions', label: 'Customer Transactions' },
  { key: 'manage_sales_orders', label: 'Manage Sales Orders' },
  { key: 'add_users', label: 'Add Users' },
  { key: 'delete_users', label: 'Delete Users' },
  { key: 'alter_inventory', label: 'Alter Inventory' },
  { key: 'manage_user_permissions', label: 'Manage User Roles & Permissions' },
  { key: 'manage_company_settings', label: 'Manage Company Parameters' },
  { key: 'edit_receipt_format', label: 'Edit Receipt Format' }
];

const ROLE_DEFAULT_PERMISSIONS = {
  admin: PERMISSION_CATALOG.map(item => item.key),
  manager: ['customer_transactions', 'manage_sales_orders', 'alter_inventory'],
  supervisor: ['customer_transactions', 'manage_sales_orders'],
  cashier: ['customer_transactions']
};

const ALLOWED_ROLES = Object.keys(ROLE_DEFAULT_PERMISSIONS);
const ALLOWED_CURRENCIES = ['USD', 'ZAR', 'ZIG'];
const PAYMENT_METHOD_ALIASES = {
  cash: 'cash',
  ecocash: 'ecocash',
  mobile: 'ecocash',
  card: 'card',
  wallet: 'wallet'
};

const DEFAULT_RECEIPT_SETTINGS = {
  companyName: '',
  companyAddress: '',
  vatNumber: '',
  tinNumber: '',
  receiptHeader: '',
  receiptFooter: 'Thank you for your purchase',
  receiptExtra: '',
  showCompanyDetails: true,
  showCashier: true,
  showDateTime: true
};

const DEFAULT_COMPANY_PROFILE = {
  legalName: 'Impartial Enterprises',
  tradingName: 'Impartial Enterprises POS',
  edition: 'Company Edition',
  supportPhone: '+263 77 000 0000',
  supportEmail: '',
  website: '',
  addressLine: '',
  city: '',
  country: '',
  vatNumber: '',
  tinNumber: '',
  registrationNumber: ''
};

function normalizeRole(role) {
  const value = String(role || '').trim().toLowerCase();
  if (ALLOWED_ROLES.includes(value)) return value;
  return 'cashier';
}

function getDefaultPermissionsForRole(role) {
  const normalizedRole = normalizeRole(role);
  return [...(ROLE_DEFAULT_PERMISSIONS[normalizedRole] || ROLE_DEFAULT_PERMISSIONS.cashier)];
}

function normalizePermissions(permissions, role) {
  const defaults = getDefaultPermissionsForRole(role);
  if (!Array.isArray(permissions) || permissions.length === 0) {
    return defaults;
  }

  const validPermissions = new Set(PERMISSION_CATALOG.map(item => item.key));
  const selected = permissions
    .map(item => String(item || '').trim())
    .filter(item => validPermissions.has(item));

  if (selected.length === 0) return defaults;
  return [...new Set(selected)];
}

function parsePermissionsField(value, role) {
  if (!value) {
    return getDefaultPermissionsForRole(role);
  }

  try {
    const parsed = JSON.parse(value);
    return normalizePermissions(parsed, role);
  } catch (error) {
    return getDefaultPermissionsForRole(role);
  }
}

function serializePermissions(permissions, role) {
  return JSON.stringify(normalizePermissions(permissions, role));
}

function mapUserRow(row) {
  const role = normalizeRole(row.role);
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    role,
    permissions: parsePermissionsField(row.permissions_json, role),
    created_at: row.created_at
  };
}

async function ensureAdminActor(req) {
  const actorRole = normalizeRole(req.body?.actorRole || req.query?.actorRole || '');
  const actorId = Number(req.body?.actorId || req.query?.actorId || 0);

  if (actorRole !== 'admin' || !Number.isFinite(actorId) || actorId <= 0) {
    return false;
  }

  const [rows] = await pool.query(
    'SELECT id FROM users WHERE id = ? AND role = ? LIMIT 1',
    [actorId, 'admin']
  );

  return Boolean(rows[0]);
}

function sanitizeAuditPayload(payload = {}) {
  const clone = { ...payload };
  if (Object.prototype.hasOwnProperty.call(clone, 'password')) {
    clone.password = '***';
  }
  return clone;
}

async function logAudit(eventType, actor, details = {}) {
  try {
    await pool.query(
      'INSERT INTO audit_logs (event_type, actor, details_json) VALUES (?, ?, ?)',
      [eventType, actor || 'system', JSON.stringify(sanitizeAuditPayload(details))]
    );
  } catch (error) {
    console.error('Audit log write failed:', error.message);
  }
}

function getEmailTransport() {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return null;
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    }
  });
}

function toIsoDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function normalizePort(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < 1 || parsed > 65535) return fallback;
  return Math.round(parsed);
}

function normalizeText(value, fallback = '') {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : fallback;
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  return fallback;
}

function normalizePaymentMethod(value) {
  const key = String(value || '').trim().toLowerCase();
  if (!key) return 'cash';
  return PAYMENT_METHOD_ALIASES[key] || key;
}

function roundMoney(value) {
  const num = Number(value) || 0;
  return Math.round(num * 100) / 100;
}

function normalizeLongText(value, fallback = '', maxLength = 500) {
  if (typeof value !== 'string') return fallback;
  return value.trim().slice(0, maxLength);
}

function getClientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',').map(item => item.trim()).filter(Boolean);
  if (forwarded.length) return forwarded[0].slice(0, 100);

  const remote = req.socket?.remoteAddress || req.connection?.remoteAddress || req.ip || '';
  return String(remote || '').slice(0, 100);
}

function mapCompanyProfileRow(row = {}) {
  return {
    legalName: String(row.legal_name || DEFAULT_COMPANY_PROFILE.legalName),
    tradingName: String(row.trading_name || DEFAULT_COMPANY_PROFILE.tradingName),
    edition: String(row.edition || DEFAULT_COMPANY_PROFILE.edition),
    supportPhone: String(row.support_phone || DEFAULT_COMPANY_PROFILE.supportPhone),
    supportEmail: String(row.support_email || DEFAULT_COMPANY_PROFILE.supportEmail),
    website: String(row.website || DEFAULT_COMPANY_PROFILE.website),
    addressLine: String(row.address_line || DEFAULT_COMPANY_PROFILE.addressLine),
    city: String(row.city || DEFAULT_COMPANY_PROFILE.city),
    country: String(row.country || DEFAULT_COMPANY_PROFILE.country),
    vatNumber: String(row.vat_number || DEFAULT_COMPANY_PROFILE.vatNumber),
    tinNumber: String(row.tin_number || DEFAULT_COMPANY_PROFILE.tinNumber),
    registrationNumber: String(row.registration_number || DEFAULT_COMPANY_PROFILE.registrationNumber),
    updatedAt: row.updated_at || null
  };
}

function sanitizeCompanyProfilePayload(payload = {}, current = DEFAULT_COMPANY_PROFILE) {
  return {
    legalName: normalizeLongText(payload.legalName, current.legalName || DEFAULT_COMPANY_PROFILE.legalName, 255),
    tradingName: normalizeLongText(payload.tradingName, current.tradingName || DEFAULT_COMPANY_PROFILE.tradingName, 255),
    edition: normalizeLongText(payload.edition, current.edition || DEFAULT_COMPANY_PROFILE.edition, 120),
    supportPhone: normalizeLongText(payload.supportPhone, current.supportPhone || DEFAULT_COMPANY_PROFILE.supportPhone, 80),
    supportEmail: normalizeLongText(payload.supportEmail, current.supportEmail || DEFAULT_COMPANY_PROFILE.supportEmail, 180),
    website: normalizeLongText(payload.website, current.website || DEFAULT_COMPANY_PROFILE.website, 255),
    addressLine: normalizeLongText(payload.addressLine, current.addressLine || DEFAULT_COMPANY_PROFILE.addressLine, 255),
    city: normalizeLongText(payload.city, current.city || DEFAULT_COMPANY_PROFILE.city, 120),
    country: normalizeLongText(payload.country, current.country || DEFAULT_COMPANY_PROFILE.country, 120),
    vatNumber: normalizeLongText(payload.vatNumber, current.vatNumber || DEFAULT_COMPANY_PROFILE.vatNumber, 100),
    tinNumber: normalizeLongText(payload.tinNumber, current.tinNumber || DEFAULT_COMPANY_PROFILE.tinNumber, 100),
    registrationNumber: normalizeLongText(payload.registrationNumber, current.registrationNumber || DEFAULT_COMPANY_PROFILE.registrationNumber, 120)
  };
}

function mapLoginSessionRow(row = {}) {
  return {
    id: Number(row.id) || 0,
    userId: Number(row.user_id) || 0,
    username: String(row.username || ''),
    userName: String(row.user_name || ''),
    role: normalizeRole(row.user_role || ''),
    ipAddress: String(row.ip_address || ''),
    deviceName: String(row.device_name || 'Unknown Device'),
    userAgent: String(row.user_agent || ''),
    isActive: Boolean(row.is_active),
    loginAt: row.login_at || null,
    lastSeenAt: row.last_seen_at || null,
    logoutAt: row.logout_at || null
  };
}

function mapReceiptSettingsRow(row = {}) {
  return {
    companyName: String(row.company_name || ''),
    companyAddress: String(row.company_address || ''),
    vatNumber: String(row.vat_number || ''),
    tinNumber: String(row.tin_number || ''),
    receiptHeader: String(row.receipt_header || ''),
    receiptFooter: String(row.receipt_footer || DEFAULT_RECEIPT_SETTINGS.receiptFooter),
    receiptExtra: String(row.receipt_extra || ''),
    showCompanyDetails: Boolean(row.show_company_details),
    showCashier: Boolean(row.show_cashier),
    showDateTime: Boolean(row.show_datetime),
    updatedAt: row.updated_at || null
  };
}

function sanitizeReceiptSettingsPayload(payload = {}, current = DEFAULT_RECEIPT_SETTINGS) {
  return {
    companyName: normalizeText(payload.companyName, current.companyName || '').slice(0, 255),
    companyAddress: normalizeText(payload.companyAddress, current.companyAddress || '').slice(0, 255),
    vatNumber: normalizeText(payload.vatNumber, current.vatNumber || '').slice(0, 100),
    tinNumber: normalizeText(payload.tinNumber, current.tinNumber || '').slice(0, 100),
    receiptHeader: normalizeText(payload.receiptHeader, current.receiptHeader || '').slice(0, 255),
    receiptFooter: normalizeText(payload.receiptFooter, current.receiptFooter || DEFAULT_RECEIPT_SETTINGS.receiptFooter).slice(0, 255),
    receiptExtra: typeof payload.receiptExtra === 'string'
      ? payload.receiptExtra.trim().slice(0, 2000)
      : (current.receiptExtra || ''),
    showCompanyDetails: normalizeBoolean(payload.showCompanyDetails, current.showCompanyDetails),
    showCashier: normalizeBoolean(payload.showCashier, current.showCashier),
    showDateTime: normalizeBoolean(payload.showDateTime, current.showDateTime)
  };
}

async function getActorRecord(req) {
  const actorId = Number(req.body?.actorId || req.query?.actorId || 0);
  if (!Number.isFinite(actorId) || actorId <= 0) return null;

  const [rows] = await pool.query(
    'SELECT id, role, permissions_json FROM users WHERE id = ? LIMIT 1',
    [actorId]
  );

  const actor = rows[0];
  if (!actor) return null;

  const role = normalizeRole(actor.role);
  return {
    id: actor.id,
    role,
    permissions: parsePermissionsField(actor.permissions_json, role)
  };
}

async function ensureActorHasPermissions(req, permissionKeys = []) {
  const actor = await getActorRecord(req);
  if (!actor) return false;
  if (actor.role === 'admin') return true;

  const required = Array.isArray(permissionKeys)
    ? permissionKeys.map(key => String(key || '').trim()).filter(Boolean)
    : [];

  if (required.length === 0) return false;
  return required.every(key => actor.permissions.includes(key));
}

async function addColumnIfMissing(tableName, columnDefinition) {
  try {
    await pool.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnDefinition}`);
  } catch (error) {
    if (error.code !== 'ER_DUP_FIELDNAME') {
      throw error;
    }
  }
}

async function addIndexIfMissing(tableName, indexName, indexDefinition) {
  try {
    await pool.query(`ALTER TABLE ${tableName} ADD INDEX ${indexName} (${indexDefinition})`);
  } catch (error) {
    if (error.code !== 'ER_DUP_KEYNAME') {
      throw error;
    }
  }
}

function getCurrentConnectionSettings() {
  return {
    app: {
      port: PORT
    },
    db: {
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
      name: DB_NAME
    },
    restartRequired: false
  };
}

function serializeConfigFile(nextConfig) {
  return [
    'const config = ' + JSON.stringify(nextConfig, null, 2) + ';',
    '',
    'module.exports = config;',
    ''
  ].join('\n');
}

async function writeConnectionSettings(payload = {}) {
  const nextConfig = {
    app: {
      port: normalizePort(payload.app?.port, PORT)
    },
    db: {
      host: normalizeText(payload.db?.host, DB_HOST),
      port: normalizePort(payload.db?.port, DB_PORT),
      user: normalizeText(payload.db?.user, DB_USER),
      password: typeof payload.db?.password === 'string' ? payload.db.password : DB_PASSWORD,
      name: normalizeText(payload.db?.name, DB_NAME)
    },
    smtp: {
      host: SMTP_HOST,
      port: SMTP_PORT,
      user: SMTP_USER,
      pass: SMTP_PASS,
      from: SMTP_FROM
    }
  };

  await fs.promises.writeFile(CONFIG_FILE_PATH, serializeConfigFile(nextConfig), 'utf8');

  return {
    app: nextConfig.app,
    db: nextConfig.db,
    restartRequired: true
  };
}

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

app.get('/api/health', async (req, res) => {
  const status = {
    server: 'online',
    app: {
      port: PORT,
      uptimeSeconds: Math.floor((Date.now() - SERVER_STARTED_AT.getTime()) / 1000)
    },
    database: {
      connected: false,
      host: DB_HOST,
      port: DB_PORT,
      name: DB_NAME
    },
    checkedAt: new Date().toISOString()
  };

  try {
    if (pool) {
      await pool.query('SELECT 1');
      status.database.connected = true;
    }
    res.json(status);
  } catch (error) {
    status.server = 'degraded';
    status.database.error = error.message;
    res.status(503).json(status);
  }
});

app.get('/api/admin/connection-settings', (req, res) => {
  res.json(getCurrentConnectionSettings());
});

app.put('/api/admin/connection-settings', async (req, res) => {
  try {
    const saved = await writeConnectionSettings(req.body || {});
    await logAudit('admin.connection-settings.updated', 'admin', {
      appPort: saved.app.port,
      dbHost: saved.db.host,
      dbPort: saved.db.port,
      dbName: saved.db.name,
      dbUser: saved.db.user
    });
    res.json({
      success: true,
      message: 'Connection settings saved to config file. Restart server to apply changes.',
      ...saved
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save connection settings: ' + error.message });
  }
});

app.post('/api/admin/connection-settings/test', async (req, res) => {
  const payload = req.body || {};
  const testConfig = {
    host: normalizeText(payload.db?.host, DB_HOST),
    port: normalizePort(payload.db?.port, DB_PORT),
    user: normalizeText(payload.db?.user, DB_USER),
    password: typeof payload.db?.password === 'string' ? payload.db.password : DB_PASSWORD,
    name: normalizeText(payload.db?.name, DB_NAME)
  };

  let testConn;
  try {
    testConn = await mysql.createConnection({
      host: testConfig.host,
      port: testConfig.port,
      user: testConfig.user,
      password: testConfig.password,
      multipleStatements: true
    });

    await testConn.query(`CREATE DATABASE IF NOT EXISTS \`${testConfig.name}\``);
    await testConn.query(`USE \`${testConfig.name}\``);
    await testConn.query('SELECT 1 AS ok');

    await logAudit('admin.connection-settings.test', 'admin', {
      dbHost: testConfig.host,
      dbPort: testConfig.port,
      dbName: testConfig.name,
      dbUser: testConfig.user,
      result: 'success'
    });

    res.json({
      success: true,
      message: 'Database connection test successful.',
      db: {
        host: testConfig.host,
        port: testConfig.port,
        name: testConfig.name,
        user: testConfig.user
      }
    });
  } catch (error) {
    await logAudit('admin.connection-settings.test', 'admin', {
      dbHost: testConfig.host,
      dbPort: testConfig.port,
      dbName: testConfig.name,
      dbUser: testConfig.user,
      result: 'failed',
      error: error.message
    });

    res.status(400).json({ error: `Database connection failed: ${error.message}` });
  } finally {
    if (testConn) {
      await testConn.end();
    }
  }
});

app.post('/api/admin/restart', async (req, res) => {
  try {
    const canSelfRestart = Boolean(process.env.pm_id || process.env.ENABLE_SELF_RESTART === 'true');

    if (!canSelfRestart) {
      await logAudit('admin.server.restart.requested', 'admin', {
        mode: 'manual-required',
        reason: 'No process manager detected'
      });

      return res.status(400).json({
        error: 'Automatic restart is not available in this runtime. Please restart manually from terminal.'
      });
    }

    await logAudit('admin.server.restart.requested', 'admin', {
      mode: 'self-restart'
    });

    res.json({
      success: true,
      message: 'Server restart initiated. Reconnect in a few seconds.'
    });

    setTimeout(() => {
      process.exit(0);
    }, 600);
  } catch (error) {
    res.status(500).json({ error: 'Failed to restart server: ' + error.message });
  }
});

function getDefaultProducts() {
  return [
    { id: 1, name: 'Rice 5kg', price: 12.99, unit: 'bag', category: 'Groceries', stock: 50, barcode: '100000000001', hscode: '1006.30' },
    { id: 2, name: 'Cooking Oil 2L', price: 8.5, unit: 'bottle', category: 'Groceries', stock: 30, barcode: '100000000002', hscode: '1512.11' },
    { id: 3, name: 'Sugar 1kg', price: 3.25, unit: 'pack', category: 'Groceries', stock: 75, barcode: '100000000003', hscode: '1701.99' },
    { id: 4, name: 'Milk 1L', price: 4.99, unit: 'carton', category: 'Dairy', stock: 40, barcode: '100000000004', hscode: '0401.20' },
    { id: 5, name: 'Bread', price: 2.5, unit: 'loaf', category: 'Bakery', stock: 60, barcode: '100000000005', hscode: '1905.90' }
  ];
}

async function initDatabase() {
  const bootstrap = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    multipleStatements: true
  });

  await bootstrap.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\``);
  await bootstrap.end();

  pool = mysql.createPool({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 10
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(100) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL DEFAULT 'cashier',
      permissions_json LONGTEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      sku VARCHAR(100) NULL,
      barcode VARCHAR(100) NULL,
      hscode VARCHAR(100) NULL,
      price DECIMAL(10,2) NOT NULL,
      cost_price DECIMAL(10,2) NOT NULL DEFAULT 0,
      stock INT NOT NULL DEFAULT 0,
      unit VARCHAR(50) NOT NULL DEFAULT 'item',
      category VARCHAR(100) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sales (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NULL,
      total DECIMAL(10,2) NOT NULL DEFAULT 0,
      tax DECIMAL(10,2) NOT NULL DEFAULT 0,
      tax_rate DECIMAL(10,4) NOT NULL DEFAULT 0.1000,
      currency_code VARCHAR(10) NOT NULL DEFAULT 'USD',
      profit DECIMAL(12,2) NOT NULL DEFAULT 0,
      items_count INT NOT NULL DEFAULT 0,
      payment_method VARCHAR(50) NULL,
      client_ref VARCHAR(80) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_sales_user_id (user_id),
      INDEX idx_sales_client_ref (client_ref)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      sale_id INT NOT NULL,
      user_id INT NULL,
      currency_code VARCHAR(10) NOT NULL,
      subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
      tax DECIMAL(12,2) NOT NULL DEFAULT 0,
      total DECIMAL(12,2) NOT NULL DEFAULT 0,
      profit DECIMAL(12,2) NOT NULL DEFAULT 0,
      payment_method VARCHAR(50) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_transactions_sale_id (sale_id),
      INDEX idx_transactions_currency (currency_code),
      INDEX idx_transactions_created_at (created_at)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sales_usd (
      id INT AUTO_INCREMENT PRIMARY KEY,
      transaction_id INT NOT NULL,
      sale_id INT NOT NULL,
      total DECIMAL(12,2) NOT NULL DEFAULT 0,
      profit DECIMAL(12,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_sales_usd_created_at (created_at)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sales_zar (
      id INT AUTO_INCREMENT PRIMARY KEY,
      transaction_id INT NOT NULL,
      sale_id INT NOT NULL,
      total DECIMAL(12,2) NOT NULL DEFAULT 0,
      profit DECIMAL(12,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_sales_zar_created_at (created_at)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sales_zig (
      id INT AUTO_INCREMENT PRIMARY KEY,
      transaction_id INT NOT NULL,
      sale_id INT NOT NULL,
      total DECIMAL(12,2) NOT NULL DEFAULT 0,
      profit DECIMAL(12,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_sales_zig_created_at (created_at)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sales_cash (
      id INT AUTO_INCREMENT PRIMARY KEY,
      transaction_id INT NOT NULL,
      sale_id INT NOT NULL,
      total DECIMAL(12,2) NOT NULL DEFAULT 0,
      profit DECIMAL(12,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_sales_cash_created_at (created_at)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sales_ecocash (
      id INT AUTO_INCREMENT PRIMARY KEY,
      transaction_id INT NOT NULL,
      sale_id INT NOT NULL,
      total DECIMAL(12,2) NOT NULL DEFAULT 0,
      profit DECIMAL(12,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_sales_ecocash_created_at (created_at)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sales_card (
      id INT AUTO_INCREMENT PRIMARY KEY,
      transaction_id INT NOT NULL,
      sale_id INT NOT NULL,
      total DECIMAL(12,2) NOT NULL DEFAULT 0,
      profit DECIMAL(12,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_sales_card_created_at (created_at)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sale_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      sale_id INT NOT NULL,
      product_id INT NOT NULL,
      name VARCHAR(255) NOT NULL,
      quantity INT NOT NULL,
      price DECIMAL(10,2) NOT NULL,
      barcode VARCHAR(100) NULL,
      hscode VARCHAR(100) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_sale_items_sale_id (sale_id),
      INDEX idx_sale_items_product_id (product_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      type VARCHAR(50) NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      cashier VARCHAR(255) NULL,
      items_json LONGTEXT NOT NULL,
      event_timestamp DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      event_type VARCHAR(100) NOT NULL,
      actor VARCHAR(255) NULL,
      details_json LONGTEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_audit_created_at (created_at)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS exchange_settings (
      id INT PRIMARY KEY,
      base_currency VARCHAR(10) NOT NULL DEFAULT 'USD',
      rate_usd DECIMAL(12,6) NOT NULL DEFAULT 1,
      rate_zar DECIMAL(12,6) NOT NULL DEFAULT 20,
      rate_zig DECIMAL(12,6) NOT NULL DEFAULT 400,
      default_tax_rate_percent DECIMAL(8,4) NOT NULL DEFAULT 10,
      allow_tax_exempt_products TINYINT(1) NOT NULL DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS receipt_settings (
      id INT PRIMARY KEY,
      company_name VARCHAR(255) NOT NULL DEFAULT '',
      company_address VARCHAR(255) NOT NULL DEFAULT '',
      vat_number VARCHAR(100) NOT NULL DEFAULT '',
      tin_number VARCHAR(100) NOT NULL DEFAULT '',
      receipt_header VARCHAR(255) NOT NULL DEFAULT '',
      receipt_footer VARCHAR(255) NOT NULL DEFAULT 'Thank you for your purchase',
      receipt_extra LONGTEXT NULL,
      show_company_details TINYINT(1) NOT NULL DEFAULT 1,
      show_cashier TINYINT(1) NOT NULL DEFAULT 1,
      show_datetime TINYINT(1) NOT NULL DEFAULT 1,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS company_profile (
      id INT PRIMARY KEY,
      legal_name VARCHAR(255) NOT NULL DEFAULT 'Impartial Enterprises',
      trading_name VARCHAR(255) NOT NULL DEFAULT 'Impartial Enterprises POS',
      edition VARCHAR(120) NOT NULL DEFAULT 'Company Edition',
      support_phone VARCHAR(80) NOT NULL DEFAULT '+263 77 000 0000',
      support_email VARCHAR(180) NOT NULL DEFAULT '',
      website VARCHAR(255) NOT NULL DEFAULT '',
      address_line VARCHAR(255) NOT NULL DEFAULT '',
      city VARCHAR(120) NOT NULL DEFAULT '',
      country VARCHAR(120) NOT NULL DEFAULT '',
      vat_number VARCHAR(100) NOT NULL DEFAULT '',
      tin_number VARCHAR(100) NOT NULL DEFAULT '',
      registration_number VARCHAR(120) NOT NULL DEFAULT '',
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      contact_person VARCHAR(255) NOT NULL DEFAULT '',
      phone VARCHAR(80) NOT NULL DEFAULT '',
      email VARCHAR(180) NOT NULL DEFAULT '',
      address_line VARCHAR(255) NOT NULL DEFAULT '',
      notes LONGTEXT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_suppliers_name (name),
      INDEX idx_suppliers_active (is_active)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS login_sessions (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      username VARCHAR(100) NOT NULL,
      user_name VARCHAR(255) NOT NULL,
      user_role VARCHAR(50) NOT NULL DEFAULT 'cashier',
      ip_address VARCHAR(100) NOT NULL,
      device_name VARCHAR(255) NOT NULL,
      user_agent VARCHAR(700) NOT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      login_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_seen_at DATETIME NULL,
      logout_at DATETIME NULL,
      INDEX idx_login_sessions_user_id (user_id),
      INDEX idx_login_sessions_active (is_active),
      INDEX idx_login_sessions_login_at (login_at)
    )
  `);

  await addColumnIfMissing('products', 'cost_price DECIMAL(10,2) NOT NULL DEFAULT 0');
  await addColumnIfMissing('users', 'permissions_json LONGTEXT NULL');
  await addColumnIfMissing('sales', "tax_rate DECIMAL(10,4) NOT NULL DEFAULT 0.1000");
  await addColumnIfMissing('sales', "currency_code VARCHAR(10) NOT NULL DEFAULT 'USD'");
  await addColumnIfMissing('sales', 'profit DECIMAL(12,2) NOT NULL DEFAULT 0');
  await addColumnIfMissing('sales', 'client_ref VARCHAR(80) NULL');
  await addColumnIfMissing('sale_items', 'cost_price DECIMAL(10,2) NOT NULL DEFAULT 0');
  await addColumnIfMissing('sale_items', 'line_profit DECIMAL(12,2) NOT NULL DEFAULT 0');
  await addIndexIfMissing('sales', 'idx_sales_client_ref', 'client_ref');

  if (fs.existsSync(LEGACY_USERS_FILE_PATH)) {
    try {
      const rawLegacyUsers = await fs.promises.readFile(LEGACY_USERS_FILE_PATH, 'utf8');
      const parsedLegacyUsers = JSON.parse(rawLegacyUsers);
      const legacyUsers = Array.isArray(parsedLegacyUsers) ? parsedLegacyUsers : [];

      for (const legacyUser of legacyUsers) {
        const username = String(legacyUser.username || '').trim();
        const password = String(legacyUser.password || '').trim();
        const name = String(legacyUser.name || username || 'User').trim();
        const role = normalizeRole(legacyUser.role || 'cashier');
        const permissionsJson = serializePermissions(legacyUser.permissions, role);

        if (!username || !password) continue;

        await pool.query(
          'INSERT INTO users (username, password, name, role, permissions_json) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), role = VALUES(role), permissions_json = VALUES(permissions_json)',
          [username, password, name, role, permissionsJson]
        );
      }
    } catch (error) {
      console.error('Legacy users migration failed:', error.message);
    }
  }

  const [userRows] = await pool.query('SELECT COUNT(*) AS count FROM users');
  if ((userRows[0]?.count || 0) === 0) {
    const adminPermissions = serializePermissions(null, 'admin');
    await pool.query(
      'INSERT INTO users (username, password, name, role, permissions_json) VALUES (?, ?, ?, ?, ?)',
      ['admin', 'admin123', 'Admin User', 'admin', adminPermissions]
    );
  }

  const [existingUsers] = await pool.query('SELECT id, role, permissions_json FROM users');
  for (const user of existingUsers) {
    const role = normalizeRole(user.role);
    const normalizedPermissions = parsePermissionsField(user.permissions_json, role);
    const nextJson = JSON.stringify(normalizedPermissions);
    if (role !== user.role || nextJson !== user.permissions_json) {
      await pool.query(
        'UPDATE users SET role = ?, permissions_json = ? WHERE id = ?',
        [role, nextJson, user.id]
      );
    }
  }

  const [productRows] = await pool.query('SELECT COUNT(*) AS count FROM products');
  if ((productRows[0]?.count || 0) === 0) {
    const defaults = getDefaultProducts();
    for (const product of defaults) {
      await pool.query(
        'INSERT INTO products (name, price, unit, category, stock, barcode, hscode) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [product.name, product.price, product.unit, product.category, product.stock, product.barcode, product.hscode]
      );
    }
  }

  await pool.query(
    `INSERT INTO exchange_settings
      (id, base_currency, rate_usd, rate_zar, rate_zig, default_tax_rate_percent, allow_tax_exempt_products)
     VALUES (1, 'USD', 1, 20, 400, 10, 0)
     ON DUPLICATE KEY UPDATE id = id`
  );

  await pool.query(
    `INSERT INTO receipt_settings
      (id, company_name, company_address, vat_number, tin_number, receipt_header, receipt_footer, receipt_extra, show_company_details, show_cashier, show_datetime)
     VALUES (1, '', '', '', '', '', 'Thank you for your purchase', '', 1, 1, 1)
     ON DUPLICATE KEY UPDATE id = id`
  );

  await pool.query(
    `INSERT INTO company_profile
      (id, legal_name, trading_name, edition, support_phone, support_email, website, address_line, city, country, vat_number, tin_number, registration_number)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE id = id`,
    [
      DEFAULT_COMPANY_PROFILE.legalName,
      DEFAULT_COMPANY_PROFILE.tradingName,
      DEFAULT_COMPANY_PROFILE.edition,
      DEFAULT_COMPANY_PROFILE.supportPhone,
      DEFAULT_COMPANY_PROFILE.supportEmail,
      DEFAULT_COMPANY_PROFILE.website,
      DEFAULT_COMPANY_PROFILE.addressLine,
      DEFAULT_COMPANY_PROFILE.city,
      DEFAULT_COMPANY_PROFILE.country,
      DEFAULT_COMPANY_PROFILE.vatNumber,
      DEFAULT_COMPANY_PROFILE.tinNumber,
      DEFAULT_COMPANY_PROFILE.registrationNumber
    ]
  );
}

// --- Authentication Endpoints ---

// Login endpoint
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const [rows] = await pool.query(
      'SELECT id, username, password, name, role, permissions_json FROM users WHERE username = ? LIMIT 1',
      [username]
    );

    const user = rows[0];
    if (!user || user.password !== password) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const role = normalizeRole(user.role);
    const deviceName = normalizeLongText(req.body?.deviceName, 'Unknown Device', 255) || 'Unknown Device';
    const userAgent = normalizeLongText(req.headers['user-agent'] || req.body?.userAgent || '', 'Unknown Agent', 700) || 'Unknown Agent';
    const ipAddress = getClientIp(req) || 'Unknown IP';

    const [sessionResult] = await pool.query(
      `INSERT INTO login_sessions
        (user_id, username, user_name, user_role, ip_address, device_name, user_agent, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [user.id, user.username, user.name, role, ipAddress, deviceName, userAgent]
    );

    await logAudit('auth.login.success', username, { userId: user.id, ipAddress, deviceName, sessionId: sessionResult.insertId });
    res.json({
      id: user.id,
      username: user.username,
      name: user.name,
      role,
      permissions: parsePermissionsField(user.permissions_json, role),
      sessionId: Number(sessionResult.insertId) || 0
    });
  } catch (error) {
    await logAudit('auth.login.failed', req.body?.username || 'unknown', { reason: error.message });
    res.status(500).json({ error: 'Failed to process login.' });
  }
});

// Register endpoint
app.post('/api/register', async (req, res) => {
  try {
    const { username, password, name, role } = req.body;
    if (!username || !password || !name) {
      return res.status(400).json({ error: 'All fields required' });
    }

    const normalizedRole = normalizeRole(role || 'cashier');
    const permissionsJson = serializePermissions(req.body?.permissions, normalizedRole);

    const [result] = await pool.query(
      'INSERT INTO users (username, password, name, role, permissions_json) VALUES (?, ?, ?, ?, ?)',
      [username, password, name, normalizedRole, permissionsJson]
    );

    await logAudit('user.create', username, { createdUserId: result.insertId, name, role: normalizedRole });
    res.status(201).json({
      id: result.insertId,
      username,
      name,
      role: normalizedRole,
      permissions: parsePermissionsField(permissionsJson, normalizedRole)
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Username already exists' });
    }
    res.status(500).json({ error: 'Failed to register user.' });
  }
});

// Get user info
app.get('/api/user/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, username, name, role, permissions_json, created_at FROM users WHERE id = ? LIMIT 1',
      [Number(req.params.id)]
    );

    if (!rows[0]) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(mapUserRow(rows[0]));
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve user.' });
  }
});

app.get('/api/users', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, username, name, role, permissions_json, created_at FROM users ORDER BY created_at DESC, id DESC'
    );

    res.json(rows.map(mapUserRow));
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve users.' });
  }
});

app.get('/api/permissions/catalog', (req, res) => {
  res.json({
    roles: ALLOWED_ROLES,
    permissions: PERMISSION_CATALOG,
    defaultsByRole: ROLE_DEFAULT_PERMISSIONS
  });
});

app.put('/api/users/:id/access', async (req, res) => {
  try {
    const targetUserId = Number(req.params.id);
    if (!Number.isFinite(targetUserId) || targetUserId <= 0) {
      return res.status(400).json({ error: 'Invalid user id.' });
    }

    const canManage = await ensureAdminActor(req);
    if (!canManage) {
      return res.status(403).json({ error: 'Only administrators can manage roles and permissions.' });
    }

    const role = normalizeRole(req.body?.role || 'cashier');
    const permissions = normalizePermissions(req.body?.permissions, role);
    const permissionsJson = JSON.stringify(permissions);

    const [result] = await pool.query(
      'UPDATE users SET role = ?, permissions_json = ? WHERE id = ?',
      [role, permissionsJson, targetUserId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const [rows] = await pool.query(
      'SELECT id, username, name, role, permissions_json, created_at FROM users WHERE id = ? LIMIT 1',
      [targetUserId]
    );

    await logAudit('user.access.updated', String(req.body?.actorId || 'admin'), {
      targetUserId,
      role,
      permissions
    });

    res.json(mapUserRow(rows[0]));
  } catch (error) {
    res.status(500).json({ error: 'Failed to update user access.' });
  }
});

app.put('/api/users/:id', async (req, res) => {
  try {
    const targetUserId = Number(req.params.id);
    if (!Number.isFinite(targetUserId) || targetUserId <= 0) {
      return res.status(400).json({ error: 'Invalid user id.' });
    }

    const canManage = await ensureAdminActor(req);
    if (!canManage) {
      return res.status(403).json({ error: 'Only administrators can edit users.' });
    }

    const name = normalizeLongText(req.body?.name, '', 255);
    const username = normalizeLongText(req.body?.username, '', 100);
    if (!name || !username) {
      return res.status(400).json({ error: 'Name and username are required.' });
    }

    const role = normalizeRole(req.body?.role || 'cashier');
    const permissions = normalizePermissions(req.body?.permissions, role);
    const permissionsJson = JSON.stringify(permissions);
    const password = String(req.body?.password || '').trim();

    let result;
    if (password) {
      [result] = await pool.query(
        'UPDATE users SET name = ?, username = ?, password = ?, role = ?, permissions_json = ? WHERE id = ?',
        [name, username, password, role, permissionsJson, targetUserId]
      );
    } else {
      [result] = await pool.query(
        'UPDATE users SET name = ?, username = ?, role = ?, permissions_json = ? WHERE id = ?',
        [name, username, role, permissionsJson, targetUserId]
      );
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const [rows] = await pool.query(
      'SELECT id, username, name, role, permissions_json, created_at FROM users WHERE id = ? LIMIT 1',
      [targetUserId]
    );

    await logAudit('user.updated', String(req.body?.actorId || 'admin'), {
      targetUserId,
      name,
      username,
      role,
      permissions,
      passwordUpdated: Boolean(password)
    });

    res.json(mapUserRow(rows[0]));
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Username already exists.' });
    }
    res.status(500).json({ error: 'Failed to update user.' });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    const targetUserId = Number(req.params.id);
    if (!Number.isFinite(targetUserId) || targetUserId <= 0) {
      return res.status(400).json({ error: 'Invalid user id.' });
    }

    const canDelete = await ensureAdminActor(req);
    if (!canDelete) {
      return res.status(403).json({ error: 'Only administrators can delete users.' });
    }

    const actorId = Number(req.body?.actorId || 0);
    if (actorId && actorId === targetUserId) {
      return res.status(400).json({ error: 'Administrator cannot delete the currently authenticated account.' });
    }

    const [result] = await pool.query('DELETE FROM users WHERE id = ?', [targetUserId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    await logAudit('user.delete', String(actorId || 'admin'), { targetUserId });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete user.' });
  }
});

app.get('/api/suppliers', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, contact_person, phone, email, address_line, notes, is_active, created_at, updated_at
       FROM suppliers
       ORDER BY is_active DESC, name ASC, id DESC`
    );

    res.json(rows.map(row => ({
      id: row.id,
      name: String(row.name || ''),
      contactPerson: String(row.contact_person || ''),
      phone: String(row.phone || ''),
      email: String(row.email || ''),
      addressLine: String(row.address_line || ''),
      notes: String(row.notes || ''),
      isActive: Boolean(row.is_active),
      createdAt: row.created_at || null,
      updatedAt: row.updated_at || null
    })));
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve suppliers.' });
  }
});

app.post('/api/suppliers', async (req, res) => {
  try {
    const canManage = await ensureActorHasPermissions(req, ['alter_inventory']);
    if (!canManage) {
      return res.status(403).json({ error: 'Only authorized users can add suppliers.' });
    }

    const name = normalizeLongText(req.body?.name, '', 255);
    if (!name) {
      return res.status(400).json({ error: 'Supplier name is required.' });
    }

    const contactPerson = normalizeLongText(req.body?.contactPerson, '', 255);
    const phone = normalizeLongText(req.body?.phone, '', 80);
    const email = normalizeLongText(req.body?.email, '', 180);
    const addressLine = normalizeLongText(req.body?.addressLine, '', 255);
    const notes = normalizeLongText(req.body?.notes, '', 3000);
    const isActive = normalizeBoolean(req.body?.isActive, true) ? 1 : 0;

    const [result] = await pool.query(
      `INSERT INTO suppliers (name, contact_person, phone, email, address_line, notes, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [name, contactPerson, phone, email, addressLine, notes, isActive]
    );

    const [rows] = await pool.query(
      `SELECT id, name, contact_person, phone, email, address_line, notes, is_active, created_at, updated_at
       FROM suppliers WHERE id = ? LIMIT 1`,
      [result.insertId]
    );

    await logAudit('supplier.created', String(req.body?.actorId || 'system'), { supplierId: result.insertId, name });

    const row = rows[0];
    res.status(201).json({
      id: row.id,
      name: String(row.name || ''),
      contactPerson: String(row.contact_person || ''),
      phone: String(row.phone || ''),
      email: String(row.email || ''),
      addressLine: String(row.address_line || ''),
      notes: String(row.notes || ''),
      isActive: Boolean(row.is_active),
      createdAt: row.created_at || null,
      updatedAt: row.updated_at || null
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add supplier.' });
  }
});

app.put('/api/suppliers/:id', async (req, res) => {
  try {
    const supplierId = Number(req.params.id);
    if (!Number.isFinite(supplierId) || supplierId <= 0) {
      return res.status(400).json({ error: 'Invalid supplier id.' });
    }

    const canManage = await ensureActorHasPermissions(req, ['alter_inventory']);
    if (!canManage) {
      return res.status(403).json({ error: 'Only authorized users can edit suppliers.' });
    }

    const name = normalizeLongText(req.body?.name, '', 255);
    if (!name) {
      return res.status(400).json({ error: 'Supplier name is required.' });
    }

    const contactPerson = normalizeLongText(req.body?.contactPerson, '', 255);
    const phone = normalizeLongText(req.body?.phone, '', 80);
    const email = normalizeLongText(req.body?.email, '', 180);
    const addressLine = normalizeLongText(req.body?.addressLine, '', 255);
    const notes = normalizeLongText(req.body?.notes, '', 3000);
    const isActive = normalizeBoolean(req.body?.isActive, true) ? 1 : 0;

    const [result] = await pool.query(
      `UPDATE suppliers
       SET name = ?, contact_person = ?, phone = ?, email = ?, address_line = ?, notes = ?, is_active = ?
       WHERE id = ?`,
      [name, contactPerson, phone, email, addressLine, notes, isActive, supplierId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Supplier not found.' });
    }

    const [rows] = await pool.query(
      `SELECT id, name, contact_person, phone, email, address_line, notes, is_active, created_at, updated_at
       FROM suppliers WHERE id = ? LIMIT 1`,
      [supplierId]
    );

    await logAudit('supplier.updated', String(req.body?.actorId || 'system'), { supplierId, name, isActive: Boolean(isActive) });

    const row = rows[0];
    res.json({
      id: row.id,
      name: String(row.name || ''),
      contactPerson: String(row.contact_person || ''),
      phone: String(row.phone || ''),
      email: String(row.email || ''),
      addressLine: String(row.address_line || ''),
      notes: String(row.notes || ''),
      isActive: Boolean(row.is_active),
      createdAt: row.created_at || null,
      updatedAt: row.updated_at || null
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update supplier.' });
  }
});

app.delete('/api/suppliers/:id', async (req, res) => {
  try {
    const supplierId = Number(req.params.id);
    if (!Number.isFinite(supplierId) || supplierId <= 0) {
      return res.status(400).json({ error: 'Invalid supplier id.' });
    }

    const canManage = await ensureActorHasPermissions(req, ['alter_inventory']);
    if (!canManage) {
      return res.status(403).json({ error: 'Only authorized users can delete suppliers.' });
    }

    const [result] = await pool.query('DELETE FROM suppliers WHERE id = ?', [supplierId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Supplier not found.' });
    }

    await logAudit('supplier.deleted', String(req.body?.actorId || 'system'), { supplierId });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete supplier.' });
  }
});


// --- API Endpoints ---

// Get all products
app.get('/api/products', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, sku, barcode, hscode, price, cost_price, stock, unit, category, created_at FROM products ORDER BY name ASC'
    );
    res.json(rows.map(row => ({
      ...row,
      price: Number(row.price) || 0,
      cost_price: Number(row.cost_price) || 0,
      stock: Number(row.stock) || 0
    })));
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve products.' });
  }
});

// Add a new product
app.post('/api/products', async (req, res) => {
  try {
    const { name, price, costPrice, category, stock, unit, barcode, hscode, sku } = req.body;
    if (!name || price === undefined) {
      return res.status(400).json({ error: 'Name and price are required' });
    }

    const [result] = await pool.query(
      'INSERT INTO products (name, price, cost_price, category, stock, unit, barcode, hscode, sku) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [name, price, Number(costPrice) || 0, category || '', Number(stock) || 0, unit || 'item', barcode || '', hscode || '', sku || null]
    );

    const [rows] = await pool.query(
      'SELECT id, name, sku, barcode, hscode, price, cost_price, stock, unit, category, created_at FROM products WHERE id = ?',
      [result.insertId]
    );
    await logAudit('product.create', 'api', { productId: result.insertId, name, stock: Number(stock) || 0 });
    res.status(201).json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create product.' });
  }
});

// Update product stock
app.patch('/api/products/:id/stock', async (req, res) => {
  try {
    const productId = Number(req.params.id);
    const { quantity } = req.body;
    const qty = Number(quantity);

    if (!qty || qty <= 0) {
      return res.status(400).json({ error: 'Invalid quantity provided.' });
    }

    const [result] = await pool.query(
      'UPDATE products SET stock = stock + ? WHERE id = ?',
      [qty, productId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    const [rows] = await pool.query(
      'SELECT id, name, sku, barcode, hscode, price, cost_price, stock, unit, category, created_at FROM products WHERE id = ?',
      [productId]
    );
    await logAudit('product.stock.update', 'api', { productId, quantityAdded: qty });
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update product stock.' });
  }
});

app.post('/api/stock/adjust', async (req, res) => {
  try {
    const productId = Number(req.body?.productId);
    const delta = Number(req.body?.delta);
    const reason = String(req.body?.reason || '').trim();

    if (!productId || !Number.isFinite(delta) || delta === 0) {
      return res.status(400).json({ error: 'productId and non-zero delta are required.' });
    }

    const [rows] = await pool.query(
      'SELECT id, name, stock FROM products WHERE id = ? LIMIT 1',
      [productId]
    );
    const product = rows[0];
    if (!product) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    const currentStock = Number(product.stock) || 0;
    const nextStock = currentStock + delta;
    if (nextStock < 0) {
      return res.status(400).json({ error: 'Cannot reduce stock below zero.' });
    }

    await pool.query('UPDATE products SET stock = ? WHERE id = ?', [nextStock, productId]);

    await logAudit('stock.adjust', 'admin', {
      productId,
      productName: product.name,
      previousStock: currentStock,
      delta,
      nextStock,
      reason
    });

    res.json({ success: true, productId, previousStock: currentStock, nextStock, delta, reason });
  } catch (error) {
    res.status(500).json({ error: 'Failed to adjust stock.' });
  }
});

// Delete a product
app.delete('/api/products/:id', async (req, res) => {
  try {
    const productId = Number(req.params.id);
    const [result] = await pool.query('DELETE FROM products WHERE id = ?', [productId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    await logAudit('product.delete', 'api', { productId });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete product.' });
  }
});

// Complete a sale
app.post('/api/sales', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { items, userId, paymentMethod, currencyCode, taxRate } = req.body;
    if (!items || !items.length) {
      return res.status(400).json({ error: 'Sale must include items' });
    }

    const normalizedCurrency = String(currencyCode || 'USD').trim().toUpperCase();
    const safeCurrency = ALLOWED_CURRENCIES.includes(normalizedCurrency) ? normalizedCurrency : 'USD';
    const safePaymentMethod = normalizePaymentMethod(paymentMethod);
    const normalizedTaxRate = Number.isFinite(Number(taxRate)) ? Number(taxRate) : 0.10;
    const clientSaleRef = normalizeLongText(req.body?.clientSaleRef, '', 80);

    await conn.beginTransaction();

    if (clientSaleRef) {
      const [existingSales] = await conn.query(
        `SELECT id, user_id, total, tax, tax_rate, currency_code, profit, items_count, created_at
         FROM sales WHERE client_ref = ? LIMIT 1`,
        [clientSaleRef]
      );

      if (existingSales.length > 0) {
        const existingSale = existingSales[0];
        const [existingItems] = await conn.query(
          `SELECT product_id AS id, name, quantity, price, cost_price, line_profit AS profit, barcode, hscode
           FROM sale_items WHERE sale_id = ? ORDER BY id ASC`,
          [existingSale.id]
        );
        await conn.commit();
        return res.status(200).json({
          id: existingSale.id,
          userId: Number(existingSale.user_id) || null,
          total: Number(existingSale.total) || 0,
          tax: Number(existingSale.tax) || 0,
          taxRate: Number(existingSale.tax_rate) || normalizedTaxRate,
          currencyCode: String(existingSale.currency_code || safeCurrency),
          profit: Number(existingSale.profit) || 0,
          items_count: Number(existingSale.items_count) || 0,
          items: (existingItems || []).map(item => ({
            ...item,
            quantity: Number(item.quantity) || 0,
            price: Number(item.price) || 0,
            cost_price: Number(item.cost_price) || 0,
            profit: Number(item.profit) || 0
          })),
          created_at: existingSale.created_at,
          clientSaleRef,
          alreadySynced: true
        });
      }
    }

    const normalizedItems = [];
    let totalProfit = 0;
    let calculatedSubtotal = 0;
    for (const item of items) {
      const productId = Number(item.id);
      const requestedQty = Number(item.quantity) || 0;
      if (!productId || requestedQty <= 0) {
        throw new Error('Invalid sale item payload.');
      }

      const [rows] = await conn.query(
        'SELECT id, name, price, cost_price, stock, barcode, hscode FROM products WHERE id = ? FOR UPDATE',
        [productId]
      );
      const product = rows[0];

      if (!product) {
        return res.status(404).json({ error: `Product not found for item id ${productId}` });
      }

      const available = Number(product.stock) || 0;
      if (requestedQty > available) {
        return res.status(400).json({ error: `Insufficient stock for ${product.name}` });
      }

      const sellingPrice = Number(product.price) || 0;
      const costPrice = Number(product.cost_price) || 0;
      const lineSubtotal = roundMoney(sellingPrice * requestedQty);
      const itemProfit = roundMoney((sellingPrice - costPrice) * requestedQty);
      totalProfit = roundMoney(totalProfit + itemProfit);
      calculatedSubtotal = roundMoney(calculatedSubtotal + lineSubtotal);

      normalizedItems.push({
        id: product.id,
        name: product.name,
        price: sellingPrice,
        quantity: requestedQty,
        cost_price: costPrice,
        profit: itemProfit,
        lineSubtotal,
        barcode: product.barcode || '',
        hscode: product.hscode || ''
      });
    }

    const calculatedTax = roundMoney(calculatedSubtotal * normalizedTaxRate);
    const calculatedTotal = roundMoney(calculatedSubtotal + calculatedTax);

    const [saleResult] = await conn.query(
      'INSERT INTO sales (user_id, total, tax, tax_rate, currency_code, profit, items_count, payment_method, client_ref) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        Number(userId) || null,
        calculatedTotal,
        calculatedTax,
        normalizedTaxRate,
        safeCurrency,
        totalProfit,
        normalizedItems.length,
        safePaymentMethod,
        clientSaleRef || null
      ]
    );

    for (const item of normalizedItems) {
      await conn.query(
        'INSERT INTO sale_items (sale_id, product_id, name, quantity, price, cost_price, line_profit, barcode, hscode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [saleResult.insertId, item.id, item.name, item.quantity, item.price, item.cost_price, item.profit, item.barcode, item.hscode]
      );

      await conn.query(
        'UPDATE products SET stock = stock - ? WHERE id = ?',
        [item.quantity, item.id]
      );
    }

    const [transactionResult] = await conn.query(
      'INSERT INTO transactions (sale_id, user_id, currency_code, subtotal, tax, total, profit, payment_method) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        saleResult.insertId,
        Number(userId) || null,
        safeCurrency,
        calculatedSubtotal,
        calculatedTax,
        calculatedTotal,
        totalProfit,
        safePaymentMethod
      ]
    );

    if (safeCurrency === 'USD') {
      await conn.query(
        'INSERT INTO sales_usd (transaction_id, sale_id, total, profit) VALUES (?, ?, ?, ?)',
        [transactionResult.insertId, saleResult.insertId, calculatedTotal, totalProfit]
      );
    } else if (safeCurrency === 'ZAR') {
      await conn.query(
        'INSERT INTO sales_zar (transaction_id, sale_id, total, profit) VALUES (?, ?, ?, ?)',
        [transactionResult.insertId, saleResult.insertId, calculatedTotal, totalProfit]
      );
    } else if (safeCurrency === 'ZIG') {
      await conn.query(
        'INSERT INTO sales_zig (transaction_id, sale_id, total, profit) VALUES (?, ?, ?, ?)',
        [transactionResult.insertId, saleResult.insertId, calculatedTotal, totalProfit]
      );
    }

    if (safePaymentMethod === 'cash') {
      await conn.query(
        'INSERT INTO sales_cash (transaction_id, sale_id, total, profit) VALUES (?, ?, ?, ?)',
        [transactionResult.insertId, saleResult.insertId, calculatedTotal, totalProfit]
      );
    } else if (safePaymentMethod === 'ecocash') {
      await conn.query(
        'INSERT INTO sales_ecocash (transaction_id, sale_id, total, profit) VALUES (?, ?, ?, ?)',
        [transactionResult.insertId, saleResult.insertId, calculatedTotal, totalProfit]
      );
    } else if (safePaymentMethod === 'card') {
      await conn.query(
        'INSERT INTO sales_card (transaction_id, sale_id, total, profit) VALUES (?, ?, ?, ?)',
        [transactionResult.insertId, saleResult.insertId, calculatedTotal, totalProfit]
      );
    }

    await conn.commit();
    await logAudit('sale.complete', String(userId || 'unknown'), {
      saleId: saleResult.insertId,
      itemCount: normalizedItems.length,
      paymentMethod: safePaymentMethod,
      total: calculatedTotal,
      currencyCode: safeCurrency,
      profit: totalProfit
    });
    res.status(201).json({
      id: saleResult.insertId,
      userId: Number(userId) || null,
      subtotal: calculatedSubtotal,
      total: calculatedTotal,
      tax: calculatedTax,
      taxRate: normalizedTaxRate,
      currencyCode: safeCurrency,
      profit: totalProfit,
      items_count: normalizedItems.length,
      clientSaleRef: clientSaleRef || null,
      items: normalizedItems,
      created_at: new Date().toISOString()
    });
  } catch (error) {
    await conn.rollback();
    res.status(500).json({ error: error.message || 'Failed to complete sale.' });
  } finally {
    conn.release();
  }
});

// Get sales history
app.get('/api/sales', async (req, res) => {
  try {
    const [salesRows] = await pool.query(
      `SELECT s.id, s.user_id AS userId, s.total, s.tax, s.tax_rate, s.currency_code, s.profit, s.items_count, s.payment_method, s.created_at,
              COALESCE(u.name, 'Unknown') AS cashierName
       FROM sales s
       LEFT JOIN users u ON u.id = s.user_id
       ORDER BY s.created_at DESC
       LIMIT 50`
    );

    if (!salesRows.length) {
      return res.json([]);
    }

    const saleIds = salesRows.map(sale => sale.id);
    const placeholders = saleIds.map(() => '?').join(',');
    const [itemRows] = await pool.query(
      `SELECT sale_id AS saleId, product_id AS id, name, quantity, price, barcode, hscode
       FROM sale_items
       WHERE sale_id IN (${placeholders})
       ORDER BY id ASC`,
      saleIds
    );

    const itemsBySaleId = new Map();
    for (const row of itemRows) {
      if (!itemsBySaleId.has(row.saleId)) {
        itemsBySaleId.set(row.saleId, []);
      }
      itemsBySaleId.get(row.saleId).push({
        id: row.id,
        name: row.name,
        quantity: Number(row.quantity) || 0,
        price: Number(row.price) || 0,
        barcode: row.barcode || '',
        hscode: row.hscode || ''
      });
    }

    res.json(salesRows.map(row => ({
      ...row,
      total: Number(row.total) || 0,
      tax: Number(row.tax) || 0,
      tax_rate: Number(row.tax_rate) || 0,
      profit: Number(row.profit) || 0,
      items_count: Number(row.items_count) || 0,
      items: itemsBySaleId.get(row.id) || []
    })));
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve sales.' });
  }
});

// Update product fields
app.patch('/api/products/:id', async (req, res) => {
  try {
    const productId = Number(req.params.id);
    const [rows] = await pool.query(
      'SELECT id, name, sku, barcode, hscode, price, cost_price, stock, unit, category, created_at FROM products WHERE id = ? LIMIT 1',
      [productId]
    );
    const current = rows[0];

    if (!current) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    const next = {
      name: req.body.name ?? current.name,
      price: req.body.price ?? current.price,
      cost_price: req.body.costPrice ?? current.cost_price,
      category: req.body.category ?? current.category,
      unit: req.body.unit ?? current.unit,
      stock: req.body.stock ?? current.stock,
      barcode: req.body.barcode ?? current.barcode ?? '',
      hscode: req.body.hscode ?? current.hscode ?? '',
      sku: req.body.sku ?? current.sku ?? null
    };

    if (!next.name || next.price === undefined) {
      return res.status(400).json({ error: 'Name and price are required.' });
    }

    await pool.query(
      `UPDATE products
       SET name = ?, price = ?, cost_price = ?, category = ?, unit = ?, stock = ?, barcode = ?, hscode = ?, sku = ?
       WHERE id = ?`,
      [next.name, next.price, Number(next.cost_price) || 0, next.category, next.unit, Number(next.stock) || 0, next.barcode, next.hscode, next.sku, productId]
    );

    const [updatedRows] = await pool.query(
      'SELECT id, name, sku, barcode, hscode, price, cost_price, stock, unit, category, created_at FROM products WHERE id = ? LIMIT 1',
      [productId]
    );
    await logAudit('product.update', 'api', { productId, fields: Object.keys(req.body || {}) });
    res.json(updatedRows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update product.' });
  }
});

// Stock Alert Notification
app.post('/api/notifications/stock-alert', async (req, res) => {
  const { items, cashier, timestamp } = req.body;
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Items array is required.' });
  }

  try {
    const normalizedItems = items.map(item => ({
      id: item.id,
      name: item.name,
      available: item.available,
      needed: item.needed,
      shortage: item.shortage,
      barcode: item.barcode || '',
      hscode: item.hscode || ''
    }));

    const [result] = await pool.query(
      'INSERT INTO notifications (type, status, cashier, items_json, event_timestamp) VALUES (?, ?, ?, ?, ?)',
      ['stock_alert', 'pending', cashier || 'Unknown', JSON.stringify(normalizedItems), timestamp ? new Date(timestamp) : new Date()]
    );

    await logAudit('notification.stock_alert.create', cashier || 'Unknown', { notificationId: result.insertId, itemCount: normalizedItems.length });

    res.status(201).json({
      success: true,
      message: 'Stock alert notification sent to supervisor',
      notificationId: result.insertId
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send notification.' });
  }
});

// Get Notifications (for supervisor dashboard)
app.get('/api/notifications', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, type, status, cashier, items_json, event_timestamp, created_at, resolved_at FROM notifications ORDER BY created_at DESC'
    );

    res.json(rows.map(row => ({
      id: row.id,
      type: row.type,
      status: row.status,
      cashier: row.cashier,
      items: typeof row.items_json === 'string' ? JSON.parse(row.items_json) : row.items_json,
      timestamp: row.event_timestamp,
      created_at: row.created_at,
      resolved_at: row.resolved_at
    })));
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve notifications.' });
  }
});

// Mark Notification as Resolved
app.patch('/api/notifications/:id', async (req, res) => {
  const notificationId = Number(req.params.id);
  const { status } = req.body;

  try {
    const [result] = await pool.query(
      'UPDATE notifications SET status = ?, resolved_at = ? WHERE id = ?',
      [status || 'resolved', new Date(), notificationId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Notification not found.' });
    }

    const [rows] = await pool.query(
      'SELECT id, type, status, cashier, items_json, event_timestamp, created_at, resolved_at FROM notifications WHERE id = ? LIMIT 1',
      [notificationId]
    );

    const row = rows[0];
    await logAudit('notification.update', 'api', { notificationId, status: row.status });
    res.json({
      id: row.id,
      type: row.type,
      status: row.status,
      cashier: row.cashier,
      items: typeof row.items_json === 'string' ? JSON.parse(row.items_json) : row.items_json,
      timestamp: row.event_timestamp,
      created_at: row.created_at,
      resolved_at: row.resolved_at
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update notification.' });
  }
});

app.get('/api/reports', async (req, res) => {
  try {
    const type = String(req.query.type || 'sales-by-cashier');
    const startDate = toIsoDate(req.query.startDate);
    const endDate = toIsoDate(req.query.endDate);

    let columns = [];
    let rows = [];
    let columnMap = {};

    if (type === 'sales-by-cashier') {
      columns = ['Cashier', 'Transactions', 'Total Sales'];
      columnMap = { Cashier: 'cashierName', Transactions: 'transactions', 'Total Sales': 'totalSales' };

      const where = [];
      const params = [];
      if (startDate) {
        where.push('DATE(s.created_at) >= ?');
        params.push(startDate);
      }
      if (endDate) {
        where.push('DATE(s.created_at) <= ?');
        params.push(endDate);
      }

      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const [result] = await pool.query(
        `SELECT COALESCE(u.name, 'Unknown') AS cashierName,
                COUNT(s.id) AS transactions,
                COALESCE(SUM(s.total), 0) AS totalSales
         FROM sales s
         LEFT JOIN users u ON u.id = s.user_id
         ${whereSql}
         GROUP BY COALESCE(u.name, 'Unknown')
         ORDER BY totalSales DESC`,
        params
      );

      rows = result.map(r => ({
        cashierName: r.cashierName,
        transactions: Number(r.transactions) || 0,
        totalSales: Number(r.totalSales) || 0
      }));
    } else if (type === 'cash-sales' || type === 'ecocash-sales' || type === 'card-sales') {
      columns = ['Sale ID', 'Cashier', 'Total', 'Date'];
      columnMap = { 'Sale ID': 'saleId', Cashier: 'cashierName', Total: 'total', Date: 'date' };

      const paymentMethodByType = {
        'cash-sales': 'cash',
        'ecocash-sales': 'ecocash',
        'card-sales': 'card'
      };
      const selectedPayment = paymentMethodByType[type] || 'cash';

      const where = [`LOWER(COALESCE(s.payment_method, '')) = ?`];
      const params = [];
      params.push(selectedPayment);
      if (startDate) {
        where.push('DATE(s.created_at) >= ?');
        params.push(startDate);
      }
      if (endDate) {
        where.push('DATE(s.created_at) <= ?');
        params.push(endDate);
      }

      const [result] = await pool.query(
        `SELECT s.id AS saleId,
                COALESCE(u.name, 'Unknown') AS cashierName,
                s.total,
                s.created_at
         FROM sales s
         LEFT JOIN users u ON u.id = s.user_id
         WHERE ${where.join(' AND ')}
         ORDER BY s.created_at DESC`,
        params
      );

      rows = result.map(r => ({
        saleId: r.saleId,
        cashierName: r.cashierName,
        total: Number(r.total) || 0,
        date: new Date(r.created_at).toLocaleString()
      }));
    } else if (type === 'top-ten-products') {
      columns = ['Product', 'Quantity Sold', 'Sales Total', 'Estimated Profit'];
      columnMap = {
        Product: 'productName',
        'Quantity Sold': 'quantitySold',
        'Sales Total': 'salesTotal',
        'Estimated Profit': 'estimatedProfit'
      };

      const where = [];
      const params = [];
      if (startDate) {
        where.push('DATE(s.created_at) >= ?');
        params.push(startDate);
      }
      if (endDate) {
        where.push('DATE(s.created_at) <= ?');
        params.push(endDate);
      }

      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

      const [result] = await pool.query(
        `SELECT si.product_id AS productId,
                si.name AS productName,
                COALESCE(SUM(si.quantity), 0) AS quantitySold,
                COALESCE(SUM(si.quantity * si.price), 0) AS salesTotal,
                COALESCE(SUM(COALESCE(si.line_profit, si.quantity * (si.price - COALESCE(si.cost_price, 0)))), 0) AS estimatedProfit
         FROM sale_items si
         INNER JOIN sales s ON s.id = si.sale_id
         ${whereSql}
         GROUP BY si.product_id, si.name
         ORDER BY quantitySold DESC, salesTotal DESC
         LIMIT 10`,
        params
      );

      rows = result.map(r => ({
        productId: Number(r.productId) || 0,
        productName: r.productName || 'Unknown',
        quantitySold: Number(r.quantitySold) || 0,
        salesTotal: Number(r.salesTotal) || 0,
        estimatedProfit: Number(r.estimatedProfit) || 0
      }));
    } else if (type === 'audit-trail') {
      columns = ['Date', 'Actor', 'Event', 'Details'];
      columnMap = { Date: 'date', Actor: 'actor', Event: 'eventType', Details: 'details' };

      const where = [];
      const params = [];
      if (startDate) {
        where.push('DATE(created_at) >= ?');
        params.push(startDate);
      }
      if (endDate) {
        where.push('DATE(created_at) <= ?');
        params.push(endDate);
      }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

      const [result] = await pool.query(
        `SELECT event_type, actor, details_json, created_at
         FROM audit_logs
         ${whereSql}
         ORDER BY created_at DESC
         LIMIT 500`,
        params
      );

      rows = result.map(r => ({
        date: new Date(r.created_at).toLocaleString(),
        actor: r.actor || 'system',
        eventType: r.event_type,
        details: typeof r.details_json === 'string' ? r.details_json : JSON.stringify(r.details_json)
      }));
    } else if (type === 'end-of-day-profit') {
      columns = ['Date', 'Currency', 'Sales Total', 'Profit'];
      columnMap = { Date: 'date', Currency: 'currency', 'Sales Total': 'salesTotal', Profit: 'profit' };

      const reportDate = endDate || startDate || new Date().toISOString().slice(0, 10);

      const [usd] = await pool.query(
        `SELECT COALESCE(SUM(total), 0) AS salesTotal, COALESCE(SUM(profit), 0) AS profit
         FROM sales_usd WHERE DATE(created_at) = ?`,
        [reportDate]
      );
      const [zar] = await pool.query(
        `SELECT COALESCE(SUM(total), 0) AS salesTotal, COALESCE(SUM(profit), 0) AS profit
         FROM sales_zar WHERE DATE(created_at) = ?`,
        [reportDate]
      );
      const [zig] = await pool.query(
        `SELECT COALESCE(SUM(total), 0) AS salesTotal, COALESCE(SUM(profit), 0) AS profit
         FROM sales_zig WHERE DATE(created_at) = ?`,
        [reportDate]
      );

      rows = [
        { date: reportDate, currency: 'USD', salesTotal: Number(usd[0]?.salesTotal) || 0, profit: Number(usd[0]?.profit) || 0 },
        { date: reportDate, currency: 'ZAR', salesTotal: Number(zar[0]?.salesTotal) || 0, profit: Number(zar[0]?.profit) || 0 },
        { date: reportDate, currency: 'ZIG', salesTotal: Number(zig[0]?.salesTotal) || 0, profit: Number(zig[0]?.profit) || 0 }
      ];
    } else {
      return res.status(400).json({ error: 'Unsupported report type.' });
    }

    await logAudit('report.preview', 'admin', { type, startDate, endDate, rowCount: rows.length });

    res.json({
      type,
      range: { startDate, endDate },
      columns,
      columnMap,
      rows,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate report.' });
  }
});

app.get('/api/dashboard/profit', async (req, res) => {
  try {
    const reportDate = toIsoDate(req.query.date) || new Date().toISOString().slice(0, 10);
    const monthStart = `${reportDate.slice(0, 7)}-01`;
    const nextMonthDate = new Date(`${monthStart}T00:00:00`);
    nextMonthDate.setMonth(nextMonthDate.getMonth() + 1);
    const monthEndExclusive = nextMonthDate.toISOString().slice(0, 10);

    const [fxRows] = await pool.query('SELECT rate_usd, rate_zar, rate_zig, updated_at FROM exchange_settings WHERE id = 1 LIMIT 1');
    const fx = fxRows[0] || {};
    const rateUSD = Number(fx.rate_usd) > 0 ? Number(fx.rate_usd) : 1;
    const rateZAR = Number(fx.rate_zar) > 0 ? Number(fx.rate_zar) : 20;
    const rateZIG = Number(fx.rate_zig) > 0 ? Number(fx.rate_zig) : 400;

    const totalUsdExpr = `CASE currency_code
      WHEN 'USD' THEN total / ?
      WHEN 'ZAR' THEN total / ?
      WHEN 'ZIG' THEN total / ?
      ELSE total END`;
    const profitUsdExpr = `CASE currency_code
      WHEN 'USD' THEN profit / ?
      WHEN 'ZAR' THEN profit / ?
      WHEN 'ZIG' THEN profit / ?
      ELSE profit END`;

    const [summaryRows] = await pool.query(
      `SELECT COALESCE(SUM(${totalUsdExpr}), 0) AS totalSalesUsd,
              COALESCE(SUM(${profitUsdExpr}), 0) AS totalProfitUsd,
              COUNT(*) AS transactions
       FROM transactions
       WHERE DATE(created_at) = ?`,
      [rateUSD, rateZAR, rateZIG, rateUSD, rateZAR, rateZIG, reportDate]
    );

    const [byCurrencyRows] = await pool.query(
      `SELECT currency_code AS currency,
              COALESCE(SUM(total), 0) AS salesTotal,
              COALESCE(SUM(profit), 0) AS profit,
              COUNT(*) AS transactions
       FROM transactions
       WHERE DATE(created_at) = ?
       GROUP BY currency_code
       ORDER BY currency_code ASC`,
      [reportDate]
    );

    const [byCashierRows] = await pool.query(
      `SELECT COALESCE(u.name, 'Unknown') AS cashierName,
              COALESCE(SUM(CASE t.currency_code
                WHEN 'USD' THEN t.total / ?
                WHEN 'ZAR' THEN t.total / ?
                WHEN 'ZIG' THEN t.total / ?
                ELSE t.total END), 0) AS salesTotal,
              COALESCE(SUM(CASE t.currency_code
                WHEN 'USD' THEN t.profit / ?
                WHEN 'ZAR' THEN t.profit / ?
                WHEN 'ZIG' THEN t.profit / ?
                ELSE t.profit END), 0) AS profit,
              COUNT(*) AS transactions
       FROM transactions t
       LEFT JOIN users u ON u.id = t.user_id
       WHERE DATE(t.created_at) = ?
       GROUP BY COALESCE(u.name, 'Unknown')
       ORDER BY profit DESC`,
      [rateUSD, rateZAR, rateZIG, rateUSD, rateZAR, rateZIG, reportDate]
    );

    const [byPaymentRows] = await pool.query(
      `SELECT COALESCE(NULLIF(LOWER(t.payment_method), ''), 'unknown') AS paymentMethod,
              COALESCE(SUM(CASE t.currency_code
                WHEN 'USD' THEN t.total / ?
                WHEN 'ZAR' THEN t.total / ?
                WHEN 'ZIG' THEN t.total / ?
                ELSE t.total END), 0) AS salesTotal,
              COALESCE(SUM(CASE t.currency_code
                WHEN 'USD' THEN t.profit / ?
                WHEN 'ZAR' THEN t.profit / ?
                WHEN 'ZIG' THEN t.profit / ?
                ELSE t.profit END), 0) AS profit,
              COUNT(*) AS transactions
       FROM transactions t
       WHERE DATE(t.created_at) = ?
       GROUP BY COALESCE(NULLIF(LOWER(t.payment_method), ''), 'unknown')
       ORDER BY salesTotal DESC`,
      [rateUSD, rateZAR, rateZIG, rateUSD, rateZAR, rateZIG, reportDate]
    );

    const [monthSummaryRows] = await pool.query(
      `SELECT COALESCE(SUM(${totalUsdExpr}), 0) AS totalSalesUsd,
              COALESCE(SUM(${profitUsdExpr}), 0) AS totalProfitUsd,
              COUNT(*) AS transactions
       FROM transactions
       WHERE created_at >= ? AND created_at < ?`,
      [rateUSD, rateZAR, rateZIG, rateUSD, rateZAR, rateZIG, monthStart, monthEndExclusive]
    );

    const [lastAuditRows] = await pool.query(
      `SELECT created_at
       FROM audit_logs
       ORDER BY created_at DESC
       LIMIT 1`
    );

    await logAudit('dashboard.profit.view', 'admin', { date: reportDate });

    res.json({
      date: reportDate,
      summary: {
        totalSalesUsd: Number(summaryRows[0]?.totalSalesUsd) || 0,
        totalProfitUsd: Number(summaryRows[0]?.totalProfitUsd) || 0,
        transactions: Number(summaryRows[0]?.transactions) || 0,
        lastAuditAt: lastAuditRows[0]?.created_at ? new Date(lastAuditRows[0].created_at).toLocaleString() : null
      },
      monthSummary: {
        month: reportDate.slice(0, 7),
        totalSalesUsd: Number(monthSummaryRows[0]?.totalSalesUsd) || 0,
        totalProfitUsd: Number(monthSummaryRows[0]?.totalProfitUsd) || 0,
        transactions: Number(monthSummaryRows[0]?.transactions) || 0
      },
      ratesSnapshot: {
        USD: rateUSD,
        ZAR: rateZAR,
        ZIG: rateZIG,
        updatedAt: fx.updated_at || null
      },
      byCurrency: (byCurrencyRows || []).map(row => ({
        currency: row.currency,
        salesTotal: Number(row.salesTotal) || 0,
        profit: Number(row.profit) || 0,
        transactions: Number(row.transactions) || 0
      })),
      byPayment: (byPaymentRows || []).map(row => ({
        paymentMethod: row.paymentMethod,
        salesTotal: Number(row.salesTotal) || 0,
        profit: Number(row.profit) || 0,
        transactions: Number(row.transactions) || 0
      })),
      byCashier: (byCashierRows || []).map(row => ({
        cashierName: row.cashierName,
        salesTotal: Number(row.salesTotal) || 0,
        profit: Number(row.profit) || 0,
        transactions: Number(row.transactions) || 0
      }))
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load profit dashboard.' });
  }
});

app.post('/api/reports/email', async (req, res) => {
  try {
    const { email, report } = req.body || {};
    if (!email) {
      return res.status(400).json({ error: 'Email is required.' });
    }
    if (!report || !report.type) {
      return res.status(400).json({ error: 'Report payload is required.' });
    }

    const transport = getEmailTransport();
    if (!transport) {
      return res.status(500).json({ error: 'SMTP is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS, and SMTP_FROM.' });
    }

    const titleMap = {
      'sales-by-cashier': 'Sales Report by Cashier',
      'audit-trail': 'Audit Trail Log',
      'cash-sales': 'Cash Sales Report',
      'ecocash-sales': 'EcoCash Sales Report',
      'card-sales': 'Card Sales Report',
      'top-ten-products': 'Top 10 Products Report'
    };

    const reportTitle = titleMap[report.type] || 'POS Report';
    const rowsText = (report.rows || []).slice(0, 200).map((row, idx) => `${idx + 1}. ${JSON.stringify(row)}`).join('\n');
    const content = [
      `${reportTitle}`,
      `Range: ${report.range?.startDate || '-'} to ${report.range?.endDate || '-'}`,
      `Generated: ${report.generatedAt || new Date().toISOString()}`,
      '',
      'Rows:',
      rowsText || 'No data'
    ].join('\n');

    await transport.sendMail({
      from: SMTP_FROM,
      to: email,
      subject: `${reportTitle} (${new Date().toLocaleDateString()})`,
      text: content,
      attachments: [
        {
          filename: `${report.type}-${Date.now()}.txt`,
          content
        }
      ]
    });

    await logAudit('report.email.sent', 'admin', { type: report.type, email });
    res.json({ success: true, message: 'Report email sent successfully.' });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to send report email.' });
  }
});

app.get('/api/admin/exchange-settings', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM exchange_settings WHERE id = 1 LIMIT 1');
    if (!rows.length) return res.status(404).json({ message: 'Exchange settings not configured' });

    const r = rows[0];
    res.json({
      baseCurrency: r.base_currency,
      rates: {
        USD: Number(r.rate_usd),
        ZAR: Number(r.rate_zar),
        ZIG: Number(r.rate_zig)
      },
      defaultTaxRatePercent: Number(r.default_tax_rate_percent),
      allowTaxExemptProducts: !!r.allow_tax_exempt_products,
      updatedAt: r.updated_at
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load exchange settings.' });
  }
});

app.post('/api/security/session/ping', async (req, res) => {
  try {
    const sessionId = Number(req.body?.sessionId || 0);
    const userId = Number(req.body?.userId || 0);
    if (!sessionId || !userId) {
      return res.status(400).json({ error: 'sessionId and userId are required.' });
    }

    const [result] = await pool.query(
      'UPDATE login_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND is_active = 1',
      [sessionId, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Session not found or inactive.' });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update session heartbeat.' });
  }
});

app.post('/api/security/session/logout', async (req, res) => {
  try {
    const sessionId = Number(req.body?.sessionId || 0);
    const userId = Number(req.body?.userId || 0);
    if (!sessionId || !userId) {
      return res.status(400).json({ error: 'sessionId and userId are required.' });
    }

    await pool.query(
      'UPDATE login_sessions SET is_active = 0, logout_at = NOW(), last_seen_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
      [sessionId, userId]
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to close session.' });
  }
});

app.get('/api/admin/security/sessions', async (req, res) => {
  try {
    const canView = await ensureActorHasPermissions(req, ['manage_user_permissions']);
    if (!canView) {
      return res.status(403).json({ error: 'Not allowed to view security sessions.' });
    }

    const [rows] = await pool.query(
      `SELECT id, user_id, username, user_name, user_role, ip_address, device_name, user_agent, is_active, login_at, last_seen_at, logout_at
       FROM login_sessions
       ORDER BY login_at DESC
       LIMIT 200`
    );

    res.json(rows.map(mapLoginSessionRow));
  } catch (error) {
    res.status(500).json({ error: 'Failed to load login sessions.' });
  }
});

app.get('/api/admin/company-profile', async (req, res) => {
  try {
    const canView = await ensureActorHasPermissions(req, ['manage_company_settings']);
    if (!canView) {
      return res.status(403).json({ error: 'Not allowed to view company profile.' });
    }

    const [rows] = await pool.query('SELECT * FROM company_profile WHERE id = 1 LIMIT 1');
    const profile = rows[0] ? mapCompanyProfileRow(rows[0]) : { ...DEFAULT_COMPANY_PROFILE };
    res.json(profile);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load company profile.' });
  }
});

app.put('/api/admin/company-profile', async (req, res) => {
  try {
    const canEdit = await ensureActorHasPermissions(req, ['manage_company_settings']);
    if (!canEdit) {
      return res.status(403).json({ error: 'Not allowed to update company profile.' });
    }

    const [rows] = await pool.query('SELECT * FROM company_profile WHERE id = 1 LIMIT 1');
    const current = rows[0] ? mapCompanyProfileRow(rows[0]) : { ...DEFAULT_COMPANY_PROFILE };
    const next = sanitizeCompanyProfilePayload(req.body?.companyProfile || {}, current);

    await pool.query(
      `INSERT INTO company_profile
        (id, legal_name, trading_name, edition, support_phone, support_email, website, address_line, city, country, vat_number, tin_number, registration_number)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        legal_name = VALUES(legal_name),
        trading_name = VALUES(trading_name),
        edition = VALUES(edition),
        support_phone = VALUES(support_phone),
        support_email = VALUES(support_email),
        website = VALUES(website),
        address_line = VALUES(address_line),
        city = VALUES(city),
        country = VALUES(country),
        vat_number = VALUES(vat_number),
        tin_number = VALUES(tin_number),
        registration_number = VALUES(registration_number)`,
      [
        next.legalName,
        next.tradingName,
        next.edition,
        next.supportPhone,
        next.supportEmail,
        next.website,
        next.addressLine,
        next.city,
        next.country,
        next.vatNumber,
        next.tinNumber,
        next.registrationNumber
      ]
    );

    const actorId = Number(req.body?.actorId || 0);
    await logAudit('admin.company-profile.updated', String(actorId || 'admin'), {
      legalName: next.legalName,
      edition: next.edition,
      supportPhone: next.supportPhone
    });

    const [updatedRows] = await pool.query('SELECT * FROM company_profile WHERE id = 1 LIMIT 1');
    res.json(mapCompanyProfileRow(updatedRows[0]));
  } catch (error) {
    res.status(500).json({ error: 'Failed to save company profile.' });
  }
});

app.get('/api/receipt-settings', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM receipt_settings WHERE id = 1 LIMIT 1');
    if (!rows.length) {
      return res.status(404).json({ error: 'Receipt settings not configured.' });
    }

    res.json(mapReceiptSettingsRow(rows[0]));
  } catch (error) {
    res.status(500).json({ error: 'Failed to load receipt settings.' });
  }
});

app.get('/api/admin/receipt-settings', async (req, res) => {
  try {
    const canView = await ensureActorHasPermissions(req, ['manage_company_settings']);
    const canViewFormat = await ensureActorHasPermissions(req, ['edit_receipt_format']);

    if (!canView && !canViewFormat) {
      return res.status(403).json({ error: 'Not allowed to view receipt settings.' });
    }

    const [rows] = await pool.query('SELECT * FROM receipt_settings WHERE id = 1 LIMIT 1');
    if (!rows.length) {
      return res.status(404).json({ error: 'Receipt settings not configured.' });
    }

    res.json(mapReceiptSettingsRow(rows[0]));
  } catch (error) {
    res.status(500).json({ error: 'Failed to load admin receipt settings.' });
  }
});

app.put('/api/admin/receipt-settings', async (req, res) => {
  try {
    const hasCompanyPayload = req.body && typeof req.body.company === 'object' && req.body.company !== null;
    const hasFormatPayload = req.body && typeof req.body.receiptFormat === 'object' && req.body.receiptFormat !== null;

    if (!hasCompanyPayload && !hasFormatPayload) {
      return res.status(400).json({ error: 'Provide company and/or receiptFormat payload.' });
    }

    const requiredPermissions = [];
    if (hasCompanyPayload) requiredPermissions.push('manage_company_settings');
    if (hasFormatPayload) requiredPermissions.push('edit_receipt_format');

    const canEdit = await ensureActorHasPermissions(req, requiredPermissions);
    if (!canEdit) {
      return res.status(403).json({ error: 'Not allowed to update these receipt settings.' });
    }

    const [rows] = await pool.query('SELECT * FROM receipt_settings WHERE id = 1 LIMIT 1');
    const current = rows[0] ? mapReceiptSettingsRow(rows[0]) : { ...DEFAULT_RECEIPT_SETTINGS };

    const mergedPayload = {
      ...current,
      ...(hasCompanyPayload ? req.body.company : {}),
      ...(hasFormatPayload ? req.body.receiptFormat : {})
    };

    const next = sanitizeReceiptSettingsPayload(mergedPayload, current);

    await pool.query(
      `INSERT INTO receipt_settings
        (id, company_name, company_address, vat_number, tin_number, receipt_header, receipt_footer, receipt_extra, show_company_details, show_cashier, show_datetime)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        company_name = VALUES(company_name),
        company_address = VALUES(company_address),
        vat_number = VALUES(vat_number),
        tin_number = VALUES(tin_number),
        receipt_header = VALUES(receipt_header),
        receipt_footer = VALUES(receipt_footer),
        receipt_extra = VALUES(receipt_extra),
        show_company_details = VALUES(show_company_details),
        show_cashier = VALUES(show_cashier),
        show_datetime = VALUES(show_datetime)`,
      [
        next.companyName,
        next.companyAddress,
        next.vatNumber,
        next.tinNumber,
        next.receiptHeader,
        next.receiptFooter,
        next.receiptExtra,
        next.showCompanyDetails ? 1 : 0,
        next.showCashier ? 1 : 0,
        next.showDateTime ? 1 : 0
      ]
    );

    const actorId = Number(req.body?.actorId || 0);
    await logAudit('admin.receipt-settings.updated', String(actorId || 'admin'), {
      companyUpdated: hasCompanyPayload,
      formatUpdated: hasFormatPayload
    });

    const [updatedRows] = await pool.query('SELECT * FROM receipt_settings WHERE id = 1 LIMIT 1');
    res.json(mapReceiptSettingsRow(updatedRows[0]));
  } catch (error) {
    res.status(500).json({ error: 'Failed to save receipt settings.' });
  }
});

app.put('/api/admin/exchange-settings', async (req, res) => {
  try {
    const { baseCurrency, rates, defaultTaxRatePercent, allowTaxExemptProducts } = req.body || {};
    const allowed = ['USD', 'ZAR', 'ZIG'];

    if (!allowed.includes(baseCurrency)) {
      return res.status(400).json({ message: 'Invalid baseCurrency' });
    }

    const rateUSD = Number(rates?.USD);
    const rateZAR = Number(rates?.ZAR);
    const rateZIG = Number(rates?.ZIG);

    if (![rateUSD, rateZAR, rateZIG].every(v => Number.isFinite(v) && v > 0)) {
      return res.status(400).json({ message: 'Invalid rates' });
    }

    await pool.query(
      `INSERT INTO exchange_settings
        (id, base_currency, rate_usd, rate_zar, rate_zig, default_tax_rate_percent, allow_tax_exempt_products)
       VALUES (1, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        base_currency = VALUES(base_currency),
        rate_usd = VALUES(rate_usd),
        rate_zar = VALUES(rate_zar),
        rate_zig = VALUES(rate_zig),
        default_tax_rate_percent = VALUES(default_tax_rate_percent),
        allow_tax_exempt_products = VALUES(allow_tax_exempt_products)`,
      [
        baseCurrency,
        rateUSD,
        rateZAR,
        rateZIG,
        Number(defaultTaxRatePercent || 0),
        allowTaxExemptProducts ? 1 : 0
      ]
    );

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: 'Failed to save exchange settings.' });
  }
});

app.get('/api/exchange-rates/current', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM exchange_settings WHERE id = 1 LIMIT 1');
    if (!rows.length) return res.status(404).json({ message: 'Exchange settings not configured' });

    const r = rows[0];
    res.json({
      baseCurrency: r.base_currency,
      rates: {
        USD: Number(r.rate_usd),
        ZAR: Number(r.rate_zar),
        ZIG: Number(r.rate_zig)
      },
      defaultTaxRatePercent: Number(r.default_tax_rate_percent),
      allowTaxExemptProducts: !!r.allow_tax_exempt_products,
      updatedAt: r.updated_at
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load current exchange rates.' });
  }
});

async function startServer() {
  try {
    await initDatabase();
    app.listen(PORT, () => {
      console.log(`POS System running at http://localhost:${PORT}`);
      console.log(`Using MySQL database: ${DB_NAME} at ${DB_HOST}:${DB_PORT}`);
    });
  } catch (error) {
    console.error('Failed to initialize MySQL connection:', error.message);
    process.exit(1);
  }
}

startServer();
