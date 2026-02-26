document.addEventListener('DOMContentLoaded', async () => {
  const appContainer = document.getElementById('app');

  if (!appContainer) {
    console.error("Fatal Error: Could not find the main '#app' container in index.html.");
    document.body.innerHTML = '<div class="error"><h1>Fatal Error</h1><p>Application container not found.</p></div>';
    return;
  }
  
  // Initialize router
  Router.init(appContainer);

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
