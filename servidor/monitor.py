"""Monitor de atividade: processador, memória, disco, rede e apps abertos (agrupados).

Lê tudo do /proc. Cada leitura guarda a anterior para calcular uso (%) e velocidades.
Os processos são agrupados por app: um app é um processo do usuário aberto pela sessão
(compositor, casca, systemd do usuário…) junto com todos os filhos dele. O Firefox, por
exemplo, aparece uma vez só, somando as dezenas de processos que ele cria.
"""

from __future__ import annotations

import configparser
import os
import pwd
import re
import signal
import threading
import time
from pathlib import Path

PAGINA = os.sysconf("SC_PAGE_SIZE")
TIQUES = os.sysconf("SC_CLK_TCK")
NUCLEOS = os.cpu_count() or 1
UID = os.getuid()

NOMES_ALBA = {"arquivos": "Arquivos", "musica": "Sleeve", "terminal": "Terminal", "notas": "Notas",
              "ajustes": "Ajustes", "visualizador": "Fotos", "loja": "Alba Store", "monitor": "Monitor de Atividade",
              "instalador": "Instalador"}

# Partes do próprio sistema: aparecem em "Processos do sistema", nunca como app, e não se encerram.
SISTEMA = {"labwc", "alba-sessao", "alba-casca", "alba_servidor.py", "casca.py", "dbus-daemon", "dbus-broker",
           "dbus-run-session", "pipewire", "pipewire-pulse", "wireplumber", "xdg-desktop-portal",
           "xdg-desktop-portal-wlr", "xdg-desktop-portal-gtk", "xdg-document-portal", "xdg-permission-store",
           "flatpak-session-helper", "flatpak-portal", "systemd", "(sd-pam)", "bash", "sh", "agetty", "login",
           "at-spi-bus-launcher", "at-spi2-registryd", "gvfsd", "gvfsd-fuse", "dconf-service", "Xwayland",
           "sudo", "gpg-agent", "ssh-agent", "xdg-dbus-proxy", "bwrap"}
NOMES_SISTEMA = {"labwc": "Gerenciador de janelas", "alba_servidor.py": "Serviços do Alba", "casca.py": "Interface do Alba",
                 "pipewire": "Som (PipeWire)", "pipewire-pulse": "Som (PipeWire)", "wireplumber": "Som (WirePlumber)",
                 "Xwayland": "Compatibilidade X11", "dbus-daemon": "Comunicação entre apps", "dbus-broker": "Comunicação entre apps"}

_trava = threading.Lock()
_antes: dict = {}


# ---------------------------------------------------------------- leitura do sistema
def _cpu_total():
    linhas = Path("/proc/stat").read_text().splitlines()
    tudo = []
    for l in linhas:
        if not l.startswith("cpu"):
            break
        v = [int(x) for x in l.split()[1:]]
        ocioso = v[3] + (v[4] if len(v) > 4 else 0)
        tudo.append((sum(v[:8]), ocioso))
    return tudo  # [total, cpu0, cpu1, …]


def _memoria():
    info = {}
    for l in Path("/proc/meminfo").read_text().splitlines():
        k, v = l.split(":", 1)
        info[k] = int(v.split()[0]) * 1024
    total = info.get("MemTotal", 0)
    disp = info.get("MemAvailable", total)
    return {"total": total, "usada": total - disp, "cache": info.get("Cached", 0) + info.get("Buffers", 0),
            "swap_total": info.get("SwapTotal", 0), "swap_usada": info.get("SwapTotal", 0) - info.get("SwapFree", 0)}


def _discos():
    lidos = escritos = 0
    for l in Path("/proc/diskstats").read_text().splitlines():
        p = l.split()
        nome = p[2]
        # só discos inteiros (sda, nvme0n1, vda, mmcblk0), não partições nem loop/ram
        if re.fullmatch(r"(sd[a-z]+|vd[a-z]+|xvd[a-z]+|hd[a-z]+|nvme\d+n\d+|mmcblk\d+)", nome):
            lidos += int(p[5]) * 512
            escritos += int(p[9]) * 512
    return lidos, escritos


