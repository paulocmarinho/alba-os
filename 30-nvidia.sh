#!/usr/bin/env bash
# Verifica o driver NVIDIA. Não troca driver sem perguntar.

modulo_nvidia() {
  etapa "Placa de vídeo"
  if ! lspci 2>/dev/null | grep -Ei 'vga|3d' | grep -qi nvidia; then
    info "Nenhuma placa NVIDIA detectada; nada a fazer."
    return 0
  fi

  if tem nvidia-smi && nvidia-smi >/dev/null 2>&1; then
    local versao
    versao="$(nvidia-smi --query-gpu=name,driver_version --format=csv,noheader 2>/dev/null | head -n1)"
    ok "Driver NVIDIA funcionando: ${versao:-ok}"
    pacman_instalar lib32-nvidia-utils nvidia-settings
  else
    aviso "Placa NVIDIA encontrada, mas o driver proprietário não está ativo."
    if tem chwd; then
      if confirmar "Instalar o driver NVIDIA recomendado pelo CachyOS (chwd -a)?"; then
        rodar sudo chwd -a
        aviso "Reinicie o computador ao final da instalação."
      fi
    else
      if confirmar "Instalar nvidia-open-dkms, nvidia-utils e lib32-nvidia-utils?"; then
        pacman_instalar nvidia-open-dkms nvidia-utils lib32-nvidia-utils
        aviso "Reinicie o computador ao final da instalação."
      fi
    fi
  fi
}
