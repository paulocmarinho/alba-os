import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type Config, type Sistema } from "./api";
import { CaixaDialogo, Papel, type Dialogo } from "./Alba";
import { APPS, CtxAlba, type Contexto, type IdApp, useAlba } from "./contexto";
import { appAvulso, daCasca, ouvirEventos, paraCasca, propsIniciais, publicarEvento, superficie } from "./ponte";
import { Ajustes } from "./apps/Ajustes";
import { Arquivos } from "./apps/Arquivos";
import { Instalador } from "./apps/Instalador";
import { Musica, type Tocando } from "./apps/Musica";
import { Notas, Visualizador } from "./apps/Notas";
import { Terminal } from "./apps/Terminal";
import { BarraSuperior, MarcaSleeve, type Painel } from "./componentes/Barra";
import { Central } from "./componentes/Central";
import { Icone } from "./componentes/Icone";
import { PainelCalendario, PainelSom } from "./componentes/Paineis";
import { TelaBloqueio } from "./componentes/TelaBloqueio";

type ItemDock = {
  chave: string;
  tipo: "alba" | "externo";
  app?: IdApp;
  desktop?: string;
  nome: string;
  icone?: string | null;
  janelas: number[];
  ativa: boolean;
};
type EstadoJanelas = { itens: ItemDock[]; extras: ItemDock[]; ativa: { titulo: string; app: string } | null; live: boolean };
type PainelCasca = Painel | "menu";

/**
 * O Alba dentro do compositor: cada página é uma parte (fundo, barra, dock, painéis)
 * ou um app sozinho numa janela de verdade.
 */
export function AlbaCasca() {
  const [sistema, setSistema] = useState<Sistema | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [erro, setErro] = useState("");
  const [agora, setAgora] = useState(new Date());
  const [dialogo, setDialogo] = useState<Dialogo | null>(null);
  const [tocando, setTocando] = useState<Tocando | null>(null);
  const [avisos, setAvisos] = useState<{ id: number; texto: string }[]>([]);

  useEffect(() => {
    Promise.all([api.sistema(), api.config()])
      .then(([s, c]) => {
        setSistema(s);
        setConfig(c.config);
      })
      .catch((e) => setErro(e.message));
    const t = window.setInterval(() => setAgora(new Date()), 5000);
    const sair = ouvirEventos((m) => {
      if (m.tipo === "config" && m.config) {
        setConfig(m.config);
        if (superficie === "barra" || appAvulso) paraCasca({ tipo: "escala" });
      } else if (m.tipo === "tocando") {
        setTocando(m.dados ?? null);
      } else if (superficie === "barra" && (m.tipo === "bloquear" || m.tipo === "painel" || m.tipo === "abrir" || m.tipo === "item")) {
        paraCasca(m); // atalhos de teclado e scripts chegam pelo servidor e a barra repassa à casca
      }
    });
    return () => {
      window.clearInterval(t);
      sair();
    };
  }, []);

  useEffect(() => {
    if (sistema && config) paraCasca({ tipo: "pronto" });
  }, [!!sistema && !!config]);

  const aviso = useCallback((texto: string) => {
    const id = Date.now() + Math.random();
    setAvisos((a) => [...a, { id, texto }]);
    window.setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), 3500);
  }, []);
  const confirmar = useCallback(
    (o: { titulo: string; texto?: string; ok?: string; perigo?: boolean }) =>
      new Promise<boolean>((resolver) => setDialogo({ tipo: "confirmar", ...o, resolver })),
    [],
  );
  const perguntar = useCallback(
    (o: { titulo: string; texto?: string; valor?: string; ok?: string }) =>
      new Promise<string | null>((resolver) => setDialogo({ tipo: "perguntar", ...o, resolver })),
    [],
  );
  const mudarConfig = useCallback(
    async (mudancas: Partial<Config>) => {
      setConfig((c) => (c ? { ...c, ...mudancas } : c));
      try {
        setConfig((await api.gravarConfig(mudancas)).config);
      } catch (e: any) {
        aviso(e.message);
      }
    },
    [aviso],
  );
  const energia = useCallback(
    async (acao: "desligar" | "reiniciar") => {
      const ok = await confirmar({
        titulo: acao === "desligar" ? "Desligar o computador?" : "Reiniciar o computador?",
        texto: "Salve o que estiver aberto antes de continuar.",
        ok: acao === "desligar" ? "Desligar" : "Reiniciar",
        perigo: acao === "desligar",
      });
      if (ok) api.energia(acao).catch((e) => aviso(e.message));
    },
    [confirmar, aviso],
  );
  const definirTocando = useCallback((t: Tocando | null) => {
    setTocando(t);
    publicarEvento({ tipo: "tocando", dados: t });
    paraCasca({ tipo: "tocando", tocando: !!t?.tocando });
  }, []);

  const ctx: Contexto | null = useMemo(
    () =>
      sistema && config
        ? {
            sistema,
            config,
            agora,
            mudarConfig,
            abrir: (app: IdApp, props: Record<string, any> = {}) => paraCasca({ tipo: "abrir", app, props }),
            fechar: () => paraCasca({ tipo: "fechar" }),
            renomearJanela: (_id: number, titulo: string) => {
              document.title = titulo;
            },
            aviso,
            confirmar,
            perguntar,
            bloquear: () => (superficie ? paraCasca({ tipo: "bloquear" }) : publicarEvento({ tipo: "bloquear" })),
            energia,
            tocando,
            definirTocando,
          }
        : null,
    [sistema, config, agora, mudarConfig, aviso, confirmar, perguntar, energia, tocando, definirTocando],
  );

  if (erro)
    return (
      <main className="desktop casca casca-erro">
        <p>O Alba não conseguiu falar com o sistema: {erro}</p>
      </main>
    );
  if (!ctx || !config) return <main className="desktop casca" />;

  const escuro = config.tema === "escuro";
  return (
    <CtxAlba.Provider value={ctx}>
      <main
        className={`desktop casca casca-${superficie || "app"} ${escuro ? "dark" : ""}`}
        style={{ "--destaque": config.destaque } as React.CSSProperties}
      >
        {superficie === "fundo" && <Papel />}
        {superficie === "barra" && <Barra />}
        {superficie === "dock" && <DockCasca />}
        {superficie === "sobre" && <Sobre />}
        {!superficie && appAvulso && <AppAvulso app={appAvulso as IdApp} />}
        <div className="avisos" aria-live="polite">
          {avisos.map((a) => (
            <div key={a.id} className="aviso">
              {a.texto}
            </div>
          ))}
        </div>
        {dialogo && <CaixaDialogo d={dialogo} fechar={() => setDialogo(null)} />}
      </main>
    </CtxAlba.Provider>
  );
}

