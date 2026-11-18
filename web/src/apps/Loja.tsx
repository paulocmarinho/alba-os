import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconeAlba } from "../componentes/ArteApps";
import { type AppLoja, type DetalheLoja, type InstaladoLoja, type TarefaLoja, type Vitrine, loja, tamanhoLegivel } from "../api";
import { Icone } from "../componentes/Icone";
import { useAlba } from "../contexto";
import { ouvirEventos, paraCasca } from "../ponte";

type Vista = { tipo: "inicio" } | { tipo: "busca"; termo: string } | { tipo: "app"; id: string } | { tipo: "instalados" };

/** Alba Store: apps do Flathub, instalados só para este usuário, sem senha. */
export function Loja({ abrirApp, vez }: { abrirApp?: string; vez?: number } = {}) {
  const { aviso } = useAlba();
  const [vista, setVista] = useState<Vista>(abrirApp ? { tipo: "app", id: abrirApp } : { tipo: "inicio" });
  // Pedido de fora (ex.: "alba-app loja '{\"app\": \"com.spotify.Client\"}'"): vai direto para o app.
  useEffect(() => {
    if (abrirApp && vez) setVista({ tipo: "app", id: abrirApp });
  }, [abrirApp, vez]);
  const [historico, setHistorico] = useState<Vista[]>([]);
  const [busca, setBusca] = useState("");
  const [instalados, setInstalados] = useState<InstaladoLoja[]>([]);
  const [tarefas, setTarefas] = useState<Record<string, TarefaLoja>>({});
  const [atualizacoes, setAtualizacoes] = useState<string[]>([]);

  const recarregarInstalados = useCallback(() => {
    loja
      .instalados()
      .then((r) => {
        setInstalados(r.apps);
        setTarefas(r.tarefas);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    recarregarInstalados();
    loja.atualizacoes().then((r) => setAtualizacoes(r.apps)).catch(() => {});
    return ouvirEventos((m) => {
      if (m.tipo === "loja" && m.tarefas) setTarefas(m.tarefas);
      if (m.tipo === "apps-mudaram") {
        recarregarInstalados();
        loja.atualizacoes().then((r) => setAtualizacoes(r.apps)).catch(() => {});
      }
    });
  }, [recarregarInstalados]);

  const idsInstalados = useMemo(() => new Set(instalados.map((a) => a.id)), [instalados]);

  const ir = (v: Vista) => {
    setHistorico((h) => [...h, vista]);
    setVista(v);
  };
  const voltar = () => {
    setHistorico((h) => {
      const anterior = h[h.length - 1];
      setVista(anterior || { tipo: "inicio" });
      return h.slice(0, -1);
    });
  };

  const acoes: Acoes = {
    instalado: (id) => idsInstalados.has(id),
    tarefa: (id) => tarefas[id],
    instalar: (a) => loja.instalar(a.id, a.nome).catch((e) => aviso(e.message)),
    remover: (a) => loja.remover(a.id, a.nome).catch((e) => aviso(e.message)),
    abrir: (id) => paraCasca({ tipo: "lancar", desktop: `${id}.desktop` }),
    ver: (id) => ir({ tipo: "app", id }),
  };

  const pesquisar = (e: React.FormEvent) => {
    e.preventDefault();
    const termo = busca.trim();
    if (termo) ir({ tipo: "busca", termo });
  };

  return (
    <div className="loja">
      <aside className="loja-lateral">
        <div className="loja-marca">
          <IconeAlba id="loja" />
          <strong>Alba Store</strong>
        </div>
        <form className="loja-busca" onSubmit={pesquisar}>
          <Icone name="search" size={15} />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar apps" aria-label="Buscar apps" />
        </form>
        <nav>
          <button className={vista.tipo === "inicio" || vista.tipo === "busca" || vista.tipo === "app" ? "active" : ""} onClick={() => ir({ tipo: "inicio" })}>
            <Icone name="grid" size={17} /> Descobrir
          </button>
          <button className={vista.tipo === "instalados" ? "active" : ""} onClick={() => ir({ tipo: "instalados" })}>
            <Icone name="download" size={17} /> Instalados
            {atualizacoes.length > 0 && <span className="loja-selo">{atualizacoes.length}</span>}
          </button>
        </nav>
        <p className="loja-rodape">Apps do Flathub. Cada um roda isolado e fica só na sua conta.</p>
      </aside>
      <main className="loja-conteudo">
        {historico.length > 0 && vista.tipo !== "inicio" && (
          <button className="loja-voltar" onClick={voltar}>
            ‹ Voltar
          </button>
        )}
        {vista.tipo === "inicio" && <Inicio acoes={acoes} />}
        {vista.tipo === "busca" && <Busca termo={vista.termo} acoes={acoes} />}
        {vista.tipo === "app" && <Pagina id={vista.id} acoes={acoes} />}
        {vista.tipo === "instalados" && (
          <Instalados apps={instalados} atualizacoes={atualizacoes} tarefas={tarefas} acoes={acoes} />
        )}
      </main>
    </div>
  );
}

type Acoes = {
  instalado: (id: string) => boolean;
  tarefa: (id: string) => TarefaLoja | undefined;
  instalar: (a: { id: string; nome: string }) => void;
  remover: (a: { id: string; nome: string }) => void;
  abrir: (id: string) => void;
  ver: (id: string) => void;
};

function IconeLoja({ src, nome, tamanho = 56 }: { src: string | null; nome: string; tamanho?: number }) {
  const [falhou, setFalhou] = useState(false);
  if (!src || falhou)
    return (
      <span className="loja-icone-vazio" style={{ width: tamanho, height: tamanho, fontSize: tamanho * 0.42 }}>
        {nome.slice(0, 1).toUpperCase()}
      </span>
    );
  return <img className="loja-icone" src={src} alt="" width={tamanho} height={tamanho} onError={() => setFalhou(true)} draggable={false} />;
}

function Botao({ app, acoes, grande }: { app: { id: string; nome: string }; acoes: Acoes; grande?: boolean }) {
  const t = acoes.tarefa(app.id);
  if (t && t.estado === "rodando")
    return (
      <span className={`loja-progresso ${grande ? "grande" : ""}`} title={t.texto}>
        <span style={{ width: `${Math.max(4, t.progresso)}%` }} />
        <em>{t.progresso > 0 ? `${t.progresso}%` : t.texto}</em>
      </span>
    );
  if (acoes.instalado(app.id))
    return (
      <button
        className={`loja-botao abrir ${grande ? "grande" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          acoes.abrir(app.id);
        }}
      >
        Abrir
      </button>
    );
  return (
    <button
      className={`loja-botao ${grande ? "grande" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        acoes.instalar(app);
      }}
    >
      Instalar
    </button>
  );
}

function Cartao({ app, acoes }: { app: AppLoja; acoes: Acoes }) {
  return (
    <div className="loja-cartao" role="button" tabIndex={0} onClick={() => acoes.ver(app.id)} onKeyDown={(e) => e.key === "Enter" && acoes.ver(app.id)}>
      <IconeLoja src={app.icone} nome={app.nome} />
      <div className="loja-cartao-texto">
        <strong>{app.nome}</strong>
        <small>{app.resumo}</small>
      </div>
      <Botao app={app} acoes={acoes} />
    </div>
  );
}

function Carregando({ texto = "Carregando…" }: { texto?: string }) {
  return (
    <div className="loja-carregando">
      <span className="loja-giro" /> {texto}
    </div>
  );
}

function Falha({ texto, tentar }: { texto: string; tentar: () => void }) {
  return (
    <div className="loja-falha">
      <p>{texto}</p>
      <button className="loja-botao" onClick={tentar}>
        Tentar de novo
      </button>
    </div>
  );
}

function Inicio({ acoes }: { acoes: Acoes }) {
  const [v, setV] = useState<Vitrine | null>(null);
  const [erro, setErro] = useState("");
  const carregar = () => {
    setErro("");
    loja.vitrine().then(setV).catch((e) => setErro(e.message));
  };
  useEffect(carregar, []);
  if (erro) return <Falha texto={erro} tentar={carregar} />;
  if (!v) return <Carregando texto="Abrindo a loja…" />;
  const d = v.destaque;
  return (
    <div className="loja-inicio">
      <section className="loja-destaque" style={{ ["--cor" as string]: d.cor }} onClick={() => acoes.ver(d.id)}>
        <div>
          <small>Destaque</small>
          <h1>{d.titulo}</h1>
          <p>{d.texto}</p>
          <Botao app={{ id: d.id, nome: d.titulo }} acoes={acoes} grande />
        </div>
        <IconeLoja src={d.app.icone} nome={d.titulo} tamanho={132} />
      </section>
      {v.secoes.map((s) => (
        <section key={s.titulo} className="loja-secao">
          <h2>{s.titulo}</h2>
          <div className="loja-grade">
            {s.apps.map((a) => (
              <Cartao key={a.id} app={a} acoes={acoes} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Busca({ termo, acoes }: { termo: string; acoes: Acoes }) {
  const [apps, setApps] = useState<AppLoja[] | null>(null);
  const [erro, setErro] = useState("");
  const carregar = () => {
    setApps(null);
    setErro("");
    loja.buscar(termo).then((r) => setApps(r.apps)).catch((e) => setErro(e.message));
  };
  useEffect(carregar, [termo]);
  if (erro) return <Falha texto={erro} tentar={carregar} />;
  if (!apps) return <Carregando texto={`Buscando “${termo}”…`} />;
  return (
    <section className="loja-secao">
      <h2>Resultados para “{termo}”</h2>
      {apps.length === 0 ? (
        <p className="loja-vazio">Nada encontrado. Tente outro nome, em inglês às vezes ajuda (ex.: “video editor”).</p>
      ) : (
        <div className="loja-grade">
          {apps.map((a) => (
            <Cartao key={a.id} app={a} acoes={acoes} />
          ))}
        </div>
      )}
    </section>
  );
}

function Pagina({ id, acoes }: { id: string; acoes: Acoes }) {
  const [d, setD] = useState<DetalheLoja | null>(null);
  const [erro, setErro] = useState("");
  const [foto, setFoto] = useState<string | null>(null);
  const capturas = useRef<HTMLDivElement>(null);
  const carregar = () => {
    setErro("");
    loja.app(id).then(setD).catch((e) => setErro(e.message));
  };
  useEffect(carregar, [id]);
  if (erro) return <Falha texto={erro} tentar={carregar} />;
  if (!d) return <Carregando />;
  const instalado = acoes.instalado(d.id);
  const t = acoes.tarefa(d.id);
  return (
    <article className="loja-pagina">
      <header>
        <IconeLoja src={d.icone} nome={d.nome} tamanho={96} />
        <div>
          <h1>{d.nome}</h1>
          <p>{d.resumo}</p>
          <small>
            {d.desenvolvedor}
            {d.verificado && <span className="loja-verificado"> ✓ verificado</span>}
          </small>
        </div>
        <div className="loja-pagina-acoes">
          <Botao app={d} acoes={acoes} grande />
          {instalado && !(t && t.estado === "rodando") && (
            <button className="loja-botao remover" onClick={() => acoes.remover(d)}>
              Remover
            </button>
          )}
        </div>
      </header>
      {d.capturas.length > 0 && (
        <div className="loja-capturas" ref={capturas}>
          {d.capturas.map((c) => (
            <img key={c} src={c} alt="" loading="lazy" onClick={() => setFoto(c)} draggable={false} />
          ))}
        </div>
      )}
      <div className="loja-pagina-corpo">
        <div className="loja-descricao">
          {d.descricao.split("\n\n").map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
        <dl className="loja-info">
          {d.versao && (
            <>
              <dt>Versão</dt>
              <dd>{d.versao}</dd>
            </>
          )}
          {!!d.tamanho_download && (
            <>
              <dt>Download</dt>
              <dd>{tamanhoLegivel(d.tamanho_download)}</dd>
            </>
          )}
          {!!d.tamanho_instalado && (
            <>
              <dt>Ocupa</dt>
              <dd>{tamanhoLegivel(d.tamanho_instalado)}</dd>
            </>
          )}
          {d.licenca && (
            <>
              <dt>Licença</dt>
              <dd>{d.licenca.startsWith("LicenseRef-proprietary") ? "Proprietária" : d.licenca}</dd>
            </>
          )}
          <dt>Identificador</dt>
          <dd className="loja-id">{d.id}</dd>
        </dl>
      </div>
      {foto && (
        <div className="loja-foto" onClick={() => setFoto(null)}>
          <img src={foto} alt="" />
        </div>
      )}
    </article>
  );
}

function Instalados({
  apps,
  atualizacoes,
  tarefas,
  acoes,
}: {
  apps: InstaladoLoja[];
  atualizacoes: string[];
  tarefas: Record<string, TarefaLoja>;
  acoes: Acoes;
}) {
  const [icones, setIcones] = useState<Record<string, string | null>>({});
  useEffect(() => {
    apps.forEach((a) => {
      if (a.id in icones) return;
      loja
        .app(a.id)
        .then((d) => setIcones((i) => ({ ...i, [a.id]: d.icone })))
        .catch(() => setIcones((i) => ({ ...i, [a.id]: null })));
    });
  }, [apps]);
  const atualizando = tarefas["*"]?.estado === "rodando";
  return (
    <section className="loja-secao">
      <div className="loja-titulo-linha">
        <h2>Instalados</h2>
        {atualizacoes.length > 0 &&
          (atualizando ? (
            <span className="loja-progresso">
              <span style={{ width: `${Math.max(4, tarefas["*"].progresso)}%` }} />
              <em>Atualizando…</em>
            </span>
          ) : (
            <button className="loja-botao" onClick={() => loja.atualizarTudo()}>
              Atualizar tudo ({atualizacoes.length})
            </button>
          ))}
      </div>
      {apps.length === 0 ? (
        <p className="loja-vazio">Nenhum app instalado pela loja ainda. Que tal começar pelo Spotify?</p>
      ) : (
        <div className="loja-lista">
          {apps.map((a) => (
            <div key={a.id} className="loja-linha" onClick={() => acoes.ver(a.id)}>
              <IconeLoja src={icones[a.id] ?? null} nome={a.nome} tamanho={44} />
              <div className="loja-cartao-texto">
                <strong>{a.nome}</strong>
                <small>
                  {[a.versao && `Versão ${a.versao}`, a.tamanho, atualizacoes.includes(a.id) && "atualização disponível"].filter(Boolean).join(" · ")}
                </small>
              </div>
              <Botao app={a} acoes={acoes} />
              {!(tarefas[a.id]?.estado === "rodando") && (
                <button
                  className="loja-botao remover"
                  onClick={(e) => {
                    e.stopPropagation();
                    acoes.remover(a);
                  }}
                >
                  Remover
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
