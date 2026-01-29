const SalesModule = {
  sales: [],

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

    document.getElementById('downloadReportBtn')?.addEventListener('click', () => {
      this.downloadReport();
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
      this.sales = sales;

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

      const totalSales = sales.reduce((sum, s) => sum + s.total, 0);
      const totalItems = sales.reduce((sum, s) => sum + s.items_count, 0);
      document.getElementById('reportTotalSales').textContent = `$${totalSales.toFixed(2)}`;
      document.getElementById('reportTotalItems').textContent = totalItems;

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
  },

  downloadReport() {
    if (!this.sales.length) {
      alert('No sales to report.');
      return;
    }

    const header = ['Sale ID', 'Date', 'Cashier', 'Items', 'Total'];
    const rows = this.sales.map(s => [
      s.id,
      new Date(s.created_at).toLocaleString(),
      s.cashierName || 'N/A',
      s.items_count,
      s.total.toFixed(2)
    ]);

    const csv = [header, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `sales-report-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
};
