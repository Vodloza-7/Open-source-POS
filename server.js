const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Initialize SQLite database
const db = new sqlite3.Database('./pos.db', (err) => {
  if (err) console.error('Database error:', err);
  else console.log('Connected to SQLite database');
});

// Create users table
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT DEFAULT 'cashier',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Create products table
db.run(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    category TEXT,
    stock INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Create sales table
db.run(`
  CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    total REAL NOT NULL,
    tax REAL NOT NULL,
    items_count INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`);

// Create sale_items table
db.run(`
  CREATE TABLE IF NOT EXISTS sale_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER,
    product_id INTEGER,
    quantity INTEGER,
    price REAL,
    FOREIGN KEY (sale_id) REFERENCES sales(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
  )
`);

// Initialize default user
db.run(`
  INSERT OR IGNORE INTO users (username, password, name, role) 
  VALUES ('admin', 'admin123', 'Admin User', 'admin')
`);

// Authentication Endpoints

// Login endpoint
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  
  db.get(
    'SELECT id, username, name, role FROM users WHERE username = ? AND password = ?',
    [username, password],
    (err, user) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else if (user) {
        res.json({ 
          id: user.id, 
          username: user.username, 
          name: user.name, 
          role: user.role 
        });
      } else {
        res.status(401).json({ error: 'Invalid credentials' });
      }
    }
  );
});

// Register endpoint
app.post('/api/register', (req, res) => {
  const { username, password, name } = req.body;
  
  if (!username || !password || !name) {
    return res.status(400).json({ error: 'All fields required' });
  }
  
  db.run(
    'INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)',
    [username, password, name, 'cashier'],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({ 
          id: this.lastID, 
          username, 
          name, 
          role: 'cashier' 
        });
      }
    }
  );
});

// Get user info
app.get('/api/user/:id', (req, res) => {
  db.get(
    'SELECT id, username, name, role FROM users WHERE id = ?',
    [req.params.id],
    (err, user) => {
      if (err) res.status(500).json({ error: err.message });
      else if (user) res.json(user);
      else res.status(404).json({ error: 'User not found' });
    }
  );
});

// API Endpoints

// Get all products
app.get('/api/products', (req, res) => {
  db.all('SELECT * FROM products', (err, rows) => {
    if (err) res.status(500).json({ error: err.message });
    else res.json(rows);
  });
});

// Add a new product
app.post('/api/products', (req, res) => {
  const { name, price, category, stock } = req.body;
  db.run(
    'INSERT INTO products (name, price, category, stock) VALUES (?, ?, ?, ?)',
    [name, price, category, stock],
    function(err) {
      if (err) res.status(500).json({ error: err.message });
      else res.json({ id: this.lastID, name, price, category, stock });
    }
  );
});

// Complete a sale
app.post('/api/sales', (req, res) => {
  const { items, subtotal, tax, total, userId } = req.body;
  
  db.run(
    'INSERT INTO sales (user_id, total, tax, items_count) VALUES (?, ?, ?, ?)',
    [userId, total, tax, items.length],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      
      const saleId = this.lastID;
      
      // Insert sale items
      items.forEach(item => {
        db.run(
          'INSERT INTO sale_items (sale_id, product_id, quantity, price) VALUES (?, ?, ?, ?)',
          [saleId, item.id, item.quantity, item.price]
        );
      });
      
      res.json({ id: saleId, total, tax, items_count: items.length });
    }
  );
});

// Get sales history
app.get('/api/sales', (req, res) => {
  db.all('SELECT * FROM sales ORDER BY created_at DESC LIMIT 50', (err, rows) => {
    if (err) res.status(500).json({ error: err.message });
    else res.json(rows);
  });
});

app.listen(PORT, () => {
  console.log(`POS System running at http://localhost:${PORT}`);
});