def _rede():
    rx = tx = 0
    for l in Path("/proc/net/dev").read_text().splitlines()[2:]:
        nome, dados = l.split(":", 1)
        nome = nome.strip()
        if nome == "lo" or nome.startswith(("veth", "docker", "br-", "virbr")):
            continue
        v = dados.split()
        rx += int(v[0])
        tx += int(v[8])
    return rx, tx


def _processos():
    procs = {}
    for d in os.listdir("/proc"):
        if not d.isdigit():
            continue
        pid = int(d)
        try:
            stat = Path(f"/proc/{pid}/stat").read_text()
            fim = stat.rindex(")")
            comm = stat[stat.index("(") + 1:fim]
            campos = stat[fim + 2:].split()
            ppid = int(campos[1])
            ticks = int(campos[11]) + int(campos[12])
            rss = int(campos[21]) * PAGINA
            uid = os.stat(f"/proc/{pid}").st_uid
            try:
                cmd = Path(f"/proc/{pid}/cmdline").read_bytes().split(b"\0")
                cmd = [c.decode("utf-8", "replace") for c in cmd if c]
            except OSError:
                cmd = []
            procs[pid] = {"pid": pid, "ppid": ppid, "comm": comm, "cmd": cmd, "ticks": ticks, "rss": rss, "uid": uid,
                          "estado": campos[0]}
        except (OSError, ValueError, IndexError):
            continue
    return procs


# ---------------------------------------------------------------- nomes e ícones dos apps
_desktops: dict | None = None
_desktops_t = 0.0


def _pastas_apps():
    dados = os.environ.get("XDG_DATA_DIRS", "/usr/local/share:/usr/share").split(":")
    casa = Path.home() / ".local/share"
    return [casa / "applications", casa / "flatpak/exports/share/applications",
            Path("/var/lib/flatpak/exports/share/applications")] + [Path(d) / "applications" for d in dados]


def _indice_desktops():
    """Programa (nome do executável ou id do Flatpak) → nome bonito e ícone, pelos .desktop."""
    global _desktops, _desktops_t
    if _desktops is not None and time.time() - _desktops_t < 60:
        return _desktops
    indice = {}
    for pasta in _pastas_apps():
        if not pasta.is_dir():
            continue
        for arq in pasta.glob("*.desktop"):
            cp = configparser.RawConfigParser(strict=False, interpolation=None)
            try:
                cp.read(arq, encoding="utf-8")
                e = cp["Desktop Entry"]
            except (configparser.Error, KeyError, UnicodeDecodeError):
                continue
            nome = e.get("Name[pt_BR]") or e.get("Name[pt]") or e.get("Name") or arq.stem
            info = {"nome": nome, "icone": e.get("Icon", ""), "desktop": arq.name}
            ident = arq.stem
            indice.setdefault(ident, info)
            indice.setdefault(ident.lower(), info)
            execu = (e.get("Exec") or "").split()
            if execu:
                prog = execu[0]
                if prog in ("env", "flatpak") and len(execu) > 1:
                    prog = next((x for x in execu[1:] if not x.startswith("-") and "=" not in x and x != "run"), prog)
                indice.setdefault(os.path.basename(prog), info)
            wm = e.get("StartupWMClass")
            if wm:
                indice.setdefault(wm.lower(), info)
    _desktops, _desktops_t = indice, time.time()
    return indice


def _flatpak_de(pid):
    try:
        texto = Path(f"/proc/{pid}/root/.flatpak-info").read_text()
        m = re.search(r"^name=(\S+)", texto, re.M)
        return m.group(1) if m else None
    except OSError:
        return None


