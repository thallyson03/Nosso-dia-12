const slides = document.querySelectorAll('.slide');
let currentSlide = 0;

function showSlide(index) {
    slides.forEach(slide => slide.classList.remove('active'));
    slides[index].classList.add('active');
}

function nextSlide() {
    currentSlide = (currentSlide + 1) % slides.length;
    showSlide(currentSlide);
}

showSlide(currentSlide);
setInterval(nextSlide, 5000);

const dataInicio = new Date('2023-06-12T00:00:00');
const contadorElement = document.getElementById('contador');

function atualizarContador() {
    const agora = new Date();
    const diferenca = agora.getTime() - dataInicio.getTime();

    const anos = Math.floor(diferenca / (1000 * 60 * 60 * 24 * 365.25));
    const meses = Math.floor((diferenca % (1000 * 60 * 60 * 24 * 365.25)) / (1000 * 60 * 60 * 24 * (365.25 / 12)));
    const dias = Math.floor(diferenca / (1000 * 60 * 60 * 24));
    const horas = Math.floor((diferenca % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutos = Math.floor((diferenca % (1000 * 60 * 60)) / (1000 * 60));
    const segundos = Math.floor((diferenca % (1000 * 60 * 60)) / 1000);

    contadorElement.innerHTML = `
        <div class="contador-item">
            <span class="contador-numero">${anos.toString().padStart(2, '0')}</span>
            <span class="contador-label">anos</span>
        </div>
        <div class="contador-item">
            <span class="contador-numero">${meses.toString().padStart(2, '0')}</span>
            <span class="contador-label">meses</span>
        </div>
        <div class="contador-item">
            <span class="contador-numero">${dias.toString().padStart(2, '0')}</span>
            <span class="contador-label">dias</span>
        </div>
        <div class="contador-item">
            <span class="contador-numero">${horas.toString().padStart(2, '0')}</span>
            <span class="contador-label">horas</span>
        </div>
        <div class="contador-item">
            <span class="contador-numero">${minutos.toString().padStart(2, '0')}</span>
            <span class="contador-label">minutos</span>
        </div>
        <div class="contador-item">
            <span class="contador-numero">${segundos.toString().padStart(2, '0')}</span>
            <span class="contador-label">segundos</span>
        </div>
    `;
}

atualizarContador();
setInterval(atualizarContador, 1000);

const player = document.getElementById('player');
const musicas = [
    './musicas/Pra_sempre.mp3',
    './musicas/O_que.mp3'
];
let musicaIndex = 0;

function carregarMusica(index) {
    player.src = musicas[index];
}

function proximaMusica() {
    musicaIndex = (musicaIndex + 1) % musicas.length;
    carregarMusica(musicaIndex);
    player.play().catch(() => {});
}

function musicaAnterior() {
    musicaIndex = (musicaIndex - 1 + musicas.length) % musicas.length;
    carregarMusica(musicaIndex);
    player.play().catch(() => {});
}

carregarMusica(musicaIndex);
player.addEventListener('ended', proximaMusica);
document.getElementById('btn-musica-anterior')?.addEventListener('click', musicaAnterior);
document.getElementById('btn-proxima-musica')?.addEventListener('click', proximaMusica);

function urlBase64ParaUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const output = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
    return output;
}

function ehIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function ehAndroid() {
    return /android/i.test(navigator.userAgent);
}

function ehPWA() {
    return window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: fullscreen)').matches ||
        window.navigator.standalone === true ||
        new URLSearchParams(location.search).get('source') === 'pwa';
}

const NOTIF_DISMISS_KEY = 'nosso-dia-notif-dismiss';
const PWA_DISMISS_KEY = 'nosso-dia-pwa-dismiss';
const pwaInstall = document.getElementById('pwa-install');
const pwaInstallTexto = document.getElementById('pwa-install-texto');
const btnInstall = document.getElementById('btn-install');
const btnInstallFechar = document.getElementById('btn-install-fechar');
const notifBanner = document.getElementById('notif-banner');
const notifTexto = document.getElementById('notif-texto');
const btnAtivarNotif = document.getElementById('btn-ativar-notif');
const btnNotifFechar = document.getElementById('btn-notif-fechar');
let promptInstalacao = null;
let pedindoNotificacao = false;
let vapidPublicKey = null;
let swPronto = null;

try { localStorage.removeItem('nosso-dia-notif-asked'); } catch {}

function mostrarBannerPWA(texto, rotuloBotao) {
    if (!pwaInstall || ehPWA()) return;
    if (localStorage.getItem(PWA_DISMISS_KEY) === '1') return;
    notifBanner?.classList.add('hidden');
    if (texto && pwaInstallTexto) pwaInstallTexto.textContent = texto;
    if (rotuloBotao && btnInstall) btnInstall.textContent = rotuloBotao;
    pwaInstall.classList.remove('hidden');
}

function mostrarBannerNotif(texto) {
    if (!notifBanner) return;
    pwaInstall?.classList.add('hidden');
    if (texto && notifTexto) notifTexto.textContent = texto;
    notifBanner.classList.remove('hidden');
}

function ocultarBannerNotif() {
    notifBanner?.classList.add('hidden');
}

function pushDisponivel() {
    return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
}

async function prepararPush() {
    if (!('serviceWorker' in navigator)) return null;
    swPronto = navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .then(() => navigator.serviceWorker.ready);
    try {
        const chave = await fetch('/api/vapid-public-key').then((res) => {
            if (!res.ok) throw new Error('api');
            return res.json();
        });
        vapidPublicKey = chave.publicKey;
    } catch {
        vapidPublicKey = null;
    }
    return swPronto;
}

