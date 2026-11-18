import { useEffect, useMemo, useState } from "react";
import { IconeAlba } from "../componentes/ArteApps";
import {
  api,
  type AppAutoinicio,
  type AppInstalado,
  type AppPadrao,
  gerenciarApps,
  monitor,
  type TarefaLoja,
  type TudoAtualizacao,
  tamanhoLegivel,
} from "../api";
import { Interruptor } from "../componentes/Central";
import { Icone } from "../componentes/Icone";
import { APPS, type IdApp, useAlba } from "../contexto";
import { ouvirEventos, paraCasca } from "../ponte";

function IconeInstalado({ icone, nome, alba }: { icone?: string; nome: string; alba?: string }) {
  const [falhou, setFalhou] = useState(false);
  const a = alba as IdApp | undefined;
  if (a && APPS[a])
    return (
      <IconeAlba id={a} className="apps-icone" />
    );
  if (icone && !falhou) return <img className="apps-icone" src={monitor.urlIcone(icone)} alt="" onError={() => setFalhou(true)} draggable={false} />;
  return <span className="apps-icone vazio">{nome.slice(0, 1).toUpperCase()}</span>;
}

/** Ajustes › Apps: o que está instalado, desinstalar, apps padrão e o que abre ao ligar. */
export function AjustesApps({ buscaInicial }: { buscaInicial?: string }) {
  const { confirmar, perguntar, aviso } = useAlba();
  const [apps, setApps] = useState<AppInstalado[] | null>(null);
  const [tarefas, setTarefas] = useState<Record<string, TarefaLoja>>({});
  const [removendo, setRemovendo] = useState<string | null>(null);
  const [busca, setBusca] = useState(buscaInicial || "");
  const [padroes, setPadroes] = useState<Record<string, AppPadrao> | null>(null);
  const [auto, setAuto] = useState<AppAutoinicio[] | null>(null);
  const [verAuto, setVerAuto] = useState(false);

  const carregar = () =>
    gerenciarApps
      .listar()
      .then((r) => {
        setApps(r.apps);
        setTarefas(r.tarefas);
      })
      .catch((e) => aviso(e.message));

  useEffect(() => {
    carregar();
    gerenciarApps.padroes().then(setPadroes).catch(() => {});
    gerenciarApps.autoinicio().then((r) => setAuto(r.apps)).catch(() => {});
    return ouvirEventos((m) => {
      if (m.tipo === "loja" && m.tarefas) setTarefas(m.tarefas);
      if (m.tipo === "apps-mudaram") carregar();
    });
  }, []);
  useEffect(() => {
    if (buscaInicial) setBusca(buscaInicial);
  }, [buscaInicial]);

  const visiveis = useMemo(
    () => (apps || []).filter((a) => !busca || a.nome.toLowerCase().includes(busca.toLowerCase())),
    [apps, busca],
  );
  const total = (apps || []).reduce((s, a) => s + (a.tamanho || 0), 0);

  async function desinstalar(a: AppInstalado) {
    let senha: string | undefined;
    if (a.origem === "sistema") {
      const s = await perguntar({
        titulo: `Desinstalar “${a.nome}”?`,
        texto: "É um programa do sistema: digite sua senha para confirmar. Seus arquivos não são apagados.",
        ok: "Desinstalar",
        senha: true,
        perigo: true,
      });
      if (!s) return;
      senha = s;
    } else {
      const ok = await confirmar({
        titulo: `Desinstalar “${a.nome}”?`,
        texto: "Ele sai do Launchpad e do dock. Dá para instalar de novo pela Alba Store quando quiser.",
        ok: "Desinstalar",
        perigo: true,
      });
      if (!ok) return;
    }
    setRemovendo(a.id);
    try {
      await gerenciarApps.desinstalar(a, senha);
      if (a.origem === "sistema") {
        aviso(`“${a.nome}” foi desinstalado.`);
        carregar();
      }
    } catch (e: any) {
      aviso(e.message);
    } finally {
      setRemovendo(null);
    }
  }

  const abrirApp = (a: AppInstalado) => paraCasca({ tipo: "lancar", desktop: a.desktop });

  return (
    <>
      <h2>Apps</h2>
      <div className="apps-topo">
        <label className="apps-busca">
          <Icone name="search" size={14} />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar apps instalados" aria-label="Buscar apps instalados" />
        </label>
        <button className="botao-secundario" onClick={() => paraCasca({ tipo: "abrir", app: "loja" })}>
          <Icone name="store" size={14} /> Alba Store
        </button>
      </div>

      <div className="ajuste-grupo apps-lista">
        {apps === null && <p className="apps-vazio">Procurando apps…</p>}
        {apps && visiveis.length === 0 && <p className="apps-vazio">{busca ? "Nenhum app com esse nome." : "Nenhum app instalado."}</p>}
        {visiveis.map((a) => {
          const t = tarefas[a.pacote || ""];
          const ocupado = removendo === a.id || (t && t.estado === "rodando");
          return (
            <div key={a.id} className="apps-linha">
              <IconeInstalado icone={a.icone} nome={a.nome} />
              <span className="apps-texto">
                <strong>{a.nome}</strong>
                <small>
                  {[a.origem === "loja" ? "Alba Store" : "Sistema", a.versao && `versão ${a.versao}`, a.tamanho ? tamanhoLegivel(a.tamanho) : ""]
                    .filter(Boolean)
                    .join(" · ")}
                </small>
              </span>
              <button className="botao-secundario pequeno" onClick={() => abrirApp(a)}>
                Abrir
              </button>
              {a.protegido ? (
                <span className="apps-protegido" title={a.motivo || "Faz parte do Alba"}>
                  <Icone name="lock" size={12} /> {a.motivo || "Do Alba"}
                </span>
              ) : (
                <button className="botao-perigo pequeno" disabled={!!ocupado} onClick={() => desinstalar(a)}>
                  {ocupado ? (t && t.progresso ? `${t.progresso}%` : "Removendo…") : "Desinstalar"}
                </button>
              )}
            </div>
          );
        })}
        {apps && apps.length > 0 && (
          <p className="apps-rodape">
            {apps.length} apps · {tamanhoLegivel(total)} no total
          </p>
        )}
      </div>

      <h3>Apps padrão</h3>
      <div className="ajuste-grupo">
        {!padroes && <p className="apps-vazio">Carregando…</p>}
        {padroes &&
          Object.entries(padroes).map(([chave, p]) => (
            <div className="setting-row" key={chave}>
              <span>{p.nome}</span>
              {p.opcoes.length ? (
                <select
                  className="apps-select"
                  value={p.atual || ""}
                  onChange={(e) =>
                    gerenciarApps
                      .definirPadrao(chave, e.target.value)
                      .then(setPadroes)
                      .catch((er) => aviso(er.message))
                  }
                >
                  {p.opcoes.map((o) => (
                    <option key={o.desktop} value={o.desktop}>
                      {o.nome}
                    </option>
                  ))}
                </select>
              ) : (
                <small className="discreto">Nenhum app instalado abre isso</small>
              )}
            </div>
          ))}
      </div>

      <h3>Abrir ao ligar</h3>
      <div className="ajuste-grupo">
        {auto && auto.filter((a) => a.ligado).length === 0 && !verAuto && <p className="apps-vazio">Nenhum app abre sozinho ao ligar.</p>}
        {auto
          ?.filter((a) => verAuto || a.ligado)
          .map((a) => (
            <div className="setting-row" key={a.id}>
              <span className="apps-auto">
                <IconeInstalado icone={a.icone} nome={a.nome} alba={a.alba} /> {a.nome}
              </span>
              <Interruptor
                ligado={a.ligado}
                rotulo={`Abrir ${a.nome} ao ligar`}
                aoMudar={() =>
                  gerenciarApps
                    .definirAutoinicio(a.id, !a.ligado)
                    .then((r) => setAuto(r.apps))
                    .catch((e) => aviso(e.message))
                }
              />
            </div>
          ))}
        <button className="apps-mais" onClick={() => setVerAuto((v) => !v)}>
          {verAuto ? "Mostrar só os ligados" : "Escolher apps…"}
        </button>
      </div>
    </>
  );
}

