#!/usr/bin/env bash
# Instalador do Lúmen OS (roda como root, chamado pela interface na sessão ao vivo).
# Recebe a configuração em JSON pela entrada padrão:
#   {"disco","nome","usuario","senha","maquina","fuso","teclado"}
# Escreve "PROGRESSO <0-100> <texto>" para a interface acompanhar.
set -euo pipefail

ALVO=/mnt/lumen
SFS=/run/archiso/bootmnt/arch/x86_64/airootfs.sfs
KERNEL=/run/archiso/bootmnt/arch/boot/x86_64/vmlinuz-linux

progresso() { echo "PROGRESSO $1 $2"; }
falhar() {
  echo "ERRO: $*"
  exit 1
}
desmontar() { umount -R "$ALVO" 2>/dev/null || true; }
trap 'echo "ERRO: a instalação parou (linha $LINENO)."; desmontar' ERR

[[ $EUID -eq 0 ]] || falhar "o instalador precisa rodar como administrador."
CFG="$(cat)"
ler() { python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get(sys.argv[2], ""))' "$CFG" "$1"; }

DISCO="$(ler disco)"
NOME="$(ler nome)"
USUARIO="$(ler usuario)"
SENHA="$(ler senha)"
MAQUINA="$(ler maquina)"
FUSO="$(ler fuso)"
TECLADO="$(ler teclado)"

# Conferências antes de apagar qualquer coisa
[[ -b "$DISCO" ]] || falhar "o disco $DISCO não existe."
[[ "$(lsblk -dno TYPE "$DISCO")" == "disk" ]] || falhar "$DISCO não é um disco inteiro."
[[ "$USUARIO" =~ ^[a-z_][a-z0-9_-]{0,31}$ && "$USUARIO" != "root" && "$USUARIO" != "lumen" ]] || falhar "nome de usuário inválido."
[[ "$MAQUINA" =~ ^[a-zA-Z0-9][a-zA-Z0-9-]{0,62}$ ]] || falhar "nome do computador inválido."
[[ ${#SENHA} -ge 4 ]] || falhar "a senha precisa de pelo menos 4 caracteres."
[[ -f "/usr/share/zoneinfo/$FUSO" ]] || FUSO="America/Sao_Paulo"
case "$TECLADO" in br | us | us-intl | pt | es | gb) ;; *) TECLADO=br ;; esac
[[ -f "$SFS" ]] || falhar "não achei o sistema da ISO ($SFS). Inicie pelo menu 'Lumen OS' da ISO."
[[ -f "$KERNEL" ]] || falhar "não achei o kernel da ISO ($KERNEL)."
grep -q "^$DISCO" <(findmnt -rno SOURCE /run/archiso/bootmnt 2>/dev/null || true) && falhar "esse é o disco da própria ISO."

if [[ -d /sys/firmware/efi ]]; then UEFI=1; else UEFI=0; fi
parte() { if [[ "$DISCO" =~ [0-9]$ ]]; then echo "${DISCO}p$1"; else echo "${DISCO}$1"; fi; }

echo "Instalando em $DISCO (modo $([[ $UEFI == 1 ]] && echo UEFI || echo BIOS))."

progresso 3 "Preparando o disco"
desmontar
for p in $(lsblk -lnpo NAME "$DISCO" | tail -n +2); do umount "$p" 2>/dev/null || true; swapoff "$p" 2>/dev/null || true; done
wipefs -af "$DISCO"
sgdisk --zap-all "$DISCO"
sgdisk -n1:0:+1M -t1:ef02 -c1:BIOS \
       -n2:0:+512M -t2:ef00 -c2:EFI \
       -n3:0:0 -t3:8304 -c3:Lumen "$DISCO"
partprobe "$DISCO" 2>/dev/null || partx -u "$DISCO" || true
udevadm settle
sleep 1
EFI="$(parte 2)"
RAIZ="$(parte 3)"

progresso 8 "Formatando"
mkfs.fat -F 32 -n EFI "$EFI"
mkfs.ext4 -F -q -L Lumen "$RAIZ"
mkdir -p "$ALVO"
mount "$RAIZ" "$ALVO"
mkdir -p "$ALVO/boot/efi"
mount "$EFI" "$ALVO/boot/efi"

progresso 12 "Copiando o sistema"
if unsquashfs -help 2>&1 | grep -q -- "-percentage"; then
  ultimo=-1
  unsquashfs -f -d "$ALVO" -percentage "$SFS" | while read -r pct; do
    if [[ "$pct" =~ ^[0-9]+$ && "$pct" != "$ultimo" ]]; then
      ultimo="$pct"
      progresso $((12 + pct * 58 / 100)) "Copiando o sistema ($pct%)"
    fi
  done
else
  unsquashfs -f -d "$ALVO" -no-progress "$SFS"
fi

progresso 71 "Copiando o kernel"
cp "$KERNEL" "$ALVO/boot/vmlinuz-linux"
genfstab -U "$ALVO" >"$ALVO/etc/fstab"

progresso 75 "Configurando sua conta e o sistema"
arch-chroot "$ALVO" /bin/bash -s -- "$USUARIO" "$NOME" "$MAQUINA" "$FUSO" "$TECLADO" <<'CHROOT'
set -euo pipefail
USUARIO="$1"; NOME="$2"; MAQUINA="$3"; FUSO="$4"; TECLADO="$5"

# Tira o que só existe na ISO
rm -f /etc/sudoers.d/10-lumen-live \
      /etc/systemd/system/lumen-live-setup.service \
      /etc/systemd/system/multi-user.target.wants/lumen-live-setup.service \
      /usr/local/bin/lumen-live-setup \
      /etc/mkinitcpio.conf.d/archiso.conf \
      /etc/systemd/system/pacman-init.service \
      /etc/systemd/system/etc-pacman.d-gnupg.mount \
      /etc/systemd/system/choose-mirror.service \
      /etc/systemd/system/livecd-*.service \
      /etc/ssh/sshd_config.d/10-archiso.conf \
      /etc/systemd/logind.conf.d/do-not-suspend.conf \
      /etc/systemd/journald.conf.d/volatile-storage.conf \
      /root/.automated_script.sh /root/.zlogin /etc/motd
rm -rf /etc/systemd/system/systemd-networkd-wait-online.service.d
find /etc/systemd/system -xtype l -delete 2>/dev/null || true

# Initramfs normal (a ISO usa um preset próprio)
cat >/etc/mkinitcpio.d/linux.preset <<'PRESET'
ALL_kver="/boot/vmlinuz-linux"
PRESETS=('default' 'fallback')
default_image="/boot/initramfs-linux.img"
fallback_image="/boot/initramfs-linux-fallback.img"
fallback_options="-S autodetect"
PRESET

# Região, idioma e teclado
ln -sf "/usr/share/zoneinfo/$FUSO" /etc/localtime
hwclock --systohc 2>/dev/null || true
echo "LANG=pt_BR.UTF-8" >/etc/locale.conf
case "$TECLADO" in
  br) MAPA=br-abnt2 ;; us) MAPA=us ;; us-intl) MAPA=us-acentos ;; pt) MAPA=pt-latin1 ;; es) MAPA=es ;; gb) MAPA=uk ;; *) MAPA=br-abnt2 ;;
