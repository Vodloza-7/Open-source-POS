const ProductsModule = {
  STORAGE_KEY: 'pos.products',

  async init() {
    this.initializeSampleProducts();
    this.setupEventListeners();
    this.updateUserDisplay();
    this.updateDateTime(); // Add date/time display
    await this.loadProductsTable();

    // Update time every second
    setInterval(() => this.updateDateTime(), 1000);
  },

  initializeSampleProducts() {
    const products = this.getStoredProducts();
    if (products.length === 0) {
      const samples = [
        { id: 1, name: 'Rice 5kg', price: 12.99, unit: 'bag', category: 'Groceries', stock: 50, barcode: '100000000001' },
        { id: 2, name: 'Cooking Oil 2L', price: 8.50, unit: 'bottle', category: 'Groceries', stock: 30, barcode: '100000000002' },
        { id: 3, name: 'Sugar 1kg', price: 3.25, unit: 'pack', category: 'Groceries', stock: 75, barcode: '100000000003' },
        { id: 4, name: 'Milk 1L', price: 4.99, unit: 'carton', category: 'Dairy', stock: 40, barcode: '100000000004' },
        { id: 5, name: 'Bread', price: 2.50, unit: 'loaf', category: 'Bakery', stock: 60, barcode: '100000000005' }
      ];
      this.setStoredProducts(samples);
    }
  },

  setupEventListeners() {
    document.getElementById('addProductForm')?.addEventListener('submit', (e) => this.handleAddProduct(e));

    document.getElementById('backBtn')?.addEventListener('click', () => {
      Router.navigate('pos');
    });

    document.getElementById('logoutBtn')?.addEventListener('click', () => {
      Auth.logout();
      Router.navigate('login');
    });
  },

  updateUserDisplay() {
    const user = Auth.getUser();
    if (user) {
      document.getElementById('userName').textContent = user.name;
      document.getElementById('userRole').textContent = `[${user.role}]`;
    }
  },

  getStoredProducts() {
    try {
      return JSON.parse(localStorage.getItem(this.STORAGE_KEY)) || [];
    } catch {
      return [];
    }
  },

  setStoredProducts(products) {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(products));
  },

  async loadProductsTable() {
    try {
      const products = this.getStoredProducts();
      const tbody = document.getElementById('productsTableBody');
      const loadingStatus = document.getElementById('productsLoadingStatus');

      if (loadingStatus) loadingStatus.style.display = 'none';

      tbody.innerHTML = products.map(product => `
        <tr>
          <td>${product.name}</td>
          <td>${product.category || '-'}</td>
          <td>${product.unit || 'item'}</td>
          <td>$${Number(product.price).toFixed(2)}</td>
          <td>${product.stock}</td>
          <td>${product.barcode || '-'}</td>
          <td class="actions">
            <input type="number" class="stock-input" placeholder="Add Qty" min="1">
            <button class="btn btn-secondary btn-sm" onclick="ProductsModule.updateStock(${product.id}, this)">Update Stock</button>
            <button class="btn btn-primary btn-sm" onclick="ProductsModule.editProduct(${product.id})">Edit</button>
            <button class="btn btn-danger btn-sm" onclick="ProductsModule.deleteProduct(${product.id})">Delete</button>
          </td>
        </tr>
      `).join('');
    } catch (error) {
      console.error('Error loading products:', error);
      const loadingStatus = document.getElementById('productsLoadingStatus');
      if (loadingStatus) {
        loadingStatus.textContent = `Error loading products: ${error.message}`;
        loadingStatus.className = 'loading error';
      }
    }
  },

  async handleAddProduct(e) {
    e.preventDefault();

    const name = document.getElementById('productName').value.trim();
    const price = parseFloat(document.getElementById('productPrice').value);
    const unit = document.getElementById('productUnit').value.trim() || 'item';
    const category = document.getElementById('productCategory').value.trim();
    const stock = parseInt(document.getElementById('productStock').value, 10) || 0;
    const barcode = document.getElementById('productBarcode').value.trim();

    if (!name || Number.isNaN(price)) {
      alert('Name and valid price are required.');
      return;
    }

    const products = this.getStoredProducts();
    const nextId = products.length ? Math.max(...products.map(p => p.id)) + 1 : 1;

    products.push({ id: nextId, name, price, unit, category, stock, barcode });
    this.setStoredProducts(products);

    document.getElementById('addProductForm').reset();
    await this.loadProductsTable();
  },

  async updateStock(productId, buttonElement) {
    const row = buttonElement.closest('tr');
    const input = row.querySelector('.stock-input');
    const quantity = parseInt(input.value, 10);

    if (!quantity || quantity <= 0) {
      alert('Please enter a valid quantity to add.');
      return;
    }

    const products = this.getStoredProducts();
    const product = products.find(p => p.id === productId);
    if (!product) return;

    product.stock = (parseInt(product.stock, 10) || 0) + quantity;
    this.setStoredProducts(products);

    input.value = '';
    await this.loadProductsTable();
  },

  async editProduct(productId) {
    const products = this.getStoredProducts();
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const name = prompt('Name:', product.name);
    if (name === null) return;

    const priceStr = prompt('Price:', product.price);
    if (priceStr === null) return;

    const category = prompt('Category:', product.category || '');
    if (category === null) return;

    const unit = prompt('Unit:', product.unit || 'item');
    if (unit === null) return;

    const stockStr = prompt('Stock:', product.stock);
    if (stockStr === null) return;

    const price = parseFloat(priceStr);
    const stock = parseInt(stockStr, 10);

    const barcode = prompt('Barcode:', product.barcode || '');
    if (barcode === null) return;

    if (!name.trim() || Number.isNaN(price) || Number.isNaN(stock)) {
      alert('Invalid values.');
      return;
    }

    Object.assign(product, { name: name.trim(), price, category: category.trim(), unit: unit.trim(), stock, barcode: barcode.trim() });
    this.setStoredProducts(products);
    await this.loadProductsTable();
  },

  async deleteProduct(productId) {
    if (!confirm('Delete this product? This cannot be undone.')) return;

    const products = this.getStoredProducts().filter(p => p.id !== productId);
    this.setStoredProducts(products);
    await this.loadProductsTable();
  },

  updateDateTime() {
    const now = new Date();
    const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateStr = now.toLocaleDateString('en-US', dateOptions);
    const dateElement = document.getElementById('currentDate');
    if (dateElement) {
      dateElement.textContent = dateStr;
    }

    const timeStr = now.toLocaleTimeString('en-US', { hour12: true });
    const timeElement = document.getElementById('currentTime');
    if (timeElement) {
      timeElement.textContent = timeStr;
    }
  }
};
