import { chromium } from 'playwright';

const SITE = 'https://pocookievy.github.io/WalCon/';
const EXPECTED_CLIENT_ID = '885206375100-hk3emkfh3afbh7hiad3flqpg9ss0qohn.apps.googleusercontent.com';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
const errors = [];

page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
page.on('console', msg => {
  if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
});

try {
  await page.goto(`${SITE}?smoke=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(5000);

  const title = await page.title();
  if (title !== 'WalCon') throw new Error(`Unexpected title: ${title}`);

  const authVisible = await page.locator('[data-view="auth"].active').count();
  if (!authVisible) throw new Error('Authentication screen is not active');

  for (const selector of ['#authEmail','#authPassword','#loginBtn','#signupBtn']) {
    if (!(await page.locator(selector).count())) throw new Error(`Missing control: ${selector}`);
  }

  const banner = (await page.locator('#errorBanner').textContent().catch(() => ''))?.trim();
  if (banner) throw new Error(`Startup error banner: ${banner}`);

  const clientId = await page.evaluate(() => localStorage.getItem('walcon.googleDriveClientId'));
  if (clientId !== EXPECTED_CLIENT_ID) throw new Error(`Google Drive Client ID mismatch: ${clientId}`);

  const bundleResponse = await page.request.get(`${SITE}app-bundle.js?check=${Date.now()}`);
  if (!bundleResponse.ok()) throw new Error(`app-bundle.js HTTP ${bundleResponse.status()}`);
  const bundleText = await bundleResponse.text();
  if (!bundleText.includes('walcon-cdf2c')) throw new Error('Firebase project config missing from deployed bundle');

  if (errors.length) throw new Error(errors.join('\n'));

  console.log('PASS: live page loaded');
  console.log('PASS: WalCon auth UI rendered');
  console.log('PASS: no startup error banner');
  console.log('PASS: Google Drive OAuth Client ID preconfigured');
  console.log('PASS: app-bundle.js reachable and contains Firebase project config');
  console.log('LIVE_SMOKE_RESULT=PASS');
} finally {
  await browser.close();
}
