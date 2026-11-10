import 'dotenv/config';
import express from 'express';
import cron from 'node-cron';
import webpush from 'web-push'; // CommonJS default export
import { randomBytes } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { mensagemDoDia, iaConfigurada } from './gerar-recado.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const dataDir = join(__dirname, 'data');
const subsPath = join(dataDir, 'subscriptions.json');
const vapidPath = join(dataDir, 'vapid.json');

const PORT = Number(process.env.PORT || 3008);
const HOUR = Number(process.env.NOTIFY_HOUR || 8);
const MINUTE = Number(process.env.NOTIFY_MINUTE || 0);
const TZ = process.env.TZ || 'America/Sao_Paulo';
const EXTRA_HOJE = process.env.NOTIFY_EXTRA_TODAY || '';

function lerJson(caminho, fallback) {
  try {
    return JSON.parse(readFileSync(caminho, 'utf8'));
  } catch {
    return fallback;
  }
}

if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
if (!existsSync(subsPath)) writeFileSync(subsPath, '[]');

function garantirVapid() {
  let publicKey = process.env.VAPID_PUBLIC_KEY;
  let privateKey = process.env.VAPID_PRIVATE_KEY;

  if (!publicKey || !privateKey) {
    const salvas = lerJson(vapidPath, null);
    if (salvas?.publicKey && salvas?.privateKey) {
      publicKey = salvas.publicKey;
      privateKey = salvas.privateKey;
    } else {
      const geradas = webpush.generateVAPIDKeys();
      publicKey = geradas.publicKey;
      privateKey = geradas.privateKey;
      writeFileSync(vapidPath, JSON.stringify({ publicKey, privateKey }, null, 2));
      console.log('Chaves VAPID geradas e salvas no volume de dados.');
    }
  }

  process.env.VAPID_PUBLIC_KEY = publicKey;
  process.env.VAPID_PRIVATE_KEY = privateKey;
  return { publicKey, privateKey };
}

const vapid = garantirVapid();

if (!process.env.CRON_SECRET) {
  process.env.CRON_SECRET = randomBytes(24).toString('hex');
}

const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:amor@chatia.qzz.io';
webpush.setVapidDetails(vapidSubject, vapid.publicKey, vapid.privateKey);
console.log(`VAPID subject: ${vapidSubject}`);

function salvarInscricoes(lista) {
  writeFileSync(subsPath, JSON.stringify(lista, null, 2));
}

function parseHorarios(texto) {
  return String(texto || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [h, m] = item.split(':').map((n) => Number(n));
      return { h, m };
    })
    .filter(({ h, m }) => Number.isInteger(h) && Number.isInteger(m) && h >= 0 && h <= 23 && m >= 0 && m <= 59);
}

function agoraNoFuso() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
}

async function enviarParaTodos({ forcar = false, rotulo = 'Push' } = {}) {
  const inscricoes = lerJson(subsPath, []);
  const recado = await mensagemDoDia({ forcar });
  const payload = JSON.stringify({
    title: 'Thallyson ❤️ Isla',
    body: recado.texto,
    url: '/?source=pwa'
  });

  const validas = [];
  for (const inscricao of inscricoes) {
    try {
      await webpush.sendNotification(inscricao, payload, { TTL: 60 * 60, urgency: 'high' });
      validas.push(inscricao);
    } catch (erro) {
      const codigo = erro.statusCode;
      const corpo = erro.body ? String(erro.body).slice(0, 300) : '';
      console.error('Falha ao enviar push:', codigo || erro.message, corpo);

      // 403/404/410 = inscrição inválida ou VAPID rejeitado — remove para forçar nova ativação
      if (codigo !== 403 && codigo !== 404 && codigo !== 410) {
        validas.push(inscricao);
      }
    }
  }

  salvarInscricoes(validas);
  const resultado = { enviadas: validas.length, texto: recado.texto, origem: recado.origem, rotulo };
  console.log(`${rotulo}:`, resultado);
  return resultado;
}

