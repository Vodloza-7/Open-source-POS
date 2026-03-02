const Auth = {
  currentUser: null,
  roleDefaults: {
    admin: [
      'customer_transactions',
      'manage_sales_orders',
      'add_users',
      'delete_users',
      'alter_inventory',
      'manage_user_permissions',
      'manage_company_settings',
      'edit_receipt_format'
    ],
    manager: ['customer_transactions', 'manage_sales_orders', 'alter_inventory'],
    supervisor: ['customer_transactions', 'manage_sales_orders'],
    cashier: ['customer_transactions']
  },

  normalizeRole(role) {
    const value = String(role || '').trim().toLowerCase();
    return this.roleDefaults[value] ? value : 'cashier';
  },

  normalizePermissions(permissions, role) {
    const normalizedRole = this.normalizeRole(role);
    const defaults = this.roleDefaults[normalizedRole] || this.roleDefaults.cashier;
    if (!Array.isArray(permissions) || permissions.length === 0) {
      return [...defaults];
    }
    return [...new Set(permissions.map(item => String(item || '').trim()).filter(Boolean))];
  },

  normalizeUser(user) {
    if (!user || typeof user !== 'object') return null;
    const role = this.normalizeRole(user.role);
    return {
      ...user,
      role,
      permissions: this.normalizePermissions(user.permissions, role),
      sessionId: Number(user.sessionId || 0) || 0
    };
  },

  init() {
    
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      this.currentUser = this.normalizeUser(JSON.parse(savedUser));
      if (this.currentUser) {
        localStorage.setItem('user', JSON.stringify(this.currentUser));
      }
    }
    return this.currentUser;
  },

  setUser(user) {
    this.currentUser = this.normalizeUser(user);
    localStorage.setItem('user', JSON.stringify(this.currentUser));
  },

  getUser() {
    return this.currentUser;
  },

  logout() {
    const current = this.currentUser;
    if (current?.sessionId && current?.id && typeof API?.logoutSession === 'function') {
      API.logoutSession(current.sessionId, current.id).catch(() => {});
    }
    this.currentUser = null;
    localStorage.removeItem('user');
  },

  isLoggedIn() {
    return this.currentUser !== null;
  },

  isAdmin() {
    return this.currentUser && this.currentUser.role === 'admin';
  },

  hasPermission(permissionKey) {
    if (!this.currentUser) return false;
    if (this.isAdmin()) return true;

    const normalizedPermission = String(permissionKey || '').trim();
    if (!normalizedPermission) return false;

    const userPermissions = this.normalizePermissions(this.currentUser.permissions, this.currentUser.role);
    return userPermissions.includes(normalizedPermission);
  }
};
