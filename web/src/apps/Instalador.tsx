import { useEffect, useMemo, useRef, useState } from "react";
import { abrirSocket, api, type Disco, type Teclado, tamanhoLegivel } from "../api";
import { useAlba } from "../contexto";
import { Icone } from "../componentes/Icone";

type Passo = "boasvindas" | "regiao" | "disco" | "usuario" | "resumo" | "instalando" | "pronto" | "falhou";
const PASSOS: { id: Passo; nome: string }[] = [
  { id: "boasvindas", nome: "Boas-vindas" },
  { id: "regiao", nome: "Região e teclado" },
  { id: "disco", nome: "Disco" },
  { id: "usuario", nome: "Sua conta" },
  { id: "resumo", nome: "Resumo" },
  { id: "instalando", nome: "Instalação" },
];

function nomeUsuario(nome: string) {
  const base = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/\s+/)[0]
    ?.replace(/[^a-z0-9_-]/g, "");
  return base && /^[a-z_]/.test(base) ? base.slice(0, 32) : "";
}

/** Instalador do Alba OS: apaga o disco escolhido e instala o sistema. */
export function Instalador() {
  const { energia, confirmar } = useAlba();
  const [passo, setPasso] = useState<Passo>("boasvindas");
  const [fusos, setFusos] = useState<string[]>([]);
  const [teclados, setTeclados] = useState<Teclado[]>([]);
  const [discos, setDiscos] = useState<Disco[] | null>(null);
  const [erroDiscos, setErroDiscos] = useState("");
  const [fuso, setFuso] = useState("America/Sao_Paulo");
  const [teclado, setTeclado] = useState("br");
  const [disco, setDisco] = useState("");
  const [nome, setNome] = useState("");
  const [usuario, setUsuario] = useState("");
  const [usuarioEditado, setUsuarioEditado] = useState(false);
  const [maquina, setMaquina] = useState("alba");
  const [senha, setSenha] = useState("");
  const [senha2, setSenha2] = useState("");
  const [progresso, setProgresso] = useState(0);
  const [etapa, setEtapa] = useState("Preparando…");
  const [registro, setRegistro] = useState<string[]>([]);
  const [verRegistro, setVerRegistro] = useState(false);
  const fimRegistro = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .fusos()
      .then((r) => {
        setFusos(r.fusos);
        setTeclados(r.teclados);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (passo !== "disco") return;
    setDiscos(null);
    api
      .discos()
      .then((r) => {
        setDiscos(r.discos);
        if (r.discos.length === 1) setDisco(r.discos[0].caminho);
      })
      .catch((e) => setErroDiscos(e.message));
  }, [passo]);

  useEffect(() => {
    if (!usuarioEditado) setUsuario(nomeUsuario(nome));
  }, [nome, usuarioEditado]);

  useEffect(() => {
    fimRegistro.current?.scrollIntoView({ block: "end" });
  }, [registro, verRegistro]);

  const usuarioValido = /^[a-z_][a-z0-9_-]{0,31}$/.test(usuario) && !["root", "alba"].includes(usuario);
  const maquinaValida = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,62}$/.test(maquina);
  const senhaOk = senha.length >= 4 && senha === senha2;
  const contaOk = nome.trim().length > 0 && usuarioValido && maquinaValida && senhaOk;
  const discoEscolhido = useMemo(() => discos?.find((d) => d.caminho === disco), [discos, disco]);
  const indice = PASSOS.findIndex((p) => p.id === (passo === "pronto" || passo === "falhou" ? "instalando" : passo));

  async function instalar() {
    const ok = await confirmar({
      titulo: "Apagar o disco e instalar?",
      texto: `Tudo o que estiver em ${discoEscolhido?.modelo} (${disco}) será apagado. Isso não pode ser desfeito.`,
      ok: "Apagar e instalar",
      perigo: true,
    });
    if (!ok) return;
    setPasso("instalando");
    setRegistro([]);
    const ws = abrirSocket("/ws/instalar");
    ws.onopen = () => ws.send(JSON.stringify({ disco, nome: nome.trim(), usuario, senha, maquina, fuso, teclado }));
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.tipo === "linha") {
        const m = /^PROGRESSO (\d+) (.*)$/.exec(msg.texto);
        if (m) {
          setProgresso(Number(m[1]));
          setEtapa(m[2]);
        } else {
          setRegistro((r) => [...r.slice(-400), msg.texto]);
        }
      } else if (msg.tipo === "fim") {
        if (msg.codigo === 0) {
          setProgresso(100);
          setPasso("pronto");
        } else {
          setPasso("falhou");
          setVerRegistro(true);
        }
      } else if (msg.tipo === "erro") {
        setRegistro((r) => [...r, msg.mensagem]);
        setPasso("falhou");
      }
    };
    ws.onerror = () => {
      setRegistro((r) => [...r, "A conexão com o instalador caiu."]);
      setPasso("falhou");
    };
  }

  const tecladoNome = teclados.find((t) => t.id === teclado)?.nome || teclado;

  return (
    <div className="app-instalador">
      <aside className="instalador-passos">
        <div className="instalador-marca">
          <Icone name="logo" size={34} strokeWidth={1.5} />
          <strong>Alba OS</strong>
        </div>
        <ol>
          {PASSOS.map((p, i) => (
            <li key={p.id} className={i === indice ? "atual" : i < indice ? "feito" : ""}>
              <span>{i < indice ? <Icone name="check" size={13} /> : i + 1}</span>
              {p.nome}
            </li>
          ))}
        </ol>
      </aside>

      <section className="instalador-corpo">
        {passo === "boasvindas" && (
          <div className="instalador-tela">
            <div className="instalador-heroi">
              <Icone name="logo" size={64} strokeWidth={1.3} />
            </div>
            <h1>Bem-vindo ao Alba OS</h1>
            <p>Em poucos passos o Alba OS fica instalado neste computador. Você escolhe o fuso, o teclado, o disco e cria sua conta.</p>
            <div className="instalador-acoes">
              <button className="primario" onClick={() => setPasso("regiao")}>
                Começar <Icone name="chevron" size={16} />
              </button>
            </div>
          </div>
        )}

        {passo === "regiao" && (
          <div className="instalador-tela">
            <h1>Região e teclado</h1>
            <label className="campo">
              <span>Fuso horário</span>
              <select value={fuso} onChange={(e) => setFuso(e.target.value)}>
                {(fusos.length ? fusos : ["America/Sao_Paulo"]).map((f) => (
                  <option key={f} value={f}>
                    {f.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </label>
            <div className="campo">
              <span>Teclado</span>
              <div className="ajuste-grupo">
                {teclados.map((t) => (
                  <button type="button" role="radio" aria-checked={teclado === t.id} key={t.id} className={`opcao-lista ${teclado === t.id ? "selecionado" : ""}`} onClick={() => setTeclado(t.id)}>
                    <Icone name="keyboard" size={18} />
                    <span>{t.nome}</span>
                    {teclado === t.id && <Icone name="check" size={17} />}
                  </button>
                ))}
              </div>
            </div>
            <div className="instalador-acoes">
              <button onClick={() => setPasso("boasvindas")}>Voltar</button>
              <button className="primario" onClick={() => setPasso("disco")}>
                Continuar <Icone name="chevron" size={16} />
              </button>
            </div>
          </div>
        )}

        {passo === "disco" && (
          <div className="instalador-tela">
            <h1>Onde instalar?</h1>
            <p>O disco escolhido será apagado por inteiro e passará a ter só o Alba OS.</p>
            {erroDiscos && <p className="aviso-erro">{erroDiscos}</p>}
            {!discos && !erroDiscos && <p className="dica">Procurando discos…</p>}
            {discos && discos.length === 0 && <p className="aviso-erro">Nenhum disco de 8 GB ou mais foi encontrado.</p>}
            <div className="ajuste-grupo">
              {discos?.map((d) => (
                <button type="button" role="radio" aria-checked={disco === d.caminho} key={d.caminho} className={`opcao-lista disco ${disco === d.caminho ? "selecionado" : ""}`} onClick={() => setDisco(d.caminho)}>
                  <Icone name="disk" size={22} />
                  <span>
                    <strong>{d.modelo}</strong>
                    <small>
                      {d.caminho} · {tamanhoLegivel(d.tamanho)}
                      {d.removivel ? " · removível" : ""}
                    </small>
                  </span>
                  {disco === d.caminho && <Icone name="check" size={17} />}
                </button>
              ))}
            </div>
            <div className="instalador-acoes">
              <button onClick={() => setPasso("regiao")}>Voltar</button>
              <button className="primario" disabled={!disco} onClick={() => setPasso("usuario")}>
                Continuar <Icone name="chevron" size={16} />
              </button>
            </div>
          </div>
        )}

        {passo === "usuario" && (
          <div className="instalador-tela">
            <h1>Sua conta</h1>
            <div className="campos-duplos">
              <label className="campo">
                <span>Seu nome</span>
                <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Paulo Marinho" autoFocus />
              </label>
              <label className="campo">
                <span>Nome de usuário</span>
                <input
                  value={usuario}
                  onChange={(e) => {
                    setUsuarioEditado(true);
                    setUsuario(e.target.value.toLowerCase());
                  }}
                  aria-invalid={!!usuario && !usuarioValido}
                />
                {usuario && !usuarioValido && <small className="erro">Use letras minúsculas, números, - ou _.</small>}
              </label>
              <label className="campo">
                <span>Senha</span>
                <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} />
                {senha && senha.length < 4 && <small className="erro">Pelo menos 4 caracteres.</small>}
              </label>
              <label className="campo">
                <span>Repita a senha</span>
                <input type="password" value={senha2} onChange={(e) => setSenha2(e.target.value)} />
                {senha2 && senha !== senha2 && <small className="erro">As senhas não são iguais.</small>}
              </label>
              <label className="campo">
                <span>Nome do computador</span>
                <input value={maquina} onChange={(e) => setMaquina(e.target.value)} aria-invalid={!maquinaValida} />
              </label>
            </div>
            <div className="instalador-acoes">
              <button onClick={() => setPasso("disco")}>Voltar</button>
              <button className="primario" disabled={!contaOk} onClick={() => setPasso("resumo")}>
                Continuar <Icone name="chevron" size={16} />
              </button>
            </div>
          </div>
        )}

        {passo === "resumo" && (
          <div className="instalador-tela">
            <h1>Tudo pronto para instalar</h1>
            <div className="ajuste-grupo">
              {[
                ["Disco", `${discoEscolhido?.modelo} · ${disco} · ${tamanhoLegivel(discoEscolhido?.tamanho)} (será apagado)`],
                ["Fuso horário", fuso.replace(/_/g, " ")],
                ["Teclado", tecladoNome],
                ["Conta", `${nome} (${usuario})`],
                ["Computador", maquina],
              ].map(([k, v]) => (
                <div className="setting-row" key={k}>
                  <span>{k}</span>
                  <strong>{v}</strong>
                </div>
              ))}
            </div>
            <div className="instalador-acoes">
              <button onClick={() => setPasso("usuario")}>Voltar</button>
              <button className="primario perigo" onClick={instalar}>
                <Icone name="install" size={16} /> Instalar agora
              </button>
            </div>
          </div>
        )}

        {(passo === "instalando" || passo === "pronto" || passo === "falhou") && (
          <div className="instalador-tela">
            <h1>{passo === "pronto" ? "O Alba OS foi instalado" : passo === "falhou" ? "A instalação não terminou" : "Instalando o Alba OS"}</h1>
            <p>
              {passo === "pronto"
                ? "Reinicie o computador. No Hyper-V, ejete a ISO em Mídia › Unidade de DVD antes de ligar de novo."
                : passo === "falhou"
                  ? "Algo deu errado. O registro abaixo mostra onde parou."
                  : etapa}
            </p>
            <div className={`barra-progresso ${passo}`}>
              <span style={{ width: `${progresso}%` }} />
            </div>
            <button className="link" onClick={() => setVerRegistro(!verRegistro)}>
              {verRegistro ? "Esconder detalhes" : "Mostrar detalhes"}
            </button>
            {verRegistro && (
              <pre className="registro-instalacao">
                {registro.join("\n")}
                <div ref={fimRegistro} />
              </pre>
            )}
            {passo === "pronto" && (
              <div className="instalador-acoes">
                <button className="primario" onClick={() => energia("reiniciar")}>
                  <Icone name="restart" size={16} /> Reiniciar agora
                </button>
              </div>
            )}
            {passo === "falhou" && (
              <div className="instalador-acoes">
                <button onClick={() => setPasso("resumo")}>Tentar de novo</button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
