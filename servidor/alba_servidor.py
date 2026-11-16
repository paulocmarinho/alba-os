#!/usr/bin/env python3
"""Servidor do sistema Alba.

Liga a interface (que roda no navegador em modo quiosque) ao sistema:
arquivos, terminal, senha, som, rede, energia, configurações e instalação.
Só usa a biblioteca padrão do Python. Escuta apenas em 127.0.0.1 e exige
um token de sessão em todas as chamadas.

Uso: alba_servidor.py --porta 7070 --token SEGREDO --web /usr/share/alba/web [--live]
"""

import argparse
import asyncio
import base64
import datetime as dt
import fcntl
import hashlib
import json
import mimetypes
import os
import platform
import pty
import pwd
import re
import shutil
import signal
import struct
import subprocess
import sys
import termios
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import musica  # noqa: E402
import loja  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
try:
    import pam  # noqa: E402
except OSError:  # libpam ausente (não deve acontecer no Alba)
    pam = None

VERSAO = "0.5.0"
CASA = Path.home()
CONFIG_DIR = CASA / ".config" / "alba"
CONFIG_ARQ = CONFIG_DIR / "config.json"
LIXEIRA = CASA / ".local" / "share" / "Trash"
CONFIG_PADRAO = {"tema": "claro", "destaque": "#e0662f", "papel": "mar", "papel_arquivo": "", "papel_definido": False,
                 "teclado": "br", "relogio24h": True, "escala": 1.25}
PAPEIS = ("mar", "montanhas", "alba", "personalizado")
ESCALAS = (1.0, 1.25, 1.5)
PASTAS_PADRAO = ["Documentos", "Downloads", "Imagens", "Músicas", "Vídeos"]
TECLADOS = [
    {"id": "br", "nome": "Português (Brasil, ABNT2)"},
    {"id": "us", "nome": "Inglês (EUA)"},
    {"id": "us-intl", "nome": "Inglês (EUA, internacional com acentos)"},
    {"id": "pt", "nome": "Português (Portugal)"},
    {"id": "es", "nome": "Espanhol"},
    {"id": "gb", "nome": "Inglês (Reino Unido)"},
]
LIMITE_TEXTO = 2 * 1024 * 1024
LIMITE_ARQUIVO = 64 * 1024 * 1024
WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

ARGS = None
STATUS = {200: "OK", 204: "No Content", 400: "Bad Request", 401: "Unauthorized", 403: "Forbidden",
          404: "Not Found", 405: "Method Not Allowed", 409: "Conflict", 413: "Payload Too Large",
          206: "Partial Content", 416: "Range Not Satisfiable", 500: "Internal Server Error", 503: "Service Unavailable"}


class ErroApi(Exception):
    def __init__(self, status, mensagem):
        super().__init__(mensagem)
        self.status = status
        self.mensagem = mensagem


# ----------------------------------------------------------------------------------------------
# Utilidades


def rodar(*cmd, entrada=None, tempo=10):
    try:
        r = subprocess.run(cmd, input=entrada, capture_output=True, text=True, timeout=tempo)
        return r.returncode, r.stdout, r.stderr
    except (FileNotFoundError, subprocess.TimeoutExpired) as e:
        return 127, "", str(e)


def caminho_seguro(texto, precisa_existir=True):
    """Converte o caminho pedido pela interface. "~" é a pasta pessoal."""
    if not texto or texto == "~":
        p = CASA
    elif texto.startswith("~/"):
        p = CASA / texto[2:]
    else:
        p = Path(texto)
    p = Path(os.path.abspath(p))
    if precisa_existir and not p.exists():
        raise ErroApi(404, "Esse item não existe mais.")
    return p


def dentro_da_casa(p: Path):
    try:
        p.resolve().relative_to(CASA.resolve())
        return True
    except ValueError:
        return False


def exigir_casa(p: Path):
    if not dentro_da_casa(p):
        raise ErroApi(403, "Só é possível alterar arquivos dentro da sua pasta pessoal.")


def categoria(p: Path):
    if p.is_dir():
        return "pasta"
    tipo = (mimetypes.guess_type(p.name)[0] or "")
    ext = p.suffix.lower()
    if tipo.startswith("image/"):
        return "imagem"
    if tipo.startswith("video/"):
        return "video"
    if tipo.startswith("audio/"):
        return "audio"
    if ext in {".zip", ".tar", ".gz", ".xz", ".zst", ".7z", ".rar"}:
        return "compactado"
    if tipo.startswith("text/") or ext in {".md", ".txt", ".json", ".conf", ".ini", ".sh", ".py", ".js", ".ts",
                                           ".tsx", ".css", ".html", ".log", ".yml", ".yaml", ".toml", ".csv"}:
        return "texto"
    if ext == ".pdf":
        return "pdf"
    return "arquivo"


def ler_config():
    cfg = dict(CONFIG_PADRAO)
    try:
        cfg.update(json.loads(CONFIG_ARQ.read_text()))
    except (OSError, ValueError):
        pass
    # Quem nunca escolheu papel de parede ganha o padrão novo (o mar), com a cor que combina.
    if not cfg.get("papel_definido") and cfg.get("papel") in ("alba", "aurora"):
        cfg["papel"] = "mar"
        if cfg.get("destaque") == "#5b6ee1":
            cfg["destaque"] = CONFIG_PADRAO["destaque"]
    if cfg.get("papel") not in PAPEIS:
        cfg["papel"] = "mar"
    return cfg


