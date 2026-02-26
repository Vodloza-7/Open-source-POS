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

  registerPage(name, htmlFile, initFunction, adminOnly = false) {
    this.pages[name] = {
      file: htmlFile,
      init: initFunction,
      adminOnly: adminOnly
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
    } catch (error) {
      console.error('Router Navigation Error:', error);
      this.appContainer.innerHTML = `<div class="error"><h1>Error Loading Page</h1><p>${error.message}</p></div>`;
    }
  }
};
