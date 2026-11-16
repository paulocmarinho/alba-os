#!/usr/bin/env bash
# Roda dentro do container Arch: compositor sem tela, sonda e capturas.
set -x
export XDG_RUNTIME_DIR=/tmp/xdg; mkdir -p $XDG_RUNTIME_DIR; chmod 700 $XDG_RUNTIME_DIR
export WLR_BACKENDS=headless WLR_RENDERER=pixman WLR_LIBINPUT_NO_DEVICES=1 WLR_HEADLESS_OUTPUTS=1
export WEBKIT_DISABLE_DMABUF_RENDERER=1 LIBGL_ALWAYS_SOFTWARE=1 GDK_BACKEND=wayland
mkdir -p saida
labwc -d > saida/labwc.log 2>&1 &
sleep 3
export WAYLAND_DISPLAY=$(ls $XDG_RUNTIME_DIR | grep -m1 '^wayland-[0-9]$')
echo "WAYLAND_DISPLAY=$WAYLAND_DISPLAY"
wlr-randr --output HEADLESS-1 --custom-mode 1600x900 || wlr-randr
LD_PRELOAD=/usr/lib/libgtk4-layer-shell.so python3 testes/sonda.py > saida/sonda.log 2>&1 &
sleep 12
grim saida/1-sonda.png
foot -e sh -c 'echo terminal; sleep 30' &
sleep 3
grim saida/2-foot.png
python3 -c "import pywayland, sys; print('pywayland', pywayland.__version__)"
ls /usr/share/wlr-protocols/unstable/ | grep foreign || find / -name "*foreign-toplevel*xml" 2>/dev/null | head
pacman -Q labwc gtk4-layer-shell webkitgtk-6.0 python-gobject python-pywayland wlr-protocols 2>&1
cat saida/sonda.log; tail -30 saida/labwc.log