def gravar_config(novo):
    cfg = ler_config()
    for chave in CONFIG_PADRAO:
        if chave in novo:
            cfg[chave] = novo[chave]
    if cfg["tema"] not in ("claro", "escuro"):
        cfg["tema"] = "claro"
    if not re.fullmatch(r"#[0-9a-fA-F]{6}", str(cfg["destaque"])):
        cfg["destaque"] = CONFIG_PADRAO["destaque"]
    if cfg["teclado"] not in {t["id"] for t in TECLADOS}:
        cfg["teclado"] = "br"
    if cfg["papel"] not in PAPEIS or (cfg["papel"] == "personalizado" and not cfg.get("papel_arquivo")):
        cfg["papel"] = "mar"
    cfg["papel_arquivo"] = str(cfg.get("papel_arquivo") or "")[:1024]
    cfg["papel_definido"] = bool(cfg.get("papel_definido"))
    try:
        cfg["escala"] = float(cfg["escala"])
    except (TypeError, ValueError):
        cfg["escala"] = CONFIG_PADRAO["escala"]
    if cfg["escala"] not in ESCALAS:
        cfg["escala"] = CONFIG_PADRAO["escala"]
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_ARQ.write_text(json.dumps(cfg, indent=2, ensure_ascii=False))
    # A sessão lê este arquivo para ajustar o teclado no próximo login.
    (CONFIG_DIR / "teclado").write_text(cfg["teclado"] + "\n")
    return cfg


def preparar_pastas():
    for nome in PASTAS_PADRAO:
        try:
            (CASA / nome).mkdir(exist_ok=True)
        except OSError:
            pass


def os_release():
    dados = {}
    for arq in ("/etc/os-release", "/usr/lib/os-release"):
        try:
            for linha in Path(arq).read_text().splitlines():
                if "=" in linha:
                    k, v = linha.split("=", 1)
                    dados[k] = v.strip().strip('"')
            break
        except OSError:
            continue
    return dados


def memoria():
    info = {}
    try:
        for linha in Path("/proc/meminfo").read_text().splitlines():
            k, v = linha.split(":", 1)
            info[k] = int(v.split()[0]) * 1024
    except (OSError, ValueError):
        return 0, 0
    total = info.get("MemTotal", 0)
    return total, total - info.get("MemAvailable", total)


def cpu_modelo():
    try:
        for linha in Path("/proc/cpuinfo").read_text().splitlines():
            if linha.startswith("model name"):
                return re.sub(r"\s+", " ", linha.split(":", 1)[1]).strip()
    except OSError:
        pass
    return platform.processor() or "Processador"


# ----------------------------------------------------------------------------------------------
# Rotas da API


def api_sistema(_q, _c):
    usuario = pwd.getpwuid(os.getuid())
    nome = (usuario.pw_gecos or "").split(",")[0] or usuario.pw_name
    total, usada = memoria()
    disco = shutil.disk_usage(str(CASA))
    try:
        ligado = float(Path("/proc/uptime").read_text().split()[0])
    except (OSError, ValueError):
        ligado = 0
    rel = os_release()
    return {
        "usuario": usuario.pw_name,
        "nome": nome,
        "maquina": platform.node(),
        "sistema": rel.get("PRETTY_NAME", "Alba OS"),
        "versao": VERSAO,
        "kernel": platform.release(),
        "processador": cpu_modelo(),
        "nucleos": os.cpu_count() or 1,
        "memoria_total": total,
        "memoria_usada": usada,
        "disco_total": disco.total,
        "disco_usado": disco.used,
        "ligado_segundos": int(ligado),
        "live": bool(ARGS and ARGS.live),
        "casa": str(CASA),
    }


def api_locais(_q, _c):
    preparar_pastas()
    locais = [{"nome": "Início", "caminho": str(CASA), "icone": "home"}]
    icones = {"Documentos": "file", "Downloads": "download", "Imagens": "image", "Músicas": "music", "Vídeos": "video"}
    for nome in PASTAS_PADRAO:
        if (CASA / nome).is_dir():
            locais.append({"nome": nome, "caminho": str(CASA / nome), "icone": icones[nome]})
    locais.append({"nome": "Este computador", "caminho": "/", "icone": "monitor"})
    return {"locais": locais}


def api_arquivos(q, _c):
    pasta = caminho_seguro(q.get("caminho", "~"))
    if not pasta.is_dir():
        raise ErroApi(400, "Isso não é uma pasta.")
    ocultos = q.get("ocultos") == "1"
    itens = []
    try:
        entradas = list(os.scandir(pasta))
    except PermissionError:
        raise ErroApi(403, "Você não tem permissão para abrir esta pasta.")
    for e in entradas:
        if not ocultos and e.name.startswith("."):
            continue
        try:
            st = e.stat(follow_symlinks=True)
            p = Path(e.path)
            itens.append({
                "nome": e.name,
                "caminho": str(p),
                "tipo": "pasta" if e.is_dir(follow_symlinks=True) else "arquivo",
                "categoria": categoria(p),
                "tamanho": st.st_size,
                "modificado": int(st.st_mtime),
            })
        except OSError:
            continue
    itens.sort(key=lambda i: (i["tipo"] != "pasta", i["nome"].lower()))
    pai = str(pasta.parent) if pasta != pasta.parent else None
    return {"caminho": str(pasta), "pai": pai, "itens": itens, "gravavel": dentro_da_casa(pasta)}


