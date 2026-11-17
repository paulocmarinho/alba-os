"""Servidor de notificações (org.freedesktop.Notifications).

Programas como o Firefox avisam "download concluído" por aqui. Sem um servidor, essas
notificações sumiam. A casca mostra cada uma como um aviso por cima da tela.
"""

from __future__ import annotations

from gi.repository import Gio, GLib

XML = """
<node>
  <interface name="org.freedesktop.Notifications">
    <method name="Notify">
      <arg type="s" direction="in"/><arg type="u" direction="in"/><arg type="s" direction="in"/>
      <arg type="s" direction="in"/><arg type="s" direction="in"/><arg type="as" direction="in"/>
      <arg type="a{sv}" direction="in"/><arg type="i" direction="in"/><arg type="u" direction="out"/>
    </method>
    <method name="CloseNotification"><arg type="u" direction="in"/></method>
    <method name="GetCapabilities"><arg type="as" direction="out"/></method>
    <method name="GetServerInformation">
      <arg type="s" direction="out"/><arg type="s" direction="out"/><arg type="s" direction="out"/><arg type="s" direction="out"/>
    </method>
    <signal name="NotificationClosed"><arg type="u"/><arg type="u"/></signal>
    <signal name="ActionInvoked"><arg type="u"/><arg type="s"/></signal>
  </interface>
</node>
"""


class Notificacoes:
    def __init__(self, mostrar):
        """mostrar(app, titulo, texto) é chamado para cada notificação."""
        self.mostrar = mostrar
        self.proximo = 1
        self.conexao = None
        info = Gio.DBusNodeInfo.new_for_xml(XML)
        self.interface = info.interfaces[0]
        Gio.bus_own_name(Gio.BusType.SESSION, "org.freedesktop.Notifications",
                         Gio.BusNameOwnerFlags.REPLACE, self._adquirido, None, None)

    def _adquirido(self, conexao, _nome):
        self.conexao = conexao
        conexao.register_object("/org/freedesktop/Notifications", self.interface, self._chamada, None, None)

    def _chamada(self, conexao, _remetente, caminho, interface, metodo, params, chamada):
        if metodo == "Notify":
            app, substitui, _icone, titulo, corpo, _acoes, dicas, _tempo = params.unpack()
            desktop = str((dicas or {}).get("desktop-entry") or "")
            ident = substitui or self.proximo
            if not substitui:
                self.proximo += 1
            try:
                self.mostrar(app, titulo, _sem_marcacao(corpo), desktop)
            except Exception:  # noqa: BLE001
                pass
            chamada.return_value(GLib.Variant("(u)", (ident,)))
        elif metodo == "CloseNotification":
            (ident,) = params.unpack()
            conexao.emit_signal(None, caminho, interface, "NotificationClosed", GLib.Variant("(uu)", (ident, 3)))
            chamada.return_value(None)
        elif metodo == "GetCapabilities":
            chamada.return_value(GLib.Variant("(as)", (["body"],)))
        elif metodo == "GetServerInformation":
            chamada.return_value(GLib.Variant("(ssss)", ("Alba", "Alba OS", "1.0", "1.2")))


def _sem_marcacao(texto: str) -> str:
    import re
    return re.sub(r"<[^>]+>", "", texto or "").strip()
