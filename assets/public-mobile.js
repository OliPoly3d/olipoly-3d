(() => {
  const mobileQuery = window.matchMedia('(max-width: 820px)');

  function eligible(img) {
    if (!mobileQuery.matches) return false;
    if (img.closest('a, button, header, nav, footer, dialog, .poly-helper, .op-mobile-lightbox')) return false;
    if (img.matches('[data-no-expand], .brand-mark img, .logo, .icon, [class*="icon"], [class*="logo"]')) return false;
    const rect = img.getBoundingClientRect();
    return rect.width >= 150 && rect.height >= 110;
  }

  function buildLightbox() {
    let box = document.querySelector('.op-mobile-lightbox');
    if (box) return box;
    box = document.createElement('div');
    box.className = 'op-mobile-lightbox';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', 'Expanded image');
    box.innerHTML = '<button class="op-mobile-lightbox__close" type="button" aria-label="Close expanded image">×</button><img class="op-mobile-lightbox__image" alt="">';
    document.body.appendChild(box);
    const close = () => { box.classList.remove('is-open'); document.body.classList.remove('op-mobile-lightbox-open'); };
    box.addEventListener('click', e => { if (e.target === box || e.target.closest('.op-mobile-lightbox__close')) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    return box;
  }

  function enable() {
    const box = buildLightbox();
    document.querySelectorAll('main img, section img, .hero img').forEach(img => {
      if (!eligible(img) || img.dataset.opMobileExpand === 'ready') return;
      img.dataset.opMobileExpand = 'ready';
      img.classList.add('op-mobile-expandable');
      img.setAttribute('tabindex', '0');
      img.setAttribute('role', 'button');
      img.setAttribute('aria-label', `${img.alt || 'Project image'} — tap to expand`);
      const open = () => {
        const full = box.querySelector('.op-mobile-lightbox__image');
        full.src = img.currentSrc || img.src;
        full.alt = img.alt || 'Expanded project image';
        box.classList.add('is-open');
        document.body.classList.add('op-mobile-lightbox-open');
        box.querySelector('.op-mobile-lightbox__close').focus();
      };
      img.addEventListener('click', open);
      img.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enable); else enable();
  window.addEventListener('load', enable, { once: true });
})();
