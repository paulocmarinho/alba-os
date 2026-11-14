#!/usr/bin/env bash
# Funções compartilhadas pelo instalador do Lumen.

LUMEN_VERSAO="0.1.0"
LUMEN_DIR="${LUMEN_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
LUMEN_SIMULAR="${LUMEN_SIMULAR:-0}"
LUMEN_LOG="${LUMEN_LOG:-$HOME/.cache/lumen/instalacao.log}"

mkdir -p "$(dirname "$LUMEN_LOG")"

_cor() { printf '\033[%sm' "$1"; }
info()  { printf '%s●%s %s\n' "$(_cor '1;38;5;105')" "$(_cor 0)" "$*" | tee -a "$LUMEN_LOG"; }
ok()    { printf '%s✓%s %s\n' "$(_cor '1;32')" "$(_cor 0)" "$*" | tee -a "$LUMEN_LOG"; }
aviso() { printf '%s!%s %s\n' "$(_cor '1;33')" "$(_cor 0)" "$*" | tee -a "$LUMEN_LOG"; }
erro()  { printf '%s✗%s %s\n' "$(_cor '1;31')" "$(_cor 0)" "$*" | tee -a "$LUMEN_LOG" >&2; }
etapa() { printf '\n%s━━ %s%s\n' "$(_cor '1;38;5;141')" "$*" "$(_cor 0)" | tee -a "$LUMEN_LOG"; }

# Executa um comando, ou só mostra o que faria no modo --simular.
rodar() {
  if [[ "$LUMEN_SIMULAR" == "1" ]]; then
    printf '  [simulação] %s\n' "$*" | tee -a "$LUMEN_LOG"
    return 0
  fi
  echo "  \$ $*" >> "$LUMEN_LOG"
  "$@"
}

tem() { command -v "$1" >/dev/null 2>&1; }

# Lê uma lista de pacotes, ignorando comentários e linhas vazias.
ler_lista() {
  local arquivo="$1"
  [[ -f "$arquivo" ]] || return 0
  sed -e 's/#.*//' -e 's/[[:space:]]*$//' "$arquivo" | awk 'NF'
}

# Instala com pacman só o que existe nos repositórios e ainda não está instalado.
pacman_instalar() {
  local faltando=() indisponiveis=() p
  for p in "$@"; do
    pacman -Qq "$p" >/dev/null 2>&1 && continue
    if pacman -Si "$p" >/dev/null 2>&1 || pacman -Sg "$p" >/dev/null 2>&1; then
      faltando+=("$p")
    else
      indisponiveis+=("$p")
    fi
  done
  if ((${#indisponiveis[@]})); then
    aviso "Fora dos repositórios (pulados): ${indisponiveis[*]}"
  fi
  if ((${#faltando[@]})); then
    rodar sudo pacman -S --needed --noconfirm "${faltando[@]}"
  else
    ok "Nada novo para instalar com pacman."
  fi
}

# Instala pacotes do AUR com paru ou yay, se houver.
aur_instalar() {
  local ajudante=""
  if tem paru; then ajudante="paru"; elif tem yay; then ajudante="yay"; fi
  if [[ -z "$ajudante" ]]; then
    aviso "Sem paru/yay: pulei os pacotes do AUR (${*})."
    return 0
  fi
  local faltando=() p
  for p in "$@"; do
    pacman -Qq "$p" >/dev/null 2>&1 || faltando+=("$p")
  done
  if ((${#faltando[@]})); then
    rodar "$ajudante" -S --needed --noconfirm "${faltando[@]}"
  fi
}

# kwriteconfig6 com fallback para kwriteconfig5.
kconf() {
  if tem kwriteconfig6; then rodar kwriteconfig6 "$@"
  elif tem kwriteconfig5; then rodar kwriteconfig5 "$@"
  else aviso "kwriteconfig não encontrado; ajuste ignorado: $*"
  fi
}

copiar() {
  local origem="$1" destino="$2"
  rodar mkdir -p "$(dirname "$destino")"
  rodar cp -f "$origem" "$destino"
}

# Pergunta sim/não. Com --sim, responde sim sozinho; sem terminal, responde não.
confirmar() {
  local pergunta="$1" resposta
  if [[ "${LUMEN_SIM_TUDO:-0}" == "1" ]]; then
    info "$pergunta  (sim, por --sim)"
    return 0
  fi
  if [[ ! -t 0 ]]; then
    aviso "$pergunta  (sem terminal: respondido não)"
    return 1
  fi
  read -r -p "$(printf '\033[1;38;5;105m?\033[0m %s [s/N] ' "$pergunta")" resposta
  [[ "$resposta" =~ ^[sSyY]$ ]]
}
