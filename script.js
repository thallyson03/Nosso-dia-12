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

// Mostra o primeiro slide inicialmente
showSlide(currentSlide);

setInterval(nextSlide, 5000); // Troca de slide a cada 5 segundos

// Contador de tempo juntos
const dataInicio = new Date('2023-06-12T00:00:00'); // Data de início do relacionamento: 12/06/2023
const contadorElement = document.getElementById('contador');

function atualizarContador() {
    const agora = new Date();
    const diferenca = agora.getTime() - dataInicio.getTime();

    const anos = Math.floor(diferenca / (1000 * 60 * 60 * 24 * 365.25));
    const meses = Math.floor((diferenca % (1000 * 60 * 60 * 24 * 365.25)) / (1000 * 60 * 60 * 24 * (365.25 / 12)));
    const dias = Math.floor(diferenca / (1000 * 60 * 60 * 24));
    const horas = Math.floor((diferenca % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutos = Math.floor((diferenca % (1000 * 60 * 60)) / (1000 * 60));
    const segundos = Math.floor((diferenca % (1000 * 60)) / 1000);

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
setInterval(atualizarContador, 1000); // Atualiza o contador a cada segundo

// Reprodutor de música
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

const NOTIF_ASKED_KEY = 'nosso-dia-notif-asked';
const PWA_DISMISS_KEY = 'nosso-dia-pwa-dismiss';
const pwaInstall = document.getElementById('pwa-install');
const pwaInstallTexto = document.getElementById('pwa-install-texto');
const btnInstall = document.getElementById('btn-install');
const btnInstallFechar = document.getElementById('btn-install-fechar');
let promptInstalacao = null;
let pedindoNotificacao = false;

function jaPediuNotificacao() {
    return localStorage.getItem(NOTIF_ASKED_KEY) === '1';
}

function marcarPedidoNotificacao() {
    localStorage.setItem(NOTIF_ASKED_KEY, '1');
}

function mostrarBannerPWA(texto, rotuloBotao) {
    if (!pwaInstall || ehPWA()) return;
    if (localStorage.getItem(PWA_DISMISS_KEY) === '1') return;
    if (texto && pwaInstallTexto) pwaInstallTexto.textContent = texto;
    if (rotuloBotao && btnInstall) btnInstall.textContent = rotuloBotao;
    pwaInstall.classList.remove('hidden');
}

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
}

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
});

if (!ehPWA()) {
    if (ehIOS()) {
        mostrarBannerPWA(
            'No iPhone/iPad: toque em Compartilhar e depois em “Adicionar à Tela de Início”.',
            'Ver como adicionar'
        );
    } else if (ehAndroid()) {
        // Se o Chrome não disparar beforeinstallprompt, ainda orienta o usuário
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
        pwaInstallTexto.textContent = 'Safari → botão Compartilhar (quadrado com seta) → role e toque em “Adicionar à Tela de Início” → Adicionar.';
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

function pushDisponivel() {
    return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
}

async function registrarInscricao() {
    const chave = await fetch('/api/vapid-public-key').then((res) => {
        if (!res.ok) throw new Error('api');
        return res.json();
    });

    const registro = await navigator.serviceWorker.ready;
    const inscricao = await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ParaUint8Array(chave.publicKey)
    });

    await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inscricao)
    });
}

async function pedirNotificacaoUmaVez() {
    if (pedindoNotificacao || !pushDisponivel()) return;
    if (ehIOS() && !ehPWA()) return;
    if (Notification.permission === 'denied') {
        marcarPedidoNotificacao();
        return;
    }

    if (Notification.permission === 'granted') {
        marcarPedidoNotificacao();
        try { await registrarInscricao(); } catch {}
        return;
    }

    if (jaPediuNotificacao()) return;

    pedindoNotificacao = true;
    try {
        const permissao = await Notification.requestPermission();
        marcarPedidoNotificacao();
        if (permissao === 'granted') await registrarInscricao();
    } catch {
        marcarPedidoNotificacao();
    } finally {
        pedindoNotificacao = false;
    }
}

function aguardarPrimeiroToque() {
    const tentar = () => {
        window.removeEventListener('pointerdown', tentar);
        window.removeEventListener('keydown', tentar);
        pedirNotificacaoUmaVez();
    };
    window.addEventListener('pointerdown', tentar, { once: true });
    window.addEventListener('keydown', tentar, { once: true });
}

pedirNotificacaoUmaVez().then(() => {
    if (!pushDisponivel()) return;
    if (!jaPediuNotificacao() && Notification.permission === 'default') {
        aguardarPrimeiroToque();
    }
});