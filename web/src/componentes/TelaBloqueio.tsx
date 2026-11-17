import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { dataSemAno, hora, iniciais, useAlba } from "../contexto";
import { creditoDoPapel } from "../papeis";
import { Icone } from "./Icone";

/** Tela de bloqueio do Alba: data em cima, hora grande, usuário e senha embaixo. */
export function TelaBloqueio({ aoDesbloquear }: { aoDesbloquear: () => void }) {
  const { agora, sistema, energia, config } = useAlba();
  const credito = creditoDoPapel(config);
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState(false);
  const [conferindo, setConferindo] = useState(false);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const focar = () => campo.current?.focus();
    focar();
    window.addEventListener("keydown", focar);
    return () => window.removeEventListener("keydown", focar);
  }, []);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    if (conferindo) return;
    setConferindo(true);
    try {
      const r = await api.autenticar(senha);
      if (r.ok) {
        aoDesbloquear();
        return;
      }
    } catch {
      // trata como senha errada
    }
    setErro(true);
    setSenha("");
    setConferindo(false);
    window.setTimeout(() => setErro(false), 600);
  }

  return (
    <section className="tela-bloqueio" aria-label="Tela de bloqueio">
      {credito && (
        <div className="bloqueio-credito" aria-label="Sobre esta foto">
          <span className="bloqueio-credito-icone">
            <Icone name="pin" size={15} />
          </span>
          <strong>{credito.local}</strong>
          <small>
            Foto de {credito.autor} · {credito.fonte}
          </small>
        </div>
      )}
      <div className="bloqueio-relogio">
        <span className="bloqueio-data">{dataSemAno(agora)}</span>
        <span className="bloqueio-hora">{hora(agora)}</span>
      </div>

      <form autoComplete="off" className={`bloqueio-entrar ${erro ? "erro" : ""}`} onSubmit={entrar}>
        <div className="bloqueio-avatar">{iniciais(sistema.nome)}</div>
        <strong>{sistema.nome}</strong>
        <label className="bloqueio-senha">
          <input
            ref={campo}
            type="password"
            placeholder="Digite sua senha"
            aria-label="Senha"
            value={senha}
            autoFocus
            onChange={(e) => setSenha(e.target.value)}
          />
          <button type="submit" aria-label="Entrar" disabled={conferindo}>
            <Icone name="chevron" size={18} />
          </button>
        </label>
        <small>{erro ? "Senha incorreta" : conferindo ? "Conferindo…" : "Pressione Enter para entrar"}</small>
      </form>

      <div className="bloqueio-energia">
        <button onClick={() => energia("reiniciar")} aria-label="Reiniciar">
          <Icone name="restart" size={18} />
        </button>
        <button onClick={() => energia("desligar")} aria-label="Desligar">
          <Icone name="power" size={18} />
        </button>
      </div>
    </section>
  );
}
