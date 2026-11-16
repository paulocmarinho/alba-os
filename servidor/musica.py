"""Biblioteca de música do Alba, usada pelo Sleeve (o player de música do sistema).

Lê as pastas de música, as tags (com o mutagen, se estiver instalado) e as capas
(de dentro do arquivo ou da pasta do álbum), e entrega tudo no formato que a
interface do Sleeve espera (veja apps/sleeve/bridge.js).
O Spotify, quando estiver aberto, é lido e controlado pelo MPRIS (playerctl).
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import shutil
import subprocess
import threading
import time
import urllib.parse
from pathlib import Path

try:  # o mutagen vem no Alba OS; sem ele, títulos saem do nome do arquivo
    import mutagen
    from mutagen.flac import Picture
except ImportError:  # pragma: no cover
    mutagen = None
    Picture = None

EXTENSOES = {".mp3", ".flac", ".m4a", ".aac", ".mp4", ".ogg", ".oga", ".opus", ".wav"}
TIPOS = {
    ".mp3": "audio/mpeg", ".flac": "audio/flac", ".m4a": "audio/mp4", ".aac": "audio/aac", ".mp4": "audio/mp4",
    ".ogg": "audio/ogg", ".oga": "audio/ogg", ".opus": "audio/ogg", ".wav": "audio/wav",
}
CAPAS_PASTA = ("cover", "folder", "front", "album", "capa", "albumart")
VERSAO_CACHE = 2
DISCO = re.compile(r"^(cd|dis[ck]o?|disc)\s*\d+$", re.IGNORECASE)

CASA = Path.home()
CONFIG = CASA / ".config" / "alba" / "sleeve.json"
CACHE = CASA / ".cache" / "alba" / "sleeve"
CAPAS = CACHE / "capas"
_trava = threading.Lock()
_estado = {"lendo": False, "contagem": 0}


# ---------------------------------------------------------------- configuração
def _pasta_padrao() -> str:
    for nome in ("Músicas", "Music", "Musicas"):
        if (CASA / nome).is_dir():
            return str(CASA / nome)
    return str(CASA / "Músicas")


def ler_config() -> dict:
    cfg = {"pastas": [_pasta_padrao()], "pinned": False}
    try:
        cfg.update(json.loads(CONFIG.read_text("utf-8")))
    except (OSError, ValueError):
        pass
    cfg["pastas"] = [p for p in dict.fromkeys(cfg.get("pastas") or []) if isinstance(p, str)]
    return cfg


def gravar_config(cfg: dict) -> None:
    CONFIG.parent.mkdir(parents=True, exist_ok=True)
    CONFIG.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), "utf-8")


def pastas() -> list[Path]:
    return [Path(p) for p in ler_config()["pastas"]]


def permitido(caminho: Path) -> bool:
    """Só toca arquivos de áudio dentro das pastas da biblioteca, da pasta pessoal ou de mídias montadas."""
    try:
        real = caminho.resolve()
    except OSError:
        return False
    if real.suffix.lower() not in EXTENSOES or not real.is_file():
        return False
    raizes = [*pastas(), CASA, Path("/run/media"), Path("/media"), Path("/mnt")]
    for raiz in raizes:
        try:
            real.relative_to(raiz.resolve())
            return True
        except (ValueError, OSError):
            continue
    return False


# ---------------------------------------------------------------- tags e capas
def _primeiro(tags, *chaves):
    if not tags:
        return ""
    for k in chaves:
        try:
            v = tags.get(k)
        except Exception:  # noqa: BLE001
            v = None
        if v:
            v = v[0] if isinstance(v, list) else v
            return str(v).strip()
    return ""


def _numero(texto: str) -> int:
    try:
        return int(str(texto).split("/")[0].strip() or 0)
    except ValueError:
        return 0


def _imagem_embutida(caminho: Path) -> bytes | None:
    if mutagen is None:
        return None
    try:
        f = mutagen.File(caminho)
    except Exception:  # noqa: BLE001
        return None
    if f is None:
        return None
    try:
        if getattr(f, "pictures", None):  # FLAC
            return f.pictures[0].data
        tags = f.tags
        if tags is None:
            return None
        if hasattr(tags, "getall"):  # MP3 (ID3)
            fotos = tags.getall("APIC")
            if fotos:
                frente = [p for p in fotos if getattr(p, "type", 0) == 3]
                return (frente or fotos)[0].data
        covr = tags.get("covr") if hasattr(tags, "get") else None  # M4A
        if covr:
            return bytes(covr[0])
        bloco = tags.get("metadata_block_picture") if hasattr(tags, "get") else None  # OGG/Opus
        if bloco and Picture is not None:
            return Picture(base64.b64decode(bloco[0])).data
    except Exception:  # noqa: BLE001
        return None
    return None


def _capa_da_pasta(pasta: Path) -> Path | None:
    try:
        imagens = [p for p in pasta.iterdir() if p.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp") and p.is_file()]
    except OSError:
        return None
    for nome in CAPAS_PASTA:
        for p in imagens:
            if p.stem.lower() == nome:
                return p
    return imagens[0] if len(imagens) == 1 else None


def ler_faixa(caminho: Path) -> dict:
    """Tags de uma faixa (com plano B pelo nome do arquivo e das pastas)."""
    info = {"titulo": "", "artista": "", "artista_album": "", "album": "", "numero": 0, "disco": 1, "ano": 0, "duracao": 0.0}
    if mutagen is not None:
        try:
            f = mutagen.File(caminho, easy=True)
        except Exception:  # noqa: BLE001
            f = None
        if f is not None:
            tags = f.tags
            info["titulo"] = _primeiro(tags, "title")
            info["artista"] = _primeiro(tags, "artist")
            info["artista_album"] = _primeiro(tags, "albumartist")
            info["album"] = _primeiro(tags, "album")
            info["numero"] = _numero(_primeiro(tags, "tracknumber"))
            info["disco"] = _numero(_primeiro(tags, "discnumber")) or 1
            info["ano"] = _numero(_primeiro(tags, "date", "originaldate")[:4])
            info["duracao"] = float(getattr(getattr(f, "info", None), "length", 0) or 0)
    nome = caminho.stem
    if not info["titulo"]:
        partes = nome.split(" - ", 1)
        if len(partes) == 2 and partes[0].strip().isdigit():
            info["numero"] = info["numero"] or int(partes[0])
            nome = partes[1]
        elif nome[:2].isdigit() and len(nome) > 3 and nome[2] in " ._-":
            info["numero"] = info["numero"] or int(nome[:2])
            nome = nome[3:]
        info["titulo"] = nome.strip()
    if not info["album"]:
        info["album"] = caminho.parent.name
    if not info["artista"]:
        info["artista"] = info["artista_album"] or caminho.parent.parent.name
    return info


def _id(texto: str) -> str:
    return hashlib.sha1(texto.encode("utf-8", "surrogateescape")).hexdigest()[:16]


def url_audio(caminho: Path) -> str:
    return "/api/musica/audio?caminho=" + urllib.parse.quote(str(caminho))


def _salvar_capa(id_album: str, dados: bytes | None, arquivo: Path | None) -> str | None:
    CAPAS.mkdir(parents=True, exist_ok=True)
    destino = CAPAS / id_album
    try:
        if dados:
            destino.write_bytes(dados)
        elif arquivo:
            shutil.copyfile(arquivo, destino)
        else:
            return None
    except OSError:
        return None
    return f"/api/musica/capa?id={id_album}&v={int(destino.stat().st_mtime)}"


# ---------------------------------------------------------------- biblioteca
def _ler_cache() -> dict:
    try:
        dados = json.loads((CACHE / "biblioteca.json").read_text("utf-8"))
        if dados.get("versao") == VERSAO_CACHE:
            return dados.get("faixas", {})
    except (OSError, ValueError):
        pass
    return {}


def _gravar_cache(faixas: dict) -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    tmp = CACHE / "biblioteca.json.tmp"
    tmp.write_text(json.dumps({"versao": VERSAO_CACHE, "faixas": faixas}, ensure_ascii=False), "utf-8")
    tmp.replace(CACHE / "biblioteca.json")


def _arquivos(raizes: list[Path]):
    vistos = set()
    for raiz in raizes:
        if not raiz.is_dir():
            continue
        for pasta, subpastas, nomes in os.walk(raiz, followlinks=False):
            subpastas[:] = [s for s in subpastas if not s.startswith(".")]
            for nome in nomes:
                p = Path(pasta) / nome
                if p.suffix.lower() in EXTENSOES and str(p) not in vistos:
                    vistos.add(str(p))
                    yield p


def biblioteca(reler: bool = False) -> dict:
    """Monta álbuns a partir das pastas. Usa o cache para só reler arquivos que mudaram."""
    with _trava:
        _estado.update(lendo=True, contagem=0)
        try:
            cfg = ler_config()
            raizes = [Path(p) for p in cfg["pastas"]]
            cache = {} if reler else _ler_cache()
            novo = {}
            for p in _arquivos(raizes):
                try:
                    st = p.stat()
                except OSError:
                    continue
                chave = str(p)
                velho = cache.get(chave)
                if velho and velho.get("mtime") == st.st_mtime and velho.get("tamanho") == st.st_size:
                    novo[chave] = velho
                else:
                    novo[chave] = {"mtime": st.st_mtime, "tamanho": st.st_size, **ler_faixa(p)}
                _estado["contagem"] += 1
            _gravar_cache(novo)

            albuns: dict[str, dict] = {}
            for caminho, f in novo.items():
                p = Path(caminho)
                # Um álbum = mesmo nome de álbum na mesma pasta (CD1/CD2 contam como a pasta de cima)
                pasta_album = p.parent.parent if DISCO.match(p.parent.name) else p.parent
                id_album = _id(f"{f['album'].lower()}|{pasta_album}")
                a = albuns.get(id_album)
                if a is None:
                    a = albuns[id_album] = {
                        "id": id_album, "title": f["album"], "artist": "", "year": f["ano"] or None,
                        "color": None, "added": 0, "cover": None, "tracks": [], "_pasta": p.parent, "_primeiro": p,
                        "_artistas": set(), "_artista_album": "",
                    }
                a["_artistas"].add(f["artista"])
                if f["artista_album"] and not a["_artista_album"]:
                    a["_artista_album"] = f["artista_album"]
                a["added"] = max(a["added"], int(f["mtime"]))
                if f["ano"] and not a["year"]:
                    a["year"] = f["ano"]
                if len(a.setdefault("_faixas", [])) < 3:  # capa embutida: olha as primeiras faixas
                    a["_faixas"].append(p)
                a["tracks"].append({
                    "id": _id(caminho), "title": f["titulo"], "artist": f["artista"], "number": f["numero"] or 0,
                    "disc": f["disco"] or 1, "duration": round(f["duracao"], 2), "url": url_audio(p),
                })

            lista = []
            for a in albuns.values():
                artistas = sorted(x for x in a["_artistas"] if x)
                a["artist"] = a["_artista_album"] or (artistas[0] if len(artistas) == 1 else "Vários artistas" if artistas else "")
                capa = CAPAS / a["id"]
                if capa.exists() and not reler:
                    a["cover"] = f"/api/musica/capa?id={a['id']}&v={int(capa.stat().st_mtime)}"
                else:
                    embutida = None
                    for caminho_faixa in a["_faixas"]:
                        embutida = _imagem_embutida(caminho_faixa)
                        if embutida:
                            break
                    a["cover"] = _salvar_capa(a["id"], embutida, _capa_da_pasta(a["_pasta"]))
                a["tracks"].sort(key=lambda t: (t["disc"], t["number"] or 999, t["title"].lower()))
                for k in ("_pasta", "_primeiro", "_artistas", "_artista_album", "_faixas"):
                    a.pop(k, None)
                lista.append(a)
            lista.sort(key=lambda a: -a["added"])
            return {"albums": lista, "folders": cfg["pastas"], "scanning": False}
        finally:
            _estado["lendo"] = False


def estado_leitura() -> dict:
    return dict(_estado)


def faixas_abertas(caminhos: list[str]) -> list[dict]:
    """Faixas abertas pelo sistema (duplo clique no Arquivos), mesmo fora da biblioteca."""
    saida = []
    for c in caminhos:
        p = Path(c)
        if not permitido(p):
            continue
        f = ler_faixa(p)
        id_avulso = _id("avulso|" + str(p))
        capa = _salvar_capa(id_avulso, _imagem_embutida(p), _capa_da_pasta(p.parent))
        saida.append({
            "id": _id(str(p)), "title": f["titulo"], "artist": f["artista"], "album": f["album"], "cover": capa,
            "color": None, "duration": round(f["duracao"], 2), "url": url_audio(p), "number": f["numero"] or 1,
        })
    return saida


def caminho_capa(id_album: str) -> Path | None:
    if not id_album.isalnum():
        return None
    p = CAPAS / id_album
    return p if p.is_file() else None


def tipo_audio(caminho: Path) -> str:
    return TIPOS.get(caminho.suffix.lower(), "application/octet-stream")


def tipo_imagem(dados: bytes) -> str:
    if dados[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if dados[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if dados[:4] == b"RIFF" and dados[8:12] == b"WEBP":
        return "image/webp"
    return "application/octet-stream"


# ---------------------------------------------------------------- Spotify (MPRIS)
def _playerctl(*args: str, timeout: float = 1.5) -> str | None:
    if not shutil.which("playerctl"):
        return None
    try:
        r = subprocess.run(["playerctl", "-p", "spotify", *args], capture_output=True, text=True, timeout=timeout)
    except (OSError, subprocess.TimeoutExpired):
        return None
    return r.stdout.strip() if r.returncode == 0 else None


def spotify() -> dict | None:
    status = _playerctl("status")
    if not status or status == "Stopped":
        return None
    fmt = "{{title}}\t{{artist}}\t{{album}}\t{{mpris:artUrl}}\t{{mpris:length}}\t{{position}}\t{{volume}}"
    linha = _playerctl("metadata", "--format", fmt)
    if not linha:
        return None
    partes = (linha.split("\t") + [""] * 7)[:7]
    titulo, artista, album, capa, duracao, posicao, volume = partes

    def micro(v):
        try:
            return int(float(v)) / 1_000_000
        except ValueError:
            return 0

    try:
        vol = float(volume)
    except ValueError:
        vol = 1.0
    return {
        "title": titulo, "artist": artista, "album": album, "cover": capa or None, "color": None,
        "playing": status == "Playing", "position": micro(posicao), "duration": micro(duracao),
        "canSeek": True, "canPrevious": True, "canNext": True, "source": "Spotify", "volume": vol,
    }


def spotify_acao(acao: str, posicao: float | None = None, volume: float | None = None) -> bool:
    if acao == "toggle":
        return _playerctl("play-pause") is not None
    if acao in ("pause", "next", "previous"):
        return _playerctl(acao) is not None
    if acao == "seek" and posicao is not None:
        return _playerctl("position", str(max(0.0, float(posicao)))) is not None
    if acao == "volume" and volume is not None:
        return _playerctl("volume", str(min(1.0, max(0.0, float(volume))))) is not None
    return False


if __name__ == "__main__":  # teste rápido: python3 musica.py
    t = time.time()
    b = biblioteca()
    print(len(b["albums"]), "álbuns em", round(time.time() - t, 2), "s")
