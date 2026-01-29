const POSModule = {
  TAX_RATE: 0.10,
  cart: [],
  products: [],

  async init() {
    this.setupEventListeners();
    this.updateUserDisplay();
    this.updateDateTime();
    await this.loadProducts();
    setInterval(() => this.updateDateTime(), 1000);
  },

  setupEventListeners() {
    document.getElementById('productsBtn')?.addEventListener('click', () => {
      Router.navigate('products');
    });

    document.getElementById('logoutBtn')?.addEventListener('click', () => {
      Auth.logout();
      Router.navigate('login');
    });

    document.getElementById('clearCartBtn')?.addEventListener('click', () => {
      this.clearCart();
    });

    document.getElementById('completeBtn')?.addEventListener('click', () => {
      this.completeSale();
    });
  },

  updateUserDisplay() {
    const user = Auth.getUser();
    if (user) {
      document.getElementById('userName').textContent = user.name;
      document.getElementById('userRole').textContent = `[${user.role}]`;
    }
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
      this.displayProducts();
    } catch (error) {
      console.error('Error loading products:', error);
      const productsList = document.getElementById('productsList');
      if (productsList) {
        productsList.innerHTML = `<p class="error">Failed to load products: ${error.message}</p>`;
      }
    }
  },

  displayProducts() {
    const productsList = document.getElementById('productsList');
    if (!productsList) return;

    productsList.innerHTML = this.products.map(product => `
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
    if (confirm('Clear the cart?')) {
      this.cart = [];
      this.updateCart();
    }
  },

  async completeSale() {
    if (this.cart.length === 0) {
      alert('Cart is empty!');
      return;
    }

    const subtotal = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const tax = subtotal * this.TAX_RATE;
    const total = subtotal + tax;
    const user = Auth.getUser();

    try {
      const result = await API.completeSale({
        items: this.cart,
        subtotal: subtotal,
        tax: tax,
        total: total,
        userId: user.id
      });

      alert(`Sale completed!\nTransaction ID: ${result.id}\nTotal: $${result.total.toFixed(2)}`);
      this.cart = [];
      this.updateCart();
    } catch (error) {
      console.error('Error completing sale:', error);
      alert(`Error completing sale: ${error.message}`);
    }
  }
};
