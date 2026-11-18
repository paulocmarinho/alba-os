import { useRef, type ReactNode } from "react";
import type { Janela as DadosJanela } from "../contexto";
import { alturaTela, emCss, larguraTela } from "../escala";

type Props = {
  janela: DadosJanela;
  ativa: boolean;
  classe?: string;
  semMoldura?: boolean;
  acoes?: ReactNode;
  children: ReactNode;
  onFoco: () => void;
  onFechar: () => void;
  onMinimizar: () => void;
  onMaximizar: () => void;
  onMover: (x: number, y: number) => void;
  onRedimensionar: (largura: number, altura: number) => void;
};

/** Moldura de janela do Alba: arrastar pela barra, redimensionar pelo canto, controles do Alba à esquerda (três pontos que ganham cor no hover). */
export function Janela({
  janela,
  ativa,
  classe = "",
  semMoldura = false,
  acoes,
  children,
  onFoco,
  onFechar,
  onMinimizar,
  onMaximizar,
  onMover,
  onRedimensionar,
}: Props) {
  const arraste = useRef<{ dx: number; dy: number } | null>(null);

  function iniciarArraste(e: React.PointerEvent<HTMLElement>) {
    if ((e.target as HTMLElement).closest("button, input, select, textarea, a")) return;
    if (janela.maximizada) return;
    onFoco();
    arraste.current = { dx: emCss(e.clientX) - janela.x, dy: emCss(e.clientY) - janela.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function mover(e: React.PointerEvent<HTMLElement>) {
    if (!arraste.current) return;
    const x = Math.min(Math.max(emCss(e.clientX) - arraste.current.dx, 40 - janela.largura), larguraTela() - 80);
    const y = Math.min(Math.max(emCss(e.clientY) - arraste.current.dy, 0), alturaTela() - 120);
    onMover(x, y);
  }

  function soltar() {
    arraste.current = null;
  }

  function iniciarRedim(e: React.PointerEvent<HTMLElement>) {
    e.stopPropagation();
    onFoco();
    const inicio = { x: emCss(e.clientX), y: emCss(e.clientY), l: janela.largura, a: janela.altura };
    const alvo = e.currentTarget as HTMLElement;
    alvo.setPointerCapture(e.pointerId);
    const aoMover = (ev: PointerEvent) =>
      onRedimensionar(Math.max(380, inicio.l + emCss(ev.clientX) - inicio.x), Math.max(260, inicio.a + emCss(ev.clientY) - inicio.y));
    const aoSoltar = () => {
      alvo.removeEventListener("pointermove", aoMover);
      alvo.removeEventListener("pointerup", aoSoltar);
    };
    alvo.addEventListener("pointermove", aoMover);
    alvo.addEventListener("pointerup", aoSoltar);
  }

  const estilo: React.CSSProperties = janela.maximizada
    ? { left: 10, top: 10, right: 10, bottom: 86, zIndex: janela.z }
    : { left: janela.x, top: janela.y, width: janela.largura, height: janela.altura, zIndex: janela.z };

  return (
    <article
      className={`window janela ${classe} ${semMoldura ? "sem-moldura" : ""} ${ativa ? "ativa" : ""} ${janela.minimizada ? "minimizada" : ""}`}
      style={estilo}
      onPointerDown={onFoco}
      aria-label={janela.titulo}
    >
      {!semMoldura && (
      <header
        className="window-bar"
        onPointerDown={iniciarArraste}
        onPointerMove={mover}
        onPointerUp={soltar}
        onDoubleClick={(e) => {
          if (!(e.target as HTMLElement).closest("button")) onMaximizar();
        }}
      >
        <div className="window-controls" role="group" aria-label={`Controles da janela ${janela.titulo}`}>
          <button className="wc-close" onClick={onFechar} aria-label="Fechar">
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M3 3l6 6M9 3l-6 6" />
            </svg>
          </button>
          <button className="wc-min" onClick={onMinimizar} aria-label="Minimizar">
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M2.5 6h7" />
            </svg>
          </button>
          <button className="wc-max" onClick={onMaximizar} aria-label={janela.maximizada ? "Restaurar" : "Maximizar"}>
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <rect x="2.5" y="2.5" width="7" height="7" rx="2.2" />
            </svg>
          </button>
        </div>
        <span className="window-title">{janela.titulo}</span>
        <div className="barra-direita">
          {acoes && <div className="window-actions">{acoes}</div>}
        </div>
      </header>
      )}
      <div className="janela-conteudo">{children}</div>
      {!janela.maximizada && !semMoldura && <span className="alca-redim" onPointerDown={iniciarRedim} aria-hidden="true" />}
    </article>
  );
}
