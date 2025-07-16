// ─── Bootstrap & Discover Chrome ───────────────────────────────────────────
const { install, executablePath } = require('@puppeteer/browsers');

const cacheDir = process.env.PUPPETEER_CACHE_DIR || '/opt/render/.cache/puppeteer';
const buildId = '127.0.6533.88';

;(async () => {
  console.log(`🔄 Installing Chrome build ${buildId}…`);
  try {
    await install({ browser: 'chrome', buildId, cacheDir });
    const chromeExe = executablePath({ browser: 'chrome', buildId, cacheDir });
    console.log('✅ Chrome installed at', chromeExe);

    // ─── Now that Chrome is ready, start your server ────────────────────────
    startServer(chromeExe);
  } catch (err) {
    console.error('❌ Chrome installation failed:', err.message);
    process.exit(1);
  }
})();

function startServer(chromePath) {
  const express = require('express');
  const qrcode = require('qrcode-terminal');
  const { Client, LocalAuth } = require('whatsapp-web.js');

  const app = express();
  app.use(express.json());

  // Health-check for uptime monitoring
  app.get('/healthz', (req, res) => res.status(200).send('OK'));

  // Main blast endpoint
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
      for (const { number, fields } of recipients) {
        let message = req.body.templateText;
        for (const k in fields) {
          message = message.replace(new RegExp(`{{${k}}}`, 'g'), fields[k]);
        }
        try {
          await client.sendMessage(number, message);
          console.log(`✉️ Sent to ${number}`);
        } catch (err) {
          console.error(`❌ Failed to ${number}:`, err.message);
        }
      }
      console.log('🎉 All messages sent. Closing session.');
      await client.destroy();
      res.json({ status: 'Blast complete', report: recipients.map(r => r.number) });
    });

    client.initialize();
  });

  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`🚀 WeBLAST server running on port ${port}`));
}
