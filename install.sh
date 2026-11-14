#!/usr/bin/env bash
# Instalador do Lumen OS — transforma um CachyOS/Arch com KDE Plasma 6 no Lumen.
#
# Uso: ./install.sh [opções]
#   --simular       mostra o que seria feito, sem mudar nada
#   --somente-tema  aplica só o visual (sem pacotes, jogos ou driver)
#   --sem-jogos     pula o pacote de jogos
#   --sim           responde "sim" às perguntas (ex.: instalar driver NVIDIA)
#   --ajuda         mostra esta ajuda

set -uo pipefail

LUMEN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export LUMEN_DIR
# shellcheck source=lib/common.sh
source "$LUMEN_DIR/lib/common.sh"
for m in "$LUMEN_DIR"/modules/*.sh; do
  # shellcheck source=/dev/null
  source "$m"
done

SOMENTE_TEMA=0
SEM_JOGOS=0

for arg in "$@"; do
  case "$arg" in
    --simular) LUMEN_SIMULAR=1 ;;
    --somente-tema) SOMENTE_TEMA=1 ;;
    --sem-jogos) SEM_JOGOS=1 ;;
    --sim) LUMEN_SIM_TUDO=1 ;;
    --ajuda|-h|--help) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) erro "Opção desconhecida: $arg"; exit 2 ;;
  esac
done
export LUMEN_SIMULAR LUMEN_SIM_TUDO

printf '\n\033[1;38;5;141m  ◎  Lumen OS %s\033[0m\n' "$LUMEN_VERSAO"
printf '     vidro claro, fitas de luz e jogos\n'
[[ "$LUMEN_SIMULAR" == "1" ]] && printf '     \033[1;33mmodo simulação: nada será alterado\033[0m\n'

# Verificações
if [[ $EUID -eq 0 ]]; then
  erro "Rode como seu usuário normal, não como root. O script pede sudo quando precisar."
  exit 1
fi
if ! tem pacman; then
  erro "O Lumen precisa de uma base Arch (recomendado: CachyOS com KDE Plasma)."
  exit 1
fi
if ! tem plasmashell; then
  erro "KDE Plasma não encontrado. Instale o CachyOS na edição KDE Plasma."
  exit 1
fi
versao_plasma="$(plasmashell --version 2>/dev/null | grep -oE '[0-9]+' | head -n1)"
if [[ -n "$versao_plasma" && "$versao_plasma" -lt 6 ]]; then
  erro "É preciso o Plasma 6 ou mais novo (encontrado: $versao_plasma)."
  exit 1
fi
if [[ -f /etc/os-release ]] && ! grep -qi cachyos /etc/os-release; then
  aviso "Não é CachyOS. Deve funcionar em Arch, mas os pacotes de jogos e o driver podem variar."
fi
if [[ "$LUMEN_SIMULAR" != "1" && "$SOMENTE_TEMA" != "1" ]]; then
  sudo -v || { erro "Sem permissão de sudo."; exit 1; }
fi

modulo_backup
if [[ "$SOMENTE_TEMA" != "1" ]]; then
  modulo_pacotes
  [[ "$SEM_JOGOS" != "1" ]] && modulo_jogos
  modulo_nvidia
fi
modulo_tema
modulo_plasma

printf '\n'
ok "Lumen instalado. Saia e entre de novo na sessão para tudo assumir o visual novo."
info "Para desfazer o visual: ./restaurar.sh"
info "Registro completo: $LUMEN_LOG"
