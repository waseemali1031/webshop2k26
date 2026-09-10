/* ===================================
   WEBSITE HEADER
   Vanilla JS - toggles the mobile collapsible panel. Desktop layout
   (min-width: 1024px) is handled entirely by CSS and ignores this
   open/closed state, so this script only needs to manage the mobile
   experience and keep focus/ARIA in sync.
   =================================== */

class WebsiteHeader {
  constructor(element) {
    this.element = element;
    this.toggle = element.querySelector('[data-action="toggle"]');
    this.content = element.querySelector('[data-content]');
    this.desktopQuery = window.matchMedia('(min-width: 1024px)');

    if (!this.toggle || !this.content) return;

    this.focusableInContent = this.content.querySelectorAll('a[href], button:not([disabled])');

    this.handleToggleClick = this.handleToggleClick.bind(this);
    this.handleKeydown = this.handleKeydown.bind(this);
    this.handleOutsideClick = this.handleOutsideClick.bind(this);
    this.handleBreakpointChange = this.handleBreakpointChange.bind(this);

    this.bindEvents();
    this.syncFocusability();
  }

  bindEvents() {
    this.toggle.addEventListener('click', this.handleToggleClick);
    this.element.addEventListener('keydown', this.handleKeydown);
    document.addEventListener('click', this.handleOutsideClick);

    if (this.desktopQuery.addEventListener) {
      this.desktopQuery.addEventListener('change', this.handleBreakpointChange);
    }
  }

  isOpen() {
    return this.element.getAttribute('data-state') === 'open';
  }

  isDesktop() {
    return this.desktopQuery.matches;
  }

  open() {
    this.element.setAttribute('data-state', 'open');
    this.toggle.setAttribute('aria-expanded', 'true');
    this.syncFocusability();
  }

  close({ returnFocus = false } = {}) {
    this.element.setAttribute('data-state', 'closed');
    this.toggle.setAttribute('aria-expanded', 'false');
    this.syncFocusability();

    if (returnFocus) {
      this.toggle.focus();
    }
  }

  // Prevent tabbing into the collapsed panel on mobile; the desktop
  // layout always shows the content, so it must stay focusable there.
  syncFocusability() {
    const shouldBeFocusable = this.isDesktop() || this.isOpen();

    this.focusableInContent.forEach((el) => {
      if (shouldBeFocusable) {
        el.removeAttribute('tabindex');
      } else {
        el.setAttribute('tabindex', '-1');
      }
    });
  }

  handleToggleClick() {
    if (this.isOpen()) {
      this.close();
    } else {
      this.open();
    }
  }

  handleKeydown(event) {
    if (event.key === 'Escape' && this.isOpen()) {
      this.close({ returnFocus: true });
    }
  }

  handleOutsideClick(event) {
    if (this.isOpen() && !this.element.contains(event.target)) {
      this.close();
    }
  }

  handleBreakpointChange() {
    if (this.isDesktop()) {
      this.close();
    }
    this.syncFocusability();
  }

  destroy() {
    this.toggle.removeEventListener('click', this.handleToggleClick);
    this.element.removeEventListener('keydown', this.handleKeydown);
    document.removeEventListener('click', this.handleOutsideClick);

    if (this.desktopQuery.removeEventListener) {
      this.desktopQuery.removeEventListener('change', this.handleBreakpointChange);
    }
  }
}

function initWebsiteHeader(root) {
  const scope = root || document;
  scope.querySelectorAll('[data-component="website-header"]').forEach((element) => {
    if (element.websiteHeaderInstance) return;
    element.websiteHeaderInstance = new WebsiteHeader(element);
  });
}

function destroyWebsiteHeader(root) {
  const scope = root || document;
  scope.querySelectorAll('[data-component="website-header"]').forEach((element) => {
    if (element.websiteHeaderInstance) {
      element.websiteHeaderInstance.destroy();
      delete element.websiteHeaderInstance;
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initWebsiteHeader());
} else {
  initWebsiteHeader();
}

// Shopify theme editor support: re-init when this section is added/
// re-rendered, and clean up listeners when it's removed.
document.addEventListener('shopify:section:load', (event) => initWebsiteHeader(event.target));
document.addEventListener('shopify:section:unload', (event) => destroyWebsiteHeader(event.target));

