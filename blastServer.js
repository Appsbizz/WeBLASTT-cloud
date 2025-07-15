const express = require('express');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const puppeteer = require('puppeteer');

// 🧩 Force Puppeteer to use Render-safe cache directory
process.env.PUPPETEER_CACHE_DIR = '/opt/render/.cache/puppeteer';

const app = express();
app.use(express.json());

app.post('/blast', handleBlast);

app.listen(process.env.PORT || 3000, () => {
  console.log('🚀 WeBLAST server running and ready to accept payloads');
});

async function handleBlast(req, res) {
  try {
    console.log("📬 Blast request received");

    const contacts = JSON.parse(req.body.recipientData);
    const templateTxt = req.body.templateText;
    console.log(`🔧 ${contacts.recipients.length} recipients loaded`);

    // Parse templates from raw text
    const templates = {};
    const regex = /=== TEMPLATE: ([^\n]+) ===\n([\s\S]*?)\n=== END TEMPLATE ===/g;
    let match;
    while ((match = regex.exec(templateTxt)) !== null) {
      templates[match[1]] = match[2].trim();
    }

    const client = new Client({
      authStrategy: new LocalAuth(),
      puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        executablePath: puppeteer.executablePath(),
      },
    });

    let report = [];

    client.on('qr', qr => {
      console.log('\n📶 Scan this QR code to activate WhatsApp session:\n');
      qrcode.generate(qr, { small: true });
    });

    client.on('ready', async () => {
      console.log('✅ WhatsApp ready. Starting WeBLAST…\n');
      await new Promise(r => setTimeout(r, 3000));

      for (let r of contacts.recipients) {
        let msg = templates[r.recipient_template];
        if (!msg) continue;

        const allFields = { ...r, ...(contacts.global || {}) };
        for (let [key, val] of Object.entries(allFields)) {
          if (typeof val === 'string') {
            msg = msg.replace(new RegExp(`<${key.toUpperCase()}>`, 'g'), val);
          }
        }

        const phone = (r.recipient_phone_no || '').replace(/\D/g, '');
        const jid = `${phone}@c.us`;
        const logEntry = { name: r.recipient_name, phone, status: 'Failed', details: '' };

        try {
          const exists = await client.getNumberId(phone);
          if (!exists) {
            logEntry.details = 'Invalid WhatsApp number';
            report.push(logEntry);
            continue;
          }

          await client.sendMessage(jid, msg);
          logEntry.status = 'Text sent';

          for (let urlKey of ['recipient_media_file_urls', 'recipient_doc_file_urls']) {
            for (let url of r[urlKey] || []) {
              try {
                const media = await MessageMedia.fromUrl(url, { unsafeMime: true });
                await client.sendMessage(jid, media);
                logEntry.status += ` + ${urlKey.includes('media') ? 'Media' : 'Doc'}`;
              } catch (e) {
                logEntry.details += ` | ${urlKey}: ${e.message}`;
              }
              await new Promise(r => setTimeout(r, 1000));
            }
          }

          report.push(logEntry);
        } catch (e) {
          logEntry.details += ` Error: ${e.message}`;
          report.push(logEntry);
        }

        await new Promise(r => setTimeout(r, 2000));
      }

      console.log('\n🎉 All messages sent. Closing session.');
      await client.destroy();
      res.status(200).json({ status: 'Blast complete', report });
    });

    client.initialize();
  } catch (e) {
    console.error('❌ Blast failed:', e.message);
    res.status(500).json({ error: e.message });
  }
}
