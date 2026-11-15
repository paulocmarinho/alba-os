# Alba OS: no tty1, o login abre a sessão gráfica do Alba.
if [ "$(tty)" = "/dev/tty1" ] && [ -z "${WAYLAND_DISPLAY:-}" ] && [ "$(id -u)" -ne 0 ]; then
  exec /usr/bin/alba-sessao
fi
