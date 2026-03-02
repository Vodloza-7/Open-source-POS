const AppShell = {
  supportPhone: '+263 78 102 7540',
  companyEdition: 'Company Edition',
  sessionHeartbeatTimer: null,

  async hydrateCompanyDetails() {
    try {
      if (typeof API?.getCompanyProfile !== 'function') return;
      const user = Auth.getUser();
      if (!user?.id) return;
      const profile = await API.getCompanyProfile({
        actorId: user.id,
        actorRole: user.role
      });
      if (profile?.supportPhone) {
        this.supportPhone = profile.supportPhone;
      }
      if (profile?.edition) {
        this.companyEdition = profile.edition;
      }
    } catch (error) {
      // Keep defaults when profile endpoint is unavailable for current user.
    }
  },

  applyCommonFeatures() {
    this.removeExistingEnhancements();
    this.injectMobileActionMenu();
    this.injectSignatureFooter();
  },

  removeExistingEnhancements() {
    document.querySelectorAll('.mobile-actions-trigger-bar, .mobile-actions-overlay, .app-signature-footer').forEach(node => node.remove());
  },

  injectMobileActionMenu() {
    if (!window.matchMedia('(max-width: 768px)').matches) return;

    const header = document.querySelector('.header');
    const headerRight = document.querySelector('.header-right');
    if (!header || !headerRight) return;

    const actionSources = Array.from(headerRight.querySelectorAll('.btn')).filter(btn => {
      return btn.style.display !== 'none' && !btn.classList.contains('mobile-menu-trigger-btn');
    });

    const adminSectionSources = Array.from(document.querySelectorAll('.admin-nav-btn')).filter(btn => {
      return btn.style.display !== 'none';
    });

    if (!actionSources.length && !adminSectionSources.length) return;

    const triggerBar = document.createElement('div');
    triggerBar.className = 'mobile-actions-trigger-bar';

    const triggerButton = document.createElement('button');
    triggerButton.type = 'button';
    triggerButton.className = 'btn btn-dark full-width mobile-menu-trigger-btn';
    triggerButton.textContent = adminSectionSources.length ? 'Menu & Sections' : 'Menu';
    triggerBar.appendChild(triggerButton);

    header.insertAdjacentElement('afterend', triggerBar);

    const overlay = document.createElement('div');
    overlay.className = 'mobile-actions-overlay';
    overlay.innerHTML = `
      <div class="mobile-actions-sheet">
        <div class="mobile-actions-sheet-header">
          <h3>Quick Actions</h3>
          <button type="button" class="mobile-actions-close" aria-label="Close menu">✕</button>
        </div>
        <div class="mobile-actions-list"></div>
      </div>
    `;

    const list = overlay.querySelector('.mobile-actions-list');

    if (actionSources.length) {
      const title = document.createElement('p');
      title.className = 'mobile-actions-group-title';
      title.textContent = 'Page Actions';
      list.appendChild(title);

      actionSources.forEach(sourceButton => {
        const mobileButton = document.createElement('button');
        mobileButton.type = 'button';
        mobileButton.className = 'btn btn-secondary full-width mobile-action-item';
        mobileButton.textContent = sourceButton.textContent.trim() || 'Action';
        mobileButton.addEventListener('click', () => {
          overlay.classList.remove('show');
          sourceButton.click();
        });
        list.appendChild(mobileButton);
      });
    }

    if (adminSectionSources.length) {
      const sectionTitle = document.createElement('p');
      sectionTitle.className = 'mobile-actions-group-title';
      sectionTitle.textContent = 'Admin Sections';
      list.appendChild(sectionTitle);

      adminSectionSources.forEach(sectionButton => {
        const mobileSectionButton = document.createElement('button');
        mobileSectionButton.type = 'button';
        mobileSectionButton.className = 'btn btn-primary full-width mobile-action-item';
        mobileSectionButton.textContent = sectionButton.textContent.trim() || 'Section';
        mobileSectionButton.addEventListener('click', () => {
          overlay.classList.remove('show');
          sectionButton.click();
        });
        list.appendChild(mobileSectionButton);
      });
    }

    const closeButton = overlay.querySelector('.mobile-actions-close');
    closeButton?.addEventListener('click', () => overlay.classList.remove('show'));

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        overlay.classList.remove('show');
      }
    });

    triggerButton.addEventListener('click', () => {
      overlay.classList.add('show');
    });

    document.body.appendChild(overlay);
  },

  injectSignatureFooter() {
    const pageRoot = document.querySelector('#app > div');
    if (!pageRoot) return;

    const footer = document.createElement('footer');
    footer.className = 'app-signature-footer';
    footer.innerHTML = `
      <span>Signature: Vodloza</span>
      <span>Assistance: ${this.supportPhone}</span>
      <span>Impartial Enterprises - ${this.companyEdition}</span>
    `;

    pageRoot.appendChild(footer);
  }
};

window.AppShell = AppShell;

function startSessionHeartbeat(user) {
  if (!user?.sessionId || !user?.id || typeof API?.pingSession !== 'function') return;

  API.pingSession(user.sessionId, user.id).catch(() => {});

  if (AppShell.sessionHeartbeatTimer) {
    clearInterval(AppShell.sessionHeartbeatTimer);
  }

  AppShell.sessionHeartbeatTimer = setInterval(() => {
    API.pingSession(user.sessionId, user.id).catch(() => {});
  }, 45000);
}

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
  Router.registerPage('products', 'pages/products.html', () => ProductsModule.init(), {
    requiredPermission: 'alter_inventory'
  });
  Router.registerPage('sales', 'pages/sales.html', () => SalesModule.init(), {
    requiredPermission: 'manage_sales_orders'
  });
  Router.registerPage('admin', 'pages/admin.html', () => AdminModule.init(), {
    anyPermissions: ['manage_user_permissions', 'manage_company_settings', 'edit_receipt_format']
  });

  // Initialize auth
  const user = Auth.init();
  startSessionHeartbeat(user);
  await AppShell.hydrateCompanyDetails();

  // Route to appropriate page
  if (user) {
    Router.navigate('pos');
  } else {
    Router.navigate('login');
  }
});
