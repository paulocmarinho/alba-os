#!/usr/bin/env python3
"""Cria o tema Kvantum "LumenGlass" a partir de um tema translúcido que já vem com o Kvantum.

Copia o SVG do tema base e reescreve as cores e as opções de transparência
para o visual do Lumen (vidro claro, destaque #2f8c80).

Uso: criar-lumen-kvantum.py [pasta_destino]
Padrão do destino: ~/.config/Kvantum/LumenGlass
"""
import configparser
import pathlib
import shutil
import sys

BASES = ["KvGlass", "KvFlatLight", "KvSimplicity", "KvArc"]
ORIGENS = [pathlib.Path("/usr/share/Kvantum"), pathlib.Path.home() / ".config/Kvantum"]

GERAL = {
    "author": "Lumen",
    "comment": "Vidro claro do Lumen OS",
    "composite": "true",
    "translucent_windows": "true",
    "blurring": "true",
    "popup_blurring": "true",
    "reduce_window_opacity": "18",
    "reduce_menu_opacity": "12",
    "menu_shadow_depth": "7",
    "tooltip_shadow_depth": "6",
    "spread_menuitems": "true",
}

CORES = {
    "window.color": "#eef6f3",
    "base.color": "#f8fcfa",
    "alt.base.color": "#eef6f3",
    "button.color": "#e6f0ed",
    "light.color": "#ffffff",
    "mid.light.color": "#f4faf7",
    "dark.color": "#a9bfb9",
    "mid.color": "#d3e3de",
    "highlight.color": "#2f8c80",
    "inactive.highlight.color": "#63bca7",
    "text.color": "#17211f",
    "window.text.color": "#17211f",
    "button.text.color": "#17211f",
    "disabled.text.color": "#17211f70",
    "tooltip.text.color": "#17211f",
    "highlight.text.color": "#ffffff",
    "link.color": "#23766c",
    "link.visited.color": "#5b6f9e",
    "progress.indicator.text.color": "#ffffff",
}


def achar_base():
    for nome in BASES:
        for origem in ORIGENS:
            pasta = origem / nome
            cfg = pasta / f"{nome}.kvconfig"
            svg = pasta / f"{nome}.svg"
            if cfg.is_file() and svg.is_file():
                return nome, cfg, svg
    return None


def main():
    destino = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path.home() / ".config/Kvantum/LumenGlass"
    base = achar_base()
    if base is None:
        print("Nenhum tema base do Kvantum encontrado. Instale o pacote 'kvantum'.", file=sys.stderr)
        return 1
    nome, cfg_base, svg_base = base

    cfg = configparser.ConfigParser(interpolation=None, strict=False, comment_prefixes=("#", ";"))
    cfg.optionxform = str
    cfg.read(cfg_base, encoding="utf-8")

    for secao, valores in (("%General", GERAL), ("GeneralColors", CORES)):
        if not cfg.has_section(secao):
            cfg.add_section(secao)
        for chave, valor in valores.items():
            cfg.set(secao, chave, valor)

    destino.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(svg_base, destino / "LumenGlass.svg")
    with open(destino / "LumenGlass.kvconfig", "w", encoding="utf-8") as f:
        cfg.write(f, space_around_delimiters=False)

    principal = destino.parent / "kvantum.kvconfig"
    with open(principal, "w", encoding="utf-8") as f:
        f.write("[General]\ntheme=LumenGlass\n")

    print(f"LumenGlass criado a partir de {nome} em {destino}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
