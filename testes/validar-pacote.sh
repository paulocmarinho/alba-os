#!/usr/bin/env bash
# Confere se um pacote de atualização passa pela lista de lugares permitidos de um atualizador.
# Uso: validar-pacote.sh ATUALIZADOR PASTA_DO_PACOTE
# Rodado antes de publicar, com o atualizador atual e com o mais antigo ainda em uso: um
# atualizador velho recusa o pacote inteiro se houver um arquivo num lugar que ele não conhece.
set -euo pipefail
ATUALIZADOR="$1"; PACOTE="$2"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
ln -s "$(realpath "$PACOTE")" "$TMP/x"
python3 - "$ATUALIZADOR" "$TMP/valida.sh" <<'PY'
import sys
s = open(sys.argv[1]).read()
a = s.index("while IFS= read -r -d '' item; do")
fim = 'done < <(find "$TMP/x" -mindepth 1 -print0)'
b = s.index(fim) + len(fim)
open(sys.argv[2], "w").write("falhar(){ echo \"RECUSADO por $ATUALIZADOR: $*\" >&2; exit 1; }\n" + s[a:b].replace('find "$TMP/x" -mindepth 1', 'find -L "$TMP/x" -mindepth 1') + "\n")
PY
TMP="$TMP" ATUALIZADOR="$ATUALIZADOR" bash -c "TMP='$TMP'; ATUALIZADOR='$ATUALIZADOR'; source '$TMP/valida.sh'"
echo "ok: $ATUALIZADOR aceita o pacote"
