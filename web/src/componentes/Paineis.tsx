import { useEffect, useMemo, useState } from "react";
import { api, type Som } from "../api";
import { useAlba } from "../contexto";
import { Deslizante, Interruptor } from "./Central";
import { Icone } from "./Icone";

/** Volume: clique no ícone de som da barra. */
export function PainelSom() {
  const [som, setSom] = useState<Som | null>(null);
  useEffect(() => {
    api.som().then(setSom).catch(() => {});
  }, []);
  const mudar = (m: Partial<Som>) => {
    setSom((s) => (s ? { ...s, ...m } : s));
    api.gravarSom(m).then(setSom).catch(() => {});
  };
  return (
    <div className="painel-flutuante painel-som" role="dialog" aria-label="Som">
      <div className="painel-cabecalho">
        <strong>Som</strong>
        <Interruptor ligado={!!som && !som.mudo} rotulo="Som ligado" aoMudar={() => som && mudar({ mudo: !som.mudo })} />
      </div>
      {som?.disponivel ? (
        <>
          <Deslizante valor={som.mudo ? 0 : som.volume} rotulo="Volume" icone={som.mudo ? "mute" : "volume"} aoMudar={(v) => mudar({ volume: v, mudo: false, bip: true })} />
          <small className="painel-nota">
            {som.placa === false
              ? "Este computador não tem placa de som. No Hyper-V, máquinas Linux não recebem áudio."
              : som.mudo
                ? "Sem som"
                : `Volume em ${som.volume}%`}
          </small>
        </>
      ) : (
        <small className="painel-nota">Nenhuma saída de som encontrada.</small>
      )}
    </div>
  );
}

const DIAS = ["D", "S", "T", "Q", "Q", "S", "S"];

/** Calendário do mês: clique na data da barra. */
export function PainelCalendario() {
  const { agora } = useAlba();
  const [mes, setMes] = useState(() => new Date(agora.getFullYear(), agora.getMonth(), 1));
  const titulo = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(mes);
  const dias = useMemo(() => {
    const inicio = new Date(mes.getFullYear(), mes.getMonth(), 1 - mes.getDay());
    return Array.from({ length: 42 }, (_, i) => new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i));
  }, [mes]);
  const hoje = (d: Date) => d.toDateString() === agora.toDateString();
  const mover = (n: number) => setMes((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));
  return (
    <div className="painel-flutuante painel-calendario" role="dialog" aria-label="Calendário">
      <div className="painel-cabecalho">
        <strong className="mes">{titulo}</strong>
        <span className="cal-nav">
          <button aria-label="Mês anterior" onClick={() => mover(-1)}>
            <span className="espelhado">
              <Icone name="chevron" size={16} />
            </span>
          </button>
          <button className="cal-hoje" onClick={() => setMes(new Date(agora.getFullYear(), agora.getMonth(), 1))}>
            Hoje
          </button>
          <button aria-label="Próximo mês" onClick={() => mover(1)}>
            <Icone name="chevron" size={16} />
          </button>
        </span>
      </div>
      <div className="cal-grade">
        {DIAS.map((d, i) => (
          <span key={i} className="cal-semana">
            {d}
          </span>
        ))}
        {dias.map((d) => (
          <span key={d.toISOString()} className={`cal-dia ${d.getMonth() !== mes.getMonth() ? "fora" : ""} ${hoje(d) ? "hoje" : ""}`}>
            {d.getDate()}
          </span>
        ))}
      </div>
      <small className="painel-nota">
        {new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(agora)}
      </small>
    </div>
  );
}
