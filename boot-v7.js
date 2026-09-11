const banner = document.getElementById('errorBanner');
const showBootError = (message) => {
  if (!banner) return;
  banner.textContent = message;
  banner.classList.remove('hidden');
};

window.addEventListener('error', event => {
  if (event?.message) showBootError(`WalCon startup error: ${event.message}`);
});

window.addEventListener('unhandledrejection', event => {
  const reason = event?.reason?.message || String(event?.reason || 'Unknown startup error');
  showBootError(`WalCon startup error: ${reason}`);
});

try {
  if (!localStorage.getItem('walcon.googleDriveClientId')) {
    localStorage.setItem(
      'walcon.googleDriveClientId',
      '885206375100-hk3emkfh3afbh7hiad3flqpg9ss0qohn.apps.googleusercontent.com'
    );
  }
} catch (error) {
  console.warn('Could not persist Google Drive Client ID', error);
}

const authView = document.querySelector('[data-view="auth"]');
const loadingView = document.querySelector('[data-view="loading"]');
if (loadingView) loadingView.classList.remove('active');
if (authView) authView.classList.add('active');

async function bootWalCon() {
  try {
    const hadController = Boolean(navigator.serviceWorker?.controller);

    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(reg => reg.unregister()));
    }

    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter(key => key.startsWith('walcon-')).map(key => caches.delete(key))
      );
    }

    // Unregistering a service worker does not release the current page immediately.
    // If this page was controlled by an older WalCon worker, reload once so the next
    // request for app-v6.js goes directly to GitHub Pages instead of an old cache.
    if (hadController && sessionStorage.getItem('walcon-sw-reload-v8') !== 'done') {
      sessionStorage.setItem('walcon-sw-reload-v8', 'done');
      location.reload();
      return;
    }

    const timeout = setTimeout(() => {
      if (!window.__WALCON_APP_LOADED__) {
        showBootError('WalCon application code did not finish loading. Reload once. If this message remains, check the error shown here.');
      }
    }, 10000);

    await import(`./app-v6.js?v=8&t=${Date.now()}`);
    window.__WALCON_APP_LOADED__ = true;
    clearTimeout(timeout);
  } catch (error) {
    console.error('WalCon module load failed', error);
    showBootError(`WalCon module load failed: ${error?.message || error}`);
  }
}

bootWalCon();
