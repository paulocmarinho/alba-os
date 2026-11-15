/**
 * Deixa o motor de exibição invisível: nada de menu de navegador, zoom, recarregar,
 * imprimir, buscar na página, voltar página, arrastar imagens ou selecionar a interface.
 * As ações são só bloqueadas no navegador — os apps (ex.: Terminal) continuam recebendo as teclas.
 */
const TECLAS_CTRL = new Set(["r", "p", "s", "f", "g", "h", "j", "d", "o", "u", "=", "+", "-", "_", "0"]);
const TECLAS_SOLTAS = new Set(["F1", "F3", "F5", "F6", "F7", "F10", "F11", "F12", "BrowserBack", "BrowserForward", "BrowserRefresh", "BrowserHome", "BrowserSearch"]);

function editavel(alvo: EventTarget | null) {
  const el = alvo as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}

export function blindar() {
  window.addEventListener(
    "keydown",
    (e) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (TECLAS_SOLTAS.has(e.key)) e.preventDefault();
      else if ((e.ctrlKey || e.metaKey) && TECLAS_CTRL.has(k)) e.preventDefault();
      else if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Home")) e.preventDefault();
      else if (e.key === "Backspace" && !editavel(e.target)) e.preventDefault();
    },
    { capture: true },
  );

  // Menu de contexto do navegador nunca aparece; os menus próprios do Alba continuam funcionando.
  window.addEventListener("contextmenu", (e) => e.preventDefault());
  // Zoom com Ctrl + roda e gestos de pinça.
  window.addEventListener("wheel", (e) => e.ctrlKey && e.preventDefault(), { passive: false });
  for (const ev of ["gesturestart", "gesturechange"]) window.addEventListener(ev, (e) => e.preventDefault());
  // Arrastar imagens/links para fora, soltar arquivos que abririam outra página.
  window.addEventListener("dragstart", (e) => {
    const el = e.target as HTMLElement;
    if (el.tagName === "IMG" || el.tagName === "A") e.preventDefault();
  });
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => e.preventDefault());
  // Botões laterais do mouse (voltar/avançar).
  window.addEventListener("mouseup", (e) => (e.button === 3 || e.button === 4) && e.preventDefault());
  history.pushState(null, "", location.href);
  window.addEventListener("popstate", () => history.pushState(null, "", location.href));
  // Nenhum campo pede para o navegador lembrar nada.
  const desligarPreenchimento = (raiz: ParentNode) => {
    raiz.querySelectorAll?.("input, textarea").forEach((el) => {
      const campo = el as HTMLInputElement;
      if (!campo.hasAttribute("autocomplete")) campo.setAttribute("autocomplete", campo.type === "password" ? "new-password" : "off");
      campo.setAttribute("spellcheck", "false");
      campo.setAttribute("autocorrect", "off");
      campo.setAttribute("autocapitalize", "off");
      campo.setAttribute("data-form-type", "other");
    });
  };
  desligarPreenchimento(document);
  new MutationObserver((mudancas) => {
    for (const m of mudancas) m.addedNodes.forEach((n) => n.nodeType === 1 && desligarPreenchimento(n as Element));
  }).observe(document.body, { childList: true, subtree: true });
}