def api_texto_ler(q, _c):
    p = caminho_seguro(q.get("caminho", ""))
    if not p.is_file():
        raise ErroApi(400, "Isso não é um arquivo.")
    if p.stat().st_size > LIMITE_TEXTO:
        raise ErroApi(413, "Arquivo grande demais para abrir no Notas (limite de 2 MB).")
    return {"caminho": str(p), "conteudo": p.read_bytes().decode("utf-8", errors="replace"),
            "gravavel": dentro_da_casa(p)}


def api_texto_gravar(_q, c):
    p = caminho_seguro(c.get("caminho", ""), precisa_existir=False)
    exigir_casa(p.parent)
    conteudo = c.get("conteudo", "")
    if len(conteudo.encode("utf-8")) > LIMITE_TEXTO:
        raise ErroApi(413, "Texto grande demais (limite de 2 MB).")
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(conteudo, encoding="utf-8")
    return {"ok": True, "caminho": str(p)}


def nome_valido(nome):
    nome = (nome or "").strip()
    if not nome or "/" in nome or nome in (".", ".."):
        raise ErroApi(400, "Esse nome não é válido.")
    return nome


def api_pasta_nova(_q, c):
    pai = caminho_seguro(c.get("pai", "~"))
    exigir_casa(pai)
    destino = pai / nome_valido(c.get("nome"))
    if destino.exists():
        raise ErroApi(409, "Já existe um item com esse nome.")
    destino.mkdir()
    return {"ok": True, "caminho": str(destino)}


def api_renomear(_q, c):
    origem = caminho_seguro(c.get("caminho", ""))
    exigir_casa(origem)
    destino = origem.parent / nome_valido(c.get("nome"))
    if destino.exists():
        raise ErroApi(409, "Já existe um item com esse nome.")
    origem.rename(destino)
    return {"ok": True, "caminho": str(destino)}


def api_lixeira_mover(_q, c):
    origem = caminho_seguro(c.get("caminho", ""))
    exigir_casa(origem)
    if origem == CASA:
        raise ErroApi(400, "A pasta pessoal não pode ir para a lixeira.")
    arquivos = LIXEIRA / "files"
    infos = LIXEIRA / "info"
    arquivos.mkdir(parents=True, exist_ok=True)
    infos.mkdir(parents=True, exist_ok=True)
    nome = origem.name
    n = 1
    while (arquivos / nome).exists() or (infos / f"{nome}.trashinfo").exists():
        n += 1
        nome = f"{origem.stem} ({n}){origem.suffix}"
    (infos / f"{nome}.trashinfo").write_text(
        "[Trash Info]\nPath={}\nDeletionDate={}\n".format(
            urllib.parse.quote(str(origem)), dt.datetime.now().strftime("%Y-%m-%dT%H:%M:%S")))
    shutil.move(str(origem), str(arquivos / nome))
    return {"ok": True}


def api_lixeira_listar(_q, _c):
    pasta = LIXEIRA / "files"
    itens = []
    if pasta.is_dir():
        for e in sorted(pasta.iterdir(), key=lambda x: x.name.lower()):
            original = ""
            try:
                for linha in (LIXEIRA / "info" / f"{e.name}.trashinfo").read_text().splitlines():
                    if linha.startswith("Path="):
                        original = urllib.parse.unquote(linha[5:])
            except OSError:
                pass
            itens.append({"nome": e.name, "caminho": str(e), "original": original,
                          "tipo": "pasta" if e.is_dir() else "arquivo", "categoria": categoria(e)})
    return {"itens": itens}


def api_lixeira_restaurar(_q, c):
    item = caminho_seguro(c.get("caminho", ""))
    if item.parent != LIXEIRA / "files":
        raise ErroApi(400, "Esse item não está na lixeira.")
    info = LIXEIRA / "info" / f"{item.name}.trashinfo"
    destino = None
    try:
        for linha in info.read_text().splitlines():
            if linha.startswith("Path="):
                destino = Path(urllib.parse.unquote(linha[5:]))
    except OSError:
        pass
    if destino is None or not dentro_da_casa(destino.parent if destino.parent.exists() else CASA):
        destino = CASA / item.name
    if destino.exists():
        destino = destino.with_name(destino.stem + " (restaurado)" + destino.suffix)
    destino.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(item), str(destino))
    info.unlink(missing_ok=True)
    return {"ok": True, "caminho": str(destino)}


def api_lixeira_esvaziar(_q, _c):
    for sub in ("files", "info"):
        pasta = LIXEIRA / sub
        if pasta.is_dir():
            for e in pasta.iterdir():
                if e.is_dir() and not e.is_symlink():
                    shutil.rmtree(e, ignore_errors=True)
                else:
                    e.unlink(missing_ok=True)
    return {"ok": True}


def api_autenticar(_q, c):
    if pam is None:
        raise ErroApi(500, "O sistema de senhas não está disponível.")
    usuario = pwd.getpwuid(os.getuid()).pw_name
    if ARGS and ARGS.live:
        return {"ok": True}
    return {"ok": bool(pam.autenticar(usuario, c.get("senha", "")))}


def api_config_ler(_q, _c):
    return {"config": ler_config(), "teclados": TECLADOS}


def api_config_gravar(_q, c):
    cfg = gravar_config(c)
    publicar_de_fora({"tipo": "config", "config": cfg})
    return {"config": cfg}


def api_recarregar(_q, c):
    """Fecha a interface para a sessão abrir de novo (escala nova; ou, com "sessao", depois de atualizar)."""
    caminho = CASA / ".cache" / "alba" / "recarregar"
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_text("sessao" if c.get("sessao") else "1")
    return {"ok": True}


