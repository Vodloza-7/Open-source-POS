const TAX_RATE = 0.10; // 10% tax
let cart = [];
let products = [];
let currentUser = null;

// DOM Elements
const loginPage = document.getElementById('loginPage');
const mainApp = document.getElementById('mainApp');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const logoutBtn = document.getElementById('logoutBtn');

const posInterface = document.getElementById('posInterface');
const productsInterface = document.getElementById('productsInterface');
const productsList = document.getElementById('productsList');
const cartItems = document.getElementById('cartItems');
const subtotalEl = document.getElementById('subtotal');
const taxAmountEl = document.getElementById('taxAmount');
const totalEl = document.getElementById('total');

// Login Form Handler
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  
  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      currentUser = data;
      localStorage.setItem('user', JSON.stringify(data));
      loginError.classList.remove('show');
      showMainApp();
      loadProducts();
    } else {
      loginError.textContent = data.error || 'Invalid credentials';
      loginError.classList.add('show');
    }
  } catch (error) {
    console.error('Login error:', error);
    loginError.textContent = 'Connection error';
    loginError.classList.add('show');
  }
});

// Logout Handler
logoutBtn.addEventListener('click', () => {
  currentUser = null;
  localStorage.removeItem('user');
  loginPage.classList.add('active');
  mainApp.classList.remove('active');
  loginForm.reset();
});

// Show main app and hide login
function showMainApp() {
  loginPage.classList.remove('active');
  mainApp.classList.add('active');
  updateUserDisplay();
  posInterface.classList.add('active');
}

// Update user display in header
function updateUserDisplay() {
  if (currentUser) {
    document.getElementById('userName').textContent = currentUser.name;
    document.getElementById('userRole').textContent = `[${currentUser.role}]`;
  }
}

// Update date and time
function updateDateTime() {
  const now = new Date();
  
  const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const dateStr = now.toLocaleDateString('en-US', dateOptions);
  document.getElementById('currentDate').textContent = dateStr;
  
  const timeStr = now.toLocaleTimeString('en-US', { hour12: true });
  document.getElementById('currentTime').textContent = timeStr;
}

// Update time every second
setInterval(updateDateTime, 1000);

// Button Events
document.getElementById('newSaleBtn').addEventListener('click', () => {
  posInterface.classList.add('active');
  productsInterface.classList.remove('active');
  loadProducts();
});

document.getElementById('productsBtn').addEventListener('click', () => {
  productsInterface.classList.add('active');
  posInterface.classList.remove('active');
  loadProductsTable();
});

document.getElementById('backBtn').addEventListener('click', () => {
  posInterface.classList.add('active');
  productsInterface.classList.remove('active');
});

document.getElementById('clearCartBtn').addEventListener('click', clearCart);
document.getElementById('completeBtn').addEventListener('click', completeSale);

// Form submission
document.getElementById('addProductForm').addEventListener('submit', addProduct);

// Load products from API
async function loadProducts() {
  try {
    const response = await fetch('/api/products');
    products = await response.json();
    displayProducts();
  } catch (error) {
    console.error('Error loading products:', error);
  }
}

// Display products as cards
function displayProducts() {
  productsList.innerHTML = products.map(product => `
    <div class="product-card" onclick="addToCart(${product.id})">
      <h4>${product.name}</h4>
      <div class="price">$${product.price.toFixed(2)}</div>
      <div class="stock">Stock: ${product.stock}</div>
      <button type="button">Add to Cart</button>
    </div>
  `).join('');
}

// Add item to cart
function addToCart(productId) {
  const product = products.find(p => p.id === productId);
  if (!product) return;

  const existingItem = cart.find(item => item.id === productId);
  
  if (existingItem) {
    existingItem.quantity++;
  } else {
    cart.push({
      id: productId,
      name: product.name,
      price: product.price,
      quantity: 1
    });
  }
  
  updateCart();
}

