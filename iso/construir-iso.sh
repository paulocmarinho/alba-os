#!/usr/bin/env bash
# Monta a ISO do Lúmen OS (sessão ao vivo + instalador próprio) com o archiso.
# Precisa rodar como root num Arch Linux ou contêiner archlinux, com o pacote archiso,
# e com a interface já montada em web/dist (npm ci && npm run build dentro de web/).
# O GitHub Actions do projeto faz tudo isso sozinho.
#
# Uso: sudo ./iso/construir-iso.sh [pasta_de_saida]
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SAIDA="${1:-$RAIZ/saida}"
TRABALHO="${LUMEN_TRABALHO:-/tmp/lumen-iso}"
PERFIL="$TRABALHO/perfil"
VERSAO="$(cat "$RAIZ/VERSAO")"

echo "==> Lúmen OS $VERSAO"
[[ $EUID -eq 0 ]] || { echo "Rode como root."; exit 1; }
[[ -d /usr/share/archiso/configs/releng ]] || { echo "Instale o pacote archiso."; exit 1; }
[[ -f "$RAIZ/web/dist/index.html" ]] || { echo "Monte a interface antes: cd web && npm ci && npm run build"; exit 1; }

rm -rf "$TRABALHO"
mkdir -p "$TRABALHO" "$SAIDA"
cp -r /usr/share/archiso/configs/releng "$PERFIL"

echo "==> Pacotes"
sed -e 's/#.*//' -e 's/[[:space:]]*$//' "$RAIZ/iso/pacotes.txt" | awk 'NF' >>"$PERFIL/packages.x86_64"
sed -i '/^cloud-init$/d' "$PERFIL/packages.x86_64"
sort -u -o "$PERFIL/packages.x86_64" "$PERFIL/packages.x86_64"
sed -i '/^#\[multilib\]/{s/^#//;n;s/^#//}' "$PERFIL/pacman.conf"

echo "==> Identidade da ISO"
sed -i -E \
  -e 's/^iso_name=.*/iso_name="lumen-os"/' \
  -e "s/^iso_label=.*/iso_label=\"LUMEN_${VERSAO//./}\"/" \
  -e 's/^iso_publisher=.*/iso_publisher="Lumen OS"/' \
  -e 's/^iso_application=.*/iso_application="Lumen OS"/' \
  -e "s/^iso_version=.*/iso_version=\"$VERSAO\"/" \
  "$PERFIL/profiledef.sh"
sed -i 's/^file_permissions=(/file_permissions=(\n  ["\/etc\/sudoers.d\/10-lumen-live"]="0:0:440"\n  ["\/usr\/bin\/lumen-sessao"]="0:0:755"\n  ["\/usr\/local\/bin\/lumen-live-setup"]="0:0:755"\n  ["\/usr\/local\/bin\/lumen-identidade"]="0:0:755"\n  ["\/usr\/share\/lumen\/sistema\/instalar.sh"]="0:0:755"/' "$PERFIL/profiledef.sh"

echo "==> Menu de boot"
for pasta in efiboot syslinux grub; do
  [[ -d "$PERFIL/$pasta" ]] || continue
  find "$PERFIL/$pasta" -type f \( -name '*.conf' -o -name '*.cfg' \) -print0 | while IFS= read -r -d '' arq; do
    sed -i -E \
      -e 's/Arch Linux install medium/Lumen OS/g' \
      -e 's/Arch Linux/Lumen OS/g' \
      -e '/^[[:space:]]*(options|APPEND|linux) .*archisobasedir/ s/$/ cow_spacesize=4G copytoram=n/' \
      "$arq"
  done
done

echo "==> Arquivos do Lúmen"
cp -a "$RAIZ/iso/airootfs/." "$PERFIL/airootfs/"
L="$PERFIL/airootfs/usr/share/lumen"
mkdir -p "$L/web" "$L/servidor" "$L/sistema"
cp -a "$RAIZ/web/dist/." "$L/web/"
cp -a "$RAIZ/servidor/lumen_servidor.py" "$RAIZ/servidor/pam.py" "$L/servidor/"
cp -a "$RAIZ/sistema/instalar.sh" "$L/sistema/"
install -Dm755 "$RAIZ/sistema/lumen-sessao" "$PERFIL/airootfs/usr/bin/lumen-sessao"
install -Dm755 "$RAIZ/sistema/lumen-live-setup" "$PERFIL/airootfs/usr/local/bin/lumen-live-setup"
install -Dm755 "$RAIZ/sistema/lumen-identidade" "$PERFIL/airootfs/usr/local/bin/lumen-identidade"
install -Dm644 "$RAIZ/sistema/lumen-identidade.hook" "$PERFIL/airootfs/etc/pacman.d/hooks/lumen-identidade.hook"
install -Dm644 "$RAIZ/sistema/lumen-perfil.sh" "$PERFIL/airootfs/etc/profile.d/lumen.sh"
chmod 755 "$L/sistema/instalar.sh"

echo "==> Serviços"
W="$PERFIL/airootfs/etc/systemd/system"
mkdir -p "$W/multi-user.target.wants" "$W/network-online.target.wants"
rm -rf "$W/multi-user.target.wants/systemd-networkd.service" \
       "$W/multi-user.target.wants/iwd.service" \
       "$W/network-online.target.wants/systemd-networkd-wait-online.service" \
       "$W/sockets.target.wants/systemd-networkd.socket" \
       "$W/systemd-networkd-wait-online.service.d"
find "$W" -name 'cloud-*' -exec rm -rf {} + 2>/dev/null || true
ln -sf /usr/lib/systemd/system/NetworkManager.service "$W/multi-user.target.wants/NetworkManager.service"
ln -sf /usr/lib/systemd/system/NetworkManager-dispatcher.service "$W/dbus-org.freedesktop.nm-dispatcher.service"
ln -sf /usr/lib/systemd/system/NetworkManager-wait-online.service "$W/network-online.target.wants/NetworkManager-wait-online.service"
ln -sf /etc/systemd/system/lumen-live-setup.service "$W/multi-user.target.wants/lumen-live-setup.service"

echo "==> Construindo (isso demora)"
mkarchiso -v -w "$TRABALHO/build" -o "$SAIDA" "$PERFIL"
ls -lh "$SAIDA"/*.iso