function agendarExtrasDeHoje(horarios) {
  const agora = agoraNoFuso();
  for (const { h, m } of horarios) {
    const alvo = new Date(agora);
    alvo.setHours(h, m, 0, 0);
    const delay = alvo.getTime() - agora.getTime();
    const label = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

    if (delay <= 0) {
      console.log(`Extra de hoje ${label} já passou — ignorado.`);
      continue;
    }

    console.log(`Extra de hoje agendado para ${label} (em ${Math.round(delay / 1000)}s)`);
    setTimeout(() => {
      enviarParaTodos({ forcar: true, rotulo: `Push extra ${label}` })
        .catch((erro) => console.error(`Erro no push extra ${label}:`, erro));
    }, delay);
  }
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '32kb' }));
app.use(express.static(root, {
  setHeaders(res, filePath) {
    if (filePath.endsWith('sw.js')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Service-Worker-Allowed', '/');
    }
    if (filePath.endsWith('manifest.json')) {
      res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

app.get('/api/vapid-public-key', (_req, res) => {
  res.json({ publicKey: vapid.publicKey });
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/subscribe', (req, res) => {
  const inscricao = req.body;
  if (!inscricao?.endpoint || !inscricao?.keys?.p256dh || !inscricao?.keys?.auth) {
    return res.status(400).json({ erro: 'Inscrição inválida.' });
  }

  const lista = lerJson(subsPath, []);
  const jaExiste = lista.some((item) => item.endpoint === inscricao.endpoint);
  if (!jaExiste) {
    lista.push(inscricao);
    salvarInscricoes(lista);
  }

  res.json({ ok: true, nova: !jaExiste });

  // Pequeno atraso ajuda no iOS logo após o subscribe
  setTimeout(() => {
    webpush.sendNotification(inscricao, JSON.stringify({
      title: 'Thallyson ❤️ Isla',
      body: 'Pronto! Os recadinhos estão ativados. Um beijo por notificação todo dia.',
      url: '/?source=pwa'
    }), { TTL: 60 * 60, urgency: 'high' }).catch((erro) => {
      const codigo = erro.statusCode;
      const corpo = erro.body ? String(erro.body).slice(0, 300) : '';
      console.error('Falha no push de boas-vindas:', codigo || erro.message, corpo);
      if (codigo === 403 || codigo === 404 || codigo === 410) {
        const limpa = lerJson(subsPath, []).filter((item) => item.endpoint !== inscricao.endpoint);
        salvarInscricoes(limpa);
      }
    });
  }, 1500);
});

app.post('/api/unsubscribe', (req, res) => {
  const endpoint = req.body?.endpoint;
  const lista = lerJson(subsPath, []).filter((item) => item.endpoint !== endpoint);
  salvarInscricoes(lista);
  res.json({ ok: true });
});

app.post('/api/enviar', async (req, res) => {
  const secret = req.headers['x-cron-secret'] || req.body?.secret;
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ erro: 'Não autorizado.' });
  }

  const resultado = await enviarParaTodos();
  res.json(resultado);
});

const cronExpr = `${MINUTE} ${HOUR} * * *`;
cron.schedule(cronExpr, () => {
  enviarParaTodos({ rotulo: 'Push diário' })
    .catch((erro) => console.error('Erro no push diário:', erro));
}, { timezone: TZ });

const extrasHoje = parseHorarios(EXTRA_HOJE);
agendarExtrasDeHoje(extrasHoje);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Nosso Dia em http://0.0.0.0:${PORT}`);
  console.log(`Recado diário às ${String(HOUR).padStart(2, '0')}:${String(MINUTE).padStart(2, '0')} (${TZ})`);
  if (extrasHoje.length) {
    console.log(`Extras de hoje: ${extrasHoje.map(({ h, m }) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`).join(', ')}`);
  }
  console.log(iaConfigurada()
    ? 'Recados: IA gera um texto novo todo dia'
    : 'Recados: lista reserva (defina AI_API_KEY no Coolify para usar IA)');
});