# ---------------------------------------------------------------- atualizações
REPO_ATUALIZACOES = "paulocmarinho/alba-os"
COMPILACAO = Path(__file__).resolve().parent.parent / "compilacao.json"


def compilacao_atual():
    try:
        return json.loads(COMPILACAO.read_text("utf-8"))
    except (OSError, ValueError):
        return {"versao": VERSAO, "commit": "", "data": 0}


def _baixar_json(url):
    import urllib.request
    pedido = urllib.request.Request(url, headers={"User-Agent": f"AlbaOS/{VERSAO}", "Accept": "application/vnd.github+json"})
    with urllib.request.urlopen(pedido, timeout=12) as r:
        return json.loads(r.read().decode("utf-8"))


def api_atualizacao_ver(_q, _c):
    atual = compilacao_atual()
    if ARGS and ARGS.live:
        return {"atual": atual, "nova": None, "disponivel": False, "live": True}
    try:
        lancamento = _baixar_json(f"https://api.github.com/repos/{REPO_ATUALIZACOES}/releases/latest")
        ativo = next((a for a in lancamento.get("assets", []) if a.get("name") == "compilacao.json"), None)
        if ativo is None:
            return {"atual": atual, "nova": None, "disponivel": False, "live": False}
        nova = _baixar_json(ativo["browser_download_url"])
    except Exception:  # noqa: BLE001
        return {"atual": atual, "nova": None, "disponivel": False, "live": False,
                "erro": "Não consegui procurar atualizações. Confira a internet."}
    disponivel = int(nova.get("data") or 0) > int(atual.get("data") or 0) and nova.get("commit") != atual.get("commit")
    return {"atual": atual, "nova": nova, "disponivel": disponivel, "live": False}


def api_atualizacao_instalar(_q, _c):
    if ARGS and ARGS.live:
        raise ErroApi(409, "A sessão de instalação não se atualiza.")
    cmd = ["/usr/local/bin/alba-atualizar"]
    if os.getuid() != 0:
        cmd = ["sudo", "-n", *cmd]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=3600)
    except subprocess.TimeoutExpired as e:
        raise ErroApi(500, "A atualização demorou demais.") from e
    saida = (r.stdout + r.stderr).strip()
    if r.returncode != 0:
        ultima = saida.splitlines()[-1] if saida else "A atualização falhou."
        raise ErroApi(500, ultima.replace("ERRO: ", ""))
    return {"ok": True, "saida": saida, "atual": compilacao_atual()}


def api_som_ler(_q, _c):
    cod, saida, _ = rodar("wpctl", "get-volume", "@DEFAULT_AUDIO_SINK@")
    if cod != 0:
        return {"disponivel": False, "volume": 0, "mudo": False, "placa": False}
    m = re.search(r"([\d.]+)", saida)
    # Sem placa de som (ex.: Hyper-V) o PipeWire cria uma saída "falsa" (auto_null): o volume
    # muda, mas não sai som nenhum. A interface avisa em vez de fingir que funciona.
    _c2, info, _ = rodar("wpctl", "inspect", "@DEFAULT_AUDIO_SINK@")
    placa = "auto_null" not in info and "Dummy" not in info
    return {"disponivel": True, "volume": round(float(m.group(1)) * 100) if m else 0, "mudo": "MUTED" in saida,
            "placa": placa}


_ULTIMO_BIP = [0.0]


def tocar_bip():
    """Som curto de confirmação ao mudar o volume (como no macOS)."""
    import time
    agora = time.monotonic()
    if agora - _ULTIMO_BIP[0] < 0.25:
        return
    _ULTIMO_BIP[0] = agora
    arquivo = os.path.join(ARGS.web, "sons", "volume.wav")
    tocador = shutil.which("pw-play")
    if tocador and os.path.exists(arquivo):
        subprocess.Popen([tocador, arquivo], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)


def api_som_gravar(_q, c):
    if "volume" in c:
        v = max(0, min(100, int(c["volume"])))
        rodar("wpctl", "set-volume", "@DEFAULT_AUDIO_SINK@", f"{v / 100:.2f}")
        if c.get("bip"):
            tocar_bip()
    if "mudo" in c:
        rodar("wpctl", "set-mute", "@DEFAULT_AUDIO_SINK@", "1" if c["mudo"] else "0")
    return api_som_ler({}, {})


def api_rede(_q, _c):
    conexoes = []
    cod, saida, _ = rodar("nmcli", "-t", "-f", "DEVICE,TYPE,STATE,CONNECTION", "device")
    if cod == 0:
        for linha in saida.splitlines():
            partes = re.split(r"(?<!\\):", linha)
            if len(partes) < 4 or partes[1] in ("loopback", "bridge", "tun", "wifi-p2p"):
                continue
            conexoes.append({"dispositivo": partes[0], "tipo": partes[1], "estado": partes[2],
                             "nome": partes[3].replace("\\:", ":")})
    ips = []
    cod, saida, _ = rodar("ip", "-4", "-o", "addr", "show", "scope", "global")
    if cod == 0:
        ips = [m.group(1) for m in re.finditer(r"inet ([\d.]+)", saida)]
    online = any(c["estado"].startswith("connected") or c["estado"].startswith("conectado") for c in conexoes) or bool(ips)
    return {"online": online, "conexoes": conexoes, "ips": ips}


