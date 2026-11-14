#!/usr/bin/env bash
# Roda dentro do sistema recém-instalado (chamado pelo instalador).
# Remove o que só existe na sessão ao vivo e deixa o sistema pronto para o primeiro boot.
set -u

echo "Lúmen: preparando o sistema instalado"

# Sessão ao vivo
rm -f /etc/sddm.conf.d/10-lumen.conf \
      /etc/sudoers.d/10-lumen-live \
      /etc/skel/.config/kxkbrc \
      /etc/skel/.config/kscreenlockerrc \
      /etc/xdg/autostart/lumen-instalador.desktop \
      /usr/share/applications/lumen-instalar.desktop \
      /usr/local/bin/lumen-instalar \
      /usr/local/bin/lumen-live-setup \
      /etc/systemd/system/lumen-live-setup.service \
      /etc/systemd/system/multi-user.target.wants/lumen-live-setup.service

# Sobras do archiso (perfil releng)
rm -rf /etc/systemd/system/getty@tty1.service.d \
       /etc/systemd/system/systemd-networkd-wait-online.service.d
rm -f /etc/mkinitcpio.conf.d/archiso.conf \
      /etc/systemd/system/pacman-init.service \
      /etc/systemd/system/etc-pacman.d-gnupg.mount \
      /etc/systemd/system/choose-mirror.service \
      /etc/systemd/system/livecd-*.service \
      /etc/ssh/sshd_config.d/10-archiso.conf \
      /etc/systemd/logind.conf.d/do-not-suspend.conf \
      /etc/systemd/journald.conf.d/volatile-storage.conf \
      /root/.automated_script.sh \
      /root/.zlogin \
      /etc/motd
find /etc/systemd/system -xtype l -delete 2>/dev/null || true

# Kernel e initramfs normais (o perfil do archiso usa um preset próprio)
cat > /etc/mkinitcpio.d/linux.preset <<'PRESET'
# Gerado pelo instalador do Lúmen
ALL_kver="/boot/vmlinuz-linux"
PRESETS=('default' 'fallback')
default_image="/boot/initramfs-linux.img"
fallback_image="/boot/initramfs-linux-fallback.img"
fallback_options="-S autodetect"
PRESET

# Repositório multilib (Steam e bibliotecas de 32 bits)
if grep -q '^#\[multilib\]' /etc/pacman.conf; then
  sed -i '/^#\[multilib\]/{s/^#//;n;s/^#//}' /etc/pacman.conf
fi

# Chaves do pacman (na ISO elas ficam num diretório temporário)
rm -rf /etc/pacman.d/gnupg
pacman-key --init >/dev/null 2>&1
pacman-key --populate archlinux >/dev/null 2>&1

# Serviços do sistema instalado
systemctl enable NetworkManager.service sddm.service fstrim.timer >/dev/null 2>&1 || true
systemctl disable systemd-networkd.service iwd.service >/dev/null 2>&1 || true
systemctl set-default graphical.target >/dev/null 2>&1 || true

# Identidade, relógio da tela de bloqueio e fundo da tela de login
[[ -x /usr/local/bin/lumen-marca ]] && /usr/local/bin/lumen-marca

echo "Lúmen: sistema instalado pronto"
exit 0
