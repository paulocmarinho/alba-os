#!/usr/bin/env bash
# Pacote de jogos: Steam, Proton, GameMode, MangoHud, Gamescope, Lutris, Heroic.

modulo_jogos() {
  etapa "Jogos"
  if ! grep -Eq '^\[multilib\]' /etc/pacman.conf; then
    aviso "O repositório [multilib] está desativado; a Steam precisa dele."
    aviso "Ative em /etc/pacman.conf (descomente [multilib] e a linha Include) e rode de novo."
    return 0
  fi

  mapfile -t jogos < <(ler_lista "$LUMEN_DIR/packages/jogos.txt")
  pacman_instalar "${jogos[@]}"

  if getent group gamemode >/dev/null && ! id -nG "$USER" | grep -qw gamemode; then
    rodar sudo usermod -aG gamemode "$USER"
    ok "Usuário adicionado ao grupo gamemode (vale após sair e entrar de novo)."
  fi

  copiar "$LUMEN_DIR/theme/mangohud/MangoHud.conf" "$HOME/.config/MangoHud/MangoHud.conf"
  ok "MangoHud configurado no estilo Lumen (Shift direito + F12 mostra/esconde)."
}
