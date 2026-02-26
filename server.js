const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mysql = require('mysql2/promise');
const nodemailer = require('nodemailer');

const app = express();
const PORT = 3000;
const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = Number(process.env.DB_PORT || 3306);
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'pos_system';
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || 'no-reply@pos.local';
let pool;

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

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

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
      items_count INT NOT NULL DEFAULT 0,
      payment_method VARCHAR(50) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_sales_user_id (user_id)
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

  const [userRows] = await pool.query('SELECT COUNT(*) AS count FROM users');
  if ((userRows[0]?.count || 0) === 0) {
    await pool.query(
      'INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)',
      ['admin', 'admin123', 'Admin User', 'admin']
    );
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
      'SELECT id, username, password, name, role FROM users WHERE username = ? LIMIT 1',
      [username]
    );

    const user = rows[0];
    if (!user || user.password !== password) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    await logAudit('auth.login.success', username, { userId: user.id });
    res.json({ id: user.id, username: user.username, name: user.name, role: user.role });
  } catch (error) {
    await logAudit('auth.login.failed', req.body?.username || 'unknown', { reason: error.message });
    res.status(500).json({ error: 'Failed to process login.' });
  }
});

// Register endpoint
app.post('/api/register', async (req, res) => {
  try {
    const { username, password, name } = req.body;
    if (!username || !password || !name) {
      return res.status(400).json({ error: 'All fields required' });
    }

    const [result] = await pool.query(
      'INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)',
      [username, password, name, 'cashier']
    );

    await logAudit('user.create', username, { createdUserId: result.insertId, name });
    res.status(201).json({ id: result.insertId, username, name, role: 'cashier' });
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
      'SELECT id, username, name, role, created_at FROM users WHERE id = ? LIMIT 1',
      [Number(req.params.id)]
    );

    if (!rows[0]) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve user.' });
  }
});


// --- API Endpoints ---

// Get all products
app.get('/api/products', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, sku, barcode, hscode, price, stock, unit, category, created_at FROM products ORDER BY name ASC'
    );
    res.json(rows.map(row => ({
      ...row,
      price: Number(row.price) || 0,
      stock: Number(row.stock) || 0
    })));
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve products.' });
  }
});

// Add a new product
app.post('/api/products', async (req, res) => {
  try {
    const { name, price, category, stock, unit, barcode, hscode, sku } = req.body;
    if (!name || price === undefined) {
      return res.status(400).json({ error: 'Name and price are required' });
    }

    const [result] = await pool.query(
      'INSERT INTO products (name, price, category, stock, unit, barcode, hscode, sku) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [name, price, category || '', Number(stock) || 0, unit || 'item', barcode || '', hscode || '', sku || null]
    );

    const [rows] = await pool.query(
      'SELECT id, name, sku, barcode, hscode, price, stock, unit, category, created_at FROM products WHERE id = ?',
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
      'SELECT id, name, sku, barcode, hscode, price, stock, unit, category, created_at FROM products WHERE id = ?',
      [productId]
    );
    await logAudit('product.stock.update', 'api', { productId, quantityAdded: qty });
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update product stock.' });
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
    const { items, tax, total, userId, paymentMethod } = req.body;
    if (!items || !items.length) {
      return res.status(400).json({ error: 'Sale must include items' });
    }

    await conn.beginTransaction();

    const normalizedItems = [];
    for (const item of items) {
      const productId = Number(item.id);
      const requestedQty = Number(item.quantity) || 0;
      if (!productId || requestedQty <= 0) {
        throw new Error('Invalid sale item payload.');
      }

      const [rows] = await conn.query(
        'SELECT id, name, price, stock, barcode, hscode FROM products WHERE id = ? FOR UPDATE',
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

      normalizedItems.push({
        id: product.id,
        name: product.name,
        price: Number(item.price ?? product.price),
        quantity: requestedQty,
        barcode: product.barcode || '',
        hscode: product.hscode || ''
      });
    }

    const [saleResult] = await conn.query(
      'INSERT INTO sales (user_id, total, tax, items_count, payment_method) VALUES (?, ?, ?, ?, ?)',
      [Number(userId) || null, Number(total) || 0, Number(tax) || 0, normalizedItems.length, paymentMethod || null]
    );

    for (const item of normalizedItems) {
      await conn.query(
        'INSERT INTO sale_items (sale_id, product_id, name, quantity, price, barcode, hscode) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [saleResult.insertId, item.id, item.name, item.quantity, item.price, item.barcode, item.hscode]
      );

      await conn.query(
        'UPDATE products SET stock = stock - ? WHERE id = ?',
        [item.quantity, item.id]
      );
    }

    await conn.commit();
    await logAudit('sale.complete', String(userId || 'unknown'), {
      saleId: saleResult.insertId,
      itemCount: normalizedItems.length,
      paymentMethod: paymentMethod || null,
      total: Number(total) || 0
    });
    res.status(201).json({
      id: saleResult.insertId,
      userId: Number(userId) || null,
      total: Number(total) || 0,
      tax: Number(tax) || 0,
      items_count: normalizedItems.length,
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
      `SELECT s.id, s.user_id AS userId, s.total, s.tax, s.items_count, s.payment_method, s.created_at,
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
      'SELECT id, name, sku, barcode, hscode, price, stock, unit, category, created_at FROM products WHERE id = ? LIMIT 1',
      [productId]
    );
    const current = rows[0];

    if (!current) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    const next = {
      name: req.body.name ?? current.name,
      price: req.body.price ?? current.price,
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
       SET name = ?, price = ?, category = ?, unit = ?, stock = ?, barcode = ?, hscode = ?, sku = ?
       WHERE id = ?`,
      [next.name, next.price, next.category, next.unit, Number(next.stock) || 0, next.barcode, next.hscode, next.sku, productId]
    );

    const [updatedRows] = await pool.query(
      'SELECT id, name, sku, barcode, hscode, price, stock, unit, category, created_at FROM products WHERE id = ? LIMIT 1',
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
    } else if (type === 'cash-sales') {
      columns = ['Sale ID', 'Cashier', 'Total', 'Date'];
      columnMap = { 'Sale ID': 'saleId', Cashier: 'cashierName', Total: 'total', Date: 'date' };

      const where = [`LOWER(COALESCE(s.payment_method, '')) = 'cash'`];
      const params = [];
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
      'cash-sales': 'Cash Sales Report'
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
