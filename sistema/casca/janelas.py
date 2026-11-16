"""Lista das janelas abertas (de qualquer programa), pelo protocolo wlr-foreign-toplevel.

É assim que o dock sabe que o Firefox está aberto, qual janela está ativa, e consegue
trazer para frente, minimizar ou fechar uma janela.
"""
from __future__ import annotations

import importlib
import os
import struct
import subprocess
import sys
from pathlib import Path

from gi.repository import GLib

XML_WAYLAND = "/usr/share/wayland/wayland.xml"
XML_TOPLEVEL = "/usr/share/wlr-protocols/unstable/wlr-foreign-toplevel-management-unstable-v1.xml"
PASTA = Path(os.environ.get("XDG_CACHE_HOME", Path.home() / ".cache")) / "alba" / "protocolos"

MAXIMIZADA, MINIMIZADA, ATIVA, TELA_CHEIA = 0, 1, 2, 3


def _modulos():
    """Gera (uma vez) as classes Python do protocolo com o scanner do pywayland."""
    pacote = PASTA / "albaproto"
    alvo = pacote / "wlr_foreign_toplevel_management_unstable_v1"
    if not alvo.exists():
        pacote.mkdir(parents=True, exist_ok=True)
        (pacote / "__init__.py").write_text("")
        subprocess.run([sys.executable, "-m", "pywayland.scanner", "-i", XML_WAYLAND, XML_TOPLEVEL, "-o", str(pacote)],
                       check=True, capture_output=True)
    if str(PASTA) not in sys.path:
        sys.path.insert(0, str(PASTA))
    toplevel = importlib.import_module("albaproto.wlr_foreign_toplevel_management_unstable_v1")
    wayland = importlib.import_module("albaproto.wayland")
    return toplevel.ZwlrForeignToplevelManagerV1, wayland.WlSeat


def _estados(valor) -> set[int]:
    if isinstance(valor, (bytes, bytearray)):
        return set(struct.unpack(f"={len(valor) // 4}I", bytes(valor)))
    try:
        return {int(v) for v in valor}
    except TypeError:
        return set()


class Janelas:
    def __init__(self, ao_mudar):
        from pywayland.client import Display

        self.ao_mudar = ao_mudar
        self.lista: dict[int, dict] = {}
        self.alcas: dict[int, object] = {}
        self.proximo = 1
        self.gerente = None
        self.assento = None
        Gerente, Assento = _modulos()
        self.Gerente, self.Assento = Gerente, Assento
        self.tela = Display()
        self.tela.connect()
        registro = self.tela.get_registry()
        registro.dispatcher["global"] = self._global
        self.tela.roundtrip()
        self.tela.roundtrip()
        GLib.io_add_watch(self.tela.get_fd(), GLib.IO_IN, self._ler)
        self.tela.flush()

    @property
    def disponivel(self) -> bool:
        return self.gerente is not None

    def _global(self, registro, nome, interface, versao):
        if interface == "zwlr_foreign_toplevel_manager_v1":
            self.gerente = registro.bind(nome, self.Gerente, min(versao, 3))
            self.gerente.dispatcher["toplevel"] = self._nova
        elif interface == "wl_seat" and self.assento is None:
            self.assento = registro.bind(nome, self.Assento, min(versao, 5))

    def _nova(self, _gerente, alca):
        ident = self.proximo
        self.proximo += 1
        dados = {"id": ident, "titulo": "", "app": "", "ativa": False, "minimizada": False, "maximizada": False}
        self.lista[ident] = dados
        self.alcas[ident] = alca

        def titulo(_h, t):
            dados["titulo"] = t

        def app(_h, a):
            dados["app"] = a

        def estado(_h, valor):
            e = _estados(valor)
            dados["ativa"] = ATIVA in e
            dados["minimizada"] = MINIMIZADA in e
            dados["maximizada"] = MAXIMIZADA in e

        def pronto(_h):
            self.ao_mudar()

        def fechada(_h):
            self.lista.pop(ident, None)
            self.alcas.pop(ident, None)
            try:
                alca.destroy()
            except Exception:  # noqa: BLE001
                pass
            self.ao_mudar()

        alca.dispatcher["title"] = titulo
        alca.dispatcher["app_id"] = app
        alca.dispatcher["state"] = estado
        alca.dispatcher["done"] = pronto
        alca.dispatcher["closed"] = fechada

    def _ler(self, *_a):
        try:
            self.tela.dispatch(block=True)
            self.tela.flush()
        except Exception as e:  # noqa: BLE001
            print("janelas: conexão perdida:", e, flush=True)
            return False
        return True

    def _alca(self, ident):
        return self.alcas.get(int(ident))

    def ativar(self, ident):
        alca = self._alca(ident)
        if alca and self.assento:
            if self.lista[int(ident)]["minimizada"]:
                alca.unset_minimized()
            alca.activate(self.assento)
            self.tela.flush()

    def minimizar(self, ident):
        alca = self._alca(ident)
        if alca:
            alca.set_minimized()
            self.tela.flush()

    def fechar(self, ident):
        alca = self._alca(ident)
        if alca:
            alca.close()
            self.tela.flush()

    def todas(self) -> list[dict]:
        return [dict(j) for j in self.lista.values() if j["app"] or j["titulo"]]
