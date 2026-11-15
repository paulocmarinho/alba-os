# Lúmen OS: no tty1, o login abre a sessão gráfica do Lúmen.
if [ "$(tty)" = "/dev/tty1" ] && [ -z "${WAYLAND_DISPLAY:-}" ] && [ "$(id -u)" -ne 0 ]; then
  exec /usr/bin/lumen-sessao
fi
