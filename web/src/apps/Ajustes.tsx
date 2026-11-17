import { useEffect, useState } from "react";
import { api, type InfoAtualizacao, type Rede, type Som, type Teclado, tamanhoLegivel } from "../api";
import { useAlba } from "../contexto";
import { creditoDoPapel, PAPEIS } from "../papeis";
import { Deslizante, Interruptor } from "../componentes/Central";
import { Icone, type NomeIcone } from "../componentes/Icone";
import { AjustesApps, AtualizarTudo } from "./AjustesApps";

type Secao = "aparencia" | "apps" | "rede" | "som" | "teclado" | "sobre";

const SECOES: { id: Secao; nome: string; icone: NomeIcone }[] = [
  { id: "aparencia", nome: "Aparência", icone: "palette" },
  { id: "apps", nome: "Apps", icone: "grid" },
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
  { cor: "#e0662f", nome: "Pôr do sol" },
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

export function Ajustes({ secao: inicial, vez, app }: { secao?: Secao; vez?: number; app?: string }) {
  const { config, mudarConfig, sistema, perguntar } = useAlba();

  async function escolherImagem() {
    const caminho = await perguntar({
      titulo: "Usar uma imagem sua",
      texto: "Caminho da imagem (JPG, PNG ou WebP). Dica: no Arquivos, clique com o botão direito numa foto e escolha “Usar como papel de parede”.",
      valor: config.papel_arquivo || "~/Imagens/",
      ok: "Usar",
    });
    if (caminho) await mudarConfig({ papel: "personalizado", papel_arquivo: caminho.trim(), papel_definido: true });
  }

  async function mudarEscala(valor: number) {
    if (valor !== config.escala) await mudarConfig({ escala: valor });
  }
  const [secao, setSecao] = useState<Secao>(inicial || "aparencia");
  // Já aberto e pedido de novo com outra seção (ex.: "Sobre este computador"): vai para ela.
  useEffect(() => {
    if (inicial) setSecao(inicial);
  }, [inicial, vez]);
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
        {secao === "apps" && <AjustesApps buscaInicial={app} />}
        {secao === "aparencia" && (
          <>
            <h2>Aparência</h2>
            <h3>Papel de parede</h3>
            <div className="ajuste-grupo papeis">
              {PAPEIS.map((p) => (
                <button
                  key={p.id}
                  className={`papel-opcao ${config.papel === p.id ? "selecionado" : ""}`}
                  onClick={() => mudarConfig({ papel: p.id, papel_definido: true, destaque: p.destaque })}
                >
                  <span className={`papel-amostra papel-${p.id}`} style={p.mini ? { backgroundImage: `url(${p.mini})` } : undefined} />
                  {p.nome}
                </button>
              ))}
              <button className={`papel-opcao ${config.papel === "personalizado" ? "selecionado" : ""}`} onClick={escolherImagem}>
                <span
                  className="papel-amostra papel-sua"
                  style={config.papel === "personalizado" && config.papel_arquivo ? { backgroundImage: `url(${api.urlArquivo(config.papel_arquivo)})` } : undefined}
                >
                  {config.papel !== "personalizado" && <Icone name="image" size={22} />}
                </span>
                Sua imagem…
              </button>
            </div>
            {creditoDoPapel(config) && (() => {
              const c = creditoDoPapel(config)!;
              return (
                <div className="ajuste-grupo credito-papel">
                  <span className="credito-icone">
                    <Icone name="camera" size={18} />
                  </span>
                  <span className="credito-texto">
                    <strong>Foto de {c.autor}</strong>
                    <small>
                      {c.local} · {c.fonte}
                    </small>
                  </span>
                  <a className="credito-link" href={c.perfil} target="_blank" rel="noreferrer">
                    Ver mais fotos
                  </a>
                  {c.doacao && (
                    <a className="credito-apoiar" href={c.doacao} target="_blank" rel="noreferrer">
                      <Icone name="heart" size={14} /> Apoiar o fotógrafo
                    </a>
                  )}
                </div>
              );
            })()}
            <h3>Tema</h3>
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
                <p>Um novo dia para o Linux · versão {sistema.versao}</p>
              </div>
            </div>
            {!sistema.live && <AtualizarTudo />}
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

function quando(segundos: number) {
  if (!segundos) return "";
  return new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(segundos * 1000));
}

/** Atualizações pelo GitHub: baixa só a interface e o sistema do Alba (alguns MB), sem reinstalar. */
function Atualizacoes() {
  const { confirmar, aviso } = useAlba();
  const [info, setInfo] = useState<InfoAtualizacao | null>(null);
  const [estado, setEstado] = useState<"procurando" | "pronto" | "instalando" | "erro">("procurando");
  const [erro, setErro] = useState("");

  async function procurar() {
    setEstado("procurando");
    try {
      setInfo(await api.verAtualizacao());
      setEstado("pronto");
    } catch (e: any) {
      setErro(e.message);
      setEstado("erro");
    }
  }

  async function instalar() {
    const ok = await confirmar({
      titulo: "Instalar a atualização?",
      texto: "Leva alguns segundos. Depois a interface reinicia sozinha; as janelas abertas serão fechadas.",
      ok: "Atualizar agora",
    });
    if (!ok) return;
    setEstado("instalando");
    try {
      await api.instalarAtualizacao();
      aviso("Alba OS atualizado. Reiniciando a interface…");
      await api.recarregar(true);
    } catch (e: any) {
      setErro(e.message);
      setEstado("erro");
    }
  }

  useEffect(() => {
    procurar();
  }, []);

  const atual = info?.atual;
  let texto = "Procurando atualizações…";
  if (estado === "instalando") texto = "Baixando e instalando…";
  else if (estado === "erro") texto = erro;
  else if (info?.erro) texto = info.erro;
  else if (info?.disponivel && info.nova) texto = `Nova versão ${info.nova.versao} (${info.nova.commit.slice(0, 7)}) de ${quando(info.nova.data)}.`;
  else if (info) texto = "O Alba OS está atualizado.";

  return (
    <div className="ajuste-grupo atualizacoes">
      <div className="setting-row">
        <span className="atualizacao-texto">
          <strong>Atualizações</strong>
          <small>{texto}</small>
          {atual?.commit && (
            <small className="discreto">
              Instalado: {atual.versao} ({atual.commit.slice(0, 7)}){atual.data ? `, de ${quando(atual.data)}` : ""}
            </small>
          )}
        </span>
        {info?.disponivel && estado !== "instalando" ? (
          <button className="botao-destaque" onClick={instalar}>
            Atualizar agora
          </button>
        ) : (
          <button className="botao-secundario" onClick={procurar} disabled={estado === "procurando" || estado === "instalando"}>
            {estado === "instalando" ? "Atualizando…" : "Procurar"}
          </button>
        )}
      </div>
    </div>
  );
}
