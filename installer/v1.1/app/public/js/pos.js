const POSModule = {
  DEFAULT_TAX_RATE: 0.10,
  cart: [],
  products: [],
  currentReceiptHtml: null,
  config: null,
  receiptSettings: null,
  exchangeRates: null,
  exchangeRatesRefreshTimer: null,
  offlineSyncListenerBound: false,

  async init() {
    this.config = this.getConfig();
    this.setupEventListeners();
    await this.loadReceiptSettings();
    this.updateUserDisplay();
    this.applyRolePermissions();
    await this.loadExchangeRates();
    this.startExchangeRatesRefresh();
    this.updateDateTime();
    await this.loadProducts();
    setInterval(() => this.updateDateTime(), 1000);
  },

  normalizeExchangeRates(data) {
    const rates = {
      USD: Number(data?.rates?.USD) || 1,
      ZAR: Number(data?.rates?.ZAR) || 20,
      ZIG: Number(data?.rates?.ZIG) || 400
    };

    return {
      baseCurrency: String(data?.baseCurrency || 'USD').toUpperCase(),
      rates,
      updatedAt: data?.updatedAt || null
    };
  },

  normalizeReceiptSettings(data) {
    return {
      companyName: String(data?.companyName || ''),
      companyAddress: String(data?.companyAddress || ''),
      vatNumber: String(data?.vatNumber || ''),
      tinNumber: String(data?.tinNumber || ''),
      receiptHeader: String(data?.receiptHeader || ''),
      receiptFooter: String(data?.receiptFooter || 'Thank you for your purchase'),
      receiptExtra: String(data?.receiptExtra || ''),
      showCompanyDetails: data?.showCompanyDetails !== false,
      showCashier: data?.showCashier !== false,
      showDateTime: data?.showDateTime !== false
    };
  },

  async loadReceiptSettings() {
    try {
      const data = await API.getReceiptSettings();
      this.receiptSettings = this.normalizeReceiptSettings(data);
    } catch (error) {
      this.receiptSettings = this.normalizeReceiptSettings({});
    }
  },

  applyCurrentCurrencyRateFromExchange() {
    const exchange = this.exchangeRates;
    if (!exchange || !exchange.rates) return;

    const currentCode = String(localStorage.getItem('pos.currencyCode') || exchange.baseCurrency || 'USD').toUpperCase();
    const currentRate = Number(exchange.rates[currentCode]);
    const baseRate = Number(exchange.rates.USD) || 1;
    const relativeRate = (Number.isFinite(currentRate) && currentRate > 0 ? currentRate : baseRate) / baseRate;

    localStorage.setItem('pos.currencyCode', currentCode);
    localStorage.setItem('pos.currencyRate', String(relativeRate));

    if (currentCode === 'USD') localStorage.setItem('pos.currencySymbol', '$');
    if (currentCode === 'ZAR') localStorage.setItem('pos.currencySymbol', 'R');
    if (currentCode === 'ZIG') localStorage.setItem('pos.currencySymbol', 'ZiG ');
  },

  renderExchangeRatesPanel() {
    const content = document.getElementById('posExchangeRatesContent');
    if (!content) return;

    const exchange = this.exchangeRates;
    if (!exchange || !exchange.rates) {
      content.textContent = 'Exchange rates unavailable.';
      return;
    }

    const currentCurrency = String(localStorage.getItem('pos.currencyCode') || 'USD').toUpperCase();
    const lines = ['USD', 'ZAR', 'ZIG'].map(code => {
      const value = Number(exchange.rates[code]) || 0;
      const selected = code === currentCurrency ? ' (Selected)' : '';
      return `<div class="exchange-rate-line"><span>1 USD → ${code}${selected}</span><strong>${value.toFixed(4)}</strong></div>`;
    }).join('');

    const updatedText = exchange.updatedAt ? new Date(exchange.updatedAt).toLocaleString() : '-';
    content.innerHTML = `${lines}<div class="exchange-rate-time">Updated: ${updatedText}</div>`;
  },

  async loadExchangeRates() {
    const content = document.getElementById('posExchangeRatesContent');
    if (content && !this.exchangeRates) {
      content.textContent = 'Loading exchange rates...';
    }

    try {
      const data = typeof API.getCurrentExchangeRates === 'function'
        ? await API.getCurrentExchangeRates()
        : await API.getExchangeSettings();
      this.exchangeRates = this.normalizeExchangeRates(data);
      this.applyCurrentCurrencyRateFromExchange();
      this.updateSummary();
      this.renderExchangeRatesPanel();
      return this.exchangeRates;
    } catch (error) {
      if (!this.exchangeRates) {
        this.exchangeRates = this.normalizeExchangeRates({
          baseCurrency: 'USD',
          rates: { USD: 1, ZAR: 20, ZIG: 400 },
          updatedAt: null
        });
      }
      this.renderExchangeRatesPanel();
      return this.exchangeRates;
    }
  },

  startExchangeRatesRefresh() {
    if (this.exchangeRatesRefreshTimer) {
      clearInterval(this.exchangeRatesRefreshTimer);
    }

    this.exchangeRatesRefreshTimer = setInterval(() => {
      this.loadExchangeRates();
    }, 30000);
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
      this.openCheckoutWithCurrency();
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

    document.getElementById('refreshExchangeRatesBtn')?.addEventListener('click', async () => {
      const refreshButton = document.getElementById('refreshExchangeRatesBtn');
      if (refreshButton) {
        refreshButton.disabled = true;
        refreshButton.textContent = 'Refreshing...';
      }

      await this.loadExchangeRates();

      if (refreshButton) {
        refreshButton.disabled = false;
        refreshButton.textContent = 'Refresh Rates Now';
      }
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

    if (!this.offlineSyncListenerBound) {
      window.addEventListener('offline-sale-synced', () => {
        this.loadProducts();
      });
      this.offlineSyncListenerBound = true;
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
    const canOpenAdminPage = isAdmin ||
      Auth.hasPermission('manage_user_permissions') ||
      Auth.hasPermission('manage_company_settings') ||
      Auth.hasPermission('edit_receipt_format');

    document.querySelectorAll('.admin-only').forEach(el => {
      el.style.display = canOpenAdminPage ? 'inline-block' : 'none';
    });

    const canTransact = Auth.hasPermission('customer_transactions');
    const checkoutBtn = document.getElementById('checkoutBtn');
    const confirmPaymentBtn = document.getElementById('confirmPaymentBtn');

    if (checkoutBtn) {
      checkoutBtn.disabled = !canTransact;
      checkoutBtn.title = canTransact ? '' : 'You do not have permission for customer transactions.';
    }

    if (confirmPaymentBtn) {
      confirmPaymentBtn.disabled = !canTransact;
      confirmPaymentBtn.title = canTransact ? '' : 'You do not have permission for customer transactions.';
    }
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
    const parsedRate = Number(localStorage.getItem('pos.currencyRate') || '1');
    const currencyRate = Number.isFinite(parsedRate) && parsedRate > 0 ? parsedRate : 1;
    return {
      currencyCode: localStorage.getItem('pos.currencyCode') || 'USD',
      currencySymbol: localStorage.getItem('pos.currencySymbol') || '$',
      currencyRate
    };
  },
  convertFromBase(amount) {
  const { currencyRate } = this.getCurrencySettings();
  const value = Number(amount) || 0;
  return value * currencyRate;
  },
  convertToBase(amount) {
    const { currencyRate } = this.getCurrencySettings();
    const value = Number(amount) || 0;
    if (!Number.isFinite(currencyRate) || currencyRate <= 0) return value;
    return value / currencyRate;
  },
  formatDisplayMoney(amountInDisplayCurrency) {
    const { currencySymbol } = this.getCurrencySettings();
    const value = Number(amountInDisplayCurrency) || 0;
    return `${currencySymbol}${value.toFixed(2)}`;
  },
  parseMoneyInput(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return 0;

    const cleaned = raw.replace(/[^\d,.-]/g, '');
    if (!cleaned) return 0;

    const hasDot = cleaned.includes('.');
    const hasComma = cleaned.includes(',');
    let normalized = cleaned;

    if (hasComma && hasDot) {
      normalized = cleaned.replace(/,/g, '');
    } else if (hasComma && !hasDot) {
      const parts = cleaned.split(',');
      const lastPart = parts[parts.length - 1] || '';
      if (lastPart.length === 3 && parts.length > 1) {
        normalized = cleaned.replace(/,/g, '');
      } else {
        normalized = cleaned.replace(/,/g, '.');
      }
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  },
  formatMoney(amount) {
    const { currencySymbol } = this.getCurrencySettings();
    const converted = this.convertFromBase(amount);
    return `${currencySymbol}${converted.toFixed(2)}`;
  },
  openCheckoutWithCurrency() {
  if (!Auth.hasPermission('customer_transactions')) {
    alert('You are not allowed to process customer transactions. Contact administrator.');
    return;
  }

  if (this.cart.length === 0) {
    alert('Cart is empty!');
    return;
  }
  const subtotal = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const totalUSD = subtotal * (1 + this.getTaxRate());

  if (typeof window.openMultiCurrencyPicker === 'function') {
    this.loadExchangeRates().then((fxData) => {
      window.openMultiCurrencyPicker({
        amount: totalUSD,
        fromCurrency: 'USD',
        fxData,
        onSelect: () => {
          this.renderExchangeRatesPanel();
          this.updateSummary();
          this.openPaymentModal();
        }
      });
    });
    return;
  }

  // fallback
  this.openPaymentModal();
},
  getTaxRate() {
    const percent = Number(localStorage.getItem('pos.taxRatePercent') || '10');
    if (!Number.isFinite(percent) || percent < 0) {
      return this.DEFAULT_TAX_RATE;
    }
    return percent / 100;
  },
  // ...existing code...
getItemTaxRate(item) {
  if (item?.taxExempt) return 0;
  if (Number.isFinite(Number(item?.taxRatePercent))) {
    return Number(item.taxRatePercent) / 100;
  }
  return this.getTaxRate();
},

calculateCartTotalsBase() {
  let subtotal = 0;
  let tax = 0;

  for (const item of this.cart) {
    const line = (Number(item.price) || 0) * (Number(item.quantity) || 0);
    subtotal += line;
    tax += line * this.getItemTaxRate(item);
  }

  return { subtotal, tax, total: subtotal + tax };
},
// ...existing code... 
  formatMoney(amount) {
    const { currencySymbol } = this.getCurrencySettings();
    const converted = this.convertFromBase(amount);
    return `${currencySymbol}${converted.toFixed(2)}`;
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
    const tax = subtotal * this.getTaxRate();
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
    const totals = this.calculateCartTotalsBase();
    const total = totals.total;
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
    const totals = this.calculateCartTotalsBase();
    const totalDisplay = this.convertFromBase(totals.total);
    const tenderedDisplay = this.parseMoneyInput(amountTendered);
    const changeDisplay = tenderedDisplay - totalDisplay;
    
    document.getElementById('changeDue').textContent = changeDisplay >= 0
      ? this.formatDisplayMoney(changeDisplay)
      : this.formatDisplayMoney(0);
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
  // ...existing code...
  escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[m]));
  },

  async getZimraConfig() {
    if (this.zimraConfig) return this.zimraConfig;

    const fallback = {
      baseUrl: 'https://fdms.zimra.co.zw',
      deviceId: 'EDIT_ME_DEVICE_ID',
      taxPayerTin: 'EDIT_ME_TIN',
      branchCode: 'EDIT_ME_BRANCH',
      qrSize: 180,
      enabled: true
    };

    try {
      const res = await fetch('/config/zimra-services.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load ZIMRA config');
      this.zimraConfig = { ...fallback, ...(await res.json()) };
      return this.zimraConfig;
    } catch (err) {
      console.warn('Using fallback ZIMRA config:', err.message);
      this.zimraConfig = fallback;
      return this.zimraConfig;
    }
  },

  buildZimraQrPayload(saleId) {
    const z = this.zimraConfig || {};
    const params = new URLSearchParams({
      tin: z.taxPayerTin || '',
      deviceId: z.deviceId || '',
      branch: z.branchCode || '',
      receiptNo: String(saleId)
    });
    return `${z.baseUrl || 'https://fdms.zimra.co.zw'}?${params.toString()}`;
  },

  buildQrImageUrl(payload, size = 180) {
    // External QR image generator (no npm package needed in browser)
    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(payload)}`;
  },
// ...existing code...
  buildReceiptHtml(saleId, paymentMethod, totals) {
    const settings = this.receiptSettings || this.normalizeReceiptSettings({});
    const currentUser = Auth.getUser();
    const defaultTitle = `Receipt #${saleId}`;
    const heading = settings.receiptHeader ? this.escapeHtml(settings.receiptHeader) : defaultTitle;
    const receiptDate = new Date().toLocaleString();

    const companyBits = [];
    if (settings.companyName) companyBits.push(`<div>${this.escapeHtml(settings.companyName)}</div>`);
    if (settings.companyAddress) companyBits.push(`<div>${this.escapeHtml(settings.companyAddress)}</div>`);
    if (settings.vatNumber) companyBits.push(`<div>VAT: ${this.escapeHtml(settings.vatNumber)}</div>`);
    if (settings.tinNumber) companyBits.push(`<div>TIN: ${this.escapeHtml(settings.tinNumber)}</div>`);

    const extraLines = String(settings.receiptExtra || '')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => `<div class="footer">${this.escapeHtml(line)}</div>`)
      .join('');

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
          th, td { font-size: 11px; padding: 4px 0; border-bottom: 1px dotted #ddd; }
          th { text-align: left; padding-bottom: 6px; }
          .col-code { width: 16%; text-align: left; }
          .col-item { width: 30%; text-align: left; }
          .col-price { width: 18%; text-align: right; }
          .col-qty { width: 12%; text-align: right; }
          .col-total { width: 24%; text-align: right; }
          .receipt-line { display: flex; justify-content: space-between; margin: 3px 0; font-size: 11px; }
          .total { font-weight: bold; margin-top: 6px; }
          .footer { text-align: center; font-size: 10px; color: #666; margin-top: 8px; }
        </style>
      </head>
      <body>
        <h2>${heading}</h2>
        ${settings.showCompanyDetails && companyBits.length ? `<div class="meta">${companyBits.join('')}</div>` : ''}
        ${settings.showDateTime ? `<div class="meta">${receiptDate}</div>` : ''}
        <div class="divider"></div>
        <table>
          <thead>
            <tr>
              <th class="col-code">Code</th>
              <th class="col-item">Item Name</th>
              <th class="col-price">Price</th>
              <th class="col-qty">Qty</th>
              <th class="col-total">Total</th>
            </tr>
          </thead>
          <tbody>
            ${this.cart.map(item => `
              <tr class="item-row">
                <td class="col-code">${item.hscode || item.barcode || '-'}</td>
                <td class="col-item">${item.name || '-'}</td>
                <td class="col-price">${this.formatMoney(item.price)}</td>
                <td class="col-qty">${item.quantity}</td>
                <td class="col-total">${this.formatMoney(item.price * item.quantity)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div class="divider"></div>
        <div class="receipt-line"><span>Subtotal</span><span>${this.formatMoney(totals.subtotal)}</span></div>
        <div class="receipt-line"><span>Tax</span><span>${this.formatMoney(totals.tax)}</span></div>
        <div class="receipt-line total"><span>Total</span><span>${this.formatMoney(totals.total)}</span></div>
        <div class="receipt-line"><span>Payment</span><span>${paymentMethod.toUpperCase()}</span></div>
        ${settings.showCashier ? `<div class="receipt-line"><span>Cashier</span><span>${this.escapeHtml(currentUser?.name || '-')}</span></div>` : ''}
        ${extraLines}
        <div class="footer">${this.escapeHtml(settings.receiptFooter || 'Thank you for your purchase')}</div>
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

  goBackToPosFromReceipt() {
    this.closeReceiptModal();
    Router.navigate('pos');
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

  isNetworkError(error) {
    if (!error) return false;
    if (!navigator.onLine) return true;
    if (typeof API?.isConnectionError === 'function' && API.isConnectionError(error)) return true;
    const message = String(error.message || '').toLowerCase();
    return message.includes('failed to fetch') || message.includes('network');
  },

  queueSaleOffline(salePayload, paymentMethod, totals) {
    const queueEntry = typeof window.OfflineSync?.enqueueSale === 'function'
      ? window.OfflineSync.enqueueSale(salePayload)
      : null;

    const offlineId = String(salePayload.clientSaleRef || queueEntry?.id || `offline-${Date.now()}`);
    const receiptHtml = this.buildReceiptHtml(`PENDING-${offlineId.slice(-8)}`, paymentMethod, totals);
    this.currentReceiptHtml = receiptHtml;
    this.currentReceiptId = offlineId;
    this.currentPaymentMethod = paymentMethod;
    this.currentSaleTotals = totals;

    document.getElementById('receiptContent').innerHTML = receiptHtml;
    document.getElementById('saleCompleteDetails').innerHTML = `
      <p class="transaction-id">Transaction ID: <strong>#${offlineId}</strong></p>
      <p class="transaction-method">Payment Method: <strong>${paymentMethod.toUpperCase()}</strong></p>
      <p class="transaction-total">Total Amount: <strong>${this.formatMoney(totals.total)}</strong></p>
      <p class="change-due">⏳ Offline mode: sale queued and will sync automatically when online.</p>
    `;

    this.showReceiptModal();
    this.cart = [];
    this.updateCart();
    this.closePaymentModal();
    alert('Sale saved offline and queued for sync.');
  },

  async completeSale() {
    const selectedMethod = document.querySelector('input[name="paymentMethod"]:checked').value;
    const taxRate = this.getTaxRate();
    const totals = this.calculateCartTotalsBase();
    const subtotal = totals.subtotal;
    const tax = totals.tax;
    const total = totals.total;
    const clientSaleRef = `sale-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    await this.loadProducts();

    if (!this.canFulfillCart()) {
      this.closePaymentModal();
      this.showStockAlert();
      return;
    }

    // Validate based on payment method
    if (selectedMethod === 'cash') {
      const amountTenderedDisplay = this.parseMoneyInput(document.getElementById('amountTendered').value);
      const totalDisplay = this.convertFromBase(total);
      if (amountTenderedDisplay < totalDisplay) {
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

    const user = Auth.getUser();
    const { currencyCode } = this.getCurrencySettings();
    const salePayload = {
      items: this.cart,
      subtotal,
      tax,
      total,
      userId: user.id,
      paymentMethod: selectedMethod,
      currencyCode,
      taxRate,
      clientSaleRef
    };

    if (!navigator.onLine) {
      this.queueSaleOffline(salePayload, selectedMethod, { subtotal, tax, total });
      return;
    }

    try {
      const result = await API.completeSale(salePayload);

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
        const amountTenderedDisplay = this.parseMoneyInput(document.getElementById('amountTendered').value);
        const totalDisplay = this.convertFromBase(total);
        const changeDisplay = amountTenderedDisplay - totalDisplay;
        changeMessage = `<p class="change-due">💰 Change Due: <strong>${this.formatDisplayMoney(changeDisplay)}</strong></p>`;
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
      if (this.isNetworkError(error)) {
        this.queueSaleOffline(salePayload, selectedMethod, { subtotal, tax, total });
        return;
      }
      console.error('Error completing sale:', error);
      alert(`Error completing sale: ${error.message}`);
    }
  }
};
