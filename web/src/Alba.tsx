import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type Config, type Sistema } from "./api";
import { alturaTela, definirEscala, larguraTela } from "./escala";
import { APPS, CtxAlba, type Contexto, type IdApp, type Janela as DadosJanela } from "./contexto";
import { Ajustes } from "./apps/Ajustes";
import { Arquivos } from "./apps/Arquivos";
import { Instalador } from "./apps/Instalador";
import { Notas, Visualizador } from "./apps/Notas";
import { Musica, type Tocando } from "./apps/Musica";
import { Terminal } from "./apps/Terminal";
import { BarraSuperior, Dock } from "./componentes/Barra";
import { Central } from "./componentes/Central";
import { Icone } from "./componentes/Icone";
import { Janela } from "./componentes/Janela";
import { TelaBloqueio } from "./componentes/TelaBloqueio";

type Dialogo =
  | { tipo: "confirmar"; titulo: string; texto?: string; ok?: string; perigo?: boolean; resolver: (v: boolean) => void }
  | { tipo: "perguntar"; titulo: string; texto?: string; valor?: string; ok?: string; resolver: (v: string | null) => void };

function Papel() {
  return (
    <div className="wallpaper" aria-hidden="true">
      <span className="forma forma-1" />
      <span className="forma forma-2" />
      <span className="forma forma-3" />
      <span className="brilho" />
      <span className="grain" />
    </div>
  );
}

function CaixaDialogo({ d, fechar }: { d: Dialogo; fechar: () => void }) {
  const [valor, setValor] = useState(d.tipo === "perguntar" ? d.valor ?? "" : "");
  const campo = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (d.tipo === "perguntar") {
      campo.current?.focus();
      campo.current?.select();
    }
  }, [d]);
  const cancelar = () => {
    if (d.tipo === "confirmar") d.resolver(false);
    else d.resolver(null);
    fechar();
  };
  const confirmar = () => {
    if (d.tipo === "confirmar") d.resolver(true);
    else d.resolver(valor.trim() || null);
    fechar();
  };
  return (
    <div className="fundo-dialogo" onPointerDown={cancelar}>
      <form
        className="dialogo"
        role="dialog"
        aria-modal="true"
        aria-label={d.titulo}
        onPointerDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          confirmar();
        }}
        onKeyDown={(e) => e.key === "Escape" && cancelar()}
      >
        <h2>{d.titulo}</h2>
        {d.texto && <p>{d.texto}</p>}
        {d.tipo === "perguntar" && <input ref={campo} value={valor} onChange={(e) => setValor(e.target.value)} aria-label={d.titulo} />}
        <div className="dialogo-acoes">
          <button type="button" onClick={cancelar} autoFocus={d.tipo === "confirmar"}>
            Cancelar
          </button>
          <button type="submit" className={`primario ${d.tipo === "confirmar" && d.perigo ? "perigo" : ""}`}>
            {d.ok || "OK"}
          </button>
        </div>
      </form>
    </div>
  );
}

