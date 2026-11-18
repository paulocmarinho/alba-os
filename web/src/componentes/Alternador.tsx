import { useEffect, useRef, useState } from "react";
import { IconeAlba } from "./ArteApps";
import { APPS, type IdApp } from "../contexto";
import { daCasca, paraCasca } from "../ponte";
import { Icone } from "./Icone";

export type JanelaAlt = {
  id: number;
  tipo: "alba" | "externo";
  app?: IdApp;
  nome: string;
  titulo: string;
  icone?: string | null;
  minimizada: boolean;
};

function IconeJanela({ j }: { j: JanelaAlt }) {
  if (j.tipo === "alba" && j.app && APPS[j.app])
    return (
      <IconeAlba id={j.app} />
    );
  return (
    <span className="dock-icon externo">{j.icone ? <img src={j.icone} alt="" draggable={false} /> : <Icone name="grid" size={40} />}</span>
  );
}

/** Alt+Tab: as janelas abertas, da usada por último para a mais antiga. Soltar o Alt escolhe. */
export function Alternador({ janelas, inicial }: { janelas: JanelaAlt[]; inicial: number }) {
  const [sel, setSel] = useState(inicial);
  const selRef = useRef(sel);
  selRef.current = sel;

  const mover = (d: number) => setSel((s) => (s + d + janelas.length) % janelas.length);
  const escolher = (i = selRef.current) => janelas[i] && paraCasca({ tipo: "alternarIr", id: janelas[i].id });

  useEffect(
    () =>
      daCasca((m) => {
        if (m.tipo === "alternarMover") mover(m.direcao === -1 ? -1 : 1);
        if (m.tipo === "alternarEscolher") escolher();
      }),
    [janelas],
  );

  useEffect(() => {
    const baixo = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        e.preventDefault();
        mover(e.shiftKey ? -1 : 1);
      } else if (e.key === "ArrowRight") mover(1);
      else if (e.key === "ArrowLeft") mover(-1);
      else if (e.key === "Enter") escolher();
      else if (e.key === "Escape") paraCasca({ tipo: "fecharSobre" });
    };
    const cima = (e: KeyboardEvent) => {
      if (e.key === "Alt" || e.key === "Meta" || e.key === "Super" || e.key === "OS") escolher();
    };
    window.addEventListener("keydown", baixo);
    window.addEventListener("keyup", cima);
    return () => {
      window.removeEventListener("keydown", baixo);
      window.removeEventListener("keyup", cima);
    };
  }, [janelas]);

  const atual = janelas[sel];
  return (
    <section className="alternador-fundo" onPointerDown={(e) => e.target === e.currentTarget && paraCasca({ tipo: "fecharSobre" })}>
      <div className="alternador" role="listbox" aria-label="Janelas abertas">
        <div className="alternador-icones">
          {janelas.map((j, i) => (
            <button
              key={j.id}
              role="option"
              aria-selected={i === sel}
              className={`${i === sel ? "selecionado" : ""} ${j.minimizada ? "minimizada" : ""}`}
              onPointerEnter={() => setSel(i)}
              onClick={() => escolher(i)}
              title={j.titulo || j.nome}
            >
              <IconeJanela j={j} />
            </button>
          ))}
        </div>
        {atual && (
          <p className="alternador-titulo">
            <strong>{atual.nome}</strong>
            {atual.titulo && atual.titulo !== atual.nome && <span>{atual.titulo}</span>}
          </p>
        )}
      </div>
    </section>
  );
}
