#!/usr/bin/env bash
# Teste da sessão de instalação (modo ao vivo): o instalador deve abrir sozinho, maximizado.
if [[ -z "${DBUS_SESSION_BUS_ADDRESS:-}" ]]; then exec dbus-run-session -- bash "$0" "$@"; fi
set -x
export HOME=/root ALBA_DEPURAR=1
mkdir -p saida /run/archiso
export XDG_RUNTIME_DIR=/tmp/xdg; mkdir -p $XDG_RUNTIME_DIR; chmod 700 $XDG_RUNTIME_DIR
export WLR_BACKENDS=headless WLR_RENDERER=pixman WLR_LIBINPUT_NO_DEVICES=1 WLR_HEADLESS_OUTPUTS=1
export WEBKIT_DISABLE_DMABUF_RENDERER=1 LIBGL_ALWAYS_SOFTWARE=1 WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS=1
bash sistema/montar-arquivos.sh / --com-live || exit 1
export ALBA_TOKEN=teste ALBA_URL=http://127.0.0.1:7070
python3 /usr/share/alba/servidor/alba_servidor.py --porta 7070 --token teste --web /usr/share/alba/web --live > saida/servidor.log 2>&1 &
sleep 2
chmod 644 /usr/bin/alba-casca /usr/bin/alba-app /usr/bin/alba-enviar  # igual à ISO 0.4
labwc -s "bash /usr/bin/alba-casca" > saida/compositor.log 2>&1 &
sleep 4
export WAYLAND_DISPLAY=$(ls $XDG_RUNTIME_DIR | grep -m1 "^wayland-[0-9]$")
wlr-randr --output HEADLESS-1 --custom-mode 1920x1080
sleep 30
grim saida/L1-instalador.png
alba-enviar '{"tipo": "painel", "qual": "menu"}'
sleep 4
grim saida/L2-menu.png
