import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconeAlba } from "./componentes/ArteApps";
import { api, type Config, type Notificacao, type Sistema } from "./api";
import { coresDoHorario, faseDoDia } from "./horario";
import { CaixaDialogo, Papel, type Dialogo } from "./Alba";
import { APPS, listaDock, CtxAlba, type Contexto, type IdApp, useAlba } from "./contexto";
import { appAvulso, daCasca, ouvirEventos, paraCasca, propsIniciais, publicarEvento, superficie } from "./ponte";
import { Ajustes } from "./apps/Ajustes";
import { Arquivos } from "./apps/Arquivos";
import { Instalador } from "./apps/Instalador";
import { Loja } from "./apps/Loja";
import { Monitor } from "./apps/Monitor";
import { Musica, type Tocando } from "./apps/Musica";
import { Notas, Visualizador } from "./apps/Notas";
import { Terminal } from "./apps/Terminal";
import { BarraSuperior, type Painel } from "./componentes/Barra";
import { Central } from "./componentes/Central";
import { Icone } from "./componentes/Icone";
import { CartaoNotificacao, CentralNotificacoes } from "./componentes/Notificacoes";
import { PainelRede } from "./componentes/PainelRede";
import { Alternador, type JanelaAlt } from "./componentes/Alternador";
import { Busca } from "./componentes/Busca";
import { type AppLista, Launchpad } from "./componentes/Launchpad";
import { PainelCalendario, PainelSom } from "./componentes/Paineis";
import { TelaBloqueio } from "./componentes/TelaBloqueio";

type ItemDock = {
  chave: string;
  tipo: "alba" | "externo";
  app?: IdApp;
  desktop?: string;
  nome: string;
  icone?: string | null;
  /** Identificador para fixar no dock (app do Alba ou arquivo .desktop); null = não dá para fixar. */
  fixar?: string | null;
  janelas: number[];
  ativa: boolean;
};
type EstadoJanelas = { itens: ItemDock[]; extras: ItemDock[]; ativa: { titulo: string; app: string } | null; live: boolean };
type PainelCasca = Painel | "menu" | "dock";
type MenuDockDados = { item: ItemDock & { fixo: boolean }; x: number };

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
  const [avisos, setAvisos] = useState<{ id: number; texto: string; notificacao?: Notificacao }[]>([]);
  const caixaAvisos = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const nome = superficie || appAvulso;
    console.log(`[alba ${nome}] iniciando ${innerWidth}x${innerHeight}`);
    window.addEventListener("error", (e) => console.log(`[alba ${nome}] erro: ${e.message} ${e.filename}:${e.lineno}`));
    Promise.all([api.sistema(), api.config()])
      .then(([s, c]) => {
        console.log(`[alba ${nome}] sistema carregado`);
        setSistema(s);
        setConfig(c.config);
      })
      .catch((e) => {
        console.log(`[alba ${nome}] falhou: ${e.message}`);
        setErro(e.message);
      });
    const t = window.setInterval(() => setAgora(new Date()), 5000);
    const sair = ouvirEventos((m) => {
      if (m.tipo === "config" && m.config) {
        setConfig(m.config);
        if (superficie === "barra" || appAvulso) paraCasca({ tipo: "escala" });
      } else if (m.tipo === "notificacao" && superficie === "sobre" && m.mostrar && m.notificacao) {
        const n = m.notificacao as Notificacao;
        const id = Date.now() + Math.random();
        setAvisos((a) => [...a.slice(-3), { id, texto: n.titulo, notificacao: n }]);
        window.setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), 6000);
      } else if (m.tipo === "aviso" && superficie === "sobre" && m.texto) {
        aviso(String(m.texto)); // avisos do sistema (ex.: captura de tela) aparecem por cima de tudo
      } else if (m.tipo === "tocando") {
        setTocando(m.dados ?? null);
      } else if (superficie === "barra" && (m.tipo === "bloquear" || m.tipo === "painel" || m.tipo === "abrir" || m.tipo === "item" || m.tipo === "lancar" || m.tipo === "launchpad" || m.tipo === "alternar" || m.tipo === "busca" || m.tipo === "fecharSobre" || m.tipo === "ativar-app" || m.tipo === "menuDock" || m.tipo === "desbloquear-teste")) {
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

  // Caixa de diálogo na camada de cima (ex.: "Reiniciar o computador?"): a camada precisa receber
  // cliques enquanto ela estiver aberta, mesmo que o menu que a abriu já tenha fechado.
  useEffect(() => {
    if (superficie === "sobre") paraCasca({ tipo: "dialogo", aberto: !!dialogo });
  }, [!!dialogo]);

  // Na camada de cima, os avisos de notificação recebem cliques (o resto da tela continua livre).
  useEffect(() => {
    if (superficie !== "sobre") return;
    const id = window.requestAnimationFrame(() => {
      const el = caixaAvisos.current;
      if (!el || !avisos.length) return paraCasca({ tipo: "regiaoAvisos", r: null });
      const r = el.getBoundingClientRect();
      paraCasca({ tipo: "regiaoAvisos", r: { x: r.left, y: r.top, l: r.width, a: r.height } });
    });
    return () => window.cancelAnimationFrame(id);
  }, [avisos]);

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
    (o: { titulo: string; texto?: string; valor?: string; ok?: string; senha?: boolean; perigo?: boolean }) =>
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
        style={coresDoHorario(config, agora)}
        data-fase={faseDoDia(agora)}
      >
        {superficie === "fundo" && <Papel />}
        {superficie === "barra" && <Barra />}
        {superficie === "dock" && <DockCasca />}
        {superficie === "sobre" && <Sobre />}
        {!superficie && appAvulso && <AppAvulso app={appAvulso as IdApp} />}
        <div className="avisos" aria-live="polite" ref={caixaAvisos}>
          {avisos.map((a) =>
            a.notificacao ? (
              <div key={a.id} className="aviso aviso-notificacao">
                <CartaoNotificacao
                  n={{ ...a.notificacao, lida: true }}
                  aoFechar={() => setAvisos((x) => x.filter((y) => y.id !== a.id))}
                  aoAbrir={() => setAvisos((x) => x.filter((y) => y.id !== a.id))}
                />
              </div>
            ) : (
              <div key={a.id} className="aviso">
                {a.texto}
              </div>
            ),
          )}
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
    return <IconeAlba id={item.app} />;
  }
  return <span className="dock-icon externo">{item.icone ? <img src={item.icone} alt="" draggable={false} /> : <Icone name="globe" size={26} />}</span>;
}

