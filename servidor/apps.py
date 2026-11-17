"""Gerenciar apps: o que está instalado, desinstalar, apps padrão e apps que abrem ao ligar."""

from __future__ import annotations

import configparser
import re
import shutil
import subprocess
import time
from pathlib import Path

import loja
import monitor

CASA = Path.home()
PASTAS_SISTEMA = [Path("/usr/share/applications"), Path("/usr/local/share/applications")]
AUTOINICIO = CASA / ".config" / "autostart"
MIMEAPPS = CASA / ".config" / "mimeapps.list"
PACOTES_ALBA = Path("/usr/share/alba/pacotes.txt")
PROTEGIDOS_BASE = {"base", "linux", "linux-firmware", "linux-lts", "systemd", "pacman", "sudo", "bash", "glibc", "grub",
                   "efibootmgr", "mkinitcpio", "networkmanager", "polkit", "dbus", "pipewire", "wireplumber", "python",
                   "python-gobject", "flatpak", "plymouth"}

# Apps do próprio Alba (também podem abrir ao ligar)
APPS_ALBA = [("arquivos", "Arquivos"), ("musica", "Sleeve"), ("notas", "Notas"), ("terminal", "Terminal"),
             ("loja", "Alba Store"), ("monitor", "Monitor de Atividade"), ("ajustes", "Ajustes")]

# Utilitários técnicos que o Arch instala junto e que não são "apps" para quem usa
ESCONDIDOS = {"foot", "footclient", "foot-server", "org.codeberg.dnkl.foot", "org.codeberg.dnkl.footclient",
              "org.codeberg.dnkl.foot-server", "qv4l2", "qvidcap", "avahi-discover", "bssh", "bvnc", "lstopo",
              "nm-connection-editor", "xdg-desktop-portal-gtk", "cmake-gui", "electron", "jconsole", "jshell", "vim",
              "nvim", "htop", "btop", "org.freedesktop.IBus.Setup", "ibus-setup", "rofi", "rofi-theme-selector",
              "uxterm", "xterm", "assistant", "designer", "linguist", "qdbusviewer", "gvim"}

CATEGORIAS = {
    "navegador": {"nome": "Navegador", "tipos": ["x-scheme-handler/http", "x-scheme-handler/https", "text/html",
                                                 "application/xhtml+xml"]},
    "video": {"nome": "Vídeos", "tipos": ["video/mp4", "video/x-matroska", "video/webm", "video/quicktime", "video/x-msvideo"]},
    "pdf": {"nome": "PDF", "tipos": ["application/pdf"]},
    "email": {"nome": "E-mail", "tipos": ["x-scheme-handler/mailto"]},
}


class ErroApps(Exception):
    pass


def _rodar(*cmd, tempo=30):
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=tempo)
        return r.returncode, r.stdout, r.stderr
    except (OSError, subprocess.TimeoutExpired) as e:
        return 127, "", str(e)


def _ler_desktop(arq: Path) -> dict | None:
    cp = configparser.RawConfigParser(strict=False, interpolation=None)
    try:
        cp.read(arq, encoding="utf-8")
        e = cp["Desktop Entry"]
    except (configparser.Error, KeyError, UnicodeDecodeError):
        return None
    if e.get("Type", "Application") != "Application":
        return None
    return {
        "nome": e.get("Name[pt_BR]") or e.get("Name[pt]") or e.get("Name") or arq.stem,
        "icone": e.get("Icon", ""),
        "oculto": e.get("NoDisplay", "").lower() == "true" or e.get("Hidden", "").lower() == "true",
        "terminal": e.get("Terminal", "").lower() == "true",
        "tipos": [t for t in e.get("MimeType", "").split(";") if t],
        "exec": e.get("Exec", ""),
    }


def _protegidos() -> set[str]:
    try:
        extras = {l.strip() for l in PACOTES_ALBA.read_text().splitlines() if l.strip() and not l.startswith("#")}
    except OSError:
        extras = set()
    return PROTEGIDOS_BASE | extras


_dono_cache: dict[str, str | None] = {}


def _dono(arquivo: Path) -> str | None:
    chave = str(arquivo)
    if chave not in _dono_cache:
        cod, saida, _ = _rodar("pacman", "-Qqo", chave, tempo=10)
        _dono_cache[chave] = saida.strip().splitlines()[0] if cod == 0 and saida.strip() else None
    return _dono_cache[chave]


