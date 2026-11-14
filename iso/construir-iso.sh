#!/usr/bin/env bash
# Monta a ISO ao vivo do Lumen OS a partir do perfil "releng" do archiso.
# Precisa rodar como root num Arch Linux (ou num contêiner archlinux) com o pacote archiso.
# O GitHub Actions do projeto já faz isso sozinho: veja .github/workflows/construir-iso.yml.
#
# Uso: sudo ./iso/construir-iso.sh [pasta_de_saida]

set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SAIDA="${1:-$RAIZ/saida}"
TRABALHO="${LUMEN_TRABALHO:-/tmp/lumen-iso}"
PERFIL="$TRABALHO/perfil"
VERSAO="$(grep -oE 'LUMEN_VERSAO="[^"]+"' "$RAIZ/lib/common.sh" | cut -d'"' -f2)"

echo "==> Lumen OS $VERSAO: montando a ISO"
[[ $EUID -eq 0 ]] || { echo "Rode como root."; exit 1; }
[[ -d /usr/share/archiso/configs/releng ]] || { echo "Instale o pacote archiso."; exit 1; }

rm -rf "$TRABALHO"
mkdir -p "$TRABALHO" "$SAIDA"
cp -r /usr/share/archiso/configs/releng "$PERFIL"

echo "==> Pacotes"
sed -e 's/#.*//' -e 's/[[:space:]]*$//' "$RAIZ/iso/pacotes.txt" | awk 'NF' >> "$PERFIL/packages.x86_64"
sort -u -o "$PERFIL/packages.x86_64" "$PERFIL/packages.x86_64"
# cloud-init não serve para a sessão ao vivo e atrasa o boot no Hyper-V.
sed -i '/^cloud-init$/d' "$PERFIL/packages.x86_64"
# Steam e as bibliotecas de 32 bits vêm do repositório multilib.
sed -i '/^#\[multilib\]/{s/^#//;n;s/^#//}' "$PERFIL/pacman.conf"
# Repositório local com o instalador (Calamares) e o ckbcomp, montado por construir-aur.sh.
REPO_LOCAL="${LUMEN_REPO:-$RAIZ/repo-local}"
if [[ -f "$REPO_LOCAL/lumen.db.tar.gz" ]]; then
  printf '\n[lumen]\nSigLevel = Optional TrustAll\nServer = file://%s\n' "$(cd "$REPO_LOCAL" && pwd)" >> "$PERFIL/pacman.conf"
else
  echo "Repositório local não encontrado em $REPO_LOCAL. Rode antes: sudo ./iso/construir-aur.sh"
  exit 1
fi

echo "==> Identidade da ISO"
sed -i -E \
  -e 's/^iso_name=.*/iso_name="lumen-os"/' \
  -e "s/^iso_label=.*/iso_label=\"LUMEN_${VERSAO//./}\"/" \
  -e 's/^iso_publisher=.*/iso_publisher="Lumen OS"/' \
  -e 's/^iso_application=.*/iso_application="Lumen OS"/' \
  -e "s/^iso_version=.*/iso_version=\"$VERSAO\"/" \
  "$PERFIL/profiledef.sh"
sed -i 's/^file_permissions=(/file_permissions=(\n  ["\/usr\/local\/bin\/lumen-live-setup"]="0:0:755"\n  ["\/usr\/local\/bin\/lumen-primeiro-login"]="0:0:755"\n  ["\/etc\/sudoers.d\/10-lumen-live"]="0:0:440"\n  ["\/usr\/share\/lumen\/install.sh"]="0:0:755"\n  ["\/usr\/share\/lumen\/restaurar.sh"]="0:0:755"\n  ["\/usr\/local\/bin\/lumen-marca"]="0:0:755"\n  ["\/usr\/local\/bin\/lumen-instalar"]="0:0:755"\n  ["\/usr\/share\/lumen\/sistema\/limpeza-alvo.sh"]="0:0:755"\n  ["\/usr\/share\/lumen\/sistema\/lumen-marca"]="0:0:755"/' "$PERFIL/profiledef.sh"

echo "==> Menu de boot (nome e parâmetros de boot)"
for pasta in efiboot syslinux grub; do
  [[ -d "$PERFIL/$pasta" ]] || continue
  find "$PERFIL/$pasta" -type f \( -name '*.conf' -o -name '*.cfg' \) -print0 | while IFS= read -r -d '' arq; do
    sed -i -E \
      -e 's/Arch Linux install medium/Lumen OS (ao vivo e instalador)/g' \
      -e 's/Arch Linux/Lumen OS/g' \
      -e '/^[[:space:]]*(options|APPEND|linux) .*archisobasedir/ s/$/ cow_spacesize=4G copytoram=n/' \
      "$arq"
  done
done

echo "==> Arquivos do sistema ao vivo"
cp -a "$RAIZ/iso/airootfs/." "$PERFIL/airootfs/"
mkdir -p "$PERFIL/airootfs/usr/share/lumen"
cp -a "$RAIZ/install.sh" "$RAIZ/restaurar.sh" "$RAIZ/README.md" "$RAIZ/lib" "$RAIZ/modules" \
      "$RAIZ/packages" "$RAIZ/plasma" "$RAIZ/theme" "$RAIZ/sistema" "$RAIZ/instalador" \
      "$PERFIL/airootfs/usr/share/lumen/"
# Identidade e relógio da tela de bloqueio: o gancho roda já na montagem da ISO e depois a cada atualização.
install -Dm755 "$RAIZ/sistema/lumen-marca" "$PERFIL/airootfs/usr/local/bin/lumen-marca"
install -Dm644 "$RAIZ/sistema/lumen-marca.hook" "$PERFIL/airootfs/etc/pacman.d/hooks/lumen-marca.hook"
chmod 755 "$PERFIL/airootfs/usr/share/lumen/sistema/"*.sh "$PERFIL/airootfs/usr/share/lumen/sistema/lumen-marca"
# Instalador gráfico (Calamares) com a configuração e a identidade do Lúmen.
# Vai para /etc/calamares; se o pacote do Calamares já usar essa pasta, fica só em
# /usr/share/lumen/instalador e o atalho "Instalar o Lúmen OS" aponta para lá.
pacote_calamares="$(ls "$REPO_LOCAL"/calamares-[0-9]*.pkg.tar.zst 2>/dev/null | head -n1 || true)"
if [[ -n "$pacote_calamares" ]] && bsdtar -tf "$pacote_calamares" | grep -q '^etc/calamares/.'; then
  echo "    O pacote do Calamares já usa /etc/calamares; usando /usr/share/lumen/instalador."
else
  mkdir -p "$PERFIL/airootfs/etc/calamares"
  cp -a "$RAIZ/instalador/." "$PERFIL/airootfs/etc/calamares/"
fi
chmod 755 "$PERFIL/airootfs/usr/local/bin/"lumen-*

# Papel de parede padrão do Plasma e da tela de login.
mkdir -p "$PERFIL/airootfs/usr/share/wallpapers/Lumen/contents/images"
cp "$RAIZ/theme/wallpapers/lumen-aurora-3840x2160.png" \
   "$PERFIL/airootfs/usr/share/wallpapers/Lumen/contents/images/3840x2160.png"
cat > "$PERFIL/airootfs/usr/share/wallpapers/Lumen/metadata.json" <<'EOF'
{ "KPlugin": { "Id": "Lumen", "Name": "Lúmen: Aurora", "Authors": [ { "Name": "Lúmen OS" } ], "License": "CC-BY-SA-4.0" } }
EOF
mkdir -p "$PERFIL/airootfs/usr/share/sddm/themes/breeze"
printf '[General]\nbackground=/usr/share/wallpapers/Lumen/contents/images/3840x2160.png\n' \
  > "$PERFIL/airootfs/usr/share/sddm/themes/breeze/theme.conf.user"

echo "==> Fonte DM Sans"
mkdir -p "$PERFIL/airootfs/usr/share/fonts/TTF"
for estilo in "DMSans%5Bopsz%2Cwght%5D.ttf:DMSans.ttf" "DMSans-Italic%5Bopsz%2Cwght%5D.ttf:DMSans-Italic.ttf"; do
  origem="${estilo%%:*}"; destino="${estilo##*:}"
  if ! curl -fsSL --retry 3 -o "$PERFIL/airootfs/usr/share/fonts/TTF/$destino" \
       "https://github.com/google/fonts/raw/main/ofl/dmsans/$origem"; then
    echo "    Não consegui baixar $destino; a ISO usa a Inter no lugar."
    rm -f "$PERFIL/airootfs/usr/share/fonts/TTF/$destino"
  fi
done

echo "==> Serviços"
WANTS="$PERFIL/airootfs/etc/systemd/system"
mkdir -p "$WANTS/multi-user.target.wants" "$WANTS/network-online.target.wants"
# Troca a rede do releng (systemd-networkd + iwd) pelo NetworkManager, que o Plasma usa.
rm -f "$WANTS/multi-user.target.wants/systemd-networkd.service" \
      "$WANTS/multi-user.target.wants/iwd.service" \
      "$WANTS/network-online.target.wants/systemd-networkd-wait-online.service" \
      "$WANTS/sockets.target.wants/systemd-networkd.socket" \
      "$WANTS/systemd-networkd-wait-online.service.d" 2>/dev/null || true
find "$WANTS" -name 'cloud-*' -exec rm -rf {} + 2>/dev/null || true
ln -sf /usr/lib/systemd/system/NetworkManager.service "$WANTS/multi-user.target.wants/NetworkManager.service"
ln -sf /usr/lib/systemd/system/NetworkManager-dispatcher.service "$WANTS/dbus-org.freedesktop.nm-dispatcher.service"
ln -sf /usr/lib/systemd/system/NetworkManager-wait-online.service "$WANTS/network-online.target.wants/NetworkManager-wait-online.service"
ln -sf /usr/lib/systemd/system/sddm.service "$WANTS/display-manager.service"
ln -sf /etc/systemd/system/lumen-live-setup.service "$WANTS/multi-user.target.wants/lumen-live-setup.service"
# Inicia em modo gráfico.
ln -sf /usr/lib/systemd/system/graphical.target "$WANTS/default.target"

echo "==> Construindo (isso demora)"
mkarchiso -v -w "$TRABALHO/build" -o "$SAIDA" "$PERFIL"

echo "==> Pronto:"
ls -lh "$SAIDA"/*.iso
