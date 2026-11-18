import { useEffect, useState } from "react";
import { type Conta, contas as apiContas } from "../api";
import { Interruptor } from "../componentes/Central";
import { Icone } from "../componentes/Icone";
import { iniciais, useAlba } from "../contexto";

/** Login a partir do nome: "Maria Souza" → "maria". */
function loginSugerido(nome: string) {
  return (
    nome
      .trim()
      .split(/\s+/)[0]
      ?.normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "")
      .replace(/^[^a-z_]+/, "")
      .slice(0, 32) || ""
  );
}

/** Ajustes › Contas: quem usa este computador, senhas, administradores e entrada automática. */
export function AjustesContas() {
  const { confirmar, perguntar, aviso, energia } = useAlba();
  const [lista, setLista] = useState<Conta[] | null>(null);
  const [souAdmin, setSouAdmin] = useState(false);
  const [telaEntrada, setTelaEntrada] = useState(false);
  const [criando, setCriando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [novo, setNovo] = useState({ nome: "", login: "", senha: "", senha2: "", admin: false, loginEditado: false });
  const [erroNovo, setErroNovo] = useState("");

  const carregar = () =>
    apiContas
      .listar()
      .then((r) => {
        setLista(r.contas);
        setSouAdmin(r.souAdmin);
        setTelaEntrada(r.telaEntrada);
      })
      .catch((e) => aviso(e.message));
  useEffect(() => {
    carregar();
  }, []);

  /** Pede a senha de quem está usando (o sistema confere antes de mexer em contas). */
  const minhaSenha = (texto = "Para mexer nas contas, digite a sua senha.") =>
    perguntar({ titulo: "Confirme que é você", texto, senha: true, ok: "Continuar" });

  async function fazer(corpo: Parameters<typeof apiContas.acao>[0], sucesso: string) {
    setOcupado(true);
    try {
      await apiContas.acao(corpo);
      aviso(sucesso);
      await carregar();
      return true;
    } catch (e: any) {
      aviso(e.message);
      return false;
    } finally {
      setOcupado(false);
    }
  }

  async function trocarSenha(c: Conta) {
    const atual = await minhaSenha(c.eu ? "Digite a sua senha atual." : `Para trocar a senha de ${c.nome}, digite a sua senha.`);
    if (atual === null) return;
    const nova = await perguntar({ titulo: "Senha nova", texto: `Nova senha de ${c.nome}:`, senha: true, ok: "Continuar" });
    if (!nova) return;
    const de_novo = await perguntar({ titulo: "Senha nova", texto: "Digite a senha nova outra vez:", senha: true, ok: "Trocar senha" });
    if (de_novo === null) return;
    if (de_novo !== nova) return aviso("As senhas não são iguais. Nada foi trocado.");
    await fazer({ acao: "senha", login: c.login, senha_atual: atual, senha_nova: nova }, "Senha trocada.");
  }

  async function renomear(c: Conta) {
    const nome = await perguntar({ titulo: "Nome da conta", texto: "Como o nome aparece na tela de entrada e no menu:", valor: c.nome, ok: "Continuar" });
    if (!nome || nome === c.nome) return;
    const atual = await minhaSenha();
    if (atual === null) return;
    await fazer({ acao: "nome", login: c.login, nome, senha_atual: atual }, "Nome trocado. Ele aparece por completo na próxima entrada.");
  }

  async function mudarAdmin(c: Conta) {
    if (c.admin && c.eu && !(await confirmar({ titulo: "Deixar de ser administrador?", texto: "Você não poderá mais instalar programas, atualizar o sistema nem mexer em outras contas.", ok: "Continuar", perigo: true })))
      return;
    const atual = await minhaSenha();
    if (atual === null) return;
    await fazer({ acao: "admin", login: c.login, admin: !c.admin, senha_atual: atual }, c.admin ? `${c.nome} agora é uma conta padrão.` : `${c.nome} agora é administrador.`);
  }

  async function remover(c: Conta) {
    const apagar = await confirmar({
      titulo: `Remover a conta de ${c.nome}?`,
      texto: "Os arquivos dessa pessoa (Documentos, Imagens, Área de Trabalho…) também serão apagados. Isso não pode ser desfeito.",
      ok: "Remover conta e arquivos",
      perigo: true,
    });
    if (!apagar) return;
    const atual = await minhaSenha();
    if (atual === null) return;
    await fazer({ acao: "remover", login: c.login, apagar_arquivos: true, senha_atual: atual }, "Conta removida.");
  }

  async function automatico(c: Conta) {
    const atual = await minhaSenha();
    if (atual === null) return;
    await fazer(
      { acao: "automatico", login: c.automatico ? "" : c.login, senha_atual: atual },
      c.automatico ? "Ao ligar, o Alba vai pedir a senha." : `Ao ligar, o Alba entra direto na conta de ${c.nome}.`,
    );
  }

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setErroNovo("");
    if (!novo.nome.trim()) return setErroNovo("Escreva o nome da pessoa.");
    if (!/^[a-z_][a-z0-9_-]{0,31}$/.test(novo.login)) return setErroNovo("Nome de usuário: só letras minúsculas, números, - e _ (começando por letra).");
    if (lista?.some((c) => c.login === novo.login)) return setErroNovo("Já existe uma conta com esse nome de usuário.");
    if (!novo.senha) return setErroNovo("Escolha uma senha.");
    if (novo.senha !== novo.senha2) return setErroNovo("As senhas não são iguais.");
    const atual = await minhaSenha("Para criar a conta, digite a SUA senha (de quem está usando agora).");
    if (atual === null) return;
    const ok = await fazer(
      { acao: "criar", login: novo.login, nome: novo.nome.trim(), admin: novo.admin, senha_atual: atual, senha_nova: novo.senha },
      `Conta de ${novo.nome.trim()} criada.`,
    );
    if (ok) {
      setCriando(false);
      setNovo({ nome: "", login: "", senha: "", senha2: "", admin: false, loginEditado: false });
    }
  }

  return (
    <>
      <h2>Contas</h2>
      <p className="dica">
        Cada pessoa que usa este computador pode ter a própria conta, com arquivos, papel de parede e apps separados. Administradores podem
        instalar programas, atualizar o sistema e mexer nas outras contas.
      </p>

      <div className="ajuste-grupo contas-lista">
        {lista === null && <div className="setting-row">Carregando…</div>}
        {lista?.map((c) => (
          <div className="conta-linha" key={c.login}>
            <span className="conta-avatar">{iniciais(c.nome)}</span>
            <span className="conta-info">
              <strong>
                {c.nome} {c.eu && <em className="conta-selo">Você</em>}
              </strong>
              <small>
                {c.login} · {c.admin ? "Administrador" : "Padrão"}
                {c.automatico ? " · entra sozinha ao ligar" : ""}
              </small>
            </span>
            <span className="conta-acoes">
              {(c.eu || souAdmin) && (
                <button className="botao-secundario pequeno" disabled={ocupado} onClick={() => trocarSenha(c)}>
                  <Icone name="lock" size={14} /> Senha
                </button>
              )}
              {souAdmin && (
                <button className="botao-secundario pequeno" disabled={ocupado} onClick={() => renomear(c)}>
                  <Icone name="edit" size={14} /> Nome
                </button>
              )}
              {souAdmin && !c.eu && (
                <button className="botao-perigo pequeno" disabled={ocupado} onClick={() => remover(c)}>
                  <Icone name="trash" size={14} />
                </button>
              )}
            </span>
            {souAdmin && (
              <div className="conta-opcoes">
                <label>
                  <span>Administrador</span>
                  <Interruptor rotulo={`${c.nome} é administrador`} ligado={c.admin} aoMudar={() => !ocupado && mudarAdmin(c)} />
                </label>
                <label>
                  <span>Entrar sozinha ao ligar</span>
                  <Interruptor rotulo={`Entrar direto na conta de ${c.nome}`} ligado={c.automatico} aoMudar={() => !ocupado && automatico(c)} />
                </label>
              </div>
            )}
          </div>
        ))}
      </div>

      {souAdmin && !criando && (
        <button className="botao-secundario" onClick={() => setCriando(true)}>
          <Icone name="plus" size={15} /> Adicionar conta
        </button>
      )}
      {!souAdmin && lista && <p className="dica">Para criar ou mudar outras contas, peça a um administrador deste computador.</p>}

      {criando && (
        <form className="ajuste-grupo conta-nova" onSubmit={criar} autoComplete="off">
          <h3>Nova conta</h3>
          <label>
            <span>Nome</span>
            <input
              autoFocus
              value={novo.nome}
              placeholder="Ex.: Maria Souza"
              onChange={(e) => setNovo((n) => ({ ...n, nome: e.target.value, login: n.loginEditado ? n.login : loginSugerido(e.target.value) }))}
            />
          </label>
          <label>
            <span>Nome de usuário</span>
            <input value={novo.login} placeholder="maria" onChange={(e) => setNovo((n) => ({ ...n, login: e.target.value.toLowerCase(), loginEditado: true }))} />
          </label>
          <label>
            <span>Senha</span>
            <input type="password" value={novo.senha} onChange={(e) => setNovo((n) => ({ ...n, senha: e.target.value }))} />
          </label>
          <label>
            <span>Repita a senha</span>
            <input type="password" value={novo.senha2} onChange={(e) => setNovo((n) => ({ ...n, senha2: e.target.value }))} />
          </label>
          <label className="conta-nova-admin">
            <span>
              Administrador
              <small>Pode instalar programas, atualizar o sistema e mexer nas contas.</small>
            </span>
            <Interruptor rotulo="Conta de administrador" ligado={novo.admin} aoMudar={() => setNovo((n) => ({ ...n, admin: !n.admin }))} />
          </label>
          {erroNovo && <p className="conta-erro">{erroNovo}</p>}
          <div className="conta-nova-botoes">
            <button type="button" className="botao-secundario" onClick={() => (setCriando(false), setErroNovo(""))}>
              Cancelar
            </button>
            <button type="submit" className="botao-destaque" disabled={ocupado}>
              {ocupado ? "Criando…" : "Criar conta"}
            </button>
          </div>
        </form>
      )}

      <h3>Entrar e sair</h3>
      <div className="ajuste-grupo">
        <div className="setting-row">
          <span>
            <Icone name="user" /> Trocar de conta
          </span>
          <button className="botao-secundario pequeno" onClick={() => energia("sair")} disabled={!telaEntrada}>
            Encerrar sessão
          </button>
        </div>
        <p className="dica">
          {telaEntrada
            ? "Ao encerrar a sessão, a tela de entrada aparece com todas as contas."
            : "A tela de entrada com as contas passa a funcionar depois que você reiniciar o computador."}
        </p>
      </div>
    </>
  );
}
