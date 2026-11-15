import { useEffect, useState } from "react";
import { api, type Rede, type Som, type Teclado, tamanhoLegivel } from "../api";
import { useAlba } from "../contexto";
import { Deslizante, Interruptor } from "../componentes/Central";
import { Icone, type NomeIcone } from "../componentes/Icone";

type Secao = "aparencia" | "rede" | "som" | "teclado" | "sobre";

const SECOES: { id: Secao; nome: string; icone: NomeIcone }[] = [
  { id: "aparencia", nome: "Aparência", icone: "palette" },
  { id: "rede", nome: "Rede", icone: "wifi" },
  { id: "som", nome: "Som", icone: "volume" },
  { id: "teclado", nome: "Teclado", icone: "keyboard" },
  { id: "sobre", nome: "Sobre", icone: "info" },
];

const ESCALAS = [
  { valor: 1, nome: "Compacta", texto: "100%" },
  { valor: 1.25, nome: "Padrão", texto: "125%" },
  { valor: 1.5, nome: "Grande", texto: "150%" },
];

const DESTAQUES = [
  { cor: "#5b6ee1", nome: "Anil" },
  { cor: "#3f8fe0", nome: "Azul" },
  { cor: "#8a64d6", nome: "Lavanda" },
  { cor: "#d0608f", nome: "Rosa" },
  { cor: "#2f9c8f", nome: "Verde-água" },
  { cor: "#d9823b", nome: "Âmbar" },
  { cor: "#5d6678", nome: "Grafite" },
];

function duracao(segundos: number) {
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
}