function DockCasca() {
  const { estado } = useEstadoJanelas();
  const { config, mudarConfig } = useAlba();
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

  // Arrastar: muda a ordem dos fixos; um app aberto (não fixo) arrastado para junto deles fica
  // fixo; um fixo arrastado para cima, para fora do dock, sai do dock.
  type Arraste = { item: ItemDock; fixo: boolean; x0: number; y0: number; ativo: boolean; fora: boolean; alvo: number | null };
  const [arraste, setArraste] = useState<Arraste | null>(null);
  const arrasteRef = useRef<Arraste | null>(null);
  const acabouDeArrastar = useRef(false);
  const atualizar = (a: Arraste | null) => {
    arrasteRef.current = a;
    setArraste(a);
  };

  const itens = estado?.itens ?? [];
  const extras = estado?.extras ?? [];
  const fixosIds = itens.map((i) => i.fixar || i.chave);

  function alvoNoDock(x: number, y: number, a: Arraste): number | null {
    const el = nav.current;
    if (!el) return null;
    const outros = [...el.querySelectorAll<HTMLElement>("[data-fixo]")].filter((b) => b.dataset.fixo !== (a.item.fixar || a.item.chave));
    const limite = outros.length ? outros[outros.length - 1].getBoundingClientRect().right + 34 : el.getBoundingClientRect().left + 120;
    if (!a.fixo && x > limite) return null; // ainda na parte dos apps abertos
    if (y < el.getBoundingClientRect().top - 40) return null;
    return outros.filter((b) => {
      const r = b.getBoundingClientRect();
      return r.left + r.width / 2 < x;
    }).length;
  }

  function inicio(e: React.PointerEvent<HTMLButtonElement>, item: ItemDock, fixo: boolean) {
    if (e.button !== 0 || (!fixo && !item.fixar)) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    atualizar({ item, fixo, x0: e.clientX, y0: e.clientY, ativo: false, fora: false, alvo: null });
  }

  function mover(e: React.PointerEvent<HTMLButtonElement>) {
    const a = arrasteRef.current;
    if (!a) return;
    const dx = e.clientX - a.x0;
    const dy = e.clientY - a.y0;
    if (!a.ativo && Math.hypot(dx, dy) < 7) return;
    const fora = a.fixo && dy < -55;
    atualizar({ ...a, ativo: true, fora, alvo: fora ? null : alvoNoDock(e.clientX, e.clientY, a) });
  }

  function soltar() {
    const a = arrasteRef.current;
    atualizar(null);
    if (!a?.ativo) return;
    acabouDeArrastar.current = true;
    window.setTimeout(() => (acabouDeArrastar.current = false), 50);
    const id = a.item.fixar || a.item.chave;
    const sem = fixosIds.filter((f) => f !== id);
    if (a.fora) {
      mudarConfig({ dock: sem });
    } else if (a.alvo !== null) {
      const nova = [...sem.slice(0, a.alvo), id, ...sem.slice(a.alvo)];
      if (nova.join("|") !== fixosIds.join("|")) mudarConfig({ dock: nova });
    }
  }

  // Prévia da nova ordem enquanto arrasta.
  let fixosVisiveis = itens;
  let extrasVisiveis = extras;
  if (arraste?.ativo) {
    const arrastado = arraste.item;
    const sem = itens.filter((i) => i.chave !== arrastado.chave);
    if (arraste.alvo !== null) {
      fixosVisiveis = [...sem.slice(0, arraste.alvo), arrastado, ...sem.slice(arraste.alvo)];
      if (!arraste.fixo) extrasVisiveis = extras.filter((i) => i.chave !== arrastado.chave);
    }
  }

  function menu(e: React.MouseEvent<HTMLButtonElement>, item: ItemDock, fixo: boolean) {
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    paraCasca({ tipo: "menuDock", item: { ...item, fixo }, x: r.left + r.width / 2 });
  }

  const botao = (item: ItemDock, fixo: boolean) => {
    const meu = arraste?.ativo && arraste.item.chave === item.chave;
    return (
      <button
        key={item.chave}
        data-fixo={fixo ? item.fixar || item.chave : undefined}
        className={`${item.janelas.length ? "running" : ""} ${item.ativa ? "ativo" : ""} ${meu ? "arrastando" : ""} ${meu && arraste?.fora ? "saindo" : ""}`}
        data-label={meu && arraste?.fora ? "Tirar do dock" : item.nome}
        onPointerDown={(e) => inicio(e, item, fixo)}
        onPointerMove={mover}
        onPointerUp={soltar}
        onPointerCancel={() => atualizar(null)}
        onContextMenu={(e) => menu(e, item, fixo)}
        onClick={() => !acabouDeArrastar.current && paraCasca({ tipo: "item", chave: item.chave })}
      >
        <IconeItem item={item} />
      </button>
    );
  };
  void config;
  return (
    <nav className={`dock ${arraste?.ativo ? "em-arraste" : ""}`} aria-label="Aplicativos" ref={nav}>
      <button data-label="Aplicativos" onClick={() => paraCasca({ tipo: "launchpad" })}>
        <IconeAlba id="apps" />
      </button>
      {fixosVisiveis.map((i) => botao(i, itens.includes(i) || (arraste?.alvo != null && i.chave === arraste.item.chave)))}
      {extrasVisiveis.length > 0 && <span className="dock-divider" />}
      {extrasVisiveis.map((i) => botao(i, false))}
      <span className="dock-divider" />
      <button data-label="Lixeira" onClick={() => paraCasca({ tipo: "abrir", app: "arquivos", props: { inicial: "lixeira" } })}>
        <IconeAlba id="lixeira" />
      </button>
    </nav>
  );
}

