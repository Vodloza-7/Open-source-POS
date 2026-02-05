const AdminModule = {
  async init() {
    this.setupEventListeners();
    this.setupNavigation();
    this.loadSystemSettings();
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
  }
};
