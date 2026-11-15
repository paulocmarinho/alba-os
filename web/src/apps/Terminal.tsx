import { useEffect, useReducer, useRef, useState } from "react";
import { abrirSocket } from "../api";
import { type Celula, type Estilo, TelaTerminal } from "../terminal/vt";

const FG = "#e1e7f6";
const BG = "transparent";

function estiloCss(e: Estilo): React.CSSProperties {
  let fg = e.fg ?? FG;
  let bg = e.bg ?? BG;
  if (e.inverso) {
    [fg, bg] = [e.bg ?? "#131a2c", e.fg ?? FG];
  }
  return {
    color: fg,
    background: bg === "transparent" ? undefined : bg,
    fontWeight: e.negrito ? 700 : undefined,
    opacity: e.fraco ? 0.7 : undefined,
    textDecoration: e.sublinhado ? "underline" : undefined,
  };
}

function mesmoEstilo(a: Estilo, b: Estilo) {
  return a.fg === b.fg && a.bg === b.bg && a.negrito === b.negrito && a.inverso === b.inverso && a.sublinhado === b.sublinhado && a.fraco === b.fraco;
}

function Linha({ celulas, cursor }: { celulas: Celula[]; cursor: number }) {
  const partes: React.ReactNode[] = [];
  let i = 0;
  while (i < celulas.length) {
    if (i === cursor) {
      partes.push(
        <span key={i} className="cursor-terminal">
          {celulas[i].c}
        </span>,
      );
      i++;
      continue;
    }
    let j = i + 1;
    while (j < celulas.length && j !== cursor && mesmoEstilo(celulas[j].e, celulas[i].e)) j++;
    partes.push(
      <span key={i} style={estiloCss(celulas[i].e)}>
        {celulas
          .slice(i, j)
          .map((c) => c.c)
          .join("")}
      </span>,
    );
    i = j;
  }
  return <div className="linha-terminal">{partes}</div>;
}

/** Terminal de verdade (bash) com emulador próprio do Alba. */
export function Terminal({ ativo }: { ativo: boolean }) {
  const tela = useRef(new TelaTerminal(80, 24));
  const socket = useRef<WebSocket | null>(null);
  const area = useRef<HTMLDivElement>(null);
  const entrada = useRef<HTMLTextAreaElement>(null);
  const medida = useRef<HTMLSpanElement>(null);
  const [, redesenhar] = useReducer((n: number) => n + 1, 0);
  const [encerrado, setEncerrado] = useState(false);
  const quadro = useRef(0);

  const agendar = () => {
    if (quadro.current) return;
    quadro.current = requestAnimationFrame(() => {
      quadro.current = 0;
      redesenhar();
      const el = area.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  };

  const enviar = (dados: string) => {
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify({ tipo: "entrada", dados }));
  };

  useEffect(() => {
    const ws = abrirSocket("/ws/terminal");
    socket.current = ws;
    tela.current.responder = enviar;
    ws.onopen = () => ajustarTamanho();
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.tipo === "saida") {
        tela.current.escrever(msg.dados);
        agendar();
      } else if (msg.tipo === "fim") {
        setEncerrado(true);
      }
    };
    ws.onclose = () => setEncerrado(true);
    return () => ws.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function ajustarTamanho() {
    const el = area.current;
    const m = medida.current;
    if (!el || !m) return;
    const w = m.getBoundingClientRect().width / 10 || 8;
    const h = m.getBoundingClientRect().height || 17;
    const colunas = Math.floor((el.clientWidth - 24) / w);
    const linhas = Math.floor((el.clientHeight - 20) / h);
    tela.current.redimensionar(colunas, linhas);
    if (socket.current?.readyState === WebSocket.OPEN)
      socket.current.send(JSON.stringify({ tipo: "tamanho", colunas: tela.current.colunas, linhas: tela.current.linhas }));
    agendar();
  }

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const obs = new ResizeObserver(() => ajustarTamanho());
    obs.observe(el);
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (ativo) entrada.current?.focus();
  }, [ativo]);

  function teclar(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.ctrlKey && e.shiftKey && (e.key === "C" || e.key === "c")) {
      const texto = window.getSelection()?.toString();
      if (texto) navigator.clipboard?.writeText(texto).catch(() => {});
      e.preventDefault();
      return;
    }
    if (e.ctrlKey && e.shiftKey && (e.key === "V" || e.key === "v")) return; // deixa o evento de colar acontecer
    const seq = tela.current.tecla(e);
    if (seq !== null) {
      e.preventDefault();
      enviar(seq);
    }
  }

  function digitar(e: React.FormEvent<HTMLTextAreaElement>) {
    const alvo = e.currentTarget;
    if ((e.nativeEvent as InputEvent).isComposing) return;
    if (alvo.value) {
      enviar(alvo.value.replace(/\n/g, "\r"));
      alvo.value = "";
    }
  }

  function colar(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    e.preventDefault();
    const texto = e.clipboardData.getData("text").replace(/\r?\n/g, "\r");
    enviar(tela.current.colagemComColchetes ? `\x1b[200~${texto}\x1b[201~` : texto);
  }

  const t = tela.current;
  return (
    <div
      className="terminal-content terminal-vivo"
      ref={area}
      onMouseUp={() => {
        if (!window.getSelection()?.toString()) entrada.current?.focus();
      }}
    >
      <span className="medida-terminal" ref={medida} aria-hidden="true">
        MMMMMMMMMM
      </span>
      {t.historico.map((l, i) => (
        <Linha key={`h${i}`} celulas={l} cursor={-1} />
      ))}
      {t.tela.map((l, i) => (
        <Linha key={`t${i}`} celulas={l} cursor={t.cursorVisivel && i === t.cy && ativo ? t.cx : -1} />
      ))}
      {encerrado && <div className="terminal-fim">Sessão encerrada. Feche a janela ou abra um novo Terminal.</div>}
      <textarea
        ref={entrada}
        className="entrada-terminal"
        aria-label="Entrada do terminal"
        autoCapitalize="off"
        autoComplete="off"
        spellCheck={false}
        onKeyDown={teclar}
        onInput={digitar}
        onCompositionEnd={(e) => {
          enviar(e.data);
          e.currentTarget.value = "";
        }}
        onPaste={colar}
      />
    </div>
  );
}
