import { useEffect, useState } from "react";
import { api, type Rede, type Som } from "../api";
import { dataSemAno, hora, useLumen } from "../contexto";
import { Icone } from "./Icone";

export function Interruptor({ ligado, aoMudar, rotulo }: { ligado: boolean; aoMudar: () => void; rotulo: string }) {
  return (
    <button className={`switch ${ligado ? "on" : ""}`} role="switch" aria-checked={ligado} aria-label={rotulo} onClick={aoMudar}>
      <span />
    </button>
  );
}

export function Deslizante({
  valor,
  aoMudar,
  rotulo,
  icone,
}: {
  valor: number;
  aoMudar: (v: number) => void;
  rotulo: string;
  icone: Parameters<typeof Icone>[0]["name"];
}) {
  return (
    <div className="slider-wrap">
      <span className="slider-fill" style={{ width: `${valor}%` }} />
      <Icone name={icone} size={18} />
      <input type="range" min={0} max={100} value={valor} aria-label={rotulo} onChange={(e) => aoMudar(Number(e.target.value))} />
    </div>
  );
}

/** Central de controle: rede, tema, volume e energia — tudo real. */
export function Central({ fechar }: { fechar: () => void }) {
  const { agora, config, mudarConfig, abrir, bloquear, energia, sistema } = useLumen();
  const [rede, setRede] = useState<Rede | null>(null);
  const [som, setSom] = useState<Som | null>(null);

  useEffect(() => {
    api.rede().then(setRede).catch(() => {});
    api.som().then(setSom).catch(() => {});
  }, []);

  const conexao = rede?.conexoes.find((c) => c.estado.startsWith("connected") || c.estado.startsWith("conectado"));
  const escuro = config.tema === "escuro";

  return (
    <aside className="control-center" aria-label="Central de controle">
      <div className="control-heading">
        <div>
          <span>{dataSemAno(agora)}</span>
          <strong>{hora(agora)}</strong>
        </div>
        <button onClick={fechar} aria-label="Fechar central">
          <Icone name="chevron" size={18} />
        </button>
      </div>

      <div className="control-grid">
        <div className="connection-card">
          <button className={`connection-row ${rede?.online ? "enabled" : ""}`} onClick={() => abrir("ajustes", { secao: "rede" })}>
            <span className="round-icon">
              <Icone name="wifi" size={19} />
            </span>
            <span>
              <strong>Rede</strong>
              <small>{rede ? (rede.online ? conexao?.nome || rede.ips[0] || "Conectado" : "Sem conexão") : "Verificando…"}</small>
            </span>
          </button>
          <div className={`connection-row ${escuro ? "enabled" : ""}`}>
            <span className="round-icon">
              <Icone name="moon" size={19} />
            </span>
            <span>
              <strong>Modo escuro</strong>
              <small>{escuro ? "Ativado" : "Desativado"}</small>
            </span>
            <Interruptor rotulo="Modo escuro" ligado={escuro} aoMudar={() => mudarConfig({ tema: escuro ? "claro" : "escuro" })} />
          </div>
        </div>
        <button className="focus-card" onClick={() => abrir("ajustes", { secao: "aparencia" })}>
          <span className="round-icon">
            <Icone name="palette" size={20} />
          </span>
          <span>
            <strong>Aparência</strong>
            <small>Cores e tema</small>
          </span>
        </button>
      </div>

      <div className="control-slider-card">
        <label>Som {som && !som.disponivel && <em>· sem saída de áudio</em>}</label>
        <Deslizante
          icone="volume"
          rotulo="Volume"
          valor={som?.volume ?? 0}
          aoMudar={(v) => {
            setSom((s) => (s ? { ...s, volume: v } : s));
            api.gravarSom({ volume: v }).then(setSom).catch(() => {});
          }}
        />
      </div>

      <div className="energia-card">
        {!sistema.live && (
          <button onClick={bloquear}>
            <Icone name="lock" size={18} /> Bloquear
          </button>
        )}
        <button onClick={() => energia("reiniciar")}>
          <Icone name="restart" size={18} /> Reiniciar
        </button>
        <button className="perigo" onClick={() => energia("desligar")}>
          <Icone name="power" size={18} /> Desligar
        </button>
      </div>
    </aside>
  );
}
