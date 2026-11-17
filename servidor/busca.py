"""Busca de arquivos para a busca global (Super+Espaço).

Mantém um índice dos nomes na pasta pessoal (sem pastas ocultas), refeito em segundo plano
no máximo a cada dois minutos, para a busca responder enquanto se digita.
"""

from __future__ import annotations

import os
import threading
import time
import unicodedata
from pathlib import Path

CASA = Path.home()
LIMITE_ITENS = 80_000
VALIDADE = 120

_indice: list[tuple[str, str, bool, float]] = []  # (nome normalizado, caminho, é pasta, modificado)
_feito_em = 0.0
_trava = threading.Lock()
_refazendo = False


def normalizar(texto: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", texto.lower()) if unicodedata.category(c) != "Mn")


def _refazer():
    global _indice, _feito_em, _refazendo
    novo = []
    for raiz, pastas, arquivos in os.walk(CASA):
        pastas[:] = [p for p in pastas if not p.startswith(".") and p not in ("node_modules", "__pycache__")]
        for nome in pastas:
            caminho = os.path.join(raiz, nome)
            novo.append((normalizar(nome), caminho, True, 0.0))
        for nome in arquivos:
            if nome.startswith("."):
                continue
            caminho = os.path.join(raiz, nome)
            try:
                mod = os.stat(caminho).st_mtime
            except OSError:
                mod = 0.0
            novo.append((normalizar(nome), caminho, False, mod))
        if len(novo) >= LIMITE_ITENS:
            break
    with _trava:
        _indice, _feito_em, _refazendo = novo, time.time(), False


def _garantir():
    global _refazendo
    with _trava:
        velho = time.time() - _feito_em > VALIDADE
        vazio = not _indice
        if velho and not _refazendo:
            _refazendo = True
            t = threading.Thread(target=_refazer, daemon=True)
            t.start()
        else:
            t = None
    if vazio and t:
        t.join(4)  # primeira busca: espera um pouco pelo índice


def buscar(termo: str, limite: int = 12) -> list[dict]:
    q = normalizar((termo or "").strip())
    if len(q) < 2:
        return []
    _garantir()
    with _trava:
        indice = _indice
    achados = []
    for nome, caminho, pasta, mod in indice:
        pos = nome.find(q)
        if pos < 0:
            continue
        # começa com o termo > começo de palavra > no meio; pastas e arquivos recentes primeiro
        nota = 0 if pos == 0 else 1 if not nome[pos - 1].isalnum() else 2
        achados.append((nota, -mod, len(nome), caminho, pasta))
    achados.sort()
    return [{"caminho": c, "nome": os.path.basename(c), "pasta": p,
             "onde": os.path.dirname(c).replace(str(CASA), "~", 1)} for _n, _m, _l, c, p in achados[:limite]]
