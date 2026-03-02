const Router = {
  pages: {},
  currentPage: null,
  appContainer: null,

  init(container) {
    this.appContainer = container;
    if (!this.appContainer) {
      console.error("Router Error: The app container element was not found.");
      document.body.innerHTML = '<div class="error"><h1>Fatal Error</h1><p>Application container not found. Please check your index.html file for an element with id="app".</p></div>';
    }
  },

  registerPage(name, htmlFile, initFunction, access = false) {
    const normalizedAccess = typeof access === 'object' && access !== null
      ? {
          adminOnly: Boolean(access.adminOnly),
          requiredPermission: String(access.requiredPermission || '').trim(),
          anyPermissions: Array.isArray(access.anyPermissions)
            ? access.anyPermissions.map(item => String(item || '').trim()).filter(Boolean)
            : []
        }
      : {
          adminOnly: Boolean(access),
          requiredPermission: '',
          anyPermissions: []
        };

    this.pages[name] = {
      file: htmlFile,
      init: initFunction,
      adminOnly: normalizedAccess.adminOnly,
      requiredPermission: normalizedAccess.requiredPermission,
      anyPermissions: normalizedAccess.anyPermissions
    };
  },

  async navigate(pageName) {
    if (!this.appContainer) return; // Stop if container is missing

    try {
      const page = this.pages[pageName];
      if (!page) {
        throw new Error(`Page not found: ${pageName}`);
      }

      if (pageName !== 'login' && !Auth.isLoggedIn()) {
        console.warn(`Access Denied: Not authenticated. Attempted to navigate to '${pageName}'.`);
        this.navigate('login');
        return;
      }

      if (pageName === 'login' && Auth.isLoggedIn()) {
        this.navigate('pos');
        return;
      }

      // --- Security Check ---
      if (page.adminOnly && !Auth.isAdmin()) {
        console.warn(`Access Denied: User is not an admin. Attempted to navigate to '${pageName}'.`);
        // Optionally, navigate to a 'denied' page or back to the POS
        this.navigate('pos'); 
        return;
      }

      if (page.requiredPermission && !Auth.hasPermission(page.requiredPermission)) {
        console.warn(`Access Denied: Missing permission '${page.requiredPermission}' for page '${pageName}'.`);
        this.navigate('pos');
        return;
      }

      if (Array.isArray(page.anyPermissions) && page.anyPermissions.length > 0) {
        const hasAtLeastOnePermission = page.anyPermissions.some(permission => Auth.hasPermission(permission));
        if (!hasAtLeastOnePermission) {
          console.warn(`Access Denied: Missing any required permission for page '${pageName}'.`);
          this.navigate('pos');
          return;
        }
      }

      // Corrected the fetch path to be relative to the public root
      const response = await fetch(page.file);
      if (!response.ok) {
        throw new Error(`Failed to load page content for '${pageName}' from '${page.file}'. Status: ${response.status}`);
      }

      const html = await response.text();
      this.appContainer.innerHTML = html;
      this.currentPage = pageName;

      if (page.init) {
        // Use a try-catch block for the page's init function as well
        try {
          await page.init();
        } catch (initError) {
          console.error(`Error initializing page '${pageName}':`, initError);
          this.appContainer.innerHTML += `<div class="error"><p>Error initializing page module: ${initError.message}</p></div>`;
        }
      }

      try {
        if (window.AppShell && typeof window.AppShell.applyCommonFeatures === 'function') {
          window.AppShell.applyCommonFeatures();
        }
      } catch (shellError) {
        console.error('AppShell Enhancement Error:', shellError);
      }
    } catch (error) {
      console.error('Router Navigation Error:', error);
      this.appContainer.innerHTML = `<div class="error"><h1>Error Loading Page</h1><p>${error.message}</p></div>`;
    }
  }
};
