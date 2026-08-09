import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const logs = [];
page.on('console', (msg) => { if (msg.type() === 'error' || msg.type() === 'warning') logs.push(`[${msg.type()}] ${msg.text()}`); });
page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`));
page.on('requestfailed', (req) => logs.push(`[requestfailed] ${req.url()} ${req.failure()?.errorText}`));

await page.goto('http://localhost:8080/auth', { waitUntil: 'networkidle' });
await page.getByPlaceholder('name@example.com').fill('testauthor_1786184874678@example.com');
await page.getByPlaceholder('Enter your password').fill('Test1234!');
await page.locator('form').getByRole('button', { name: /Log In/ }).click();
await page.waitForTimeout(2500);

await page.goto('http://localhost:8080/', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

const wall = page.locator('text=Confession wall');
console.log('Confession wall heading visible:', await wall.isVisible());

const revealed = page.locator('text=It was @confessfriend_1786184_431e529d');
console.log('Revealed confession shows author:', await revealed.isVisible());

const guessBtn = page.locator('button:has-text("Guess (1 left)")');
console.log('Guess button (1 left) visible:', await guessBtn.isVisible());

await page.screenshot({ path: '/tmp/opencode/confession-v2-wall.png' });

await guessBtn.click();
await page.waitForTimeout(800);
console.log('Modal "Who wrote it?" visible:', await page.locator('text=Who wrote it?').isVisible());
console.log('Friend listed in modal:', await page.getByRole('button', { name: /confessfriend_1786184_431e529d/ }).first().isVisible());

await page.screenshot({ path: '/tmp/opencode/confession-v2-modal.png' });

const friendEntry = page.getByRole('button', { name: /confessfriend_1786184_431e529d/ }).first();
await friendEntry.click();
await page.waitForTimeout(1200);

console.log('After wrong-guess toast on "i am rich":');
const guessCountText = await page.locator('text=/Guess\\(0 left\\)|Out of chances/').isVisible();
console.log('No chances / out of chances visible:', guessCountText);

await page.screenshot({ path: '/tmp/opencode/confession-v2-after-guess.png' });

console.log('--- ERRORS ---');
console.log(logs.join('\n') || '(no console errors)');

await browser.close();
