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
import unicodedata
import urllib.parse
import urllib.request
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
LETRAS = CACHE / "letras"
REPARADOS = CACHE / "reparados"
ARTISTAS = CACHE / "artistas"
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
        "title": titulo, "artist": artista, "album": album, "cover": capa_spotify_grande(capa) or None, "color": None,
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


# ---------------------------------------------------------------- FLAC que o Chromium recusa
# Alguns FLAC tocam em qualquer player, mas o Chromium recusa o arquivo inteiro por um defeito nas
# etiquetas: capa gravada sem o tipo da imagem, ou etiquetas ID3 antes do FLAC. O áudio vai sem esses
# pedaços (uma cópia em ~/.cache/alba/sleeve/reparados); o arquivo original fica intacto.
_tocaveis: dict[tuple, Path] = {}


def _imagem_ok(dados: bytes) -> bool:
    if len(dados) < 32:
        return False
    tam = int.from_bytes(dados[4:8], "big")
    return 0 < tam and 8 + tam <= len(dados)


def arquivo_tocavel(caminho: Path) -> Path:
    if caminho.suffix.lower() != ".flac":
        return caminho
    try:
        st = caminho.stat()
    except OSError:
        return caminho
    chave = (str(caminho), st.st_size, st.st_mtime_ns)
    if chave in _tocaveis:
        return _tocaveis[chave]
    destino = REPARADOS / (_id("|".join(map(str, chave))) + ".flac")
    resultado = caminho
    try:
        if destino.is_file():
            resultado = destino
        else:
            with open(caminho, "rb") as f:
                cab = f.read(10)
                mudou = False
                if cab[:3] == b"ID3":
                    tam = (cab[6] << 21) | (cab[7] << 14) | (cab[8] << 7) | cab[9]
                    f.seek(10 + tam + (10 if cab[5] & 0x10 else 0))
                    cab = f.read(4)
                    mudou = True
                else:
                    f.seek(4)
                if cab[:4] == b"fLaC":
                    blocos, ultimo = [], False
                    while not ultimo:
                        h = f.read(4)
                        if len(h) < 4:
                            break
                        ultimo = bool(h[0] & 0x80)
                        tipo = h[0] & 0x7F
                        dados = f.read(int.from_bytes(h[1:4], "big"))
                        if tipo == 6 and not _imagem_ok(dados):
                            mudou = True
                            continue
                        blocos.append((tipo, dados))
                    if mudou and blocos and blocos[0][0] == 0:
                        REPARADOS.mkdir(parents=True, exist_ok=True)
                        temp = destino.with_suffix(".tmp")
                        with open(temp, "wb") as saida:
                            saida.write(b"fLaC")
                            for i, (tipo, dados) in enumerate(blocos):
                                saida.write(bytes([tipo | (0x80 if i == len(blocos) - 1 else 0)]) + len(dados).to_bytes(3, "big"))
                                saida.write(dados)
                            shutil.copyfileobj(f, saida, 1024 * 1024)
                        temp.replace(destino)
                        resultado = destino
    except OSError:
        resultado = caminho
    _tocaveis[chave] = resultado
    return resultado


# ---------------------------------------------------------------- fotos de artistas
# Primeiro um artist.jpg na pasta do álbum ou acima dela; senão, o Deezer (sem chave, 1000 px),
# só se algum álbum ou música da biblioteca estiver na discografia (evita homônimos).
_trava_deezer = threading.Lock()


def _norm(texto: str) -> str:
    s = re.sub(r"\(.*?\)|\[.*?\]|\b(feat|ft)\.?\s.*$", " ", (texto or "").lower())
    s = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", "".join(c if c.isalnum() else " " for c in s)).strip()


def _parecido(remoto: str, locais: set[str]) -> bool:
    if not remoto:
        return False
    return remoto in locais or any(len(l) >= 4 and len(remoto) >= 4 and (l in remoto or remoto in l) for l in locais)


def _deezer(url: str):
    pedido = urllib.request.Request(url, headers={"User-Agent": "Sleeve-AlbaOS (+https://github.com/paulocmarinho/sleeve)"})
    with urllib.request.urlopen(pedido, timeout=10) as r:
        dados = json.loads(r.read().decode("utf-8"))
    return None if isinstance(dados, dict) and "error" in dados else dados


