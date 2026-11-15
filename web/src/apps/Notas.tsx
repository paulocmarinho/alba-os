import { useEffect, useState } from "react";
import { api } from "../api";
import { useLumen } from "../contexto";
import { Icone } from "../componentes/Icone";

/** Editor de texto simples: abre, edita e salva arquivos de texto. */
export function Notas({ caminho: inicial, idJanela }: { caminho?: string; idJanela: number }) {
  const { sistema, aviso, perguntar, confirmar, renomearJanela } = useLumen();
  const [caminho, setCaminho] = useState<string | null>(inicial ?? null);
  const [texto, setTexto] = useState("");
  const [original, setOriginal] = useState("");
  const [gravavel, setGravavel] = useState(true);
  const [carregando, setCarregando] = useState(!!inicial);

  useEffect(() => {
    if (!inicial) return;
    api
      .lerTexto(inicial)
      .then((r) => {
        setTexto(r.conteudo);
        setOriginal(r.conteudo);
        setGravavel(r.gravavel);
      })
      .catch((e) => aviso(e.message))
      .finally(() => setCarregando(false));
  }, [inicial, aviso]);

  const nome = caminho ? caminho.split("/").pop()! : "Sem título";
  const alterado = texto !== original;

  useEffect(() => {
    renomearJanela(idJanela, `${alterado ? "• " : ""}${nome}`);
  }, [nome, alterado, idJanela, renomearJanela]);

  async function salvar(como = false) {
    let destino = caminho;
    if (!destino || como || !gravavel) {
      const novo = await perguntar({
        titulo: "Salvar nota",
        texto: "Nome do arquivo (fica na pasta Documentos):",
        valor: caminho ? nome : "Nota.txt",
        ok: "Salvar",
      });
      if (!novo) return;
      destino = `${sistema.casa}/Documentos/${novo.includes(".") ? novo : `${novo}.txt`}`;
    }
    try {
      const r = await api.gravarTexto(destino, texto);
      setCaminho(r.caminho);
      setOriginal(texto);
      setGravavel(true);
      aviso("Nota salva.");
    } catch (e: any) {
      aviso(e.message);
    }
  }

  async function nova() {
    if (alterado && !(await confirmar({ titulo: "Descartar alterações?", texto: "O texto atual não foi salvo.", ok: "Descartar", perigo: true })))
      return;
    setCaminho(null);
    setTexto("");
    setOriginal("");
    setGravavel(true);
  }

  return (
    <div className="app-notas">
      <div className="notas-barra">
        <button onClick={nova}>
          <Icone name="plus" size={16} /> Nova
        </button>
        <button onClick={() => salvar(false)} className="primario" disabled={!alterado && !!caminho}>
          <Icone name="check" size={16} /> Salvar
        </button>
        <button onClick={() => salvar(true)}>Salvar como…</button>
        <span className="notas-info">
          {!gravavel && "Somente leitura · "}
          {texto.length.toLocaleString("pt-BR")} caracteres
        </span>
      </div>
      <textarea
        className="notas-texto"
        aria-label="Texto da nota"
        spellCheck={false}
        value={carregando ? "Abrindo…" : texto}
        disabled={carregando}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.ctrlKey && e.key.toLowerCase() === "s") {
            e.preventDefault();
            salvar(false);
          }
        }}
        placeholder="Escreva aqui…"
      />
    </div>
  );
}

export function Visualizador({ caminho }: { caminho: string }) {
  return (
    <div className="app-visualizador">
      <img src={api.urlArquivo(caminho)} alt={caminho.split("/").pop()} />
    </div>
  );
}
