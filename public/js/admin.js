const AdminModule = {
  currentReportData: null,

  async init() {
    this.setupEventListeners();
    this.setupNavigation();
    this.loadSystemSettings();
    this.setDefaultReportDates();
  },

  setupEventListeners() {
    document.getElementById('backToPosBtn')?.addEventListener('click', () => {
      Router.navigate('pos');
    });

    document.getElementById('logoutBtn')?.addEventListener('click', () => {
      Auth.logout();
      Router.navigate('login');
    });

    document.getElementById('addUserForm')?.addEventListener('submit', (e) => {
      this.handleAddUser(e);
    });

    document.getElementById('systemSettingsForm')?.addEventListener('submit', (e) => {
      this.handleSystemSettingsSave(e);
    });

    document.getElementById('currencyCode')?.addEventListener('change', () => {
      this.updateCurrencyPreview();
    });

    document.getElementById('currencySymbol')?.addEventListener('input', () => {
      this.updateCurrencyPreview();
    });

    document.getElementById('resetSystemSettingsBtn')?.addEventListener('click', () => {
      this.resetSystemSettings();
    });

    document.getElementById('reportForm')?.addEventListener('submit', (e) => {
      this.handleReportPreview(e);
    });

    document.getElementById('downloadReportPdfBtn')?.addEventListener('click', () => {
      this.downloadReportPdf();
    });

    document.getElementById('emailReportBtn')?.addEventListener('click', () => {
      this.sendReportByEmail();
    });
  },

  setupNavigation() {
    const navButtons = document.querySelectorAll('.admin-nav-btn');
    const panels = document.querySelectorAll('.admin-panel');

    const activateSection = (section) => {
      navButtons.forEach(btn => {
        btn.classList.toggle('is-active', btn.dataset.section === section);
      });
      panels.forEach(panel => {
        panel.classList.toggle('is-active', panel.dataset.section === section);
      });
    };

    navButtons.forEach(btn => {
      btn.addEventListener('click', () => activateSection(btn.dataset.section));
    });

    document.querySelectorAll('[data-section-target]').forEach(btn => {
      btn.addEventListener('click', () => activateSection(btn.dataset.sectionTarget));
    });

    activateSection('users');
  },

  async handleAddUser(e) {
    e.preventDefault();
    const statusEl = document.getElementById('addUserStatus');
    if (!statusEl) return;

    const userData = {
      name: document.getElementById('newUserName').value,
      username: document.getElementById('newUserUsername').value,
      password: document.getElementById('newUserPassword').value,
    };

    statusEl.textContent = 'Adding user...';
    statusEl.className = 'status-message loading';

    try {
      await API.register(userData.username, userData.password, userData.name);
      statusEl.textContent = 'User added successfully!';
      statusEl.className = 'status-message success';
      document.getElementById('addUserForm').reset();
    } catch (error) {
      statusEl.textContent = `Error: ${error.message}`;
      statusEl.className = 'status-message error';
    }
  },

  getSystemSettings() {
    return {
      currencyCode: localStorage.getItem('pos.currencyCode') || 'USD',
      currencySymbol: localStorage.getItem('pos.currencySymbol') || '$'
    };
  },

  loadSystemSettings() {
    const settings = this.getSystemSettings();
    const currencyCode = document.getElementById('currencyCode');
    const currencySymbol = document.getElementById('currencySymbol');

    if (currencyCode) currencyCode.value = settings.currencyCode;
    if (currencySymbol) currencySymbol.value = settings.currencySymbol;

    this.updateCurrencyPreview();
  },

  updateCurrencyPreview() {
    const currencyCode = document.getElementById('currencyCode');
    const currencySymbol = document.getElementById('currencySymbol');
    const preview = document.getElementById('currencyPreview');
    if (!currencyCode || !currencySymbol || !preview) return;

    const symbol = currencySymbol.value || '$';
    const code = currencyCode.value || 'USD';
    preview.value = `${symbol}1,234.56 (${code})`;
  },

  handleSystemSettingsSave(e) {
    e.preventDefault();
    const statusEl = document.getElementById('systemSettingsStatus');
    if (!statusEl) return;

    const currencyCode = document.getElementById('currencyCode')?.value || 'USD';
    const currencySymbol = document.getElementById('currencySymbol')?.value || '$';

    localStorage.setItem('pos.currencyCode', currencyCode);
    localStorage.setItem('pos.currencySymbol', currencySymbol);

    statusEl.textContent = 'System settings saved.';
    statusEl.className = 'status-message success';
  },

  resetSystemSettings() {
    localStorage.setItem('pos.currencyCode', 'USD');
    localStorage.setItem('pos.currencySymbol', '$');

    this.loadSystemSettings();

    const statusEl = document.getElementById('systemSettingsStatus');
    if (statusEl) {
      statusEl.textContent = 'System settings reset to defaults.';
      statusEl.className = 'status-message loading';
    }
  },

  setDefaultReportDates() {
    const endInput = document.getElementById('reportEndDate');
    const startInput = document.getElementById('reportStartDate');
    if (!endInput || !startInput) return;

    const now = new Date();
    const end = now.toISOString().slice(0, 10);

    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 30);
    const start = startDate.toISOString().slice(0, 10);

    if (!endInput.value) endInput.value = end;
    if (!startInput.value) startInput.value = start;
  },

  getReportFormValues() {
    return {
      type: document.getElementById('reportType')?.value || 'sales-by-cashier',
      startDate: document.getElementById('reportStartDate')?.value || '',
      endDate: document.getElementById('reportEndDate')?.value || '',
      email: document.getElementById('reportEmail')?.value?.trim() || ''
    };
  },

  formatMoney(amount) {
    const currencySymbol = localStorage.getItem('pos.currencySymbol') || '$';
    return `${currencySymbol}${(Number(amount) || 0).toFixed(2)}`;
  },

  setReportStatus(message, type = 'loading') {
    const statusEl = document.getElementById('reportStatus');
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = `status-message ${type}`;
  },

  async handleReportPreview(e) {
    e.preventDefault();
    this.setReportStatus('Generating report preview...', 'loading');

    const params = this.getReportFormValues();
    try {
      const report = await API.getReport(params);
      this.currentReportData = report;
      this.renderReportPreview(report);
      this.setReportStatus('Report preview generated.', 'success');
    } catch (error) {
      this.setReportStatus(`Error: ${error.message}`, 'error');
    }
  },

  getReportTitle(type) {
    if (type === 'sales-by-cashier') return 'Sales Report by Cashier';
    if (type === 'audit-trail') return 'Audit Trail Log';
    if (type === 'cash-sales') return 'Cash Sales Report';
    return 'POS Report';
  },

  renderReportPreview(report) {
    const container = document.getElementById('reportPreview');
    if (!container) return;

    const title = this.getReportTitle(report.type);
    const generatedAt = new Date(report.generatedAt).toLocaleString();

    if (!report.rows || report.rows.length === 0) {
      container.innerHTML = `<div class="report-preview"><h4>${title}</h4><p>No data for selected range.</p><p>Generated: ${generatedAt}</p></div>`;
      return;
    }

    const headerRow = report.columns.map(col => `<th>${col}</th>`).join('');
    const bodyRows = report.rows.map(row => {
      const tds = report.columns.map(col => {
        const key = report.columnMap[col];
        let val = row[key] ?? '';
        if (typeof val === 'number' && (key === 'totalSales' || key === 'total' || key === 'amount')) {
          val = this.formatMoney(val);
        }
        return `<td>${val}</td>`;
      }).join('');
      return `<tr>${tds}</tr>`;
    }).join('');

    container.innerHTML = `
      <div class="report-preview">
        <h4>${title}</h4>
        <p>From ${report.range.startDate || '-'} to ${report.range.endDate || '-'}</p>
        <div class="report-table-wrapper">
          <table class="sales-table">
            <thead><tr>${headerRow}</tr></thead>
            <tbody>${bodyRows}</tbody>
          </table>
        </div>
        <p>Generated: ${generatedAt}</p>
      </div>
    `;
  },

  buildReportPrintHtml(report) {
    const title = this.getReportTitle(report.type);
    const generatedAt = new Date(report.generatedAt).toLocaleString();
    const headerRow = report.columns.map(col => `<th>${col}</th>`).join('');
    const bodyRows = (report.rows || []).map(row => {
      const tds = report.columns.map(col => {
        const key = report.columnMap[col];
        let val = row[key] ?? '';
        if (typeof val === 'number' && (key === 'totalSales' || key === 'total' || key === 'amount')) {
          val = this.formatMoney(val);
        }
        return `<td>${val}</td>`;
      }).join('');
      return `<tr>${tds}</tr>`;
    }).join('');

    return `
      <html>
      <head>
        <title>${title}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
          h2 { margin-bottom: 8px; }
          .meta { color: #555; margin-bottom: 12px; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th, td { border: 1px solid #ccc; padding: 8px; font-size: 12px; text-align: left; }
          th { background: #f2f2f2; }
        </style>
      </head>
      <body>
        <h2>${title}</h2>
        <div class="meta">Range: ${report.range.startDate || '-'} to ${report.range.endDate || '-'}</div>
        <div class="meta">Generated: ${generatedAt}</div>
        <table>
          <thead><tr>${headerRow}</tr></thead>
          <tbody>${bodyRows || '<tr><td colspan="99">No data</td></tr>'}</tbody>
        </table>
      </body>
      </html>
    `;
  },

  downloadReportPdf() {
    if (!this.currentReportData) {
      this.setReportStatus('Please preview a report first.', 'error');
      return;
    }

    const html = this.buildReportPrintHtml(this.currentReportData);
    const win = window.open('', '_blank', 'width=980,height=700');
    if (!win) {
      this.setReportStatus('Popup blocked. Allow popups to download PDF.', 'error');
      return;
    }

    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
    this.setReportStatus('Print dialog opened. Choose "Save as PDF".', 'success');
  },

  async sendReportByEmail() {
    if (!this.currentReportData) {
      this.setReportStatus('Please preview a report first.', 'error');
      return;
    }

    const { email } = this.getReportFormValues();
    if (!email) {
      this.setReportStatus('Enter an email address first.', 'error');
      return;
    }

    this.setReportStatus('Sending report email...', 'loading');
    try {
      await API.sendReportEmail({
        email,
        report: this.currentReportData
      });
      this.setReportStatus('Report email sent successfully.', 'success');
    } catch (error) {
      this.setReportStatus(`Error: ${error.message}`, 'error');
    }
  }
};
