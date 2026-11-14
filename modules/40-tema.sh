#!/usr/bin/env bash
# Visual do Lumen: cores, papel de parede, Kvantum (vidro), ícones, fontes e janelas.

LUMEN_DADOS="$HOME/.local/share/lumen"
LUMEN_WALLPAPER="$LUMEN_DADOS/wallpapers/lumen-aurora-3840x2160.png"
LUMEN_LOGO="$LUMEN_DADOS/icons/lumen-logo.svg"

modulo_tema() {
  etapa "Arquivos do tema"
  copiar "$LUMEN_DIR/theme/wallpapers/lumen-aurora-3840x2160.png" "$LUMEN_WALLPAPER"
  copiar "$LUMEN_DIR/theme/icons/lumen-logo.svg" "$LUMEN_LOGO"
  copiar "$LUMEN_DIR/theme/icons/lumen-prisma.svg" "$HOME/.local/share/icons/hicolor/scalable/apps/lumen-prisma.svg"
  copiar "$LUMEN_DIR/theme/icons/lumen-marca.svg" "$HOME/.local/share/icons/hicolor/scalable/apps/lumen.svg"
  copiar "$LUMEN_DIR/theme/colors/Lumen.colors" "$HOME/.local/share/color-schemes/Lumen.colors"
  ok "Papel de parede, ícones e esquema de cores copiados."

  etapa "Cores e estilo do Plasma"
  tem plasma-apply-colorscheme && rodar plasma-apply-colorscheme Lumen
  tem plasma-apply-desktoptheme && rodar plasma-apply-desktoptheme default
  kconf --file kdeglobals --group General --key AccentColor "47,140,128"
  kconf --file kdeglobals --group KDE --key LookAndFeelPackage "org.kde.breeze.desktop"

  etapa "Vidro (Kvantum)"
  if rodar python3 "$LUMEN_DIR/theme/kvantum/criar-lumen-kvantum.py"; then
    kconf --file kdeglobals --group KDE --key widgetStyle kvantum
    ok "Estilo de janelas: LumenGlass (Kvantum)."
  else
    aviso "Kvantum não configurado; mantendo o estilo Breeze."
  fi

  etapa "Ícones"
  if [[ -d /usr/share/icons/Papirus ]]; then
    if [[ -x /usr/lib/plasma-changeicons ]]; then
      rodar /usr/lib/plasma-changeicons Papirus
    else
      kconf --file kdeglobals --group Icons --key Theme Papirus
    fi
    if tem papirus-folders; then
      rodar papirus-folders -C teal --theme Papirus || aviso "Não consegui mudar a cor das pastas."
    fi
    ok "Ícones Papirus com pastas verde-azuladas."
  else
    aviso "Papirus não encontrado; ícones não alterados."
  fi

  etapa "Fontes"
  local fonte="Inter"
  if ! fc-list 2>/dev/null | grep -qi "DM Sans" && tem curl; then
    rodar mkdir -p "$HOME/.local/share/fonts"
    rodar curl -fsSL --retry 2 -o "$HOME/.local/share/fonts/DMSans.ttf" \
      "https://github.com/google/fonts/raw/main/ofl/dmsans/DMSans%5Bopsz%2Cwght%5D.ttf" \
      && rodar fc-cache -f "$HOME/.local/share/fonts" >/dev/null 2>&1
  fi
  if fc-list 2>/dev/null | grep -qi "DM Sans"; then fonte="DM Sans"; fi
  kconf --file kdeglobals --group General --key font "$fonte,10,-1,5,500,0,0,0,0,0,0,0,0,0,0,1"
  kconf --file kdeglobals --group General --key menuFont "$fonte,10,-1,5,500,0,0,0,0,0,0,0,0,0,0,1"
  kconf --file kdeglobals --group General --key toolBarFont "$fonte,9,-1,5,500,0,0,0,0,0,0,0,0,0,0,1"
  kconf --file kdeglobals --group General --key smallestReadableFont "$fonte,8,-1,5,500,0,0,0,0,0,0,0,0,0,0,1"
  kconf --file kdeglobals --group WM --key activeFont "$fonte,10,-1,5,700,0,0,0,0,0,0,0,0,0,0,1"
  kconf --file kdeglobals --group General --key fixed "JetBrains Mono,10,-1,5,400,0,0,0,0,0,0,0,0,0,0,1"
  ok "Fonte da interface: $fonte."

  etapa "Janelas e efeitos (KWin)"
  kconf --file kwinrc --group Plugins --key blurEnabled true
  kconf --file kwinrc --group Plugins --key contrastEnabled true
  kconf --file kwinrc --group Effect-blur --key BlurStrength 10
  kconf --file kwinrc --group Effect-blur --key NoiseStrength 2
  kconf --file kwinrc --group Plugins --key kwin4_effect_shapecornersEnabled true
  kconf --file kwinrc --group org.kde.kdecoration2 --key ButtonsOnLeft ""
  kconf --file kwinrc --group org.kde.kdecoration2 --key ButtonsOnRight "IAX"
  kconf --file kwinrc --group org.kde.kdecoration2 --key BorderSize "None"
  kconf --file kwinrc --group org.kde.kdecoration2 --key BorderSizeAuto false
  kconf --file breezerc --group Common --key OutlineCloseButton true
  if tem qdbus6; then
    rodar qdbus6 org.kde.KWin /KWin reconfigure >/dev/null 2>&1 || true
  fi
  ok "Desfoque, cantos arredondados e botões de janela à direita."

  etapa "Tela de bloqueio"
  kconf --file kscreenlockerrc --group Greeter --key WallpaperPlugin org.kde.image
  kconf --file kscreenlockerrc --group Greeter --group Wallpaper --group org.kde.image --group General --key Image "file://$LUMEN_WALLPAPER"
  kconf --file kscreenlockerrc --group Greeter --group LnF --group General --key showMediaControls true
  if [[ -x /usr/local/bin/lumen-marca ]]; then
    ok "Relógio do Lúmen já aplicado na tela de bloqueio."
  elif [[ -f "$LUMEN_DIR/sistema/lumen-marca" ]]; then
    # Instala os arquivos do Lúmen no sistema e um gancho que reaplica o relógio após atualizações do Plasma.
    rodar sudo mkdir -p /usr/share/lumen
    rodar sudo cp -r "$LUMEN_DIR/sistema" "$LUMEN_DIR/theme" /usr/share/lumen/
    rodar sudo install -Dm755 "$LUMEN_DIR/sistema/lumen-marca" /usr/local/bin/lumen-marca
    rodar sudo install -Dm644 "$LUMEN_DIR/sistema/lumen-marca.hook" /etc/pacman.d/hooks/lumen-marca.hook
    if rodar sudo /usr/local/bin/lumen-marca; then
      ok "Relógio grande na tela de bloqueio e na tela de login."
    else
      aviso "Não consegui aplicar o relógio na tela de bloqueio."
    fi
  fi

  etapa "Prisma e navegador padrão"
  # O Prisma, por enquanto, é o Dolphin com nome, ícone e ajustes do Lumen.
  local origem=/usr/share/applications/org.kde.dolphin.desktop
  local destino="$HOME/.local/share/applications/org.kde.dolphin.desktop"
  if [[ -f "$origem" ]]; then
    if [[ "$LUMEN_SIMULAR" == "1" ]]; then
      printf '  [simulação] awk -f prisma-desktop.awk %s > %s\n' "$origem" "$destino"
    else
      mkdir -p "$(dirname "$destino")"
      awk -f "$LUMEN_DIR/theme/prisma-desktop.awk" "$origem" > "$destino"
    fi
  else
    aviso "Dolphin não encontrado; o Prisma não foi criado."
  fi
  tem xdg-mime && rodar xdg-mime default org.kde.dolphin.desktop inode/directory
  kconf --file dolphinrc --group General --key ShowFullPathInTitlebar false
  kconf --file dolphinrc --group General --key OpenNewTabAfterLastTab true
  kconf --file dolphinrc --group General --key RememberOpenedTabs false
  kconf --file dolphinrc --group PreviewSettings --key Plugins "imagethumbnail,ffmpegthumbs,svgthumbnail,directorythumbnail"

  if tem xdg-settings && [[ -f /usr/share/applications/firefox.desktop ]]; then
    rodar xdg-settings set default-web-browser firefox.desktop || true
    kconf --file kdeglobals --group General --key BrowserApplication firefox.desktop
    ok "Firefox definido como navegador padrão."
  fi
  tem kbuildsycoca6 && rodar kbuildsycoca6 >/dev/null 2>&1
  ok "Prisma registrado como gerenciador de arquivos."
}
