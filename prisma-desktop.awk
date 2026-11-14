# Transforma o atalho do Dolphin no atalho do Prisma (nome e ícone do Lumen).
# Mexe só na seção [Desktop Entry]; as ações (Nova janela etc.) ficam como estão.
/^\[/ { secao = $0 }
secao == "[Desktop Entry]" && /^Name(\[[^]]*\])?=/ {
  if (!nome) { print "Name=Prisma"; nome = 1 }
  next
}
secao == "[Desktop Entry]" && /^GenericName(\[[^]]*\])?=/ {
  if (!generico) { print "GenericName=Arquivos"; generico = 1 }
  next
}
secao == "[Desktop Entry]" && /^Icon=/ { print "Icon=lumen-prisma"; next }
{ print }
