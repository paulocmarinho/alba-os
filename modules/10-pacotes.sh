#!/usr/bin/env bash
# Pacotes base: tema, fontes, ícones, Firefox, apps do dia a dia.

modulo_pacotes() {
  etapa "Pacotes base"
  rodar sudo pacman -Sy --noconfirm
  mapfile -t base < <(ler_lista "$LUMEN_DIR/packages/base.txt")
  pacman_instalar "${base[@]}"

  etapa "Pacotes do AUR"
  mapfile -t aur < <(ler_lista "$LUMEN_DIR/packages/aur.txt")
  aur_instalar "${aur[@]}"

  if tem flatpak; then
    rodar flatpak remote-add --user --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo
    ok "Flathub disponível na loja de apps."
  fi
}
