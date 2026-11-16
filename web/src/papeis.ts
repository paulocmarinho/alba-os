import { api, type Config } from "./api";

/** Papéis de parede que vêm com o Alba (fotos do Unsplash, de uso livre). */
export const PAPEIS = [
  { id: "mar", nome: "Mar ao entardecer", foto: "/papeis/mar.jpg", mini: "/papeis/mar-mini.jpg", destaque: "#e0662f" },
  { id: "montanhas", nome: "Montanhas", foto: "/papeis/montanhas.jpg", mini: "/papeis/montanhas-mini.jpg", destaque: "#d9822b" },
  { id: "alba", nome: "Formas de vidro", foto: null, mini: null, destaque: "#5b6ee1" },
] as const;

/** Endereço da imagem do papel atual (null = papel desenhado, as formas de vidro). */
export function fotoDoPapel(config: Pick<Config, "papel" | "papel_arquivo"> | null | undefined): string | null {
  if (!config) return "/papeis/mar.jpg";
  if (config.papel === "personalizado" && config.papel_arquivo) return api.urlArquivo(config.papel_arquivo);
  const p = PAPEIS.find((x) => x.id === config.papel);
  return p ? p.foto : "/papeis/mar.jpg";
}
