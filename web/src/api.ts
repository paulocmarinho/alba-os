// Comunicação com o servidor do sistema Lúmen (127.0.0.1, autenticado por cookie de sessão).

export type Sistema = {
  usuario: string;
  nome: string;
  maquina: string;
  sistema: string;
  versao: string;
  kernel: string;
  processador: string;
  nucleos: number;
  memoria_total: number;
  memoria_usada: number;
  disco_total: number;
  disco_usado: number;
  ligado_segundos: number;
  live: boolean;
  casa: string;
};

export type Config = {
  tema: "claro" | "escuro";
  destaque: string;
  papel: string;
  teclado: string;
  relogio24h: boolean;
};

export type Teclado = { id: string; nome: string };

export type Item = {
  nome: string;
  caminho: string;
  tipo: "pasta" | "arquivo";
  categoria: string;
  tamanho?: number;
  modificado?: number;
  original?: string;
};

export type Pasta = { caminho: string; pai: string | null; itens: Item[]; gravavel: boolean };
export type Local = { nome: string; caminho: string; icone: string };
export type Disco = { caminho: string; tamanho: number; modelo: string; removivel: boolean };
export type Rede = {
  online: boolean;
  conexoes: { dispositivo: string; tipo: string; estado: string; nome: string }[];
  ips: string[];
};
export type Som = { disponivel: boolean; volume: number; mudo: boolean };

export class ErroLumen extends Error {}

async function pedir<T>(metodo: "GET" | "POST", rota: string, corpo?: unknown): Promise<T> {
  const resp = await fetch(rota, {
    method: metodo,
    credentials: "same-origin",
    headers: corpo === undefined ? {} : { "Content-Type": "application/json" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  let dados: any = {};
  try {
    dados = await resp.json();
  } catch {
    // resposta vazia
  }
  if (!resp.ok) throw new ErroLumen(dados.erro || `Erro ${resp.status}`);
  return dados as T;
}

const q = (caminho: string) => encodeURIComponent(caminho);

export const api = {
  sistema: () => pedir<Sistema>("GET", "/api/sistema"),
  locais: () => pedir<{ locais: Local[] }>("GET", "/api/locais"),
  pasta: (caminho: string, ocultos = false) =>
    pedir<Pasta>("GET", `/api/arquivos?caminho=${q(caminho)}${ocultos ? "&ocultos=1" : ""}`),
  lerTexto: (caminho: string) =>
    pedir<{ caminho: string; conteudo: string; gravavel: boolean }>("GET", `/api/texto?caminho=${q(caminho)}`),
  gravarTexto: (caminho: string, conteudo: string) =>
    pedir<{ ok: boolean; caminho: string }>("POST", "/api/texto", { caminho, conteudo }),
  novaPasta: (pai: string, nome: string) => pedir<{ caminho: string }>("POST", "/api/pasta", { pai, nome }),
  renomear: (caminho: string, nome: string) => pedir<{ caminho: string }>("POST", "/api/renomear", { caminho, nome }),
  paraLixeira: (caminho: string) => pedir("POST", "/api/lixeira", { caminho }),
  lixeira: () => pedir<{ itens: Item[] }>("GET", "/api/lixeira"),
  restaurar: (caminho: string) => pedir("POST", "/api/lixeira/restaurar", { caminho }),
  esvaziarLixeira: () => pedir("POST", "/api/lixeira/esvaziar", {}),
  autenticar: (senha: string) => pedir<{ ok: boolean }>("POST", "/api/autenticar", { senha }),
  config: () => pedir<{ config: Config; teclados: Teclado[] }>("GET", "/api/config"),
  gravarConfig: (mudancas: Partial<Config>) => pedir<{ config: Config }>("POST", "/api/config", mudancas),
  som: () => pedir<Som>("GET", "/api/som"),
  gravarSom: (mudancas: Partial<Som>) => pedir<Som>("POST", "/api/som", mudancas),
  rede: () => pedir<Rede>("GET", "/api/rede"),
  energia: (acao: "desligar" | "reiniciar") => pedir("POST", "/api/energia", { acao }),
  discos: () => pedir<{ discos: Disco[] }>("GET", "/api/discos"),
  fusos: () => pedir<{ fusos: string[]; padrao: string; teclados: Teclado[] }>("GET", "/api/fusos"),
  urlArquivo: (caminho: string) => `/api/arquivo?caminho=${q(caminho)}`,
};

export function abrirSocket(rota: string) {
  const protocolo = location.protocol === "https:" ? "wss:" : "ws:";
  return new WebSocket(`${protocolo}//${location.host}${rota}`);
}

export function tamanhoLegivel(bytes = 0) {
  const unidades = ["B", "KB", "MB", "GB", "TB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < unidades.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toLocaleString("pt-BR", { maximumFractionDigits: n < 10 && i > 0 ? 1 : 0 })} ${unidades[i]}`;
}
