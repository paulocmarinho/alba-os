import { useEffect, useRef } from "react";
import type { Janela } from "../contexto";
import { useAlba } from "../contexto";

/** Controle da janela que a área de trabalho entrega ao Sleeve (ele desenha a própria barra). */
export type ControleJanela = {
  janela: Janela;
  focar: () => void;
  mover: (x: number, y: number) => void;
  redimensionar: (x: number, y: number, largura: number, altura: number) => void;
  minimizar: () => void;
  maximizar: () => void;
  fechar: () => void;
};

export type Tocando = { titulo: string; artista: string; tocando: boolean; capa: string | null; cor: string | null };

// O Sleeve é único: guardamos a janela dele para a central de controle mandar play/pausa.
let quadroAtual: HTMLIFrameElement | null = null;
export function comandoMusica(tecla: "toggle" | "next" | "previous") {
  quadroAtual?.contentWindow?.postMessage({ alba: { tipo: "media-key", tecla } }, location.origin);
}

const MIN_L = 360;
const MIN_A = 96;

/**
 * Sleeve, o player de música do Alba (github.com/paulocmarinho/sleeve).
 * Roda num quadro sem moldura: a barra, os botões de janela e as bordas são do próprio Sleeve,
 * e esta casca faz o papel do gerenciador de janelas que ele espera.
 */
export function Musica({ controle, abrir }: { controle: ControleJanela; abrir?: { caminhos: string[]; vez: number } }) {
  const { config, perguntar, aviso, definirTocando } = useAlba();
  const quadro = useRef<HTMLIFrameElement>(null);
  const ctl = useRef(controle);
  ctl.current = controle;
  const tocando = useRef(false);
  const pronto = useRef(false);
  const pendentes = useRef<string[][]>([]);
  const antesMini = useRef<{ x: number; y: number; l: number; a: number } | null>(null);
  const escuro = config.tema === "escuro";
  const inicial = useRef({ escuro, abrir: abrir?.caminhos });

  const enviar = (alba: Record<string, unknown>) => quadro.current?.contentWindow?.postMessage({ alba }, location.origin);

  // Arrastar e redimensionar: o Sleeve repassa o deslocamento do mouse ("arrastando") e o Alba move a janela.
  const gesto = useRef<((dx: number, dy: number) => void) | null>(null);

  function arrastar() {
    const { janela } = ctl.current;
    if (janela.maximizada) return;
    const x0 = janela.x;
    const y0 = janela.y;
    gesto.current = (dx, dy) =>
      ctl.current.mover(
        Math.min(Math.max(x0 + dx, 40 - janela.largura), window.innerWidth - 80),
        Math.min(Math.max(y0 + dy, 0), window.innerHeight - 60),
      );
  }

  function redimensionar(borda: string) {
    const j = ctl.current.janela;
    if (j.maximizada) return;
    const ini = { x: j.x, y: j.y, l: j.largura, a: j.altura };
    gesto.current = (dx, dy) => {
      let { x, y, l, a } = ini;
      if (borda.includes("right")) l = Math.max(MIN_L, ini.l + dx);
      if (borda.includes("bottom")) a = Math.max(MIN_A, ini.a + dy);
      if (borda.includes("left")) {
        l = Math.max(MIN_L, ini.l - dx);
        x = ini.x + ini.l - l;
      }
      if (borda.includes("top")) {
        a = Math.max(MIN_A, ini.a - dy);
        y = Math.max(0, ini.y + ini.a - a);
      }
      ctl.current.redimensionar(x, y, l, a);
    };
  }

  function alternarMini() {
    const j = ctl.current.janela;
    if (antesMini.current) {
      const v = antesMini.current;
      antesMini.current = null;
      ctl.current.redimensionar(v.x, v.y, v.l, v.a);
      return;
    }
    antesMini.current = { x: j.x, y: j.y, l: j.largura, a: j.altura };
    if (j.maximizada) ctl.current.maximizar();
    ctl.current.redimensionar(window.innerWidth - 400, 20, 380, 100);
  }

  useEffect(() => {
    quadroAtual = quadro.current;
    const aoReceber = async (e: MessageEvent) => {
      if (e.source !== quadro.current?.contentWindow || e.origin !== location.origin) return;
      const m = e.data?.sleeve;
      if (!m) return;
      switch (m.type) {
        case "arrastando":
          gesto.current?.(Number(m.dx) || 0, Number(m.dy) || 0);
          break;
        case "arrastou":
          gesto.current = null;
          break;
        case "pronto":
          pronto.current = true;
          for (const c of pendentes.current.splice(0)) enviar({ tipo: "abrir", caminhos: c });
          break;
        case "window":
          ctl.current.focar();
          if (m.action === "drag") arrastar();
          else if (m.action === "resize") redimensionar(String(m.edge || "bottomright"));
          else if (m.action === "minimize") ctl.current.minimizar();
          else if (m.action === "maximize") {
            antesMini.current = null;
            ctl.current.maximizar();
          } else if (m.action === "mini") alternarMini();
          else if (m.action === "close") {
            // Como na bandeja do Windows: se estiver tocando, só esconde e a música continua.
            if (tocando.current) ctl.current.minimizar();
            else ctl.current.fechar();
          }
          break;
        case "local":
          tocando.current = !!m.playing;
          definirTocando(m.title ? { titulo: m.title, artista: m.artist, tocando: !!m.playing, capa: m.cover, cor: m.color } : null);
          break;
        case "pasta": {
          const caminho = await perguntar({
            titulo: "Adicionar pasta de música",
            texto: "Caminho da pasta (as subpastas também são lidas):",
            valor: "~/Músicas",
            ok: "Adicionar",
          });
          enviar({ tipo: "resposta", pedido: m.pedido, valor: caminho });
          break;
        }
        case "aviso":
          aviso(String(m.texto || ""));
          break;
      }
    };
    window.addEventListener("message", aoReceber);
    return () => {
      window.removeEventListener("message", aoReceber);
      if (quadroAtual === quadro.current) quadroAtual = null;
      definirTocando(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    enviar({ tipo: "tema", escuro });
  }, [escuro]);

  // Músicas abertas pelo Arquivos com o Sleeve já aberto
  const ultimaVez = useRef(abrir?.vez ?? 0);
  useEffect(() => {
    if (!abrir || abrir.vez === ultimaVez.current) return;
    ultimaVez.current = abrir.vez;
    if (pronto.current) enviar({ tipo: "abrir", caminhos: abrir.caminhos });
    else pendentes.current.push(abrir.caminhos);
  }, [abrir]);

  const consulta = new URLSearchParams({ host: "alba", escuro: inicial.current.escuro ? "1" : "0" });
  if (inicial.current.abrir?.length) consulta.set("abrir", JSON.stringify(inicial.current.abrir));

  return (
    <div className="sleeve-casca">
      <iframe ref={quadro} className="sleeve-quadro" src={`/apps/sleeve/index.html?${consulta}`} title="Sleeve" allow="autoplay" />
    </div>
  );
}
