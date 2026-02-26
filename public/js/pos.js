const POSModule = {
  TAX_RATE: 0.10,
  cart: [],
  products: [],
  currentReceiptHtml: null,
  config: null,

  async init() {
    this.config = this.getConfig();
    this.setupEventListeners();
    this.updateUserDisplay();
    this.applyRolePermissions();
    this.updateDateTime();
    await this.loadProducts();
    setInterval(() => this.updateDateTime(), 1000);
  },

  getConfig() {
    const defaults = {
      barcode: {
        inputSelector: '#barcodeInput',
        submitOnEnter: true,
        submitOnBlur: true,
        allowHsCodeFallback: false,
        allowIdFallback: false,
        allowNameFallback: false,
        autoFocusOnLoad: true
      },
      printer: {
        autoPrintOnComplete: false,
        receiptPrinterName: ''
      }
    };

    if (window.POS_CONFIG && typeof window.POS_CONFIG === 'object') {
      return {
        ...defaults,
        ...window.POS_CONFIG,
        barcode: {
          ...defaults.barcode,
          ...(window.POS_CONFIG.barcode || {})
        },
        printer: {
          ...defaults.printer,
          ...(window.POS_CONFIG.printer || {})
        }
      };
    }

    return defaults;
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

    const barcodeConfig = this.config?.barcode || {};
    const barcodeInput = document.querySelector(barcodeConfig.inputSelector || '#barcodeInput');
    if (barcodeInput) {
      if (barcodeConfig.submitOnEnter) {
        barcodeInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            this.handleBarcodeScan(e.target.value);
            e.target.value = '';
          }
        });
      }

      if (barcodeConfig.submitOnBlur) {
        barcodeInput.addEventListener('blur', (e) => {
          const value = String(e.target.value || '').trim();
          if (!value) return;
          this.handleBarcodeScan(value);
          e.target.value = '';
        });
      }

      if (barcodeConfig.autoFocusOnLoad) {
        barcodeInput.focus();
      }
    }
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

  getCurrencySettings() {
    return {
      currencyCode: localStorage.getItem('pos.currencyCode') || 'USD',
      currencySymbol: localStorage.getItem('pos.currencySymbol') || '$'
    };
  },

  formatMoney(amount) {
    const { currencySymbol } = this.getCurrencySettings();
    const value = Number(amount) || 0;
    return `${currencySymbol}${value.toFixed(2)}`;
  },

  async loadProducts() {
    try {
      const products = await API.getProducts();
      this.products = products.map(product => ({
        ...product,
        price: Number(product.price) || 0,
        stock: Number(product.stock) || 0,
        barcode: String(product.barcode || '').trim(),
        hscode: String(product.hscode || '').trim()
      }));
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
    const term = String(searchTerm || '').trim().toLowerCase();
    if (!term) {
      this.displayProducts(this.products);
      return;
    }

    const filtered = this.products.filter(product => {
      const name = String(product.name || '').toLowerCase();
      const barcode = String(product.barcode || '').toLowerCase();
      const hscode = String(product.hscode || '').toLowerCase();
      const sku = String(product.sku || '').toLowerCase();
      const productId = String(product.id || '').toLowerCase();

      return (
        name.includes(term) ||
        barcode.includes(term) ||
        hscode.includes(term) ||
        sku.includes(term) ||
        productId === term
      );
    });

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
          <div class="price">${this.formatMoney(product.price)}</div>
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
      this.showOutOfStockModal(product);
      return;
    }

    const existingItem = this.cart.find(item => item.id === productId);
    const nextQty = (existingItem?.quantity || 0) + 1;

    if (nextQty > Number(product.stock)) {
      this.showOutOfStockModal(product);
      return;
    }

    if (existingItem) {
      existingItem.quantity++;
    } else {
      this.cart.push({
        id: productId,
        name: product.name,
        price: product.price,
        quantity: 1,
        barcode: product.barcode || '',
        hscode: product.hscode || ''
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
          <div class="cart-item-price">${this.formatMoney(item.price * item.quantity)}</div>
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

    document.getElementById('subtotal').textContent = this.formatMoney(subtotal);
    document.getElementById('taxAmount').textContent = this.formatMoney(tax);
    document.getElementById('total').textContent = this.formatMoney(total);
  },

  clearCart() {
    if (confirm('Are you sure you want to clear the cart? This cannot be undone.')) {
      this.cart = [];
      this.updateCart();
    }
  },

  showOutOfStockModal(product) {
    const modal = document.getElementById('outOfStockModal');
    if (!modal) return;

    document.getElementById('outOfStockProductName').textContent = product.name;
    document.getElementById('outOfStockProductPrice').textContent = this.formatMoney(product.price);
    modal.style.display = 'flex';
  },

  closeOutOfStockModal() {
    const modal = document.getElementById('outOfStockModal');
    if (modal) {
      modal.style.display = 'none';
    }
  },

  sellSomethingElse() {
    this.closeOutOfStockModal();
    // Focus on search to help user find another product
    const searchInput = document.getElementById('productSearch');
    if (searchInput) {
      searchInput.focus();
      searchInput.placeholder = 'Try searching for another product...';
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
    document.getElementById('modalTotalDue').textContent = this.formatMoney(total);
    
    const modalCartItems = document.getElementById('modalCartItems');
    modalCartItems.innerHTML = this.cart.map(item => `
      <div class="item">
        <span>${item.name} (x${item.quantity})</span>
        <span>${this.formatMoney(item.price * item.quantity)}</span>
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
    document.getElementById('changeDue').textContent = this.formatMoney(0);
  },

  calculateChange(amountTendered) {
    const total = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0) * (1 + this.TAX_RATE);
    const tendered = parseFloat(amountTendered) || 0;
    const change = tendered - total;
    
    document.getElementById('changeDue').textContent = change >= 0 ? this.formatMoney(change) : this.formatMoney(0);
  },

  handleBarcodeScan(rawValue) {
    const code = String(rawValue || '').trim();
    if (!code) return;

    const product = this.findProductByBarcode(code);
    if (!product) {
      this.showBarcodeErrorModal(code);
      return;
    }

    this.addToCart(product.id);
  },

  findProductByBarcode(code) {
    const byBarcode = this.products.find(p => String(p.barcode || '').trim() === code);
    if (byBarcode) return byBarcode;

    const barcodeConfig = this.config?.barcode || {};
    if (barcodeConfig.allowHsCodeFallback) {
      const byHsCode = this.products.find(p => String(p.hscode || '').trim() === code);
      if (byHsCode) return byHsCode;
    }

    if (barcodeConfig.allowIdFallback) {
      const byId = this.products.find(p => String(p.id) === code);
      if (byId) return byId;
    }

    if (barcodeConfig.allowNameFallback) {
      const byName = this.products.find(p => p.name?.toLowerCase() === code.toLowerCase());
      if (byName) return byName;
    }

    return null;
  },

  canFulfillCart() {
    const stockMap = new Map(this.products.map(p => [p.id, Number(p.stock) || 0]));
    for (const item of this.cart) {
      const available = stockMap.get(item.id) ?? 0;
      if (item.quantity > available) return false;
    }
    return true;
  },

  getDepletedItems() {
    const stockMap = new Map(this.products.map(p => [p.id, p]));
    const depleted = [];
    
    for (const item of this.cart) {
      const product = stockMap.get(item.id);
      if (!product) continue;
      
      const available = Number(product.stock) || 0;
      const needed = Number(item.quantity) || 0;
      
      if (needed > available) {
        depleted.push({
          id: product.id,
          name: product.name,
          available: available,
          needed: needed,
          shortage: needed - available,
          barcode: product.barcode || '',
          hscode: product.hscode || ''
        });
      }
    }
    
    return depleted;
  },

  showStockAlert() {
    const depleted = this.getDepletedItems();
    if (depleted.length === 0) return false;

    const modal = document.getElementById('stockDepletionModal');
    const itemsList = document.getElementById('depletedItemsList');

    itemsList.innerHTML = depleted.map(item => `
      <div class="depleted-item">
        <div class="item-detail">
          <div class="item-detail-name">${item.name}</div>
          <div class="item-detail-info">
            <span>Available: <strong>${item.available}</strong></span>
            <span>Requested: <strong>${item.needed}</strong></span>
            ${item.barcode ? `<span>Barcode: ${item.barcode}</span>` : ''}
            ${item.hscode ? `<span>HS Code: ${item.hscode}</span>` : ''}
          </div>
        </div>
        <div class="item-shortage">Short: ${item.shortage}</div>
      </div>
    `).join('');

    document.getElementById('notificationStatus').textContent = '';
    document.getElementById('notificationStatus').className = 'notification-status';
    modal.style.display = 'flex';
    return true;
  },

  closeStockAlert() {
    const modal = document.getElementById('stockDepletionModal');
    modal.style.display = 'none';
  },

  async notifySupervisor() {
    const statusEl = document.getElementById('notificationStatus');
    const depleted = this.getDepletedItems();
    
    statusEl.textContent = 'Sending notification...';
    statusEl.className = 'notification-status show loading';

    try {
      const user = Auth.getUser();
      const result = await API.sendStockNotification({
        items: depleted,
        cashier: user.name,
        timestamp: new Date().toISOString()
      });

      statusEl.textContent = '✓ Notification sent successfully to supervisor';
      statusEl.className = 'notification-status show success';
      
      setTimeout(() => {
        this.closeStockAlert();
      }, 2000);
    } catch (error) {
      console.error('Error sending notification:', error);
      statusEl.textContent = `✗ Failed to send notification: ${error.message}`;
      statusEl.className = 'notification-status show error';
    }
  },

  buildReceiptHtml(saleId, paymentMethod, totals) {
    return `
      <html>
      <head>
        <title>Receipt #${saleId}</title>
        <style>
          @page { size: 80mm auto; margin: 4mm; }
          body { font-family: Arial, sans-serif; padding: 0; margin: 0 auto; width: 80mm; color: #111; }
          h2 { margin: 0 0 6px; font-size: 16px; text-align: center; }
          .meta { text-align: center; font-size: 11px; color: #444; margin-bottom: 8px; }
          .divider { border-top: 1px dashed #999; margin: 8px 0; }
          table { width: 100%; border-collapse: collapse; }
          th { text-align: left; font-size: 11px; padding-bottom: 4px; }
          td { font-size: 11px; padding: 4px 0; vertical-align: top; }
          .item-name { width: 52%; }
          .item-price { width: 16%; text-align: right; }
          .item-qty { width: 12%; text-align: right; }
          .item-total { width: 20%; text-align: right; }
          .item-meta { font-size: 10px; color: #555; margin-top: 2px; }
          .receipt-line { display: flex; justify-content: space-between; margin: 3px 0; font-size: 11px; }
          .total { font-weight: bold; margin-top: 6px; }
          .footer { text-align: center; font-size: 10px; color: #666; margin-top: 8px; }
        </style>
      </head>
      <body>
        <h2>Receipt #${saleId}</h2>
        <div class="meta">${new Date().toLocaleString()}</div>
        <div class="divider"></div>
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th class="item-price">Price</th>
              <th class="item-qty">Qty</th>
              <th class="item-total">Total</th>
            </tr>
          </thead>
          <tbody>
            ${this.cart.map(item => `
              <tr class="item-row">
                <td class="item-name">
                  <div>${item.name}</div>
                  <div class="item-meta">HS: ${item.hscode || '-'}</div>
                </td>
                <td class="item-price">${this.formatMoney(item.price)}</td>
                <td class="item-qty">${item.quantity}</td>
                <td class="item-total">${this.formatMoney(item.price * item.quantity)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div class="divider"></div>
        <div class="receipt-line"><span>Subtotal</span><span>${this.formatMoney(totals.subtotal)}</span></div>
        <div class="receipt-line"><span>Tax</span><span>${this.formatMoney(totals.tax)}</span></div>
        <div class="receipt-line total"><span>Total</span><span>${this.formatMoney(totals.total)}</span></div>
        <div class="receipt-line"><span>Payment</span><span>${paymentMethod.toUpperCase()}</span></div>
        <div class="footer">Thank you for your purchase</div>
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

  printReceiptFromModal() {
    if (this.currentReceiptHtml) {
      this.printReceipt(this.currentReceiptHtml);
    }
  },

  emailReceipt() {
    alert('Email functionality coming soon!');
  },

  closeReceiptModal() {
    const modal = document.getElementById('receiptModal');
    if (modal) {
      modal.style.display = 'none';
    }
    this.currentReceiptHtml = null;
    // Clear cart after closing receipt
    this.cart = [];
    this.updateCart();
  },

  showBarcodeErrorModal(barcode) {
    const modal = document.getElementById('barcodeErrorModal');
    if (!modal) return;
    document.getElementById('barcodeErrorMessage').textContent = `Barcode "${barcode}" not found in the system.`;
    modal.style.display = 'flex';
  },

  closeBarcodeErrorModal() {
    const modal = document.getElementById('barcodeErrorModal');
    if (modal) {
      modal.style.display = 'none';
    }
  },

  focusBarcodeInput() {
    this.closeBarcodeErrorModal();
    const barcodeInput = document.getElementById('barcodeInput');
    if (barcodeInput) {
      barcodeInput.focus();
      barcodeInput.value = '';
    }
  },

  showSaleCompleteModal() {
    const modal = document.getElementById('saleCompleteModal');
    if (modal) {
      modal.style.display = 'flex';
    }
  },

  closeSaleCompleteModal() {
    const modal = document.getElementById('saleCompleteModal');
    if (modal) {
      modal.style.display = 'none';
    }
    this.cart = [];
    this.updateCart();
    this.closePaymentModal();
  },

  showReceiptModal() {
    const modal = document.getElementById('receiptModal');
    if (modal) {
      modal.style.display = 'flex';
    }
  },

  confirmPrintReceipt() {
    if (this.currentReceiptHtml) {
      this.printReceipt(this.currentReceiptHtml);
    }
    this.closeReceiptModal();
  },

  async completeSale() {
    const selectedMethod = document.querySelector('input[name="paymentMethod"]:checked').value;
    const total = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0) * (1 + this.TAX_RATE);

    await this.loadProducts();

    if (!this.canFulfillCart()) {
      this.closePaymentModal();
      this.showStockAlert();
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

      await this.loadProducts();

      const receiptHtml = this.buildReceiptHtml(result.id, selectedMethod, { subtotal, tax, total });
      this.currentReceiptHtml = receiptHtml;
      this.currentReceiptId = result.id;
      this.currentPaymentMethod = selectedMethod;
      this.currentSaleTotals = { subtotal, tax, total };
      
      // Set the receipt content
      document.getElementById('receiptContent').innerHTML = receiptHtml;
      
      // Build sale complete details
      let changeMessage = '';
      if (selectedMethod === 'cash') {
        const amountTendered = parseFloat(document.getElementById('amountTendered').value);
        const change = amountTendered - total;
        changeMessage = `<p class="change-due">💰 Change Due: <strong>${this.formatMoney(change)}</strong></p>`;
      }
      
      const saleDetails = `
        <p class="transaction-id">Transaction ID: <strong>#${result.id}</strong></p>
        <p class="transaction-method">Payment Method: <strong>${selectedMethod.toUpperCase()}</strong></p>
        <p class="transaction-total">Total Amount: <strong>${this.formatMoney(total)}</strong></p>
        ${changeMessage}
      `;
      
      document.getElementById('saleCompleteDetails').innerHTML = saleDetails;
      
      // Show receipt modal
      this.showReceiptModal();
      
      this.cart = [];
      this.updateCart();
      this.closePaymentModal();
      
    } catch (error) {
      console.error('Error completing sale:', error);
      alert(`Error completing sale: ${error.message}`);
    }
  }
};
