import { useEffect, useRef, useState } from "react";
import { api, type EstadoRede, notificacoes, rede as apiRede, type Som } from "../api";
import { ouvirEventos } from "../ponte";
import { APPS, type IdApp, type Janela, dataLonga, hora, useAlba } from "../contexto";

import { Icone } from "./Icone";

/** Barra superior completa: menu do Alba à esquerda, status, data por extenso e hora à direita. */
export type Painel = "central" | "som" | "calendario" | "rede";

export function BarraSuperior({
  nomeAtivo,
  painel,
  aoPainel,
  menuAberto,
  aoMenu,
}: {
  nomeAtivo: string;
  painel: Painel | null;
  aoPainel: (qual: Painel) => void;
  /** Na casca, o menu do Alba abre na camada de painéis (a barra tem só 36px de altura). */
  menuAberto?: boolean;
  aoMenu?: () => void;
}) {
  const { agora, abrir, bloquear, energia, sistema } = useAlba();
  const [menu, setMenu] = useState(false);
  const [rede, setRede] = useState<EstadoRede | null>(null);
  const [naoLidas, setNaoLidas] = useState(0);
  const [som, setSom] = useState<Som | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const atualizar = () => {
      apiRede.estado().then(setRede).catch(() => {});
      api.som().then(setSom).catch(() => {});
    };
    atualizar();
    notificacoes.listar().then((e) => setNaoLidas(e.nao_lidas)).catch(() => {});
    const sair = ouvirEventos((m) => {
      if (m.tipo === "rede" && m.rede) setRede(m.rede);
      if ((m.tipo === "notificacao" || m.tipo === "notificacoes") && typeof m.nao_lidas === "number") setNaoLidas(m.nao_lidas);
    });
    const t = window.setInterval(atualizar, 10_000);
    return () => {
      window.clearInterval(t);
      sair();
    };
  }, []);

  useEffect(() => {
    if (!menu) return;
    const fora = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setMenu(false);
    };
    window.addEventListener("pointerdown", fora);
    return () => window.removeEventListener("pointerdown", fora);
  }, [menu]);

  const item = (rotulo: string, icone: Parameters<typeof Icone>[0]["name"], acao: () => void) => (
    <button
      role="menuitem"
      onClick={() => {
        setMenu(false);
        acao();
      }}
    >
      <Icone name={icone} size={16} /> {rotulo}
    </button>
  );

  return (
    <header className="topbar">
      <nav className="app-menu" aria-label="Menu do sistema">
        <div className="menu-alba" ref={ref}>
          <button className="brand-button" aria-label="Menu Alba" aria-expanded={menu || !!menuAberto} onClick={() => (aoMenu ? aoMenu() : setMenu(!menu))}>
            <Icone name="logo" size={19} strokeWidth={1.6} />
          </button>
          {menu && (
            <div className="menu-suspenso" role="menu">
              {item("Sobre este computador", "info", () => abrir("ajustes", { secao: "sobre" }))}
              {item("Ajustes do sistema…", "settings", () => abrir("ajustes"))}
              <hr />
              {!sistema.live && item("Bloquear tela", "lock", bloquear)}
              {item("Reiniciar…", "restart", () => energia("reiniciar"))}
              {item("Desligar…", "power", () => energia("desligar"))}
            </div>
          )}
        </div>
        <strong>{nomeAtivo}</strong>
      </nav>
      <nav className="status-menu" aria-label="Status do sistema">
        <button
          title={rede?.wifi ? `Wi-Fi: ${rede.wifi.nome}` : rede?.cabo ? "Conectado por cabo" : "Sem conexão"}
          className={`${rede?.online ? "" : "desligado"} ${painel === "rede" ? "active" : ""}`}
          aria-label="Rede"
          onClick={() => aoPainel("rede")}
        >
          <Icone name={rede?.cabo && !rede.wifi ? "ethernet" : "wifi"} size={18} />
        </button>
        {som?.disponivel && (
          <button
            title={som.mudo ? "Sem som" : `Volume ${som.volume}%`}
            className={`${som.mudo ? "desligado" : ""} ${painel === "som" ? "active" : ""}`}
            aria-label="Som"
            onClick={() => aoPainel("som")}
          >
            <Icone name={som.mudo ? "mute" : "volume"} size={18} />
          </button>
        )}
        <button className={painel === "central" ? "active" : ""} aria-label="Central de controle" onClick={() => aoPainel("central")}>
          <Icone name="control" size={20} />
        </button>
        <button className={`date-time ${painel === "calendario" ? "active" : ""}`} aria-label="Calendário" onClick={() => aoPainel("calendario")}>
          <span>{dataLonga(agora)}</span> {hora(agora)}
          {naoLidas > 0 && painel !== "calendario" && <i className="selo-notificacao" aria-label={`${naoLidas} notificações novas`} />}
        </button>
      </nav>
    </header>
  );
}

/** Dock com os apps do Alba; o ponto indica app aberto. */
export function Dock({
  janelas,
  aoClicar,
  live,
}: {
  janelas: Janela[];
  aoClicar: (app: IdApp | "lixeira") => void;
  live: boolean;
}) {
  const ordem: IdApp[] = ["arquivos", "musica", "terminal", "notas", "ajustes"];
  if (live) ordem.push("instalador");
  const aberto = (app: IdApp) => janelas.some((j) => j.app === app);
  return (
    <nav className="dock" aria-label="Aplicativos">
      {ordem.map((app) => (
        <button key={app} className={aberto(app) ? "running" : ""} onClick={() => aoClicar(app)} data-label={APPS[app].nome}>
          <span className={`dock-icon ${APPS[app].classe}`}>
            {app === "musica" ? <MarcaSleeve /> : <Icone name={APPS[app].icone} size={27} />}
          </span>
        </button>
      ))}
      <span className="dock-divider" />
      <button data-label="Lixeira" onClick={() => aoClicar("lixeira")}>
        <span className="dock-icon trash">
          <Icone name="trash" size={26} />
        </span>
      </button>
    </nav>
  );
}

/** Marca do Sleeve (duas linhas paralelas), para o ícone no dock. */
export function MarcaSleeve() {
  return (
    <svg viewBox="0 0 120 120" width="30" height="30" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="17" strokeLinecap="round">
        <line x1="30.2" y1="58.6" x2="74.2" y2="25.6" />
        <line x1="45.8" y1="94.4" x2="89.8" y2="61.4" />
      </g>
    </svg>
  );
}
