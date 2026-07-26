document.documentElement.classList.add('js');

(() => {
  const toggle = document.querySelector('[data-menu-toggle]');
  const menu = document.querySelector('[data-menu]');
  const closeButton = document.querySelector('[data-menu-close]');
  const dismiss = document.querySelector('[data-menu-dismiss]');
  const menuLabel = document.querySelector('[data-menu-label]');
  const header = document.querySelector('[data-header]');
  let previousFocus = null;

  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  menu?.querySelectorAll('.menu-layer__nav a').forEach(link => {
    const linkPage = new URL(link.href, window.location.href).pathname.split('/').pop();
    if (linkPage === currentPage) {
      link.setAttribute('aria-current', 'page');
    } else {
      link.removeAttribute('aria-current');
    }
  });

  const focusableSelector =
    'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

  const openMenu = () => {
    if (!toggle || !menu) return;

    previousFocus = document.activeElement;
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Close navigation');
    menu.setAttribute('aria-hidden', 'false');
    menu.classList.add('is-open');
    header?.classList.add('menu-active');
    if (menuLabel) menuLabel.textContent = 'Close';

    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';

    window.requestAnimationFrame(() => closeButton?.focus());
  };

  const closeMenu = ({ restoreFocus = true } = {}) => {
    if (!toggle || !menu) return;

    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open navigation');
    menu.setAttribute('aria-hidden', 'true');
    menu.classList.remove('is-open');
    header?.classList.remove('menu-active');
    if (menuLabel) menuLabel.textContent = 'Menu';

    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';

    if (restoreFocus && previousFocus instanceof HTMLElement) {
      previousFocus.focus();
    }
  };

  toggle?.addEventListener('click', () => {
    const isOpen = toggle.getAttribute('aria-expanded') === 'true';
    isOpen ? closeMenu() : openMenu();
  });

  closeButton?.addEventListener('click', () => closeMenu());
  dismiss?.addEventListener('click', () => closeMenu());

  menu?.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => closeMenu({ restoreFocus: false }));
  });

  document.addEventListener('keydown', event => {
    if (!menu?.classList.contains('is-open')) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
      return;
    }

    if (event.key === 'Tab') {
      const focusable = [...menu.querySelectorAll(focusableSelector)]
        .filter(el => !el.hasAttribute('hidden'));
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  const paintHeader = () => {
    header?.classList.toggle('is-scrolled', window.scrollY > 28);
  };
  paintHeader();
  window.addEventListener('scroll', paintHeader, { passive: true });

  document.querySelectorAll('[data-year]').forEach(el => {
    el.textContent = new Date().getFullYear();
  });

  const items = document.querySelectorAll('.reveal');
  if (!items.length ||
      !('IntersectionObserver' in window) ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    items.forEach(item => item.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, {
    threshold: 0.12,
    rootMargin: '0px 0px -7% 0px'
  });

  items.forEach(item => observer.observe(item));
})();
