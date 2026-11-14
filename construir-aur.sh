#!/usr/bin/env bash
# Compila os pacotes do AUR que a ISO precisa (o instalador Calamares e o ckbcomp)
# e monta um repositório local para o archiso usar.
# Roda como root num Arch Linux / contêiner archlinux. O GitHub Actions já chama este script.
#
# Uso: sudo ./iso/construir-aur.sh [pasta_do_repositorio]

set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="${1:-$RAIZ/repo-local}"
PACOTES=(ckbcomp calamares)

[[ $EUID -eq 0 ]] || { echo "Rode como root."; exit 1; }

echo "==> Ferramentas de compilação"
pacman -Syu --noconfirm --needed base-devel git sudo

id construtor >/dev/null 2>&1 || useradd -m construtor
echo "construtor ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/construtor
chmod 440 /etc/sudoers.d/construtor

mkdir -p "$REPO"
chown construtor: "$REPO"

for pacote in "${PACOTES[@]}"; do
  echo "==> Compilando $pacote (AUR)"
  sudo -u construtor bash -c "
    set -euo pipefail
    cd ~
    rm -rf '$pacote'
    git clone --depth 1 'https://aur.archlinux.org/$pacote.git'
    cd '$pacote'
    makepkg -s --noconfirm --needed
    cp ./*.pkg.tar.zst '$REPO'/
  "
done

echo "==> Repositório local"
rm -f "$REPO"/*-debug-*.pkg.tar.zst
repo-add "$REPO/lumen.db.tar.gz" "$REPO"/*.pkg.tar.zst
ls -lh "$REPO"
