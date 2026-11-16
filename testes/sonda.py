"""Sonda: confere se GTK4 + layer-shell + WebKitGTK + pywayland funcionam no compositor sem tela."""
import os, sys
import gi
gi.require_version("Gtk", "4.0")
gi.require_version("Gtk4LayerShell", "1.0")
gi.require_version("WebKit", "6.0")
from gi.repository import Gtk, Gdk, GLib, WebKit, Gtk4LayerShell as LS

app = Gtk.Application(application_id="alba.sonda")

def ativar(app):
    css = Gtk.CssProvider(); css.load_from_string("window { background: transparent; }")
    Gtk.StyleContext.add_provider_for_display(Gdk.Display.get_default(), css, 800)
    barra = Gtk.Window(application=app)
    LS.init_for_window(barra); LS.set_layer(barra, LS.Layer.TOP)
    for b in (LS.Edge.TOP, LS.Edge.LEFT, LS.Edge.RIGHT): LS.set_anchor(barra, b, True)
    LS.auto_exclusive_zone_enable(barra)
    barra.set_default_size(-1, 36)
    v = WebKit.WebView(); v.set_background_color(Gdk.RGBA(0, 0, 0, 0))
    v.load_html("<body style='margin:0;background:rgba(200,220,255,.7);font:14px sans-serif'>Barra do Alba (layer-shell + WebKit)</body>", None)
    barra.set_child(v); barra.present()
    j = Gtk.Window(application=app, title="Janela WebKit")
    j.set_default_size(640, 400)
    w = WebKit.WebView(); w.load_html("<h1 style='font-family:sans-serif'>Janela comum (xdg-toplevel)</h1>", None)
    j.set_child(w); j.present()
    print("LS suportado:", LS.is_supported(), flush=True)

app.connect("activate", ativar)
app.run([])
