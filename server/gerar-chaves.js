import webpush from 'web-push';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';

const root = dirname(fileURLToPath(import.meta.url));
const envPath = join(root, '.env');

if (existsSync(envPath) && readFileSync(envPath, 'utf8').includes('VAPID_PRIVATE_KEY=')) {
  console.log('O arquivo server/.env já tem chaves. Nada foi alterado.');
  process.exit(0);
}

const vapid = webpush.generateVAPIDKeys();
const secret = randomBytes(24).toString('hex');

const env = `PORT=3008
VAPID_PUBLIC_KEY=${vapid.publicKey}
VAPID_PRIVATE_KEY=${vapid.privateKey}
VAPID_SUBJECT=mailto:nosso-dia@localhost
CRON_SECRET=${secret}
NOTIFY_HOUR=8
NOTIFY_MINUTE=0
TZ=America/Sao_Paulo
AI_PROVIDER=groq
AI_API_KEY=
AI_MODEL=qwen/qwen3.8-27b
`;

writeFileSync(envPath, env);
console.log('Chaves criadas em server/.env');
console.log('Horário padrão do recado: 08:00 (America/Sao_Paulo)');