export function Alba() {
  const [sistema, setSistema] = useState<Sistema | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [erro, setErro] = useState("");
  const [bloqueado, setBloqueado] = useState(true);
  const [agora, setAgora] = useState(new Date());
  const [janelas, setJanelas] = useState<DadosJanela[]>([]);
  const [central, setCentral] = useState(false);
  const [dialogo, setDialogo] = useState<Dialogo | null>(null);
  const [tocando, definirTocando] = useState<Tocando | null>(null);
  const [avisos, setAvisos] = useState<{ id: number; texto: string }[]>([]);
  const proximoId = useRef(1);
  const proximoZ = useRef(10);

  useEffect(() => {
    Promise.all([api.sistema(), api.config()])
      .then(([s, c]) => {
        setSistema(s);
        setConfig(c.config);
        if (s.live) setBloqueado(false);
      })
      .catch((e) => setErro(e.message));
    const t = window.setInterval(() => setAgora(new Date()), 5000);
    return () => window.clearInterval(t);
  }, []);

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

  const focar = useCallback((id: number) => {
    setJanelas((js) => js.map((j) => (j.id === id ? { ...j, z: ++proximoZ.current, minimizada: false } : j)));
  }, []);

  const abrir = useCallback((app: IdApp, props: Record<string, any> = {}) => {
    setCentral(false);
    setJanelas((js) => {
      const def = APPS[app];
      if (def.unico) {
        const existente = js.find((j) => j.app === app);
        if (existente) return js.map((j) => (j.id === existente.id ? { ...j, z: ++proximoZ.current, minimizada: false, props: { ...j.props, ...props } } : j));
      }
      const deslocamento = (js.length % 6) * 28;
      const largura = Math.min(def.largura, larguraTela() - 60);
      const altura = Math.min(def.altura, alturaTela() - 36 - 110);
      const nova: DadosJanela = {
        id: proximoId.current++,
        app,
        titulo: def.nome,
        x: Math.max(20, (larguraTela() - largura) / 2 - 80 + deslocamento),
        y: Math.max(12, (alturaTela() - 36 - 96 - altura) / 2 + deslocamento),
        largura,
        altura,
        minimizada: false,
        maximizada: false,
        z: ++proximoZ.current,
        props,
      };
      return [...js, nova];
    });
  }, []);

  const fechar = useCallback((id: number) => setJanelas((js) => js.filter((j) => j.id !== id)), []);
  const renomearJanela = useCallback(
    (id: number, titulo: string) => setJanelas((js) => js.map((j) => (j.id === id && j.titulo !== titulo ? { ...j, titulo } : j))),
    [],
  );
  const alterar = (id: number, mudancas: Partial<DadosJanela>) => setJanelas((js) => js.map((j) => (j.id === id ? { ...j, ...mudancas } : j)));

  const mudarConfig = useCallback(async (mudancas: Partial<Config>) => {
    setConfig((c) => (c ? { ...c, ...mudancas } : c));
    try {
      const r = await api.gravarConfig(mudancas);
      setConfig(r.config);
    } catch (e: any) {
      aviso(e.message);
    }
  }, [aviso]);

  const bloquear = useCallback(() => {
    setCentral(false);
    setBloqueado(true);
  }, []);

  const energia = useCallback(
    async (acao: "desligar" | "reiniciar") => {
      const ok = await confirmar({
        titulo: acao === "desligar" ? "Desligar o computador?" : "Reiniciar o computador?",
        texto: "Salve o que estiver aberto antes de continuar.",
        ok: acao === "desligar" ? "Desligar" : "Reiniciar",
        perigo: acao === "desligar",
      });
      if (!ok) return;
      api.energia(acao).catch((e) => aviso(e.message));
    },
    [confirmar, aviso],
  );

  // Atalho: Ctrl+Alt+L (ou Super+L) bloqueia a tela.
  useEffect(() => {
    const teclas = (e: KeyboardEvent) => {
      if ((e.key === "l" || e.key === "L") && ((e.ctrlKey && e.altKey) || e.metaKey) && sistema && !sistema.live) {
        e.preventDefault();
        bloquear();
      }
    };
    window.addEventListener("keydown", teclas);
    return () => window.removeEventListener("keydown", teclas);
  }, [bloquear, sistema]);

  // Na sessão de instalação, o instalador abre sozinho.
  const abriuInstalador = useRef(false);
  useEffect(() => {
    if (config) definirEscala(config.escala ?? 1.25);
  }, [config?.escala]);

  // Procura atualização um pouco depois de entrar; se houver, avisa uma vez.
  useEffect(() => {
    if (!sistema || sistema.live || bloqueado) return;
    const t = setTimeout(() => {
      api
        .verAtualizacao()
        .then((i) => i.disponivel && aviso("Há uma atualização do Alba OS. Instale em Ajustes › Sobre."))
        .catch(() => {});
    }, 15000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sistema, bloqueado]);

  useEffect(() => {
    if (sistema?.live && !abriuInstalador.current) {
      abriuInstalador.current = true;
      abrir("instalador");
    }
  }, [sistema, abrir]);

  const ctx: Contexto | null = useMemo(
    () =>
      sistema && config
        ? { sistema, config, agora, mudarConfig, abrir, fechar, renomearJanela, aviso, confirmar, perguntar, bloquear, energia, tocando, definirTocando }
        : null,
    [sistema, config, agora, mudarConfig, abrir, fechar, renomearJanela, aviso, confirmar, perguntar, bloquear, energia, tocando],
  );

  if (erro)
    return (
      <main className="desktop">
        <Papel />
        <div className="falha-inicio">
          <Icone name="logo" size={48} />
          <h1>O Alba OS não conseguiu iniciar</h1>
          <p>{erro}</p>
          <button onClick={() => location.reload()}>Tentar de novo</button>
        </div>
      </main>
    );
  if (!ctx || !config) return <main className="desktop carregando"><Papel /></main>;

  const visiveis = janelas.filter((j) => !j.minimizada);
  const ativa = visiveis.reduce<DadosJanela | null>((a, j) => (!a || j.z > a.z ? j : a), null);

  function cliqueDock(app: IdApp | "lixeira") {
    if (app === "lixeira") return abrir("arquivos", { inicial: "lixeira" });
    const delas = janelas.filter((j) => j.app === app);
    if (!delas.length) return abrir(app);
    const topo = delas.reduce((a, j) => (j.z > a.z ? j : a));
    if (ativa?.id === topo.id && !topo.minimizada) alterar(topo.id, { minimizada: true });
    else focar(topo.id);
  }

  function conteudo(j: DadosJanela) {
    switch (j.app) {
      case "arquivos":
        return <Arquivos inicial={j.props.inicial} idJanela={j.id} />;
      case "terminal":
        return <Terminal ativo={ativa?.id === j.id} />;
      case "notas":
        return <Notas caminho={j.props.caminho} idJanela={j.id} />;
      case "visualizador":
        return <Visualizador caminho={j.props.caminho} />;
      case "ajustes":
        return <Ajustes secao={j.props.secao} />;
      case "instalador":
        return <Instalador />;
      case "musica":
        return (
          <Musica
            abrir={j.props.abrir}
            controle={{
              janela: j,
              focar: () => focar(j.id),
              mover: (x, y) => alterar(j.id, { x, y }),
              redimensionar: (x, y, largura, altura) => alterar(j.id, { x, y, largura, altura, maximizada: false }),
              minimizar: () => alterar(j.id, { minimizada: true }),
              maximizar: () => alterar(j.id, { maximizada: !j.maximizada }),
              fechar: () => fechar(j.id),
            }}
          />
        );
    }
  }

  return (
    <CtxAlba.Provider value={ctx}>
      <main
        className={`desktop ${config.tema === "escuro" ? "dark" : ""}`}
        style={{ "--destaque": config.destaque } as React.CSSProperties}
      >
        <Papel />
        {bloqueado ? (
          <TelaBloqueio aoDesbloquear={() => setBloqueado(false)} />
        ) : (
          <>
            <BarraSuperior janelaAtiva={ativa} centralAberta={central} alternarCentral={() => setCentral(!central)} />
            <section className="workspace" aria-label="Área de trabalho" onPointerDown={(e) => e.target === e.currentTarget && setCentral(false)}>
              {janelas.map((j) => (
                <Janela
                  key={j.id}
                  janela={j}
                  ativa={ativa?.id === j.id}
                  classe={j.app === "terminal" ? "terminal-window janela-terminal" : `janela-${j.app}`}
                  semMoldura={APPS[j.app].semMoldura}
                  onFoco={() => ativa?.id !== j.id && focar(j.id)}
                  onFechar={() => fechar(j.id)}
                  onMinimizar={() => alterar(j.id, { minimizada: true })}
                  onMaximizar={() => alterar(j.id, { maximizada: !j.maximizada })}
                  onMover={(x, y) => alterar(j.id, { x, y })}
                  onRedimensionar={(largura, altura) => alterar(j.id, { largura, altura })}
                >
                  {conteudo(j)}
                </Janela>
              ))}
              {central && <Central fechar={() => setCentral(false)} />}
            </section>
            <Dock janelas={janelas} aoClicar={cliqueDock} live={sistema!.live} />
          </>
        )}
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
