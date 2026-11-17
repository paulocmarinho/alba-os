import { useEffect, useState } from "react";
import { type EstadoNotificacoes, type Notificacao, notificacoes } from "../api";
import { ouvirEventos, paraCasca } from "../ponte";
import { Interruptor } from "./Central";
import { Icone } from "./Icone";

export function abrirNotificacao(n: Notificacao) {
  if (n.abrir?.desktop) paraCasca({ tipo: "lancar", desktop: n.abrir.desktop });
  else if (n.abrir?.app) paraCasca({ tipo: "abrir", app: n.abrir.app, props: n.abrir.props || {} });
}

export function quandoFoi(segundos: number, agora = Date.now() / 1000) {
  const d = Math.max(0, agora - segundos);
  if (d < 60) return "agora";
  if (d < 3600) return `há ${Math.floor(d / 60)} min`;
  if (d < 86400) return `há ${Math.floor(d / 3600)} h`;
  return new Date(segundos * 1000).toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
}

/** Cartão de uma notificação (na central e no aviso que aparece no canto). */
export function CartaoNotificacao({ n, aoFechar, aoAbrir }: { n: Notificacao; aoFechar?: () => void; aoAbrir?: () => void }) {
  const clicavel = !!n.abrir;
  return (
    <div
      className={`notificacao ${clicavel ? "clicavel" : ""} ${n.lida ? "" : "nova"}`}
      role={clicavel ? "button" : undefined}
      tabIndex={clicavel ? 0 : undefined}
      onClick={() => {
        if (!clicavel) return;
        abrirNotificacao(n);
        aoAbrir?.();
      }}
    >
      <div className="notificacao-topo">
        <span className="notificacao-app">{n.app || "Alba"}</span>
        <span className="notificacao-quando">{quandoFoi(n.quando)}</span>
        {aoFechar && (
          <button
            className="notificacao-fechar"
            aria-label="Apagar notificação"
            onClick={(e) => {
              e.stopPropagation();
              aoFechar();
            }}
          >
            <Icone name="close" size={12} />
          </button>
        )}
      </div>
      {n.titulo && <strong>{n.titulo}</strong>}
      {n.texto && <p>{n.texto}</p>}
    </div>
  );
}

/** Central de notificações: aparece ao clicar na data, acima do calendário. */
export function CentralNotificacoes({ fechar }: { fechar: () => void }) {
  const [estado, setEstado] = useState<EstadoNotificacoes | null>(null);

  useEffect(() => {
    notificacoes
      .listar()
      .then((e) => {
        setEstado(e);
        if (e.nao_lidas) notificacoes.lidas().catch(() => {});
      })
      .catch(() => {});
    return ouvirEventos((m) => {
      if (m.tipo === "notificacoes") setEstado({ lista: m.lista, nao_perturbe: m.nao_perturbe, nao_lidas: m.nao_lidas });
      if (m.tipo === "notificacao" && m.notificacao)
        setEstado((e) => (e ? { ...e, lista: [m.notificacao, ...e.lista.filter((x) => x.id !== m.notificacao.id)] } : e));
    });
  }, []);

  const apagar = (id?: number) => {
    setEstado((e) => (e ? { ...e, lista: id === undefined ? [] : e.lista.filter((n) => n.id !== id) } : e));
    notificacoes.apagar(id).catch(() => {});
  };
  const naoPerturbe = () => {
    if (!estado) return;
    setEstado({ ...estado, nao_perturbe: !estado.nao_perturbe });
    notificacoes.naoPerturbe(!estado.nao_perturbe).then(setEstado).catch(() => {});
  };

  return (
    <div className="painel-flutuante central-notificacoes" role="region" aria-label="Notificações">
      <div className="painel-cabecalho">
        <strong>Notificações</strong>
        {!!estado?.lista.length && (
          <button className="link-limpar" onClick={() => apagar()}>
            Limpar
          </button>
        )}
      </div>
      <div className="notificacoes-lista">
        {estado && estado.lista.length === 0 && (
          <p className="notificacoes-vazio">
            <Icone name="bell" size={22} />
            Nenhuma notificação
          </p>
        )}
        {estado?.lista.map((n) => (
          <CartaoNotificacao key={n.id} n={n} aoFechar={() => apagar(n.id)} aoAbrir={fechar} />
        ))}
      </div>
      <div className="nao-perturbe">
        <Icone name="moon" size={16} />
        <span>
          <strong>Não perturbe</strong>
          <small>{estado?.nao_perturbe ? "Notificações chegam em silêncio, só aqui" : "Desligado"}</small>
        </span>
        <Interruptor ligado={!!estado?.nao_perturbe} rotulo="Não perturbe" aoMudar={naoPerturbe} />
      </div>
    </div>
  );
}
