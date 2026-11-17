// Ponte do Sleeve para o Alba OS.
//
// No Alba, o Sleeve roda numa janela sem moldura do sistema. Esta ponte substitui
// o bridge.js original na construção do Alba e fala com dois lados:
//   - o servidor do Alba (/api/musica/...): biblioteca, capas, áudio e Spotify (MPRIS);
//   - a área de trabalho do Alba (window.parent): arrastar, redimensionar, minimizar,
//     maximizar, fechar, mini player, tema do sistema, "tocando agora" na central.
// As mensagens são as mesmas descritas no bridge.js do Sleeve.

const listeners = [];
const emit = (m) => listeners.forEach((fn) => fn(m));
const params = new URLSearchParams(location.search);

// ---------- Tema: o "Automático" do Sleeve segue o modo escuro do Alba ----------
let escuro = params.get('escuro') === '1';
const temaListeners = new Set();
const consultaTema = {
  get matches() { return escuro; },
  media: '(prefers-color-scheme: dark)',
  addEventListener: (_t, fn) => temaListeners.add(fn),
  removeEventListener: (_t, fn) => temaListeners.delete(fn),
  addListener: (fn) => temaListeners.add(fn),
  removeListener: (fn) => temaListeners.delete(fn),
  onchange: null,
};
const matchMediaOriginal = window.matchMedia.bind(window);
window.matchMedia = (q) => (/prefers-color-scheme:\s*dark/.test(q) ? consultaTema : matchMediaOriginal(q));

// ---------- Ajustes que só fazem sentido no Windows ficam escondidos ----------
const estilo = document.createElement('style');
estilo.textContent = `
  #pin-button { display: none !important; }
  .row:has([data-key="startup"]), .row:has([data-key="autoUpdate"]), .row:has([data-key="hiRes"]),
  .row:has([data-key="pinned"]) { display: none !important; }
  html, body { overscroll-behavior: none; }
  body { -webkit-user-select: none; user-select: none; }
  input { -webkit-user-select: text; user-select: text; }
`;
document.head.append(estilo);
document.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------- Conversa com o servidor do Alba ----------
async function api(metodo, caminho, corpo) {
  const r = await fetch(caminho, {
    method: metodo,
    headers: corpo ? { 'Content-Type': 'application/json' } : {},
    body: corpo ? JSON.stringify(corpo) : undefined,
    credentials: 'same-origin',
  });
  const dados = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(dados.erro || 'Falhou.');
  return dados;
}

// ---------- Conversa com a área de trabalho do Alba ----------
const paraAlba = (msg) => window.parent !== window && window.parent.postMessage({ sleeve: msg }, location.origin);
const pedidos = new Map();
let proximoPedido = 1;
function perguntarAlba(msg) {
  const id = proximoPedido++;
  return new Promise((resolve) => {
    pedidos.set(id, resolve);
    paraAlba({ ...msg, pedido: id });
  });
}

// ---------- Cores das capas (para o fundo do "tocando agora") ----------
const CORES_SALVAS = 'sleeve-alba-cores';
let cores = {};
try { cores = JSON.parse(localStorage.getItem(CORES_SALVAS) || '{}'); } catch { cores = {}; }