def _tamanhos(pacotes: list[str]) -> dict[str, tuple[str, int]]:
    """Versão e espaço ocupado de cada pacote (pacman -Qi)."""
    if not pacotes:
        return {}
    cod, saida, _ = _rodar("pacman", "-Qi", *pacotes, tempo=30)
    info, atual = {}, None
    unidades = {"B": 1, "KiB": 1024, "MiB": 1024 ** 2, "GiB": 1024 ** 3}
    versao = ""
    for linha in saida.splitlines():
        if linha.startswith("Name"):
            atual = linha.split(":", 1)[1].strip()
        elif linha.startswith("Version") and atual:
            versao = linha.split(":", 1)[1].strip()
        elif linha.startswith("Installed Size") and atual:
            m = re.search(r"([\d.,]+)\s*(B|KiB|MiB|GiB)", linha)
            tam = int(float(m.group(1).replace(",", ".")) * unidades[m.group(2)]) if m else 0
            info[atual] = (versao, tam)
    return info


def _tamanho_texto(t: str) -> int:
    m = re.search(r"([\d.,]+)\s*(kB|MB|GB|bytes)", t or "")
    if not m:
        return 0
    return int(float(m.group(1).replace(",", ".")) * {"bytes": 1, "kB": 1000, "MB": 1000 ** 2, "GB": 1000 ** 3}[m.group(2)])


def listar() -> dict:
    protegidos = _protegidos()
    apps = []
    vistos = set()
    # Programas do sistema (pacman), pelos atalhos .desktop
    candidatos = []
    for pasta in PASTAS_SISTEMA:
        if not pasta.is_dir():
            continue
        for arq in sorted(pasta.glob("*.desktop")):
            if arq.stem in ESCONDIDOS or arq.stem.startswith("org.alba.") or arq.name in vistos:
                continue
            d = _ler_desktop(arq)
            if not d or d["oculto"] or d["terminal"]:
                continue
            vistos.add(arq.name)
            candidatos.append((arq, d))
    donos = {arq: _dono(arq) for arq, _d in candidatos}
    info = _tamanhos(sorted({p for p in donos.values() if p}))
    por_pacote: dict[str, dict] = {}
    for arq, d in candidatos:
        pacote = donos.get(arq)
        if pacote and pacote in por_pacote:
            continue  # um pacote com vários atalhos aparece uma vez
        versao, tam = info.get(pacote, ("", 0)) if pacote else ("", 0)
        item = {"id": arq.stem, "desktop": arq.name, "nome": d["nome"], "icone": d["icone"], "origem": "sistema",
                "pacote": pacote, "versao": versao, "tamanho": tam,
                "protegido": not pacote or pacote in protegidos,
                "motivo": "Faz parte do Alba" if pacote in protegidos else ("" if pacote else "Não veio de um pacote")}
        apps.append(item)
        if pacote:
            por_pacote[pacote] = item
    # Apps da Alba Store (Flatpak)
    for a in loja.instalados():
        apps.append({"id": a["id"], "desktop": f"{a['id']}.desktop", "nome": a["nome"], "icone": a["id"], "origem": "loja",
                     "pacote": a["id"], "versao": a.get("versao", ""), "tamanho": _tamanho_texto(a.get("tamanho", "")),
                     "protegido": False, "motivo": ""})
    apps.sort(key=lambda a: a["nome"].casefold())
    return {"apps": apps, "tarefas": loja.tarefas()}


def desinstalar(item: dict) -> dict:
    origem, pacote, nome = item.get("origem"), str(item.get("pacote") or ""), str(item.get("nome") or "")
    if origem == "loja":
        return loja.remover(pacote, nome)
    if origem != "sistema" or not pacote:
        raise ErroApps("Esse app não pode ser removido por aqui.")
    if pacote in _protegidos():
        raise ErroApps("Esse app faz parte do Alba e não pode ser removido.")
    cod, saida, erro = _rodar("sudo", "-n", "/usr/local/bin/alba-atualizar", "--remover", pacote, tempo=600)
    if cod != 0:
        ultima = (erro or saida).strip().splitlines()[-1] if (erro or saida).strip() else "Não consegui remover."
        raise ErroApps(ultima.replace("ERRO: ", "").capitalize())
    _dono_cache.clear()
    return {"ok": True}


# ---------------------------------------------------------------- apps padrão
def _pastas_todas():
    return monitor._pastas_apps()


def _mimeapps() -> configparser.RawConfigParser:
    cp = configparser.RawConfigParser(strict=False, interpolation=None)
    cp.optionxform = str  # tipos com maiúsculas
    for arq in (Path("/etc/xdg/mimeapps.list"), MIMEAPPS):
        try:
            cp.read(arq, encoding="utf-8")
        except (configparser.Error, UnicodeDecodeError):
            pass
    return cp


