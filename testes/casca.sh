#!/usr/bin/env bash
# Teste da sessão do Alba num compositor sem tela (roda no container Arch do GitHub).
if [[ -z "${DBUS_SESSION_BUS_ADDRESS:-}" ]]; then exec dbus-run-session -- bash "$0" "$@"; fi
set -x
export HOME=/root ALBA_DEPURAR=1
mkdir -p saida
R="$PWD"
export XDG_RUNTIME_DIR=/tmp/xdg; mkdir -p $XDG_RUNTIME_DIR; chmod 700 $XDG_RUNTIME_DIR
export WLR_BACKENDS=headless WLR_RENDERER=pixman WLR_LIBINPUT_NO_DEVICES=1 WLR_HEADLESS_OUTPUTS=1
export WEBKIT_DISABLE_DMABUF_RENDERER=1 LIBGL_ALWAYS_SOFTWARE=1 WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS=1
export XKB_DEFAULT_LAYOUT=br

# Instala o Alba no próprio container (como numa máquina de verdade)
bash sistema/montar-arquivos.sh / || exit 1
echo 'root:teste123' | chpasswd
mkdir -p /root/Músicas /root/Documentos

export ALBA_TOKEN=teste ALBA_URL=http://127.0.0.1:7070
python3 /usr/share/alba/servidor/alba_servidor.py --porta 7070 --token teste --web /usr/share/alba/web > saida/servidor.log 2>&1 &
sleep 2
labwc -s /usr/bin/alba-casca > saida/compositor.log 2>&1 &
sleep 4
export WAYLAND_DISPLAY=$(ls $XDG_RUNTIME_DIR | grep -m1 "^wayland-[0-9]$")
wlr-randr --output HEADLESS-1 --custom-mode 1920x1080
sleep 25
grim saida/1-bloqueio.png
wtype teste123; sleep 0.5; wtype -k Return
sleep 8
grim saida/2-mesa.png
alba-app arquivos &
sleep 10
grim saida/3-arquivos.png
firefox --new-window about:blank > saida/firefox.log 2>&1 &
sleep 25
grim saida/4-firefox.png
alba-enviar '{"tipo": "painel", "qual": "calendario"}'
sleep 3
grim saida/5-calendario.png
alba-enviar '{"tipo": "painel", "qual": "calendario"}'
alba-enviar '{"tipo": "painel", "qual": "central"}'
sleep 3
grim saida/6-central.png
alba-enviar '{"tipo": "painel", "qual": "central"}'
alba-app musica &
sleep 10
grim saida/7-sleeve.png
cp ~/.cache/alba/*.log saida/ 2>/dev/null
python3 -m pywayland.scanner --help > saida/scanner.txt 2>&1
