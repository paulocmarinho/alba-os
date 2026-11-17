// Comunicação com o servidor do sistema Alba (127.0.0.1, autenticado por cookie de sessão).

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
  papel_arquivo?: string;
  papel_definido?: boolean;
  escala: number;
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
export type Som = { disponivel: boolean; volume: number; mudo: boolean; placa?: boolean; bip?: boolean };

export class ErroAlba extends Error {}

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
  if (!resp.ok) throw new ErroAlba(dados.erro || `Erro ${resp.status}`);
  return dados as T;
}

const q = (caminho: string) => encodeURIComponent(caminho);

export type AppLoja = { id: string; nome: string; resumo: string; icone: string | null; instalado?: boolean };
export type DetalheLoja = AppLoja & {
  descricao: string;
  capturas: string[];
  desenvolvedor: string;
  versao: string;
  licenca: string;
  site?: string;
  verificado: boolean;
  tamanho_download?: number | null;
  tamanho_instalado?: number | null;
};
export type Vitrine = {
  destaque: { id: string; titulo: string; texto: string; cor: string; app: AppLoja };
  secoes: { titulo: string; apps: AppLoja[] }[];
};
export type TarefaLoja = { acao: string; progresso: number; estado: "rodando" | "pronto" | "erro"; texto: string; nome: string };
export type InstaladoLoja = { id: string; nome: string; versao: string; tamanho: string };

export type EstadoRede = {
  tem_wifi: boolean;
  wifi_ligado: boolean;
  wifi: { nome: string; sinal: number | null } | null;
  cabo: { nome: string; dispositivo: string } | null;
  online: boolean;
};
export type RedeWifi = { ssid: string; sinal: number; segura: boolean; empresarial: boolean; ativa: boolean; salva: boolean };
export type Notificacao = {
  id: number;
  app: string;
  titulo: string;
  texto: string;
  abrir: { app?: string; props?: Record<string, unknown>; desktop?: string } | null;
  quando: number;
  lida: boolean;
};
export type EstadoNotificacoes = { lista: Notificacao[]; nao_perturbe: boolean; nao_lidas: number };
export type Unidade = { dispositivo: string; nome: string; tamanho: number; montada: string | null };
export type ArquivoAchado = { caminho: string; nome: string; pasta: boolean; onde: string };

export const rede = {
  estado: () => pedir<EstadoRede>("GET", "/api/rede/estado"),
  redes: (buscar = false) => pedir<{ redes: RedeWifi[] }>("GET", `/api/rede/redes${buscar ? "?buscar=1" : ""}`),
  wifi: (corpo: { acao: "ligar"; ligado: boolean } | { acao: "conectar"; ssid: string; senha?: string } | { acao: "desconectar" } | { acao: "esquecer"; ssid: string }) =>
    pedir<EstadoRede>("POST", "/api/rede/wifi", corpo),
};

export const notificacoes = {
  listar: () => pedir<EstadoNotificacoes>("GET", "/api/notificacoes"),
  lidas: () => pedir<EstadoNotificacoes>("POST", "/api/notificacoes/acao", { acao: "lidas" }),
  apagar: (id?: number) => pedir<EstadoNotificacoes>("POST", "/api/notificacoes/acao", { acao: "apagar", id }),
  naoPerturbe: (ligado: boolean) => pedir<EstadoNotificacoes>("POST", "/api/notificacoes/acao", { acao: "nao_perturbe", ligado }),
};

export const arquivosExtra = {
  colar: (itens: string[], destino: string, acao: "copiar" | "mover") => pedir<{ itens: string[] }>("POST", "/api/colar", { itens, destino, acao }),
  unidades: () => pedir<{ unidades: Unidade[] }>("GET", "/api/unidades"),
  montar: (dispositivo: string) => pedir<{ caminho: string | null }>("POST", "/api/unidade", { dispositivo, acao: "montar" }),
  ejetar: (dispositivo: string) => pedir("POST", "/api/unidade", { dispositivo, acao: "ejetar" }),
  abrirExterno: (caminho: string) => pedir("POST", "/api/abrir", { caminho }),
  buscar: (q: string) => pedir<{ arquivos: ArquivoAchado[] }>("GET", `/api/busca/arquivos?q=${encodeURIComponent(q)}`),
};

export const loja = {
  vitrine: () => pedir<Vitrine>("GET", "/api/loja/vitrine"),
  buscar: (termo: string) => pedir<{ apps: AppLoja[] }>("GET", `/api/loja/buscar?q=${encodeURIComponent(termo)}`),
  app: (id: string) => pedir<DetalheLoja>("GET", `/api/loja/app?id=${encodeURIComponent(id)}`),
  instalados: () => pedir<{ apps: InstaladoLoja[]; tarefas: Record<string, TarefaLoja> }>("GET", "/api/loja/instalados"),
  atualizacoes: () => pedir<{ apps: string[] }>("GET", "/api/loja/atualizacoes"),
  instalar: (id: string, nome: string) => pedir("POST", "/api/loja/instalar", { id, nome }),
  remover: (id: string, nome: string) => pedir("POST", "/api/loja/remover", { id, nome }),
  atualizarTudo: () => pedir("POST", "/api/loja/atualizar", {}),
};

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
  recarregar: (sessao = false) => pedir<{ ok: boolean }>("POST", "/api/recarregar", { sessao }),
  verAtualizacao: () => pedir<InfoAtualizacao>("GET", "/api/atualizacao"),
  instalarAtualizacao: () => pedir<{ ok: boolean; atual: Compilacao }>("POST", "/api/atualizacao", {}),
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

export type Compilacao = { versao: string; commit: string; data: number };
export type InfoAtualizacao = { atual: Compilacao; nova: Compilacao | null; disponivel: boolean; live: boolean; erro?: string };