def _identificar(p, procs):
    """Nome do app de um processo raiz (e se é parte do sistema)."""
    cmd = p["cmd"]
    texto = " ".join(cmd)
    m = re.search(r"/casca/app\.py\s+(\w+)", texto)
    if m:
        app = m.group(1)
        return {"nome": NOMES_ALBA.get(app, app.capitalize()), "alba": app, "sistema": False}
    base = os.path.basename(cmd[0]) if cmd else p["comm"]
    script = next((os.path.basename(c) for c in cmd[1:3] if c.endswith(".py")), None) if base.startswith("python") else None
    chave = script or base
    if chave in SISTEMA or p["comm"] in SISTEMA:
        return {"nome": NOMES_SISTEMA.get(chave) or NOMES_SISTEMA.get(p["comm"]) or chave, "sistema": True}
    indice = _indice_desktops()
    fp = _flatpak_de(p["pid"]) if base in ("bwrap", "flatpak") or "/app/" in texto else None
    for candidato in filter(None, [fp, chave, p["comm"], chave.removesuffix("-bin"), p["comm"].lower()]):
        info = indice.get(candidato) or indice.get(candidato.lower())
        if info:
            return {"nome": info["nome"], "icone": info["icone"], "desktop": info["desktop"], "sistema": False}
    return {"nome": p["comm"], "sistema": False}


def caminho_icone(nome: str) -> Path | None:
    """Arquivo de ícone pelo nome do tema (procura nos temas e no Flatpak)."""
    if not nome:
        return None
    if nome.startswith("/") and Path(nome).is_file():
        return Path(nome)
    if not re.fullmatch(r"[\w.\-+]+", nome):
        return None
    bases = [Path.home() / ".local/share/icons", Path.home() / ".local/share/flatpak/exports/share/icons",
             Path("/var/lib/flatpak/exports/share/icons"), Path("/usr/share/icons")]
    for base in bases:
        for tema in ("hicolor", "Adwaita"):
            for tam in ("scalable", "512x512", "256x256", "128x128", "96x96", "64x64", "48x48"):
                for ext in (".svg", ".png"):
                    c = base / tema / tam / "apps" / f"{nome}{ext}"
                    if c.is_file():
                        return c
    for ext in (".svg", ".png", ".xpm"):
        c = Path("/usr/share/pixmaps") / f"{nome}{ext}"
        if c.is_file():
            return c
    return None


