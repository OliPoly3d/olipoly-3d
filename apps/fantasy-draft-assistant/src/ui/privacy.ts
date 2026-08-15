export interface PrivacyLifecycleOptions {
  document: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
  window: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  activate: () => void;
}

/**
 * visibilitychange covers tab changes, screen locking, and app switching.
 * pagehide covers iOS/Safari page suspension where visibilitychange can be skipped.
 * pageshow is deliberately observed only as a no-op: returning must never reveal targets.
 */
export function bindAutomaticPrivacy(options: PrivacyLifecycleOptions) {
  const onVisibility = () => {
    if (options.document.visibilityState === 'hidden') options.activate();
  };
  const onPageHide = () => options.activate();
  const onPageShow = () => undefined;
  options.document.addEventListener('visibilitychange', onVisibility);
  options.window.addEventListener('pagehide', onPageHide);
  options.window.addEventListener('pageshow', onPageShow);
  return () => {
    options.document.removeEventListener('visibilitychange', onVisibility);
    options.window.removeEventListener('pagehide', onPageHide);
    options.window.removeEventListener('pageshow', onPageShow);
  };
}
