#!/usr/bin/env bash
# Volta a configuração do Plasma para o backup feito antes do Lumen.
# Uso: ./restaurar.sh [arquivo-de-backup.tar.gz]
# Sem argumento, usa o backup mais recente. Os pacotes instalados continuam no sistema.

set -uo pipefail
LUMEN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$LUMEN_DIR/lib/common.sh"

backup="${1:-}"
if [[ -z "$backup" ]]; then
  backup="$(ls -1t "$HOME"/.local/share/lumen/backups/plasma-*.tar.gz 2>/dev/null | head -n1)"
fi
if [[ -z "$backup" || ! -f "$backup" ]]; then
  erro "Nenhum backup encontrado em ~/.local/share/lumen/backups."
  exit 1
fi

etapa "Restaurando $backup"
rm -f "$HOME/.local/share/applications/org.kde.dolphin.desktop"
rm -rf "$HOME/.config/Kvantum/LumenGlass"
tar -xzf "$backup" -C "$HOME"
tem xdg-mime && xdg-mime default org.kde.dolphin.desktop inode/directory
tem kbuildsycoca6 && kbuildsycoca6 >/dev/null 2>&1
tem qdbus6 && qdbus6 org.kde.KWin /KWin reconfigure >/dev/null 2>&1
if systemctl --user list-unit-files plasma-plasmashell.service >/dev/null 2>&1; then
  systemctl --user restart plasma-plasmashell.service
fi
ok "Configuração anterior restaurada. Saia e entre de novo na sessão para concluir."
