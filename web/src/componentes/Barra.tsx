import { useEffect, useRef, useState } from "react";
import { api, type Rede, type Som } from "../api";
import { APPS, type IdApp, type Janela, dataLonga, hora, useLumen } from "../contexto";
import { Icone } from "./Icone";

/** Barra superior completa: menu do Lúmen à esquerda, status, data por extenso e hora à direita. */
export function BarraSuperior({
  janelaAtiva,
  centralAberta,
  alternarCentral,
}: {
  janelaAtiva: Janela | null;
  centralAberta: boolean;
  alternarCentral: () => void;
}) {
  const { agora, abrir, bloquear, energia, sistema } = useLumen();
  const [menu, setMenu] = useState(false);
  const [rede, setRede] = useState<Rede | null>(null);
  const [som, setSom] = useState<Som | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const atualizar = () => {
      api.rede().then(setRede).catch(() => {});
      api.som().then(setSom).catch(() => {});
    };
    atualizar();
    const t = window.setInterval(atualizar, 10_000);
    return () => window.clearInterval(t);
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
        <div className="menu-lumen" ref={ref}>
          <button className="brand-button" aria-label="Menu Lúmen" aria-expanded={menu} onClick={() => setMenu(!menu)}>
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
        <strong>{janelaAtiva ? APPS[janelaAtiva.app].nome : "Lúmen"}</strong>
      </nav>
      <nav className="status-menu" aria-label="Status do sistema">
        <span title={rede?.online ? "Conectado" : "Sem conexão"} className={rede?.online ? "" : "desligado"}>
          <Icone name="wifi" size={18} />
        </span>
        {som?.disponivel && (
          <span title={som.mudo ? "Sem som" : `Volume ${som.volume}%`} className={som.mudo ? "desligado" : ""}>
            <Icone name="volume" size={18} />
          </span>
        )}
        <button className={centralAberta ? "active" : ""} aria-label="Central de controle" onClick={alternarCentral}>
          <Icone name="control" size={20} />
        </button>
        <strong className="date-time">
          <span>{dataLonga(agora)}</span> {hora(agora)}
        </strong>
      </nav>
    </header>
  );
}

/** Dock com os apps do Lúmen; o ponto indica app aberto. */
export function Dock({
  janelas,
  aoClicar,
  live,
}: {
  janelas: Janela[];
  aoClicar: (app: IdApp | "lixeira") => void;
  live: boolean;
}) {
  const ordem: IdApp[] = ["arquivos", "terminal", "notas", "ajustes"];
  if (live) ordem.push("instalador");
  const aberto = (app: IdApp) => janelas.some((j) => j.app === app);
  return (
    <nav className="dock" aria-label="Aplicativos">
      {ordem.map((app) => (
        <button key={app} className={aberto(app) ? "running" : ""} onClick={() => aoClicar(app)} data-label={APPS[app].nome}>
          <span className={`dock-icon ${APPS[app].classe}`}>
            <Icone name={APPS[app].icone} size={27} />
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
