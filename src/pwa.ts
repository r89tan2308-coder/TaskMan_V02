import { registerSW } from 'virtual:pwa-register';

let updateSW: ReturnType<typeof registerSW> | null = null;

export type PwaUpdateResult = 'updated' | 'no-update';

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });

const waitForControllerChange = (timeoutMs = 8000) => {
  if (!('serviceWorker' in navigator)) return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    let resolved = false;
    let timeoutId = 0;
    const onChange = () => {
      if (resolved) return;
      resolved = true;
      navigator.serviceWorker.removeEventListener('controllerchange', onChange);
      window.clearTimeout(timeoutId);
      resolve(true);
    };
    timeoutId = window.setTimeout(() => {
      if (resolved) return;
      resolved = true;
      navigator.serviceWorker.removeEventListener('controllerchange', onChange);
      resolve(false);
    }, timeoutMs);
    navigator.serviceWorker.addEventListener('controllerchange', onChange);
  });
};

const hasPendingUpdate = async (registration: ServiceWorkerRegistration) => {
  if (registration.waiting || registration.installing) return true;
  await sleep(1500);
  return Boolean(registration.waiting || registration.installing);
};

export const initPwa = () => {
  if (!updateSW) {
    updateSW = registerSW({ immediate: true });
  }
};

export const requestPwaUpdate = async (): Promise<PwaUpdateResult> => {
  if (!('serviceWorker' in navigator)) return 'no-update';

  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return 'no-update';

  if (updateSW) {
    try {
      await updateSW();
    } catch {
      // Ignore and fall through to manual checks.
    }
  }

  await registration.update();

  const pendingUpdate = await hasPendingUpdate(registration);
  if (!pendingUpdate) return 'no-update';

  const controllerChange = waitForControllerChange();

  if (registration.waiting) {
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  } else if (registration.installing) {
    const installing = registration.installing;
    const onStateChange = () => {
      if (registration.waiting) {
        installing.removeEventListener('statechange', onStateChange);
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        return;
      }
      if (installing.state === 'activated' || installing.state === 'redundant') {
        installing.removeEventListener('statechange', onStateChange);
      }
    };
    installing.addEventListener('statechange', onStateChange);
  }

  const didChange = await controllerChange;
  return didChange ? 'updated' : 'no-update';
};
