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
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No sales records found.</td></tr>';
        return;
      }

      tbody.innerHTML = sales.map(sale => {
        const saleDate = new Date(sale.created_at);
        const formattedDate = saleDate.toLocaleString('en-US', {
          dateStyle: 'medium',
          timeStyle: 'short'
        });

        return `
          <tr>
            <td>#${sale.id}</td>
            <td>${formattedDate}</td>
            <td>${sale.cashierName || 'N/A'}</td>
            <td>${sale.items_count}</td>
            <td>$${sale.total.toFixed(2)}</td>
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
  }
};
