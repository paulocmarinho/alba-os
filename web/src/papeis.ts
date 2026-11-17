import { api, type Config } from "./api";

export type Credito = { autor: string; local: string; fonte: string; perfil: string; doacao?: string };

/** Papéis de parede que vêm com o Alba. As fotos têm licença livre; o crédito aparece na tela de bloqueio. */
export const PAPEIS: readonly { id: string; nome: string; foto: string | null; mini: string | null; destaque: string; credito?: Credito }[] = [
  {
    id: "rio",
    nome: "Amanhecer no Rio",
    foto: "/papeis/rio.jpg",
    mini: "/papeis/rio-mini.jpg",
    destaque: "#e0662f",
    credito: {
      autor: "Bruno Scramgnon",
      local: "Rio de Janeiro, Rio de Janeiro, Brasil",
      fonte: "Pexels",
      perfil: "https://www.pexels.com/@brunoscramgnon/",
      doacao: "https://www.paypal.com/donate?token=11_NnYV6W-ER8Zfl43zvAiPr5FqP1zkUG_U2jB7wlYwqIKRMWawPyoEV2CRH6JCte5n7miQPbrrM2EnY&locale.x=US",
    },
  },
  { id: "montanhas", nome: "Montanhas", foto: "/papeis/montanhas.jpg", mini: "/papeis/montanhas-mini.jpg", destaque: "#d9822b" },
  { id: "alba", nome: "Formas de vidro", foto: null, mini: null, destaque: "#5b6ee1" },
];

/** Endereço da imagem do papel atual (null = papel desenhado, as formas de vidro). */
export function fotoDoPapel(config: Pick<Config, "papel" | "papel_arquivo"> | null | undefined): string | null {
  if (!config) return "/papeis/rio.jpg";
  if (config.papel === "personalizado" && config.papel_arquivo) return api.urlArquivo(config.papel_arquivo);
  const p = PAPEIS.find((x) => x.id === config.papel);
  return p ? p.foto : "/papeis/rio.jpg";
}

/** Crédito da foto do papel atual (só nas fotos que vêm com o Alba). */
export function creditoDoPapel(config: Pick<Config, "papel"> | null | undefined): Credito | null {
  return PAPEIS.find((x) => x.id === (config?.papel ?? "rio"))?.credito ?? null;
}
