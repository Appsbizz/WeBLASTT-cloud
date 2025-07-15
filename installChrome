// scripts/installChrome.js
const { install } = require('@puppeteer/browsers');

install({
  browser: 'chrome',
  buildId: '127.0.6533.88',
  cacheDir: '/opt/render/.cache/puppeteer',
})
  .then(() => console.log("✅ Chrome installed"))
  .catch(err => {
    console.error("❌ Chrome install failed:", err.message);
    process.exit(1);
  });
