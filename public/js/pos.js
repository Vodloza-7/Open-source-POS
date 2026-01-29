const POSModule = {
  TAX_RATE: 0.10,
  cart: [],
  products: [],

  async init() {
    this.setupEventListeners();
    this.updateUserDisplay();
    this.applyRolePermissions(); // Add this call
    this.updateDateTime();
    await this.loadProducts();
    setInterval(() => this.updateDateTime(), 1000);
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
    document.getElementById('currentDate').textContent = dateStr;

    const timeStr = now.toLocaleTimeString('en-US', { hour12: true });
    document.getElementById('currentTime').textContent = timeStr;
  },

  async loadProducts() {
    try {
      this.products = await API.getProducts();
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

    productsList.innerHTML = productsToDisplay.map(product => `
      <div class="product-card" onclick="POSModule.addToCart(${product.id})">
        <h4>${product.name}</h4>
        <div class="price">$${product.price.toFixed(2)}</div>
        <div class="stock">Stock: ${product.stock}</div>
        <button type="button">Add to Cart</button>
      </div>
    `).join('');
  },

  addToCart(productId) {
    const product = this.products.find(p => p.id === productId);
    if (!product) return;

    const existingItem = this.cart.find(item => item.id === productId);

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

  async completeSale() {
    const amountTendered = parseFloat(document.getElementById('amountTendered').value) || 0;
    const total = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0) * (1 + this.TAX_RATE);

    if (amountTendered < total) {
      alert('Amount tendered is less than the total due.');
      return;
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
        userId: user.id
      });

      const change = amountTendered - total;
      alert(`Sale Completed!\nTransaction ID: ${result.id}\nTotal: $${total.toFixed(2)}\nChange Due: $${change.toFixed(2)}`);
      
      this.cart = [];
      this.updateCart();
      this.closePaymentModal();
    } catch (error) {
      console.error('Error completing sale:', error);
      alert(`Error completing sale: ${error.message}`);
    }
  }
};
