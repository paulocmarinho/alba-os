# Lúmen OS

Um sistema operacional com interface própria, feita do zero. Por baixo roda um Linux mínimo (Arch), só como motor. Tudo o que aparece na tela é do Lúmen: tela de bloqueio, área de trabalho, janelas, dock, central de controle e apps.

> Versão 0.1: funções básicas. Ainda não roda programas do Linux nem jogos dentro da interface.

## O que já funciona

| Parte | O que faz |
|---|---|
| Tela de bloqueio | Data em cima, hora grande e senha de verdade (conferida pelo sistema). Bloqueie com **Ctrl+Alt+L** |
| Área de trabalho | Barra superior com data por extenso, dock, janelas que se movem, redimensionam, minimizam e maximizam |
| Central de controle | Rede, modo escuro, volume, bloquear, reiniciar e desligar |
| **Arquivos** | Navega pelas pastas, cria pastas, renomeia, manda para a lixeira, restaura e esvazia a lixeira |
| **Terminal** | Terminal de verdade (bash), com emulador próprio do Lúmen |
| **Notas** | Abre, edita e salva arquivos de texto (**Ctrl+S**) |
| **Ajustes** | Tema claro ou escuro, cor de destaque, rede, som, teclado e informações do computador |
| **Instalador** | Fuso, teclado, disco e conta. Instala o Lúmen no disco escolhido |

## Testar no Hyper-V

### 1. Gerar a ISO (no GitHub, uns 40 a 60 minutos)
1. Em **Actions › Construir ISO do Lúmen**, clique em **Run workflow**.
2. Quando terminar, baixe **lumen-os-iso** em *Artifacts* e descompacte.

### 2. Criar a máquina (PowerShell como administrador)
Troque o caminho da ISO:
```powershell
$Nome = "Lumen OS"
$Iso  = "C:\caminho\para\lumen-os-0.1.0-x86_64.iso"
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
1. No menu, escolha **Lumen OS**. Passam algumas linhas de texto e a interface do Lúmen abre com o **instalador**.
2. Siga os passos: região e teclado, disco, sua conta e resumo. Clique em **Instalar agora**.
3. No fim, clique em **Reiniciar agora** e ejete a ISO no Hyper-V (**Mídia › Unidade de DVD › Ejetar**).
4. O Lúmen liga direto na **tela de bloqueio**. Entre com a senha que você criou.

## Como é feito

```
Linux (Arch, mínimo) ─► login automático no tty1 ─► lumen-sessao
                                                      ├─ servidor do sistema (Python, só 127.0.0.1)
                                                      └─ cage + Chromium em modo quiosque ─► interface do Lúmen (React)
```

| Pasta | Conteúdo |
|---|---|
| `web/` | Interface do Lúmen (React + TypeScript). `npm install && npm run build` gera `web/dist` |
| `servidor/` | Servidor do sistema: arquivos, terminal, senha (PAM), som, rede, energia e instalação. Só usa a biblioteca padrão do Python |
| `sistema/` | Sessão gráfica, instalador em disco, configuração da sessão ao vivo e identidade do sistema |
| `iso/` | Perfil da ISO (archiso) e script de construção |
| `.github/workflows/` | Construção automática da ISO |

### Rodar a interface no seu computador (para desenvolver)
Com Linux ou WSL, Python 3 e Node 22:
```bash
cd web && npm install && npm run build && cd ..
python3 servidor/lumen_servidor.py --porta 7070 --token teste --web web/dist
# abra http://127.0.0.1:7070/?t=teste no navegador
```
Ela usa a sua pasta pessoal de verdade, com cuidado: só altera arquivos dentro dela.

## Limitações da versão 0.1
- A interface ainda não abre programas do Linux (Firefox, Steam). Isso precisa de um compositor de janelas próprio e é o próximo passo grande.
- Wi‑Fi com senha, Bluetooth e brilho de tela ainda não existem.
- O instalador apaga o disco inteiro escolhido. Não há instalação lado a lado com outro sistema.
- No Hyper-V não há aceleração de vídeo, então as animações e o vidro ficam mais lentos.

## Histórico
O projeto anterior (KDE Plasma com tema do Lúmen e instalador Calamares) está guardado no ramo `lumen-kde`.
