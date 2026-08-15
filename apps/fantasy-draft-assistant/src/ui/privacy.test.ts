import { describe, expect, it, vi } from 'vitest';
import { bindAutomaticPrivacy } from './privacy';

function lifecycle() {
  const documentListeners = new Map<string, EventListener>();
  const windowListeners = new Map<string, EventListener>();
  const document = {
    visibilityState: 'visible' as DocumentVisibilityState,
    addEventListener: (name: string, listener: EventListenerOrEventListenerObject) => documentListeners.set(name, listener as EventListener),
    removeEventListener: (name: string) => documentListeners.delete(name),
  };
  const window = {
    addEventListener: (name: string, listener: EventListenerOrEventListenerObject) => windowListeners.set(name, listener as EventListener),
    removeEventListener: (name: string) => windowListeners.delete(name),
  };
  return { document, window, documentListeners, windowListeners };
}

describe('automatic draft-room privacy', () => {
  it('activates only for a hidden document and remains active after pageshow', () => {
    const subject = lifecycle();
    const activate = vi.fn();
    bindAutomaticPrivacy({ ...subject, activate });
    subject.documentListeners.get('visibilitychange')!(new Event('visibilitychange'));
    expect(activate).not.toHaveBeenCalled();
    subject.document.visibilityState = 'hidden';
    subject.documentListeners.get('visibilitychange')!(new Event('visibilitychange'));
    expect(activate).toHaveBeenCalledOnce();
    subject.windowListeners.get('pageshow')!(new Event('pageshow'));
    expect(activate).toHaveBeenCalledOnce();
  });

  it('uses pagehide for browser suspension but not ordinary UI work', () => {
    const subject = lifecycle();
    const activate = vi.fn();
    bindAutomaticPrivacy({ ...subject, activate });
    // Opening a modal or rerendering emits no browser lifecycle event.
    expect(activate).not.toHaveBeenCalled();
    subject.windowListeners.get('pagehide')!(new Event('pagehide'));
    expect(activate).toHaveBeenCalledOnce();
  });
});
