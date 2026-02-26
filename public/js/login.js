const LoginModule = {
  async init() {
    const loginForm = document.getElementById('loginForm');
    const loginError = document.getElementById('loginError');
    const loginStatus = document.getElementById('loginStatus');

    if (!loginForm) return;

    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const username = document.getElementById('username').value;
      const password = document.getElementById('password').value;

      loginStatus.textContent = 'Logging in...';
      loginStatus.className = 'login-status loading';

      try {
        const user = await API.login(username, password);
        Auth.setUser(user);
        loginError.textContent = 'Are you sure that youre authorized to login  or youre a thief';
        loginStatus.textContent = 'Login successful!  Welcome to our POS system.';
        loginStatus.className = 'login-status success';

        setTimeout(() => {
          Router.navigate('pos');
        }, 500);
      } catch (error) {
        console.error('Login error:', error);
        loginError.textContent = error.message || 'Login failed. Check your credentials.';
        loginStatus.textContent = '';
        loginStatus.className = '';
      }
    });
  }
};
