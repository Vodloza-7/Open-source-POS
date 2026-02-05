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
const NOTIFICATIONS_FILE = path.join(DB_PATH, 'notifications.json');

function getDefaultProducts() {
  return [
    { id: 1, name: 'Rice 5kg', price: 12.99, unit: 'bag', category: 'Groceries', stock: 50, barcode: '100000000001', hscode: '1006.30' },
    { id: 2, name: 'Cooking Oil 2L', price: 8.5, unit: 'bottle', category: 'Groceries', stock: 30, barcode: '100000000002', hscode: '1512.11' },
    { id: 3, name: 'Sugar 1kg', price: 3.25, unit: 'pack', category: 'Groceries', stock: 75, barcode: '100000000003', hscode: '1701.99' },
    { id: 4, name: 'Milk 1L', price: 4.99, unit: 'carton', category: 'Dairy', stock: 40, barcode: '100000000004', hscode: '0401.20' },
    { id: 5, name: 'Bread', price: 2.5, unit: 'loaf', category: 'Bakery', stock: 60, barcode: '100000000005', hscode: '1905.90' }
  ];
}

// Helper to read JSON file
async function readDb(file) {
  try {
    await fs.access(file);
    const data = await fs.readFile(file, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }

    if (file.includes('users')) {
      const defaults = [{ id: 1, username: 'admin', password: 'admin123', name: 'Admin User', role: 'admin' }];
      await writeDb(file, defaults);
      return defaults;
    }

    if (file.includes('products')) {
      const defaults = getDefaultProducts();
      await writeDb(file, defaults);
      return defaults;
    }

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
  const { name, price, category, stock, unit, barcode, hscode } = req.body;
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
    barcode: barcode || '',
    hscode: hscode || '',
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

  const products = await readDb(PRODUCTS_FILE);
  const productById = new Map(products.map(p => [p.id, p]));

  for (const item of items) {
    const product = productById.get(item.id);
    if (!product) {
      return res.status(404).json({ error: `Product not found for item id ${item.id}` });
    }
    const requestedQty = Number(item.quantity) || 0;
    const available = Number(product.stock) || 0;
    if (requestedQty <= 0) {
      return res.status(400).json({ error: `Invalid quantity for ${product.name}` });
    }
    if (requestedQty > available) {
      return res.status(400).json({ error: `Insufficient stock for ${product.name}` });
    }
  }

  const normalizedItems = items.map(item => {
    const product = productById.get(item.id);
    const qty = Number(item.quantity) || 0;
    product.stock = Math.max(0, (Number(product.stock) || 0) - qty);

    return {
      id: product.id,
      name: product.name,
      price: item.price ?? product.price,
      quantity: qty,
      barcode: product.barcode || '',
      hscode: product.hscode || ''
    };
  });

  const sales = await readDb(SALES_FILE);
  const newSale = {
    id: sales.length > 0 ? Math.max(...sales.map(s => s.id)) + 1 : 1,
    userId,
    total,
    tax,
    items_count: normalizedItems.length,
    items: normalizedItems,
    created_at: new Date().toISOString()
  };

  await writeDb(PRODUCTS_FILE, products);

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
  const { name, price, category, unit, stock, barcode, hscode } = req.body;

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
    stock: stock ?? current.stock,
    barcode: barcode ?? current.barcode ?? '',
    hscode: hscode ?? current.hscode ?? ''
  };

  if (!next.name || next.price === undefined) {
    return res.status(400).json({ error: 'Name and price are required.' });
  }

  products[productIndex] = next;
  await writeDb(PRODUCTS_FILE, products);
  res.json(next);
});

// Stock Alert Notification
app.post('/api/notifications/stock-alert', async (req, res) => {
  const { items, cashier, timestamp } = req.body;
  
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Items array is required.' });
  }

  try {
    const notifications = await readDb(NOTIFICATIONS_FILE);
    
    const newNotification = {
      id: notifications.length > 0 ? Math.max(...notifications.map(n => n.id)) + 1 : 1,
      type: 'stock_alert',
      status: 'pending',
      cashier: cashier || 'Unknown',
      items: items.map(item => ({
        id: item.id,
        name: item.name,
        available: item.available,
        needed: item.needed,
        shortage: item.shortage,
        barcode: item.barcode || '',
        hscode: item.hscode || ''
      })),
      timestamp: timestamp || new Date().toISOString(),
      created_at: new Date().toISOString()
    };

    notifications.push(newNotification);
    await writeDb(NOTIFICATIONS_FILE, notifications);

    console.log(`\n📧 STOCK ALERT NOTIFICATION:`);
    console.log(`   Cashier: ${cashier}`);
    console.log(`   Items short of stock: ${items.length}`);
    items.forEach(item => {
      console.log(`     - ${item.name}: Need ${item.needed}, Have ${item.available}, Short ${item.shortage}`);
    });
    console.log(`   Timestamp: ${new Date().toLocaleString()}`);
    console.log(`   [SUPERVISOR SHOULD BE NOTIFIED]\n`);

    res.status(201).json({
      success: true,
      message: 'Stock alert notification sent to supervisor',
      notificationId: newNotification.id
    });
  } catch (error) {
    console.error('Error saving notification:', error);
    res.status(500).json({ error: 'Failed to send notification.' });
  }
});

// Get Notifications (for supervisor dashboard)
app.get('/api/notifications', async (req, res) => {
  try {
    const notifications = await readDb(NOTIFICATIONS_FILE);
    const sorted = notifications.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    res.json(sorted);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve notifications.' });
  }
});

// Mark Notification as Resolved
app.patch('/api/notifications/:id', async (req, res) => {
  const notificationId = parseInt(req.params.id);
  const { status } = req.body;

  try {
    const notifications = await readDb(NOTIFICATIONS_FILE);
    const notification = notifications.find(n => n.id === notificationId);

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found.' });
    }

    notification.status = status || 'resolved';
    notification.resolved_at = new Date().toISOString();

    await writeDb(NOTIFICATIONS_FILE, notifications);
    res.json(notification);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update notification.' });
  }
});

app.listen(PORT, () => {
  console.log(`POS System running at http://localhost:${PORT}`);
});
