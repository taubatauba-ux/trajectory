// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkForAppUpdate } from './pwaUpdate';

const originalServiceWorker = (navigator as { serviceWorker?: unknown }).serviceWorker;

afterEach(() => {
  Object.defineProperty(navigator, 'serviceWorker', {
    value: originalServiceWorker,
    configurable: true,
  });
});

describe('checkForAppUpdate', () => {
  it('reports unsupported when the browser has no serviceWorker API at all', async () => {
    Object.defineProperty(navigator, 'serviceWorker', { value: undefined, configurable: true });
    expect(await checkForAppUpdate()).toEqual({ supported: false });
  });

  it('reports unsupported when there is no active registration (e.g. dev without devOptions)', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { getRegistration: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
    expect(await checkForAppUpdate()).toEqual({ supported: false });
  });

  it('calls registration.update() and reports checked when a registration exists', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { getRegistration: vi.fn().mockResolvedValue({ update }) },
      configurable: true,
    });
    expect(await checkForAppUpdate()).toEqual({ supported: true, checked: true });
    expect(update).toHaveBeenCalledOnce();
  });

  it('degrades gracefully rather than throwing when registration.update() rejects (offline)', async () => {
    const update = vi.fn().mockRejectedValue(new Error('network error'));
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { getRegistration: vi.fn().mockResolvedValue({ update }) },
      configurable: true,
    });
    expect(await checkForAppUpdate()).toEqual({ supported: true, checked: false });
  });
});
