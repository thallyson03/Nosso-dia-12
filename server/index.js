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
const TZ = process.env.TZ || 'America/Sao_Paulo';
const EXTRA_HOJE = process.env.NOTIFY_EXTRA_TODAY || '';
const PUBLIC_URL = (process.env.PUBLIC_URL || 'https://amor.chatia.qzz.io').replace(/\/$/, '');
const HORARIOS_PADRAO = '08:00,12:00,17:00,21:00';

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
const configPath = join(dataDir, 'push-config.json');

if (!process.env.CRON_SECRET) {
  process.env.CRON_SECRET = randomBytes(24).toString('hex');
}

const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:amor@chatia.qzz.io';
if (/localhost|example\.com/i.test(vapidSubject)) {
  console.error(`VAPID_SUBJECT inválido para iPhone: ${vapidSubject}`);
  console.error('Use algo como mailto:amor@chatia.qzz.io');
}

webpush.setVapidDetails(vapidSubject, vapid.publicKey, vapid.privateKey);
console.log(`VAPID subject: ${vapidSubject}`);

function salvarInscricoes(lista) {
  writeFileSync(subsPath, JSON.stringify(lista, null, 2));
}

// Se a chave/subject mudou, as inscrições antigas geram 403 e nunca chegam no iPhone
const pushConfig = { subject: vapidSubject, publicKey: vapid.publicKey };
const pushConfigAnterior = lerJson(configPath, null);
if (
  pushConfigAnterior &&
  (pushConfigAnterior.publicKey !== pushConfig.publicKey || pushConfigAnterior.subject !== pushConfig.subject)
) {
  console.log('Config VAPID mudou — limpando inscrições antigas. Abra o app e toque em Ativar recadinhos de novo.');
  salvarInscricoes([]);
}
writeFileSync(configPath, JSON.stringify(pushConfig, null, 2));

function parseHorarios(texto) {
  return String(texto || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [h, m = 0] = item.split(':').map((n) => Number(n));
      return { h, m: Number.isInteger(m) ? m : 0 };
    })
    .filter(({ h, m }) => Number.isInteger(h) && Number.isInteger(m) && h >= 0 && h <= 23 && m >= 0 && m <= 59);
}

function horariosDiarios() {
  if (process.env.NOTIFY_TIMES) return parseHorarios(process.env.NOTIFY_TIMES);
  if (process.env.NOTIFY_HOUR != null || process.env.NOTIFY_MINUTE != null) {
    return parseHorarios(
      `${process.env.NOTIFY_HOUR || 8}:${process.env.NOTIFY_MINUTE || 0}`
    );
  }
  return parseHorarios(HORARIOS_PADRAO);
}

function formatarHorario({ h, m }) {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function agendarHorariosDiarios(horarios) {
  for (const horario of horarios) {
    const label = formatarHorario(horario);
    const expr = `${horario.m} ${horario.h} * * *`;
    cron.schedule(expr, () => {
      enviarParaTodos({ forcar: true, rotulo: `Push ${label}` })
        .catch((erro) => console.error(`Erro no push ${label}:`, erro));
    }, { timezone: TZ });
    console.log(`Recado diário agendado: ${label} (${TZ})`);
  }
}

function agoraNoFuso() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
}

function montarPayload(texto) {
  // Inclui campos do Declarative Web Push (Safari 18.4+) e o JSON clássico do nosso SW
  return JSON.stringify({
    web_push: 8030,
    title: 'Thallyson ❤️ Isla',
    body: texto,
    navigate: `${PUBLIC_URL}/?source=pwa`,
    url: `${PUBLIC_URL}/?source=pwa`,
    tag: 'nosso-dia-recado',
    icon: `${PUBLIC_URL}/icons/icon-192.png`
  });
}

function hostDoEndpoint(endpoint) {
  try {
    return new URL(endpoint).host;
  } catch {
    return 'desconhecido';
  }
}

