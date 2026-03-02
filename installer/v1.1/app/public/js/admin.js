const AdminModule = {
  currentReportData: null,
  usersCache: [],
  suppliersCache: [],
  permissionCatalog: [
    { key: 'customer_transactions', label: 'Customer Transactions' },
    { key: 'manage_sales_orders', label: 'Manage Sales Orders' },
    { key: 'add_users', label: 'Add Users' },
    { key: 'delete_users', label: 'Delete Users' },
    { key: 'alter_inventory', label: 'Alter Inventory' },
    { key: 'manage_user_permissions', label: 'Manage User Roles & Permissions' },
    { key: 'manage_company_settings', label: 'Manage Company Parameters' },
    { key: 'edit_receipt_format', label: 'Edit Receipt Format' }
  ],
  roleOptions: ['cashier', 'supervisor', 'manager', 'admin'],
  sectionPermissions: {
    users: 'manage_user_permissions',
    company: 'manage_company_settings',
    security: 'manage_user_permissions',
    stock: 'alter_inventory',
    suppliers: 'alter_inventory',
    profit: 'manage_sales_orders',
    reports: 'manage_sales_orders',
    database: '__admin_only__',
    exchange: '__admin_only__',
    settings: '__settings_access__'
  },

  async init() {
    this.setupEventListeners();
    this.setupNavigation();
    this.applySectionAccessControl();
    this.setupUserAccessActions();
    this.loadSystemSettings();
    this.applyReceiptSettingsAccess();
    await this.loadReceiptSettings();
    if (this.hasSectionAccess('database')) {
      await this.loadConnectionSettings();
    }
    if (this.hasSectionAccess('users')) {
      await this.loadUsersList();
    }
    if (this.hasSectionAccess('company')) {
      await this.loadCompanyProfile();
    }
    if (this.hasSectionAccess('security')) {
      await this.loadSecuritySessions();
    }
    if (this.hasSectionAccess('stock')) {
      await this.loadStockPanel();
    }
    if (this.hasSectionAccess('suppliers')) {
      await this.loadSuppliers();
    }
    this.setDefaultReportDates();
    this.setDefaultProfitDate();
    if (this.hasSectionAccess('profit')) {
      await this.loadProfitDashboard();
    }
    if (this.hasSectionAccess('exchange')) {
      await this.loadExchangeSettingsPage();
    }
  },

  setupEventListeners() {
    document.getElementById('openDbConnectionBtn')?.addEventListener('click', () => {
      this.activateSection('database');
    });

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

    document.getElementById('refreshUsersBtn')?.addEventListener('click', () => {
      this.loadUsersList();
    });

    document.getElementById('companyProfileForm')?.addEventListener('submit', (e) => {
      this.handleCompanyProfileSave(e);
    });

    document.getElementById('refreshCompanyProfileBtn')?.addEventListener('click', () => {
      this.loadCompanyProfile();
    });

    document.getElementById('refreshSecuritySessionsBtn')?.addEventListener('click', () => {
      this.loadSecuritySessions();
    });

    document.getElementById('stockAdjustForm')?.addEventListener('submit', (e) => {
      this.handleStockAdjust(e);
    });

    document.getElementById('refreshStockBtn')?.addEventListener('click', () => {
      this.loadStockPanel();
    });

    document.getElementById('refreshProfitDashboardBtn')?.addEventListener('click', () => {
      this.loadProfitDashboard();
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

    document.getElementById('companySettingsForm')?.addEventListener('submit', (e) => {
      this.handleCompanySettingsSave(e);
    });

    document.getElementById('receiptFormatForm')?.addEventListener('submit', (e) => {
      this.handleReceiptFormatSave(e);
    });

    ['receiptHeader', 'receiptFooter', 'receiptExtra', 'showCompanyDetails', 'showReceiptDateTime', 'showReceiptCashier', 'companyName', 'companyAddress', 'companyVatNumber', 'companyTinNumber']
      .forEach(id => {
        document.getElementById(id)?.addEventListener('input', () => this.renderReceiptFormatPreview());
        document.getElementById(id)?.addEventListener('change', () => this.renderReceiptFormatPreview());
      });

    document.getElementById('supplierForm')?.addEventListener('submit', (e) => {
      this.handleSupplierSave(e);
    });

    document.getElementById('clearSupplierFormBtn')?.addEventListener('click', () => {
      this.resetSupplierForm();
      this.setSuppliersStatus('Supplier form reset.', 'loading');
    });

    document.getElementById('refreshSuppliersBtn')?.addEventListener('click', () => {
      this.loadSuppliers();
    });

    document.getElementById('suppliersTableContainer')?.addEventListener('click', async (event) => {
      const editBtn = event.target.closest('[data-action="edit-supplier"]');
      const deleteBtn = event.target.closest('[data-action="delete-supplier"]');

      if (editBtn) {
        const supplierId = Number(editBtn.dataset.supplierId || 0);
        if (supplierId > 0) {
          this.editSupplier(supplierId);
        }
        return;
      }

      if (deleteBtn) {
        const supplierId = Number(deleteBtn.dataset.supplierId || 0);
        if (supplierId > 0) {
          await this.deleteSupplier(supplierId);
        }
      }
    });

    document.getElementById('connectionSettingsForm')?.addEventListener('submit', (e) => {
      this.handleConnectionSettingsSave(e);
    });

    document.getElementById('refreshConnectionSettingsBtn')?.addEventListener('click', () => {
      this.loadConnectionSettings();
    });

    document.getElementById('checkServerStatusBtn')?.addEventListener('click', () => {
      this.checkServerStatus();
    });

    document.getElementById('restartServerBtn')?.addEventListener('click', () => {
      this.restartServer();
    });

    document.getElementById('useXamppDefaultsBtn')?.addEventListener('click', () => {
      this.applyXamppDefaults();
    });

    document.getElementById('testDbConnectionBtn')?.addEventListener('click', () => {
      this.testDatabaseConnection();
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

  setupUserAccessActions() {
    const usersContainer = document.getElementById('usersListContainer');
    if (!usersContainer) return;

    usersContainer.addEventListener('click', async (event) => {
      const saveButton = event.target.closest('[data-action="save-user"]');
      const deleteButton = event.target.closest('[data-action="delete-user"]');

      if (saveButton) {
        const userId = Number(saveButton.dataset.userId || 0);
        if (userId > 0) {
          await this.handleSaveUser(userId);
        }
        return;
      }

      if (deleteButton) {
        const userId = Number(deleteButton.dataset.userId || 0);
        if (userId > 0) {
          await this.handleDeleteUser(userId);
        }
      }
    });
  },

  setupNavigation() {
    const navButtons = document.querySelectorAll('.admin-nav-btn');
    const panels = document.querySelectorAll('.admin-panel');

    const activateSection = (section) => {
      if (!this.hasSectionAccess(section)) {
        const fallbackSection = this.getDefaultSection();
        section = fallbackSection;
      }

      navButtons.forEach(btn => {
        btn.classList.toggle('is-active', btn.dataset.section === section);
      });
      panels.forEach(panel => {
        panel.classList.toggle('is-active', panel.dataset.section === section);
      });
    };

    this.activateSection = activateSection;

    navButtons.forEach(btn => {
      btn.addEventListener('click', () => activateSection(btn.dataset.section));
    });

    document.querySelectorAll('[data-section-target]').forEach(btn => {
      btn.addEventListener('click', () => activateSection(btn.dataset.sectionTarget));
    });

    this.activateSection(this.getDefaultSection());
  },

  hasSectionAccess(section) {
    const key = String(section || '').trim();
    if (!key) return false;
    if (Auth.isAdmin()) return true;

    const accessRule = this.sectionPermissions[key];
    if (!accessRule) return false;
    if (accessRule === '__admin_only__') return false;
    if (accessRule === '__settings_access__') {
      return this.canEditCompanySettings() || this.canEditReceiptFormat();
    }

    return Auth.hasPermission(accessRule);
  },

  getDefaultSection() {
    const preferred = ['users', 'company', 'security', 'settings', 'stock', 'profit', 'reports', 'exchange', 'database', 'suppliers'];
    const allowed = preferred.find(section => this.hasSectionAccess(section));
    return allowed || 'settings';
  },

  applySectionAccessControl() {
    document.querySelectorAll('.admin-nav-btn').forEach(btn => {
      const section = String(btn.dataset.section || '').trim();
      const allowed = this.hasSectionAccess(section);
      btn.style.display = allowed ? '' : 'none';
      btn.disabled = !allowed;
    });

    document.querySelectorAll('[data-section-target]').forEach(btn => {
      const section = String(btn.dataset.sectionTarget || '').trim();
      const allowed = this.hasSectionAccess(section);
      btn.style.display = allowed ? '' : 'none';
      btn.disabled = !allowed;
    });

    document.querySelectorAll('.admin-panel').forEach(panel => {
      const section = String(panel.dataset.section || '').trim();
      const allowed = this.hasSectionAccess(section);
      panel.style.display = allowed ? '' : 'none';
      panel.classList.toggle('is-active', false);
    });

    if (typeof this.activateSection === 'function') {
      this.activateSection(this.getDefaultSection());
    }
  },

  async handleAddUser(e) {
    e.preventDefault();
    const statusEl = document.getElementById('addUserStatus');
    if (!statusEl) return;

    const userData = {
      name: document.getElementById('newUserName').value,
      username: document.getElementById('newUserUsername').value,
      password: document.getElementById('newUserPassword').value,
      role: document.getElementById('newUserRole')?.value || 'cashier'
    };

    statusEl.textContent = 'Adding user...';
    statusEl.className = 'status-message loading';

    try {
      await API.register(userData.username, userData.password, userData.name, userData.role);
      statusEl.textContent = 'User added successfully!';
      statusEl.className = 'status-message success';
      document.getElementById('addUserForm').reset();
      await this.loadUsersList();
    } catch (error) {
      statusEl.textContent = `Error: ${error.message}`;
      statusEl.className = 'status-message error';
    }
  },

  setUsersStatus(message, type = 'loading') {
    const statusEl = document.getElementById('usersListStatus');
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = `status-message ${type}`;
  },

  formatUserDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString();
  },

  renderUsersList(users) {
    const container = document.getElementById('usersListContainer');
    if (!container) return;

    if (!Array.isArray(users) || users.length === 0) {
      container.innerHTML = '<div class="admin-placeholder">No users found.</div>';
      return;
    }

    const currentUser = Auth.getUser();
    const canManage = Boolean(currentUser && currentUser.role === 'admin');

    const rows = users.map(user => {
      const nameControl = canManage
        ? `<input type="text" class="user-name-input" data-user-id="${user.id}" value="${this.escapeHtml(user.name || '')}" maxlength="255">`
        : this.escapeHtml(user.name || '-');

      const usernameControl = canManage
        ? `<input type="text" class="user-username-input" data-user-id="${user.id}" value="${this.escapeHtml(user.username || '')}" maxlength="100">`
        : this.escapeHtml(user.username || '-');

      const roleControl = canManage
        ? `
          <select class="user-role-select" data-user-id="${user.id}">
            ${this.roleOptions.map(role => `
              <option value="${role}" ${String(user.role || '') === role ? 'selected' : ''}>${this.formatRoleLabel(role)}</option>
            `).join('')}
          </select>
        `
        : `<span class="role-pill">${this.formatRoleLabel(user.role || '-')}</span>`;

      const permissionChecks = this.permissionCatalog.map(permission => {
        const checked = Array.isArray(user.permissions) && user.permissions.includes(permission.key);
        const disabledAttr = canManage ? '' : 'disabled';
        return `
          <label class="permission-check">
            <input type="checkbox" data-user-id="${user.id}" data-permission-key="${permission.key}" ${checked ? 'checked' : ''} ${disabledAttr}>
            <span>${permission.label}</span>
          </label>
        `;
      }).join('');

      const actions = canManage
        ? `
          <input type="password" class="user-password-input" data-user-id="${user.id}" placeholder="New password (optional)" maxlength="255">
          <div class="users-actions">
            <button class="btn btn-primary btn-sm" type="button" data-action="save-user" data-user-id="${user.id}">Save User</button>
            <button class="btn btn-danger btn-sm" type="button" data-action="delete-user" data-user-id="${user.id}" ${currentUser?.id === user.id ? 'disabled' : ''}>Delete User</button>
          </div>
        `
        : '<span class="role-pill">View only</span>';

      return `
        <tr>
          <td>${user.id}</td>
          <td>${nameControl}</td>
          <td>${usernameControl}</td>
          <td>${roleControl}</td>
          <td>
            <div class="permissions-grid">${permissionChecks}</div>
          </td>
          <td>${actions}</td>
          <td>${this.formatUserDate(user.created_at)}</td>
        </tr>
      `;
    }).join('');

    container.innerHTML = `
      <div class="report-table-wrapper">
        <table class="sales-table users-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Username</th>
              <th>Role</th>
              <th>Permissions</th>
              <th>Actions</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  },

  formatRoleLabel(role) {
    const value = String(role || '').trim().toLowerCase();
    if (!value) return '-';
    if (value === 'admin') return 'Administrator';
    return value.charAt(0).toUpperCase() + value.slice(1);
  },

  escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[m]));
  },

  collectPermissionsForUser(userId) {
    const checks = document.querySelectorAll(`input[type="checkbox"][data-user-id="${userId}"][data-permission-key]`);
    const selected = [];
    checks.forEach(check => {
      if (check.checked) {
        selected.push(check.dataset.permissionKey);
      }
    });
    return selected;
  },

  async handleSaveUser(userId) {
    const currentUser = Auth.getUser();
    if (!currentUser || currentUser.role !== 'admin') {
      this.setUsersStatus('Only administrators can manage user access.', 'error');
      return;
    }

    const nameInput = document.querySelector(`input.user-name-input[data-user-id="${userId}"]`);
    const usernameInput = document.querySelector(`input.user-username-input[data-user-id="${userId}"]`);
    const passwordInput = document.querySelector(`input.user-password-input[data-user-id="${userId}"]`);
    const roleSelect = document.querySelector(`select.user-role-select[data-user-id="${userId}"]`);

    const name = String(nameInput?.value || '').trim();
    const username = String(usernameInput?.value || '').trim();
    const selectedRole = roleSelect?.value || 'cashier';
    const selectedPermissions = this.collectPermissionsForUser(userId);
    const password = String(passwordInput?.value || '').trim();

    if (!name) {
      this.setUsersStatus('Name cannot be empty.', 'error');
      nameInput?.focus();
      return;
    }

    if (!username) {
      this.setUsersStatus('Username cannot be empty.', 'error');
      usernameInput?.focus();
      return;
    }

    this.setUsersStatus('Saving user...', 'loading');
    try {
      await API.updateUser(userId, {
        actorId: currentUser.id,
        actorRole: currentUser.role,
        name,
        username,
        password,
        role: selectedRole,
        permissions: selectedPermissions
      });
      this.setUsersStatus('User saved successfully.', 'success');
      await this.loadUsersList();
    } catch (error) {
      this.setUsersStatus(`Error: ${error.message}`, 'error');
    }
  },

  async handleDeleteUser(userId) {
    const currentUser = Auth.getUser();
    if (!currentUser || currentUser.role !== 'admin') {
      this.setUsersStatus('Only administrators can delete users.', 'error');
      return;
    }

    if (currentUser.id === userId) {
      this.setUsersStatus('You cannot delete the currently logged-in administrator.', 'error');
      return;
    }

    const target = this.usersCache.find(item => Number(item.id) === Number(userId));
    const targetName = target?.name || target?.username || `User #${userId}`;
    const confirmed = confirm(`Delete ${targetName}? This action cannot be undone.`);
    if (!confirmed) return;

    this.setUsersStatus('Deleting user...', 'loading');
    try {
      await API.deleteUser(userId, {
        actorId: currentUser.id,
        actorRole: currentUser.role
      });
      this.setUsersStatus('User deleted successfully.', 'success');
      await this.loadUsersList();
    } catch (error) {
      this.setUsersStatus(`Error: ${error.message}`, 'error');
    }
  },

  async loadUsersList() {
    this.setUsersStatus('Loading users...', 'loading');
    try {
      try {
        const catalog = await API.getPermissionsCatalog();
        if (Array.isArray(catalog?.permissions) && catalog.permissions.length) {
          this.permissionCatalog = catalog.permissions;
        }
        if (Array.isArray(catalog?.roles) && catalog.roles.length) {
          this.roleOptions = catalog.roles;
        }
      } catch (catalogError) {
        console.warn('Permissions catalog unavailable:', catalogError.message);
      }

      const users = await API.getUsers();
      this.usersCache = Array.isArray(users) ? users : [];
      this.renderUsersList(users);
      this.setUsersStatus(`Loaded ${users.length} user(s).`, 'success');
    } catch (error) {
      this.setUsersStatus(`Error: ${error.message}`, 'error');
      const container = document.getElementById('usersListContainer');
      if (container) {
        container.innerHTML = '<div class="admin-placeholder">Failed to load users.</div>';
      }
    }
  },

  setCompanyProfileStatus(message, type = 'loading') {
    const statusEl = document.getElementById('companyProfileStatus');
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = `status-message ${type}`;
  },

  applyCompanyProfileToForm(profile) {
    if (!profile) return;
    const mapping = [
      ['companyLegalName', profile.legalName || ''],
      ['companyTradingName', profile.tradingName || ''],
      ['companyEdition', profile.edition || ''],
      ['companySupportPhone', profile.supportPhone || ''],
      ['companySupportEmail', profile.supportEmail || ''],
      ['companyWebsite', profile.website || ''],
      ['companyAddressLine', profile.addressLine || ''],
      ['companyCity', profile.city || ''],
      ['companyCountry', profile.country || ''],
      ['companyVat', profile.vatNumber || ''],
      ['companyTin', profile.tinNumber || ''],
      ['companyRegNumber', profile.registrationNumber || '']
    ];

    mapping.forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) element.value = value;
    });
  },

  collectCompanyProfileForm() {
    return {
      legalName: document.getElementById('companyLegalName')?.value?.trim() || '',
      tradingName: document.getElementById('companyTradingName')?.value?.trim() || '',
      edition: document.getElementById('companyEdition')?.value?.trim() || '',
      supportPhone: document.getElementById('companySupportPhone')?.value?.trim() || '',
      supportEmail: document.getElementById('companySupportEmail')?.value?.trim() || '',
      website: document.getElementById('companyWebsite')?.value?.trim() || '',
      addressLine: document.getElementById('companyAddressLine')?.value?.trim() || '',
      city: document.getElementById('companyCity')?.value?.trim() || '',
      country: document.getElementById('companyCountry')?.value?.trim() || '',
      vatNumber: document.getElementById('companyVat')?.value?.trim() || '',
      tinNumber: document.getElementById('companyTin')?.value?.trim() || '',
      registrationNumber: document.getElementById('companyRegNumber')?.value?.trim() || ''
    };
  },

  async loadCompanyProfile() {
    if (!this.canEditCompanySettings()) {
      this.setCompanyProfileStatus('View only: assign "Manage Company Parameters" permission to access this section.', 'loading');
      return;
    }

    this.setCompanyProfileStatus('Loading company profile...', 'loading');
    try {
      const actor = this.getCurrentActorPayload();
      const profile = await API.getCompanyProfile(actor);
      this.applyCompanyProfileToForm(profile);
      this.setCompanyProfileStatus('Company profile loaded.', 'success');
    } catch (error) {
      this.setCompanyProfileStatus(`Error: ${error.message}`, 'error');
    }
  },

  async handleCompanyProfileSave(e) {
    e.preventDefault();
    if (!this.canEditCompanySettings()) {
      this.setCompanyProfileStatus('You are not allowed to edit company profile.', 'error');
      return;
    }

    this.setCompanyProfileStatus('Saving company profile...', 'loading');
    try {
      const actor = this.getCurrentActorPayload();
      const companyProfile = this.collectCompanyProfileForm();
      const saved = await API.saveCompanyProfile({
        ...actor,
        companyProfile
      });
      this.applyCompanyProfileToForm(saved);
      this.setCompanyProfileStatus('Company profile saved.', 'success');
    } catch (error) {
      this.setCompanyProfileStatus(`Error: ${error.message}`, 'error');
    }
  },

  setSecuritySessionsStatus(message, type = 'loading') {
    const statusEl = document.getElementById('securitySessionsStatus');
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = `status-message ${type}`;
  },

  renderSecuritySessions(sessions) {
    const container = document.getElementById('securitySessionsContainer');
    if (!container) return;

    if (!Array.isArray(sessions) || sessions.length === 0) {
      container.innerHTML = '<div class="admin-placeholder">No login sessions found.</div>';
      return;
    }

    const rows = sessions.map(session => `
      <tr>
        <td>${session.userName || '-'}</td>
        <td>${session.username || '-'}</td>
        <td>${session.role || '-'}</td>
        <td>${session.deviceName || '-'}</td>
        <td>${session.ipAddress || '-'}</td>
        <td>${session.isActive ? 'Active' : 'Closed'}</td>
        <td>${session.loginAt ? new Date(session.loginAt).toLocaleString() : '-'}</td>
        <td>${session.lastSeenAt ? new Date(session.lastSeenAt).toLocaleString() : '-'}</td>
      </tr>
    `).join('');

    container.innerHTML = `
      <div class="report-table-wrapper security-sessions-scroll" style="max-height:60vh;overflow:auto;">
        <table class="sales-table security-sessions-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Username</th>
              <th>Role</th>
              <th>Device</th>
              <th>IP Address</th>
              <th>Status</th>
              <th>Login At</th>
              <th>Last Seen</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  },

  async loadSecuritySessions() {
    if (!Auth.hasPermission('manage_user_permissions')) {
      this.setSecuritySessionsStatus('View only: assign "Manage User Roles & Permissions" permission to access session monitoring.', 'loading');
      return;
    }

    this.setSecuritySessionsStatus('Loading security sessions...', 'loading');
    try {
      const actor = this.getCurrentActorPayload();
      const sessions = await API.getSecuritySessions(actor);
      this.renderSecuritySessions(sessions);
      this.setSecuritySessionsStatus(`Loaded ${sessions.length} session(s).`, 'success');
    } catch (error) {
      this.setSecuritySessionsStatus(`Error: ${error.message}`, 'error');
    }
  },

  getSystemSettings() {
    return {
      currencyCode: localStorage.getItem('pos.currencyCode') || 'USD',
      currencySymbol: localStorage.getItem('pos.currencySymbol') || '$',
      taxRatePercent: Number(localStorage.getItem('pos.taxRatePercent') || '10')
    };
  },

  loadSystemSettings() {
    const settings = this.getSystemSettings();
    const currencyCode = document.getElementById('currencyCode');
    const currencySymbol = document.getElementById('currencySymbol');
    const taxRate = document.getElementById('taxRate');

    if (currencyCode) currencyCode.value = settings.currencyCode;
    if (currencySymbol) currencySymbol.value = settings.currencySymbol;
    if (taxRate) taxRate.value = Number.isFinite(settings.taxRatePercent) ? settings.taxRatePercent : 10;

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
    const taxRatePercent = Number(document.getElementById('taxRate')?.value || 10);

    if (!Number.isFinite(taxRatePercent) || taxRatePercent < 0 || taxRatePercent > 100) {
      statusEl.textContent = 'Tax rate must be between 0 and 100.';
      statusEl.className = 'status-message error';
      return;
    }

    localStorage.setItem('pos.currencyCode', currencyCode);
    localStorage.setItem('pos.currencySymbol', currencySymbol);
    localStorage.setItem('pos.taxRatePercent', String(taxRatePercent));

    statusEl.textContent = 'System settings saved.';
    statusEl.className = 'status-message success';
  },

  resetSystemSettings() {
    localStorage.setItem('pos.currencyCode', 'USD');
    localStorage.setItem('pos.currencySymbol', '$');
    localStorage.setItem('pos.taxRatePercent', '10');

    this.loadSystemSettings();

    const statusEl = document.getElementById('systemSettingsStatus');
    if (statusEl) {
      statusEl.textContent = 'System settings reset to defaults.';
      statusEl.className = 'status-message loading';
    }
  },

  getCurrentActorPayload() {
    const user = Auth.getUser();
    return {
      actorId: Number(user?.id || 0),
      actorRole: String(user?.role || '')
    };
  },

  canEditCompanySettings() {
    return Auth.hasPermission('manage_company_settings');
  },

  canEditReceiptFormat() {
    return Auth.hasPermission('edit_receipt_format');
  },

  setCompanySettingsStatus(message, type = 'loading') {
    const statusEl = document.getElementById('companySettingsStatus');
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = `status-message ${type}`;
  },

  setReceiptFormatStatus(message, type = 'loading') {
    const statusEl = document.getElementById('receiptFormatStatus');
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = `status-message ${type}`;
  },

  renderReceiptFormatPreview() {
    const previewEl = document.getElementById('receiptFormatPreview');
    if (!previewEl) return;

    const companyName = document.getElementById('companyName')?.value?.trim() || 'Company Name';
    const companyAddress = document.getElementById('companyAddress')?.value?.trim() || 'Company Address';
    const vatNumber = document.getElementById('companyVatNumber')?.value?.trim() || '';
    const tinNumber = document.getElementById('companyTinNumber')?.value?.trim() || '';
    const receiptHeader = document.getElementById('receiptHeader')?.value?.trim() || 'Receipt #1001';
    const receiptFooter = document.getElementById('receiptFooter')?.value?.trim() || 'Thank you for your purchase';
    const receiptExtra = document.getElementById('receiptExtra')?.value || '';
    const showCompanyDetails = Boolean(document.getElementById('showCompanyDetails')?.checked);
    const showDateTime = Boolean(document.getElementById('showReceiptDateTime')?.checked);
    const showCashier = Boolean(document.getElementById('showReceiptCashier')?.checked);
    const nowText = new Date().toLocaleString();
    const currencySymbol = localStorage.getItem('pos.currencySymbol') || '$';

    const extraLines = String(receiptExtra)
      .split(/\r?\n/)
      .map(line => this.escapeHtml(line.trim()))
      .filter(Boolean)
      .map(line => `<div class="receipt-line footer-line">${line}</div>`)
      .join('');

    previewEl.innerHTML = `
      <h4>Live Receipt Preview</h4>
      <div class="receipt-preview-paper">
        <div class="receipt-center receipt-title">${this.escapeHtml(receiptHeader)}</div>
        ${showCompanyDetails ? `
          <div class="receipt-center">${this.escapeHtml(companyName)}</div>
          <div class="receipt-center">${this.escapeHtml(companyAddress)}</div>
          ${vatNumber ? `<div class="receipt-center">VAT: ${this.escapeHtml(vatNumber)}</div>` : ''}
          ${tinNumber ? `<div class="receipt-center">TIN: ${this.escapeHtml(tinNumber)}</div>` : ''}
        ` : ''}
        ${showDateTime ? `<div class="receipt-center">${this.escapeHtml(nowText)}</div>` : ''}
        <div class="receipt-divider"></div>
        <div class="receipt-line"><span>Sample Item x2</span><span>${currencySymbol}20.00</span></div>
        <div class="receipt-line"><span>Sample Item x1</span><span>${currencySymbol}10.00</span></div>
        <div class="receipt-divider"></div>
        <div class="receipt-line"><span>Subtotal</span><span>${currencySymbol}30.00</span></div>
        <div class="receipt-line"><span>Tax</span><span>${currencySymbol}3.00</span></div>
        <div class="receipt-line total"><span>Total</span><span>${currencySymbol}33.00</span></div>
        ${showCashier ? '<div class="receipt-line"><span>Cashier</span><span>John Doe</span></div>' : ''}
        ${extraLines}
        <div class="receipt-center receipt-footer">${this.escapeHtml(receiptFooter)}</div>
      </div>
    `;
  },

  applyReceiptSettingsAccess() {
    const canEditCompany = this.canEditCompanySettings();
    const canEditFormat = this.canEditReceiptFormat();

    const companyForm = document.getElementById('companySettingsForm');
    if (companyForm) {
      companyForm.querySelectorAll('input, textarea, select, button').forEach(el => {
        el.disabled = !canEditCompany;
      });
      if (!canEditCompany) {
        this.setCompanySettingsStatus('View only: assign "Manage Company Parameters" permission to edit.', 'loading');
      }
    }

    const receiptForm = document.getElementById('receiptFormatForm');
    if (receiptForm) {
      receiptForm.querySelectorAll('input, textarea, select, button').forEach(el => {
        el.disabled = !canEditFormat;
      });
      if (!canEditFormat) {
        this.setReceiptFormatStatus('View only: assign "Edit Receipt Format" permission to edit.', 'loading');
      }
    }
  },

  applyReceiptSettingsToForms(settings) {
    if (!settings) return;

    const companyName = document.getElementById('companyName');
    const companyAddress = document.getElementById('companyAddress');
    const companyVatNumber = document.getElementById('companyVatNumber');
    const companyTinNumber = document.getElementById('companyTinNumber');
    const receiptHeader = document.getElementById('receiptHeader');
    const receiptFooter = document.getElementById('receiptFooter');
    const receiptExtra = document.getElementById('receiptExtra');
    const showCompanyDetails = document.getElementById('showCompanyDetails');
    const showReceiptDateTime = document.getElementById('showReceiptDateTime');
    const showReceiptCashier = document.getElementById('showReceiptCashier');

    if (companyName) companyName.value = settings.companyName || '';
    if (companyAddress) companyAddress.value = settings.companyAddress || '';
    if (companyVatNumber) companyVatNumber.value = settings.vatNumber || '';
    if (companyTinNumber) companyTinNumber.value = settings.tinNumber || '';
    if (receiptHeader) receiptHeader.value = settings.receiptHeader || '';
    if (receiptFooter) receiptFooter.value = settings.receiptFooter || 'Thank you for your purchase';
    if (receiptExtra) receiptExtra.value = settings.receiptExtra || '';
    if (showCompanyDetails) showCompanyDetails.checked = settings.showCompanyDetails !== false;
    if (showReceiptDateTime) showReceiptDateTime.checked = settings.showDateTime !== false;
    if (showReceiptCashier) showReceiptCashier.checked = settings.showCashier !== false;
    this.renderReceiptFormatPreview();
  },

  async loadReceiptSettings() {
    const actor = this.getCurrentActorPayload();
    const canAccessAdmin = this.canEditCompanySettings() || this.canEditReceiptFormat();

    this.setCompanySettingsStatus('Loading company parameters...', 'loading');
    this.setReceiptFormatStatus('Loading receipt format...', 'loading');

    try {
      const settings = canAccessAdmin
        ? await API.getAdminReceiptSettings(actor)
        : await API.getReceiptSettings();
      this.applyReceiptSettingsToForms(settings);
      this.setCompanySettingsStatus('Company parameters loaded.', 'success');
      this.setReceiptFormatStatus('Receipt format loaded.', 'success');
    } catch (error) {
      this.setCompanySettingsStatus(`Error: ${error.message}`, 'error');
      this.setReceiptFormatStatus(`Error: ${error.message}`, 'error');
    }
  },

  collectCompanySettingsForm() {
    return {
      companyName: document.getElementById('companyName')?.value?.trim() || '',
      companyAddress: document.getElementById('companyAddress')?.value?.trim() || '',
      vatNumber: document.getElementById('companyVatNumber')?.value?.trim() || '',
      tinNumber: document.getElementById('companyTinNumber')?.value?.trim() || ''
    };
  },

  collectReceiptFormatForm() {
    return {
      receiptHeader: document.getElementById('receiptHeader')?.value?.trim() || '',
      receiptFooter: document.getElementById('receiptFooter')?.value?.trim() || 'Thank you for your purchase',
      receiptExtra: document.getElementById('receiptExtra')?.value || '',
      showCompanyDetails: Boolean(document.getElementById('showCompanyDetails')?.checked),
      showDateTime: Boolean(document.getElementById('showReceiptDateTime')?.checked),
      showCashier: Boolean(document.getElementById('showReceiptCashier')?.checked)
    };
  },

  async handleCompanySettingsSave(e) {
    e.preventDefault();
    if (!this.canEditCompanySettings()) {
      this.setCompanySettingsStatus('You are not allowed to edit company parameters.', 'error');
      return;
    }

    this.setCompanySettingsStatus('Saving company parameters...', 'loading');
    try {
      const actor = this.getCurrentActorPayload();
      const company = this.collectCompanySettingsForm();
      const settings = await API.saveAdminReceiptSettings({
        ...actor,
        company
      });
      this.applyReceiptSettingsToForms(settings);
      this.setCompanySettingsStatus('Company parameters saved.', 'success');
    } catch (error) {
      this.setCompanySettingsStatus(`Error: ${error.message}`, 'error');
    }
  },

  async handleReceiptFormatSave(e) {
    e.preventDefault();
    if (!this.canEditReceiptFormat()) {
      this.setReceiptFormatStatus('You are not allowed to edit receipt format.', 'error');
      return;
    }

    this.setReceiptFormatStatus('Saving receipt format...', 'loading');
    try {
      const actor = this.getCurrentActorPayload();
      const receiptFormat = this.collectReceiptFormatForm();
      const settings = await API.saveAdminReceiptSettings({
        ...actor,
        receiptFormat
      });
      this.applyReceiptSettingsToForms(settings);
      this.renderReceiptFormatPreview();
      this.setReceiptFormatStatus('Receipt format saved.', 'success');
    } catch (error) {
      this.setReceiptFormatStatus(`Error: ${error.message}`, 'error');
    }
  },

  setSuppliersStatus(message, type = 'loading') {
    const statusEl = document.getElementById('suppliersStatus');
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = `status-message ${type}`;
  },

  collectSupplierForm() {
    return {
      id: Number(document.getElementById('supplierId')?.value || 0),
      name: document.getElementById('supplierName')?.value?.trim() || '',
      contactPerson: document.getElementById('supplierContactPerson')?.value?.trim() || '',
      phone: document.getElementById('supplierPhone')?.value?.trim() || '',
      email: document.getElementById('supplierEmail')?.value?.trim() || '',
      addressLine: document.getElementById('supplierAddressLine')?.value?.trim() || '',
      notes: document.getElementById('supplierNotes')?.value || '',
      isActive: Boolean(document.getElementById('supplierIsActive')?.checked)
    };
  },

  resetSupplierForm() {
    const form = document.getElementById('supplierForm');
    form?.reset();
    const idEl = document.getElementById('supplierId');
    if (idEl) idEl.value = '';
    const activeEl = document.getElementById('supplierIsActive');
    if (activeEl) activeEl.checked = true;
    const saveBtn = document.getElementById('saveSupplierBtn');
    if (saveBtn) saveBtn.textContent = 'Save Supplier';
  },

  renderSuppliers(suppliers) {
    const container = document.getElementById('suppliersTableContainer');
    if (!container) return;

    if (!Array.isArray(suppliers) || suppliers.length === 0) {
      container.innerHTML = '<div class="admin-placeholder">No suppliers found.</div>';
      return;
    }

    const rows = suppliers.map(item => `
      <tr>
        <td>${this.escapeHtml(item.name || '-')}</td>
        <td>${this.escapeHtml(item.contactPerson || '-')}</td>
        <td>${this.escapeHtml(item.phone || '-')}</td>
        <td>${this.escapeHtml(item.email || '-')}</td>
        <td>${this.escapeHtml(item.addressLine || '-')}</td>
        <td>${item.isActive ? 'Active' : 'Inactive'}</td>
        <td>
          <div class="users-actions">
            <button type="button" class="btn btn-primary btn-sm" data-action="edit-supplier" data-supplier-id="${item.id}">Edit</button>
            <button type="button" class="btn btn-danger btn-sm" data-action="delete-supplier" data-supplier-id="${item.id}">Delete</button>
          </div>
        </td>
      </tr>
    `).join('');

    container.innerHTML = `
      <div class="report-table-wrapper">
        <table class="sales-table suppliers-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Contact</th>
              <th>Phone</th>
              <th>Email</th>
              <th>Address</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  },

  editSupplier(supplierId) {
    const supplier = this.suppliersCache.find(item => Number(item.id) === Number(supplierId));
    if (!supplier) return;

    document.getElementById('supplierId').value = supplier.id;
    document.getElementById('supplierName').value = supplier.name || '';
    document.getElementById('supplierContactPerson').value = supplier.contactPerson || '';
    document.getElementById('supplierPhone').value = supplier.phone || '';
    document.getElementById('supplierEmail').value = supplier.email || '';
    document.getElementById('supplierAddressLine').value = supplier.addressLine || '';
    document.getElementById('supplierNotes').value = supplier.notes || '';
    document.getElementById('supplierIsActive').checked = supplier.isActive !== false;

    const saveBtn = document.getElementById('saveSupplierBtn');
    if (saveBtn) saveBtn.textContent = 'Update Supplier';

    this.setSuppliersStatus(`Editing supplier: ${supplier.name}`, 'loading');
    document.getElementById('supplierName')?.focus();
  },

  async deleteSupplier(supplierId) {
    const currentUser = Auth.getUser();
    const target = this.suppliersCache.find(item => Number(item.id) === Number(supplierId));
    const targetName = target?.name || `Supplier #${supplierId}`;

    const confirmed = confirm(`Delete ${targetName}? This action cannot be undone.`);
    if (!confirmed) return;

    this.setSuppliersStatus('Deleting supplier...', 'loading');
    try {
      await API.deleteSupplier(supplierId, {
        actorId: Number(currentUser?.id || 0),
        actorRole: String(currentUser?.role || '')
      });
      this.setSuppliersStatus('Supplier deleted.', 'success');
      await this.loadSuppliers();
    } catch (error) {
      this.setSuppliersStatus(`Error: ${error.message}`, 'error');
    }
  },

  async handleSupplierSave(e) {
    e.preventDefault();

    const payload = this.collectSupplierForm();
    if (!payload.name) {
      this.setSuppliersStatus('Supplier name is required.', 'error');
      document.getElementById('supplierName')?.focus();
      return;
    }

    const currentUser = Auth.getUser();
    const actor = {
      actorId: Number(currentUser?.id || 0),
      actorRole: String(currentUser?.role || '')
    };

    this.setSuppliersStatus(payload.id > 0 ? 'Updating supplier...' : 'Saving supplier...', 'loading');
    try {
      if (payload.id > 0) {
        await API.updateSupplier(payload.id, { ...actor, ...payload });
        this.setSuppliersStatus('Supplier updated.', 'success');
      } else {
        await API.addSupplier({ ...actor, ...payload });
        this.setSuppliersStatus('Supplier added.', 'success');
      }

      this.resetSupplierForm();
      await this.loadSuppliers();
    } catch (error) {
      this.setSuppliersStatus(`Error: ${error.message}`, 'error');
    }
  },

  async loadSuppliers() {
    this.setSuppliersStatus('Loading suppliers...', 'loading');
    try {
      const actor = this.getCurrentActorPayload();
      const suppliers = await API.getSuppliers(actor);
      this.suppliersCache = Array.isArray(suppliers) ? suppliers : [];
      this.renderSuppliers(this.suppliersCache);
      this.setSuppliersStatus(`Loaded ${this.suppliersCache.length} supplier(s).`, 'success');
    } catch (error) {
      this.setSuppliersStatus(`Error: ${error.message}`, 'error');
      const container = document.getElementById('suppliersTableContainer');
      if (container) {
        container.innerHTML = '<div class="admin-placeholder">Failed to load suppliers.</div>';
      }
    }
  },

  setConnectionStatus(message, type = 'loading') {
    const statusEl = document.getElementById('connectionSettingsStatus');
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = `status-message ${type}`;
  },

  setServerHealthStatus(message, type = 'loading') {
    const healthEl = document.getElementById('serverHealthStatus');
    if (!healthEl) return;
    healthEl.textContent = message;
    healthEl.className = `connection-health ${type}`;
  },

  applyConnectionSettingsToForm(settings) {
    const appPort = document.getElementById('appPort');
    const dbHost = document.getElementById('dbHost');
    const dbPort = document.getElementById('dbPort');
    const dbName = document.getElementById('dbName');
    const dbUser = document.getElementById('dbUser');
    const dbPassword = document.getElementById('dbPassword');

    if (appPort) appPort.value = settings?.app?.port ?? 3000;
    if (dbHost) dbHost.value = settings?.db?.host ?? '127.0.0.1';
    if (dbPort) dbPort.value = settings?.db?.port ?? 3306;
    if (dbName) dbName.value = settings?.db?.name ?? 'pos_system';
    if (dbUser) dbUser.value = settings?.db?.user ?? 'root';
    if (dbPassword) dbPassword.value = settings?.db?.password ?? '';
  },

  collectConnectionSettingsFromForm() {
    return {
      app: {
        port: Number(document.getElementById('appPort')?.value || 3000)
      },
      db: {
        host: document.getElementById('dbHost')?.value?.trim() || '127.0.0.1',
        port: Number(document.getElementById('dbPort')?.value || 3306),
        name: document.getElementById('dbName')?.value?.trim() || 'pos_system',
        user: document.getElementById('dbUser')?.value?.trim() || 'root',
        password: document.getElementById('dbPassword')?.value ?? ''
      }
    };
  },

  applyXamppDefaults() {
    this.applyConnectionSettingsToForm({
      app: { port: 3000 },
      db: {
        host: '127.0.0.1',
        port: 3306,
        name: 'pos_system',
        user: 'root',
        password: ''
      }
    });
    this.setConnectionStatus('XAMPP defaults applied. Click "Test Connection" then save.', 'loading');
  },

  async testDatabaseConnection() {
    this.setServerHealthStatus('Testing database connection...', 'loading');

    try {
      const payload = this.collectConnectionSettingsFromForm();
      const result = await API.testConnectionSettings(payload);
      const location = `${result.db.host}:${result.db.port}/${result.db.name}`;
      this.setServerHealthStatus(`Connection test successful: ${location}`, 'success');
      this.setConnectionStatus('Database connection test passed.', 'success');
    } catch (error) {
      this.setServerHealthStatus(`Connection test failed: ${error.message}`, 'error');
      this.setConnectionStatus(`Error: ${error.message}`, 'error');
    }
  },

  async loadConnectionSettings() {
    this.setConnectionStatus('Loading connection settings...', 'loading');
    try {
      const settings = await API.getConnectionSettings();
      this.applyConnectionSettingsToForm(settings);
      this.setConnectionStatus('Connection settings loaded.', 'success');
    } catch (error) {
      this.setConnectionStatus(`Error: ${error.message}`, 'error');
    }
  },

  async handleConnectionSettingsSave(e) {
    e.preventDefault();
    this.setConnectionStatus('Saving connection settings...', 'loading');
    try {
      const payload = this.collectConnectionSettingsFromForm();
      const result = await API.updateConnectionSettings(payload);
      this.setConnectionStatus(result.message || 'Connection settings saved.', 'success');
      this.applyConnectionSettingsToForm(result);
      if (result.restartRequired) {
        this.setServerHealthStatus('Settings saved. Restart the server to apply new connection values.', 'warning');
      }
    } catch (error) {
      this.setConnectionStatus(`Error: ${error.message}`, 'error');
    }
  },

  async checkServerStatus() {
    this.setServerHealthStatus('Checking server status...', 'loading');
    try {
      const health = await API.checkServerHealth();
      const serverState = health.server === 'online' ? 'ONLINE' : String(health.server || 'UNKNOWN').toUpperCase();
      const databaseState = health.database?.connected ? 'Connected' : 'Not Connected';
      const dbLocation = `${health.database?.host || '-'}:${health.database?.port || '-'}/${health.database?.name || '-'}`;
      this.setServerHealthStatus(
        `Server: ${serverState} | Port: ${health.app?.port || '-'} | Database: ${databaseState} (${dbLocation})`,
        health.database?.connected ? 'success' : 'error'
      );
    } catch (error) {
      this.setServerHealthStatus(`Server check failed: ${error.message}`, 'error');
    }
  },

  async restartServer() {
    const confirmed = confirm('Restart server now? Unsaved work may be interrupted.');
    if (!confirmed) return;

    this.setServerHealthStatus('Restarting server...', 'loading');
    try {
      const result = await API.restartServer();
      this.setServerHealthStatus(result.message || 'Restart command sent.', 'warning');
      this.setConnectionStatus(result.message || 'Restart command sent.', 'loading');
    } catch (error) {
      this.setServerHealthStatus(`Restart failed: ${error.message}`, 'error');
      this.setConnectionStatus(`Error: ${error.message}`, 'error');
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

  setDefaultProfitDate() {
    const profitDateInput = document.getElementById('profitDate');
    if (!profitDateInput) return;
    if (!profitDateInput.value) {
      profitDateInput.value = new Date().toISOString().slice(0, 10);
    }
  },

  setProfitStatus(message, type = 'loading') {
    const statusEl = document.getElementById('profitDashboardStatus');
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = `status-message ${type}`;
  },

  renderSimpleTable(containerId, columns, rows) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!rows || rows.length === 0) {
      container.innerHTML = '<div class="admin-placeholder">No data for selected date.</div>';
      return;
    }

    const header = columns.map(col => `<th>${col.label}</th>`).join('');
    const body = rows.map(row => {
      const tds = columns.map(col => {
        let value = row[col.key];
        if (col.type === 'money') {
          value = this.formatMoney(value);
        }
        return `<td>${value ?? '-'}</td>`;
      }).join('');
      return `<tr>${tds}</tr>`;
    }).join('');

    container.innerHTML = `
      <div class="report-table-wrapper">
        <table class="sales-table">
          <thead><tr>${header}</tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    `;
  },
  async loadExchangeSettingsPage() {
  const mount = document.getElementById('exchangeSettingsMount');
  if (!mount) return;
  try {
    const res = await fetch('/pages/exchange-settings.html', { cache: 'no-store' });
    if (!res.ok) throw new Error('Cannot load exchange settings page');
    mount.innerHTML = await res.text();
    if (window.ExchangeSettingsModule) {
      await window.ExchangeSettingsModule.init(mount);
    }
  } catch (err) {
    mount.innerHTML = `<div class="status-message error">${err.message}</div>`;
  }
},
  async loadProfitDashboard() {
    this.setProfitStatus('Loading profit dashboard...', 'loading');
    const date = document.getElementById('profitDate')?.value || new Date().toISOString().slice(0, 10);

    try {
      const data = await API.getProfitDashboard(date);

      const summaryEl = document.getElementById('profitSummaryCards');
      if (summaryEl) {
        summaryEl.innerHTML = `
          <div class="report-preview">
            <h4>Daily Summary (${data.date})</h4>
            <p>Total Sales (USD Eq.): <strong>${this.formatMoneyWithSymbol(data.summary.totalSalesUsd, '$')}</strong></p>
            <p>Total Profit (USD Eq.): <strong>${this.formatMoneyWithSymbol(data.summary.totalProfitUsd, '$')}</strong></p>
            <p>Transactions: <strong>${data.summary.transactions}</strong></p>
            <h4 style="margin-top:10px;">Monthly Summary (${data.monthSummary?.month || '-'})</h4>
            <p>Total Sales (USD Eq.): <strong>${this.formatMoneyWithSymbol(data.monthSummary?.totalSalesUsd, '$')}</strong></p>
            <p>Total Profit (USD Eq.): <strong>${this.formatMoneyWithSymbol(data.monthSummary?.totalProfitUsd, '$')}</strong></p>
            <p>Transactions: <strong>${data.monthSummary?.transactions ?? 0}</strong></p>
            <p>Last Audit Event: <strong>${data.summary.lastAuditAt || '-'}</strong></p>
          </div>
        `;
      }

      const currencySymbols = { USD: '$', ZAR: 'R', ZIG: 'ZiG ' };
      const currencyRows = (data.byCurrency || []).map(row => ({
        ...row,
        salesTotalLabel: this.formatMoneyWithSymbol(row.salesTotal, currencySymbols[row.currency] || ''),
        profitLabel: this.formatMoneyWithSymbol(row.profit, currencySymbols[row.currency] || '')
      }));

      this.renderSimpleTable('profitByCurrency', [
        { key: 'currency', label: 'Currency' },
        { key: 'salesTotalLabel', label: 'Sales Total' },
        { key: 'profitLabel', label: 'Profit' },
        { key: 'transactions', label: 'Transactions' }
      ], currencyRows);

      this.renderSimpleTable('profitByPayment', [
        { key: 'paymentMethod', label: 'Payment Method' },
        { key: 'salesTotal', label: 'Sales Total', type: 'money' },
        { key: 'profit', label: 'Profit', type: 'money' },
        { key: 'transactions', label: 'Transactions' }
      ], data.byPayment || []);

      this.renderSimpleTable('profitByCashier', [
        { key: 'cashierName', label: 'Cashier' },
        { key: 'salesTotal', label: 'Sales Total', type: 'money' },
        { key: 'profit', label: 'Profit', type: 'money' },
        { key: 'transactions', label: 'Transactions' }
      ], data.byCashier || []);

      this.setProfitStatus('Profit dashboard loaded.', 'success');
    } catch (error) {
      this.setProfitStatus(`Error: ${error.message}`, 'error');
      const summaryEl = document.getElementById('profitSummaryCards');
      if (summaryEl) {
        summaryEl.innerHTML = '<div class="admin-placeholder">Failed to load profit dashboard.</div>';
      }
    }
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

  formatMoneyWithSymbol(amount, symbol) {
    return `${symbol}${(Number(amount) || 0).toFixed(2)}`;
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
    if (type === 'ecocash-sales') return 'EcoCash Sales Report';
    if (type === 'card-sales') return 'Card Sales Report';
    if (type === 'top-ten-products') return 'Top 10 Products Report';
    if (type === 'end-of-day-profit') return 'End of Day Profit Report';
    return 'POS Report';
  },

  setStockStatus(message, type = 'loading') {
    const statusEl = document.getElementById('stockAdjustStatus');
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = `status-message ${type}`;
  },

  renderStockProductOptions(products) {
    const select = document.getElementById('stockProductId');
    if (!select) return;

    select.innerHTML = products.map(product => `
      <option value="${product.id}">${product.name} (Stock: ${Number(product.stock) || 0})</option>
    `).join('');
  },

  renderStockTable(products) {
    const container = document.getElementById('stockTableContainer');
    if (!container) return;

    if (!products || products.length === 0) {
      container.innerHTML = '<div class="admin-placeholder">No products available.</div>';
      return;
    }

    const rows = products.map(product => `
      <tr>
        <td>${product.id}</td>
        <td>${product.name}</td>
        <td>${product.category || '-'}</td>
        <td>${product.unit || 'item'}</td>
        <td>${Number(product.stock) || 0}</td>
      </tr>
    `).join('');

    container.innerHTML = `
      <div class="report-table-wrapper">
        <table class="sales-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Category</th>
              <th>Unit</th>
              <th>Stock</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  },

  async loadStockPanel() {
    this.setStockStatus('Loading stock data...', 'loading');
    try {
      const products = await API.getProducts();
      this.renderStockProductOptions(products);
      this.renderStockTable(products);
      this.setStockStatus('Stock data loaded.', 'success');
    } catch (error) {
      this.setStockStatus(`Error: ${error.message}`, 'error');
      const container = document.getElementById('stockTableContainer');
      if (container) {
        container.innerHTML = '<div class="admin-placeholder">Failed to load stock data.</div>';
      }
    }
  },

  async handleStockAdjust(e) {
    e.preventDefault();
    this.setStockStatus('Applying stock change...', 'loading');

    const productId = Number(document.getElementById('stockProductId')?.value || 0);
    const action = document.getElementById('stockAction')?.value || 'add';
    const quantity = Number(document.getElementById('stockQuantity')?.value || 0);
    const reason = document.getElementById('stockReason')?.value?.trim() || '';

    if (!productId || !quantity || quantity <= 0) {
      this.setStockStatus('Select product and enter a valid quantity.', 'error');
      return;
    }

    const delta = action === 'remove' ? -Math.abs(quantity) : Math.abs(quantity);

    try {
      await API.adjustStock({ productId, delta, reason });
      this.setStockStatus('Stock updated successfully.', 'success');
      document.getElementById('stockAdjustForm')?.reset();
      await this.loadStockPanel();
    } catch (error) {
      this.setStockStatus(`Error: ${error.message}`, 'error');
    }
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
        if (typeof val === 'number' && (key === 'totalSales' || key === 'salesTotal' || key === 'total' || key === 'amount' || key === 'profit')) {
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
        if (typeof val === 'number' && (key === 'totalSales' || key === 'salesTotal' || key === 'total' || key === 'amount' || key === 'profit')) {
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
