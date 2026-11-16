"""Casca do Alba: o fundo, a barra superior, o dock e os painéis, como camadas do compositor.

Roda dentro do labwc (o gerenciador de janelas). Os programas (apps do Alba, Firefox, etc.)
são janelas normais; a casca desenha em volta delas e mantém o dock em dia com a lista de
janelas abertas.
"""
from __future__ import annotations

import base64
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import gi  # noqa: E402

gi.require_version("Gtk", "4.0")
gi.require_version("Gdk", "4.0")
gi.require_version("Gtk4LayerShell", "1.0")
gi.require_foreign("cairo")
import cairo  # noqa: E402
from gi.repository import Gdk, Gio, GLib, Gtk  # noqa: E402
from gi.repository import Gtk4LayerShell as Camada  # noqa: E402

from comum import APPS, Pagina, abrir_app, css_transparente, escala, lancar_desktop  # noqa: E402

LIVE = Path("/run/archiso").is_dir()
# Durante a instalação, o computador mostra só o papel de parede e o instalador.
FIXOS = [
    {"chave": "arquivos", "tipo": "alba", "app": "arquivos"},
    {"chave": "musica", "tipo": "alba", "app": "musica"},
    {"chave": "firefox", "tipo": "externo", "desktop": "firefox.desktop"},
    {"chave": "terminal", "tipo": "alba", "app": "terminal"},
    {"chave": "notas", "tipo": "alba", "app": "notas"},
    {"chave": "ajustes", "tipo": "alba", "app": "ajustes"},
]

ALTURA_BARRA = 36
ALTURA_DOCK = 124  # inclui o espaço das dicas acima dos ícones
RESERVA_DOCK = 92  # o que as janelas maximizadas deixam livre embaixo


class Superficie:
    """Uma janela de camada (layer-shell) com uma página do Alba dentro."""

    def __init__(self, casca, nome, camada, ancoras, altura=None, reserva=None, teclado=Camada.KeyboardMode.NONE):
        self.casca = casca
        self.nome = nome
        self.altura = altura
        self.reserva = reserva
        self.regiao = None
        self.clicavel = True
        self.janela = Gtk.Window(application=casca)
        Camada.init_for_window(self.janela)
        Camada.set_namespace(self.janela, f"alba-{nome}")
        Camada.set_layer(self.janela, camada)
        for borda in ancoras:
            Camada.set_anchor(self.janela, borda, True)
        Camada.set_keyboard_mode(self.janela, teclado)
        if reserva is None:
            Camada.set_exclusive_zone(self.janela, -1)  # ignora barra e dock: ocupa a tela toda
        self.pagina = Pagina({"superficie": nome}, lambda m: casca.mensagem(self, m), carregar_ja=False)
        self.janela.set_child(self.pagina.view)
        self.janela.connect("map", self._mapeada)
        self.redimensionar()

    def _mapeada(self, *_a):
        GLib.idle_add(self._aplicar_regiao)
        try:
            r = self.janela.get_renderer()
            print(f"alba-casca: desenho da tela: {type(r).__name__}", file=sys.stderr, flush=True)
        except Exception:
            pass
        GLib.timeout_add(150, self._carregar_com_tamanho)

    def _carregar_com_tamanho(self):
        if self.pagina.view.get_width() > 0 and self.pagina.view.get_height() > 0:
            return self.pagina.carregar()
        return True  # tenta de novo até a janela ter tamanho

    def redimensionar(self):
        z = escala()
        if self.altura:
            self.janela.set_default_size(-1, round(self.altura * z))
            self.janela.set_size_request(-1, round(self.altura * z))
        if self.reserva:
            Camada.set_exclusive_zone(self.janela, round(self.reserva * z))
        self.pagina.definir_escala(z)

    def definir_regiao(self, x, y, l, a):
        z = escala()
        self.regiao = (round(x * z), round(y * z), max(1, round(l * z)), max(1, round(a * z)))
        self._aplicar_regiao()

    def _aplicar_regiao(self):
        superficie = self.janela.get_surface()
        if superficie is None:
            return False
        if not self.clicavel:
            superficie.set_input_region(cairo.Region())  # cliques passam direto
        elif self.regiao is not None:
            superficie.set_input_region(cairo.Region(cairo.RectangleInt(*self.regiao)))
        else:
            superficie.set_input_region(None)
        return False

    def definir_clicavel(self, sim: bool):
        self.clicavel = sim
        self._aplicar_regiao()

    def mostrar(self):
        self.janela.set_visible(True)

    def esconder(self):
        self.janela.set_visible(False)

    @property
    def visivel(self):
        return self.janela.get_visible()


