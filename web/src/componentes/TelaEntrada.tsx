import { useEffect, useRef, useState } from "react";
import { dataSemAno, hora, iniciais } from "../contexto";
import { daCasca, paraCasca } from "../ponte";
import { Icone } from "./Icone";

type Conta = { login: string; nome: string };

/**
 * Tela de entrada do Alba (antes de qualquer sessão): escolhe a conta e digita a senha.
 * Roda sem servidor, numa página local aberta pelo alba-entrada (que fala com o greetd).
 */
export function TelaEntrada() {
  const [agora, setAgora] = useState(new Date());
  const [contas, setContas] = useState<Conta[]>([]);
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const [senha, setSenha] = useState("");
  const [estado, setEstado] = useState<"" | "conferindo" | "entrando">("");
  const [erro, setErro] = useState("");
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = window.setInterval(() => setAgora(new Date()), 1000);
    const sair = daCasca((m) => {
      if (m.tipo === "contas") {
        setContas(m.contas || []);
        setEscolhida((e) => e ?? (m.ultimo && m.contas.some((c: Conta) => c.login === m.ultimo) ? m.ultimo : m.contas.length === 1 ? m.contas[0].login : null));
      } else if (m.tipo === "resultado") {
        if (m.ok) setEstado("entrando");
        else {
          setEstado("");
          setErro(m.erro || "Senha incorreta");
          setSenha("");
          window.setTimeout(() => campo.current?.focus(), 30);
        }
      }
    });
    paraCasca({ tipo: "pronto" });
    return () => {
      window.clearInterval(t);
      sair();
    };
  }, []);

  useEffect(() => {
    if (escolhida) window.setTimeout(() => campo.current?.focus(), 30);
  }, [escolhida]);

  const conta = contas.find((c) => c.login === escolhida);

  function entrar(e: React.FormEvent) {
    e.preventDefault();
    if (!conta || estado) return;
    setErro("");
    setEstado("conferindo");
    paraCasca({ tipo: "entrar", login: conta.login, senha });
  }

  return (
    <section className="tela-bloqueio tela-entrada" aria-label="Entrar no Alba">
      <div className="bloqueio-credito" aria-label="Sobre esta foto">
        <span className="bloqueio-credito-icone">
          <Icone name="pin" size={15} />
        </span>
        <strong>Rio de Janeiro, Rio de Janeiro, Brasil</strong>
        <small>Foto de Bruno Scramgnon</small>
      </div>
      <div className="bloqueio-relogio">
        <span className="bloqueio-data">{dataSemAno(agora)}</span>
        <span className="bloqueio-hora">{hora(agora)}</span>
      </div>

      {conta ? (
        <form autoComplete="off" className={`bloqueio-entrar ${erro ? "erro" : ""}`} onSubmit={entrar}>
          <div className="bloqueio-avatar">{iniciais(conta.nome)}</div>
          <strong>{conta.nome}</strong>
          <label className="bloqueio-senha">
            <input
              ref={campo}
              type="password"
              placeholder="Digite sua senha"
              aria-label="Senha"
              value={senha}
              disabled={!!estado}
              onChange={(e) => setSenha(e.target.value)}
            />
            <button type="submit" aria-label="Entrar" disabled={!!estado}>
              <Icone name="chevron" size={18} />
            </button>
          </label>
          <small>{estado === "entrando" ? "Entrando…" : estado === "conferindo" ? "Conferindo…" : erro || "Pressione Enter para entrar"}</small>
          {contas.length > 1 && !estado && (
            <button type="button" className="entrada-outra" onClick={() => (setEscolhida(null), setSenha(""), setErro(""))}>
              <Icone name="user" size={15} /> Outra conta
            </button>
          )}
        </form>
      ) : (
        <div className="entrada-contas" role="list" aria-label="Contas">
          {contas.map((c) => (
            <button key={c.login} role="listitem" className="entrada-conta" onClick={() => setEscolhida(c.login)}>
              <span className="bloqueio-avatar">{iniciais(c.nome)}</span>
              <strong>{c.nome}</strong>
            </button>
          ))}
        </div>
      )}

      <div className="bloqueio-energia">
        <button onClick={() => paraCasca({ tipo: "energia", acao: "reiniciar" })} aria-label="Reiniciar">
          <Icone name="restart" size={18} />
        </button>
        <button onClick={() => paraCasca({ tipo: "energia", acao: "desligar" })} aria-label="Desligar">
          <Icone name="power" size={18} />
        </button>
      </div>
    </section>
  );
}
