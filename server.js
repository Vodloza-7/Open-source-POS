const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// --- JSON Database Helper Functions ---
const DB_PATH = path.join(__dirname, 'db');
const USERS_FILE = path.join(DB_PATH, 'users.json');
const PRODUCTS_FILE = path.join(DB_PATH, 'products.json');
const SALES_FILE = path.join(DB_PATH, 'sales.json');

// Helper to read JSON file
async function readDb(file) {
  try {
    await fs.access(file);
    const data = await fs.readFile(file, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    // If file doesn't exist, return default structure
    if (file.includes('users')) return [{ id: 1, username: 'admin', password: 'admin123', name: 'Admin User', role: 'admin' }];
    return [];
  }
}

// Helper to write JSON file
async function writeDb(file, data) {
  await fs.mkdir(DB_PATH, { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf-8');
}

// --- Authentication Endpoints ---

// Login endpoint
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const users = await readDb(USERS_FILE);
  const user = users.find(u => u.username === username && u.password === password);

  if (user) {
    res.json({ id: user.id, username: user.username, name: user.name, role: user.role });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// Register endpoint
app.post('/api/register', async (req, res) => {
  const { username, password, name } = req.body;
  if (!username || !password || !name) {
    return res.status(400).json({ error: 'All fields required' });
  }

  const users = await readDb(USERS_FILE);
  if (users.find(u => u.username === username)) {
    return res.status(409).json({ error: 'Username already exists' });
  }

  const newUser = {
    id: users.length > 0 ? Math.max(...users.map(u => u.id)) + 1 : 1,
    username,
    password,
    name,
    role: 'cashier'
  };

  users.push(newUser);
  await writeDb(USERS_FILE, users);
  res.status(201).json({ id: newUser.id, username: newUser.username, name: newUser.name, role: newUser.role });
});

// Get user info
app.get('/api/user/:id', async (req, res) => {
    const users = await readDb(USERS_FILE);
    const user = users.find(u => u.id === parseInt(req.params.id));
    if (user) res.json(user);
    else res.status(404).json({ error: 'User not found' });
});


// --- API Endpoints ---

// Get all products
app.get('/api/products', async (req, res) => {
  const products = await readDb(PRODUCTS_FILE);
  res.json(products);
});

// Add a new product
app.post('/api/products', async (req, res) => {
  const { name, price, category, stock, unit } = req.body;
  if (!name || price === undefined) {
      return res.status(400).json({ error: 'Name and price are required' });
  }

  const products = await readDb(PRODUCTS_FILE);
  const newProduct = {
    id: products.length > 0 ? Math.max(...products.map(p => p.id)) + 1 : 1,
    name,
    price,
    unit: unit || 'item',
    category: category || '',
    stock: stock || 0,
    created_at: new Date().toISOString()
  };

  products.push(newProduct);
  await writeDb(PRODUCTS_FILE, products);
  res.status(201).json(newProduct);
});

// Update product stock
app.patch('/api/products/:id/stock', async (req, res) => {
  const productId = parseInt(req.params.id);
  const { quantity } = req.body;

  if (!quantity || quantity <= 0) {
    return res.status(400).json({ error: 'Invalid quantity provided.' });
  }

  const products = await readDb(PRODUCTS_FILE);
  const productIndex = products.findIndex(p => p.id === productId);

  if (productIndex === -1) {
    return res.status(404).json({ error: 'Product not found.' });
  }

  products[productIndex].stock += quantity;

  await writeDb(PRODUCTS_FILE, products);
  res.json(products[productIndex]);
});

// Delete a product
app.delete('/api/products/:id', async (req, res) => {
  const productId = parseInt(req.params.id);
  const products = await readDb(PRODUCTS_FILE);
  const nextProducts = products.filter(p => p.id !== productId);

  if (nextProducts.length === products.length) {
    return res.status(404).json({ error: 'Product not found.' });
  }

  await writeDb(PRODUCTS_FILE, nextProducts);
  res.json({ success: true });
});

// Complete a sale
app.post('/api/sales', async (req, res) => {
  const { items, subtotal, tax, total, userId } = req.body;
  if (!items || !items.length) {
      return res.status(400).json({ error: 'Sale must include items' });
  }

  const sales = await readDb(SALES_FILE);
  const newSale = {
    id: sales.length > 0 ? Math.max(...sales.map(s => s.id)) + 1 : 1,
    userId,
    total,
    tax,
    items_count: items.length,
    items,
    created_at: new Date().toISOString()
  };

  sales.push(newSale);
  await writeDb(SALES_FILE, sales);
  res.status(201).json(newSale);
});

// Get sales history
app.get('/api/sales', async (req, res) => {
  const sales = await readDb(SALES_FILE);
  const users = await readDb(USERS_FILE);

  // Add cashier name to each sale object
  const salesWithCashier = sales.map(sale => {
    const cashier = users.find(u => u.id === sale.userId);
    return {
      ...sale,
      cashierName: cashier ? cashier.name : 'Unknown'
    };
  });

  res.json(salesWithCashier.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 50));
});

// Update product fields
app.patch('/api/products/:id', async (req, res) => {
  const productId = parseInt(req.params.id);
  const { name, price, category, unit, stock } = req.body;

  const products = await readDb(PRODUCTS_FILE);
  const productIndex = products.findIndex(p => p.id === productId);

  if (productIndex === -1) {
    return res.status(404).json({ error: 'Product not found.' });
  }

  const current = products[productIndex];
  const next = {
    ...current,
    name: name ?? current.name,
    price: price ?? current.price,
    category: category ?? current.category,
    unit: unit ?? current.unit,
    stock: stock ?? current.stock
  };

  if (!next.name || next.price === undefined) {
    return res.status(400).json({ error: 'Name and price are required.' });
  }

  products[productIndex] = next;
  await writeDb(PRODUCTS_FILE, products);
  res.json(next);
});

app.listen(PORT, () => {
  console.log(`POS System running at http://localhost:${PORT}`);
});
