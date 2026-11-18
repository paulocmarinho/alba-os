#!/usr/bin/env python3
"""Tela de entrada do Alba OS: a página local (?entrada=1) mostra as contas e pede a senha;
aqui a gente fala com o greetd (o programa que abre a sessão de quem entrou).

Sem o greetd (testes), a senha "alba" entra em qualquer conta e o programa só termina.
"""
import json
import os
import pwd
import socket
import struct
import subprocess
import sys
import threading
from pathlib import Path

import gi

gi.require_version("Gtk", "4.0")
gi.require_version("WebKit", "6.0")
from gi.repository import Gdk, GLib, Gtk, WebKit  # noqa: E402

WEB = Path(os.environ.get("ALBA_WEB", "/usr/share/alba/web"))
ULTIMO = Path(os.environ.get("XDG_CACHE_HOME", "/tmp")) / "alba-entrada-ultimo"
SESSAO = ["/usr/bin/alba-sessao"]


def contas() -> list[dict]:
    lista = []
    for p in pwd.getpwall():
        if 1000 <= p.pw_uid < 60000 and not p.pw_shell.endswith(("nologin", "false")) and Path(p.pw_dir).is_dir():
            nome = (p.pw_gecos or "").split(",")[0].strip() or p.pw_name
            lista.append({"login": p.pw_name, "nome": nome})
    return sorted(lista, key=lambda c: c["nome"].lower())


class Greetd:
    def __init__(self, caminho: str):
        self.s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.s.connect(caminho)

    def _ler(self, n: int) -> bytes:
        dados = b""
        while len(dados) < n:
            parte = self.s.recv(n - len(dados))
            if not parte:
                raise ConnectionError("greetd fechou a conexão")
            dados += parte
        return dados

    def pedir(self, msg: dict) -> dict:
        corpo = json.dumps(msg).encode()
        self.s.sendall(struct.pack("=I", len(corpo)) + corpo)
        (n,) = struct.unpack("=I", self._ler(4))
        return json.loads(self._ler(n))


def entrar(login: str, senha: str) -> tuple[bool, str]:
    caminho = os.environ.get("GREETD_SOCK")
    if not caminho:  # modo de teste
        return (senha == "alba", "" if senha == "alba" else "Senha incorreta")
    try:
        g = Greetd(caminho)
        r = g.pedir({"type": "create_session", "username": login})
        while True:
            if r.get("type") == "auth_message":
                tipo = r.get("auth_message_type")
                resposta = senha if tipo in ("secret", "visible") else None
                r = g.pedir({"type": "post_auth_message_response", "response": resposta})
            elif r.get("type") == "success":
                r = g.pedir({"type": "start_session", "cmd": SESSAO, "env": ["ALBA_ENTROU_COM_SENHA=1"]})
                if r.get("type") == "success":
                    return True, ""
                g.pedir({"type": "cancel_session"})
                return False, "Não consegui abrir a sessão."
            else:
                g.pedir({"type": "cancel_session"})
                desc = str(r.get("description", ""))
                return False, "Senha incorreta" if r.get("error_type") == "auth_error" else (desc or "Não consegui entrar.")
    except (OSError, ConnectionError, ValueError) as e:
        return False, f"Não consegui falar com o sistema de entrada ({e})."


class Entrada(Gtk.Application):
    def __init__(self):
        super().__init__(application_id="org.alba.entrada")
        self.pronta = False

    def do_activate(self):
        gerenciador = WebKit.UserContentManager()
        gerenciador.register_script_message_handler("alba", None)
        gerenciador.connect("script-message-received::alba", self.mensagem)
        self.view = WebKit.WebView(user_content_manager=gerenciador)
        aj = self.view.get_settings()
        aj.set_allow_file_access_from_file_urls(True)
        aj.set_enable_back_forward_navigation_gestures(False)
        if not any(Path("/dev/dri").glob("renderD*")):
            aj.set_hardware_acceleration_policy(WebKit.HardwareAccelerationPolicy.NEVER)
        self.view.set_background_color(Gdk.RGBA(0.17, 0.15, 0.19, 1))
        self.view.set_zoom_level(float(os.environ.get("ALBA_ESCALA", "1.25")))
        self.view.connect("context-menu", lambda *_a: True)
        janela = Gtk.ApplicationWindow(application=self, title="Alba")
        janela.set_child(self.view)
        janela.fullscreen()
        janela.present()
        self.view.load_uri((WEB / "index.html").as_uri() + "?entrada=1")

    def enviar(self, m: dict):
        js = f"window.__alba && window.__alba.receber({json.dumps(m, ensure_ascii=False)})"
        self.view.evaluate_javascript(js, -1, None, None, None, None, None)

    def mensagem(self, _g, valor):
        try:
            m = json.loads(valor.to_json(0))
        except (ValueError, AttributeError):
            return
        tipo = m.get("tipo")
        if tipo == "pronto":
            ultimo = ULTIMO.read_text().strip() if ULTIMO.exists() else ""
            self.enviar({"tipo": "contas", "contas": contas(), "ultimo": ultimo})
        elif tipo == "entrar":
            login, senha = str(m.get("login", "")), str(m.get("senha", ""))
            threading.Thread(target=self._entrar, args=(login, senha), daemon=True).start()
        elif tipo == "energia":
            acao = "reboot" if m.get("acao") == "reiniciar" else "poweroff"
            subprocess.Popen(["systemctl", acao])

    def _entrar(self, login: str, senha: str):
        ok, erro = entrar(login, senha)
        GLib.idle_add(self._resultado, login, ok, erro)

    def _resultado(self, login: str, ok: bool, erro: str):
        self.enviar({"tipo": "resultado", "ok": ok, "erro": erro})
        if ok:
            try:
                ULTIMO.parent.mkdir(parents=True, exist_ok=True)
                ULTIMO.write_text(login)
            except OSError:
                pass
            if os.environ.get("ALBA_ENTRADA_TESTE") != "1":
                GLib.timeout_add(400, self.quit)  # o greetd abre a sessão quando a tela de entrada fecha
        return False


if __name__ == "__main__":
    sys.exit(Entrada().run([]))