prepararPush().catch(() => {});

window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    promptInstalacao = event;
    mostrarBannerPWA(
        'Adicione o Nosso Dia na tela inicial para abrir como app e receber os recados.',
        'Adicionar à tela inicial'
    );
});

window.addEventListener('appinstalled', () => {
    localStorage.setItem(PWA_DISMISS_KEY, '1');
    pwaInstall?.classList.add('hidden');
    promptInstalacao = null;
    setTimeout(verificarNotificacoes, 400);
});

if (!ehPWA()) {
    if (ehIOS()) {
        mostrarBannerPWA(
            'No iPhone/iPad: toque em Compartilhar e depois em “Adicionar à Tela de Início”. Depois abra pelo ícone para ativar os recados.',
            'Ver como adicionar'
        );
    } else if (ehAndroid()) {
        setTimeout(() => {
            if (!promptInstalacao) {
                mostrarBannerPWA(
                    'No Android: menu ⋮ do Chrome → “Adicionar à tela inicial” ou “Instalar app”.',
                    'Como instalar'
                );
            }
        }, 2500);
    }
}

btnInstall?.addEventListener('click', async () => {
    if (promptInstalacao) {
        promptInstalacao.prompt();
        const escolha = await promptInstalacao.userChoice;
        promptInstalacao = null;
        if (escolha?.outcome === 'accepted') {
            localStorage.setItem(PWA_DISMISS_KEY, '1');
            pwaInstall?.classList.add('hidden');
        }
        return;
    }

    if (ehIOS() && pwaInstallTexto) {
        pwaInstallTexto.textContent = 'Safari → Compartilhar → “Adicionar à Tela de Início” → Adicionar. Depois abra pelo ícone novo.';
        return;
    }

    if (pwaInstallTexto) {
        pwaInstallTexto.textContent = 'Chrome → menu ⋮ → “Adicionar à tela inicial” ou “Instalar aplicativo”.';
    }
});

btnInstallFechar?.addEventListener('click', () => {
    localStorage.setItem(PWA_DISMISS_KEY, '1');
    pwaInstall?.classList.add('hidden');
});

async function registrarInscricao() {
    if (!vapidPublicKey) await prepararPush();
    if (!vapidPublicKey) throw new Error('vapid');

    const registro = await (swPronto || navigator.serviceWorker.ready);
    const atual = await registro.pushManager.getSubscription();
    if (atual) {
        try { await atual.unsubscribe(); } catch {}
    }

    const inscricao = await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ParaUint8Array(vapidPublicKey)
    });

    const resposta = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inscricao.toJSON())
    });
    if (!resposta.ok) throw new Error('subscribe');
    return resposta.json();
}

async function ativarNotificacoesComToque() {
    if (pedindoNotificacao) return;
    pedindoNotificacao = true;
    if (btnAtivarNotif) btnAtivarNotif.disabled = true;

    try {
        if (!ehPWA() && ehIOS()) {
            mostrarBannerNotif('No iPhone, feche o Safari e abra pelo ícone “Nosso Dia” na tela inicial.');
            return;
        }

        if (!pushDisponivel()) {
            mostrarBannerNotif('Este aparelho ainda não liberou Push. Confirme iOS 16.4+ e abra pelo ícone da tela inicial.');
            return;
        }

        const permissao = await Notification.requestPermission();
        if (permissao !== 'granted') {
            if (notifTexto) {
                notifTexto.textContent = permissao === 'denied'
                    ? 'Permissão bloqueada. Em Ajustes → Notificações → Nosso Dia, ative e abra o app de novo.'
                    : 'Sem permissão ainda. Toque de novo em “Ativar recadinhos”.';
            }
            return;
        }

        const info = await registrarInscricao();
        localStorage.setItem(NOTIF_DISMISS_KEY, '1');
        ocultarBannerNotif();
        if (notifTexto) {
            notifTexto.textContent = `Pronto! Recadinhos ativados${info?.host ? ` (${info.host})` : ''}.`;
        }
    } catch (erro) {
        console.error(erro);
        if (notifTexto) {
            notifTexto.textContent = 'Não deu para ativar agora. Feche o app, abra pelo ícone da tela inicial e toque de novo em Ativar.';
        }
        mostrarBannerNotif();
    } finally {
        pedindoNotificacao = false;
        if (btnAtivarNotif) btnAtivarNotif.disabled = false;
    }
}

async function verificarNotificacoes() {
    if (localStorage.getItem(NOTIF_DISMISS_KEY) === '1' && Notification.permission === 'granted') {
        if (pushDisponivel()) {
            try { await registrarInscricao(); } catch {}
        }
        return;
    }

    if (!ehPWA() && ehIOS()) return;

    if (!pushDisponivel()) {
        if (ehPWA()) {
            mostrarBannerNotif('Este app ainda não conseguiu preparar as notificações. Feche e abra de novo pelo ícone.');
        }
        return;
    }

    if (Notification.permission === 'granted') {
        try { await registrarInscricao(); } catch {}
        localStorage.setItem(NOTIF_DISMISS_KEY, '1');
        ocultarBannerNotif();
        return;
    }

    if (Notification.permission === 'denied') {
        mostrarBannerNotif('As notificações estão bloqueadas. Ative em Ajustes do celular e abra o app de novo.');
        return;
    }

    mostrarBannerNotif('Toque abaixo para permitir os recadinhos diários.');
}

btnAtivarNotif?.addEventListener('click', ativarNotificacoesComToque);
btnNotifFechar?.addEventListener('click', () => {
    localStorage.setItem(NOTIF_DISMISS_KEY, '1');
    ocultarBannerNotif();
});

verificarNotificacoes();
