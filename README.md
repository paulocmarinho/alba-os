# Alba OS

Um sistema operacional com interface própria, feita do zero. Por baixo roda um Linux mínimo (Arch), só como motor. Tudo o que aparece na tela é do Alba: tela de bloqueio, área de trabalho, janelas, dock, central de controle e apps.

> Versão 0.4: compositor de janelas próprio. Programas do Linux (Firefox, que já vem instalado, e outros) abrem em janelas de verdade ao lado dos apps do Alba.

## O que já funciona

| Parte | O que faz |
|---|---|
| Tela de bloqueio | Data em cima, hora grande e senha de verdade (conferida pelo sistema). Bloqueie com **Ctrl+Alt+L** |
| Área de trabalho | Barra superior com data por extenso, dock com os programas abertos, janelas de verdade (mover, redimensionar, encaixar nas bordas, **Alt+Tab**) |
| Barra superior | Clique no som (volume), na data (calendário do mês), na rede ou no ícone de controles (central) |
| **Firefox** | Navegador padrão, já instalado. Links abertos de qualquer lugar do Alba vão para ele |
| Central de controle | Rede, modo escuro, volume, bloquear, reiniciar e desligar |
| **Arquivos** | Navega pelas pastas, cria pastas, renomeia, manda para a lixeira, restaura e esvazia a lixeira |
| **Terminal** | Terminal de verdade (bash), com emulador próprio do Alba |
| **Notas** | Abre, edita e salva arquivos de texto (**Ctrl+S**) |
| **Ajustes** | Tema claro ou escuro, cor de destaque, tamanho da interface (100/125/150%), rede, som, teclado e informações do computador |
| **Sleeve** | Player de música do sistema ([paulocmarinho/sleeve](https://github.com/paulocmarinho/sleeve)): lê `~/Músicas`, toca MP3/FLAC/M4A/OGG/Opus/WAV, abre músicas direto do Arquivos e aparece na central de controle |
| **Atualizações** | Em **Ajustes › Sobre**: baixa só o que mudou (alguns MB) e reinicia a interface, sem reinstalar |
| **Instalador** | Fuso, teclado, disco e conta. Instala o Alba no disco escolhido |

## Testar no Hyper-V

### 1. Gerar a ISO (no GitHub, uns 40 a 60 minutos)
1. Em **Actions › Construir ISO do Alba**, clique em **Run workflow**.
2. Quando terminar, baixe **alba-os-iso** em *Artifacts* e descompacte.

### 2. Criar a máquina (PowerShell como administrador)
Troque o caminho da ISO:
```powershell
$Nome = "AlbaOS"
$Iso  = "C:\caminho\para\alba-os-0.4.0-x86_64.iso"
$Base = "C:\HyperV"

New-VM -Name $Nome -Generation 2 -Path $Base -MemoryStartupBytes 4GB `
  -NewVHDPath "$Base\$Nome\disco.vhdx" -NewVHDSizeBytes 32GB -SwitchName "Default Switch"
Set-VMMemory    -VMName $Nome -DynamicMemoryEnabled $false
Set-VMProcessor -VMName $Nome -Count 4
Set-VM          -Name $Nome -AutomaticCheckpointsEnabled $false
Set-VMFirmware  -VMName $Nome -EnableSecureBoot Off
Add-VMDvdDrive  -VMName $Nome -Path $Iso
Set-VMFirmware  -VMName $Nome -FirstBootDevice (Get-VMDvdDrive -VMName $Nome)
Set-VMVideo     -VMName $Nome -HorizontalResolution 1920 -VerticalResolution 1080 -ResolutionType Single
Start-VM -Name $Nome
vmconnect.exe localhost $Nome
```

### 3. Instalar
1. No menu, escolha **Alba OS**. Passam algumas linhas de texto e a interface do Alba abre com o **instalador**.
2. Siga os passos: região e teclado, disco, sua conta e resumo. Clique em **Instalar agora**.
3. No fim, clique em **Reiniciar agora** e ejete a ISO no Hyper-V (**Mídia › Unidade de DVD › Ejetar**).
4. O Alba liga direto na **tela de bloqueio**. Entre com a senha que você criou.

## Atualizar sem reinstalar
A cada mudança na `main`, o GitHub publica um pacote de atualização em *Releases* (workflow **Publicar atualização do Alba**). No Alba instalado, abra **Ajustes › Sobre › Procurar** e depois **Atualizar agora**: o sistema baixa o pacote, confere a soma SHA-256, troca os arquivos do Alba e reinicia a interface. Ele também avisa sozinho quando há versão nova.

Uma ISO nova só é necessária para mudanças na base (pacotes do Arch, drivers, boot). Para gerar: **Actions › Construir ISO do Alba › Run workflow**.

## Como é feito

```
Linux (Arch, mínimo) ─► login automático no tty1 ─► alba-sessao
                                                      ├─ servidor do sistema (Python, só 127.0.0.1)
                                                      └─ labwc (compositor de janelas, tema "Alba")
                                                           ├─ alba-casca: fundo, barra, dock e painéis (camadas layer-shell, GTK4 + WebKitGTK)
                                                           ├─ alba-app arquivos | terminal | notas | ajustes | musica… (uma janela por app)
                                                           └─ programas do Linux (Firefox, etc.)
```

A interface (React) é a mesma em todas as partes: cada camada e cada app é uma página dela num WebKitGTK sem nada de navegador. A casca acompanha as janelas abertas pelo protocolo *wlr-foreign-toplevel* e as partes conversam entre si pelo servidor (`/ws/eventos`). Se o compositor não abrir três vezes seguidas, a sessão entra no modo de segurança (a interface antiga de tela única).

Atalhos: **Super+L** bloqueia, **Alt+Tab** troca de janela, **Super+←/→** encaixa nas bordas, **Super+↑** maximiza, **Ctrl+Alt+T** abre o Terminal, **Super+E** o Arquivos.

| Pasta | Conteúdo |
|---|---|
| `web/` | Interface do Alba (React + TypeScript). `npm install && npm run build` gera `web/dist` |
| `servidor/` | Servidor do sistema: arquivos, terminal, senha (PAM), som, rede, energia, instalação, atualização e a biblioteca de música do Sleeve (`musica.py`, usa o mutagen) |
| `web/sleeve/` | Ponte do Sleeve para o Alba (substitui o `bridge.js` dele na construção) |
| `sistema/` | Sessão gráfica, casca (`sistema/casca/`), configuração e tema do labwc, instalador em disco, atualizador e identidade do sistema |
| `iso/` | Perfil da ISO (archiso) e script de construção |
| `.github/workflows/` | Construção da ISO, pacote de atualização e teste da sessão gráfica num compositor sem tela (com capturas no ramo `testes-capturas`) |
| `testes/` | Roteiro do teste da sessão gráfica |

### Rodar a interface no seu computador (para desenvolver)
Com Linux ou WSL, Python 3 e Node 22:
```bash
git clone --depth 1 https://github.com/paulocmarinho/sleeve web/sleeve-src   # opcional: o player de música
cd web && npm install && npm run build && cd ..
python3 servidor/alba_servidor.py --porta 7070 --token teste --web web/dist
# abra http://127.0.0.1:7070/?t=teste no navegador
```
Ela usa a sua pasta pessoal de verdade, com cuidado: só altera arquivos dentro dela.

## Limitações da versão 0.4
- Ainda não há loja de aplicativos: por enquanto, programas novos se instalam pelo Terminal (`sudo pacman -S <programa>`). A Loja do Alba (com o Flathub por trás) é o próximo passo.
- As molduras das janelas seguem o tema claro mesmo no modo escuro.
- Wi‑Fi com senha, Bluetooth e brilho de tela ainda não existem.
- O instalador apaga o disco inteiro escolhido. Não há instalação lado a lado com outro sistema.
- No Hyper-V não há aceleração de vídeo, então as animações e o vidro ficam mais lentos.

## Histórico
O sistema se chamava Lúmen OS até a versão 0.1.0. O projeto anterior (KDE Plasma com tema próprio e instalador Calamares) está guardado no ramo `lumen-kde`.
