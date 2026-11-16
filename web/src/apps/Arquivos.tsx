import { type CSSProperties, useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { alturaTela, emCss, larguraTela } from "../escala";
import { api, type Item, type Local, tamanhoLegivel } from "../api";
import { iniciais, useAlba } from "../contexto";
import { Icone, type NomeIcone } from "../componentes/Icone";

const CORES: Record<string, string> = {
  pasta: "#8ee8cf",
  imagem: "#a9b7ff",
  video: "#c7b3ff",
  audio: "#ffb4b4",
  texto: "#ffe09b",
  pdf: "#ffc2a1",
  compactado: "#d6dcc4",
  arquivo: "#d8e6e2",
};

const ICONES: Record<string, NomeIcone> = {
  pasta: "folder",
  imagem: "image",
  video: "video",
  audio: "music",
  texto: "note",
  pdf: "file",
  compactado: "archive",
  arquivo: "file",
};

function iconePasta(nome: string): NomeIcone {
  const mapa: Record<string, NomeIcone> = { Downloads: "download", Imagens: "image", Músicas: "music", Vídeos: "video", Documentos: "file" };
  return mapa[nome] || "folder";
}

const COR_PASTA: Record<string, string> = {
  Documentos: "#5c9ff0",
  Downloads: "#3fb7cb",
  Imagens: "#e483b6",
  Músicas: "#9b78de",
  Vídeos: "#ef9a55",
  Área: "#5c9ff0",
};

function corPasta(nome: string) {
  return COR_PASTA[nome] || "#7d8ff0";
}

const ROTULO: Record<string, string> = {
  imagem: "IMG",
  video: "VÍDEO",
  audio: "ÁUDIO",
  texto: "TXT",
  pdf: "PDF",
  compactado: "ZIP",
};

const COR_ARQUIVO: Record<string, string> = {
  imagem: "#e483b6",
  video: "#9b78de",
  audio: "#ef7f7f",
  texto: "#5c9ff0",
  pdf: "#ef6a5a",
  compactado: "#9aa5b5",
  arquivo: "#9aa5b5",
};

/** Pasta grande e colorida, desenhada pelo próprio Alba (com emblema das pastas do sistema). */
function ArtePasta({ nome }: { nome: string }) {
  const cor = corPasta(nome);
  const emblema = iconePasta(nome);
  return (
    <span className="arte-pasta" style={{ "--cor": cor } as CSSProperties}>
      <svg viewBox="0 0 80 64" aria-hidden="true">
        <path className="fundo" d="M6 10a6 6 0 0 1 6-6h17.5a6 6 0 0 1 4.6 2.2L38 11h30a6 6 0 0 1 6 6v37a6 6 0 0 1-6 6H12a6 6 0 0 1-6-6Z" />
        <path className="frente" d="M6 22a6 6 0 0 1 6-6h56a6 6 0 0 1 6 6v32a6 6 0 0 1-6 6H12a6 6 0 0 1-6-6Z" />
      </svg>
      {emblema !== "folder" && (
        <span className="emblema">
          <Icone name={emblema} size={20} strokeWidth={2} />
        </span>
      )}
    </span>
  );
}

/** Folha com dobra e etiqueta do tipo; imagens mostram a própria miniatura. */
function ArteArquivo({ item }: { item: Item }) {
  const ext = item.nome.includes(".") ? item.nome.split(".").pop()!.slice(0, 5).toUpperCase() : "";
  const rotulo = ROTULO[item.categoria] || ext || "ARQ";
  if (item.categoria === "imagem" && item.tamanho < 25 * 1024 * 1024) {
    return (
      <span className="arte-miniatura">
        <img src={api.urlArquivo(item.caminho)} alt="" loading="lazy" draggable={false} />
      </span>
    );
  }
  return (
    <span className="arte-arquivo" style={{ "--cor": COR_ARQUIVO[item.categoria] || COR_ARQUIVO.arquivo } as CSSProperties}>
      <svg viewBox="0 0 56 68" aria-hidden="true">
        <path className="folha" d="M6 4h30l14 14v42a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4Z" />
        <path className="dobra" d="M36 4v10a4 4 0 0 0 4 4h10" />
      </svg>
      <span className="etiqueta">{rotulo}</span>
    </span>
  );
}

export function Arquivos({ inicial, idJanela }: { inicial?: string; idJanela: number }) {
  const { sistema, config, abrir, aviso, confirmar, perguntar, renomearJanela } = useAlba();
  const [locais, setLocais] = useState<Local[]>([]);
  const [caminho, setCaminho] = useState(inicial || sistema.casa);
  const [historico, setHistorico] = useState<string[]>([]);
  const [itens, setItens] = useState<Item[]>([]);
  const [gravavel, setGravavel] = useState(true);
  const [pai, setPai] = useState<string | null>(null);
  const [visao, setVisao] = useState<"grade" | "lista">("grade");
  const [busca, setBusca] = useState("");
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ item: Item; x: number; y: number } | null>(null);
  const [erro, setErro] = useState("");
  const naLixeira = caminho === "lixeira";

  const carregar = useCallback(async () => {
    setErro("");
    try {
      if (naLixeira) {
        const r = await api.lixeira();
        setItens(r.itens);
        setGravavel(false);
        setPai(null);
        renomearJanela(idJanela, "Lixeira");
      } else {
        const r = await api.pasta(caminho);
        setItens(r.itens);
        setGravavel(r.gravavel);
        setPai(r.pai);
        renomearJanela(idJanela, r.caminho === sistema.casa ? "Início" : r.caminho.split("/").pop() || "/");
      }
    } catch (e: any) {
      setErro(e.message);
      setItens([]);
    }
  }, [caminho, naLixeira, idJanela, renomearJanela, sistema.casa]);

  useEffect(() => {
    api.locais().then((r) => setLocais(r.locais)).catch(() => {});
  }, []);

  useEffect(() => {
    carregar();
    setSelecionado(null);
    setBusca("");
  }, [carregar]);

  useEffect(() => {
    if (!menu) return;
    const fechar = () => setMenu(null);
    window.addEventListener("pointerdown", fechar);
    return () => window.removeEventListener("pointerdown", fechar);
  }, [menu]);

  function ir(destino: string) {
    if (destino === caminho) return;
    setHistorico((h) => [...h, caminho]);
    setCaminho(destino);
  }

  function voltar() {
    const anterior = historico[historico.length - 1];
    if (!anterior) return;
    setHistorico((h) => h.slice(0, -1));
    setCaminho(anterior);
  }

  function abrirItem(item: Item) {
    if (naLixeira) return;
    if (item.tipo === "pasta") return ir(item.caminho);
    if (item.categoria === "imagem") return abrir("visualizador", { caminho: item.caminho });
    if (item.categoria === "audio") return abrir("musica", { abrir: { caminhos: [item.caminho], vez: Date.now() } });
    if (item.categoria === "texto" || (item.tamanho ?? 0) < 512 * 1024) return abrir("notas", { caminho: item.caminho });
    aviso("O Alba OS ainda não tem um app para abrir este tipo de arquivo.");
  }

  async function novaPasta() {
    const nome = await perguntar({ titulo: "Nova pasta", texto: "Nome da pasta:", valor: "Nova pasta", ok: "Criar" });
    if (!nome) return;
    try {
      await api.novaPasta(caminho, nome);
      carregar();
    } catch (e: any) {
      aviso(e.message);
    }
  }

  async function renomear(item: Item) {
    const nome = await perguntar({ titulo: "Renomear", texto: `Novo nome para “${item.nome}”:`, valor: item.nome, ok: "Renomear" });
    if (!nome || nome === item.nome) return;
    try {
      await api.renomear(item.caminho, nome);
      carregar();
    } catch (e: any) {
      aviso(e.message);
    }
  }

  async function lixeira(item: Item) {
    try {
      await api.paraLixeira(item.caminho);
      aviso(`“${item.nome}” foi para a lixeira.`);
      carregar();
    } catch (e: any) {
      aviso(e.message);
    }
  }

  async function restaurar(item: Item) {
    try {
      await api.restaurar(item.caminho);
      aviso(`“${item.nome}” foi restaurado.`);
      carregar();
    } catch (e: any) {
      aviso(e.message);
    }
  }

  async function esvaziar() {
    const ok = await confirmar({
      titulo: "Esvaziar a lixeira?",
      texto: "Os itens serão apagados para sempre. Isso não pode ser desfeito.",
      ok: "Esvaziar",
      perigo: true,
    });
    if (!ok) return;
    await api.esvaziarLixeira().catch((e) => aviso(e.message));
    carregar();
  }

  const visiveis = itens.filter((i) => !busca || i.nome.toLowerCase().includes(busca.toLowerCase()));
  const pastas = visiveis.filter((i) => i.tipo === "pasta");
  const arquivos = visiveis.filter((i) => i.tipo !== "pasta");
  const usado = sistema.disco_total ? Math.round((sistema.disco_usado / sistema.disco_total) * 100) : 0;
  const titulo = naLixeira ? "Lixeira" : caminho === sistema.casa ? "Seu espaço" : caminho.split("/").pop() || "Este computador";
  const subtitulo = naLixeira ? "Itens apagados" : caminho === sistema.casa ? `Olá, ${sistema.nome.split(" ")[0]}` : caminho;

  const cartao = (item: Item) => (
    <button
      key={item.caminho}
      className={`folder-card ${visao === "grade" ? "tile" : ""} ${selecionado === item.caminho ? "selecionado" : ""}`}
      onClick={() => setSelecionado(item.caminho)}
      onDoubleClick={() => abrirItem(item)}
      onKeyDown={(e) => e.key === "Enter" && abrirItem(item)}
      onContextMenu={(e) => {
        e.preventDefault();
        setSelecionado(item.caminho);
        setMenu({ item, x: emCss(e.clientX), y: emCss(e.clientY) });
      }}
    >
      {visao === "grade" ? (
        item.tipo === "pasta" ? <ArtePasta nome={item.nome} /> : <ArteArquivo item={item} />
      ) : (
        <span className="folder-icon" style={{ "--folder": item.tipo === "pasta" ? corPasta(item.nome) : COR_ARQUIVO[item.categoria] || CORES.arquivo } as CSSProperties}>
          <Icone name={item.tipo === "pasta" ? iconePasta(item.nome) : ICONES[item.categoria] || "file"} size={20} strokeWidth={1.7} />
        </span>
      )}
      <span className="folder-copy">
        <strong title={item.nome}>{item.nome}</strong>
        <small>
          {naLixeira ? item.original : item.tipo === "pasta" ? "Pasta" : tamanhoLegivel(item.tamanho)}
          {!naLixeira && item.modificado ? ` · ${new Date(item.modificado * 1000).toLocaleDateString("pt-BR")}` : ""}
        </small>
      </span>
      <span
        className="mais-opcoes"
        role="button"
        tabIndex={-1}
        aria-label={`Opções de ${item.nome}`}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          setSelecionado(item.caminho);
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          setMenu({ item, x: r.left, y: r.bottom + 4 });
        }}
      >
        <Icone name="more" size={17} />
      </span>
    </button>
  );

  return (
    <div className="window-body app-arquivos">
      <aside className="sidebar">
        <div className="profile">
          <div className="avatar">{iniciais(sistema.nome)}</div>
          <div>
            <strong>{sistema.nome}</strong>
            <span>{sistema.usuario}@{sistema.maquina}</span>
          </div>
        </div>
        <p className="eyebrow">Locais</p>
        {locais.map((l) => (
          <button key={l.caminho} className={caminho === l.caminho ? "active" : ""} onClick={() => ir(l.caminho)}>
            <Icone name={l.icone as NomeIcone} size={18} />
            <span>{l.nome}</span>
          </button>
        ))}
        <button className={naLixeira ? "active" : ""} onClick={() => ir("lixeira")}>
          <Icone name="trash" size={18} />
          <span>Lixeira</span>
        </button>
        <div className="storage">
          <div className="storage-label">
            <span>Armazenamento</span>
            <span>{usado}%</span>
          </div>
          <div className="storage-bar">
            <span style={{ width: `${usado}%` }} />
          </div>
          <small>
            {tamanhoLegivel(sistema.disco_usado)} de {tamanhoLegivel(sistema.disco_total)}
          </small>
        </div>
      </aside>

      <div className="file-content">
        <div className="barra-navegacao">
          <button onClick={voltar} disabled={!historico.length} aria-label="Voltar">
            <Icone name="back" size={17} />
          </button>
          <button onClick={() => pai && ir(pai)} disabled={!pai} aria-label="Pasta acima">
            <Icone name="up" size={17} />
          </button>
          <div className="window-actions">
            <button className={visao === "grade" ? "selected" : ""} onClick={() => setVisao("grade")} aria-label="Grade">
              <Icone name="grid" size={17} />
            </button>
            <button className={visao === "lista" ? "selected" : ""} onClick={() => setVisao("lista")} aria-label="Lista">
              <Icone name="list" size={17} />
            </button>
          </div>
        </div>

        <div className="content-heading">
          <div>
            <p className="eyebrow">{subtitulo}</p>
            <h1>{titulo}</h1>
          </div>
          <label className="file-search">
            <Icone name="search" size={17} />
            <input aria-label="Buscar nesta pasta" placeholder="Buscar" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </label>
        </div>

        {erro && <p className="aviso-erro">{erro}</p>}

        <section className="folder-section">
          <div className="section-title">
            <h2>{naLixeira ? `${visiveis.length} itens` : "Pastas"}</h2>
            {naLixeira ? (
              <button className="new-folder" onClick={esvaziar} disabled={!itens.length}>
                <Icone name="trash" size={15} /> Esvaziar
              </button>
            ) : (
              gravavel && (
                <button className="new-folder" onClick={novaPasta}>
                  <Icone name="plus" size={15} /> Nova pasta
                </button>
              )
            )}
          </div>
          {naLixeira ? (
            <div className={`folder-grid ${visao === "lista" ? "list" : ""}`}>{visiveis.map(cartao)}</div>
          ) : (
            <>
              <div className={`folder-grid ${visao === "lista" ? "list" : ""}`}>{pastas.map(cartao)}</div>
              {arquivos.length > 0 && (
                <>
                  <div className="section-title arquivos-titulo">
                    <h2>Arquivos</h2>
                  </div>
                  <div className={`folder-grid ${visao === "lista" ? "list" : ""}`}>{arquivos.map(cartao)}</div>
                </>
              )}
            </>
          )}
          {!erro && visiveis.length === 0 && (
            <p className="vazio">{busca ? "Nada encontrado." : naLixeira ? "A lixeira está vazia." : "Esta pasta está vazia."}</p>
          )}
        </section>

        <footer className="system-footer barra-status">
          <span>
            {visiveis.length} {visiveis.length === 1 ? "item" : "itens"}
          </span>
          <span>•</span>
          <span>{tamanhoLegivel(Math.max(0, sistema.disco_total - sistema.disco_usado))} disponíveis</span>
        </footer>
      </div>

      {menu &&
        createPortal(
        <div
          className={`menu-contexto ${config.tema === "escuro" ? "escuro" : ""}`}
          style={{ left: Math.min(menu.x, larguraTela() - 250), top: Math.min(menu.y, alturaTela() - 140) }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {naLixeira ? (
            <button onClick={() => (setMenu(null), restaurar(menu.item))}>
              <Icone name="restore" size={16} /> Restaurar
            </button>
          ) : (
            <>
              <button onClick={() => (setMenu(null), abrirItem(menu.item))}>
                <Icone name="chevron" size={16} /> Abrir
              </button>
              {gravavel && (
                <>
                  <button onClick={() => (setMenu(null), renomear(menu.item))}>
                    <Icone name="edit" size={16} /> Renomear
                  </button>
                  <button className="perigo" onClick={() => (setMenu(null), lixeira(menu.item))}>
                    <Icone name="trash" size={16} /> Mover para a lixeira
                  </button>
                </>
              )}
            </>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
