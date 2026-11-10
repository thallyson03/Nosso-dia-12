import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const dataDir = join(__dirname, 'data');
const historicoPath = join(dataDir, 'recados-ia.json');
const cachePath = join(dataDir, 'recado-do-dia.json');
const mensagensPath = join(root, 'mensagens.json');

const TZ = process.env.TZ || 'America/Sao_Paulo';
const PROVIDER = (process.env.AI_PROVIDER || 'groq').toLowerCase();
const API_KEY = process.env.AI_API_KEY || process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY || '';
const MODEL = process.env.AI_MODEL || modeloPadrao(PROVIDER);

function modeloPadrao(provider) {
  if (provider === 'openai') return 'gpt-4o-mini';
  if (provider === 'gemini') return 'gemini-2.0-flash';
  return 'qwen/qwen3.8-27b';
}

function agoraNoFuso() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
}

function chaveDoDia() {
  const agora = agoraNoFuso();
  const y = agora.getFullYear();
  const m = String(agora.getMonth() + 1).padStart(2, '0');
  const d = String(agora.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function lerJson(caminho, fallback) {
  try {
    return JSON.parse(readFileSync(caminho, 'utf8'));
  } catch {
    return fallback;
  }
}

function mensagemReserva() {
  const mensagens = lerJson(mensagensPath, ['Te amo.']);
  const agora = agoraNoFuso();
  const inicioAno = new Date(agora.getFullYear(), 0, 0);
  const diaDoAno = Math.floor((agora - inicioAno) / 86400000);
  return mensagens[diaDoAno % mensagens.length];
}

function limparRecado(texto) {
  const limpo = String(texto || '')
    .replace(/^["'«»]|["'«»]$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!limpo) return '';
  return limpo.length > 180 ? `${limpo.slice(0, 177).trim()}…` : limpo;
}

function contextoDoDia() {
  const agora = agoraNoFuso();
  const dias = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const data = agora.toLocaleDateString('pt-BR', { timeZone: TZ });
  const diaSemana = dias[agora.getDay()];
  const dia = agora.getDate();
  const mes = agora.getMonth() + 1;
  const extras = [];
  if (dia === 12) extras.push('Hoje é dia 12, o dia de vocês.');
  if (dia === 12 && mes === 6) extras.push('Hoje é o aniversário do relacionamento (12/06).');
  return { data, diaSemana, extras };
}

function montarPrompt(historico) {
  const { data, diaSemana, extras } = contextoDoDia();
  const recentes = historico.slice(-25).map((item) => `- ${item.texto}`).join('\n') || '- (nenhuma ainda)';
  return `Escreva UM recado curto de Thallyson para Isla, para uma notificação no celular.

Regras:
- Português do Brasil, tom sincero e íntimo, sem parecer cartão de loja.
- 1 ou 2 frases. Máximo 180 caracteres.
- No máximo um emoji, e só se couber com naturalidade.
- Não use aspas, hashtag, título nem explicação. Responda só o recado.
- Não repita as mensagens recentes.

Contexto: juntos desde 12/06/2023. Hoje é ${diaSemana}, ${data}.
${extras.join(' ')}

Mensagens recentes para não repetir:
${recentes}`;
}

async function chamarOpenAICompativel(prompt, baseUrl) {
  const resposta = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.95,
      max_tokens: 160,
      messages: [
        { role: 'system', content: 'Você escreve recados românticos curtos para notificação de celular.' },
        { role: 'user', content: prompt }
      ]
    }),
    signal: AbortSignal.timeout(15000)
  });

  if (!resposta.ok) {
    throw new Error(`IA ${resposta.status}: ${await resposta.text()}`);
  }

  const json = await resposta.json();
  return json.choices?.[0]?.message?.content;
}

async function chamarGemini(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
  const resposta = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.95, maxOutputTokens: 90 }
    }),
    signal: AbortSignal.timeout(15000)
  });

  if (!resposta.ok) {
    throw new Error(`IA ${resposta.status}: ${await resposta.text()}`);
  }

  const json = await resposta.json();
  return json.candidates?.[0]?.content?.parts?.[0]?.text;
}

async function gerarComIA() {
  if (!API_KEY) return null;

  const historico = lerJson(historicoPath, []);
  const prompt = montarPrompt(historico);
  let bruto;

  if (PROVIDER === 'gemini') {
    bruto = await chamarGemini(prompt);
  } else if (PROVIDER === 'openai') {
    bruto = await chamarOpenAICompativel(prompt, 'https://api.openai.com/v1');
  } else {
    bruto = await chamarOpenAICompativel(prompt, 'https://api.groq.com/openai/v1');
  }

  const texto = limparRecado(bruto);
  if (!texto) return null;

  historico.push({ data: chaveDoDia(), texto });
  writeFileSync(historicoPath, JSON.stringify(historico.slice(-90), null, 2));
  return texto;
}

export async function mensagemDoDia({ forcar = false } = {}) {
  const dia = chaveDoDia();
  const cache = lerJson(cachePath, null);
  if (!forcar && cache?.dia === dia && cache?.texto) {
    return { texto: cache.texto, origem: cache.origem || 'cache' };
  }

  let texto;
  let origem = 'ia';

  try {
    texto = await gerarComIA();
  } catch (erro) {
    console.error('IA não gerou o recado:', erro.message);
  }

  if (!texto) {
    texto = mensagemReserva();
    origem = 'reserva';
  }

  writeFileSync(cachePath, JSON.stringify({ dia, texto, origem }, null, 2));
  return { texto, origem };
}

export function iaConfigurada() {
  return Boolean(API_KEY);
}
