const POSModule = {
  STORAGE_KEY: 'pos.products',
  TAX_RATE: 0.10,
  cart: [],
  products: [],

  async init() {
    this.initializeSampleProducts(); // Add sample products if none exist
    this.setupEventListeners();
    this.updateUserDisplay();
    this.applyRolePermissions();
    this.updateDateTime();
    await this.loadProducts();
    setInterval(() => this.updateDateTime(), 1000);
  },

  initializeSampleProducts() {
    const products = this.getStoredProducts();
    if (products.length === 0) {
      const samples = [
        { id: 1, name: 'Rice 5kg', price: 12.99, unit: 'bag', category: 'Groceries', stock: 50 },
        { id: 2, name: 'Cooking Oil 2L', price: 8.50, unit: 'bottle', category: 'Groceries', stock: 30 },
        { id: 3, name: 'Sugar 1kg', price: 3.25, unit: 'pack', category: 'Groceries', stock: 75 },
        { id: 4, name: 'Milk 1L', price: 4.99, unit: 'carton', category: 'Dairy', stock: 40 },
        { id: 5, name: 'Bread', price: 2.50, unit: 'loaf', category: 'Bakery', stock: 60 },
        { id: 6, name: 'Eggs (Dozen)', price: 5.75, unit: 'dozen', category: 'Dairy', stock: 45 },
        { id: 7, name: 'Chicken 1kg', price: 9.99, unit: 'kg', category: 'Meat', stock: 25 },
        { id: 8, name: 'Tomatoes 1kg', price: 3.50, unit: 'kg', category: 'Vegetables', stock: 55 },
        { id: 9, name: 'Onions 1kg', price: 2.99, unit: 'kg', category: 'Vegetables', stock: 65 },
        { id: 10, name: 'Soft Drink 2L', price: 3.99, unit: 'bottle', category: 'Beverages', stock: 80 }
      ];
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(samples));
    }
  },

  setupEventListeners() {
    document.getElementById('productSearch')?.addEventListener('input', (e) => {
      this.filterProducts(e.target.value);
    });

    document.getElementById('adminDashboardBtn')?.addEventListener('click', () => {
      Router.navigate('admin');
    });

    document.getElementById('salesHistoryBtn')?.addEventListener('click', () => {
      Router.navigate('sales');
    });

    document.getElementById('logoutBtn')?.addEventListener('click', () => {
      Auth.logout();
      Router.navigate('login');
    });

    document.getElementById('clearCartBtn')?.addEventListener('click', () => {
      this.clearCart();
    });

    document.getElementById('checkoutBtn')?.addEventListener('click', () => {
      this.openPaymentModal();
    });

    document.getElementById('cancelPaymentBtn')?.addEventListener('click', () => {
      this.closePaymentModal();
    });

    document.getElementById('confirmPaymentBtn')?.addEventListener('click', () => {
      this.completeSale();
    });

    document.getElementById('amountTendered')?.addEventListener('input', (e) => {
      this.calculateChange(e.target.value);
    });

    document.getElementById('manageProductsBtn')?.addEventListener('click', () => {
      Router.navigate('products');
    });

    document.getElementById('manageProductsInlineBtn')?.addEventListener('click', () => {
      Router.navigate('products');
    });

    // Payment method selection
    document.querySelectorAll('input[name="paymentMethod"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        this.switchPaymentMethod(e.target.value);
      });
    });

    document.getElementById('barcodeInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.handleBarcodeScan(e.target.value);
        e.target.value = '';
      }
    });
  },

  updateUserDisplay() {
    const user = Auth.getUser();
    if (user) {
      document.getElementById('userName').textContent = user.name;
      document.getElementById('userRole').textContent = `[${user.role}]`;
    }
  },

  applyRolePermissions() {
    const isAdmin = Auth.isAdmin();
    document.querySelectorAll('.admin-only').forEach(el => {
      el.style.display = isAdmin ? 'inline-block' : 'none';
    });
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
  },

  getStoredProducts() {
    try {
      return JSON.parse(localStorage.getItem(this.STORAGE_KEY)) || [];
    } catch {
      return [];
    }
  },

  async loadProducts() {
    try {
      this.products = this.getStoredProducts();
      this.displayProducts(this.products); // Pass all products initially
    } catch (error) {
      console.error('Error loading products:', error);
      const productsList = document.getElementById('productsList');
      if (productsList) {
        productsList.innerHTML = `<p class="error">Failed to load products: ${error.message}</p>`;
      }
    }
  },

  filterProducts(searchTerm) {
    const lowerCaseTerm = searchTerm.toLowerCase();
    const filtered = this.products.filter(product => 
      product.name.toLowerCase().includes(lowerCaseTerm)
    );
    this.displayProducts(filtered);
  },

  displayProducts(productsToDisplay) {
    const productsList = document.getElementById('productsList');
    if (!productsList) return;

    if (productsToDisplay.length === 0) {
      productsList.innerHTML = '<p class="empty-cart">No products found.</p>';
      return;
    }

    productsList.innerHTML = productsToDisplay.map(product => {
      const outOfStock = Number(product.stock) <= 0;
      return `
        <div class="product-card ${outOfStock ? 'out-of-stock' : ''}" ${outOfStock ? '' : `onclick="POSModule.addToCart(${product.id})"`}>
          <h4>${product.name}</h4>
          <div class="price">$${product.price.toFixed(2)}</div>
          <div class="stock">${outOfStock ? 'Out of Stock' : `Stock: ${product.stock}`}</div>
          <button type="button" ${outOfStock ? 'disabled' : ''}>${outOfStock ? 'Unavailable' : 'Add to Cart'}</button>
        </div>
      `;
    }).join('');
  },

  addToCart(productId) {
    const product = this.products.find(p => p.id === productId);
    if (!product) return;

    if (Number(product.stock) <= 0) {
      alert('Out of stock.');
      return;
    }

    const existingItem = this.cart.find(item => item.id === productId);
    const nextQty = (existingItem?.quantity || 0) + 1;

    if (nextQty > Number(product.stock)) {
      alert('Not enough stock available.');
      return;
    }

    if (existingItem) {
      existingItem.quantity++;
    } else {
      this.cart.push({
        id: productId,
        name: product.name,
        price: product.price,
        quantity: 1
      });
    }

    this.updateCart();
  },

  removeFromCart(productId) {
    this.cart = this.cart.filter(item => item.id !== productId);
    this.updateCart();
  },

  updateCart() {
    const cartItems = document.getElementById('cartItems');
    if (!cartItems) return;

    if (this.cart.length === 0) {
      cartItems.innerHTML = '<p class="empty-cart">Cart is empty</p>';
    } else {
      cartItems.innerHTML = this.cart.map(item => `
        <div class="cart-item">
          <div class="cart-item-info">
            <div class="cart-item-name">${item.name}</div>
            <div class="cart-item-qty">Qty: ${item.quantity}</div>
          </div>
          <div class="cart-item-price">$${(item.price * item.quantity).toFixed(2)}</div>
          <button class="cart-item-remove" onclick="POSModule.removeFromCart(${item.id})">Remove</button>
        </div>
      `).join('');
    }

    this.updateSummary();
  },

  updateSummary() {
    const subtotal = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const tax = subtotal * this.TAX_RATE;
    const total = subtotal + tax;

    document.getElementById('subtotal').textContent = `$${subtotal.toFixed(2)}`;
    document.getElementById('taxAmount').textContent = `$${tax.toFixed(2)}`;
    document.getElementById('total').textContent = `$${total.toFixed(2)}`;
  },

  clearCart() {
    if (confirm('Are you sure you want to clear the cart? This cannot be undone.')) {
      this.cart = [];
      this.updateCart();
    }
  },

  switchPaymentMethod(method) {
    // Hide all payment sections
    document.getElementById('cashPaymentSection').style.display = 'none';
    document.getElementById('cardPaymentSection').style.display = 'none';
    document.getElementById('mobilePaymentSection').style.display = 'none';
    document.getElementById('walletPaymentSection').style.display = 'none';

    // Show selected payment section
    switch(method) {
      case 'cash':
        document.getElementById('cashPaymentSection').style.display = 'block';
        break;
      case 'card':
        document.getElementById('cardPaymentSection').style.display = 'block';
        break;
      case 'mobile':
        document.getElementById('mobilePaymentSection').style.display = 'block';
        break;
      case 'wallet':
        document.getElementById('walletPaymentSection').style.display = 'block';
        break;
    }
  },

  openPaymentModal() {
    if (this.cart.length === 0) {
      alert('Cart is empty!');
      return;
    }
    const total = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0) * (1 + this.TAX_RATE);
    document.getElementById('modalTotalDue').textContent = `$${total.toFixed(2)}`;
    
    const modalCartItems = document.getElementById('modalCartItems');
    modalCartItems.innerHTML = this.cart.map(item => `
      <div class="item">
        <span>${item.name} (x${item.quantity})</span>
        <span>$${(item.price * item.quantity).toFixed(2)}</span>
      </div>
    `).join('');

    // Reset to cash payment method
    document.querySelector('input[name="paymentMethod"][value="cash"]').checked = true;
    this.switchPaymentMethod('cash');

    document.getElementById('paymentModal').style.display = 'flex';
    document.getElementById('amountTendered').focus();
  },

  closePaymentModal() {
    document.getElementById('paymentModal').style.display = 'none';
    document.getElementById('amountTendered').value = '';
    document.getElementById('changeDue').textContent = '$0.00';
  },

  calculateChange(amountTendered) {
    const total = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0) * (1 + this.TAX_RATE);
    const tendered = parseFloat(amountTendered) || 0;
    const change = tendered - total;
    
    document.getElementById('changeDue').textContent = change >= 0 ? `$${change.toFixed(2)}` : '$0.00';
  },

  setStoredProducts(products) {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(products));
  },

  handleBarcodeScan(rawValue) {
    const code = String(rawValue || '').trim();
    if (!code) return;

    const product = this.findProductByBarcode(code);
    if (!product) {
      alert('Product not found for this barcode.');
      return;
    }

    this.addToCart(product.id);
  },

  findProductByBarcode(code) {
    const byBarcode = this.products.find(p => String(p.barcode || '').trim() === code);
    if (byBarcode) return byBarcode;

    const byId = this.products.find(p => String(p.id) === code);
    if (byId) return byId;

    const byName = this.products.find(p => p.name?.toLowerCase() === code.toLowerCase());
    return byName || null;
  },

  canFulfillCart() {
    const stockMap = new Map(this.products.map(p => [p.id, Number(p.stock) || 0]));
    for (const item of this.cart) {
      const available = stockMap.get(item.id) ?? 0;
      if (item.quantity > available) return false;
    }
    return true;
  },

  applyStockAfterSale() {
    const products = this.getStoredProducts();
    const stockById = new Map(products.map(p => [p.id, p]));

    this.cart.forEach(item => {
      const product = stockById.get(item.id);
      if (!product) return;
      const current = Number(product.stock) || 0;
      product.stock = Math.max(0, current - item.quantity);
    });

    this.setStoredProducts(products);
    this.products = products;
    this.displayProducts(this.products);
  },

  buildReceiptHtml(saleId, paymentMethod, totals) {
    const lines = this.cart.map(item => `
      <div class="receipt-line">
        <span>${item.name} x${item.quantity}</span>
        <span>$${(item.price * item.quantity).toFixed(2)}</span>
      </div>
    `).join('');

    return `
      <html>
      <head>
        <title>Receipt #${saleId}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h2 { margin-bottom: 10px; }
          .receipt-line { display: flex; justify-content: space-between; margin: 4px 0; }
          .total { font-weight: bold; margin-top: 10px; }
        </style>
      </head>
      <body>
        <h2>Receipt #${saleId}</h2>
        <div>${new Date().toLocaleString()}</div>
        <hr />
        ${lines}
        <hr />
        <div class="receipt-line"><span>Subtotal</span><span>$${totals.subtotal.toFixed(2)}</span></div>
        <div class="receipt-line"><span>Tax</span><span>$${totals.tax.toFixed(2)}</span></div>
        <div class="receipt-line total"><span>Total</span><span>$${totals.total.toFixed(2)}</span></div>
        <div class="receipt-line"><span>Payment</span><span>${paymentMethod.toUpperCase()}</span></div>
      </body>
      </html>
    `;
  },

  printReceipt(html) {
    const win = window.open('', '_blank', 'width=420,height=600');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  },

  async completeSale() {
    const selectedMethod = document.querySelector('input[name="paymentMethod"]:checked').value;
    const total = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0) * (1 + this.TAX_RATE);

    if (!this.canFulfillCart()) {
      alert('Insufficient stock to complete this sale.');
      return;
    }

    // Validate based on payment method
    if (selectedMethod === 'cash') {
      const amountTendered = parseFloat(document.getElementById('amountTendered').value) || 0;
      if (amountTendered < total) {
        alert('Amount tendered is less than the total due.');
        return;
      }
    } else if (selectedMethod === 'mobile') {
      const mobileNumber = document.getElementById('mobileNumber').value;
      if (!mobileNumber) {
        alert('Please enter mobile number.');
        return;
      }
    }

    const subtotal = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const tax = subtotal * this.TAX_RATE;
    const user = Auth.getUser();

    try {
      const result = await API.completeSale({
        items: this.cart,
        subtotal: subtotal,
        tax: tax,
        total: total,
        userId: user.id,
        paymentMethod: selectedMethod
      });

      this.applyStockAfterSale();

      const receiptHtml = this.buildReceiptHtml(result.id, selectedMethod, { subtotal, tax, total });
      if (confirm('Print receipt?')) {
        this.printReceipt(receiptHtml);
      }

      let message = `Sale Completed!\nTransaction ID: ${result.id}\nTotal: $${total.toFixed(2)}\nPayment Method: ${selectedMethod.toUpperCase()}`;
      
      if (selectedMethod === 'cash') {
        const amountTendered = parseFloat(document.getElementById('amountTendered').value);
        const change = amountTendered - total;
        message += `\nChange Due: $${change.toFixed(2)}`;
      }

      alert(message);
      
      this.cart = [];
      this.updateCart();
      this.closePaymentModal();
    } catch (error) {
      console.error('Error completing sale:', error);
      alert(`Error completing sale: ${error.message}`);
    }
  }
};
