// Layout do Lumen para o Plasma 6.
// Executado pelo instalador via D-Bus (org.kde.PlasmaShell.evaluateScript).
// O instalador troca os marcadores de LOGO e WALLPAPER pelos caminhos reais.

var LOGO = "@LOGO@";
var WALLPAPER = "@WALLPAPER@";

var LANCADORES = [
  "applications:org.kde.dolphin.desktop",   // Prisma
  "applications:firefox.desktop",
  "applications:org.kde.discover.desktop",
  "applications:steam.desktop",
  "applications:heroic.desktop",
  "applications:net.lutris.Lutris.desktop",
  "applications:org.kde.konsole.desktop",
  "applications:systemsettings.desktop"
];

function tentar(fn) {
  try { fn(); } catch (e) { print("Lumen: ignorado -> " + e); }
}

// 1. Remove os painéis atuais para montar do zero.
panels().forEach(function (p) { p.remove(); });

// 2. Barra superior completa.
var topo = new Panel;
topo.location = "top";
topo.height = 34;
tentar(function () { topo.floating = false; });
tentar(function () { topo.lengthMode = "fill"; });
topo.hiding = "none";

var menu = topo.addWidget("org.kde.plasma.kickoff");
menu.currentConfigGroup = ["General"];
menu.writeConfig("icon", LOGO);
menu.writeConfig("menuLabel", "Aplicativos");
menu.writeConfig("favoritesDisplay", 0);

tentar(function () { topo.addWidget("org.kde.plasma.appmenu"); });
topo.addWidget("org.kde.plasma.panelspacer");

var bandeja = topo.addWidget("org.kde.plasma.systemtray");

var relogio = topo.addWidget("org.kde.plasma.digitalclock");
relogio.currentConfigGroup = ["Appearance"];
relogio.writeConfig("showDate", true);
relogio.writeConfig("dateDisplayFormat", "BesideTime");
relogio.writeConfig("dateFormat", "custom");
relogio.writeConfig("customDateFormat", "dddd, d 'de' MMMM 'de' yyyy");
relogio.writeConfig("use24hFormat", 2);
relogio.writeConfig("showSeconds", 0);

// 3. Dock flutuante embaixo.
var dock = new Panel;
dock.location = "bottom";
dock.height = 68;
tentar(function () { dock.floating = true; });
tentar(function () { dock.lengthMode = "fit"; });
tentar(function () { dock.alignment = "center"; });
dock.hiding = "dodgewindows";

var tarefas = dock.addWidget("org.kde.plasma.icontasks");
tarefas.currentConfigGroup = ["General"];
tarefas.writeConfig("launchers", LANCADORES);
tarefas.writeConfig("showOnlyCurrentDesktop", false);
tarefas.writeConfig("groupingStrategy", 1);
tarefas.writeConfig("indicateAudioStreams", true);
tarefas.writeConfig("iconSpacing", 2);

// 4. Papel de parede em todas as áreas de trabalho.
desktops().forEach(function (d) {
  d.wallpaperPlugin = "org.kde.image";
  d.currentConfigGroup = ["Wallpaper", "org.kde.image", "General"];
  d.writeConfig("Image", "file://" + WALLPAPER);
  d.writeConfig("FillMode", 2);
});

print("Lumen: layout aplicado.");
