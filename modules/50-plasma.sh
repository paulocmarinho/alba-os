#!/usr/bin/env bash
# Monta a barra superior e a dock, aplica o papel de parede e reinicia o Plasma.

modulo_plasma() {
  etapa "Barra superior e dock"
  local qdbus=""
  if tem qdbus6; then qdbus="qdbus6"; elif tem qdbus; then qdbus="qdbus"; fi
  if [[ -z "$qdbus" ]] || [[ -z "${WAYLAND_DISPLAY:-}${DISPLAY:-}" ]]; then
    aviso "Sessão do Plasma não encontrada. Rode o instalador de dentro da área de trabalho."
    return 0
  fi

  local script
  script="$(sed -e "s#@LOGO@#${LUMEN_LOGO}#g" -e "s#@WALLPAPER@#${LUMEN_WALLPAPER}#g" "$LUMEN_DIR/plasma/layout.js")"
  if [[ "$LUMEN_SIMULAR" == "1" ]]; then
    printf '  [simulação] %s org.kde.plasmashell /PlasmaShell evaluateScript <plasma/layout.js>\n' "$qdbus"
  elif "$qdbus" org.kde.plasmashell /PlasmaShell org.kde.PlasmaShell.evaluateScript "$script" >>"$LUMEN_LOG" 2>&1; then
    ok "Barra superior completa e dock flutuante criadas."
  else
    erro "O Plasma recusou o script de layout. Veja $LUMEN_LOG."
    return 1
  fi

  tem plasma-apply-wallpaperimage && rodar plasma-apply-wallpaperimage "$LUMEN_WALLPAPER" >/dev/null 2>&1 || true

  # Painéis translúcidos (0 = adaptável, 1 = opaco, 2 = translúcido).
  local rc="$HOME/.config/plasmashellrc" grupo
  if [[ -f "$rc" ]]; then
    while read -r grupo; do
      kconf --file plasmashellrc --group PlasmaViews --group "$grupo" --key panelOpacity 2
    done < <(grep -oE '^\[PlasmaViews\]\[Panel [0-9]+\]$' "$rc" | sed -E 's/^\[PlasmaViews\]\[(Panel [0-9]+)\]$/\1/' | sort -u)
  fi

  etapa "Reiniciando o Plasma"
  if systemctl --user list-unit-files plasma-plasmashell.service >/dev/null 2>&1; then
    rodar systemctl --user restart plasma-plasmashell.service
  elif tem kquitapp6; then
    rodar kquitapp6 plasmashell || true
    rodar bash -c "nohup plasmashell >/dev/null 2>&1 &"
  fi
  ok "Plasma reiniciado com o visual do Lumen."
}
