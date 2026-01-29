const SalesModule = {
  async init() {
    this.setupEventListeners();
    this.updateUserDisplay();
    await this.loadSalesHistory();
  },

  setupEventListeners() {
    document.getElementById('backToPosBtn')?.addEventListener('click', () => {
      Router.navigate('pos');
    });

    document.getElementById('manageProductsBtn')?.addEventListener('click', () => {
      Router.navigate('products');
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

  async loadSalesHistory() {
    const loadingStatus = document.getElementById('salesLoadingStatus');
    const tbody = document.getElementById('salesTableBody');
    
    try {
      const sales = await API.getSales();
      
      if (loadingStatus) loadingStatus.style.display = 'none';

      if (sales.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No sales records found.</td></tr>';
        return;
      }

      tbody.innerHTML = sales.map(sale => {
        const saleDate = new Date(sale.created_at);
        const formattedDate = saleDate.toLocaleString('en-US', {
          dateStyle: 'medium',
          timeStyle: 'short'
        });

        const itemsList = sale.items.map(item => 
          `${item.name} (x${item.quantity}) - $${(item.price * item.quantity).toFixed(2)}`
        ).join('<br>');

        return `
          <tr>
            <td>#${sale.id}</td>
            <td>${formattedDate}</td>
            <td>${sale.cashierName || 'N/A'}</td>
            <td>${sale.items_count}</td>
            <td>$${sale.total.toFixed(2)}</td>
            <td>
              <button class="btn btn-secondary btn-sm" onclick="SalesModule.showItems(${sale.id})">View Items</button>
            </td>
          </tr>
          <tr id="items-${sale.id}" class="sale-items-row" style="display: none;">
            <td colspan="6">
              <div class="sale-items-detail">
                <h4>Items Sold:</h4>
                <div class="items-list">${itemsList}</div>
              </div>
            </td>
          </tr>
        `;
      }).join('');

    } catch (error) {
      console.error('Error loading sales history:', error);
      if (loadingStatus) {
        loadingStatus.textContent = `Error: ${error.message}`;
        loadingStatus.className = 'loading error';
      }
    }
  },

  showItems(saleId) {
    const row = document.getElementById(`items-${saleId}`);
    if (row) {
      row.style.display = row.style.display === 'none' ? 'table-row' : 'none';
    }
  }
};