function corDaCapa(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = c.height = 24;
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(img, 0, 0, 24, 24);
        const px = g.getImageData(0, 0, 24, 24).data;
        let r = 0, gr = 0, b = 0, peso = 0;
        for (let i = 0; i < px.length; i += 4) {
          const max = Math.max(px[i], px[i + 1], px[i + 2]);
          const min = Math.min(px[i], px[i + 1], px[i + 2]);
          const w = 1 + ((max - min) / 255) * 4; // cores vivas pesam mais que cinzas
          r += px[i] * w; gr += px[i + 1] * w; b += px[i + 2] * w; peso += w;
        }
        const hex = (v) => Math.round(v / peso).toString(16).padStart(2, '0');
        resolve('#' + hex(r) + hex(gr) + hex(b));
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

let ultimaBiblioteca = null;
const capaPorFaixa = new Map();

async function colorir(lista) {
  let mudou = false;
  for (const a of lista) {
    if (!a.cover || a.color) continue;
    const chave = a.cover;
    if (!(chave in cores)) {
      cores[chave] = await corDaCapa(a.cover);
      mudou = true;
    }
    a.color = cores[chave];
  }
  if (mudou) {
    try { localStorage.setItem(CORES_SALVAS, JSON.stringify(cores)); } catch { /* sem espaço: tudo bem */ }
  }
  return mudou;
}

async function entregarBiblioteca(dados) {
  ultimaBiblioteca = dados;
  capaPorFaixa.clear();
  for (const a of dados.albums || []) {
    if (a.cover && a.color === null && cores[a.cover]) a.color = cores[a.cover];
    for (const t of a.tracks) capaPorFaixa.set(`${t.title}\u0000${t.artist}`, { capa: a.cover, cor: a.color, album: a.title });
  }
  emit({ type: 'library', ...dados });
  if (await colorir(dados.albums || [])) {
    for (const a of dados.albums) for (const t of a.tracks) capaPorFaixa.set(`${t.title}\u0000${t.artist}`, { capa: a.cover, cor: a.color, album: a.title });
    emit({ type: 'library', ...dados });
  }
}

async function carregar(reler = false) {
  if (reler) emit({ type: 'scan', count: 0 });
  const espiar = setInterval(async () => {
    try { const e = await api('GET', '/api/musica/estado'); if (e.lendo) emit({ type: 'scan', count: e.contagem }); } catch { /* ignora */ }
  }, 700);
  try {
    await entregarBiblioteca(await api(reler ? 'POST' : 'GET', reler ? '/api/musica/ler' : '/api/musica/biblioteca'));
  } catch {
    emit({ type: 'library', albums: [], folders: [], scanning: false });
  } finally {
    clearInterval(espiar);
  }
}

async function abrirArquivos(caminhos) {
  if (!caminhos?.length) return;
  try {
    const { tracks } = await api('POST', '/api/musica/abrir', { caminhos });
    for (const t of tracks) if (t.cover && !t.color) t.color = cores[t.cover] || (cores[t.cover] = await corDaCapa(t.cover));
    emit({ type: 'open', tracks });
  } catch { /* arquivo sumiu ou não é de áudio */ }
}

// ---------- Spotify (quando estiver aberto no Alba) ----------
let spotifyAnterior = 'null';
const coresSpotify = {}; // capa do Spotify -> cor (só enquanto o Sleeve está aberto)
async function olharSpotify() {
  try {
    const { info } = await api('GET', '/api/musica/spotify');
    if (info?.cover && /^https:/.test(info.cover)) {
      // A capa passa pelo servidor do Alba: assim dá para tirar a cor dela para o fundo
      const original = info.cover;
      info.cover = '/api/musica/capa-spotify?url=' + encodeURIComponent(original);
      if (!(original in coresSpotify)) coresSpotify[original] = await corDaCapa(info.cover);
      info.color = coresSpotify[original];
    }
    const texto = JSON.stringify(info);
    if (texto !== spotifyAnterior) {
      spotifyAnterior = texto;
      emit({ type: 'spotify', info });
    }
  } catch { /* servidor ocupado: tenta na próxima */ }
}

// ---------- Mensagens vindas da área de trabalho ----------
window.addEventListener('message', (e) => {
  if (e.origin !== location.origin || !e.data?.alba) return;
  const m = e.data.alba;
  if (m.tipo === 'resposta' && pedidos.has(m.pedido)) {
    pedidos.get(m.pedido)(m.valor);
    pedidos.delete(m.pedido);
  } else if (m.tipo === 'tema') {
    if (escuro !== !!m.escuro) {
      escuro = !!m.escuro;
      temaListeners.forEach((fn) => fn({ matches: escuro, media: consultaTema.media }));
    }
  } else if (m.tipo === 'media-key') {
    emit({ type: 'media-key', key: m.tecla });
  } else if (m.tipo === 'abrir') {
    abrirArquivos(m.caminhos);
  }
});

// Arrastar e redimensionar: enquanto o botão está apertado, o navegador continua mandando o
// movimento do mouse para este quadro (mesmo fora dele). Repassamos o deslocamento para o Alba.
let ultimoPonteiro = { x: 0, y: 0 };
let ultimoClique = { x: 0, y: 0 };
document.addEventListener('pointerdown', (e) => {
  ultimoPonteiro = { x: e.screenX, y: e.screenY };
  ultimoClique = { x: e.clientX, y: e.clientY };
}, true);
function seguirMouse() {
  const origem = { ...ultimoPonteiro };
  const mover = (e) => {
    if (!(e.buttons & 1)) return soltar();
    paraAlba({ type: 'arrastando', dx: e.screenX - origem.x, dy: e.screenY - origem.y });
  };
  const soltar = () => {
    window.removeEventListener('pointermove', mover, true);
    window.removeEventListener('pointerup', soltar, true);
    window.removeEventListener('blur', soltar);
    paraAlba({ type: 'arrastou' });
  };
  window.addEventListener('pointermove', mover, true);
  window.addEventListener('pointerup', soltar, true);
  window.addEventListener('blur', soltar);
}

let pinned = false;

// ---------- Atualizações: o Sleeve vem dentro das atualizações do Alba ----------
// Cada pacote do Alba leva o Sleeve mais novo (compilacao.json diz qual). "Procurar
// atualizações" no Sleeve pergunta ao Alba; "Reiniciar" instala o pacote e reabre a sessão.
let versaoSleeve = '';
async function verAtualizacao(avisar) {
  if (avisar) emit({ type: 'update', state: 'checking', version: null, current: versaoSleeve });
  try {
    const r = await api('GET', '/api/atualizacao');
    versaoSleeve = r.atual?.sleeve?.versao || versaoSleeve;
    const atual = r.atual?.sleeve?.commit;
    const nova = r.nova?.sleeve;
    const temNova = r.disponivel && nova && nova.commit && nova.commit !== atual;
    if (r.erro && avisar) emit({ type: 'update', state: 'error', version: null, current: versaoSleeve });
    else emit({ type: 'update', state: temNova ? 'ready' : avisar ? 'none' : 'idle', version: temNova ? nova.versao : null, current: versaoSleeve });
  } catch {
    emit({ type: 'update', state: avisar ? 'error' : 'idle', version: null, current: versaoSleeve });
  }
}
async function instalarAtualizacao() {
  emit({ type: 'update', state: 'downloading', version: null, current: versaoSleeve });
  try {
    await api('POST', '/api/atualizacao');
    await api('POST', '/api/recarregar', { sessao: true });
  } catch (e) {
    paraAlba({ type: 'aviso', texto: e.message });
    emit({ type: 'update', state: 'error', version: null, current: versaoSleeve });
  }
}

export const host = {
  kind: 'alba',
  send: async (msg) => {
    switch (msg.type) {
      case 'ready': {
        const cfg = await api('POST', '/api/musica/config', {}).catch(() => ({ pinned: false }));
        pinned = !!cfg.pinned;
        emit({ type: 'settings', hiRes: false, startup: false, pinned, mini: false, autoUpdate: false });
        verAtualizacao(false);
        await carregar();
        const abrir = params.get('abrir');
        if (abrir) abrirArquivos(JSON.parse(abrir));
        paraAlba({ type: 'pronto' });
        olharSpotify();
        setInterval(olharSpotify, 1500);
        break;
      }
      case 'window':
        if (msg.action === 'drag' || msg.action === 'resize') seguirMouse();
        if (msg.action === 'pin') {
          pinned = !pinned;
          api('POST', '/api/musica/config', { pinned }).catch(() => {});
          emit({ type: 'settings', pinned });
        }
        paraAlba({ ...msg, x: ultimoClique.x, y: ultimoClique.y });
        break;
      case 'spotify':
        await api('POST', '/api/musica/spotify', { acao: msg.action, posicao: msg.position }).catch(() => {});
        setTimeout(olharSpotify, 250);
        break;
      case 'volume':
        await api('POST', '/api/musica/spotify', { acao: 'volume', volume: msg.value }).catch(() => {});
        break;
      case 'artistPhotos':
        for (const ar of msg.artists || []) {
          const caminhos = (ar.urls || []).map((u) => { try { return new URL(u, location.origin).searchParams.get('caminho'); } catch { return null; } }).filter(Boolean);
          const r = await api('POST', '/api/musica/foto-artista', {
            nome: ar.name, albuns: ar.albums, faixas: ar.tracks, caminhos, online: msg.online,
          }).catch(() => ({}));
          emit({ type: 'artistPhoto', name: ar.name, url: r.url || null });
        }
        break;
      case 'repair':
        // No Alba o servidor já entrega o arquivo consertado; se ainda assim não abriu, não tem conserto
        emit({ type: 'repaired', id: msg.id, url: null });
        break;
      case 'lyrics': {
        // Arquivo da biblioteca: o caminho vem no endereço do áudio
        let caminho = null;
        try { if (msg.url) caminho = new URL(msg.url, location.origin).searchParams.get('caminho'); } catch { /* sem caminho */ }
        const r = await api('POST', '/api/musica/letra', {
          caminho, titulo: msg.title, artista: msg.artist, album: msg.album, duracao: msg.duration, online: msg.online,
        }).catch(() => ({}));
        emit({ type: 'lyrics', key: msg.key, synced: r.synced || null, plain: r.plain || null });
        break;
      }
      case 'local': {
        const extra = capaPorFaixa.get(`${msg.title}\u0000${msg.artist}`) || {};
        paraAlba({ type: 'local', title: msg.title, artist: msg.artist, playing: msg.playing, cover: extra.capa || null, color: extra.cor || null });
        break;
      }
      case 'folders':
        if (msg.action === 'add') {
          const caminho = await perguntarAlba({ type: 'pasta' });
          if (!caminho) break;
          emit({ type: 'scan', count: 0 });
          try { await entregarBiblioteca(await api('POST', '/api/musica/pastas', { acao: 'add', caminho })); }
          catch (e) { paraAlba({ type: 'aviso', texto: e.message }); emit({ type: 'library', ...(ultimaBiblioteca || { albums: [], folders: [] }), scanning: false }); }
        } else if (msg.action === 'remove') {
          await entregarBiblioteca(await api('POST', '/api/musica/pastas', { acao: 'remove', caminho: msg.path }));
        } else if (msg.action === 'rescan') {
          await carregar(true);
        }
        break;
      case 'setting':
        if (msg.key === 'pinned') host.send({ type: 'window', action: 'pin' });
        break;
      case 'update':
        if (msg.action === 'restart') instalarAtualizacao();
        else verAtualizacao(true);
        break;
      case 'theme':
        paraAlba(msg);
        break;
    }
  },
  on: (fn) => listeners.push(fn),
};
