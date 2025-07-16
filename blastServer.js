// ─── Bootstrap Chrome Installer ───────────────────────────────────────────────
const { install } = require('@puppeteer/browsers');

;(async () => {
  console.log('🔄 Installing Chrome build 127.0.6533.88…');
  try {
    await install({
      browser: 'chrome',
      buildId: '127.0.6533.88',
      cacheDir: process.env.PUPPETEER_CACHE_DIR || '/opt/render/.cache/puppeteer',
    });
    console.log('✅ Chrome installed');
  } catch (e) {
    console.error('❌ Chrome install failed:', e.message);
    process.exit(1);
  }
})();
// ────────────────────────────────────────────────────────────────────────────────

const express = require('express');
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');

const app = express();
app.use(express.json());

// Health-check endpoint
app.get('/healthz', (req, res) => res.status(200).send('OK'));

// Main blast endpoint
app.post('/blast', (req, res) => {
  console.log('📬 Blast request received');
  let recipients = [];
  try {
    const data = typeof req.body.recipientData === 'string'
      ? JSON.parse(req.body.recipientData)
      : req.body.recipientData;
    recipients = data.recipients || [];
    console.log(`🔧 ${recipients.length} recipients loaded`);
  } catch (err) {
    console.error('❌ Invalid recipientData JSON:', err.message);
    return res.status(400).json({ error: 'Invalid recipientData' });
  }

  const client = new Client({
    authStrategy: new LocalAuth({ clientId: 'weblast' }),
    puppeteer: { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH },
  });

  client.on('qr', qr => {
    console.log('📶 Scan this QR code to activate WhatsApp session:');
    qrcode.generate(qr, { small: true });
  });

  client.on('ready', async () => {
    console.log('✅ WhatsApp ready. Starting WeBLAST…');
    for (const { number, fields } of recipients) {
      let msg = req.body.templateText;
      for (const key in fields) {
        msg = msg.replace(new RegExp(`{{${key}}}`, 'g'), fields[key]);
      }
      try {
        await client.sendMessage(number, msg);
        console.log(`✉️ Sent to ${number}`);
      } catch (e) {
        console.error(`❌ Failed to ${number}:`, e.message);
      }
    }
    console.log('🎉 All messages sent. Closing session.');
    await client.destroy();
    res.json({ status: 'Blast complete' });
    process.exit(0);
  });

  client.initialize();
});

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`🚀 WeBLAST server running on port ${port}`));
