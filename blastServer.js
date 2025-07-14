const { google } = require('googleapis');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const puppeteer = require('puppeteer');

const DRIVE_FOLDER_ID = process.env.DRIVE_FOLDER_ID;
const CREDENTIALS_PATH = process.env.CREDENTIALS_PATH;

async function getDriveClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: CREDENTIALS_PATH,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  return google.drive({ version: 'v3', auth: await auth.getClient() });
}

async function findLatestFile(drive, prefix, ext) {
  const res = await drive.files.list({
    q: `'${DRIVE_FOLDER_ID}' in parents and name contains '${prefix}' and name contains '${ext}'`,
    orderBy: 'modifiedTime desc',
    pageSize: 1,
    fields: 'files(id, name)',
  });
  if (!res.data.files.length) throw new Error(`No ${prefix} file found`);
  return res.data.files[0];
}

async function downloadFileContent(drive, fileId) {
  const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });
  const chunks = [];
  await new Promise((resolve, reject) => {
    res.data
      .on('data', chunk => chunks.push(chunk))
      .on('end', resolve)
      .on('error', reject);
  });
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  const drive = await getDriveClient();
  const jsonMeta = await findLatestFile(drive, 'RecipientList_', '.json');
  const txtMeta = await findLatestFile(drive, 'Templates_', '.txt');

  console.log(`🤖 Using:\n  • ${jsonMeta.name}\n  • ${txtMeta.name}\n`);

  const contactsRaw = await downloadFileContent(drive, jsonMeta.id);
  const templateTxt = await downloadFileContent(drive, txtMeta.id);
  const contacts = JSON.parse(contactsRaw);

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

  client.on('qr', qr => {
    console.log('\n📶 Scan this QR code to activate WhatsApp session:\n');
    qrcode.generate(qr, { small: true });
  });

  client.on('ready', async () => {
    console.log('✅ WhatsApp ready. Starting blast…\n');
    await new Promise(r => setTimeout(r, 3000));

    for (let r of contacts.recipients) {
      let msg = templates[r.recipient_template];
      if (!msg) {
        console.warn(`⚠️ Missing template "${r.recipient_template}"`);
        continue;
      }

      const allFields = { ...r, ...(contacts.global || {}) };
      for (let [key, val] of Object.entries(allFields)) {
        if (typeof val === 'string') {
          msg = msg.replace(new RegExp(`<${key.toUpperCase()}>`, 'g'), val);
        }
      }

      const phone = (r.recipient_phone_no || '').replace(/\D/g, '');
      const jid = `${phone}@c.us`;

      try {
        const exists = await client.getNumberId(phone);
        if (!exists) {
          console.warn(`❌ Not a WhatsApp user: ${phone}`);
          continue;
        }
        await client.sendMessage(jid, msg);
        console.log(`✔️ Text sent to ${r.recipient_name} (${phone})`);

        for (let urlKey of ['recipient_media_file_urls', 'recipient_doc_file_urls']) {
          for (let url of r[urlKey] || []) {
            try {
              const media = await MessageMedia.fromUrl(url, { unsafeMime: true });
              await client.sendMessage(jid, media);
              console.log(`📎 ${urlKey.includes('media') ? 'Media' : 'Document'} sent to ${r.recipient_name}`);
            } catch (e) {
              console.error(`⚠️ Failed sending ${urlKey}:`, e.message);
            }
            await new Promise(r => setTimeout(r, 1000));
          }
        }

      } catch (e) {
        console.error(`❌ Error for ${r.recipient_name}:`, e.message);
      }
      await new Promise(r => setTimeout(r, 2000));
    }

    console.log('\n🎉 Blast complete. Closing session.');
    await client.destroy();
  });

  client.initialize();
}

main().catch(err => {
  console.error('❌ Error in blast:', err.message);
});
