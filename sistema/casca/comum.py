"""Peças comuns da casca do Alba e dos apps: páginas WebKit ligadas ao servidor do sistema.

Cada parte visível do Alba (barra, dock, fundo, painéis e cada app) é uma página da
interface (web/) aberta num WebKitGTK sem nada de navegador. A página fala com o
processo dono dela por window.webkit.messageHandlers.alba e recebe respostas por
window.__alba.receber(...).
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import urllib.parse
from pathlib import Path

import gi

gi.require_version("Gtk", "4.0")
gi.require_version("Gdk", "4.0")
gi.require_version("WebKit", "6.0")
from gi.repository import Gdk, Gio, GLib, Gtk, WebKit  # noqa: E402

URL = os.environ.get("ALBA_URL", "http://127.0.0.1:7070").rstrip("/")
TOKEN = os.environ.get("ALBA_TOKEN", "")
CONFIG = Path.home() / ".config" / "alba" / "config.json"

# Tamanho padrão de cada app do Alba (em pontos da interface, antes da escala).
APPS = {
    "arquivos": {"nome": "Arquivos", "largura": 1080, "altura": 680, "unico": False},
    "terminal": {"nome": "Terminal", "largura": 860, "altura": 540, "unico": False},
    "notas": {"nome": "Notas", "largura": 760, "altura": 560, "unico": False},
    "visualizador": {"nome": "Visualizador", "largura": 900, "altura": 640, "unico": False},
    "ajustes": {"nome": "Ajustes", "largura": 900, "altura": 620, "unico": True},
    "musica": {"nome": "Sleeve", "largura": 1120, "altura": 720, "unico": True, "sem_moldura": True},
    "instalador": {"nome": "Instalar o Alba OS", "largura": 900, "altura": 640, "unico": True},
}


def ler_config() -> dict:
    try:
        return json.loads(CONFIG.read_text("utf-8"))
    except (OSError, ValueError):
        return {}


def escala() -> float:
    try:
        v = float(ler_config().get("escala", 1.25))
    except (TypeError, ValueError):
        v = 1.25
    return v if v in (1.0, 1.25, 1.5) else 1.25


def css_transparente() -> None:
    css = Gtk.CssProvider()
    css.load_from_string("window, window.background { background: transparent; box-shadow: none; }")
    Gtk.StyleContext.add_provider_for_display(Gdk.Display.get_default(), css, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)


def abrir_app(app: str, props: dict | None = None) -> None:
    """Abre (ou traz para frente) um app do Alba num processo próprio."""
    if app not in APPS:
        return
    comando = shutil.which("alba-app") or "/usr/bin/alba-app"
    subprocess.Popen([comando, app, json.dumps(props or {}, ensure_ascii=False)], start_new_session=True,
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def lancar_desktop(id_desktop: str) -> bool:
    """Abre um programa instalado pelo arquivo .desktop dele (ex.: firefox.desktop)."""
    try:
        info = Gio.DesktopAppInfo.new(id_desktop)
    except TypeError:
        info = None
    if info is None:
        return False
    try:
        return info.launch([], None)
    except GLib.Error:
        return False


def publicar(evento: dict) -> None:
    """Manda um evento para todas as partes do Alba (pelo servidor)."""
    import urllib.request
    try:
        pedido = urllib.request.Request(f"{URL}/api/evento", data=json.dumps(evento).encode(), method="POST",
                                        headers={"Content-Type": "application/json", "X-Alba-Token": TOKEN})
        urllib.request.urlopen(pedido, timeout=3).close()
    except OSError:
        pass


_idioma_definido = False


def _idioma():
    """O WebKit segue o idioma do sistema; garantimos português para os apps (ex.: o Sleeve)."""
    global _idioma_definido
    if not _idioma_definido:
        _idioma_definido = True
        try:
            WebKit.WebContext.get_default().set_preferred_languages(["pt-BR", "pt", "en"])
        except (AttributeError, TypeError):
            pass


class Pagina:
    """Uma página da interface do Alba num WebKit sem cara de navegador."""

    def __init__(self, consulta: dict, ao_receber, transparente: bool = True, carregar_ja: bool = True):
        _idioma()
        self.ao_receber = ao_receber
        self.pronta = False
        self.fila: list[dict] = []
        gerenciador = WebKit.UserContentManager()
        gerenciador.register_script_message_handler("alba", None)
        gerenciador.connect("script-message-received::alba", self._mensagem)
        self.view = WebKit.WebView(user_content_manager=gerenciador)
        ajustes = self.view.get_settings()
        depurar = os.environ.get("ALBA_DEPURAR") == "1"
        ajustes.set_enable_developer_extras(depurar)
        ajustes.set_enable_write_console_messages_to_stdout(depurar)
        ajustes.set_enable_back_forward_navigation_gestures(False)
        ajustes.set_media_playback_requires_user_gesture(False)
        ajustes.set_javascript_can_access_clipboard(True)
        ajustes.set_enable_smooth_scrolling(True)
        if transparente:
            self.view.set_background_color(Gdk.RGBA(0, 0, 0, 0))
        self.view.set_zoom_level(escala())
        self.view.connect("context-menu", lambda *_a: True)  # nada de menu de navegador
        self.view.connect("decide-policy", self._politica)
        self.view.connect("web-process-terminated", lambda *_a: GLib.timeout_add(800, self._recarregar))
        q = urllib.parse.urlencode({"t": TOKEN, "casca": "1", **consulta})
        self.endereco = f"{URL}/?{q}"
        self.carregada = False
        if carregar_ja:
            self.carregar()

    def carregar(self):
        """Carrega a página (nas camadas, só depois da janela ter tamanho: com 0x0 o WebKit não se recupera)."""
        if not self.carregada:
            self.carregada = True
            self.view.load_uri(self.endereco)
        return False

    def _recarregar(self):
        self.view.load_uri(self.endereco)
        return False

    def _politica(self, _view, decisao, tipo):
        if tipo in (WebKit.PolicyDecisionType.NAVIGATION_ACTION, WebKit.PolicyDecisionType.NEW_WINDOW_ACTION):
            uri = decisao.get_navigation_action().get_request().get_uri() or ""
            if not uri.startswith(URL) and not uri.startswith("about:"):
                decisao.ignore()
                if uri.startswith(("http://", "https://")):
                    Gio.AppInfo.launch_default_for_uri(uri, None)  # links da internet abrem no navegador
                return True
        return False

    def _mensagem(self, _gerenciador, valor):
        try:
            dados = json.loads(valor.to_json(0))
        except (ValueError, AttributeError):
            return
        if dados.get("tipo") == "pronto":
            self.pronta = True
            for m in self.fila:
                self.enviar(m)
            self.fila.clear()
        self.ao_receber(dados)

    def enviar(self, mensagem: dict) -> None:
        if not self.pronta:
            self.fila.append(mensagem)
            return
        js = f"window.__alba && window.__alba.receber({json.dumps(mensagem, ensure_ascii=False)})"
        self.view.evaluate_javascript(js, -1, None, None, None, None, None)

    def definir_escala(self, valor: float) -> None:
        self.view.set_zoom_level(valor)
