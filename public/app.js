document.addEventListener('DOMContentLoaded', async () => {
  const appContainer = document.getElementById('app');

  if (!appContainer) {
    console.error("Fatal Error: Could not find the main '#app' container in index.html.");
    document.body.innerHTML = '<div class="error"><h1>Fatal Error</h1><p>Application container not found.</p></div>';
    return;
  }

  // Initialize router
  Router.init(appContainer);

  // On-screen keyboard
  const Keyboard = {
    activeInput: null,
    init() {
      if (document.getElementById('osk')) return;

      const kb = document.createElement('div');
      kb.id = 'osk';
      kb.className = 'osk';
      kb.innerHTML = `
        <div class="osk-row">
          ${'1234567890'.split('').map(k => `<button class="osk-key" data-key="${k}">${k}</button>`).join('')}
          <button class="osk-key osk-key-wide" data-key="backspace">⌫</button>
        </div>
        <div class="osk-row">
          ${'qwertyuiop'.split('').map(k => `<button class="osk-key" data-key="${k}">${k}</button>`).join('')}
        </div>
        <div class="osk-row">
          ${'asdfghjkl'.split('').map(k => `<button class="osk-key" data-key="${k}">${k}</button>`).join('')}
        </div>
        <div class="osk-row">
          ${'zxcvbnm'.split('').map(k => `<button class="osk-key" data-key="${k}">${k}</button>`).join('')}
          <button class="osk-key osk-key-wide" data-key="enter">Enter</button>
        </div>
        <div class="osk-row">
          <button class="osk-key osk-key-wide" data-key="space">Space</button>
          <button class="osk-key osk-key-wide osk-key-danger" data-key="close">Close</button>
        </div>
      `;
      document.body.appendChild(kb);

      kb.addEventListener('click', (e) => {
        const keyBtn = e.target.closest('[data-key]');
        if (!keyBtn) return;
        const key = keyBtn.getAttribute('data-key');
        this.handleKey(key);
      });

      document.addEventListener('focusin', (e) => {
        if (e.target.matches('input, textarea')) {
          this.activeInput = e.target;
          this.show();
        }
      });

      document.addEventListener('click', (e) => {
        if (!kb.contains(e.target) && !e.target.matches('input, textarea')) {
          this.hide();
        }
      });
    },
    handleKey(key) {
      if (!this.activeInput) return;

      if (key === 'close') return this.hide();
      if (key === 'backspace') return this.backspace();
      if (key === 'enter') return this.insert('\n');
      if (key === 'space') return this.insert(' ');

      this.insert(key);
    },
    insert(text) {
      const el = this.activeInput;
      const isNumber = el.type === 'number';
      if (isNumber && !/^[0-9.]$/.test(text)) return;

      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const value = el.value ?? '';
      el.value = value.slice(0, start) + text + value.slice(end);
      const nextPos = start + text.length;
      el.setSelectionRange?.(nextPos, nextPos);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    },
    backspace() {
      const el = this.activeInput;
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      if (start === 0 && end === 0) return;
      const value = el.value ?? '';
      if (start === end) {
        el.value = value.slice(0, start - 1) + value.slice(end);
        el.setSelectionRange?.(start - 1, start - 1);
      } else {
        el.value = value.slice(0, start) + value.slice(end);
        el.setSelectionRange?.(start, start);
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
    },
    show() {
      document.getElementById('osk')?.classList.add('osk-visible');
    },
    hide() {
      document.getElementById('osk')?.classList.remove('osk-visible');
    }
  };

  Keyboard.init();

  // Register pages (with adminOnly flag)
  Router.registerPage('login', 'pages/login.html', () => LoginModule.init());
  Router.registerPage('pos', 'pages/pos.html', () => POSModule.init());
  Router.registerPage('products', 'pages/products.html', () => ProductsModule.init(), false);
  Router.registerPage('sales', 'pages/sales.html', () => SalesModule.init(), true);
  Router.registerPage('admin', 'pages/admin.html', () => AdminModule.init(), true);

  // Initialize auth
  const user = Auth.init();

  // Route to appropriate page
  if (user) {
    Router.navigate('pos');
  } else {
    Router.navigate('login');
  }
});
