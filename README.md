# Lúmen OS

Um Linux bonito, transparente e pronto para jogos, com o visual do protótipo do Figma: tons verde-azulados e areia, vidro claro, barra superior completa, central de controle e dock. Por baixo é **Arch Linux com KDE Plasma 6**.

> Versão 0.1. A ISO ainda não foi testada numa máquina de verdade. Se algo falhar, guarde o registro do GitHub ou do instalador (veja "Se algo der errado").

## ISO instalável (Hyper-V)

A ISO liga numa **sessão ao vivo** do Lúmen e abre sozinha o **instalador do Lúmen OS**. O instalador pergunta idioma, fuso, **teclado**, disco e usuário, tudo com a cara do Lúmen, e mostra telas do sistema enquanto copia os arquivos.

### 1. Gerar a ISO no GitHub (uma vez, de 45 a 70 minutos)

1. Crie um repositório no GitHub (pode ser privado) e envie a pasta `lumen-os` inteira, incluindo a pasta oculta `.github`.
   - Pelo site: **Add file › Upload files** e arraste o conteúdo da pasta. Confira se `.github/workflows/construir-iso.yml` subiu; se o navegador esconder a pasta, crie o arquivo pelo site e cole o conteúdo.
2. Vá em **Actions › Construir ISO do Lumen › Run workflow**. O GitHub compila o instalador (Calamares) e depois monta a ISO.
3. Quando terminar, abra a execução e baixe **lumen-os-iso** em *Artifacts*. Dentro do zip está `lumen-os-0.1.0-x86_64.iso`.

Num Arch Linux próprio: `sudo ./iso/construir-aur.sh` e depois `sudo ./iso/construir-iso.sh`.

### 2. Criar a máquina virtual

1. No Gerenciador do Hyper-V: **Nova › Máquina Virtual**, nome *Lúmen OS*, **Geração 2**.
2. Memória: **8192 MB** (mínimo 4096) e **desmarque** "Usar Memória Dinâmica".
3. Rede: **Default Switch**.
4. Disco: **novo disco de 64 GB** (o mínimo é 20 GB).
5. Instalação: **Instalar um sistema operacional de um arquivo de imagem** e escolha a ISO.
6. Antes de ligar, abra **Configurações** da máquina:
   - **Segurança**: **desmarque "Habilitar Inicialização Segura"** (a ISO não é assinada pela Microsoft).
   - **Processador**: 4 processadores virtuais ou mais.

### 3. Instalar

1. Ligue e conecte. No menu de boot, escolha **Lumen OS (ao vivo e instalador)**.
2. A área de trabalho abre sozinha e, uns 15 segundos depois, o **instalador** aparece. Se fechar, abra de novo em *Aplicativos › Instalar o Lúmen OS*.
3. Siga as telas: boas-vindas, **local e fuso**, **teclado** (para ABNT2 escolha *Portuguese (Brazil)*), **disco** (*Apagar disco* é o mais simples na máquina virtual), **usuário e senha** e resumo.
4. No fim, marque **Reiniciar agora**.
5. Com a máquina desligando, vá em **Mídia › Unidade de DVD › Ejetar** no Hyper-V para ela não ligar de novo pela ISO.
6. Na tela de login, entre com o usuário que você criou. No primeiro login o visual do Lúmen é aplicado em alguns segundos.

### Tela de bloqueio

Bloqueie com **Meta+L** (a tecla do Windows + L). A tela mostra a data por extenso em cima e a **hora em tamanho grande** logo abaixo, sobre o papel de parede do Lúmen. A tela de login usa o mesmo relógio.

### O que esperar na máquina virtual

- O Hyper-V **não tem aceleração de vídeo**: o desenho é feito pelo processador, então o vidro e as animações ficam mais lentos do que num PC de verdade.
- **Jogos e a placa NVIDIA não funcionam** de verdade dentro da máquina virtual. Para jogar, instale num PC.
- Se a resolução não ficar em 1920×1080, ajuste em *Configurações do sistema › Monitores*.

### Se algo der errado

- **Falhou no GitHub:** abra a execução em *Actions*, clique na etapa vermelha e copie as últimas linhas do registro.
- **Falhou na instalação:** na sessão ao vivo, o registro do instalador fica em `/root/.cache/calamares/session.log`. Abra o Konsole e rode `sudo cat /root/.cache/calamares/session.log | tail -n 80`.

## Alternativa: aplicar o Lúmen num CachyOS já instalado (install.sh)

