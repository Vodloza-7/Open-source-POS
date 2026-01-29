const ProductsModule = {
  async init() {
    this.setupEventListeners();
    this.updateUserDisplay();
    await this.loadProductsTable();
  },

  setupEventListeners() {
    const addProductForm = document.getElementById('addProductForm');
    if (addProductForm) {
      addProductForm.addEventListener('submit', (e) => this.handleAddProduct(e));
    }

    document.getElementById('backBtn')?.addEventListener('click', () => {
      Router.navigate('admin');
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
      const tbody = document.getElementById('productsTableBody');
      const loadingStatus = document.getElementById('productsLoadingStatus');

      if (loadingStatus) loadingStatus.style.display = 'none';

      tbody.innerHTML = products.map(product => `
        <tr>
          <td>${product.name}</td>
          <td>${product.category || '-'}</td>
          <td>${product.unit || 'item'}</td>
          <td>$${product.price.toFixed(2)}</td>
          <td>${product.stock}</td>
          <td class="actions">
            <input type="number" class="stock-input" placeholder="Add Qty" min="1">
            <button class="btn btn-secondary btn-sm" onclick="ProductsModule.updateStock(${product.id}, this)">Update Stock</button>
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

    const product = {
      name: document.getElementById('productName').value,
      price: parseFloat(document.getElementById('productPrice').value),
      unit: document.getElementById('productUnit').value || 'item',
      category: document.getElementById('productCategory').value,
      stock: parseInt(document.getElementById('productStock').value)
    };

    const statusEl = document.getElementById('addProductStatus');
    statusEl.textContent = 'Adding product...';
    statusEl.className = 'status-message loading';

    try {
      await API.addProduct(product);
      statusEl.textContent = 'Product added successfully!';
      statusEl.className = 'status-message success';
      document.getElementById('addProductForm').reset();
      await this.loadProductsTable();

      setTimeout(() => {
        statusEl.textContent = '';
        statusEl.className = '';
      }, 3000);
    } catch (error) {
      console.error('Error adding product:', error);
      statusEl.textContent = `Error: ${error.message}`;
      statusEl.className = 'status-message error';
    }
  },

  async updateStock(productId, buttonElement) {
    const row = buttonElement.closest('tr');
    const input = row.querySelector('.stock-input');
    const quantity = parseInt(input.value);

    if (!quantity || quantity <= 0) {
      alert('Please enter a valid quantity to add.');
      return;
    }

    try {
      await API.updateProductStock(productId, quantity);
      alert('Stock updated successfully!');
      input.value = '';
      await this.loadProductsTable(); // Refresh the table
    } catch (error) {
      alert(`Error updating stock: ${error.message}`);
    }
  }
};
