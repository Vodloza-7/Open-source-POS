const API = {
  BASE_URL: 'http://localhost:3000/api',

  async request(endpoint, options = {}) {
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
        const error = await response.json();
        throw new Error(error.error || `HTTP Error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`API Error [${endpoint}]:`, error);
      throw error;
    }
  },

  // Authentication
  login(username, password) {
    return this.request('/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
  },

  register(username, password, name) {
    return this.request('/register', {
      method: 'POST',
      body: JSON.stringify({ username, password, name })
    });
  },

  getUser(id) {
    return this.request(`/user/${id}`);
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

  // Sales
  completeSale(saleData) {
    return this.request('/sales', {
      method: 'POST',
      body: JSON.stringify(saleData)
    });
  },

  getSales() {
    return this.request('/sales');
  }
};