/** Atualizações: Alba, sistema (Linux) e apps da loja, num botão só. */
export function AtualizarTudo() {
  const { confirmar, aviso, energia } = useAlba();
  const [info, setInfo] = useState<TudoAtualizacao | null>(null);
  const [estado, setEstado] = useState<"procurando" | "pronto" | "atualizando" | "erro">("procurando");
  const [erro, setErro] = useState("");
  const [progresso, setProgresso] = useState<{ texto: string; valor: number | null; etapa: string } | null>(null);
  const [reiniciar, setReiniciar] = useState(false);

  async function procurar(forcar = false) {
    setEstado("procurando");
    setErro("");
    try {
      const r = await gerenciarApps.atualizacoes(forcar);
      setInfo(r);
      setReiniciar(!!r.reiniciar);
      setEstado("pronto");
    } catch (e: any) {
      setErro(e.message);
      setEstado("erro");
    }
  }

  useEffect(() => {
    procurar();
    return ouvirEventos((m) => {
      if (m.tipo === "atualizacao-progresso") setProgresso({ texto: m.texto, valor: m.progresso ?? null, etapa: m.etapa });
    });
  }, []);

  const alba = !!info?.alba.disponivel;
  const sistema = info?.sistema?.pendentes ?? 0;
  const daLoja = info?.loja?.pendentes ?? 0;
  const algo = alba || sistema > 0 || daLoja > 0;

  async function atualizar() {
    const partes: ("alba" | "sistema" | "loja")[] = [];
    if (alba) partes.push("alba");
    if (sistema > 0) partes.push("sistema");
    if (daLoja > 0) partes.push("loja");
    const ok = await confirmar({
      titulo: "Atualizar tudo?",
      texto:
        sistema > 30
          ? "São muitas atualizações do sistema: pode levar alguns minutos. Pode continuar usando o computador enquanto isso."
          : "Pode continuar usando o computador enquanto isso.",
      ok: "Atualizar",
    });
    if (!ok) return;
    setEstado("atualizando");
    setProgresso({ texto: "Começando…", valor: null, etapa: partes[0] });
    try {
      const r = await gerenciarApps.atualizar(partes);
      setReiniciar(r.reiniciar);
      if (r.alba) {
        aviso("Tudo atualizado. O Alba vai recarregar.");
        await api.recarregar(true);
      } else {
        aviso("Tudo atualizado.");
        procurar(true);
      }
    } catch (e: any) {
      setErro(e.message);
      setEstado("erro");
    }
  }

  const atual = info?.alba.atual;
  const linha = (rotulo: string, texto: string, pendente: boolean) => (
    <div className="atualizacao-linha">
      <span className={`atualizacao-ponto ${pendente ? "pendente" : ""}`} />
      <span>
        <strong>{rotulo}</strong>
        <small>{texto}</small>
      </span>
    </div>
  );

  return (
    <div className="ajuste-grupo atualizacoes">
      <div className="setting-row">
        <span className="atualizacao-texto">
          <strong>Atualizações</strong>
          <small>
            {estado === "procurando"
              ? "Procurando atualizações…"
              : estado === "atualizando"
                ? progresso?.texto || "Atualizando…"
                : estado === "erro"
                  ? erro
                  : algo
                    ? "Há atualizações disponíveis."
                    : "Está tudo atualizado."}
          </small>
        </span>
        {estado === "atualizando" ? (
          <span className="loja-progresso grande">
            <span style={{ width: `${Math.max(6, (progresso?.valor ?? 0.08) * 100)}%` }} />
            <em>{progresso?.valor ? `${Math.round(progresso.valor * 100)}%` : "…"}</em>
          </span>
        ) : algo && estado === "pronto" ? (
          <button className="botao-destaque" onClick={atualizar}>
            Atualizar tudo
          </button>
        ) : (
          <button className="botao-secundario" onClick={() => procurar(true)} disabled={estado === "procurando"}>
            Procurar
          </button>
        )}
      </div>
      {info && estado !== "procurando" && (
        <div className="atualizacao-detalhes">
          {linha(
            "Alba OS",
            alba && info.alba.nova
              ? `Versão nova ${info.alba.nova.versao} disponível`
              : info.alba.erro || `Versão ${atual?.versao || ""} instalada${atual?.commit ? ` (${atual.commit.slice(0, 7)})` : ""}`,
            alba,
          )}
          {info.sistema &&
            linha(
              "Sistema (Linux)",
              info.sistema.erro ||
                (info.sistema.pendentes === null
                  ? "Não deu para conferir"
                  : sistema
                    ? `${sistema} ${sistema === 1 ? "atualização" : "atualizações"}${info.sistema.nucleo ? ", inclusive do núcleo (pede reiniciar)" : ""}`
                    : "Em dia"),
              sistema > 0,
            )}
          {info.loja && linha("Apps da Alba Store", daLoja ? `${daLoja} ${daLoja === 1 ? "app" : "apps"} com versão nova` : "Em dia", daLoja > 0)}
        </div>
      )}
      {reiniciar && (
        <div className="atualizacao-reiniciar">
          <Icone name="restart" size={16} />
          <span>O núcleo do sistema foi atualizado. Reinicie para terminar.</span>
          <button className="botao-destaque pequeno" onClick={() => energia("reiniciar")}>
            Reiniciar
          </button>
        </div>
      )}
    </div>
  );
}
