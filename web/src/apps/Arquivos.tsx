import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { alturaTela, emCss, larguraTela } from "../escala";
import { api, arquivosExtra, type Item, type Local, mesa, tamanhoLegivel, type Unidade } from "../api";
import { ouvirEventos, publicarEvento } from "../ponte";
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
export function ArtePasta({ nome }: { nome: string }) {
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
export function ArteArquivo({ item }: { item: Item }) {
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

/** Área de transferência de arquivos, compartilhada entre as janelas do Arquivos (pelo servidor). */
let areaArquivos: { itens: string[]; acao: "copiar" | "mover" } | null = null;
const ouvintesArea = new Set<() => void>();
export function areaAtual() {
  return areaArquivos;
}
export function definirArea(a: typeof areaArquivos, avisarOutras = true) {
  areaArquivos = a;
  ouvintesArea.forEach((f) => f());
  if (avisarOutras) publicarEvento({ tipo: "arquivos-area", area: a });
}
ouvirEventos((m) => m.tipo === "arquivos-area" && definirArea(m.area ?? null, false));

const TIPO_ARRASTE = "application/x-alba-arquivos";

export function Arquivos({ inicial, idJanela }: { inicial?: string; idJanela: number }) {
  const { sistema, config, abrir, aviso, confirmar, perguntar, renomearJanela, mudarConfig } = useAlba();
  const [locais, setLocais] = useState<Local[]>([]);
  const [caminho, setCaminho] = useState(inicial || sistema.casa);
  const [historico, setHistorico] = useState<string[]>([]);
  const [itens, setItens] = useState<Item[]>([]);
  const [gravavel, setGravavel] = useState(true);
  const [pai, setPai] = useState<string | null>(null);
  const [visao, setVisao] = useState<"grade" | "lista">("grade");
  const [busca, setBusca] = useState("");
  const [selecao, setSelecao] = useState<string[]>([]);
  const [ancora, setAncora] = useState<string | null>(null);
  const [area, setArea] = useState(areaArquivos);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [alvoArraste, setAlvoArraste] = useState<string | null>(null);
  // item null = clique direito num espaço vazio da pasta
  const [menu, setMenu] = useState<{ item: Item | null; x: number; y: number } | null>(null);
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

  const lerUnidades = useCallback(() => {
    arquivosExtra
      .unidades()
      .then((r) => setUnidades(r.unidades))
      .catch(() => {});
  }, []);

  useEffect(() => {
    api.locais().then((r) => setLocais(r.locais)).catch(() => {});
    lerUnidades();
    const t = window.setInterval(lerUnidades, 4000); // pendrive entrou ou saiu
    const f = () => setArea(areaArquivos);
    ouvintesArea.add(f);
    const sair = ouvirEventos((m) => m.tipo === "arquivos-mudaram" && carregarRef.current());
    return () => {
      window.clearInterval(t);
      ouvintesArea.delete(f);
      sair();
    };
  }, [lerUnidades]);

  const carregarRef = useRef(carregar);
  carregarRef.current = carregar;

  useEffect(() => {
    carregar();
    setSelecao([]);
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
    if (item.categoria === "texto") return abrir("notas", { caminho: item.caminho });
    arquivosExtra.abrirExterno(item.caminho).catch((e) => {
      if ((item.tamanho ?? 0) < 512 * 1024 && item.categoria === "arquivo") abrir("notas", { caminho: item.caminho });
      else aviso(e.message);
    });
  }

  // ------------------------------------------------ copiar, recortar, colar, arrastar
  const avisarMudanca = () => publicarEvento({ tipo: "arquivos-mudaram" });

  async function colarEm(destino: string, itens: string[], acao: "copiar" | "mover") {
    if (!itens.length) return;
    try {
      const r = await arquivosExtra.colar(itens, destino, acao);
      const n = r.itens.length;
      if (n) aviso(`${n} ${n === 1 ? "item" : "itens"} ${acao === "mover" ? "movido" : "copiado"}${n === 1 ? "" : "s"}.`);
      if (acao === "mover" && areaArquivos?.acao === "mover") definirArea(null);
      carregar();
      avisarMudanca();
    } catch (e: any) {
      aviso(e.message);
    }
  }

  const copiar = (acao: "copiar" | "mover", itens = selecao) => {
    if (!itens.length || naLixeira) return;
    if (acao === "mover" && !gravavel) return aviso("Não dá para recortar daqui: você só pode copiar.");
    definirArea({ itens, acao });
    aviso(`${itens.length === 1 ? "1 item" : `${itens.length} itens`} ${acao === "mover" ? "recortado" : "copiado"}${itens.length === 1 ? "" : "s"}. Abra outra pasta e cole.`);
  };
  const colar = () => {
    if (!area || naLixeira) return;
    if (!gravavel) return aviso("Não dá para colar nesta pasta.");
    colarEm(caminho, area.itens, area.acao);
  };

  async function lixeiraVarios(caminhos: string[]) {
    for (const c of caminhos) {
      try {
        await api.paraLixeira(c);
      } catch (e: any) {
        aviso(e.message);
        break;
      }
    }
    aviso(caminhos.length === 1 ? `“${caminhos[0].split("/").pop()}” foi para a lixeira.` : `${caminhos.length} itens foram para a lixeira.`);
    carregar();
    avisarMudanca();
  }

  function clicar(e: React.MouseEvent, item: Item) {
    if (e.ctrlKey || e.metaKey) {
      setSelecao((s) => (s.includes(item.caminho) ? s.filter((x) => x !== item.caminho) : [...s, item.caminho]));
      setAncora(item.caminho);
    } else if (e.shiftKey && ancora) {
      const ordem = [...pastas, ...arquivos].map((i) => i.caminho);
      const a = ordem.indexOf(ancora);
      const b = ordem.indexOf(item.caminho);
      if (a >= 0 && b >= 0) setSelecao(ordem.slice(Math.min(a, b), Math.max(a, b) + 1));
    } else {
      setSelecao([item.caminho]);
      setAncora(item.caminho);
    }
  }

  function teclado(e: React.KeyboardEvent) {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (ctrl && k === "c") copiar("copiar");
    else if (ctrl && k === "x") copiar("mover");
    else if (ctrl && k === "v") colar();
    else if (ctrl && k === "a") setSelecao(visiveis.map((i) => i.caminho));
    else if (e.key === "Delete" && gravavel && !naLixeira && selecao.length) lixeiraVarios(selecao);
    else if (e.key === "F2" && gravavel && selecao.length === 1) {
      const it = itens.find((i) => i.caminho === selecao[0]);
      if (it) renomear(it);
    } else if (e.key === "Backspace" && pai) ir(pai);
    else if (e.key === "Escape") setSelecao([]);
    else return;
    e.preventDefault();
  }

  // Arrastar: soltar numa pasta (ou num local da barra lateral) move; com Ctrl, copia.
  const arrastarDe = (e: React.DragEvent, item: Item) => {
    if (naLixeira) return e.preventDefault();
    const itensArraste = selecao.includes(item.caminho) ? selecao : [item.caminho];
    if (!selecao.includes(item.caminho)) setSelecao([item.caminho]);
    e.dataTransfer.setData(TIPO_ARRASTE, JSON.stringify(itensArraste));
    e.dataTransfer.setData("text/plain", itensArraste.join("\n"));
    e.dataTransfer.effectAllowed = "copyMove";
  };
  const alvo = (destino: string, podeSoltar: boolean) =>
    podeSoltar
      ? {
          onDragOver: (e: React.DragEvent) => {
            if (!e.dataTransfer.types.includes(TIPO_ARRASTE)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = e.ctrlKey ? "copy" : "move";
            setAlvoArraste(destino);
          },
          onDragLeave: () => setAlvoArraste((a) => (a === destino ? null : a)),
          onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            setAlvoArraste(null);
            try {
              const lista: string[] = JSON.parse(e.dataTransfer.getData(TIPO_ARRASTE) || "[]");
              const validos = lista.filter((c) => c !== destino);
              if (validos.length) colarEm(destino, validos, e.ctrlKey ? "copiar" : "mover");
            } catch {
              /* nada */
            }
          },
        }
      : {};

  async function abrirUnidade(u: Unidade) {
    if (u.montada) return ir(u.montada);
    try {
      const r = await arquivosExtra.montar(u.dispositivo);
      lerUnidades();
      if (r.caminho) ir(r.caminho);
    } catch (e: any) {
      aviso(e.message);
    }
  }
  async function ejetar(u: Unidade) {
    try {
      if (u.montada && (caminho === u.montada || caminho.startsWith(u.montada + "/"))) ir(sistema.casa);
      await arquivosExtra.ejetar(u.dispositivo);
      aviso(`Pode tirar “${u.nome}” com segurança.`);
      lerUnidades();
    } catch (e: any) {
      aviso(e.message);
    }
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

  async function novoArquivo() {
    const nome = await perguntar({ titulo: "Novo documento de texto", texto: "Nome do arquivo:", valor: "Novo documento.txt", ok: "Criar" });
    if (!nome) return;
    try {
      const r = await arquivosExtra.novoArquivo(caminho, nome);
      carregar();
      avisarMudanca();
      if (/\.(txt|md)$/i.test(nome)) abrir("notas", { caminho: r.caminho });
    } catch (e: any) {
      aviso(e.message);
    }
  }

  async function atalhoNaMesa(caminhos: string[]) {
    try {
      for (const c of caminhos) await mesa.atalho({ caminho: c });
      aviso(caminhos.length === 1 ? "Atalho criado na área de trabalho." : `${caminhos.length} atalhos criados na área de trabalho.`);
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
      className={`folder-card ${visao === "grade" ? "tile" : ""} ${selecao.includes(item.caminho) ? "selecionado" : ""} ${alvoArraste === item.caminho ? "alvo-arraste" : ""} ${area?.acao === "mover" && area.itens.includes(item.caminho) ? "recortado" : ""}`}
      onClick={(e) => clicar(e, item)}
      onDoubleClick={() => abrirItem(item)}
      onKeyDown={(e) => e.key === "Enter" && abrirItem(item)}
      draggable={!naLixeira}
      onDragStart={(e) => arrastarDe(e, item)}
      {...alvo(item.caminho, item.tipo === "pasta" && !naLixeira)}
      onContextMenu={(e) => {
        e.preventDefault();
        if (!selecao.includes(item.caminho)) setSelecao([item.caminho]);
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
          if (!selecao.includes(item.caminho)) setSelecao([item.caminho]);
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          setMenu({ item, x: r.left, y: r.bottom + 4 });
        }}
      >
        <Icone name="more" size={17} />
      </span>
    </button>
  );

  return (
    <div className="window-body app-arquivos" tabIndex={-1} onKeyDown={teclado}>
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
          <button
            key={l.caminho}
            className={`${caminho === l.caminho ? "active" : ""} ${alvoArraste === l.caminho ? "alvo-arraste" : ""}`}
            onClick={() => ir(l.caminho)}
            {...alvo(l.caminho, l.caminho !== "/")}
          >
            <Icone name={l.icone as NomeIcone} size={18} />
            <span>{l.nome}</span>
          </button>
        ))}
        {unidades.length > 0 && <p className="eyebrow">Unidades</p>}
        {unidades.map((u) => (
          <div key={u.dispositivo} className="linha-unidade">
            <button
              className={`${u.montada && caminho.startsWith(u.montada) ? "active" : ""} ${alvoArraste === u.montada ? "alvo-arraste" : ""}`}
              onClick={() => abrirUnidade(u)}
              title={`${u.nome} · ${tamanhoLegivel(u.tamanho)}`}
              {...alvo(u.montada || "", !!u.montada)}
            >
              <Icone name="usb" size={18} />
              <span>{u.nome}</span>
            </button>
            {u.montada && (
              <button className="ejetar" onClick={() => ejetar(u)} aria-label={`Ejetar ${u.nome}`} title="Ejetar">
                <Icone name="eject" size={14} />
              </button>
            )}
          </div>
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

        <section
          className="folder-section"
          onClick={(e) => (e.target as HTMLElement).closest(".folder-card") === null && setSelecao([])}
          onContextMenu={(e) => {
            if ((e.target as HTMLElement).closest(".folder-card") || naLixeira) return;
            e.preventDefault();
            setSelecao([]);
            setMenu({ item: null, x: emCss(e.clientX), y: emCss(e.clientY) });
          }}
          {...alvo(caminho, gravavel && !naLixeira)}
        >
          <div className="section-title">
            <h2>{naLixeira ? `${visiveis.length} itens` : "Pastas"}</h2>
            {naLixeira ? (
              <button className="new-folder" onClick={esvaziar} disabled={!itens.length}>
                <Icone name="trash" size={15} /> Esvaziar
              </button>
            ) : (
              gravavel && (
                <span className="acoes-pasta">
                  {area && (
                    <button className="new-folder" onClick={colar} title="Colar (Ctrl+V)">
                      <Icone name="paste" size={15} /> Colar {area.itens.length > 1 ? `${area.itens.length} itens` : ""}
                    </button>
                  )}
                  <button className="new-folder" onClick={novaPasta}>
                    <Icone name="plus" size={15} /> Nova pasta
                  </button>
                </span>
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
            {selecao.length > 1 ? `${selecao.length} de ${visiveis.length} selecionados` : `${visiveis.length} ${visiveis.length === 1 ? "item" : "itens"}`}
          </span>
          <span>•</span>
          <span>{tamanhoLegivel(Math.max(0, sistema.disco_total - sistema.disco_usado))} disponíveis</span>
        </footer>
      </div>

      {menu &&
        createPortal(
        <div
          className={`menu-contexto ${config.tema === "escuro" ? "escuro" : ""}`}
          style={{ left: Math.min(menu.x, larguraTela() - 250), top: Math.min(menu.y, alturaTela() - 300) }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {!menu.item ? (
            <>
              {gravavel ? (
                <>
                  <button onClick={() => (setMenu(null), novaPasta())}>
                    <Icone name="folder" size={16} /> Nova pasta
                  </button>
                  <button onClick={() => (setMenu(null), novoArquivo())}>
                    <Icone name="file" size={16} /> Novo documento de texto
                  </button>
                  {area && (
                    <button onClick={() => (setMenu(null), colar())}>
                      <Icone name="paste" size={16} /> Colar {area.itens.length > 1 ? `${area.itens.length} itens` : ""}
                    </button>
                  )}
                  <hr />
                </>
              ) : (
                <span className="menu-contexto-nota">Só leitura: aqui não dá para criar itens.</span>
              )}
              <button onClick={() => (setMenu(null), setSelecao(visiveis.map((i) => i.caminho)))}>
                <Icone name="check" size={16} /> Selecionar tudo
              </button>
              <button onClick={() => (setMenu(null), setVisao(visao === "grade" ? "lista" : "grade"))}>
                <Icone name={visao === "grade" ? "list" : "grid"} size={16} /> {visao === "grade" ? "Ver como lista" : "Ver como grade"}
              </button>
              <button onClick={() => (setMenu(null), carregar())}>
                <Icone name="restart" size={16} /> Atualizar
              </button>
            </>
          ) : naLixeira ? (
            <button onClick={() => (setMenu(null), restaurar(menu.item!))}>
              <Icone name="restore" size={16} /> Restaurar
            </button>
          ) : (
            <>
              <button onClick={() => (setMenu(null), abrirItem(menu.item))}>
                <Icone name="chevron" size={16} /> Abrir
              </button>
              {menu.item.categoria === "imagem" && (
                <button
                  onClick={() => {
                    const caminho = menu.item.caminho;
                    setMenu(null);
                    mudarConfig({ papel: "personalizado", papel_arquivo: caminho, papel_definido: true });
                    aviso("Papel de parede trocado.");
                  }}
                >
                  <Icone name="image" size={16} /> Usar como papel de parede
                </button>
              )}
              <button onClick={() => (setMenu(null), copiar("copiar"))}>
                <Icone name="copy" size={16} /> Copiar {selecao.length > 1 ? `${selecao.length} itens` : ""}
              </button>
              {gravavel && (
                <button onClick={() => (setMenu(null), copiar("mover"))}>
                  <Icone name="cut" size={16} /> Recortar
                </button>
              )}
              <button onClick={() => (setMenu(null), atalhoNaMesa(selecao.length > 1 ? selecao : [menu.item!.caminho]))}>
                <Icone name="monitor" size={16} /> Criar atalho na área de trabalho
              </button>
              {area && menu.item.tipo === "pasta" && (
                <button onClick={() => (setMenu(null), colarEm(menu.item.caminho, area.itens, area.acao))}>
                  <Icone name="paste" size={16} /> Colar nesta pasta
                </button>
              )}
              {gravavel && (
                <>
                  {selecao.length <= 1 && (
                    <button onClick={() => (setMenu(null), renomear(menu.item))}>
                      <Icone name="edit" size={16} /> Renomear
                    </button>
                  )}
                  <button className="perigo" onClick={() => (setMenu(null), selecao.length > 1 ? lixeiraVarios(selecao) : lixeira(menu.item))}>
                    <Icone name="trash" size={16} /> Mover para a lixeira {selecao.length > 1 ? `(${selecao.length})` : ""}
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
