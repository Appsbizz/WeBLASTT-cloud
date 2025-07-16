// ─── Chrome Bootstrap & Path Discovery ───────────────────────────────────────
const { install, executablePath } = require('@puppeteer/browsers');

const cacheDir = process.env.PUPPETEER_CACHE_DIR || '/opt/render/.cache/puppeteer';
const buildId  = '127.0.6533.88';

;(async () => {
  console.log(`🔄 Installing Chrome build ${buildId}…`);
  try {
    // Download the exact Chrome you need
    await install({ browser: 'chrome', buildId, cacheDir });
    console.log('✅ Chrome installed');

    // Grab the executable path straight from @puppeteer/browsers
    const chromePath = process.env.PUPPETEER_EXECUTABLE_PATH
      || executablePath({ browser: 'chrome', buildId, cacheDir });
    console.log('🔍 Using Chrome at', chromePath);

    // Now start your server with that path
    startServer(chromePath);
  } catch (err) {
    console.error('❌ Chrome installation failed:', err.message);
    process.exit(1);
  }
})();
// ────────────────────────────────────────────────────────────────────────────────

function startServer(chromePath) {
  const express = require('express');
  const qrcode  = require('qrcode-terminal');
  const { Client, LocalAuth } = require('whatsapp-web.js');

  const app = express();
  app.use(express.json());

  // Health check
  app.get('/healthz', (req, res) => res.status(200).send('OK'));

  // Blast endpoint
  app.post('/blast', (req, res) => {
    console.log('📬 Blast request received');

    let recipients;
    try {
      const payload = typeof req.body.recipientData === 'string'
        ? JSON.parse(req.body.recipientData)
        : req.body.recipientData;
      recipients = payload.recipients || [];
      console.log(`🔧 ${recipients.length} recipients loaded`);
    } catch (e) {
      console.error('❌ Invalid recipientData JSON:', e.message);
      return res.status(400).json({ error: 'Invalid recipientData' });
    }

    if (recipients.length === 0) {
      console.log('⚠️ No recipients – skipping WhatsApp flow');
      return res.json({ status: 'Blast complete (no recipients)', report: [] });
    }

    const client = new Client({
      authStrategy: new LocalAuth({ clientId: 'weblast' }),
      puppeteer: { executablePath: chromePath },
    });

    client.on('qr', qr => {
      console.log('📶 Scan this QR code to activate WhatsApp session:');
      qrcode.generate(qr, { small: true });
    });

    client.on('ready', async () => {
      console.log('✅ WhatsApp ready. Starting WeBLAST…');
      const report = [];

      for (const { number, fields } of recipients) {
        let msg = req.body.templateText;
        for (const k in fields) {
          msg = msg.replace(new RegExp(`{{${k}}}`, 'g'), fields[k]);
        }
        try {
          await client.sendMessage(number, msg);
          console.log(`✉️ Sent to ${number}`);
          report.push({ number, status: 'sent' });
        } catch (err) {
          console.error(`❌ Failed to ${number}:`, err.message);
          report.push({ number, status: 'failed', error: err.message });
        }
      }

      console.log('🎉 All messages sent. Closing session.');
      await client.destroy();
      res.json({ status: 'Blast complete', report });
    });

    client.initialize();
  });

  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`🚀 WeBLAST server running on port ${port}`));
}