class Casca(Gtk.Application):
    def __init__(self):
        super().__init__(application_id="org.alba.casca", flags=Gio.ApplicationFlags.NON_UNIQUE)
        self.janelas = None
        self.bloqueada = not LIVE
        self.painel = None
        self.icones: dict[str, str | None] = {}
        self._ultimo_painel, self._ultimo_painel_t = None, 0
        self.connect("activate", self.ativar)

    # ------------------------------------------------------------ montagem
    def ativar(self, _app):
        css_transparente()
        A = Camada.Edge
        self.fundo = Superficie(self, "fundo", Camada.Layer.BACKGROUND, [A.TOP, A.BOTTOM, A.LEFT, A.RIGHT])
        self.barra = Superficie(self, "barra", Camada.Layer.TOP, [A.TOP, A.LEFT, A.RIGHT], altura=ALTURA_BARRA, reserva=ALTURA_BARRA)
        self.dock = Superficie(self, "dock", Camada.Layer.TOP, [A.BOTTOM, A.LEFT, A.RIGHT], altura=ALTURA_DOCK, reserva=RESERVA_DOCK)
        self.sobre = Superficie(self, "sobre", Camada.Layer.OVERLAY, [A.TOP, A.BOTTOM, A.LEFT, A.RIGHT],
                                teclado=Camada.KeyboardMode.EXCLUSIVE)
        self.dock.definir_regiao(0, 0, 1, 1)  # até a página dizer onde está o dock
        # A camada de painéis fica sempre carregada (abre na hora); sem painel, os cliques passam direto.
        self.sobre_ativo = self.bloqueada
        self.sobre.clicavel = self.bloqueada
        if not self.bloqueada:
            Camada.set_keyboard_mode(self.sobre.janela, Camada.KeyboardMode.NONE)
        partes = (self.fundo,) if LIVE else (self.fundo, self.barra, self.dock, self.sobre)
        for s in partes:
            s.mostrar()
        try:
            from janelas import Janelas
            self.janelas = Janelas(self.janelas_mudaram)
        except Exception as e:  # noqa: BLE001
            print("Alba: sem lista de janelas:", e, flush=True)
        if LIVE:
            GLib.timeout_add(1200, lambda: abrir_app("instalador") and False)
            GLib.timeout_add_seconds(3, self.vigiar_instalador)
        if os.environ.get("ALBA_DEPURAR") == "1":
            def relatar():
                for s in (self.fundo, self.barra, self.dock, self.sobre):
                    print(f"[casca] {s.nome}: visível={s.visivel} {s.janela.get_width()}x{s.janela.get_height()} "
                          f"view={s.pagina.view.get_width()}x{s.pagina.view.get_height()} pronta={s.pagina.pronta}", flush=True)
                return True
            GLib.timeout_add_seconds(8, relatar)
        self.hold()

    # ------------------------------------------------------------ dock e barra
    def icone(self, id_desktop):
        if id_desktop in self.icones:
            return self.icones[id_desktop]
        caminho = None
        try:
            info = Gio.DesktopAppInfo.new(id_desktop)
            gicone = info.get_icon() if info else None
            if gicone is not None:
                tema = Gtk.IconTheme.get_for_display(Gdk.Display.get_default())
                pintura = tema.lookup_by_gicon(gicone, 128, 1, Gtk.TextDirection.LTR, 0)
                arquivo = pintura.get_file() if pintura else None
                caminho = arquivo.get_path() if arquivo else None
        except (TypeError, GLib.Error):
            caminho = None
        url = None
        if caminho and os.path.isfile(caminho):
            tipo = "image/svg+xml" if caminho.endswith(".svg") else "image/png"
            url = f"data:{tipo};base64," + base64.b64encode(Path(caminho).read_bytes()).decode()
        self.icones[id_desktop] = url
        return url

    def _desktop_de(self, app_id):
        for candidato in (f"{app_id}.desktop", f"{app_id.lower()}.desktop"):
            try:
                if Gio.DesktopAppInfo.new(candidato):
                    return candidato
            except TypeError:
                continue
        return None

    def estado(self) -> dict:
        lista = self.janelas.todas() if self.janelas else []
        itens = []
        usadas = set()
        for fixo in FIXOS:
            item = dict(fixo)
            if fixo["tipo"] == "alba":
                app_id = f"org.alba.{fixo['app']}"
                item["nome"] = APPS[fixo["app"]]["nome"]
                minhas = [j for j in lista if j["app"] == app_id]
            else:
                info = None
                try:
                    info = Gio.DesktopAppInfo.new(fixo["desktop"])
                except TypeError:
                    pass
                if info is None:
                    continue  # programa não instalado: some do dock
                item["nome"] = info.get_display_name()
                item["icone"] = self.icone(fixo["desktop"])
                base = fixo["desktop"].removesuffix(".desktop").lower()
                minhas = [j for j in lista if j["app"].lower() == base]
            item["janelas"] = [j["id"] for j in minhas]
            item["ativa"] = any(j["ativa"] for j in minhas)
            usadas.update(item["janelas"])
            itens.append(item)
        # Programas abertos que não estão fixos no dock aparecem depois deles.
        extras: dict[str, dict] = {}
        for j in lista:
            if j["id"] in usadas:
                continue
            chave = j["app"] or j["titulo"]
            if chave.startswith("org.alba."):
                app = chave.removeprefix("org.alba.")
                item = extras.setdefault(chave, {"chave": chave, "tipo": "alba", "app": app,
                                                 "nome": APPS.get(app, {}).get("nome", app), "janelas": [], "ativa": False})
            else:
                desktop = self._desktop_de(j["app"]) if j["app"] else None
                nome = j["titulo"] or j["app"]
                if desktop:
                    try:
                        nome = Gio.DesktopAppInfo.new(desktop).get_display_name()
                    except TypeError:
                        pass
                item = extras.setdefault(chave, {"chave": chave, "tipo": "externo", "desktop": desktop, "nome": nome,
                                                 "icone": self.icone(desktop) if desktop else None, "janelas": [], "ativa": False})
            item["janelas"].append(j["id"])
            item["ativa"] = item["ativa"] or j["ativa"]
        ativa = next((j for j in lista if j["ativa"]), None)
        nome_ativo = None
        if ativa:
            for item in itens + list(extras.values()):
                if ativa["id"] in item["janelas"]:
                    nome_ativo = item["nome"]
        return {"tipo": "janelas", "itens": itens, "extras": list(extras.values()), "live": LIVE,
                "ativa": {"titulo": ativa["titulo"], "app": nome_ativo or ativa["app"]} if ativa else None}

    def vigiar_instalador(self):
        """Modo de instalação: o instalador está sempre aberto e na frente."""
        lista = self.janelas.todas() if self.janelas else []
        instalador = [j for j in lista if j["app"] == "org.alba.instalador"]
        if not instalador:
            abrir_app("instalador")
        else:
            for j in instalador:
                if j["minimizada"] or not j["ativa"]:
                    self.janelas.ativar(j["id"])
        return True

    def janelas_mudaram(self):
        if LIVE:
            return
        e = self.estado()
        self.barra.pagina.enviar(e)
        self.dock.pagina.enviar(e)

    def clique_item(self, chave):
        e = self.estado()
        item = next((i for i in e["itens"] + e["extras"] if i["chave"] == chave), None)
        if item is None:
            return
        if not item["janelas"]:
            if item["tipo"] == "alba":
                abrir_app(item["app"])
            elif item.get("desktop"):
                lancar_desktop(item["desktop"])
            return
        if not self.janelas:
            return
        dados = [self.janelas.lista[i] for i in item["janelas"] if i in self.janelas.lista]
        ativa = next((j for j in dados if j["ativa"] and not j["minimizada"]), None)
        if ativa:
            self.janelas.minimizar(ativa["id"])
        else:
            for j in dados:
                self.janelas.ativar(j["id"])

    # ------------------------------------------------------------ painéis e bloqueio
    def abrir_sobre(self, modo, qual=None):
        self.painel = qual if modo == "painel" else None
        self.sobre_ativo = True
        Camada.set_keyboard_mode(self.sobre.janela, Camada.KeyboardMode.EXCLUSIVE if modo == "bloqueio" else Camada.KeyboardMode.ON_DEMAND)
        self.sobre.pagina.enviar({"tipo": "modo", "modo": modo, "qual": qual})
        self.sobre.definir_clicavel(True)
        self.barra.pagina.enviar({"tipo": "painel", "qual": self.painel})

    def fechar_sobre(self):
        if self.bloqueada:
            return
        self.painel = None
        self.sobre_ativo = False
        self.sobre.pagina.enviar({"tipo": "modo", "modo": None})
        self.sobre.definir_clicavel(False)
        Camada.set_keyboard_mode(self.sobre.janela, Camada.KeyboardMode.NONE)
        self.barra.pagina.enviar({"tipo": "painel", "qual": None})

    # ------------------------------------------------------------ mensagens das páginas
    def mensagem(self, origem: Superficie, m: dict):
        tipo = m.get("tipo")
        if os.environ.get("ALBA_DEPURAR") == "1":
            print(f"[casca] {origem.nome} → {m}", flush=True)
        if tipo == "pronto":
            if origem in (self.barra, self.dock):
                origem.pagina.enviar(self.estado())
            if origem is self.sobre:
                origem.pagina.enviar({"tipo": "modo", "modo": "bloqueio" if self.bloqueada else None})
        elif tipo == "abrir":
            self.fechar_sobre()
            abrir_app(str(m.get("app")), m.get("props") or {})
        elif tipo == "lancar":
            lancar_desktop(str(m.get("desktop")))
        elif tipo == "item":
            self.clique_item(str(m.get("chave")))
        elif tipo == "janela" and self.janelas:
            acao, ident = m.get("acao"), m.get("id")
            {"ativar": self.janelas.ativar, "minimizar": self.janelas.minimizar, "fechar": self.janelas.fechar}.get(acao, lambda _i: None)(ident)
        elif tipo == "painel":
            qual = m.get("qual")
            agora = GLib.get_monotonic_time()
            if self._ultimo_painel == (qual, origem.nome) and agora - self._ultimo_painel_t < 350_000:
                return  # clique duplo / evento repetido
            self._ultimo_painel, self._ultimo_painel_t = (qual, origem.nome), agora
            if self.sobre_ativo and self.painel == qual:
                self.fechar_sobre()
            else:
                self.abrir_sobre("painel", qual)
        elif tipo == "fecharSobre":
            self.fechar_sobre()
        elif tipo == "bloquear" and not LIVE:
            self.bloqueada = True
            self.abrir_sobre("bloqueio")
        elif tipo == "desbloquear-teste" and os.environ.get("ALBA_DEPURAR") == "1":
            self.bloqueada = False  # só nos testes automáticos (sem teclado de verdade)
            self.fechar_sobre()
        elif tipo == "desbloqueado":
            self.bloqueada = False
            self.fechar_sobre()
        elif tipo == "regiao" and origem is self.dock:
            self.dock.definir_regiao(m.get("x", 0), m.get("y", 0), m.get("l", 1), m.get("a", 1))
        elif tipo == "escala":
            for s in (self.fundo, self.barra, self.dock, self.sobre):
                s.redimensionar()


def main():
    GLib.set_prgname("alba-casca")
    sys.exit(Casca().run([]))


if __name__ == "__main__":
    main()
