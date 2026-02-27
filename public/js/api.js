function resolveApiBaseUrl() {
  if (window.POS_CONFIG && typeof window.POS_CONFIG.apiBaseUrl === 'string' && window.POS_CONFIG.apiBaseUrl.trim()) {
    return window.POS_CONFIG.apiBaseUrl.trim().replace(/\/$/, '');
  }

  const { protocol, hostname, port, origin } = window.location;
  if (port === '5500') {
    return `${protocol}//${hostname}:3000/api`;
  }

  return `${origin}/api`;
}

const API = {
  BASE_URL: resolveApiBaseUrl(),
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,

  async request(endpoint, options = {}, retryCount = 0) {
    const url = `${this.BASE_URL}${endpoint}`;
    try {
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        },
        ...options
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: `HTTP Error: ${response.status}` }));
        throw new Error(error.error || `HTTP Error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`API Error [${endpoint}]:`, error);

      // Retry logic for connection errors
      if (retryCount < this.MAX_RETRIES && this.isConnectionError(error)) {
        console.log(`Retrying... (${retryCount + 1}/${this.MAX_RETRIES})`);
        await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY));
        return this.request(endpoint, options, retryCount + 1);
      }

      throw error;
    }
  },

  isConnectionError(error) {
    return error instanceof TypeError &&
           (error.message.includes('Failed to fetch') ||
            error.message.includes('NetworkError') ||
            error.message.includes('connection'));
  },

  // Authentication
  login(username, password) {
    return this.request('/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
  },

  register(username, password, name, role = 'cashier') {
    return this.request('/register', {
      method: 'POST',
      body: JSON.stringify({ username, password, name, role })
    });
  },

  getUser(id) {
    return this.request(`/user/${id}`);
  },

  getUsers() {
    return this.request('/users');
  },

  getPermissionsCatalog() {
    return this.request('/permissions/catalog');
  },

  updateUserAccess(userId, payload) {
    return this.request(`/users/${userId}/access`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  },

  deleteUser(userId, payload) {
    return this.request(`/users/${userId}`, {
      method: 'DELETE',
      body: JSON.stringify(payload || {})
    });
  },

  // Products
  getProducts() {
    return this.request('/products');
  },

  addProduct(product) {
    return this.request('/products', {
      method: 'POST',
      body: JSON.stringify(product)
    });
  },

  updateProductStock(productId, quantity) {
    return this.request(`/products/${productId}/stock`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity })
    });
  },

  adjustStock(payload) {
    return this.request('/stock/adjust', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  deleteProduct(productId) {
    return this.request(`/products/${productId}`, {
      method: 'DELETE'
    });
  },

  updateProduct(productId, data) {
    return this.request(`/products/${productId}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
  },

  // Sales
  completeSale(saleData) {
    return this.request('/sales', {
      method: 'POST',
      body: JSON.stringify(saleData)
    });
  },

  getSales() {
    return this.request('/sales');
  },

  // Stock Notifications
  sendStockNotification(data) {
    return this.request('/notifications/stock-alert', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  // Reports
  getReport(params) {
    const query = new URLSearchParams(params || {}).toString();
    return this.request(`/reports?${query}`);
  },

  sendReportEmail(payload) {
    return this.request('/reports/email', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
   getExchangeSettings() {
    return this.request('/admin/exchange-settings');
   },

  getCurrentExchangeRates() {
    const query = new URLSearchParams({ t: String(Date.now()) }).toString();
    return this.request(`/exchange-rates/current?${query}`);
  },

saveExchangeSettings(payload) {
    return this.request('/admin/exchange-settings', {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
},

  getProfitDashboard(date) {
    const query = new URLSearchParams({ date: date || '' }).toString();
    return this.request(`/dashboard/profit?${query}`);
  },
  //exchange settings
  getFinanceSettings() {
    return this.request('/admin/finance-settings');
  },

  saveFinanceSettings(payload) {
    return this.request('/admin/finance-settings', {
      method: 'PUT',
      body: JSON.stringify(payload)
  });
  
},


  // Admin connection settings
  getConnectionSettings() {
    return this.request('/admin/connection-settings');
  },

  updateConnectionSettings(payload) {
    return this.request('/admin/connection-settings', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  },

  testConnectionSettings(payload) {
    return this.request('/admin/connection-settings/test', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  restartServer() {
    return this.request('/admin/restart', {
      method: 'POST'
    });
  },

  checkServerHealth() {
    return this.request('/health');
  }
};