def foto_artista(nome: str, albuns: list, faixas: list, caminhos: list, online: bool) -> str | None:
    """Nome do arquivo da foto em ARTISTAS (servido por /api/musica/artista), ou None."""
    chave = _id(nome.lower())
    for caminho in caminhos:
        p = Path(caminho)
        if not permitido(p):
            continue
        for pasta in (p.parent, p.parent.parent):
            for arq in ("artist.jpg", "artist.jpeg", "artist.png"):
                origem = pasta / arq
                if origem.is_file():
                    ARTISTAS.mkdir(parents=True, exist_ok=True)
                    destino = ARTISTAS / f"{chave}-local{origem.suffix.lower()}"
                    if not destino.exists() or destino.stat().st_mtime < origem.stat().st_mtime:
                        shutil.copyfile(origem, destino)
                    return destino.name
    salvo = ARTISTAS / f"{chave}.jpg"
    if salvo.is_file():
        return salvo.name
    if not online:
        return None
    nada = ARTISTAS / f"{chave}.none"
    if nada.is_file() and time.time() - nada.stat().st_mtime < 14 * 86400:
        return None
    with _trava_deezer:  # um artista por vez, para não passar do limite do Deezer
        try:
            foto = _foto_do_deezer(nome, albuns, faixas)
        except Exception:  # noqa: BLE001  (sem internet: tenta de novo depois)
            return None
        finally:
            time.sleep(0.12)
    ARTISTAS.mkdir(parents=True, exist_ok=True)
    if not foto:
        nada.write_text("")
        return None
    salvo.write_bytes(foto)
    return salvo.name


def _foto_do_deezer(nome: str, albuns: list, faixas: list) -> bytes | None:
    alvo = _norm(nome)
    busca = _deezer("https://api.deezer.com/search/artist?limit=8&q=" + urllib.parse.quote(nome)) or {}
    candidatos = [a for a in busca.get("data", []) if _norm(a.get("name", "")) == alvo][:3]
    locais_albuns = {x for x in map(_norm, albuns) if x}
    locais_faixas = {x for x in map(_norm, faixas) if x}
    for a in candidatos:
        foto = a.get("picture_xl") or ""
        if not foto or "/artist//" in foto:  # imagem genérica de quem não tem foto
            continue
        lista = _deezer(f"https://api.deezer.com/artist/{a['id']}/albums?limit=100") or {}
        bate = any(_parecido(_norm(x.get("title", "")), locais_albuns) for x in lista.get("data", []))
        if not bate:
            top = _deezer(f"https://api.deezer.com/artist/{a['id']}/top?limit=50") or {}
            bate = any(_parecido(_norm(x.get("title", "")), locais_faixas) for x in top.get("data", []))
        if bate:
            pedido = urllib.request.Request(foto, headers={"User-Agent": "Sleeve-AlbaOS"})
            with urllib.request.urlopen(pedido, timeout=10) as r:
                dados = r.read(8 * 1024 * 1024)
            return dados if len(dados) > 1000 else None
    return None


def arquivo_de_artista(nome: str) -> Path | None:
    p = ARTISTAS / Path(nome).name
    return p if p.is_file() else None


# ---------------------------------------------------------------- capa do Spotify
# O MPRIS entrega a capa em 300 px. A mesma imagem existe em 640 px no CDN do Spotify.
_TAMANHOS_SPOTIFY = ("ab67616d00001e02", "ab67616d00004851")
_HOSTS_CAPA = ("i.scdn.co", "mosaic.scdn.co", "image-cdn-ak.spotifycdn.com", "image-cdn-fa.spotifycdn.com")
_capas_spotify: dict[str, tuple[bytes, str]] = {}


def capa_spotify_grande(url: str) -> str:
    if not url:
        return ""
    url = url.replace("https://open.spotify.com/image/", "https://i.scdn.co/image/")
    for pequeno in _TAMANHOS_SPOTIFY:
        url = url.replace("/image/" + pequeno, "/image/ab67616d0000b273")
    return url


def baixar_capa_spotify(url: str) -> tuple[bytes, str]:
    """Baixa a capa do Spotify pelo servidor, para o Sleeve poder tirar a cor dela (mesma origem)."""
    partes = urllib.parse.urlsplit(url)
    if partes.scheme != "https" or partes.hostname not in _HOSTS_CAPA:
        raise ValueError("Endereço de capa não permitido.")
    if url in _capas_spotify:
        return _capas_spotify[url]
    pedido = urllib.request.Request(url, headers={"User-Agent": "AlbaOS-Sleeve"})
    with urllib.request.urlopen(pedido, timeout=8) as r:
        dados = r.read(4 * 1024 * 1024)
    tipo = tipo_imagem(dados)
    if not tipo.startswith("image/"):
        raise ValueError("Não é uma imagem.")
    if len(_capas_spotify) > 40:
        _capas_spotify.pop(next(iter(_capas_spotify)))
    _capas_spotify[url] = (dados, tipo)
    return dados, tipo