esac
echo "KEYMAP=$MAPA" >/etc/vconsole.conf
mkdir -p /etc/lumen
echo "$TECLADO" >/etc/lumen/teclado

# Nome do computador
echo "$MAQUINA" >/etc/hostname
cat >/etc/hosts <<HOSTS
127.0.0.1   localhost
::1         localhost
127.0.1.1   $MAQUINA.localdomain $MAQUINA
HOSTS

# Conta do usuário (entra direto na sessão; a tela de bloqueio pede a senha)
useradd -m -G wheel,audio,video,input -s /bin/bash -c "$NOME" "$USUARIO"
echo "%wheel ALL=(ALL:ALL) ALL" >/etc/sudoers.d/10-wheel
chmod 440 /etc/sudoers.d/10-wheel
passwd -l root >/dev/null
mkdir -p /etc/systemd/system/getty@tty1.service.d
cat >/etc/systemd/system/getty@tty1.service.d/autologin.conf <<GETTY
[Service]
ExecStart=
ExecStart=-/sbin/agetty -o '-p -f -- \\\\u' --noclear --autologin $USUARIO %I \$TERM
GETTY
install -d -o "$USUARIO" -g "$USUARIO" "/home/$USUARIO/.config/lumen"
echo "$TECLADO" >"/home/$USUARIO/.config/lumen/teclado"
printf '{"tema": "claro", "destaque": "#2f8c80", "papel": "aurora", "teclado": "%s", "relogio24h": true}\n' "$TECLADO" \
  >"/home/$USUARIO/.config/lumen/config.json"
chown -R "$USUARIO:$USUARIO" "/home/$USUARIO/.config"

# Serviços
systemctl enable NetworkManager.service systemd-timesyncd.service >/dev/null 2>&1 || true
systemctl disable systemd-networkd.service iwd.service >/dev/null 2>&1 || true
systemctl set-default multi-user.target >/dev/null

# Chaves do pacman para atualizações
rm -rf /etc/pacman.d/gnupg
pacman-key --init >/dev/null 2>&1
pacman-key --populate archlinux >/dev/null 2>&1
CHROOT

echo "$USUARIO:$SENHA" | arch-chroot "$ALVO" chpasswd

progresso 85 "Gerando a inicialização do sistema"
arch-chroot "$ALVO" mkinitcpio -P

progresso 93 "Instalando o carregador de boot"
sed -i -e 's/^GRUB_DISTRIBUTOR=.*/GRUB_DISTRIBUTOR="Lumen OS"/' \
       -e 's/^GRUB_TIMEOUT=.*/GRUB_TIMEOUT=2/' \
       -e 's/^GRUB_CMDLINE_LINUX_DEFAULT=.*/GRUB_CMDLINE_LINUX_DEFAULT="loglevel=3 quiet"/' \
       "$ALVO/etc/default/grub"
if [[ $UEFI == 1 ]]; then
  arch-chroot "$ALVO" grub-install --target=x86_64-efi --efi-directory=/boot/efi --bootloader-id=lumen --removable
  arch-chroot "$ALVO" grub-install --target=x86_64-efi --efi-directory=/boot/efi --bootloader-id=lumen 2>/dev/null || true
else
  arch-chroot "$ALVO" grub-install --target=i386-pc "$DISCO"
fi
arch-chroot "$ALVO" grub-mkconfig -o /boot/grub/grub.cfg

progresso 98 "Finalizando"
sync
desmontar
progresso 100 "Pronto"
echo "Lúmen OS instalado em $DISCO."