def api_energia(_q, c):
    acao = c.get("acao")
    if acao not in ("desligar", "reiniciar"):
        raise ErroApi(400, "Ação desconhecida.")
    cod, _, erro = rodar("systemctl", "poweroff" if acao == "desligar" else "reboot")
    if cod != 0:
        raise ErroApi(500, "Não foi possível: " + erro.strip())
    return {"ok": True}


def api_discos(_q, _c):
    if not (ARGS and ARGS.live):
        raise ErroApi(403, "Disponível só na sessão de instalação.")
    cod, saida, erro = rodar("lsblk", "-J", "-b", "-d", "-o", "NAME,SIZE,MODEL,TYPE,RM,RO,TRAN")
    if cod != 0:
        raise ErroApi(500, "Não consegui listar os discos: " + erro.strip())
    discos = []
    for d in json.loads(saida).get("blockdevices", []):
        if d.get("type") != "disk" or d.get("ro") in (True, "1") or str(d.get("name", "")).startswith(("loop", "sr", "zram")):
            continue
        tamanho = int(d.get("size") or 0)
        if tamanho < 8 * 1024 ** 3:
            continue
        discos.append({"caminho": "/dev/" + d["name"], "tamanho": tamanho,
                       "modelo": (d.get("model") or "Disco").strip(), "removivel": d.get("rm") in (True, "1")})
    return {"discos": discos}


def api_fusos(_q, _c):
    fusos = []
    tab = Path("/usr/share/zoneinfo/zone1970.tab")
    try:
        for linha in tab.read_text().splitlines():
            if linha and not linha.startswith("#"):
                fusos.append(linha.split("\t")[2])
    except (OSError, IndexError):
        fusos = ["America/Sao_Paulo"]
    return {"fusos": sorted(set(fusos)), "padrao": "America/Sao_Paulo", "teclados": TECLADOS}


# ---------------------------------------------------------------- música (Sleeve)
def api_musica_biblioteca(_q, _c):
    return musica.biblioteca()


def api_musica_ler(_q, _c):
    return musica.biblioteca(reler=True)


def api_musica_estado(_q, _c):
    return musica.estado_leitura()


def api_musica_pastas(_q, c):
    cfg = musica.ler_config()
    acao = c.get("acao")
    if acao == "add":
        p = caminho_seguro(str(c.get("caminho", "")))
        if not p.is_dir():
            raise ErroApi(400, "Essa pasta não existe.")
        if str(p) not in cfg["pastas"]:
            cfg["pastas"].append(str(p))
    elif acao == "remove":
        cfg["pastas"] = [x for x in cfg["pastas"] if x != c.get("caminho")]
    musica.gravar_config(cfg)
    return musica.biblioteca()


def api_musica_abrir(_q, c):
    return {"tracks": musica.faixas_abertas([str(x) for x in c.get("caminhos", [])][:500])}


def api_musica_spotify(_q, _c):
    return {"info": musica.spotify()}


def api_musica_spotify_acao(_q, c):
    return {"ok": musica.spotify_acao(str(c.get("acao", "")), c.get("posicao"), c.get("volume"))}


def api_musica_config(_q, c):
    cfg = musica.ler_config()
    if "pinned" in c:
        cfg["pinned"] = bool(c["pinned"])
    musica.gravar_config(cfg)
    return {"pinned": cfg["pinned"]}


def faixa_de_audio(req):
    """Áudio com suporte a Range, para o player poder pular para qualquer ponto da música."""
    p = Path(req.query.get("caminho", ""))
    if not musica.permitido(p):
        raise ErroApi(403, "Esse arquivo não pode ser tocado.")
    total = p.stat().st_size
    tipo = musica.tipo_audio(p)
    faixa = req.cabecalhos.get("range", "")
    extras = ["Accept-Ranges: bytes"]
    if faixa.startswith("bytes="):
        inicio_txt, _, fim_txt = faixa[6:].split(",")[0].partition("-")
        if inicio_txt:
            inicio = int(inicio_txt)
            fim = int(fim_txt) if fim_txt else total - 1
        else:
            inicio = max(0, total - int(fim_txt or 0))
            fim = total - 1
        fim = min(fim, total - 1, inicio + 8 * 1024 * 1024 - 1)
        if inicio >= total or inicio > fim:
            return resposta(416, b"", tipo, [f"Content-Range: bytes */{total}"])
        with open(p, "rb") as f:
            f.seek(inicio)
            dados = f.read(fim - inicio + 1)
        return resposta(206, dados, tipo, extras + [f"Content-Range: bytes {inicio}-{fim}/{total}"])
    if total > LIMITE_ARQUIVO * 4:
        raise ErroApi(413, "Arquivo grande demais.")
    return resposta(200, p.read_bytes(), tipo, extras)


def capa_de_album(req):
    p = musica.caminho_capa(req.query.get("id", ""))
    if p is None:
        raise ErroApi(404, "Sem capa.")
    dados = p.read_bytes()
    return resposta(200, dados, musica.tipo_imagem(dados))


# ---------------------------------------------------------------- Alba Store
def _loja(func):
    def rota(q, c):
        try:
            return func(q, c)
        except loja.ErroLoja as e:
            raise ErroApi(502, str(e)) from e
    return rota