| Parte | O que muda |
|---|---|
| Barra superior | Botão **Aplicativos** com o logo do Lumen, menu global do app aberto e, à direita, ícones de status, data por extenso e hora |
| Dock | Painel flutuante e translúcido embaixo, que se esconde quando uma janela encosta nele |
| Visual | Papel de parede *Aurora* (4K), esquema de cores **Lumen** verde-azulado, estilo de janelas **LumenGlass** (Kvantum translúcido), ícones Papirus com pastas verde-azuladas, fonte DM Sans (ou Inter) |
| Tela de bloqueio e login | Data por extenso em cima e hora grande embaixo, sobre o papel de parede do Lúmen |
| Identidade | Nome e logo do Lúmen em *Configurações › Sobre este sistema* |
| Janelas | Desfoque atrás do vidro, cantos arredondados, botões minimizar, maximizar e fechar à direita |
| Prisma | Gerenciador de arquivos do Lumen (nesta fase é o Dolphin com nome, ícone e ajustes próprios) |
| Navegador | Firefox como padrão |
| Jogos | Steam, Proton, GameMode, MangoHud (com o tema do Lumen), Gamescope, Lutris, Heroic, ProtonUp-Qt e Wine |
| NVIDIA | Confere o driver proprietário; se faltar, oferece instalar (no CachyOS, via `chwd`) |

Antes de mudar qualquer coisa, ele guarda um backup da configuração do Plasma em `~/.local/share/lumen/backups/`.

## Passo a passo

1. **Instale o CachyOS** baixando a ISO em cachyos.org.
   - No instalador, escolha a área de trabalho **KDE Plasma**.
   - Escolha o driver **NVIDIA (proprietário)** quando ele perguntar.
   - Se ainda não quiser trocar o seu sistema, instale num SSD separado ou numa máquina virtual para testar o visual (a máquina virtual não testa a placa de vídeo).
2. **Copie a pasta `lumen-os`** para o novo sistema e abra o Konsole nela.
3. **Simule primeiro** para ver tudo o que vai acontecer:
   ```bash
   ./install.sh --simular
   ```
4. **Instale**:
   ```bash
   ./install.sh
   ```
5. **Saia e entre de novo** na sessão. Se o driver NVIDIA foi instalado agora, reinicie o computador.

### Opções

| Opção | Efeito |
|---|---|
| `--simular` | Mostra cada passo sem alterar nada |
| `--somente-tema` | Só o visual, sem instalar pacotes, jogos ou driver |
| `--sem-jogos` | Pula o pacote de jogos |
| `--sim` | Responde "sim" às perguntas (por exemplo, instalar o driver) |

### Desfazer

```bash
./restaurar.sh
```

Volta a configuração do Plasma para o último backup. Os programas instalados continuam no sistema.

## Dicas para jogos

- Nas propriedades de um jogo na Steam, em **Opções de inicialização**, use:
  ```
  gamemoderun mangohud %command%
  ```
- **Shift direito + F12** mostra ou esconde o MangoHud.
- Jogos de Windows rodam pelo Proton. Ative em Steam › Configurações › Compatibilidade.
- No Wayland, jogos em tela cheia são desenhados direto na tela, sem o vidro e o desfoque por trás, então a transparência não custa desempenho dentro do jogo.

## Limitações desta versão

- **LumenGlass** é gerado a partir do tema translúcido que já vem com o Kvantum, com as cores do Lumen por cima. O desenho próprio dos botões e campos fica para a fase 2.
- O relógio do Plasma decide sozinho a ordem entre data e hora. Para garantir exatamente "sexta-feira, 13 de novembro de 2026  21:42", como no protótipo, é preciso um widget próprio (fase 2).
- O **Prisma** ainda é o Dolphin: o título da janela continua terminando em "Dolphin", e as coleções coloridas e o painel de detalhes do protótipo ainda não existem.
- Os cantos arredondados vêm do pacote `kwin-effect-rounded-corners-git` do AUR. Se uma atualização do Plasma quebrar o efeito, basta reinstalá-lo.
- O **Sleeve** (player de música) ainda não está integrado.

## Roteiro

- **Fase 1 — instalador (esta versão):** visual, layout, jogos e NVIDIA em cima do CachyOS.
- **Fase 2 — acabamento:** tema Kvantum e estilo do Plasma desenhados do zero, widget de data e hora próprio, tela de login (SDDM) e tela de abertura do Lumen, central de controle em pílulas de vidro, integração do Sleeve.
- **Fase 3 — Prisma de verdade:** gerenciador de arquivos próprio em Qt/QML, com abas, coleções coloridas e painel de detalhes.
- **Fase 4 — ISO instalável:** feita nesta versão (sessão ao vivo + instalador do Lúmen).

## Estrutura

```
lumen-os/
├── install.sh              instalador
├── restaurar.sh            desfaz o visual a partir do backup
├── lib/common.sh           funções compartilhadas
├── modules/                etapas: backup, pacotes, jogos, NVIDIA, tema, Plasma
├── packages/               listas de pacotes (base, jogos, AUR)
├── plasma/layout.js        barra superior, dock e papel de parede
├── theme/                  papel de parede, cores, Kvantum, ícones, MangoHud, Prisma
├── sistema/                identidade, relógio da tela de bloqueio e limpeza pós-instalação
├── instalador/             configuração e identidade do instalador (Calamares)
├── iso/                    perfil da ISO (archiso) e scripts de construção
└── .github/workflows/      construção automática da ISO no GitHub
```
