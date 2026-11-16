import { useEffect, useState } from "react";
import { api, type Rede, type Som } from "../api";
import { dataSemAno, hora, useAlba } from "../contexto";
import { Icone } from "./Icone";
import { comandoMusica } from "../apps/Musica";


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
  const { agora, config, mudarConfig, abrir, bloquear, energia, sistema, tocando } = useAlba();
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

      <div className="control-grid blocos">
        <button className={`control-tile ${rede?.online ? "on" : ""}`} onClick={() => abrir("ajustes", { secao: "rede" })}>
          <span className="round-icon">
            <Icone name="wifi" size={18} />
          </span>
          <span>
            <strong>Rede</strong>
            <small>{rede ? (rede.online ? conexao?.nome || rede.ips[0] || "Conectado" : "Sem conexão") : "Verificando…"}</small>
          </span>
        </button>
        <button className={`control-tile ${escuro ? "on" : ""}`} onClick={() => mudarConfig({ tema: escuro ? "claro" : "escuro" })} aria-pressed={escuro}>
          <span className="round-icon">
            <Icone name="moon" size={18} />
          </span>
          <span>
            <strong>Modo escuro</strong>
            <small>{escuro ? "Ativado" : "Desativado"}</small>
          </span>
        </button>
        <button className="control-tile largo" onClick={() => abrir("ajustes", { secao: "aparencia" })}>
          <span className="round-icon">
            <Icone name="palette" size={18} />
          </span>
          <span>
            <strong>Aparência</strong>
            <small>Cor de destaque, tema e tamanho da interface</small>
          </span>
        </button>
      </div>

      {tocando && (
        <div className="tocando-card" style={{ "--cor-capa": tocando.cor || "#6c5bd4" } as React.CSSProperties}>
          <button className="tocando-capa" onClick={() => abrir("musica")} aria-label="Abrir o Sleeve">
            {tocando.capa ? <img src={tocando.capa} alt="" draggable={false} /> : <Icone name="music" size={22} />}
          </button>
          <span className="tocando-texto">
            <small>Sleeve</small>
            <strong>{tocando.titulo}</strong>
            <span>{tocando.artista}</span>
          </span>
          <span className="tocando-botoes">
            <button onClick={() => comandoMusica("previous")} aria-label="Anterior">
              <span className="espelhado"><Icone name="skip" size={16} /></span>
            </button>
            <button onClick={() => comandoMusica("toggle")} aria-label={tocando.tocando ? "Pausar" : "Tocar"}>
              <Icone name={tocando.tocando ? "pause" : "play"} size={18} />
            </button>
            <button onClick={() => comandoMusica("next")} aria-label="Próxima">
              <Icone name="skip" size={16} />
            </button>
          </span>
        </div>
      )}

      <div className="control-slider-card">
        <label>Som {som && !som.disponivel && <em>· sem saída de áudio</em>}</label>
        <Deslizante
          icone="volume"
          rotulo="Volume"
          valor={som?.volume ?? 0}
          aoMudar={(v) => {
            setSom((s) => (s ? { ...s, volume: v } : s));
            api.gravarSom({ volume: v, bip: true }).then(setSom).catch(() => {});
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