// Remove item from cart
function removeFromCart(productId) {
  cart = cart.filter(item => item.id !== productId);
  updateCart();
}

// Update cart display
function updateCart() {
  if (cart.length === 0) {
    cartItems.innerHTML = '<p class="empty-cart">Cart is empty</p>';
  } else {
    cartItems.innerHTML = cart.map(item => `
      <div class="cart-item">
        <div class="cart-item-info">
          <div class="cart-item-name">${item.name}</div>
          <div class="cart-item-qty">Qty: ${item.quantity}</div>
        </div>
        <div class="cart-item-price">$${(item.price * item.quantity).toFixed(2)}</div>
        <button class="cart-item-remove" onclick="removeFromCart(${item.id})">Remove</button>
      </div>
    `).join('');
  }
  
  updateSummary();
}

// Update cart summary
function updateSummary() {
  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const tax = subtotal * TAX_RATE;
  const total = subtotal + tax;
  
  subtotalEl.textContent = `$${subtotal.toFixed(2)}`;
  taxAmountEl.textContent = `$${tax.toFixed(2)}`;
  totalEl.textContent = `$${total.toFixed(2)}`;
}

// Clear cart
function clearCart() {
  if (confirm('Clear the cart?')) {
    cart = [];
    updateCart();
  }
}

// Complete sale
async function completeSale() {
  if (cart.length === 0) {
    alert('Cart is empty!');
    return;
  }
  
  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const tax = subtotal * TAX_RATE;
  const total = subtotal + tax;
  
  try {
    const response = await fetch('/api/sales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: cart,
        subtotal: subtotal,
        tax: tax,
        total: total,
        userId: currentUser.id
      })
    });
    
    const result = await response.json();
    alert(`Sale completed! Transaction ID: ${result.id}\nTotal: $${result.total.toFixed(2)}`);
    cart = [];
    updateCart();
  } catch (error) {
    console.error('Error completing sale:', error);
    alert('Error completing sale');
  }
}

// Add new product
async function addProduct(e) {
  e.preventDefault();
  
  const product = {
    name: document.getElementById('productName').value,
    price: parseFloat(document.getElementById('productPrice').value),
    category: document.getElementById('productCategory').value,
    stock: parseInt(document.getElementById('productStock').value)
  };
  
  try {
    const response = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(product)
    });
    
    const result = await response.json();
    alert('Product added successfully!');
    document.getElementById('addProductForm').reset();
    loadProductsTable();
  } catch (error) {
    console.error('Error adding product:', error);
    alert('Error adding product');
  }
}

// Load products table
async function loadProductsTable() {
  try {
    const response = await fetch('/api/products');
    const data = await response.json();
    const tbody = document.getElementById('productsTableBody');
    
    tbody.innerHTML = data.map(product => `
      <tr>
        <td>${product.name}</td>
        <td>${product.category || '-'}</td>
        <td>$${product.price.toFixed(2)}</td>
        <td>${product.stock}</td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('Error loading products table:', error);
  }
}

// Check if user already logged in
window.addEventListener('load', () => {
  const savedUser = localStorage.getItem('user');
  if (savedUser) {
    currentUser = JSON.parse(savedUser);
    showMainApp();
  } else {
    loginPage.classList.add('active');
  }
  updateDateTime();
});

document.addEventListener('DOMContentLoaded', async () => {
  const appContainer = document.getElementById('app');

  // Initialize router
  Router.init(appContainer);

  // Register pages
  Router.registerPage('login', '/pages/login.html', () => LoginModule.init());
  Router.registerPage('pos', '/pages/pos.html', () => POSModule.init());
  Router.registerPage('products', '/pages/products.html', () => ProductsModule.init());

  // Initialize auth
  const user = Auth.init();

  // Route to appropriate page
  if (user) {
    Router.navigate('pos');
  } else {
    Router.navigate('login');
  }
});
