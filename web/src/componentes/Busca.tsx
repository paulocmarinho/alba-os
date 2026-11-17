import { useEffect, useMemo, useRef, useState } from "react";
import { type ArquivoAchado, arquivosExtra } from "../api";
import { useAlba } from "../contexto";
import { paraCasca } from "../ponte";
import { Icone, type NomeIcone } from "./Icone";
import { type AppLista, IconeApp } from "./Launchpad";

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Calculadora da busca: + − × ÷ ^ %, parênteses, vírgula decimal. Sem eval. */
export function calcular(texto: string): number | null {
  const s = texto.replace(/\s+/g, "").replace(/,/g, ".").replace(/[x×]/gi, "*").replace(/÷/g, "/").replace(/−/g, "-");
  if (!/^[\d.+\-*/^%()]+$/.test(s) || !/[\d]/.test(s) || !/[+\-*/^%]/.test(s.replace(/^-/, ""))) return null;
  let i = 0;
  const num = (): number => {
    if (s[i] === "(") {
      i++;
      const v = soma();
      if (s[i] !== ")") throw 0;
      i++;
      return v;
    }
    if (s[i] === "-") {
      i++;
      return -num();
    }
    const m = /^\d*\.?\d+/.exec(s.slice(i));
    if (!m) throw 0;
    i += m[0].length;
    let v = parseFloat(m[0]);
    if (s[i] === "%") {
      i++;
      v /= 100;
    }
    return v;
  };
  const pot = (): number => {
    const b = num();
    if (s[i] === "^") {
      i++;
      return Math.pow(b, pot());
    }
    return b;
  };
  const prod = (): number => {
    let v = pot();
    while (s[i] === "*" || s[i] === "/") {
      const op = s[i++];
      const d = pot();
      v = op === "*" ? v * d : v / d;
    }
    return v;
  };
  const soma = (): number => {
    let v = prod();
    while (s[i] === "+" || s[i] === "-") {
      const op = s[i++];
      const d = prod();
      v = op === "+" ? v + d : v - d;
    }
    return v;
  };
  try {
    const v = soma();
    return i === s.length && Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

type Resultado = {
  chave: string;
  grupo: string;
  titulo: string;
  sub?: string;
  icone: React.ReactNode;
  abrir: () => void;
};

const AJUSTES: { secao: string; nome: string; icone: NomeIcone; palavras: string }[] = [
  { secao: "aparencia", nome: "Aparência", icone: "palette", palavras: "papel de parede tema escuro claro cor destaque tamanho interface fundo" },
  { secao: "rede", nome: "Rede", icone: "wifi", palavras: "wifi wi-fi internet cabo conexao ip" },
  { secao: "som", nome: "Som", icone: "volume", palavras: "volume audio alto falante mudo" },
  { secao: "teclado", nome: "Teclado", icone: "keyboard", palavras: "layout abnt idioma atalhos" },
  { secao: "sobre", nome: "Sobre este computador", icone: "info", palavras: "versao atualizar atualizacao memoria processador disco sistema" },
];

function iconeArquivo(a: ArquivoAchado): NomeIcone {
  if (a.pasta) return "folder";
  const ext = a.nome.split(".").pop()?.toLowerCase() || "";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(ext)) return "image";
  if (["mp3", "flac", "ogg", "wav", "m4a", "opus"].includes(ext)) return "music";
  if (["mp4", "mkv", "webm", "mov", "avi"].includes(ext)) return "video";
  if (["zip", "tar", "gz", "xz", "7z", "rar", "zst"].includes(ext)) return "archive";
  if (["txt", "md", "json", "csv", "log", "conf", "ini", "py", "js", "ts", "sh", "html", "css"].includes(ext)) return "note";
  return "file";
}

/** Busca global (Super+Espaço): apps, ajustes, arquivos e contas. */
export function Busca({ apps, fechar }: { apps: AppLista[]; fechar: () => void }) {
  const { abrir, bloquear, energia, config, mudarConfig } = useAlba();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [arquivos, setArquivos] = useState<ArquivoAchado[]>([]);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => campo.current?.focus(), []);

  useEffect(() => {
    setSel(0);
    if (q.trim().length < 2) return setArquivos([]);
    const t = window.setTimeout(() => {
      arquivosExtra
        .buscar(q.trim())
        .then((r) => setArquivos(r.arquivos))
        .catch(() => setArquivos([]));
    }, 160);
    return () => window.clearTimeout(t);
  }, [q]);

  const abrirApp = (a: AppLista) =>
    a.tipo === "alba" && a.app ? paraCasca({ tipo: "abrir", app: a.app }) : paraCasca({ tipo: "lancar", desktop: a.desktop });

  const abrirArquivo = (a: ArquivoAchado) => {
    const icone = iconeArquivo(a);
    if (a.pasta) abrir("arquivos", { inicial: a.caminho });
    else if (icone === "image") abrir("visualizador", { caminho: a.caminho });
    else if (icone === "music") abrir("musica", { abrir: { caminhos: [a.caminho], vez: Date.now() } });
    else if (icone === "note") abrir("notas", { caminho: a.caminho });
    else arquivosExtra.abrirExterno(a.caminho).catch(() => abrir("arquivos", { inicial: a.caminho.split("/").slice(0, -1).join("/") }));
  };

  const resultados = useMemo(() => {
    const termo = semAcento(q.trim());
    if (!termo) return [] as Resultado[];
    const r: Resultado[] = [];
    const conta = calcular(q);
    if (conta !== null) {
      const texto = conta.toLocaleString("pt-BR", { maximumFractionDigits: 10 });
      r.push({
        chave: "conta",
        grupo: "Calculadora",
        titulo: `= ${texto}`,
        sub: "Enter copia o resultado",
        icone: <span className="busca-icone calc"><Icone name="calc" size={20} /></span>,
        abrir: () => navigator.clipboard?.writeText(String(conta)).catch(() => {}),
      });
    }
    const nota = (nome: string, extra = "") => {
      const n = semAcento(nome);
      if (n.startsWith(termo)) return 0;
      if (n.split(/[\s.\-_]/).some((p) => p.startsWith(termo))) return 1;
      if (n.includes(termo)) return 2;
      if (semAcento(extra).includes(termo)) return 3;
      return -1;
    };
    apps
      .map((a) => ({ a, n: nota(a.nome, a.busca) }))
      .filter((x) => x.n >= 0)
      .sort((x, y) => x.n - y.n)
      .slice(0, 6)
      .forEach(({ a }) =>
        r.push({ chave: `app-${a.chave}`, grupo: "Aplicativos", titulo: a.nome, icone: <IconeApp app={a} pequeno />, abrir: () => abrirApp(a) }),
      );
    AJUSTES.filter((a) => nota(a.nome, a.palavras) >= 0).forEach((a) =>
      r.push({
        chave: `aj-${a.secao}`,
        grupo: "Ajustes",
        titulo: a.nome,
        sub: "Ajustes do sistema",
        icone: <span className="busca-icone"><Icone name={a.icone} size={18} /></span>,
        abrir: () => abrir("ajustes", { secao: a.secao }),
      }),
    );
    const acoes: { nome: string; palavras: string; icone: NomeIcone; fazer: () => void }[] = [
      { nome: "Bloquear tela", palavras: "trancar sair lock", icone: "lock", fazer: bloquear },
      { nome: "Reiniciar", palavras: "reboot", icone: "restart", fazer: () => energia("reiniciar") },
      { nome: "Desligar", palavras: "power off encerrar", icone: "power", fazer: () => energia("desligar") },
      {
        nome: config.tema === "escuro" ? "Usar modo claro" : "Usar modo escuro",
        palavras: "tema escuro claro dark noite",
        icone: "moon",
        fazer: () => mudarConfig({ tema: config.tema === "escuro" ? "claro" : "escuro" }),
      },
      { nome: "Alba Store", palavras: "loja instalar apps aplicativos", icone: "store", fazer: () => abrir("loja") },
    ];
    acoes
      .filter((a) => nota(a.nome, a.palavras) >= 0 && !r.some((x) => x.titulo === a.nome))
      .forEach((a) =>
        r.push({ chave: `acao-${a.nome}`, grupo: "Ações", titulo: a.nome, icone: <span className="busca-icone"><Icone name={a.icone} size={18} /></span>, abrir: a.fazer }),
      );
    arquivos.forEach((a) =>
      r.push({
        chave: `arq-${a.caminho}`,
        grupo: "Arquivos",
        titulo: a.nome,
        sub: a.onde,
        icone: <span className="busca-icone arquivo"><Icone name={iconeArquivo(a)} size={18} /></span>,
        abrir: () => abrirArquivo(a),
      }),
    );
    return r;
  }, [q, apps, arquivos, config.tema]);

  const ir = (r?: Resultado) => {
    if (!r) return;
    r.abrir();
    fechar();
  };

  const tecla = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      if (q) setQ("");
      else fechar();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(resultados.length - 1, s + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(0, s - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      ir(resultados[sel]);
    }
  };

  let grupoAnterior = "";
  return (
    <section className="busca-fundo" onPointerDown={(e) => e.target === e.currentTarget && fechar()}>
      <div className={`busca ${resultados.length ? "com-resultados" : ""}`} onKeyDown={tecla}>
        <label className="busca-campo">
          <Icone name="search" size={22} />
          <input ref={campo} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar apps, arquivos, ajustes ou fazer contas" aria-label="Buscar" />
        </label>
        {resultados.length > 0 && (
          <div className="busca-resultados" role="listbox">
            {resultados.map((r, i) => {
              const titulo = r.grupo !== grupoAnterior ? <p className="busca-grupo">{r.grupo}</p> : null;
              grupoAnterior = r.grupo;
              return (
                <div key={r.chave}>
                  {titulo}
                  <button role="option" aria-selected={i === sel} className={i === sel ? "selecionado" : ""} onPointerMove={() => setSel(i)} onClick={() => ir(r)}>
                    {r.icone}
                    <span className="busca-texto">
                      <strong>{r.titulo}</strong>
                      {r.sub && <small>{r.sub}</small>}
                    </span>
                    {i === sel && <kbd>↵</kbd>}
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {q.trim() && resultados.length === 0 && <p className="busca-nada">Nada encontrado para “{q.trim()}”.</p>}
      </div>
    </section>
  );
}
