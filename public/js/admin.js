const AdminModule = {
  async init() {
    this.setupEventListeners();
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
  },

  async handleAddUser(e) {
    e.preventDefault();
    const statusEl = document.getElementById('addUserStatus');
    
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
  }
};
