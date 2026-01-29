const Auth = {
  currentUser: null,

  init() {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      this.currentUser = JSON.parse(savedUser);
    }
    return this.currentUser;
  },

  setUser(user) {
    this.currentUser = user;
    localStorage.setItem('user', JSON.stringify(user));
  },

  getUser() {
    return this.currentUser;
  },

  logout() {
    this.currentUser = null;
    localStorage.removeItem('user');
  },

  isLoggedIn() {
    return this.currentUser !== null;
  },

  isAdmin() {
    return this.currentUser && this.currentUser.role === 'admin';
  }
};