# ---------------------------------------------------------------- letras
def _letra_embutida(caminho: Path) -> str:
    if mutagen is None:
        return ""
    try:
        f = mutagen.File(caminho)
    except Exception:  # noqa: BLE001
        return ""
    tags = getattr(f, "tags", None)
    if not tags:
        return ""
    try:
        if hasattr(tags, "getall"):  # MP3 (ID3)
            for quadro in tags.getall("USLT"):
                if str(quadro.text).strip():
                    return str(quadro.text)
            return ""
        if hasattr(tags, "get"):
            for chave in ("\xa9lyr", "lyrics", "LYRICS", "unsyncedlyrics", "UNSYNCEDLYRICS"):
                v = tags.get(chave)
                if v:
                    v = v[0] if isinstance(v, list) else v
                    if str(v).strip():
                        return str(v)
    except Exception:  # noqa: BLE001
        return ""
    return ""


def _sincronizada(texto: str) -> bool:
    return re.search(r"^\s*\[\d+:\d+", texto, re.MULTILINE) is not None


def _embrulhar(texto: str) -> dict | None:
    if not texto or not texto.strip():
        return None
    return {"synced": texto, "plain": None} if _sincronizada(texto) else {"synced": None, "plain": texto}


def _lrclib(caminho_api: str, params: dict):
    url = "https://lrclib.net/api/" + caminho_api + "?" + urllib.parse.urlencode(params)
    pedido = urllib.request.Request(url, headers={"User-Agent": "Sleeve-AlbaOS (+https://github.com/paulocmarinho/sleeve)"})
    try:
        with urllib.request.urlopen(pedido, timeout=8) as r:
            return json.loads(r.read().decode("utf-8"))
    except Exception:  # noqa: BLE001  (404 = não achou; sem internet = não achou)
        return None


def _ler_lrclib(item) -> dict | None:
    if not isinstance(item, dict):
        return None
    sinc = (item.get("syncedLyrics") or "").strip() or None
    simples = (item.get("plainLyrics") or "").strip() or None
    if not sinc and not simples:
        return None
    return {"synced": sinc, "plain": None if sinc else simples}


def letra(caminho: str | None, titulo: str, artista: str, album: str, duracao: int, online: bool) -> dict:
    """Letra: .lrc ao lado do arquivo, letra gravada no arquivo e, se permitido, o LRCLIB."""
    if caminho:
        p = Path(caminho)
        if permitido(p):
            lrc = p.with_suffix(".lrc")
            try:
                if lrc.is_file():
                    achou = _embrulhar(lrc.read_text(encoding="utf-8", errors="replace"))
                    if achou:
                        return achou
            except OSError:
                pass
            achou = _embrulhar(_letra_embutida(p))
            if achou:
                return achou
    if not online or not titulo.strip():
        return {"synced": None, "plain": None}

    arquivo = LETRAS / (_id(f"{artista}|{titulo}|{album}".lower()) + ".json")
    try:
        return json.loads(arquivo.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        pass

    params = {"track_name": titulo, "artist_name": artista}
    if album:
        params["album_name"] = album
    if duracao > 0:
        params["duration"] = duracao
    achou = _ler_lrclib(_lrclib("get", params))
    if not achou:
        principal = re.split(r",|&| feat\.? | ft\.? | x ", artista, flags=re.IGNORECASE)[0].strip()
        lista = _lrclib("search", {"track_name": titulo, "artist_name": principal}) or []
        perto = [x for x in lista if isinstance(x, dict) and (duracao <= 0 or abs(float(x.get("duration") or duracao) - duracao) <= 4)]
        escolhido = next((x for x in perto if x.get("syncedLyrics")), None) or next((x for x in perto if x.get("plainLyrics")), None)
        achou = _ler_lrclib(escolhido)
    if achou:
        try:
            LETRAS.mkdir(parents=True, exist_ok=True)
            arquivo.write_text(json.dumps(achou), encoding="utf-8")
        except OSError:
            pass
        return achou
    return {"synced": None, "plain": None}


if __name__ == "__main__":  # teste rápido: python3 musica.py
    t = time.time()
    b = biblioteca()
    print(len(b["albums"]), "álbuns em", round(time.time() - t, 2), "s")
