const ProductsModule = {
  products: [],

  isBarcodeDuplicate(barcode, ignoreId = null) {
    const normalized = String(barcode || '').trim();
    if (!normalized) return false;

    return this.products.some(product => {
      if (ignoreId !== null && product.id === ignoreId) return false;
      return String(product.barcode || '').trim() === normalized;
    });
  },

  async init() {
    this.setupEventListeners();
    this.updateUserDisplay();
    this.updateDateTime(); // Add date/time display
    await this.loadProductsTable();

    // Update time every second
    setInterval(() => this.updateDateTime(), 1000);
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

  async loadProductsTable() {
    try {
      const products = await API.getProducts();
      this.products = products;
      const tbody = document.getElementById('productsTableBody');
      const loadingStatus = document.getElementById('productsLoadingStatus');

      if (loadingStatus) loadingStatus.style.display = 'none';

      tbody.innerHTML = products.map(product => `
        <tr>
          <td>${product.name}</td>
          <td>${product.category || '-'}</td>
          <td>${product.unit || 'item'}</td>
          <td>$${Number(product.price).toFixed(2)}</td>
          <td>$${Number(product.cost_price || 0).toFixed(2)}</td>
          <td>${product.stock}</td>
          <td>${product.barcode || '-'}</td>
          <td>${product.hscode || '-'}</td>
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
    const costPrice = parseFloat(document.getElementById('productCostPrice').value) || 0;
    const unit = document.getElementById('productUnit').value.trim() || 'item';
    const category = document.getElementById('productCategory').value.trim();
    const stock = parseInt(document.getElementById('productStock').value, 10) || 0;
    const barcode = document.getElementById('productBarcode').value.trim();
    const hscode = document.getElementById('productHsCode').value.trim();

    if (!name || Number.isNaN(price)) {
      alert('Name and valid price are required.');
      return;
    }

    if (this.isBarcodeDuplicate(barcode)) {
      alert('Barcode must be unique. Another product already uses this barcode.');
      return;
    }

    await API.addProduct({ name, price, costPrice, unit, category, stock, barcode, hscode });

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

    await API.updateProductStock(productId, quantity);

    input.value = '';
    await this.loadProductsTable();
  },

  async editProduct(productId) {
    const product = this.products.find(p => p.id === productId);
    if (!product) return;

    const name = prompt('Name:', product.name);
    if (name === null) return;

    const priceStr = prompt('Price:', product.price);
    if (priceStr === null) return;

    const costPriceStr = prompt('Cost Price:', product.cost_price || 0);
    if (costPriceStr === null) return;

    const category = prompt('Category:', product.category || '');
    if (category === null) return;

    const unit = prompt('Unit:', product.unit || 'item');
    if (unit === null) return;

    const stockStr = prompt('Stock:', product.stock);
    if (stockStr === null) return;

    const price = parseFloat(priceStr);
    const costPrice = parseFloat(costPriceStr);
    const stock = parseInt(stockStr, 10);

    const barcode = prompt('Barcode:', product.barcode || '');
    if (barcode === null) return;

    const hscode = prompt('HS Code:', product.hscode || '');
    if (hscode === null) return;

    if (!name.trim() || Number.isNaN(price) || Number.isNaN(costPrice) || Number.isNaN(stock)) {
      alert('Invalid values.');
      return;
    }

    if (this.isBarcodeDuplicate(barcode, productId)) {
      alert('Barcode must be unique. Another product already uses this barcode.');
      return;
    }

    await API.updateProduct(productId, {
      name: name.trim(),
      price,
      costPrice,
      category: category.trim(),
      unit: unit.trim(),
      stock,
      barcode: barcode.trim(),
      hscode: hscode.trim()
    });
    await this.loadProductsTable();
  },

  async deleteProduct(productId) {
    if (!confirm('Delete this product? This cannot be undone.')) return;

    await API.deleteProduct(productId);
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