function useEstadoJanelas() {
  const [estado, setEstado] = useState<EstadoJanelas | null>(null);
  const [painel, setPainel] = useState<PainelCasca | null>(null);
  useEffect(
    () =>
      daCasca((m) => {
        if (m.tipo === "janelas") setEstado(m);
        else if (m.tipo === "painel") setPainel(m.qual ?? null);
      }),
    [],
  );
  return { estado, painel };
}

function Barra() {
  const { estado, painel } = useEstadoJanelas();
  return (
    <BarraSuperior
      nomeAtivo={estado?.ativa?.app || "Alba"}
      painel={painel as Painel | null}
      menuAberto={painel === "menu"}
      aoPainel={(qual) => paraCasca({ tipo: "painel", qual })}
      aoMenu={() => paraCasca({ tipo: "painel", qual: "menu" })}
    />
  );
}

function IconeItem({ item }: { item: ItemDock }) {
  if (item.tipo === "alba" && item.app && APPS[item.app]) {
    return <span className={`dock-icon ${APPS[item.app].classe}`}>{item.app === "musica" ? <MarcaSleeve /> : <Icone name={APPS[item.app].icone} size={27} />}</span>;
  }
  return <span className="dock-icon externo">{item.icone ? <img src={item.icone} alt="" draggable={false} /> : <Icone name="globe" size={26} />}</span>;
}

function DockCasca() {
  const { estado } = useEstadoJanelas();
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = nav.current;
    if (!el) return;
    const informar = () => {
      const r = el.getBoundingClientRect();
      paraCasca({ tipo: "regiao", x: r.left - 4, y: r.top - 14, l: r.width + 8, a: r.height + 18 });
    };
    const obs = new ResizeObserver(informar);
    obs.observe(el);
    informar();
    window.addEventListener("resize", informar);
    return () => {
      obs.disconnect();
      window.removeEventListener("resize", informar);
    };
  }, [estado]);
  const itens = estado?.itens ?? [];
  const extras = estado?.extras ?? [];
  const botao = (item: ItemDock) => (
    <button
      key={item.chave}
      className={`${item.janelas.length ? "running" : ""} ${item.ativa ? "ativo" : ""}`}
      data-label={item.nome}
      onClick={() => paraCasca({ tipo: "item", chave: item.chave })}
    >
      <IconeItem item={item} />
    </button>
  );
  return (
    <nav className="dock" aria-label="Aplicativos" ref={nav}>
      {itens.map(botao)}
      {extras.length > 0 && <span className="dock-divider" />}
      {extras.map(botao)}
      <span className="dock-divider" />
      <button data-label="Lixeira" onClick={() => paraCasca({ tipo: "abrir", app: "arquivos", props: { inicial: "lixeira" } })}>
        <span className="dock-icon trash">
          <Icone name="trash" size={26} />
        </span>
      </button>
    </nav>
  );
}

