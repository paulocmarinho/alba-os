"""Moldura das janelas (labwc) no tamanho e no tema do Alba.

O labwc não acompanha o "Tamanho da interface" das páginas: a barra de título, os botões e o
texto ficavam pequenos demais em 125% e 150%. Aqui a casca gera uma cópia do tema e da
configuração do labwc na pasta do usuário, com as medidas multiplicadas pela escala e as
cores do tema escuro quando ele está ligado, e pede para o labwc recarregar.
"""

from __future__ import annotations

import os
import re
import shutil
import signal
from pathlib import Path

TEMA_SISTEMA = Path("/usr/share/themes/Alba/labwc")
CONFIG_SISTEMA = Path("/etc/xdg/labwc")
CASA = Path.home()
TEMA_USUARIO = CASA / ".local/share/themes/Alba/labwc"
CONFIG_USUARIO = CASA / ".config/labwc"

# Medidas em pixels que crescem com a escala.
MEDIDAS = ("padding.height", "padding.width", "window.titlebar.padding.width", "window.button.width",
           "window.button.height", "window.button.spacing", "window.button.hover.bg.corner-radius",
           "menu.items.padding.x", "menu.items.padding.y", "osd.window-switcher.width",
           "osd.window-switcher.padding", "osd.window-switcher.item.padding.x",
           "osd.window-switcher.item.padding.y")

ESCURO = {
    "window.active.border.color": "#2c3050",
    "window.inactive.border.color": "#262a44",
    "window.active.title.bg.color": "#1f2238",
    "window.inactive.title.bg.color": "#1a1d30",
    "window.active.label.text.color": "#e8eaf6",
    "window.inactive.label.text.color": "#7d84a0",
    "window.button.hover.bg.color": "#33385a",
    "window.active.button.unpressed.image.color": "#d6daf0",
    "window.inactive.button.unpressed.image.color": "#6c7390",
    "menu.border.color": "#2c3050",
    "menu.items.bg.color": "#1f2238",
    "menu.items.text.color": "#e8eaf6",
    "menu.separator.color": "#33385a",
    "osd.bg.color": "#1f2238f0",
    "osd.border.color": "#2c3050",
    "osd.label.text.color": "#e8eaf6",
}


def _escrever_se_mudou(caminho: Path, texto: str) -> bool:
    try:
        if caminho.read_text("utf-8") == texto:
            return False
    except OSError:
        pass
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_text(texto, "utf-8")
    return True


def aplicar(escala: float, escuro: bool, destaque: str | None = None) -> None:
    if not (TEMA_SISTEMA / "themerc").exists() or not (CONFIG_SISTEMA / "rc.xml").exists():
        return
    mudou = False

    # Tema: medidas e cores.
    linhas = []
    for linha in (TEMA_SISTEMA / "themerc").read_text("utf-8").splitlines():
        m = re.match(r"^([\w.\-]+):\s*(.+)$", linha)
        if m:
            chave, valor = m.groups()
            if chave in MEDIDAS and valor.isdigit():
                valor = str(round(int(valor) * escala))
            elif escuro and chave in ESCURO:
                valor = ESCURO[chave]
            elif chave == "menu.items.active.bg.color" and destaque:
                valor = destaque
            linha = f"{chave}: {valor}"
        linhas.append(linha)
    mudou |= _escrever_se_mudou(TEMA_USUARIO / "themerc", "\n".join(linhas) + "\n")

    # Ícones dos botões, no tamanho e na cor certos.
    lado = round(16 * escala)
    cor = ESCURO["window.active.button.unpressed.image.color"] if escuro else None
    for svg in TEMA_SISTEMA.glob("*.svg"):
        texto = svg.read_text("utf-8")
        texto = re.sub(r'width="16" height="16"', f'width="{lado}" height="{lado}"', texto, count=1)
        if cor and "close_hover" not in svg.name:
            texto = texto.replace("#3a4660", cor).replace("#a3abbd", "#6c7390")
        mudou |= _escrever_se_mudou(TEMA_USUARIO / svg.name, texto)

    # Configuração: letras da barra de título e dos menus maiores.
    rc = (CONFIG_SISTEMA / "rc.xml").read_text("utf-8")
    rc = re.sub(r"<size>(\d+)</size>", lambda m: f"<size>{round(int(m.group(1)) * escala)}</size>", rc)
    rc = re.sub(r"<cornerRadius>(\d+)</cornerRadius>",
                lambda m: f"<cornerRadius>{round(int(m.group(1)) * escala)}</cornerRadius>", rc)
    mudou |= _escrever_se_mudou(CONFIG_USUARIO / "rc.xml", rc)
    # O labwc procura os outros arquivos na mesma pasta do rc.xml.
    for nome in ("menu.xml", "autostart", "environment", "shutdown"):
        origem = CONFIG_SISTEMA / nome
        if origem.exists():
            mudou |= _escrever_se_mudou(CONFIG_USUARIO / nome, origem.read_text("utf-8"))
            if os.access(origem, os.X_OK):
                (CONFIG_USUARIO / nome).chmod(0o755)

    if mudou:
        recarregar()


def recarregar() -> None:
    pid = os.environ.get("LABWC_PID")
    if pid and pid.isdigit():
        try:
            os.kill(int(pid), signal.SIGHUP)  # o mesmo que "labwc --reconfigure"
            return
        except OSError:
            pass
    if shutil.which("labwc"):
        os.system("labwc --reconfigure >/dev/null 2>&1")