# ---------------------------------------------------------------- amostra completa
def amostra() -> dict:
    agora = time.monotonic()
    cpus = _cpu_total()
    mem = _memoria()
    disco_l, disco_e = _discos()
    rede_rx, rede_tx = _rede()
    procs = _processos()

    with _trava:
        antes = dict(_antes)
        _antes.update({"t": agora, "cpus": cpus, "disco": (disco_l, disco_e), "rede": (rede_rx, rede_tx),
                       "ticks": {pid: p["ticks"] for pid, p in procs.items()}})
    dt = max(0.05, agora - antes.get("t", agora - 1))

    def uso(i):
        if "cpus" not in antes or i >= len(antes["cpus"]):
            return 0.0
        tot = cpus[i][0] - antes["cpus"][i][0]
        oc = cpus[i][1] - antes["cpus"][i][1]
        return round(max(0.0, min(100.0, 100.0 * (tot - oc) / tot)), 1) if tot > 0 else 0.0

    velocidade = lambda novo, chave, i: max(0, (novo - antes[chave][i]) / dt) if chave in antes else 0  # noqa: E731
    ticks_antes = antes.get("ticks", {})

    # CPU de cada processo, em % de um núcleo (como no Mac: 200% = dois núcleos inteiros)
    for pid, p in procs.items():
        p["cpu"] = 100.0 * (p["ticks"] - ticks_antes.get(pid, p["ticks"])) / TIQUES / dt

    # Raízes dos apps: processo do usuário cujo pai é a sessão (compositor, casca, systemd do usuário, init)
    meus = {pid: p for pid, p in procs.items()
            if p["uid"] == UID and pid != 2 and p["ppid"] != 2 and p["cmd"]}  # sem as tarefas do kernel
    filhos: dict[int, list[int]] = {}
    for pid, p in procs.items():
        filhos.setdefault(p["ppid"], []).append(pid)
    # Processos "de passagem": o que eles abrem aparece separado (um app aberto por um terminal
    # ou por um atalho de teclado aparece com o próprio nome, não dentro do "sh").
    sessao = {pid for pid, p in meus.items()
              if os.path.basename(p["cmd"][0]) in ("labwc", "systemd", "alba-sessao", "dbus-daemon", "dbus-broker", "dbus-run-session", "sh", "bash", "dash", "zsh", "fish", "timeout", "sudo", "login")
              or re.search(r"casca/casca\.py|alba-casca|alba_servidor", " ".join(p["cmd"]))}
    sessao.add(1)

    def descendentes(pid):
        pilha, todos = [pid], []
        while pilha:
            x = pilha.pop()
            todos.append(x)
            pilha.extend(f for f in filhos.get(x, []) if f in meus)
        return todos

    apps, sistema, vistos = [], [], set()
    for pid, p in sorted(meus.items()):
        if pid in vistos or (p["ppid"] not in sessao and p["ppid"] in meus):
            continue
        if pid in sessao:
            grupo = [pid]
        else:
            grupo = descendentes(pid)
        vistos.update(grupo)
        ident = _identificar(p, procs)
        pai = procs.get(p["ppid"], {})
        if (not ident["sistema"] and not ident.get("alba") and not ident.get("desktop")
                and (pai.get("comm") == "systemd" or p["ppid"] == 1 or p["comm"].startswith("WebKit"))):
            # Serviço de fundo sem janela (ou o motor de páginas da própria interface)
            nome = "Interface do Alba" if p["comm"].startswith("WebKit") else NOMES_SISTEMA.get(p["comm"], p["comm"])
            ident = {"nome": nome, "sistema": True}
        item = {"pid": pid, "nome": ident["nome"], "icone": ident.get("icone", ""), "alba": ident.get("alba"),
                "desktop": ident.get("desktop"), "processos": len(grupo),
                "cpu": round(sum(procs[x]["cpu"] for x in grupo), 1),
                "memoria": sum(procs[x]["rss"] for x in grupo),
                "protegido": ident["sistema"] or pid in sessao}
        (sistema if ident["sistema"] or pid in sessao else apps).append(item)

    # Juntar o que tem o mesmo nome (ex.: vários processos soltos do mesmo programa)
    def juntar(lista):
        por_nome: dict[str, dict] = {}
        for a in lista:
            j = por_nome.get(a["nome"])
            if j:
                j["cpu"] = round(j["cpu"] + a["cpu"], 1)
                j["memoria"] += a["memoria"]
                j["processos"] += a["processos"]
                j.setdefault("pids", [j["pid"]]).append(a["pid"])
            else:
                por_nome[a["nome"]] = dict(a, pids=[a["pid"]])
        return sorted(por_nome.values(), key=lambda a: (-a["cpu"], -a["memoria"]))

    try:
        carga = os.getloadavg()
    except OSError:
        carga = (0, 0, 0)
    return {
        "cpu": {"total": uso(0), "nucleos": [uso(i) for i in range(1, len(cpus))], "carga": [round(x, 2) for x in carga]},
        "memoria": mem,
        "disco": {"leitura": velocidade(disco_l, "disco", 0), "escrita": velocidade(disco_e, "disco", 1)},
        "rede": {"recebendo": velocidade(rede_rx, "rede", 0), "enviando": velocidade(rede_tx, "rede", 1)},
        "apps": juntar(apps),
        "sistema": juntar(sistema),
        "total_processos": len(procs),
        "usuario": pwd.getpwuid(UID).pw_name,
    }


def encerrar(pids: list[int], forcar: bool) -> int:
    """Encerra apps do usuário (com todos os processos filhos). Partes do sistema não."""
    procs = _processos()
    meus = {pid for pid, p in procs.items() if p["uid"] == UID}
    filhos: dict[int, list[int]] = {}
    for pid, p in procs.items():
        filhos.setdefault(p["ppid"], []).append(pid)
    alvo = []
    for pid in pids:
        p = procs.get(int(pid))
        if not p or int(pid) not in meus:
            continue
        if _identificar(p, procs)["sistema"] or re.search(r"casca/casca\.py|alba_servidor|labwc", " ".join(p["cmd"])):
            continue
        pilha = [int(pid)]
        while pilha:
            x = pilha.pop()
            alvo.append(x)
            pilha.extend(f for f in filhos.get(x, []) if f in meus)
    sinal = signal.SIGKILL if forcar else signal.SIGTERM
    feitos = 0
    for pid in reversed(alvo):  # filhos primeiro
        try:
            os.kill(pid, sinal)
            feitos += 1
        except OSError:
            pass
    return feitos