function MenuAlba({ fechar }: { fechar: () => void }) {
  const { abrir, bloquear, energia, sistema } = useAlba();
  const item = (rotulo: string, icone: Parameters<typeof Icone>[0]["name"], acao: () => void) => (
    <button
      role="menuitem"
      onClick={() => {
        fechar();
        acao();
      }}
    >
      <Icone name={icone} size={16} /> {rotulo}
    </button>
  );
  return (
    <div className="menu-suspenso menu-casca" role="menu" onPointerDown={(e) => e.stopPropagation()}>
      {item("Sobre este computador", "info", () => abrir("ajustes", { secao: "sobre" }))}
      {item("Ajustes do sistema…", "settings", () => abrir("ajustes"))}
      <hr />
      {!sistema.live && item("Bloquear tela", "lock", bloquear)}
      {item("Reiniciar…", "restart", () => energia("reiniciar"))}
      {item("Desligar…", "power", () => energia("desligar"))}
    </div>
  );
}

function Sobre() {
  const [modo, setModo] = useState<{ modo: "bloqueio" | "painel" | null; qual?: PainelCasca }>({ modo: null });
  useEffect(() => daCasca((m) => m.tipo === "modo" && setModo({ modo: m.modo, qual: m.qual })), []);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && modo.modo === "painel" && paraCasca({ tipo: "fecharSobre" });
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [modo]);
  const fechar = () => paraCasca({ tipo: "fecharSobre" });
  if (modo.modo === "bloqueio")
    return (
      <>
        <Papel />
        <TelaBloqueio aoDesbloquear={() => paraCasca({ tipo: "desbloqueado" })} />
      </>
    );
  if (modo.modo !== "painel") return null;
  return (
    <section className="sobre-fundo" onPointerDown={(e) => e.target === e.currentTarget && fechar()}>
      <div className={`sobre-painel sobre-${modo.qual}`} onPointerDown={(e) => e.stopPropagation()}>
        {modo.qual === "central" && <Central fechar={fechar} />}
        {modo.qual === "som" && <PainelSom />}
        {modo.qual === "calendario" && <PainelCalendario />}
        {modo.qual === "menu" && <MenuAlba fechar={fechar} />}
      </div>
    </section>
  );
}

function AppAvulso({ app }: { app: IdApp }) {
  const [props, setProps] = useState<Record<string, any>>(propsIniciais);
  useEffect(() => {
    document.title = APPS[app]?.nome || "Alba";
    return daCasca((m) => {
      if (m.tipo === "props") setProps((p) => ({ ...p, ...m.props }));
    });
  }, [app]);
  if (!APPS[app]) return <p className="casca-erro">App desconhecido: {app}</p>;
  let conteudo: React.ReactNode = null;
  switch (app) {
    case "arquivos":
      conteudo = <Arquivos inicial={props.inicial} idJanela={1} />;
      break;
    case "terminal":
      conteudo = <Terminal ativo />;
      break;
    case "notas":
      conteudo = <Notas caminho={props.caminho} idJanela={1} />;
      break;
    case "visualizador":
      conteudo = <Visualizador caminho={props.caminho} />;
      break;
    case "ajustes":
      conteudo = <Ajustes secao={props.secao} />;
      break;
    case "instalador":
      conteudo = <Instalador />;
      break;
    case "musica":
      conteudo = <Musica abrir={props.abrir} controle={null} />;
      break;
  }
  return (
    <article className={`window janela avulsa ativa ${app === "terminal" ? "terminal-window janela-terminal" : `janela-${app}`} ${APPS[app].semMoldura ? "sem-moldura" : ""}`}>
      <div className="janela-conteudo">{conteudo}</div>
    </article>
  );
}
