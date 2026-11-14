            // lumen-relogio: relógio grande do Lúmen (data em cima, hora grande embaixo)
            Component.onCompleted: {
                try {
                    const linhaData = clock.children[0];
                    const linhaHora = clock.children[1];
                    if (!linhaData || !linhaHora) {
                        return;
                    }
                    const atualizar = function () {
                        const agora = new Date();
                        const data = agora.toLocaleDateString(Qt.locale(), "dddd, d 'de' MMMM");
                        linhaData.text = data.charAt(0).toUpperCase() + data.slice(1);
                        linhaHora.text = agora.toLocaleTimeString(Qt.locale(), "HH:mm");
                    };
                    linhaData.font.pointSize = 20;
                    linhaData.font.weight = Font.DemiBold;
                    linhaData.opacity = 0.92;
                    linhaHora.font.pointSize = 104;
                    linhaHora.font.weight = Font.DemiBold;
                    linhaHora.font.letterSpacing = -2;
                    linhaHora.opacity = 0.9;
                    atualizar();
                    const relogio = Qt.createQmlObject("import QtQuick; Timer { interval: 1000; running: true; repeat: true }", clock, "lumenRelogio");
                    relogio.triggered.connect(atualizar);
                    clock.y = Qt.binding(function () {
                        return Math.max(Math.round(clock.parent.height * 0.07), 24);
                    });
                } catch (erro) {
                    console.warn("Lúmen: mantendo o relógio padrão -", erro);
                }
            }
