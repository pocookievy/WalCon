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

// Remove old WalCon service workers/caches once. A stale PWA cache can keep an old
// index/app pair active even after GitHub Pages has deployed newer files.
(async () => {
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(reg => reg.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.filter(key => key.startsWith('walcon-')).map(key => caches.delete(key)));
    }
  } catch (error) {
    console.warn('WalCon cache cleanup failed', error);
  }
})();

const authView = document.querySelector('[data-view="auth"]');
const loadingView = document.querySelector('[data-view="loading"]');
if (loadingView) loadingView.classList.remove('active');
if (authView) authView.classList.add('active');

const timeout = setTimeout(() => {
  if (!window.__WALCON_APP_LOADED__) {
    showBootError('WalCon application code did not finish loading. Reload once. If this message remains, the browser could not load the Firebase modules.');
  }
}, 10000);

import('./app-v6.js?v=7')
  .then(() => {
    window.__WALCON_APP_LOADED__ = true;
    clearTimeout(timeout);
  })
  .catch(error => {
    console.error('WalCon module load failed', error);
    showBootError(`WalCon module load failed: ${error?.message || error}`);
  });
