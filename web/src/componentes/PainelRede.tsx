import { useEffect, useRef, useState } from "react";
import { type EstadoRede, type RedeWifi, rede } from "../api";
import { ouvirEventos } from "../ponte";
import { Interruptor } from "./Central";
import { Icone } from "./Icone";

/** Força do sinal em 3 barras (como o ícone de Wi-Fi do Mac). */
function Sinal({ valor }: { valor: number }) {
  const nivel = valor >= 67 ? 3 : valor >= 34 ? 2 : 1;
  return (
    <svg className="sinal-wifi" viewBox="0 0 24 24" width="18" height="18" aria-label={`Sinal ${valor}%`}>
      <path d="M3 8.5a14.4 14.4 0 0 1 18 0" className={nivel >= 3 ? "on" : ""} />
      <path d="M6.5 12a9.2 9.2 0 0 1 11 0" className={nivel >= 2 ? "on" : ""} />
      <path d="M10 15.5a4.3 4.3 0 0 1 4 0" className="on" />
      <circle cx="12" cy="19" r="1" className="ponto" />
    </svg>
  );
}

/** Wi-Fi e cabo: clique no ícone de rede da barra. */
export function PainelRede() {
  const [estado, setEstado] = useState<EstadoRede | null>(null);
  const [redes, setRedes] = useState<RedeWifi[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [aberta, setAberta] = useState<string | null>(null);
  const [senha, setSenha] = useState("");
  const [conectando, setConectando] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const campo = useRef<HTMLInputElement>(null);

  const procurar = (forcar: boolean) => {
    setBuscando(true);
    rede
      .redes(forcar)
      .then((r) => setRedes(r.redes))
      .catch(() => setRedes([]))
      .finally(() => setBuscando(false));
  };

  useEffect(() => {
    rede
      .estado()
      .then((e) => {
        setEstado(e);
        if (e.tem_wifi && e.wifi_ligado) {
          procurar(false);
          procurar(true);
        }
      })
      .catch(() => setEstado({ tem_wifi: false, wifi_ligado: false, wifi: null, cabo: null, online: false }));
    return ouvirEventos((m) => m.tipo === "rede" && m.rede && setEstado(m.rede));
  }, []);

  useEffect(() => {
    if (aberta) setTimeout(() => campo.current?.focus(), 30);
  }, [aberta]);

  const ligar = async () => {
    if (!estado) return;
    const ligado = !estado.wifi_ligado;
    setEstado({ ...estado, wifi_ligado: ligado });
    try {
      setEstado(await rede.wifi({ acao: "ligar", ligado }));
      if (ligado) setTimeout(() => procurar(true), 1500);
      else setRedes(null);
    } catch (e: any) {
      setErro(e.message);
    }
  };

  const conectar = async (r: RedeWifi, comSenha?: string) => {
    setErro("");
    if (r.segura && !r.salva && comSenha === undefined) {
      setAberta(r.ssid);
      setSenha("");
      return;
    }
    setConectando(r.ssid);
    try {
      setEstado(await rede.wifi({ acao: "conectar", ssid: r.ssid, senha: comSenha }));
      setAberta(null);
      setSenha("");
      procurar(false);
    } catch (e: any) {
      setErro(e.message);
      if (r.segura) setAberta(r.ssid);
    } finally {
      setConectando(null);
    }
  };

  const desconectar = async () => {
    try {
      setEstado(await rede.wifi({ acao: "desconectar" }));
      procurar(false);
    } catch (e: any) {
      setErro(e.message);
    }
  };

  const esquecer = async (ssid: string) => {
    try {
      setEstado(await rede.wifi({ acao: "esquecer", ssid }));
      procurar(false);
    } catch (e: any) {
      setErro(e.message);
    }
  };

  return (
    <div className="painel-flutuante painel-rede" role="dialog" aria-label="Rede">
      <div className="painel-cabecalho">
        <strong>Wi-Fi</strong>
        {estado?.tem_wifi && <Interruptor ligado={estado.wifi_ligado} rotulo="Wi-Fi ligado" aoMudar={ligar} />}
      </div>

      {estado?.cabo && (
        <div className="rede-linha conectada">
          <span className="rede-icone">
            <Icone name="ethernet" size={16} />
          </span>
          <span className="rede-nome">
            <strong>Cabo de rede</strong>
            <small>Conectado</small>
          </span>
        </div>
      )}

      {estado && !estado.tem_wifi && (
        <p className="painel-nota">
          {estado.cabo ? "Este computador não tem Wi-Fi; a internet chega pelo cabo." : "Nenhuma conexão. Ligue um cabo de rede ou um adaptador Wi-Fi."}
        </p>
      )}

      {estado?.tem_wifi && !estado.wifi_ligado && <p className="painel-nota">O Wi-Fi está desligado.</p>}

      {estado?.tem_wifi && estado.wifi_ligado && (
        <>
          <div className="rede-titulo">
            <small>Redes</small>
            <button className={`rede-atualizar ${buscando ? "girando" : ""}`} onClick={() => procurar(true)} aria-label="Procurar redes" title="Procurar redes">
              <Icone name="restart" size={13} />
            </button>
          </div>
          <div className="rede-lista">
            {redes === null && <p className="painel-nota">Procurando redes…</p>}
            {redes?.length === 0 && !buscando && <p className="painel-nota">Nenhuma rede encontrada.</p>}
            {redes?.map((r) => (
              <div key={r.ssid} className={`rede-item ${r.ativa ? "conectada" : ""}`}>
                <button className="rede-linha" onClick={() => (r.ativa ? undefined : conectar(r))} disabled={!!conectando}>
                  <span className="rede-icone">
                    <Sinal valor={r.sinal} />
                  </span>
                  <span className="rede-nome">
                    <strong>{r.ssid}</strong>
                    <small>{conectando === r.ssid ? "Conectando…" : r.ativa ? "Conectado" : r.salva ? "Rede conhecida" : r.segura ? "Protegida" : "Aberta"}</small>
                  </span>
                  {r.segura && <Icone name="lock" size={13} />}
                </button>
                {r.ativa && (
                  <div className="rede-acoes">
                    <button onClick={desconectar}>Desconectar</button>
                    <button onClick={() => esquecer(r.ssid)}>Esquecer</button>
                  </div>
                )}
                {aberta === r.ssid && !r.ativa && (
                  <form
                    className="rede-senha"
                    onSubmit={(e) => {
                      e.preventDefault();
                      conectar(r, senha);
                    }}
                  >
                    <input
                      ref={campo}
                      type="password"
                      placeholder="Senha da rede"
                      value={senha}
                      onChange={(e) => setSenha(e.target.value)}
                      autoComplete="off"
                      aria-label={`Senha de ${r.ssid}`}
                    />
                    <button type="submit" disabled={senha.length < 8 || !!conectando}>
                      Conectar
                    </button>
                  </form>
                )}
              </div>
            ))}
          </div>
        </>
      )}
      {erro && <p className="rede-erro">{erro}</p>}
    </div>
  );
}
