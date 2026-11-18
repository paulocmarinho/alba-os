import { useId, type ReactNode } from "react";

/**
 * Ícones dos apps do Alba: formato arredondado, luz quente vindo de cima e sombra azulada
 * embaixo (a luz do amanhecer). Cada ícone tem versão clara e escura: as cores vêm de
 * variáveis CSS (--ic-a, --ic-b, --ic-glifo, --ic-acento) definidas por app em alba.css,
 * com outros valores dentro de `.dark`.
 */
export type IdArte =
  | "apps"
  | "arquivos"
  | "musica"
  | "terminal"
  | "notas"
  | "loja"
  | "ajustes"
  | "monitor"
  | "visualizador"
  | "lixeira"
  | "instalador";

const GLIFOS: Record<IdArte, ReactNode> = {
  apps: (
    <>
      {[27, 42, 57].flatMap((y) => [27, 42, 57].map((x) => (x === 42 && y === 42 ? null : <circle key={`${x}-${y}`} className="g" cx={x} cy={y} r="5" />)))}
      <circle className="ac" cx="42" cy="42" r="5.5" />
    </>
  ),
  arquivos: (
    <>
      <path className="g" d="M19 30a4 4 0 0 1 4-4h12l5 5h21a4 4 0 0 1 4 4v24a4 4 0 0 1-4 4H23a4 4 0 0 1-4-4z" />
      <path className="ac" d="M34 54a8 8 0 0 1 16 0z" />
      <path className="hz" d="M27 54h30" strokeWidth="2.4" strokeLinecap="round" />
    </>
  ),
  musica: (
    <g className="gs" strokeWidth="12" strokeLinecap="round">
      <path d="M21 41 52 18" />
      <path d="M32 66 63 43" />
    </g>
  ),
  terminal: (
    <>
      <path className="acs" d="M24 31l11 10-11 10" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      <path className="gs" d="M41 53h19" strokeWidth="4.5" strokeLinecap="round" />
    </>
  ),
  notas: (
    <>
      <rect className="g" x="23" y="17" width="38" height="50" rx="7" />
      <g className="acs" strokeWidth="3" strokeLinecap="round">
        <path d="M31 31h22" />
        <path d="M31 40h22" />
        <path d="M31 49h14" />
      </g>
    </>
  ),
  loja: (
    <>
      <path className="gs" d="M34 35v-4a8 8 0 0 1 16 0v4" strokeWidth="3.6" strokeLinecap="round" />
      <path className="g" d="M23 35h38l-3 28a4 4 0 0 1-4 3.6H30a4 4 0 0 1-4-3.6z" />
      <circle className="ac" cx="42" cy="52" r="6.5" />
    </>
  ),
  ajustes: (
    <>
      <g className="gs suave" strokeWidth="3.5" strokeLinecap="round">
        <path d="M23 30h38" />
        <path d="M23 42h38" />
        <path d="M23 54h38" />
      </g>
      <circle className="g" cx="51" cy="30" r="6" />
      <circle className="ac" cx="33" cy="42" r="6" />
      <circle className="g" cx="46" cy="54" r="6" />
    </>
  ),
  monitor: (
    <>
      <path className="gs" d="M18 50h13l5-12 7 22 6-16 4 6h13" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <circle className="ac" cx="62" cy="28" r="5" />
    </>
  ),
  visualizador: (
    <>
      <circle className="ac" cx="56" cy="31" r="7.5" />
      <path className="g" d="M17 63 36 39l10 12 8-8 13 20z" />
    </>
  ),
  lixeira: (
    <g className="gs" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M27 30h30" />
      <path d="M36 30v-4h12v4" />
      <path d="M31 34l2.5 27a3 3 0 0 0 3 2.7h11a3 3 0 0 0 3-2.7L53 34" />
      <path d="M39 41v15M45 41v15" />
    </g>
  ),
  instalador: (
    <>
      <path className="g" d="M24 50a18 18 0 0 1 36 0z" />
      <g className="gs" strokeWidth="3.4" strokeLinecap="round">
        <path d="M42 20v6M24.5 27.5l4 4M59.5 27.5l-4 4M16 50h52" />
      </g>
      <path className="acs" d="M36 58l6 6 6-6M42 52v12" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
};

export function ArteApp({ id }: { id: IdArte }) {
  const u = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <svg className={`arte-app arte-${id}`} viewBox="0 0 84 84" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`f${u}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: "var(--ic-a)" }} />
          <stop offset="1" style={{ stopColor: "var(--ic-b)" }} />
        </linearGradient>
        <linearGradient id={`l${u}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff3e0" stopOpacity="0.5" />
          <stop offset="0.45" stopColor="#fff3e0" stopOpacity="0" />
          <stop offset="1" stopColor="#1c2470" stopOpacity="0.2" />
        </linearGradient>
      </defs>
      <rect width="84" height="84" rx="20" fill={`url(#f${u})`} />
      <rect className="luz" width="84" height="84" rx="20" fill={`url(#l${u})`} />
      {GLIFOS[id]}
    </svg>
  );
}

/** O ícone dentro da "pastilha" (.dock-icon) usada no dock, no Launchpad e nas listas. */
export function IconeAlba({ id, className = "" }: { id: IdArte; className?: string }) {
  return (
    <span className={`dock-icon com-arte ${className}`}>
      <ArteApp id={id} />
    </span>
  );
}
