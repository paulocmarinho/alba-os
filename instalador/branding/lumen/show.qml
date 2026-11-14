/* Slides mostrados durante a instalação do Lúmen OS. */
import QtQuick 2.15
import calamares.slideshow 1.0

Presentation {
    id: presentation

    function nextSlide() {
        presentation.goToNextSlide();
    }

    Timer {
        id: avancar
        interval: 7000
        running: presentation.activatedInCalamares
        repeat: true
        onTriggered: nextSlide()
    }

    Slide {
        Rectangle { anchors.fill: parent; color: "#eef6f3" }
        Image {
            id: tela1
            source: "tela1.png"
            width: parent.width * 0.82
            height: parent.height * 0.7
            fillMode: Image.PreserveAspectFit
            smooth: true
            anchors.horizontalCenter: parent.horizontalCenter
            anchors.top: parent.top
            anchors.topMargin: parent.height * 0.05
        }
        Text {
            id: titulo1
            anchors.top: tela1.bottom
            anchors.topMargin: 16
            anchors.horizontalCenter: parent.horizontalCenter
            text: "Seu espaço, com luz própria"
            font.pixelSize: 24
            font.weight: Font.DemiBold
            color: "#17211f"
        }
        Text {
            anchors.top: titulo1.bottom
            anchors.topMargin: 6
            anchors.horizontalCenter: parent.horizontalCenter
            text: "Vidro, cores suaves e tudo no lugar certo."
            font.pixelSize: 15
            color: "#5d706c"
        }
    }

    Slide {
        Rectangle { anchors.fill: parent; color: "#eef6f3" }
        Image {
            id: tela2
            source: "tela2.png"
            width: parent.width * 0.82
            height: parent.height * 0.7
            fillMode: Image.PreserveAspectFit
            smooth: true
            anchors.horizontalCenter: parent.horizontalCenter
            anchors.top: parent.top
            anchors.topMargin: parent.height * 0.05
        }
        Text {
            id: titulo2
            anchors.top: tela2.bottom
            anchors.topMargin: 16
            anchors.horizontalCenter: parent.horizontalCenter
            text: "Pronto para jogar"
            font.pixelSize: 24
            font.weight: Font.DemiBold
            color: "#17211f"
        }
        Text {
            anchors.top: titulo2.bottom
            anchors.topMargin: 6
            anchors.horizontalCenter: parent.horizontalCenter
            text: "Steam, Proton, GameMode e MangoHud já vêm instalados."
            font.pixelSize: 15
            color: "#5d706c"
        }
    }

    Slide {
        Rectangle { anchors.fill: parent; color: "#eef6f3" }
        Image {
            id: tela3
            source: "tela3.png"
            width: parent.width * 0.82
            height: parent.height * 0.7
            fillMode: Image.PreserveAspectFit
            smooth: true
            anchors.horizontalCenter: parent.horizontalCenter
            anchors.top: parent.top
            anchors.topMargin: parent.height * 0.05
        }
        Text {
            id: titulo3
            anchors.top: tela3.bottom
            anchors.topMargin: 16
            anchors.horizontalCenter: parent.horizontalCenter
            text: "Do seu jeito"
            font.pixelSize: 24
            font.weight: Font.DemiBold
            color: "#17211f"
        }
        Text {
            anchors.top: titulo3.bottom
            anchors.topMargin: 6
            anchors.horizontalCenter: parent.horizontalCenter
            text: "Tema claro ou escuro e cor de destaque, direto nas configurações."
            font.pixelSize: 15
            color: "#5d706c"
        }
    }

    function onActivate() {
        presentation.currentSlide = 0;
    }

    function onLeave() {
    }
}
