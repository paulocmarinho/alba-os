"""Um app do Alba (Arquivos, Terminal, Notas, Ajustes, Sleeve…) como janela de verdade.

Uso: alba-app <app> [props-em-json]
Cada app roda com um id próprio (org.alba.<app>), então o dock e o gerenciador de janelas
o reconhecem como um programa à parte. Abrir de novo um app "único" (Ajustes, Sleeve)
traz a janela que já existe para frente.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from comum import APPS, Pagina, abrir_app, escala, publicar  # noqa: E402
from gi.repository import Gdk, Gio, GLib, Gtk  # noqa: E402


class AppAlba(Gtk.Application):
    def __init__(self, app: str):
        super().__init__(application_id=f"org.alba.{app}", flags=Gio.ApplicationFlags.HANDLES_COMMAND_LINE)
        self.app = app
        self.definicao = APPS[app]
        self.paginas: dict[Gtk.Window, Pagina] = {}
        self.antes_mini: dict[Gtk.Window, tuple[int, int]] = {}

    def do_command_line(self, linha):
        args = linha.get_arguments()
        try:
            props = json.loads(args[2]) if len(args) > 2 and args[2] else {}
        except ValueError:
            props = {}
        janelas = list(self.paginas)
        if janelas and (self.definicao["unico"] or props.get("abrir")):
            janela = janelas[-1]
            if props:
                self.paginas[janela].enviar({"tipo": "props", "props": props})
            janela.present()
        else:
            self.nova_janela(props)
        return 0

    def nova_janela(self, props: dict):
        z = escala()
        janela = Gtk.ApplicationWindow(application=self, title=self.definicao["nome"])
        janela.set_default_size(round(self.definicao["largura"] * z), round(self.definicao["altura"] * z))
        sem_moldura = bool(self.definicao.get("sem_moldura"))
        if sem_moldura:
            janela.set_decorated(False)
        pagina = Pagina({"app": self.app, "props": json.dumps(props, ensure_ascii=False)},
                        lambda m: self.mensagem(janela, m), transparente=sem_moldura)
        pagina.view.connect("notify::title", lambda v, _p: janela.set_title(v.get_title() or self.definicao["nome"]))
        janela.set_child(pagina.view)
        janela.connect("close-request", self.ao_fechar)
        self.paginas[janela] = pagina
        if self.app == "instalador" and Path("/run/archiso").is_dir():
            janela.maximize()
        janela.present()

    def ao_fechar(self, janela):
        pagina = self.paginas.get(janela)
        if pagina is not None and self.app == "musica" and getattr(janela, "_tocando", False):
            janela.minimize()  # como a bandeja do Windows: a música continua
            return True
        self.paginas.pop(janela, None)
        return False

    def _arrastar(self, janela, m, redimensionar=None):
        superficie = janela.get_surface()
        assento = Gdk.Display.get_default().get_default_seat()
        if superficie is None or assento is None:
            return
        z = escala()
        x, y = float(m.get("x", 0)) * z, float(m.get("y", 0)) * z
        ponteiro = assento.get_pointer()
        if redimensionar is None:
            superficie.begin_move(ponteiro, 1, x, y, Gdk.CURRENT_TIME)
        else:
            superficie.begin_resize(redimensionar, ponteiro, 1, x, y, Gdk.CURRENT_TIME)

    def mensagem(self, janela: Gtk.Window, m: dict):
        tipo = m.get("tipo")
        pagina = self.paginas.get(janela)
        if tipo == "titulo":
            janela.set_title(str(m.get("titulo") or self.definicao["nome"]))
        elif tipo == "fechar":
            janela.close()
        elif tipo == "fecharMesmo":
            self.paginas.pop(janela, None)
            janela.destroy()
        elif tipo == "minimizar":
            janela.minimize()
        elif tipo == "maximizar":
            janela.unmaximize() if janela.is_maximized() else janela.maximize()
        elif tipo == "mover":
            self._arrastar(janela, m)
        elif tipo == "redimensionar":
            bordas = {
                "top": Gdk.SurfaceEdge.NORTH, "bottom": Gdk.SurfaceEdge.SOUTH, "left": Gdk.SurfaceEdge.WEST,
                "right": Gdk.SurfaceEdge.EAST, "topleft": Gdk.SurfaceEdge.NORTH_WEST, "topright": Gdk.SurfaceEdge.NORTH_EAST,
                "bottomleft": Gdk.SurfaceEdge.SOUTH_WEST, "bottomright": Gdk.SurfaceEdge.SOUTH_EAST,
            }
            self._arrastar(janela, m, bordas.get(str(m.get("borda")), Gdk.SurfaceEdge.SOUTH_EAST))
        elif tipo == "mini":
            z = escala()
            if janela in self.antes_mini:
                l, a = self.antes_mini.pop(janela)
                janela.set_default_size(l, a)
            else:
                if janela.is_maximized():
                    janela.unmaximize()
                self.antes_mini[janela] = (janela.get_width(), janela.get_height())
                janela.set_default_size(round(380 * z), round(100 * z))
        elif tipo == "tocando":
            janela._tocando = bool(m.get("tocando"))
        elif tipo == "abrir":
            abrir_app(str(m.get("app")), m.get("props") or {})
        elif tipo == "escala" and pagina:
            pagina.definir_escala(escala())
        elif tipo == "publicar":
            publicar(m.get("evento") or {})


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in APPS:
        print("Uso: alba-app <" + "|".join(APPS) + "> [props-json]", file=sys.stderr)
        sys.exit(2)
    GLib.set_prgname(f"org.alba.{sys.argv[1]}")
    sys.exit(AppAlba(sys.argv[1]).run(sys.argv))


if __name__ == "__main__":
    main()