def padroes() -> dict:
    todos = {}
    for pasta in _pastas_todas():
        if not pasta.is_dir():
            continue
        for arq in pasta.glob("*.desktop"):
            if arq.name in todos:
                continue
            d = _ler_desktop(arq)
            if d and not d["oculto"]:
                todos[arq.name] = d
    cp = _mimeapps()
    resultado = {}
    for chave, cat in CATEGORIAS.items():
        opcoes = [{"desktop": nome, "nome": d["nome"], "icone": d["icone"]} for nome, d in todos.items()
                  if any(t in d["tipos"] for t in cat["tipos"])]
        opcoes.sort(key=lambda o: o["nome"].casefold())
        atual = None
        if cp.has_section("Default Applications"):
            valor = cp.get("Default Applications", cat["tipos"][0], fallback="")
            atual = next((v for v in valor.split(";") if v and v in todos), None)
        if not atual and opcoes:
            atual = opcoes[0]["desktop"]
        resultado[chave] = {"nome": cat["nome"], "atual": atual, "opcoes": opcoes}
    return resultado


def definir_padrao(categoria: str, desktop: str) -> dict:
    cat = CATEGORIAS.get(categoria)
    if not cat or not re.fullmatch(r"[\w.\-]+\.desktop", desktop or ""):
        raise ErroApps("Escolha inválida.")
    cp = configparser.RawConfigParser(strict=False, interpolation=None)
    cp.optionxform = str
    try:
        cp.read(MIMEAPPS, encoding="utf-8")
    except (configparser.Error, UnicodeDecodeError):
        pass
    if not cp.has_section("Default Applications"):
        cp.add_section("Default Applications")
    for t in cat["tipos"]:
        cp.set("Default Applications", t, desktop)
    MIMEAPPS.parent.mkdir(parents=True, exist_ok=True)
    with MIMEAPPS.open("w", encoding="utf-8") as f:
        cp.write(f, space_around_delimiters=False)
    return padroes()


# ---------------------------------------------------------------- abrir ao ligar
def _arquivo_auto(ident: str) -> Path:
    return AUTOINICIO / f"alba-{re.sub(r'[^\w.-]', '_', ident)}.desktop"


def autoinicio() -> dict:
    ligados = set()
    if AUTOINICIO.is_dir():
        for arq in AUTOINICIO.glob("alba-*.desktop"):
            ligados.add(arq.stem.removeprefix("alba-"))
    lista = [{"id": f"alba.{a}", "nome": nome, "alba": a, "ligado": f"alba.{a}" in ligados} for a, nome in APPS_ALBA
             if a not in ("ajustes",)]
    for a in listar()["apps"]:
        ident = a["desktop"].removesuffix(".desktop")
        lista.append({"id": ident, "nome": a["nome"], "icone": a["icone"], "ligado": ident in ligados})
    return {"apps": lista}


def definir_autoinicio(ident: str, ligado: bool) -> dict:
    if not re.fullmatch(r"[\w.\-]+", ident or ""):
        raise ErroApps("App inválido.")
    arq = _arquivo_auto(ident)
    if not ligado:
        arq.unlink(missing_ok=True)
        return autoinicio()
    AUTOINICIO.mkdir(parents=True, exist_ok=True)
    if ident.startswith("alba."):
        app = ident.removeprefix("alba.")
        if app not in dict(APPS_ALBA):
            raise ErroApps("App inválido.")
        nome = dict(APPS_ALBA)[app]
        execu = f"alba-app {app}"
    else:
        origem = next((p / f"{ident}.desktop" for p in _pastas_todas() if (p / f"{ident}.desktop").is_file()), None)
        d = _ler_desktop(origem) if origem else None
        if not d:
            raise ErroApps("Esse app não foi encontrado.")
        nome = d["nome"]
        execu = re.sub(r"\s%[fFuUdDnNickvm]", "", d["exec"]).strip()
    arq.write_text(f"[Desktop Entry]\nType=Application\nName={nome}\nExec={execu}\nX-Alba-Autoinicio=true\n", "utf-8")
    return autoinicio()


# ---------------------------------------------------------------- atualizações do sistema
_pendentes = {"t": 0.0, "valor": None}


def pendentes_sistema(forcar=False) -> dict:
    """Pacotes do sistema com versão nova (checkupdates não precisa de administrador)."""
    if not forcar and _pendentes["valor"] is not None and time.time() - _pendentes["t"] < 20 * 60:
        return _pendentes["valor"]
    if not shutil.which("checkupdates"):
        valor = {"pendentes": None, "pacotes": []}
    else:
        cod, saida, _ = _rodar("checkupdates", tempo=120)
        # checkupdates: 0 = há atualizações, 2 = nenhuma, 1 = erro (ex.: sem internet)
        if cod == 1:
            valor = {"pendentes": None, "pacotes": [], "erro": "Não consegui conferir o sistema (sem internet?)."}
        else:
            pacotes = [l.split()[0] for l in saida.splitlines() if l.strip()]
            valor = {"pendentes": len(pacotes), "pacotes": pacotes[:80],
                     "nucleo": any(p in ("linux", "linux-lts", "linux-zen") for p in pacotes)}
    _pendentes.update(t=time.time(), valor=valor)
    return valor


def precisa_reiniciar() -> bool:
    import os
    return not Path(f"/usr/lib/modules/{os.uname().release}").is_dir()