async function enviarParaTodos({ forcar = false, rotulo = 'Push' } = {}) {
  const inscricoes = lerJson(subsPath, []);
  const recado = await mensagemDoDia({ forcar });
  const payload = montarPayload(recado.texto);

  let ok = 0;
  let falhas = 0;
  const validas = [];

  console.log(`${rotulo}: inscritos=${inscricoes.length}`);

  for (const inscricao of inscricoes) {
    const host = hostDoEndpoint(inscricao.endpoint);
    try {
      const resposta = await webpush.sendNotification(inscricao, payload, {
        TTL: 60 * 60,
        urgency: 'high',
        contentEncoding: 'aes128gcm'
      });
      ok += 1;
      validas.push(inscricao);
      console.log(`${rotulo}: OK -> ${host} status=${resposta?.statusCode || 201}`);
    } catch (erro) {
      falhas += 1;
      const codigo = erro.statusCode;
      const corpo = erro.body ? String(erro.body).slice(0, 400) : '';
      console.error(`${rotulo}: FALHA -> ${host}`, codigo || erro.message, corpo);

      // 403/404/410 = inscrição inválida ou VAPID rejeitado
      if (codigo !== 403 && codigo !== 404 && codigo !== 410) {
        validas.push(inscricao);
      }
    }
  }

  salvarInscricoes(validas);
  const resultado = {
    rotulo,
    inscritos: inscricoes.length,
    enviadas: ok,
    falhas,
    restantes: validas.length,
    texto: recado.texto,
    origem: recado.origem
  };
  console.log(`${rotulo}: resumo`, resultado);
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
  const inscricoes = lerJson(subsPath, []);
  res.json({
    ok: true,
    inscritos: inscricoes.length,
    hosts: inscricoes.map((item) => hostDoEndpoint(item.endpoint)),
    vapidSubject
  });
});

app.post('/api/subscribe', (req, res) => {
  const inscricao = req.body;
  if (!inscricao?.endpoint || !inscricao?.keys?.p256dh || !inscricao?.keys?.auth) {
    return res.status(400).json({ erro: 'Inscrição inválida.' });
  }

  const lista = lerJson(subsPath, []).filter((item) => item.endpoint !== inscricao.endpoint);
  lista.push(inscricao);
  salvarInscricoes(lista);

  console.log(`Nova inscrição salva: ${hostDoEndpoint(inscricao.endpoint)} (total=${lista.length})`);
  res.json({ ok: true, inscritos: lista.length, host: hostDoEndpoint(inscricao.endpoint) });

  // Pequeno atraso ajuda no iOS logo após o subscribe
  setTimeout(() => {
    webpush.sendNotification(
      inscricao,
      montarPayload('Pronto! Os recadinhos estão ativados. Vou te mandar um carinho às 8h, 12h, 17h e 21h.'),
      { TTL: 60 * 60, urgency: 'high', contentEncoding: 'aes128gcm' }
    ).then((resposta) => {
      console.log(`Boas-vindas OK -> ${hostDoEndpoint(inscricao.endpoint)} status=${resposta?.statusCode || 201}`);
    }).catch((erro) => {
      const codigo = erro.statusCode;
      const corpo = erro.body ? String(erro.body).slice(0, 400) : '';
      console.error('Falha no push de boas-vindas:', codigo || erro.message, corpo);
      if (codigo === 403 || codigo === 404 || codigo === 410) {
        const limpa = lerJson(subsPath, []).filter((item) => item.endpoint !== inscricao.endpoint);
        salvarInscricoes(limpa);
      }
    });
  }, 1200);
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

agendarHorariosDiarios(horariosDiarios());
const extrasHoje = parseHorarios(EXTRA_HOJE);
agendarExtrasDeHoje(extrasHoje);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Nosso Dia em http://0.0.0.0:${PORT}`);
  console.log(`Horários diários: ${horariosDiarios().map(formatarHorario).join(', ')} (${TZ})`);
  if (extrasHoje.length) {
    console.log(`Extras de hoje: ${extrasHoje.map(formatarHorario).join(', ')}`);
  }
  console.log(iaConfigurada()
    ? 'Recados: IA gera um texto novo a cada disparo'
    : 'Recados: lista reserva (defina AI_API_KEY no Coolify para usar IA)');
});
