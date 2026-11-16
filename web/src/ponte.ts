/**
 * Conversa da interface com a casca do Alba (o processo que desenha barra, dock, painéis
 * e janelas no compositor) e com as outras partes do sistema (pelo servidor).
 *
 * Fora da casca (navegador comum, testes), tudo isto vira "não faz nada" e o Alba usa a
 * área de trabalho de página única.
 */
const params = new URLSearchParams(location.search);

export const naCasca = params.get("casca") === "1";
export const superficie = params.get("superficie") as "fundo" | "barra" | "dock" | "sobre" | null;
export const appAvulso = params.get("app");
export const propsIniciais: Record<string, any> = (() => {
  try {
    return JSON.parse(params.get("props") || "{}");
  } catch {
    return {};
  }
})();

type Ouvinte = (m: any) => void;
const ouvintesCasca = new Set<Ouvinte>();
const fila: any[] = [];

declare global {
  interface Window {
    __alba?: { receber: (m: any) => void };
    webkit?: { messageHandlers?: { alba?: { postMessage: (m: any) => void } } };
  }
}

window.__alba = {
  receber: (m) => {
    if (ouvintesCasca.size === 0) fila.push(m);
    ouvintesCasca.forEach((fn) => fn(m));
  },
};

/** Manda uma mensagem para o processo dono desta página (casca ou app). */
export function paraCasca(m: Record<string, unknown>) {
  window.webkit?.messageHandlers?.alba?.postMessage(m);
}

export function daCasca(fn: Ouvinte) {
  ouvintesCasca.add(fn);
  fila.splice(0).forEach(fn);
  return () => ouvintesCasca.delete(fn);
}

// ---------------------------------------------------------------- eventos entre as partes (servidor)
const ouvintesEventos = new Set<Ouvinte>();
let socket: WebSocket | null = null;
let pendentes: string[] = [];

function conectar() {
  socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/eventos`);
  socket.onopen = () => {
    pendentes.forEach((t) => socket!.send(t));
    pendentes = [];
  };
  socket.onmessage = (e) => {
    try {
      const m = JSON.parse(e.data);
      ouvintesEventos.forEach((fn) => fn(m));
    } catch {
      /* ignora */
    }
  };
  socket.onclose = () => window.setTimeout(conectar, 1500);
}

export function ouvirEventos(fn: Ouvinte) {
  if (!socket) conectar();
  ouvintesEventos.add(fn);
  return () => ouvintesEventos.delete(fn);
}

/** Publica para todas as outras partes do Alba (barra, dock, painéis, apps). */
export function publicarEvento(m: Record<string, unknown>) {
  if (!socket) conectar();
  const texto = JSON.stringify(m);
  if (socket!.readyState === WebSocket.OPEN) socket!.send(texto);
  else pendentes.push(texto);
}
