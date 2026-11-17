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
export WLR_SCENE_DEBUG_DAMAGE=rerender  # igual à sessão sem placa de vídeo
for v in $ALBA_AMBIENTE; do export "$v"; done
export XKB_DEFAULT_LAYOUT=br

# Instala o Alba no próprio container (como numa máquina de verdade)
bash sistema/montar-arquivos.sh / || exit 1
echo 'root:teste123' | chpasswd
mkdir -p /root/Músicas /root/Documentos

export ALBA_TOKEN=teste ALBA_URL=http://127.0.0.1:7070
python3 /usr/share/alba/servidor/alba_servidor.py --porta 7070 --token teste --web /usr/share/alba/web > saida/servidor.log 2>&1 &
sleep 2
chmod 644 /usr/bin/alba-casca  # igual à ISO 0.4
labwc -s "bash /usr/bin/alba-casca" > saida/compositor.log 2>&1 &
sleep 4
export WAYLAND_DISPLAY=$(ls $XDG_RUNTIME_DIR | grep -m1 "^wayland-[0-9]$")
wlr-randr --output HEADLESS-1 --custom-mode 1920x1080
sleep 25
grim saida/1-bloqueio.png
for n in $(seq 10 29); do grim -s 0.25 saida/r$n.jpg; sleep 0.2; done  # rajada: procura quadros pela metade
wtype teste123; sleep 0.5; wtype -k Return
sleep 4
grim saida/1b-senha.png
alba-enviar desbloquear-teste
sleep 4
grim saida/2-mesa.png
alba-app arquivos &
sleep 10
grim saida/3-arquivos.png
alba-enviar '{"tipo":"lancar","desktop":"firefox.desktop"}'  # igual a clicar no dock
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
alba-enviar launchpad
sleep 4
grim saida/8-launchpad.png
wtype fire
sleep 2
grim saida/9-launchpad-busca.png
wtype -k Escape; wtype -k Escape
sleep 2
gdbus call --session --dest org.freedesktop.Notifications --object-path /org/freedesktop/Notifications \
  --method org.freedesktop.Notifications.Notify "Firefox" 0 "" "Download concluído" "relatorio.pdf" "[]" "{}" 5000 > saida/notificacao.txt 2>&1
sleep 1
grim saida/10-notificacao.png
alba-app ajustes '{"secao": "sobre"}' &
sleep 8
grim saida/11-sobre.png
# ---- bloco 1: rede, notificações, Alt+Tab, busca
mkdir -p ~/Documentos && echo "relatório" > ~/Documentos/relatorio-anual.txt
alba-enviar '{"tipo": "painel", "qual": "rede"}'
sleep 3
grim saida/14-rede.png
alba-enviar fecharSobre; sleep 1
alba-enviar '{"tipo": "painel", "qual": "calendario"}'
sleep 3
grim saida/15-notificacoes.png
alba-enviar fecharSobre; sleep 1
alba-enviar '{"tipo": "alternar", "direcao": 1, "manter": true}'
sleep 3
grim saida/16-alttab.png
wtype -k Escape; sleep 1
alba-enviar busca
sleep 3
wtype "rel"
sleep 3
grim saida/17-busca.png
wtype -k Escape; wtype -k Escape; sleep 1
alba-enviar busca
sleep 2
wtype "12*3+4"
sleep 2
grim saida/18-conta.png
wtype -k Escape; wtype -k Escape; sleep 1
alba-app loja &
sleep 15
grim saida/12-loja.png
alba-app loja '{"app": "com.spotify.Client"}' &
sleep 10
grim saida/13-loja-spotify.png
curl -s -b "alba=$ALBA_TOKEN" -H "X-Alba-Token: $ALBA_TOKEN" "$ALBA_URL/api/loja/buscar?q=video" > saida/loja-busca.json
# ---- Ajustes › Apps e atualizações
H=(-H "X-Alba-Token: $ALBA_TOKEN")
curl -s "${H[@]}" "$ALBA_URL/api/apps" > saida/apps.json
curl -s "${H[@]}" "$ALBA_URL/api/apps/padrao" > saida/apps-padrao.json
curl -s "${H[@]}" "$ALBA_URL/api/atualizacao/tudo" > saida/atualizacao-tudo.json
curl -s "${H[@]}" -X POST -H "Content-Type: application/json" -d '{"id": "alba.notas", "ligado": true}' "$ALBA_URL/api/apps/autoinicio" > saida/autoinicio.json
ls ~/.config/autostart >> saida/autoinicio.json 2>&1
{ /usr/local/bin/alba-atualizar --remover firefox; echo "codigo $?"
  pacman -S --noconfirm --needed cowsay >/dev/null 2>&1; /usr/local/bin/alba-atualizar --remover cowsay; echo "codigo $?"
  pacman -Qq cowsay; echo "ainda instalado? $?"; } > saida/remover.txt 2>&1
alba-app ajustes '{"secao": "apps"}' &
sleep 8
grim saida/24-apps.png
alba-app ajustes '{"secao": "sobre"}' &
sleep 12
grim saida/25-atualizacoes.png

# ---- Monitor de Atividade
alba-app ajustes '{"secao": "aparencia"}' &
sleep 6
grim saida/23-papel-credito.png
alba-app monitor &
sleep 2; alba-app arquivos &
sleep 9
grim saida/20-monitor.png
alba-app monitor '{"aba": "desempenho"}' &
sleep 8
grim saida/21-monitor-desempenho.png
curl -s -H "X-Alba-Token: $ALBA_TOKEN" "$ALBA_URL/api/monitor" > saida/monitor.json

# Recarga leve depois de atualizar: a casca volta sem tela de bloqueio e as janelas continuam.
mkdir -p ~/.cache/alba && touch ~/.cache/alba/manter-desbloqueado
pkill -f /usr/share/alba/casca/casca.py
sleep 10
grim saida/19-recarregada.png
ls -la ~/.config/labwc ~/.local/share/themes/Alba/labwc > saida/tema.txt 2>&1
cp ~/.cache/alba/*.log saida/ 2>/dev/null
python3 -m pywayland.scanner --help > saida/scanner.txt 2>&1

# ---- Reiniciar pela busca: a caixa de confirmação precisa deixar a camada de cima clicável
alba-enviar busca; sleep 2; wtype "Reiniciar"; sleep 2; wtype -k Return; sleep 3
grim saida/22-confirmar-reiniciar.png
grep -o "sobre → {[^}]*dialogo[^}]*}" saida/compositor.log > saida/dialogo.txt 2>/dev/null || true
