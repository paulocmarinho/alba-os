#!/usr/bin/env bash
# Guarda a configuração atual do Plasma antes de qualquer mudança.

modulo_backup() {
  etapa "Backup da configuração atual"
  local pasta="$HOME/.local/share/lumen/backups"
  local arquivo
  arquivo="$pasta/plasma-$(date +%Y%m%d-%H%M%S).tar.gz"
  local itens=(
    .config/kdeglobals
    .config/kwinrc
    .config/plasmashellrc
    .config/plasma-org.kde.plasma.desktop-appletsrc
    .config/plasmarc
    .config/dolphinrc
    .config/Kvantum
    .config/MangoHud
    .config/mimeapps.list
  )
  local existentes=() i
  for i in "${itens[@]}"; do
    [[ -e "$HOME/$i" ]] && existentes+=("$i")
  done
  if ((${#existentes[@]} == 0)); then
    aviso "Nada para guardar (configuração do Plasma ainda não existe)."
    return 0
  fi
  rodar mkdir -p "$pasta"
  rodar tar -czf "$arquivo" -C "$HOME" "${existentes[@]}"
  ok "Backup salvo em $arquivo"
  echo "$arquivo" > "$HOME/.cache/lumen/ultimo-backup" 2>/dev/null || true
}
