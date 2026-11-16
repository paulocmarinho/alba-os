"""Alba Store: apps do Flathub instalados na conta do usuário (flatpak --user).

Sem senha e sem tocar no sistema: cada app roda isolado e fica em ~/.local/share/flatpak.
O catálogo, a busca, os ícones e as capturas vêm da API pública do Flathub.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import threading
import time
import urllib.parse
import urllib.request
from pathlib import Path

API = "https://flathub.org/api/v2"
REMOTO = "flathub"
REMOTO_URL = "https://dl.flathub.org/repo/flathub.flatpakrepo"
CACHE = Path.home() / ".cache" / "alba" / "loja"
CACHE.mkdir(parents=True, exist_ok=True)

# Vitrine: escolhida a dedo, em português. O resto vem da API (ícone, capturas, tamanho).
VITRINE = {
    "destaque": {
        "id": "com.spotify.Client",
        "titulo": "Spotify",
        "texto": "Milhões de músicas e podcasts. Toque no Spotify e controle pelo Sleeve.",
        "cor": "#1db954",
    },
    "secoes": [
        {"titulo": "Música e vídeo", "apps": ["com.spotify.Client", "org.videolan.VLC", "com.obsproject.Studio",
                                             "org.audacityteam.Audacity", "io.github.celluloid_player.Celluloid",
                                             "org.kde.kdenlive"]},
        {"titulo": "Conversar e navegar", "apps": ["com.discordapp.Discord", "com.google.Chrome", "org.telegram.desktop",
                                                  "com.brave.Browser", "org.mozilla.Thunderbird", "us.zoom.Zoom"]},
        {"titulo": "Jogos", "apps": ["com.valvesoftware.Steam", "com.heroicgameslauncher.hgl", "net.lutris.Lutris",
                                     "org.prismlauncher.PrismLauncher", "org.libretro.RetroArch", "com.usebottles.bottles"]},
        {"titulo": "Trabalho", "apps": ["org.libreoffice.LibreOffice", "com.visualstudio.code", "md.obsidian.Obsidian",
                                        "com.slack.Slack", "org.onlyoffice.desktopeditors", "com.github.johnfactotum.Foliate"]},
        {"titulo": "Para criar", "apps": ["org.gimp.GIMP", "org.inkscape.Inkscape", "org.blender.Blender",
                                          "org.kde.krita", "com.github.PintaProject.Pinta", "org.darktable.Darktable"]},
    ],
}

# Descrições curtas em português para a vitrine (a API do Flathub responde em inglês).
RESUMOS = {
    "com.spotify.Client": "Música e podcasts",
    "org.videolan.VLC": "Toca qualquer vídeo ou música",
    "com.obsproject.Studio": "Grave a tela e faça lives",
    "org.audacityteam.Audacity": "Grave e edite áudio",
    "io.github.celluloid_player.Celluloid": "Player de vídeo simples",
    "org.kde.kdenlive": "Editor de vídeo",
    "com.discordapp.Discord": "Voz, vídeo e chat com amigos",
    "com.google.Chrome": "Navegador do Google",
    "org.telegram.desktop": "Mensagens rápidas e seguras",
    "com.brave.Browser": "Navegador com bloqueio de anúncios",
    "org.mozilla.Thunderbird": "E-mail e agenda",
    "us.zoom.Zoom": "Reuniões por vídeo",
    "com.valvesoftware.Steam": "Sua biblioteca de jogos",
    "com.heroicgameslauncher.hgl": "Jogos da Epic, GOG e Amazon",
    "net.lutris.Lutris": "Organize e rode seus jogos",
    "org.prismlauncher.PrismLauncher": "Minecraft com várias versões",
    "org.libretro.RetroArch": "Emulador de consoles clássicos",
    "com.usebottles.bottles": "Rode programas do Windows",
    "org.libreoffice.LibreOffice": "Textos, planilhas e apresentações",
    "com.visualstudio.code": "Editor de código",
    "md.obsidian.Obsidian": "Notas conectadas",
    "com.slack.Slack": "Conversas do trabalho",
    "org.onlyoffice.desktopeditors": "Documentos compatíveis com o Office",
    "com.github.johnfactotum.Foliate": "Leitor de livros digitais",
    "org.gimp.GIMP": "Edição de imagens",
    "org.inkscape.Inkscape": "Desenho vetorial",
    "org.blender.Blender": "3D, animação e efeitos",
    "org.kde.krita": "Pintura digital",
    "com.github.PintaProject.Pinta": "Desenho simples",
    "org.darktable.Darktable": "Revelação de fotos RAW",
}

# Textos em português para os apps da vitrine que mais aparecem (o Flathub manda em inglês).
DESCRICOES = {
    "com.spotify.Client": "Ouça milhões de músicas e podcasts, descubra lançamentos e monte suas playlists.\n\n"
                          "No Alba, o Sleeve mostra o que está tocando no Spotify, com a capa do álbum, e "
                          "controla play, pausa e troca de faixa sem você precisar abrir o Spotify.\n\n"
                          "Para ouvir, entre com a sua conta Spotify (grátis ou Premium).",
}

_tarefas: dict[str, dict] = {}
_trava = threading.Lock()
_avisar = None  # função que publica eventos para a interface (definida pelo servidor)


def configurar(avisar):
    global _avisar
    _avisar = avisar


class ErroLoja(Exception):
    pass


# ---------------------------------------------------------------- API do Flathub (com cache)
def _baixar(url: str, corpo: dict | None = None, validade: int = 6 * 3600):
    chave = re.sub(r"[^\w.-]", "_", url + (json.dumps(corpo, sort_keys=True) if corpo else ""))[-180:]
    arquivo = CACHE / f"{chave}.json"
    try:
        if time.time() - arquivo.stat().st_mtime < validade:
            return json.loads(arquivo.read_text("utf-8"))
    except (OSError, ValueError):
        pass
    dados = json.dumps(corpo).encode() if corpo is not None else None
    pedido = urllib.request.Request(url, data=dados, method="POST" if dados else "GET",
                                    headers={"User-Agent": "AlbaStore/1.0", "Accept": "application/json",
                                             **({"Content-Type": "application/json"} if dados else {})})
    try:
        with urllib.request.urlopen(pedido, timeout=15) as r:
            resposta = json.loads(r.read().decode("utf-8"))
    except Exception as e:  # noqa: BLE001
        try:  # sem internet: usa o que já tinha, mesmo velho
            return json.loads(arquivo.read_text("utf-8"))
        except (OSError, ValueError):
            raise ErroLoja("Não consegui falar com a loja. Confira a internet.") from e
    try:
        arquivo.write_text(json.dumps(resposta), "utf-8")
    except OSError:
        pass
    return resposta


def _icone(dados: dict) -> str | None:
    icone = dados.get("icon")
    if isinstance(icone, str) and icone:
        return icone
    for i in dados.get("icons") or []:
        if isinstance(i, dict) and i.get("url"):
            return i["url"]
    return None


def _capturas(dados: dict) -> list[str]:
    """Uma imagem por captura, a maior com até ~1300 px de largura.
    O Flathub manda "sizes" como lista de {src, width, height} (antes era um dicionário)."""
    urls = []
    for c in dados.get("screenshots") or []:
        tamanhos = c.get("sizes") if isinstance(c, dict) else None
        opcoes = []
        if isinstance(tamanhos, list):
            for t in tamanhos:
                if isinstance(t, dict) and t.get("src"):
                    try:
                        largura = int(t.get("width") or 0)
                    except ValueError:
                        largura = 0
                    opcoes.append((largura, t["src"]))
        elif isinstance(tamanhos, dict):
            for k, u in tamanhos.items():
                try:
                    opcoes.append((int(str(k).split("x")[0]), u))
                except ValueError:
                    opcoes.append((0, u))
        if not opcoes:
            continue
        opcoes.sort()
        boas = [u for largura, u in opcoes if 0 < largura <= 1300]
        urls.append(boas[-1] if boas else opcoes[0][1])
    return urls[:6]


def _limpar_html(texto: str) -> str:
    texto = re.sub(r"</p>\s*", "\n\n", texto or "")
    texto = re.sub(r"<li>", "• ", texto)
    texto = re.sub(r"</li>\s*", "\n", texto)
    texto = re.sub(r"<[^>]+>", "", texto)
    return re.sub(r"\n{3,}", "\n\n", texto).strip()


def resumo_app(app_id: str) -> dict:
    """Cartão de um app (vitrine): nome, ícone e uma linha de descrição."""
    try:
        d = _baixar(f"{API}/appstream/{urllib.parse.quote(app_id)}", validade=24 * 3600)
    except ErroLoja:
        d = {}
    return {"id": app_id, "nome": d.get("name") or app_id.split(".")[-1], "resumo": RESUMOS.get(app_id) or d.get("summary") or "",
            "icone": _icone(d)}


def detalhes(app_id: str) -> dict:
    d = _baixar(f"{API}/appstream/{urllib.parse.quote(app_id)}", validade=24 * 3600)
    if not d or not d.get("name"):
        raise ErroLoja("Esse app não está no Flathub.")
    try:
        s = _baixar(f"{API}/summary/{urllib.parse.quote(app_id)}", validade=24 * 3600)
    except ErroLoja:
        s = {}
    versao = ""
    for r in d.get("releases") or []:
        if isinstance(r, dict) and r.get("version"):
            versao = r["version"]
            break
    return {
        "id": app_id,
        "nome": d.get("name"),
        "resumo": RESUMOS.get(app_id) or d.get("summary") or "",
        "descricao": DESCRICOES.get(app_id) or _limpar_html(d.get("description") or ""),
        "icone": _icone(d),
        "capturas": _capturas(d),
        "desenvolvedor": d.get("developer_name") or "",
        "versao": versao,
        "licenca": d.get("project_license") or "",
        "site": (d.get("urls") or {}).get("homepage") if isinstance(d.get("urls"), dict) else "",
        "verificado": str((d.get("metadata") or {}).get("flathub::verification::verified")).lower() == "true"
        if isinstance(d.get("metadata"), dict) else False,
        "tamanho_download": s.get("download_size") if isinstance(s, dict) else None,
        "tamanho_instalado": s.get("installed_size") if isinstance(s, dict) else None,
        "instalado": app_id in instalados_ids(),
    }


def vitrine() -> dict:
    ids = {VITRINE["destaque"]["id"]} | {a for s in VITRINE["secoes"] for a in s["apps"]}
    cartoes = {}
    threads = [threading.Thread(target=lambda i=i: cartoes.__setitem__(i, resumo_app(i))) for i in ids]
    for t in threads:
        t.start()
    for t in threads:
        t.join(20)
    feitos = instalados_ids()
    def cartao(i):
        c = dict(cartoes.get(i) or {"id": i, "nome": i, "resumo": "", "icone": None})
        c["instalado"] = i in feitos
        return c
    destaque = dict(VITRINE["destaque"], **{"app": cartao(VITRINE["destaque"]["id"])})
    return {"destaque": destaque, "secoes": [{"titulo": s["titulo"], "apps": [cartao(i) for i in s["apps"]]} for s in VITRINE["secoes"]]}


def buscar(termo: str) -> list[dict]:
    termo = (termo or "").strip()
    if not termo:
        return []
    r = _baixar(f"{API}/search", {"query": termo, "filters": []}, validade=3600)
    hits = r.get("hits") if isinstance(r, dict) else r
    feitos = instalados_ids()
    saida = []
    for h in hits or []:
        if not isinstance(h, dict):
            continue
        i = h.get("app_id") or h.get("id")
        if not i or h.get("type") not in (None, "desktop-application", "desktop", "console-application"):
            continue
        saida.append({"id": i, "nome": h.get("name") or i, "resumo": RESUMOS.get(i) or h.get("summary") or "",
                      "icone": h.get("icon"), "instalado": i in feitos})
    return saida[:40]


# ---------------------------------------------------------------- flatpak
def _flatpak() -> str:
    caminho = shutil.which("flatpak")
    if not caminho:
        raise ErroLoja("A loja precisa de uma atualização do Alba (Ajustes › Sobre).")
    return caminho


def _garantir_remoto():
    r = subprocess.run([_flatpak(), "remote-add", "--user", "--if-not-exists", REMOTO, REMOTO_URL],
                       capture_output=True, text=True, timeout=120)
    if r.returncode != 0:
        raise ErroLoja("Não consegui ligar a loja ao Flathub. Confira a internet.")


def instalados() -> list[dict]:
    if not shutil.which("flatpak"):
        return []
    r = subprocess.run(["flatpak", "list", "--user", "--app", "--columns=application,name,version,size"],
                       capture_output=True, text=True, timeout=30)
    apps = []
    for linha in r.stdout.splitlines():
        partes = linha.split("\t")
        if len(partes) >= 2 and partes[0]:
            apps.append({"id": partes[0], "nome": partes[1], "versao": partes[2] if len(partes) > 2 else "",
                         "tamanho": partes[3] if len(partes) > 3 else ""})
    return apps


def instalados_ids() -> set[str]:
    return {a["id"] for a in instalados()}


def atualizacoes() -> list[str]:
    if not shutil.which("flatpak"):
        return []
    r = subprocess.run(["flatpak", "remote-ls", "--user", "--updates", "--app", "--columns=application"],
                       capture_output=True, text=True, timeout=120)
    return [l.strip() for l in r.stdout.splitlines() if l.strip()]


def tarefas() -> dict:
    with _trava:
        return {k: dict(v) for k, v in _tarefas.items()}


def _publicar(evento):
    if _avisar:
        try:
            _avisar(evento)
        except Exception:  # noqa: BLE001
            pass


def _rodar(chave: str, acao: str, comando: list[str], nome: str):
    """Roda o flatpak lendo o progresso (o flatpak escreve a % na mesma linha, com \\r)."""
    import pty
    with _trava:
        _tarefas[chave] = {"acao": acao, "progresso": 0, "estado": "rodando", "texto": "Preparando…", "nome": nome}
    _publicar({"tipo": "loja", "tarefas": tarefas()})
    ultimo = 0.0
    try:
        if acao in ("instalar", "atualizar"):
            _garantir_remoto()
        mestre, escravo = pty.openpty()
        proc = subprocess.Popen(comando, stdout=escravo, stderr=escravo, stdin=subprocess.DEVNULL, close_fds=True,
                                env={**os.environ, "LANG": "C.UTF-8", "LC_ALL": "C.UTF-8"})
        os.close(escravo)
        resto = b""
        log = []
        while True:
            try:
                bloco = os.read(mestre, 4096)
            except OSError:
                break
            if not bloco:
                break
            resto += bloco
            partes = re.split(rb"[\r\n]", resto)
            resto = partes.pop()
            for p in partes:
                texto = re.sub(r"\x1b\[[0-9;?]*[A-Za-z]", "", p.decode("utf-8", "replace")).strip()
                if not texto:
                    continue
                log.append(texto)
                m = re.findall(r"(\d{1,3})%", texto)
                with _trava:
                    t = _tarefas[chave]
                    if m:
                        t["progresso"] = max(t["progresso"], min(99, int(m[-1])))
                    if "Installing" in texto or "Instalando" in texto:
                        t["texto"] = "Instalando…"
                    elif "Updating" in texto or "Atualizando" in texto:
                        t["texto"] = "Atualizando…"
                    elif "Uninstalling" in texto:
                        t["texto"] = "Removendo…"
                    elif m:
                        t["texto"] = "Baixando…"
            if time.monotonic() - ultimo > 0.5:
                ultimo = time.monotonic()
                _publicar({"tipo": "loja", "tarefas": tarefas()})
        os.close(mestre)
        codigo = proc.wait()
        if codigo != 0:
            erro = next((l for l in reversed(log) if l.lower().startswith("error")), "")
            raise ErroLoja(erro.replace("error:", "").strip() or "O flatpak não conseguiu terminar.")
        with _trava:
            _tarefas[chave].update(estado="pronto", progresso=100, texto="Pronto")
        textos = {"instalar": f"{nome} instalado. Ele já está no Launchpad.", "remover": f"{nome} removido.",
                  "atualizar": "Apps atualizados."}
        _publicar({"tipo": "aviso", "texto": textos.get(acao, "Pronto.")})
        _publicar({"tipo": "apps-mudaram"})
    except Exception as e:  # noqa: BLE001
        with _trava:
            _tarefas[chave].update(estado="erro", texto=str(e)[:200] or "Falhou.")
        _publicar({"tipo": "aviso", "texto": f"{nome}: {str(e)[:160] or 'não deu certo.'}"})
    finally:
        _publicar({"tipo": "loja", "tarefas": tarefas()})
        threading.Timer(8, _esquecer, args=(chave,)).start()


def _esquecer(chave):
    with _trava:
        if _tarefas.get(chave, {}).get("estado") != "rodando":
            _tarefas.pop(chave, None)


def _iniciar(chave, acao, comando, nome):
    with _trava:
        if chave in _tarefas and _tarefas[chave]["estado"] == "rodando":
            return
    threading.Thread(target=_rodar, args=(chave, acao, comando, nome), daemon=True).start()


def _validar(app_id: str) -> str:
    if not re.fullmatch(r"[A-Za-z0-9_.\-]{3,128}", app_id or "") or app_id.count(".") < 2:
        raise ErroLoja("Identificador de app inválido.")
    return app_id


def instalar(app_id: str, nome: str = "") -> dict:
    app_id = _validar(app_id)
    _iniciar(app_id, "instalar", [_flatpak(), "install", "--user", "-y", "--noninteractive", REMOTO, app_id], nome or app_id)
    return {"ok": True}


def remover(app_id: str, nome: str = "") -> dict:
    app_id = _validar(app_id)
    _iniciar(app_id, "remover", [_flatpak(), "uninstall", "--user", "-y", "--noninteractive", app_id], nome or app_id)
    return {"ok": True}


def atualizar_tudo() -> dict:
    _iniciar("*", "atualizar", [_flatpak(), "update", "--user", "-y", "--noninteractive"], "Apps")
    return {"ok": True}