ROTAS_LOJA = {
    ("GET", "/api/loja/vitrine"): _loja(lambda q, c: loja.vitrine()),
    ("GET", "/api/loja/buscar"): _loja(lambda q, c: {"apps": loja.buscar(q.get("q", ""))}),
    ("GET", "/api/loja/app"): _loja(lambda q, c: loja.detalhes(q.get("id", ""))),
    ("GET", "/api/loja/instalados"): _loja(lambda q, c: {"apps": loja.instalados(), "tarefas": loja.tarefas()}),
    ("GET", "/api/loja/atualizacoes"): _loja(lambda q, c: {"apps": loja.atualizacoes()}),
    ("GET", "/api/loja/tarefas"): _loja(lambda q, c: loja.tarefas()),
    ("POST", "/api/loja/instalar"): _loja(lambda q, c: loja.instalar(str(c.get("id", "")), str(c.get("nome", "")))),
    ("POST", "/api/loja/remover"): _loja(lambda q, c: loja.remover(str(c.get("id", "")), str(c.get("nome", "")))),
    ("POST", "/api/loja/atualizar"): _loja(lambda q, c: loja.atualizar_tudo()),
}

ROTAS = {
    **ROTAS_LOJA,
    ("GET", "/api/sistema"): api_sistema,
    ("GET", "/api/locais"): api_locais,
    ("GET", "/api/arquivos"): api_arquivos,
    ("GET", "/api/texto"): api_texto_ler,
    ("POST", "/api/texto"): api_texto_gravar,
    ("POST", "/api/pasta"): api_pasta_nova,
    ("POST", "/api/renomear"): api_renomear,
    ("POST", "/api/lixeira"): api_lixeira_mover,
    ("GET", "/api/lixeira"): api_lixeira_listar,
    ("POST", "/api/lixeira/restaurar"): api_lixeira_restaurar,
    ("POST", "/api/lixeira/esvaziar"): api_lixeira_esvaziar,
    ("POST", "/api/autenticar"): api_autenticar,
    ("GET", "/api/config"): api_config_ler,
    ("POST", "/api/config"): api_config_gravar,
    ("POST", "/api/recarregar"): api_recarregar,
    ("POST", "/api/evento"): lambda q, c: api_evento(q, c),
    ("GET", "/api/atualizacao"): api_atualizacao_ver,
    ("POST", "/api/atualizacao"): api_atualizacao_instalar,
    ("GET", "/api/musica/biblioteca"): api_musica_biblioteca,
    ("POST", "/api/musica/ler"): api_musica_ler,
    ("GET", "/api/musica/estado"): api_musica_estado,
    ("POST", "/api/musica/pastas"): api_musica_pastas,
    ("POST", "/api/musica/abrir"): api_musica_abrir,
    ("GET", "/api/musica/spotify"): api_musica_spotify,
    ("POST", "/api/musica/spotify"): api_musica_spotify_acao,
    ("POST", "/api/musica/config"): api_musica_config,
    ("GET", "/api/som"): api_som_ler,
    ("POST", "/api/som"): api_som_gravar,
    ("GET", "/api/rede"): api_rede,
    ("POST", "/api/energia"): api_energia,
    ("GET", "/api/discos"): api_discos,
    ("GET", "/api/fusos"): api_fusos,
}


# ----------------------------------------------------------------------------------------------
# HTTP e WebSocket mínimos


class Requisicao:
    def __init__(self, metodo, alvo, cabecalhos, corpo):
        self.metodo = metodo
        url = urllib.parse.urlsplit(alvo)
        self.caminho = urllib.parse.unquote(url.path)
        self.query = {k: v[-1] for k, v in urllib.parse.parse_qs(url.query, keep_blank_values=True).items()}
        self.cabecalhos = cabecalhos
        self.corpo = corpo

    def cookie(self, nome):
        for parte in self.cabecalhos.get("cookie", "").split(";"):
            if "=" in parte:
                k, v = parte.strip().split("=", 1)
                if k == nome:
                    return v
        return None

    def autorizada(self):
        return ARGS.token in (self.cookie("alba"), self.cabecalhos.get("x-alba-token"))


async def ler_requisicao(leitor):
    linha = await leitor.readline()
    if not linha:
        return None
    try:
        metodo, alvo, _ = linha.decode("latin-1").strip().split(" ", 2)
    except ValueError:
        return None
    cabecalhos = {}
    while True:
        l = await leitor.readline()
        if l in (b"\r\n", b"\n", b""):
            break
        k, _, v = l.decode("latin-1").partition(":")
        cabecalhos[k.strip().lower()] = v.strip()
    tamanho = int(cabecalhos.get("content-length", "0") or 0)
    if tamanho > LIMITE_TEXTO * 2:
        raise ErroApi(413, "Requisição grande demais.")
    corpo = await leitor.readexactly(tamanho) if tamanho else b""
    return Requisicao(metodo, alvo, cabecalhos, corpo)


def resposta(status, corpo=b"", tipo="application/json; charset=utf-8", extras=None):
    cab = [f"HTTP/1.1 {status} {STATUS.get(status, 'OK')}", f"Content-Type: {tipo}",
           f"Content-Length: {len(corpo)}", "Cache-Control: no-store", "X-Content-Type-Options: nosniff",
           "Connection: keep-alive"]
    cab += extras or []
    return ("\r\n".join(cab) + "\r\n\r\n").encode("latin-1") + corpo


def json_resp(status, dados, extras=None):
    return resposta(status, json.dumps(dados, ensure_ascii=False).encode("utf-8"), extras=extras)