export function Ajustes({ secao: inicial }: { secao?: Secao }) {
  const { config, mudarConfig, sistema, confirmar } = useAlba();

  async function mudarEscala(valor: number) {
    if (valor === config.escala) return;
    const ok = await confirmar({
      titulo: `Mudar o tamanho para ${Math.round(valor * 100)}%?`,
      texto: "A interface vai se redesenhar no novo tamanho. As janelas abertas serão fechadas.",
      ok: "Mudar tamanho",
    });
    if (!ok) return;
    await mudarConfig({ escala: valor });
    await api.recarregar().catch(() => {});
  }
  const [secao, setSecao] = useState<Secao>(inicial || "aparencia");
  const [rede, setRede] = useState<Rede | null>(null);
  const [som, setSom] = useState<Som | null>(null);
  const [teclados, setTeclados] = useState<Teclado[]>([]);
  const [tecladoInicial, setTecladoInicial] = useState(config.teclado);

  useEffect(() => {
    if (inicial) setSecao(inicial);
  }, [inicial]);

  useEffect(() => {
    api.rede().then(setRede).catch(() => {});
    api.som().then(setSom).catch(() => {});
    api
      .config()
      .then((r) => {
        setTeclados(r.teclados);
        setTecladoInicial(r.config.teclado);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="app-ajustes">
      <nav className="ajustes-lado" aria-label="Seções dos ajustes">
        {SECOES.map((s) => (
          <button key={s.id} className={secao === s.id ? "active" : ""} onClick={() => setSecao(s.id)}>
            <span className="ajustes-icone">
              <Icone name={s.icone} size={17} />
            </span>
            {s.nome}
          </button>
        ))}
      </nav>

      <div className="ajustes-conteudo">
        {secao === "aparencia" && (
          <>
            <h2>Aparência</h2>
            <div className="ajuste-grupo">
              <div className="tema-opcoes">
                {(["claro", "escuro"] as const).map((t) => (
                  <button key={t} className={`tema-opcao ${config.tema === t ? "selecionado" : ""}`} onClick={() => mudarConfig({ tema: t })}>
                    <span className={`tema-amostra ${t}`}>
                      <i />
                      <i />
                    </span>
                    {t === "claro" ? "Claro" : "Escuro"}
                  </button>
                ))}
              </div>
            </div>
            <h3>Cor de destaque</h3>
            <div className="ajuste-grupo destaques">
              {DESTAQUES.map((d) => (
                <button
                  key={d.cor}
                  className={`amostra-cor ${config.destaque === d.cor ? "selecionado" : ""}`}
                  style={{ background: d.cor }}
                  aria-label={d.nome}
                  title={d.nome}
                  onClick={() => mudarConfig({ destaque: d.cor })}
                >
                  {config.destaque === d.cor && <Icone name="check" size={16} />}
                </button>
              ))}
            </div>
            <h3>Tamanho da interface</h3>
            <div className="ajuste-grupo escalas">
              {ESCALAS.map((e) => (
                <button key={e.valor} className={`escala-opcao ${config.escala === e.valor ? "selecionado" : ""}`} onClick={() => mudarEscala(e.valor)}>
                  <span className="escala-amostra" style={{ fontSize: `${12 * e.valor}px` }}>
                    Aa
                  </span>
                  <strong>{e.nome}</strong>
                  <small>{e.texto}</small>
                </button>
              ))}
            </div>
            <div className="setting-row">
              <span>
                <Icone name="moon" /> Modo escuro
              </span>
              <Interruptor rotulo="Modo escuro" ligado={config.tema === "escuro"} aoMudar={() => mudarConfig({ tema: config.tema === "escuro" ? "claro" : "escuro" })} />
            </div>
          </>
        )}

        {secao === "rede" && (
          <>
            <h2>Rede</h2>
            <div className="ajuste-grupo">
              <div className="setting-row">
                <span>
                  <Icone name="wifi" /> Internet
                </span>
                <strong className={rede?.online ? "ok" : ""}>{rede ? (rede.online ? "Conectado" : "Sem conexão") : "Verificando…"}</strong>
              </div>
              {rede?.conexoes.map((c) => (
                <div className="setting-row" key={c.dispositivo}>
                  <span>
                    <Icone name={c.tipo === "wifi" ? "wifi" : "monitor"} /> {c.nome || c.dispositivo}
                  </span>
                  <small>
                    {c.tipo === "ethernet" ? "Cabo" : c.tipo === "wifi" ? "Wi‑Fi" : c.tipo} · {c.estado}
                  </small>
                </div>
              ))}
              {rede?.ips.length ? (
                <div className="setting-row">
                  <span>
                    <Icone name="info" /> Endereço IP
                  </span>
                  <strong>{rede.ips.join(", ")}</strong>
                </div>
              ) : null}
            </div>
            <p className="dica">Conexões por cabo entram sozinhas. Redes Wi‑Fi com senha chegam numa próxima versão do Alba OS.</p>
          </>
        )}

        {secao === "som" && (
          <>
            <h2>Som</h2>
            {som && !som.disponivel ? (
              <p className="dica">Nenhuma saída de áudio encontrada neste computador.</p>
            ) : (
              <div className="ajuste-grupo">
                <div className="control-slider-card">
                  <label>Volume · {som?.volume ?? 0}%</label>
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
                <div className="setting-row">
                  <span>
                    <Icone name="volume" /> Sem som
                  </span>
                  <Interruptor rotulo="Sem som" ligado={!!som?.mudo} aoMudar={() => api.gravarSom({ mudo: !som?.mudo }).then(setSom)} />
                </div>
              </div>
            )}
          </>
        )}

        {secao === "teclado" && (
          <>
            <h2>Teclado</h2>
            <div className="ajuste-grupo">
              {teclados.map((t) => (
                <button type="button" role="radio" aria-checked={config.teclado === t.id} key={t.id} className={`opcao-lista ${config.teclado === t.id ? "selecionado" : ""}`} onClick={() => mudarConfig({ teclado: t.id })}>
                  <Icone name="keyboard" size={18} />
                  <span>{t.nome}</span>
                  {config.teclado === t.id && <Icone name="check" size={17} />}
                </button>
              ))}
            </div>
            {config.teclado !== tecladoInicial && <p className="dica destaque">O novo teclado passa a valer no próximo login (reinicie o computador).</p>}
            <label className="campo">
              <span>Teste o teclado aqui</span>
              <input placeholder="Digite acentos: ç, ã, é…" />
            </label>
          </>
        )}

        {secao === "sobre" && (
          <>
            <div className="settings-hero">
              <Icone name="logo" size={54} />
              <div>
                <h2>Alba OS</h2>
                <p>Linux, com luz própria · versão {sistema.versao}</p>
              </div>
            </div>
            <div className="ajuste-grupo">
              {[
                ["Computador", sistema.maquina],
                ["Usuário", `${sistema.nome} (${sistema.usuario})`],
                ["Processador", `${sistema.processador} · ${sistema.nucleos} núcleos`],
                ["Memória", `${tamanhoLegivel(sistema.memoria_usada)} usados de ${tamanhoLegivel(sistema.memoria_total)}`],
                ["Armazenamento", `${tamanhoLegivel(sistema.disco_usado)} usados de ${tamanhoLegivel(sistema.disco_total)}`],
                ["Kernel", `Linux ${sistema.kernel}`],
                ["Ligado há", duracao(sistema.ligado_segundos)],
              ].map(([k, v]) => (
                <div className="setting-row" key={k}>
                  <span>{k}</span>
                  <strong>{v}</strong>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
