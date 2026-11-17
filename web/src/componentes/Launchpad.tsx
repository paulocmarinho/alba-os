import { useEffect, useMemo, useRef, useState } from "react";
import { APPS, type IdApp } from "../contexto";
import { MarcaSleeve } from "./Barra";
import { Icone } from "./Icone";

export type AppLista = {
  chave: string;
  tipo: "alba" | "externo";
  app?: IdApp;
  desktop?: string;
  nome: string;
  icone?: string | null;
  busca?: string;
};

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function IconeApp({ app, pequeno }: { app: AppLista; pequeno?: boolean }) {
  if (app.tipo === "alba" && app.app && APPS[app.app]) {
    return (
      <span className={`dock-icon ${APPS[app.app].classe} ${pequeno ? "pequeno" : ""}`}>
        {app.app === "musica" ? <MarcaSleeve /> : <Icone name={APPS[app.app].icone} size={pequeno ? 18 : 40} />}
      </span>
    );
  }
  if (pequeno)
    return (
      <span className="dock-icon externo pequeno">{app.icone ? <img src={app.icone} alt="" draggable={false} /> : <Icone name="grid" size={18} />}</span>
    );
  return (
    <span className="dock-icon externo">
      {app.icone ? <img src={app.icone} alt="" draggable={false} /> : <Icone name="grid" size={36} />}
    </span>
  );
}

/** Todos os aplicativos em grade, com busca: abre pelo dock ou pela tecla Super. */
export function Launchpad({ apps, abrir, fechar }: { apps: AppLista[]; abrir: (a: AppLista) => void; fechar: () => void }) {
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState(0);
  const campo = useRef<HTMLInputElement>(null);
  const lista = useMemo(() => {
    const q = semAcento(busca.trim());
    if (!q) return apps;
    return apps
      .map((a) => {
        const nome = semAcento(a.nome);
        const nota = nome.startsWith(q) ? 0 : nome.includes(q) ? 1 : semAcento(a.busca || "").includes(q) ? 2 : -1;
        return { a, nota };
      })
      .filter((x) => x.nota >= 0)
      .sort((x, y) => x.nota - y.nota)
      .map((x) => x.a);
  }, [apps, busca]);

  useEffect(() => {
    campo.current?.focus();
  }, []);
  useEffect(() => setSel(0), [busca]);

  const tecla = (e: React.KeyboardEvent) => {
    const colunas = Math.max(1, Math.floor((window.innerWidth * 0.8) / 132));
    if (e.key === "Escape") {
      e.preventDefault();
      if (busca) setBusca("");
      else fechar();
    } else if (e.key === "Enter" && lista[sel]) {
      abrir(lista[sel]);
    } else if (e.key === "ArrowRight") {
      setSel((s) => Math.min(lista.length - 1, s + 1));
    } else if (e.key === "ArrowLeft") {
      setSel((s) => Math.max(0, s - 1));
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(lista.length - 1, s + colunas));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(0, s - colunas));
    }
  };

  return (
    <section className="launchpad" onPointerDown={(e) => e.target === e.currentTarget && fechar()} onKeyDown={tecla}>
      <label className="launchpad-busca">
        <Icone name="search" size={16} />
        <input ref={campo} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar aplicativos" aria-label="Buscar aplicativos" />
      </label>
      <div className="launchpad-grade" onPointerDown={(e) => e.target === e.currentTarget && fechar()}>
        {lista.map((a, i) => (
          <button key={a.chave} className={i === sel && busca ? "selecionado" : ""} onClick={() => abrir(a)} title={a.nome}>
            <IconeApp app={a} />
            <span>{a.nome}</span>
          </button>
        ))}
        {lista.length === 0 && <p className="launchpad-vazio">Nenhum aplicativo encontrado.</p>}
      </div>
    </section>
  );
}