def arquivo_estatico(req):
    raiz = Path(ARGS.web).resolve()
    rel = req.caminho.lstrip("/") or "index.html"
    alvo = (raiz / rel).resolve()
    try:
        alvo.relative_to(raiz)
    except ValueError:
        return json_resp(403, {"erro": "Proibido."})
    if not alvo.is_file():
        alvo = raiz / "index.html"
    tipo = mimetypes.guess_type(alvo.name)[0] or "application/octet-stream"
    if tipo.startswith("text/") or tipo in ("application/javascript",):
        tipo += "; charset=utf-8"
    extras = []
    if req.query.get("t") == ARGS.token:
        extras.append(f"Set-Cookie: alba={ARGS.token}; Path=/; HttpOnly; SameSite=Strict")
    return resposta(200, alvo.read_bytes(), tipo, extras)


def arquivo_bruto(req):
    p = caminho_seguro(req.query.get("caminho", ""))
    if not p.is_file():
        raise ErroApi(400, "Isso não é um arquivo.")
    if p.stat().st_size > LIMITE_ARQUIVO:
        raise ErroApi(413, "Arquivo grande demais para visualizar.")
    tipo = mimetypes.guess_type(p.name)[0] or "application/octet-stream"
    return resposta(200, p.read_bytes(), tipo)


