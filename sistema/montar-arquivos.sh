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
cp -a "$RAIZ/servidor/alba_servidor.py" "$RAIZ/servidor/pam.py" "$RAIZ/servidor/musica.py" "$L/servidor/"
install -m755 "$RAIZ/sistema/instalar.sh" "$L/sistema/instalar.sh"

# Identidade da compilação (versão + commit + data), usada para saber se há atualização.
if [[ -f "$RAIZ/compilacao.json" ]]; then
  cp "$RAIZ/compilacao.json" "$L/compilacao.json"
else
  printf '{"versao": "%s", "commit": "", "data": 0}\n' "$(cat "$RAIZ/VERSAO")" >"$L/compilacao.json"
fi

install -Dm755 "$RAIZ/sistema/alba-sessao" "$D/usr/bin/alba-sessao"
install -Dm755 "$RAIZ/sistema/alba-atualizar" "$D/usr/local/bin/alba-atualizar"
install -Dm755 "$RAIZ/sistema/alba-identidade" "$D/usr/local/bin/alba-identidade"
install -Dm644 "$RAIZ/sistema/alba-identidade.hook" "$D/etc/pacman.d/hooks/alba-identidade.hook"
install -Dm644 "$RAIZ/sistema/alba-perfil.sh" "$D/etc/profile.d/alba.sh"
install -Dm644 "$RAIZ/iso/airootfs/etc/chromium/policies/managed/alba.json" "$D/etc/chromium/policies/managed/alba.json"
install -Dm440 "$RAIZ/sistema/alba-atualizar.sudoers" "$D/etc/sudoers.d/20-alba-atualizar"

if [[ "$LIVE" == "--com-live" ]]; then
  install -Dm755 "$RAIZ/sistema/alba-live-setup" "$D/usr/local/bin/alba-live-setup"
fi
