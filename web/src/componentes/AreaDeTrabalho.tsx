import { useCallback, useEffect, useRef, useState } from "react";
import { api, arquivosExtra, type Item, type ItemMesa, mesa } from "../api";
import { type IdApp, APPS, useAlba } from "../contexto";
import { ouvirEventos, paraCasca, publicarEvento } from "../ponte";
import { ArteArquivo, ArtePasta, areaAtual, definirArea } from "../apps/Arquivos";
import { ArteApp, type IdArte } from "./ArteApps";
import { Icone } from "./Icone";

type Menu = { item: ItemMesa | null; x: number; y: number };

/**
 * Ícones na área de trabalho (a pasta ~/Área de Trabalho), em colunas a partir da direita,
 * com menu de clique direito: nova pasta, novo documento, colar, papel de parede…
 */
export function AreaDeTrabalho() {
  const { abrir, aviso, perguntar, confirmar, config } = useAlba();
  const [pasta, setPasta] = useState("");
  const [itens, setItens] = useState<ItemMesa[]>([]);
  const [sel, setSel] = useState<string[]>([]);
  const [menu, setMenu] = useState<Menu | null>(null);
  const raiz = useRef<HTMLDivElement>(null);

  const carregar = useCallback(() => {
    mesa
      .listar()
      .then((r) => {
        setPasta(r.caminho);
        setItens(r.itens);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    carregar();
    const t = window.setInterval(carregar, 4000);
    const sair = ouvirEventos((m) => (m.tipo === "mesa" || m.tipo === "arquivos-mudaram") && carregar());
    return () => {
      window.clearInterval(t);
      sair();
    };
  }, [carregar]);

  useEffect(() => {
    if (!menu) return;
    const fechar = () => setMenu(null);
    window.addEventListener("pointerdown", fechar);
    window.addEventListener("blur", fechar);
    return () => {
      window.removeEventListener("pointerdown", fechar);
      window.removeEventListener("blur", fechar);
    };
  }, [menu]);

  const mudou = () => {
    carregar();
    publicarEvento({ tipo: "arquivos-mudaram" });
  };

  function abrirItem(it: ItemMesa) {
    if (it.tipo === "app") {
      if (it.alba && APPS[it.alba as IdApp]) abrir(it.alba as IdApp);
      else paraCasca({ tipo: "lancar", desktop: it.caminho });
    } else if (it.tipo === "pasta") abrir("arquivos", { inicial: it.caminho });
    else if (it.categoria === "imagem") abrir("visualizador", { caminho: it.caminho });
    else if (it.categoria === "texto") abrir("notas", { caminho: it.caminho });
    else if (it.categoria === "audio") abrir("musica", { abrir: { caminhos: [it.caminho], vez: Date.now() } });
    else arquivosExtra.abrirExterno(it.caminho).catch((e) => aviso(e.message));
  }

  async function novaPasta() {
    const nome = await perguntar({ titulo: "Nova pasta", texto: "Nome da pasta:", valor: "Nova pasta", ok: "Criar" });
    if (!nome) return;
    await api.novaPasta(pasta, nome).then(mudou).catch((e) => aviso(e.message));
  }

  async function novoArquivo() {
    const nome = await perguntar({ titulo: "Novo documento de texto", texto: "Nome do arquivo:", valor: "Novo documento.txt", ok: "Criar" });
    if (!nome) return;
    await arquivosExtra.novoArquivo(pasta, nome).then(mudou).catch((e) => aviso(e.message));
  }

  async function renomear(it: ItemMesa) {
    const atual = it.caminho.split("/").pop() || it.nome;
    const nome = await perguntar({ titulo: "Renomear", texto: `Novo nome para “${it.nome}”:`, valor: atual, ok: "Renomear" });
    if (!nome || nome === atual) return;
    await api.renomear(it.caminho, nome).then(mudou).catch((e) => aviso(e.message));
  }

  async function lixeira(caminhos: string[]) {
    const atalhos = itens.filter((i) => caminhos.includes(i.caminho) && (i.atalho || i.tipo === "app"));
    if (atalhos.length === caminhos.length) {
      // Atalho: tirar não apaga o original. Mesmo assim vai para a lixeira (dá para desfazer).
    } else if (caminhos.length > 1 && !(await confirmar({ titulo: `Mover ${caminhos.length} itens para a lixeira?`, ok: "Mover" }))) return;
    for (const c of caminhos) await api.paraLixeira(c).catch((e) => aviso(e.message));
    setSel([]);
    mudou();
  }

  function colar() {
    const a = areaAtual();
    if (!a) return;
    arquivosExtra
      .colar(a.itens, pasta, a.acao)
      .then(() => {
        if (a.acao === "mover") definirArea(null);
        mudou();
      })
      .catch((e) => aviso(e.message));
  }

  function teclado(e: React.KeyboardEvent) {
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (e.key === "Enter" && sel.length) itens.filter((i) => sel.includes(i.caminho)).forEach(abrirItem);
    else if (e.key === "Delete" && sel.length) lixeira(sel);
    else if (e.key === "F2" && sel.length === 1) {
      const it = itens.find((i) => i.caminho === sel[0]);
      if (it) renomear(it);
    } else if (ctrl && k === "a") setSel(itens.map((i) => i.caminho));
    else if (ctrl && (k === "c" || k === "x") && sel.length) definirArea({ itens: sel, acao: k === "c" ? "copiar" : "mover" });
    else if (ctrl && k === "v") colar();
    else if (e.key === "Escape") setSel([]);
    else return;
    e.preventDefault();
  }

  const icone = (it: ItemMesa) => {
    if (it.tipo === "app") {
      if (it.alba) return <ArteApp id={it.alba as IdArte} />;
      return it.icone ? <img src={it.icone} alt="" draggable={false} /> : <Icone name="globe" size={40} />;
    }
    if (it.tipo === "pasta") return <ArtePasta nome={it.nome} />;
    return <ArteArquivo item={it as unknown as Item} />;
  };

  const opcoes = (m: Menu) => {
    const it = m.item;
    const fazer = (f: () => void) => () => {
      setMenu(null);
      f();
    };
    if (!it)
      return (
        <>
          <button onClick={fazer(novaPasta)}>
            <Icone name="folder" size={16} /> Nova pasta
          </button>
          <button onClick={fazer(novoArquivo)}>
            <Icone name="file" size={16} /> Novo documento de texto
          </button>
          {areaAtual() && (
            <button onClick={fazer(colar)}>
              <Icone name="paste" size={16} /> Colar
            </button>
          )}
          <hr />
          <button onClick={fazer(() => paraCasca({ tipo: "launchpad" }))}>
            <Icone name="grid" size={16} /> Adicionar app…
          </button>
          <button onClick={fazer(() => abrir("arquivos", { inicial: pasta }))}>
            <Icone name="folder" size={16} /> Abrir no Arquivos
          </button>
          <button onClick={fazer(() => abrir("ajustes", { secao: "aparencia" }))}>
            <Icone name="image" size={16} /> Mudar papel de parede…
          </button>
        </>
      );
    const varios = sel.length > 1 && sel.includes(it.caminho);
    return (
      <>
        <button onClick={fazer(() => (varios ? itens.filter((i) => sel.includes(i.caminho)).forEach(abrirItem) : abrirItem(it)))}>
          <Icone name="chevron" size={16} /> Abrir {varios ? `${sel.length} itens` : ""}
        </button>
        {it.tipo !== "app" && (
          <button onClick={fazer(() => definirArea({ itens: varios ? sel : [it.caminho], acao: "copiar" }))}>
            <Icone name="copy" size={16} /> Copiar
          </button>
        )}
        {!varios && (
          <button onClick={fazer(() => renomear(it))}>
            <Icone name="edit" size={16} /> Renomear
          </button>
        )}
        {it.categoria === "imagem" && !varios && (
          <button onClick={fazer(() => api.gravarConfig({ papel: "personalizado", papel_arquivo: it.caminho, papel_definido: true }))}>
            <Icone name="image" size={16} /> Usar como papel de parede
          </button>
        )}
        <hr />
        <button className="perigo" onClick={fazer(() => lixeira(varios ? sel : [it.caminho]))}>
          <Icone name="trash" size={16} /> {it.atalho || it.tipo === "app" ? "Remover atalho" : "Mover para a lixeira"}
        </button>
      </>
    );
  };

  return (
    <div
      className="area-trabalho"
      ref={raiz}
      tabIndex={-1}
      onKeyDown={teclado}
      onPointerDown={(e) => {
        if (!(e.target as HTMLElement).closest(".mesa-item, .menu-contexto")) setSel([]);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        if ((e.target as HTMLElement).closest(".mesa-item")) return;
        setSel([]);
        setMenu({ item: null, x: e.clientX, y: e.clientY });
      }}
    >
      <div className="mesa-grade">
        {itens.map((it) => (
          <button
            key={it.caminho}
            className={`mesa-item ${sel.includes(it.caminho) ? "selecionado" : ""}`}
            title={it.nome}
            onPointerDown={(e) => {
              if (e.button === 2 && sel.includes(it.caminho)) return;
              if (e.ctrlKey) setSel((s) => (s.includes(it.caminho) ? s.filter((x) => x !== it.caminho) : [...s, it.caminho]));
              else setSel([it.caminho]);
            }}
            onDoubleClick={() => abrirItem(it)}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ item: it, x: e.clientX, y: e.clientY });
            }}
          >
            <span className={`mesa-icone ${it.tipo}`}>{icone(it)}</span>
            <span className="mesa-nome">{it.nome.replace(/\.desktop$/, "")}</span>
            {it.atalho && <span className="mesa-seta" aria-label="Atalho" />}
          </button>
        ))}
      </div>
      {menu && (
        <div
          className={`menu-contexto menu-mesa ${config.tema === "escuro" ? "escuro" : ""}`}
          style={{ left: Math.min(menu.x, window.innerWidth - 250), top: Math.min(menu.y, window.innerHeight - 320) }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {opcoes(menu)}
        </div>
      )}
    </div>
  );
}