class WebSocket:
    def __init__(self, leitor, escritor):
        self.leitor = leitor
        self.escritor = escritor
        self.aberto = True

    @staticmethod
    def aceitar(req):
        chave = req.cabecalhos.get("sec-websocket-key", "")
        aceite = base64.b64encode(hashlib.sha1((chave + WS_GUID).encode()).digest()).decode()
        return ("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                f"Sec-WebSocket-Accept: {aceite}\r\n\r\n").encode()

    async def receber(self):
        """Devolve o texto da próxima mensagem, ou None quando fechar."""
        partes = []
        while True:
            try:
                b1, b2 = await self.leitor.readexactly(2)
            except (asyncio.IncompleteReadError, ConnectionError):
                self.aberto = False
                return None
            fim, opcode = b1 & 0x80, b1 & 0x0F
            tamanho = b2 & 0x7F
            if tamanho == 126:
                tamanho = struct.unpack("!H", await self.leitor.readexactly(2))[0]
            elif tamanho == 127:
                tamanho = struct.unpack("!Q", await self.leitor.readexactly(8))[0]
            mascara = await self.leitor.readexactly(4) if b2 & 0x80 else b"\0\0\0\0"
            dados = bytearray(await self.leitor.readexactly(tamanho))
            for i in range(len(dados)):
                dados[i] ^= mascara[i % 4]
            if opcode == 0x8:
                await self.fechar()
                return None
            if opcode == 0x9:
                await self._enviar(0xA, bytes(dados))
                continue
            if opcode in (0x1, 0x2, 0x0):
                partes.append(bytes(dados))
                if fim:
                    return b"".join(partes).decode("utf-8", errors="replace")

    async def _enviar(self, opcode, dados: bytes):
        if not self.aberto:
            return
        cab = bytearray([0x80 | opcode])
        n = len(dados)
        if n < 126:
            cab.append(n)
        elif n < 65536:
            cab.append(126)
            cab += struct.pack("!H", n)
        else:
            cab.append(127)
            cab += struct.pack("!Q", n)
        try:
            self.escritor.write(bytes(cab) + dados)
            await self.escritor.drain()
        except ConnectionError:
            self.aberto = False

    async def enviar(self, texto: str):
        await self._enviar(0x1, texto.encode("utf-8"))

    async def fechar(self):
        if self.aberto:
            await self._enviar(0x8, b"")
            self.aberto = False


async def ws_terminal(ws: WebSocket):
    pid, fd = pty.fork()
    if pid == 0:
        os.chdir(str(CASA))
        env = dict(os.environ, TERM="xterm-256color", COLORTERM="truecolor", LANG=os.environ.get("LANG", "pt_BR.UTF-8"))
        shell = pwd.getpwuid(os.getuid()).pw_shell or "/bin/bash"
        os.execvpe(shell, [shell, "-l"], env)
    loop = asyncio.get_running_loop()
    fila = asyncio.Queue()

    def ao_ler():
        try:
            dados = os.read(fd, 65536)
        except OSError:
            dados = b""
        fila.put_nowait(dados)

    loop.add_reader(fd, ao_ler)

    async def saida():
        decodificador = __import__("codecs").getincrementaldecoder("utf-8")(errors="replace")
        while True:
            dados = await fila.get()
            if not dados:
                await ws.enviar(json.dumps({"tipo": "fim"}))
                await ws.fechar()
                return
            await ws.enviar(json.dumps({"tipo": "saida", "dados": decodificador.decode(dados)}))

    tarefa = asyncio.create_task(saida())
    try:
        while True:
            texto = await ws.receber()
            if texto is None:
                break
            try:
                msg = json.loads(texto)
            except ValueError:
                continue
            if msg.get("tipo") == "entrada":
                os.write(fd, msg.get("dados", "").encode("utf-8"))
            elif msg.get("tipo") == "tamanho":
                linhas, colunas = int(msg.get("linhas", 24)), int(msg.get("colunas", 80))
                fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", linhas, colunas, 0, 0))
    finally:
        loop.remove_reader(fd)
        tarefa.cancel()
        try:
            os.kill(pid, signal.SIGHUP)
        except ProcessLookupError:
            pass
        try:
            os.close(fd)
        except OSError:
            pass
        try:
            os.waitpid(pid, os.WNOHANG)
        except ChildProcessError:
            pass


async def ws_instalar(ws: WebSocket):
    if not (ARGS and ARGS.live):
        await ws.enviar(json.dumps({"tipo": "erro", "mensagem": "Disponível só na sessão de instalação."}))
        return await ws.fechar()
    texto = await ws.receber()
    if texto is None:
        return
    script = ARGS.instalador
    cmd = ["sudo", "-n", script] if os.getuid() != 0 else [script]
    proc = await asyncio.create_subprocess_exec(*cmd, stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
                                                stderr=asyncio.subprocess.STDOUT)
    proc.stdin.write(texto.encode("utf-8"))
    await proc.stdin.drain()
    proc.stdin.close()
    while True:
        linha = await proc.stdout.readline()
        if not linha:
            break
        await ws.enviar(json.dumps({"tipo": "linha", "texto": linha.decode("utf-8", errors="replace").rstrip()}))
    codigo = await proc.wait()
    await ws.enviar(json.dumps({"tipo": "fim", "codigo": codigo}))
    await ws.fechar()


# ---------------------------------------------------------------- eventos entre as partes do Alba
# A barra, o dock, os painéis e cada app são páginas separadas. Elas conversam por aqui:
# quem publica um evento (config mudou, música tocando, abrir algo…) faz todos os outros receberem.
OUVINTES: set = set()
LACO = None


async def publicar(evento: dict, origem=None):
    texto = json.dumps(evento, ensure_ascii=False)
    for ouvinte in list(OUVINTES):
        if ouvinte is not origem and ouvinte.aberto:
            await ouvinte.enviar(texto)


def publicar_de_fora(evento: dict):
    """Publica a partir de uma rota comum (que roda numa thread)."""
    if LACO is not None:
        asyncio.run_coroutine_threadsafe(publicar(evento), LACO)


async def ws_eventos(ws: WebSocket):
    OUVINTES.add(ws)
    try:
        while (texto := await ws.receber()) is not None:
            try:
                evento = json.loads(texto)
            except ValueError:
                continue
            if isinstance(evento, dict):
                await publicar(evento, origem=ws)
    finally:
        OUVINTES.discard(ws)


def api_evento(_q, c):
    publicar_de_fora(c if isinstance(c, dict) else {})
    return {"ok": True}


WEBSOCKETS = {"/ws/terminal": ws_terminal, "/ws/instalar": ws_instalar, "/ws/eventos": ws_eventos}


async def atender(leitor, escritor):
    try:
        while True:
            try:
                req = await ler_requisicao(leitor)
            except ErroApi as e:
                escritor.write(json_resp(e.status, {"erro": e.mensagem}))
                await escritor.drain()
                break
            if req is None:
                break
            if req.caminho in WEBSOCKETS:
                if not req.autorizada():
                    escritor.write(json_resp(401, {"erro": "Sessão inválida."}))
                    await escritor.drain()
                    break
                escritor.write(WebSocket.aceitar(req))
                await escritor.drain()
                await WEBSOCKETS[req.caminho](WebSocket(leitor, escritor))
                break
            if req.caminho.startswith("/api/"):
                if not req.autorizada():
                    dados = json_resp(401, {"erro": "Sessão inválida."})
                else:
                    try:
                        if req.caminho == "/api/arquivo" and req.metodo == "GET":
                            dados = arquivo_bruto(req)
                        elif req.caminho == "/api/musica/audio" and req.metodo == "GET":
                            dados = await asyncio.get_running_loop().run_in_executor(None, faixa_de_audio, req)
                        elif req.caminho == "/api/musica/capa" and req.metodo == "GET":
                            dados = capa_de_album(req)
                        else:
                            func = ROTAS.get((req.metodo, req.caminho))
                            if func is None:
                                raise ErroApi(404, "Rota desconhecida.")
                            corpo = json.loads(req.corpo.decode("utf-8") or "{}") if req.corpo else {}
                            resultado = await asyncio.get_running_loop().run_in_executor(None, func, req.query, corpo)
                            dados = json_resp(200, resultado)
                    except ErroApi as e:
                        dados = json_resp(e.status, {"erro": e.mensagem})
                    except PermissionError:
                        dados = json_resp(403, {"erro": "Sem permissão para isso."})
                    except (OSError, ValueError) as e:
                        dados = json_resp(500, {"erro": str(e)})
            else:
                dados = arquivo_estatico(req)
            escritor.write(dados)
            await escritor.drain()
    except (ConnectionError, asyncio.IncompleteReadError):
        pass
    finally:
        try:
            escritor.close()
        except Exception:  # noqa: BLE001
            pass


async def principal():
    global LACO
    LACO = asyncio.get_running_loop()
    preparar_pastas()
    servidor = await asyncio.start_server(atender, "127.0.0.1", ARGS.porta)
    print(f"Alba: servidor em http://127.0.0.1:{ARGS.porta}", flush=True)
    async with servidor:
        await servidor.serve_forever()


def main():
    global ARGS
    p = argparse.ArgumentParser(description="Servidor do sistema Alba")
    p.add_argument("--porta", type=int, default=7070)
    p.add_argument("--token", required=True)
    p.add_argument("--web", default="/usr/share/alba/web")
    p.add_argument("--live", action="store_true", help="sessão ao vivo (instalação)")
    p.add_argument("--instalador", default="/usr/share/alba/sistema/instalar.sh")
    ARGS = p.parse_args()
    loja.configurar(publicar_de_fora)
    mimetypes.add_type("application/javascript", ".js")
    mimetypes.add_type("text/css", ".css")
    mimetypes.add_type("font/ttf", ".ttf")
    try:
        asyncio.run(principal())
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
