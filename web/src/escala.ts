/**
 * Tamanho da interface (Ajustes › Aparência). É um zoom do próprio Alba, aplicado na página:
 * o motor de exibição continua em 1:1 com a tela (escala fracionária no compositor deixava a
 * imagem pequena e o mouse desalinhado). Coordenadas do mouse chegam em pixels da tela e
 * precisam ser divididas pela escala para virar posições da interface.
 */
let z = 1;

export function definirEscala(valor: number) {
  // Na casca, quem aplica o tamanho é o próprio motor (zoom do WebKit), com coordenadas já certas.
  if (new URLSearchParams(location.search).get("casca") === "1") return;
  z = [1, 1.25, 1.5].includes(valor) ? valor : 1;
  document.documentElement.style.setProperty("zoom", String(z));
}

export const escala = () => z;
export const larguraTela = () => window.innerWidth / z;
export const alturaTela = () => window.innerHeight / z;
export const emCss = (pixelsDaTela: number) => pixelsDaTela / z;