/** Menu do clique direito num ícone do dock (aparece na camada de cima). */
function MenuDock({ dados, fechar }: { dados: MenuDockDados; fechar: () => void }) {
  const { config, mudarConfig } = useAlba();
  const { item, x } = dados;
  const lista = listaDock(config);
  const acao = (rotulo: string, icone: Parameters<typeof Icone>[0]["name"], fazer: () => void, perigo = false) => (
    <button
      role="menuitem"
      className={perigo ? "perigo" : ""}
      onClick={() => {
        fechar();
        fazer();
      }}
    >
      <Icone name={icone} size={15} /> {rotulo}
    </button>
  );
  const largura = 210;
  const esquerda = Math.min(Math.max(8, x - largura / 2), window.innerWidth - largura - 8);
  return (
    <div className="menu-suspenso menu-dock" role="menu" style={{ left: esquerda, width: largura }} onPointerDown={(e) => e.stopPropagation()}>
      <span className="menu-dock-titulo">{item.nome}</span>
      {acao(item.janelas.length ? "Mostrar" : "Abrir", "chevron", () => paraCasca({ tipo: "item", chave: item.chave }))}
      {item.fixar &&
        (lista.includes(item.fixar)
          ? acao("Tirar do dock", "pin", () => mudarConfig({ dock: lista.filter((f) => f !== item.fixar) }))
          : acao("Manter no dock", "pin", () => mudarConfig({ dock: [...lista, item.fixar!] })))}
      {item.janelas.length > 0 && <hr />}
      {item.janelas.length > 0 &&
        acao(
          item.janelas.length > 1 ? `Fechar ${item.janelas.length} janelas` : "Fechar",
          "close",
          () => item.janelas.forEach((id) => paraCasca({ tipo: "janela", acao: "fechar", id })),
          true,
        )}
    </div>
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
  const [modo, setModo] = useState<{ modo: "bloqueio" | "painel" | "launchpad" | "alternar" | "busca" | null; qual?: PainelCasca }>({ modo: null });
  const [apps, setApps] = useState<AppLista[]>([]);
  const [alt, setAlt] = useState<{ janelas: JanelaAlt[]; inicial: number; vez: number } | null>(null);
  const [vez, setVez] = useState(0);
  const [menuDock, setMenuDock] = useState<MenuDockDados | null>(null);
  useEffect(
    () =>
      daCasca((m) => {
        if (m.tipo === "modo") {
          setModo({ modo: m.modo, qual: m.qual });
          if (m.modo === "launchpad" || m.modo === "busca") setVez((v) => v + 1);
        } else if (m.tipo === "apps") setApps(m.apps || []);
        else if (m.tipo === "menuDock" && m.item) setMenuDock({ item: m.item, x: Number(m.x) || 0 });
        else if (m.tipo === "alternarLista") setAlt({ janelas: m.janelas || [], inicial: m.selecionada ?? 1, vez: Date.now() });
      }),
    [],
  );
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
  if (modo.modo === "launchpad")
    return (
      <>
        <div className="launchpad-papel">
          <Papel />
        </div>
        <Launchpad
          key={vez}
          apps={apps}
          fechar={fechar}
          abrir={(a) =>
            a.tipo === "alba" && a.app ? paraCasca({ tipo: "abrir", app: a.app }) : paraCasca({ tipo: "lancar", desktop: a.desktop })
          }
        />
      </>
    );
  if (modo.modo === "alternar" && alt) return <Alternador key={alt.vez} janelas={alt.janelas} inicial={alt.inicial} />;
  if (modo.modo === "busca") return <Busca key={vez} apps={apps} fechar={fechar} />;
  if (modo.modo !== "painel" || modo.qual === ("dialogo" as PainelCasca)) return null;
  if (modo.qual === "dock")
    return (
      <section className="sobre-fundo" onPointerDown={(e) => e.target === e.currentTarget && fechar()} onContextMenu={(e) => (e.preventDefault(), fechar())}>
        {menuDock && <MenuDock dados={menuDock} fechar={fechar} />}
      </section>
    );
  return (
    <section className="sobre-fundo" onPointerDown={(e) => e.target === e.currentTarget && fechar()}>
      <div className={`sobre-painel sobre-${modo.qual}`} onPointerDown={(e) => e.stopPropagation()}>
        {modo.qual === "central" && <Central fechar={fechar} />}
        {modo.qual === "som" && <PainelSom />}
        {modo.qual === "calendario" && (
          <div className="coluna-paineis">
            <CentralNotificacoes fechar={fechar} />
            <PainelCalendario />
          </div>
        )}
        {modo.qual === "rede" && <PainelRede />}
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
      if (m.tipo === "props") setProps((p) => ({ ...p, ...m.props, _vez: Date.now() }));
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
      conteudo = <Ajustes secao={props.secao} vez={props._vez} app={props.app} />;
      break;
    case "loja":
      conteudo = <Loja abrirApp={props.app} vez={props._vez} />;
      break;
    case "monitor":
      conteudo = <Monitor key={props._vez} abaInicial={props.aba} />;
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
