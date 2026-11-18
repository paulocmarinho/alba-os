import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, arquivosExtra, type Item, type ItemMesa, mesa } from "../api";
import { type IdApp, APPS, useAlba } from "../contexto";
import { ouvirEventos, paraCasca, publicarEvento } from "../ponte";
import { ArteArquivo, ArtePasta, areaAtual, definirArea } from "../apps/Arquivos";
import { ArteApp, type IdArte } from "./ArteApps";
import { Icone } from "./Icone";

type Menu = { item: ItemMesa | null; x: number; y: number };

// Grade dos ícones (px da página): margem de cima (barra), de baixo (dock), da direita e tamanho da célula.
const TOPO = 54;
const BAIXO = 110;
const DIREITA = 18;
const CEL_L = 104;
const CEL_A = 116;

/**
 * Ícones na área de trabalho (a pasta ~/Área de Trabalho), em colunas a partir da direita,
 * com menu de clique direito: nova pasta, novo documento, colar, papel de parede…
 */
export function AreaDeTrabalho() {
  const { abrir, aviso, perguntar, confirmar, config, mudarConfig } = useAlba();
  const [pasta, setPasta] = useState("");
  const [itens, setItens] = useState<ItemMesa[]>([]);
  const [sel, setSel] = useState<string[]>([]);
  const [menu, setMenu] = useState<Menu | null>(null);
  const raiz = useRef<HTMLDivElement>(null);
  const [tela, setTela] = useState({ l: window.innerWidth, a: window.innerHeight });
  useEffect(() => {
    const f = () => setTela({ l: window.innerWidth, a: window.innerHeight });
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);

  // ---- lugares na grade (coluna 0 = direita, como no Mac); o que o usuário arrastou fica salvo
  const linhas = Math.max(1, Math.floor((tela.a - TOPO - BAIXO) / CEL_A));
  const colunas = Math.max(1, Math.floor((tela.l - DIREITA - 20) / CEL_L));
  const nomeDe = (it: ItemMesa) => it.caminho.split("/").pop() || it.nome;
  const salvas = config.mesa_posicoes || {};
  const lugares = useMemo(() => {
    const ocupado = new Set<string>();
    const mapa = new Map<string, [number, number]>();
    for (const it of itens) {
      const p = salvas[nomeDe(it)];
      if (p && p[0] < colunas && p[1] < linhas && !ocupado.has(`${p[0]},${p[1]}`)) {
        mapa.set(it.caminho, p);
        ocupado.add(`${p[0]},${p[1]}`);
      }
    }
    let c = 0;
    let l = 0;
    for (const it of itens) {
      if (mapa.has(it.caminho)) continue;
      while (ocupado.has(`${c},${l}`)) {
        l++;
        if (l >= linhas) (l = 0), c++;
      }
      mapa.set(it.caminho, [c, l]);
      ocupado.add(`${c},${l}`);
    }
    return mapa;
  }, [itens, salvas, linhas, colunas]);

  // ---- arrastar ícones
  type Arraste = { caminhos: string[]; x0: number; y0: number; dx: number; dy: number; ativo: boolean };
  const [arraste, setArraste] = useState<Arraste | null>(null);
  const arrasteRef = useRef<Arraste | null>(null);
  const acabouDeArrastar = useRef(false);
  const mudarArraste = (a: Arraste | null) => {
    arrasteRef.current = a;
    setArraste(a);
  };

  function celulaEm(x: number, y: number): [number, number] {
    const c = Math.min(colunas - 1, Math.max(0, Math.floor((tela.l - DIREITA - x) / CEL_L)));
    const l = Math.min(linhas - 1, Math.max(0, Math.floor((y - TOPO) / CEL_A)));
    return [c, l];
  }

  function soltarIcones(e: React.PointerEvent) {
    const a = arrasteRef.current;
    mudarArraste(null);
    if (!a?.ativo) return;
    acabouDeArrastar.current = true;
    window.setTimeout(() => (acabouDeArrastar.current = false), 60);
    const [c, l] = celulaEm(e.clientX, e.clientY);
    // Soltou em cima de uma pasta: move para dentro dela.
    const alvo = itens.find((i) => !a.caminhos.includes(i.caminho) && i.tipo === "pasta" && lugares.get(i.caminho)?.[0] === c && lugares.get(i.caminho)?.[1] === l);
    if (alvo) {
      arquivosExtra
        .colar(a.caminhos, alvo.caminho, "mover")
        .then(mudou)
        .catch((er) => aviso(er.message));
      return;
    }
    // Cada ícone anda o mesmo tanto que o que foi pego; se o lugar estiver ocupado, vai para o vazio mais perto.
    const principal = lugares.get(a.caminhos[0]) || [0, 0];
    const dc = c - principal[0];
    const dl = l - principal[1];
    const novas: Record<string, [number, number]> = {};
    const ocupado = new Set<string>();
    for (const it of itens) {
      if (a.caminhos.includes(it.caminho)) continue;
      const p = lugares.get(it.caminho)!;
      novas[nomeDe(it)] = p;
      ocupado.add(`${p[0]},${p[1]}`);
    }
    for (const cam of a.caminhos) {
      const p = lugares.get(cam) || [0, 0];
      let alvoC = Math.min(colunas - 1, Math.max(0, p[0] + dc));
      let alvoL = Math.min(linhas - 1, Math.max(0, p[1] + dl));
      if (ocupado.has(`${alvoC},${alvoL}`)) {
        let melhor: [number, number] | null = null;
        let dist = Infinity;
        for (let cc = 0; cc < colunas; cc++)
          for (let ll = 0; ll < linhas; ll++) {
            if (ocupado.has(`${cc},${ll}`)) continue;
            const d = (cc - alvoC) ** 2 + (ll - alvoL) ** 2;
            if (d < dist) (dist = d), (melhor = [cc, ll]);
          }
        if (!melhor) continue;
        [alvoC, alvoL] = melhor;
      }
      ocupado.add(`${alvoC},${alvoL}`);
      const it = itens.find((i) => i.caminho === cam);
      if (it) novas[nomeDe(it)] = [alvoC, alvoL];
    }
    mudarConfig({ mesa_posicoes: novas });
  }

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
          <button onClick={fazer(() => mudarConfig({ mesa_posicoes: {} }))}>
            <Icone name="grid" size={16} /> Organizar ícones por nome
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
      <div className={`mesa-grade ${arraste?.ativo ? "arrastando" : ""}`}>
        {arraste?.ativo &&
          (() => {
            const [c, l] = celulaEm(arraste.x0 + arraste.dx, arraste.y0 + arraste.dy);
            return <span className="mesa-alvo" style={{ right: DIREITA + c * CEL_L, top: TOPO + l * CEL_A }} />;
          })()}
        {itens.map((it) => {
          const [c, l] = lugares.get(it.caminho) || [0, 0];
          const movendo = arraste?.ativo && arraste.caminhos.includes(it.caminho);
          return (
          <button
            key={it.caminho}
            className={`mesa-item ${sel.includes(it.caminho) ? "selecionado" : ""} ${movendo ? "movendo" : ""}`}
            title={it.nome}
            style={{ right: DIREITA + c * CEL_L, top: TOPO + l * CEL_A, transform: movendo ? `translate(${arraste!.dx}px, ${arraste!.dy}px)` : undefined }}
            onPointerDown={(e) => {
              if (e.button === 2 && sel.includes(it.caminho)) return;
              let grupo = [it.caminho];
              if (e.ctrlKey) setSel((s) => (s.includes(it.caminho) ? s.filter((x) => x !== it.caminho) : [...s, it.caminho]));
              else if (sel.includes(it.caminho)) grupo = sel;
              else setSel([it.caminho]);
              if (e.button !== 0 || e.ctrlKey) return;
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              mudarArraste({ caminhos: grupo, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, ativo: false });
            }}
            onPointerMove={(e) => {
              const a = arrasteRef.current;
              if (!a) return;
              const dx = e.clientX - a.x0;
              const dy = e.clientY - a.y0;
              if (!a.ativo && Math.hypot(dx, dy) < 6) return;
              mudarArraste({ ...a, dx, dy, ativo: true });
            }}
            onPointerUp={soltarIcones}
            onPointerCancel={() => mudarArraste(null)}
            onDoubleClick={() => !acabouDeArrastar.current && abrirItem(it)}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ item: it, x: e.clientX, y: e.clientY });
            }}
          >
            <span className={`mesa-icone ${it.tipo}`}>{icone(it)}</span>
            <span className="mesa-nome">{it.nome.replace(/\.desktop$/, "")}</span>
            {it.atalho && <span className="mesa-seta" aria-label="Atalho" />}
          </button>
          );
        })}
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
