#!/usr/bin/env bash
# Monta a árvore de arquivos do Alba em DESTINO (como se DESTINO fosse a raiz "/").
# Usado pela ISO (DESTINO = airootfs) e pelo pacote de atualização (DESTINO = pasta temporária).
#   sistema/montar-arquivos.sh DESTINO [--com-live]
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
D="${1:?Uso: montar-arquivos.sh DESTINO [--com-live]}"
LIVE="${2:-}"

[[ -f "$RAIZ/web/dist/index.html" ]] || { echo "Falta web/dist (rode npm run build em web/)." >&2; exit 1; }

L="$D/usr/share/alba"
mkdir -p "$L/web" "$L/servidor" "$L/sistema"
cp -a "$RAIZ/web/dist/." "$L/web/"
cp -a "$RAIZ/servidor/alba_servidor.py" "$RAIZ/servidor/pam.py" "$RAIZ/servidor/musica.py" "$RAIZ/servidor/loja.py" "$RAIZ/servidor/rede.py" "$RAIZ/servidor/notificacoes.py" "$RAIZ/servidor/busca.py" "$L/servidor/"
install -m755 "$RAIZ/sistema/instalar.sh" "$L/sistema/instalar.sh"

# Identidade da compilação (versão + commit + data), usada para saber se há atualização.
if [[ -f "$RAIZ/compilacao.json" ]]; then
  cp "$RAIZ/compilacao.json" "$L/compilacao.json"
else
  printf '{"versao": "%s", "commit": "", "data": 0}\n' "$(cat "$RAIZ/VERSAO")" >"$L/compilacao.json"
fi

install -Dm755 "$RAIZ/sistema/alba-sessao" "$D/usr/bin/alba-sessao"
for prog in alba-casca alba-app alba-enviar alba-captura; do
  install -Dm755 "$RAIZ/sistema/$prog" "$D/usr/bin/$prog"
done
mkdir -p "$L/casca"
cp -a "$RAIZ/sistema/casca/comum.py" "$RAIZ/sistema/casca/casca.py" "$RAIZ/sistema/casca/app.py" "$RAIZ/sistema/casca/janelas.py" "$RAIZ/sistema/casca/tema_janelas.py" "$RAIZ/sistema/casca/notificacoes.py" "$L/casca/"
for f in rc.xml menu.xml autostart; do
  install -Dm644 "$RAIZ/sistema/labwc/$f" "$D/etc/xdg/labwc/$f"
done
mkdir -p "$D/usr/share/themes/Alba/labwc"
cp -a "$RAIZ/sistema/tema-labwc/." "$D/usr/share/themes/Alba/labwc/"
install -Dm644 "$RAIZ/sistema/mimeapps.list" "$D/etc/xdg/mimeapps.list"
# Pacotes que esta versão do Alba precisa (o atualizador instala os que faltarem).
install -Dm644 "$RAIZ/iso/pacotes.txt" "$L/pacotes.txt"
install -Dm755 "$RAIZ/sistema/alba-atualizar" "$D/usr/local/bin/alba-atualizar"
install -Dm755 "$RAIZ/sistema/alba-identidade" "$D/usr/local/bin/alba-identidade"
install -Dm644 "$RAIZ/sistema/alba-identidade.hook" "$D/etc/pacman.d/hooks/alba-identidade.hook"
install -Dm644 "$RAIZ/sistema/alba-perfil.sh" "$D/etc/profile.d/alba.sh"
install -Dm644 "$RAIZ/iso/airootfs/etc/chromium/policies/managed/alba.json" "$D/etc/chromium/policies/managed/alba.json"
install -Dm440 "$RAIZ/sistema/alba-atualizar.sudoers" "$D/etc/sudoers.d/20-alba-atualizar"
# Tela de abertura (Plymouth): o tema vai junto com o Alba; alba-abertura o instala no sistema.
install -Dm755 "$RAIZ/sistema/alba-abertura" "$D/usr/local/bin/alba-abertura"
for f in "$RAIZ"/sistema/plymouth/alba/*; do
  install -Dm644 "$f" "$D/usr/share/alba/sistema/plymouth/alba/$(basename "$f")"
  [[ "${2:-}" == "--com-live" ]] && install -Dm644 "$f" "$D/usr/share/plymouth/themes/alba/$(basename "$f")"
done
if [[ "${2:-}" == "--com-live" ]]; then
  install -d "$D/etc/plymouth"
  printf '[Daemon]\nTheme=alba\nShowDelay=0\nDeviceTimeout=8\n' >"$D/etc/plymouth/plymouthd.conf"
fi
# A regra de permissão vai junto com o Alba; o atualizador (e a ISO) a põe em /etc/polkit-1.
install -Dm644 "$RAIZ/sistema/alba-polkit.rules" "$D/usr/share/alba/sistema/50-alba.rules"
if [[ "${2:-}" == "--com-live" ]]; then
  install -Dm644 "$RAIZ/sistema/alba-polkit.rules" "$D/etc/polkit-1/rules.d/50-alba.rules"
fi

if [[ "$LIVE" == "--com-live" ]]; then
  install -Dm755 "$RAIZ/sistema/alba-live-setup" "$D/usr/local/bin/alba-live-setup"
fi
