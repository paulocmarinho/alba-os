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


def _gerar(pacote: Path) -> None:
    """Roda o scanner do pywayland pela API (a linha de comando dele exige pkg-config)."""
    from pywayland.scanner import Protocol

    protocolos = [Protocol.parse_file(x) for x in (XML_WAYLAND, XML_TOPLEVEL)]
    importes = {interface.name: protocolo.name for protocolo in protocolos for interface in protocolo.interface}
    for protocolo in protocolos:
        protocolo.output(str(pacote), importes)


def _modulos():
    """Gera (uma vez) as classes Python do protocolo com o scanner do pywayland."""
    pacote = PASTA / "albaproto"
    alvo = pacote / "wlr_foreign_toplevel_management_unstable_v1"
    if not alvo.exists():
        pacote.mkdir(parents=True, exist_ok=True)
        (pacote / "__init__.py").write_text("")
        try:
            _gerar(pacote)
        except Exception as e:  # noqa: BLE001
            r = subprocess.run([sys.executable, "-m", "pywayland.scanner", "-i", XML_WAYLAND, XML_TOPLEVEL, "-o", str(pacote)],
                               capture_output=True, text=True)
            if r.returncode != 0:
                raise RuntimeError(f"scanner do pywayland falhou ({e}): {r.stderr.strip()[-300:]}") from e
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


_FALHOU = [False]


def _vigiar_pywayland():
    """Se o pywayland não conseguir ler um evento (ex.: a criação de uma janela nova), a lista
    ficaria sem aquela janela. Marcamos a falha para a casca refazer a lista do zero."""
    try:
        from pywayland.protocol_core import message
    except ImportError:
        return
    original = message.Message.c_to_arguments
    if getattr(original, "_alba", False):
        return

    def protegido(self, *args, **kwargs):
        try:
            return original(self, *args, **kwargs)
        except RuntimeError:
            _FALHOU[0] = True
            raise

    protegido._alba = True
    message.Message.c_to_arguments = protegido


class Janelas:
    def __init__(self, ao_mudar, ao_falhar=None):
        from pywayland.client import Display

        _vigiar_pywayland()
        self.ao_falhar = ao_falhar
        self.ativo = True
        self.ao_mudar = ao_mudar
        self.lista: dict[int, dict] = {}
        self.alcas: dict[int, object] = {}
        self.proximo = 1
        self.ordem: list[int] = []  # janelas da mais usada recentemente para a menos (Alt+Tab)
        self.gerente = None
        self.assento = None
        Gerente, Assento = _modulos()
        self.Gerente, self.Assento = Gerente, Assento
        self.tela = Display()
        self.tela.connect()
        # Guardado de propósito: se o registro for recolhido pelo coletor de lixo, o pywayland
        # às vezes não acha mais a conexão ao criar uma janela nova ("Cannot find display").
        self.registro = registro = self.tela.get_registry()
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
            if dados["ativa"]:
                if ident in self.ordem:
                    self.ordem.remove(ident)
                self.ordem.insert(0, ident)
            elif ident not in self.ordem:
                self.ordem.append(ident)
            dados["minimizada"] = MINIMIZADA in e
            dados["maximizada"] = MAXIMIZADA in e

        def pronto(_h):
            self.ao_mudar()

        def fechada(_h):
            self.lista.pop(ident, None)
            self.alcas.pop(ident, None)
            if ident in self.ordem:
                self.ordem.remove(ident)
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
        if not self.ativo:
            return False
        try:
            self.tela.dispatch(block=True)
            self.tela.flush()
        except Exception as e:  # noqa: BLE001
            print("janelas: conexão perdida:", e, flush=True)
            return False
        if _FALHOU[0] and self.ao_falhar:
            _FALHOU[0] = False
            print("janelas: um evento se perdeu; refazendo a lista de janelas", flush=True)
            GLib.idle_add(self.ao_falhar)
        return True

    def encerrar(self):
        self.ativo = False
        try:
            self.tela.disconnect()
        except Exception:  # noqa: BLE001
            pass

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

    def recentes(self) -> list[dict]:
        """Janelas na ordem de uso, para o Alt+Tab."""
        ids = [i for i in self.ordem if i in self.lista] + [i for i in self.lista if i not in self.ordem]
        return [dict(self.lista[i]) for i in ids if self.lista[i]["app"] or self.lista[i]["titulo"]]

    def todas(self) -> list[dict]:
        return [dict(j) for j in self.lista.values() if j["app"] or j["titulo"]]
