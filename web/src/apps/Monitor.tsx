import { useEffect, useMemo, useRef, useState } from "react";
import { type AmostraMonitor, type AppMonitor, monitor, tamanhoLegivel } from "../api";
import { MarcaSleeve } from "../componentes/Barra";
import { Icone } from "../componentes/Icone";
import { APPS, type IdApp, useAlba } from "../contexto";

const HISTORICO = 60; // pontos nos gráficos (1,5 s cada: um minuto e meio)
const INTERVALO = 1500;

type Ordem = "nome" | "cpu" | "memoria";

const velocidade = (b: number) => (b < 1024 ? `${Math.round(b)} B/s` : `${tamanhoLegivel(b)}/s`);
const pct = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: v < 10 ? 1 : 0 })}%`;

function IconeProcesso({ app }: { app: AppMonitor }) {
  const [falhou, setFalhou] = useState(false);
  const alba = app.alba as IdApp | null;
  if (alba && APPS[alba])
    return (
      <span className={`dock-icon ${APPS[alba].classe} mon-icone`}>
        {alba === "musica" ? <MarcaSleeve /> : <Icone name={APPS[alba].icone} size={15} />}
      </span>
    );
  if (app.icone && !falhou)
    return <img className="mon-icone" src={monitor.urlIcone(app.icone)} alt="" onError={() => setFalhou(true)} draggable={false} />;
  return (
    <span className={`mon-icone vazio ${app.protegido ? "sistema" : ""}`}>
      {app.protegido ? <Icone name="settings" size={13} /> : app.nome.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** Gráfico de área (uma ou duas séries) que vai andando para a esquerda. */
function Grafico({ series, max, cores }: { series: number[][]; max?: number; cores: string[] }) {
  const teto = max ?? Math.max(1, ...series.flat()) * 1.15;
  const caminho = (s: number[]) => {
    const pts = s.map((v, i) => `${((i + HISTORICO - s.length) / (HISTORICO - 1)) * 100},${40 - (Math.min(v, teto) / teto) * 38}`);
    return pts.length ? `M${pts.join(" L")}` : "";
  };
  return (
    <svg className="mon-grafico" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
      {[10, 20, 30].map((y) => (
        <line key={y} x1="0" x2="100" y1={y} y2={y} className="grade" />
      ))}
      {series.map((s, i) => {
        const d = caminho(s);
        if (!d) return null;
        const inicio = ((HISTORICO - s.length) / (HISTORICO - 1)) * 100;
        return (
          <g key={i} style={{ color: cores[i] }}>
            {i === 0 && <path d={`${d} L100,40 L${inicio},40 Z`} className="area" />}
            <path d={d} className={`linha ${i > 0 ? "segunda" : ""}`} vectorEffect="non-scaling-stroke" />
          </g>
        );
      })}
    </svg>
  );
}

/** Monitor de Atividade: o que está usando o processador, a memória, o disco e a rede. */
export function Monitor({ abaInicial }: { abaInicial?: "apps" | "desempenho" } = {}) {
  const { confirmar, aviso } = useAlba();
  const [aba, setAba] = useState<"apps" | "desempenho">(abaInicial || "apps");
  const [dados, setDados] = useState<AmostraMonitor | null>(null);
  const [hist, setHist] = useState({ cpu: [] as number[], mem: [] as number[], leitura: [] as number[], escrita: [] as number[], rx: [] as number[], tx: [] as number[] });
  const [ordem, setOrdem] = useState<{ por: Ordem; desc: boolean }>({ por: "cpu", desc: true });
  const [sel, setSel] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [verSistema, setVerSistema] = useState(false);
  const vivo = useRef(true);

  useEffect(() => {
    vivo.current = true;
    const ler = () =>
      monitor
        .amostra()
        .then((a) => {
          if (!vivo.current) return;
          setDados(a);
          const mais = (lista: number[], v: number) => [...lista, v].slice(-HISTORICO);
          setHist((h) => ({
            cpu: mais(h.cpu, a.cpu.total),
            mem: mais(h.mem, (a.memoria.usada / Math.max(1, a.memoria.total)) * 100),
            leitura: mais(h.leitura, a.disco.leitura),
            escrita: mais(h.escrita, a.disco.escrita),
            rx: mais(h.rx, a.rede.recebendo),
            tx: mais(h.tx, a.rede.enviando),
          }));
        })
        .catch(() => {});
    ler();
    const t = window.setInterval(ler, INTERVALO);
    return () => {
      vivo.current = false;
      window.clearInterval(t);
    };
  }, []);

  const ordenar = (lista: AppMonitor[]) =>
    [...lista]
      .filter((a) => !busca || a.nome.toLowerCase().includes(busca.toLowerCase()))
      .sort((a, b) => {
        const v = ordem.por === "nome" ? a.nome.localeCompare(b.nome, "pt-BR") : (a[ordem.por] as number) - (b[ordem.por] as number);
        return ordem.desc ? -v : v;
      });
  const apps = useMemo(() => (dados ? ordenar(dados.apps) : []), [dados, ordem, busca]);
  const sistema = useMemo(() => (dados ? ordenar(dados.sistema) : []), [dados, ordem, busca]);
  const escolhido = dados?.apps.find((a) => a.nome === sel) || null;

  const encerrar = async () => {
    if (!escolhido) return;
    const ok = await confirmar({
      titulo: `Encerrar “${escolhido.nome}”?`,
      texto: "O que não foi salvo nesse app pode se perder.",
      ok: "Encerrar",
      perigo: true,
    });
    if (!ok) return;
    const pids = escolhido.pids?.length ? escolhido.pids : [escolhido.pid];
    await monitor.encerrar(pids).catch((e) => aviso(e.message));
    // Se ainda estiver aberto depois de alguns segundos, oferece forçar.
    window.setTimeout(async () => {
      const a = await monitor.amostra().catch(() => null);
      const ainda = a?.apps.find((x) => pids.includes(x.pid));
      if (!ainda) return;
      const forcar = await confirmar({
        titulo: `“${escolhido.nome}” não respondeu`,
        texto: "Forçar o encerramento fecha o app na hora.",
        ok: "Forçar encerramento",
        perigo: true,
      });
      if (forcar) monitor.encerrar(pids, true).catch((e) => aviso(e.message));
    }, 3000);
  };

  const cabecalho = (por: Ordem, rotulo: string, classe = "") => (
    <button
      className={`mon-col ${classe} ${ordem.por === por ? "ativa" : ""}`}
      onClick={() => setOrdem((o) => ({ por, desc: o.por === por ? !o.desc : por !== "nome" }))}
    >
      {rotulo}
      {ordem.por === por && <span className="mon-seta">{ordem.desc ? "▾" : "▴"}</span>}
    </button>
  );

  const linha = (a: AppMonitor) => (
    <div
      key={a.nome}
      className={`mon-linha ${sel === a.nome ? "selecionada" : ""} ${a.protegido ? "protegida" : ""}`}
      onClick={() => !a.protegido && setSel(a.nome)}
      role="row"
    >
      <span className="mon-nome">
        <IconeProcesso app={a} />
        <span>
          {a.nome}
          {a.processos > 1 && <small>{a.processos} processos</small>}
        </span>
      </span>
      <span className={`mon-num ${a.cpu >= 50 ? "alto" : ""}`}>{pct(a.cpu)}</span>
      <span className="mon-num">{tamanhoLegivel(a.memoria)}</span>
    </div>
  );

  const mem = dados?.memoria;
  return (
    <div className="monitor">
      <header className="mon-topo">
        <div className="mon-abas" role="tablist">
          <button role="tab" aria-selected={aba === "apps"} className={aba === "apps" ? "ativa" : ""} onClick={() => setAba("apps")}>
            Apps
          </button>
          <button role="tab" aria-selected={aba === "desempenho"} className={aba === "desempenho" ? "ativa" : ""} onClick={() => setAba("desempenho")}>
            Desempenho
          </button>
        </div>
        {aba === "apps" && (
          <>
            <label className="mon-busca">
              <Icone name="search" size={14} />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar" aria-label="Buscar app" />
            </label>
            <button className="mon-encerrar" disabled={!escolhido} onClick={encerrar} title="Encerrar o app selecionado">
              <Icone name="close" size={14} /> Encerrar
            </button>
          </>
        )}
      </header>

      {!dados && <p className="mon-carregando">Medindo…</p>}

      {dados && aba === "apps" && (
        <div className="mon-tabela" role="table">
          <div className="mon-cabecalho" role="row">
            {cabecalho("nome", "Nome", "mon-nome")}
            {cabecalho("cpu", "Processador", "mon-num")}
            {cabecalho("memoria", "Memória", "mon-num")}
          </div>
          <div className="mon-corpo">
            {apps.map(linha)}
            {apps.length === 0 && <p className="mon-vazio">{busca ? "Nenhum app com esse nome." : "Nenhum app aberto."}</p>}
            <button className="mon-grupo" onClick={() => setVerSistema((v) => !v)}>
              <span className={`mon-triangulo ${verSistema ? "aberto" : ""}`}>▸</span> Processos do sistema
              <small>
                {sistema.length} · {pct(sistema.reduce((s, a) => s + a.cpu, 0))} · {tamanhoLegivel(sistema.reduce((s, a) => s + a.memoria, 0))}
              </small>
            </button>
            {verSistema && sistema.map(linha)}
          </div>
        </div>
      )}

      {dados && aba === "desempenho" && mem && (
        <div className="mon-cartoes">
          <section className="mon-cartao">
            <div className="mon-cartao-topo">
              <span>Processador</span>
              <strong>{pct(dados.cpu.total)}</strong>
            </div>
            <Grafico series={[hist.cpu]} max={100} cores={["var(--destaque, #e0662f)"]} />
            <div className="mon-nucleos">
              {dados.cpu.nucleos.map((n, i) => (
                <span key={i} title={`Núcleo ${i + 1}: ${pct(n)}`}>
                  <i style={{ height: `${Math.max(3, n)}%` }} />
                </span>
              ))}
            </div>
            <small>
              {dados.cpu.nucleos.length} núcleos · carga {dados.cpu.carga[0].toLocaleString("pt-BR")}
            </small>
          </section>
          <section className="mon-cartao">
            <div className="mon-cartao-topo">
              <span>Memória</span>
              <strong>
                {tamanhoLegivel(mem.usada)} <em>de {tamanhoLegivel(mem.total)}</em>
              </strong>
            </div>
            <Grafico series={[hist.mem]} max={100} cores={["#5c9ff0"]} />
            <div className="mon-barra">
              <span className="usada" style={{ width: `${(mem.usada / mem.total) * 100}%` }} />
              <span className="cache" style={{ width: `${(Math.min(mem.cache, mem.total - mem.usada) / mem.total) * 100}%` }} />
            </div>
            <small>
              {tamanhoLegivel(mem.cache)} em cache (liberada quando precisar)
              {mem.swap_total > 0 && ` · troca: ${tamanhoLegivel(mem.swap_usada)} de ${tamanhoLegivel(mem.swap_total)}`}
            </small>
          </section>
          <section className="mon-cartao">
            <div className="mon-cartao-topo">
              <span>Disco</span>
              <strong>{velocidade(dados.disco.leitura + dados.disco.escrita)}</strong>
            </div>
            <Grafico series={[hist.leitura, hist.escrita]} cores={["#9b78de", "#e483b6"]} />
            <small className="mon-legenda">
              <i style={{ background: "#9b78de" }} /> Lendo {velocidade(dados.disco.leitura)} <i style={{ background: "#e483b6" }} /> Gravando{" "}
              {velocidade(dados.disco.escrita)}
            </small>
          </section>
          <section className="mon-cartao">
            <div className="mon-cartao-topo">
              <span>Rede</span>
              <strong>{velocidade(dados.rede.recebendo + dados.rede.enviando)}</strong>
            </div>
            <Grafico series={[hist.rx, hist.tx]} cores={["#3fb7cb", "#ef9a55"]} />
            <small className="mon-legenda">
              <i style={{ background: "#3fb7cb" }} /> Recebendo {velocidade(dados.rede.recebendo)} <i style={{ background: "#ef9a55" }} /> Enviando{" "}
              {velocidade(dados.rede.enviando)}
            </small>
          </section>
        </div>
      )}

      {dados && (
        <footer className="mon-rodape">
          <span>Processador {pct(dados.cpu.total)}</span>
          <span>
            Memória {tamanhoLegivel(dados.memoria.usada)} de {tamanhoLegivel(dados.memoria.total)}
          </span>
          <span>
            {dados.apps.length} {dados.apps.length === 1 ? "app" : "apps"} · {dados.total_processos} processos
          </span>
        </footer>
      )}
    </div>
  );
}
