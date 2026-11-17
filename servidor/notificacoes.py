"""Histórico de notificações (central de notificações) e "Não perturbe"."""

from __future__ import annotations

import json
import threading
import time
from pathlib import Path

ARQUIVO = Path.home() / ".cache" / "alba" / "notificacoes.json"
LIMITE = 60
_trava = threading.Lock()
_estado = {"lista": [], "nao_perturbe": False, "proximo": 1}


def _carregar():
    try:
        dados = json.loads(ARQUIVO.read_text("utf-8"))
        _estado.update({k: dados[k] for k in ("lista", "nao_perturbe", "proximo") if k in dados})
    except (OSError, ValueError):
        pass


def _gravar():
    try:
        ARQUIVO.parent.mkdir(parents=True, exist_ok=True)
        ARQUIVO.write_text(json.dumps(_estado, ensure_ascii=False), "utf-8")
    except OSError:
        pass


_carregar()


def adicionar(app: str, titulo: str, texto: str, abrir: dict | None = None) -> tuple[dict, bool]:
    """Guarda a notificação. Devolve (notificação, mostrar_aviso)."""
    with _trava:
        n = {"id": _estado["proximo"], "app": (app or "")[:60], "titulo": (titulo or "")[:160],
             "texto": (texto or "")[:400], "abrir": abrir if isinstance(abrir, dict) else None,
             "quando": int(time.time()), "lida": False}
        _estado["proximo"] += 1
        _estado["lista"] = [n, *_estado["lista"]][:LIMITE]
        _gravar()
        return n, not _estado["nao_perturbe"]


def listar() -> dict:
    with _trava:
        return {"lista": list(_estado["lista"]), "nao_perturbe": _estado["nao_perturbe"],
                "nao_lidas": sum(1 for n in _estado["lista"] if not n.get("lida"))}


def marcar_lidas():
    with _trava:
        for n in _estado["lista"]:
            n["lida"] = True
        _gravar()


def apagar(ident: int | None):
    with _trava:
        _estado["lista"] = [] if ident is None else [n for n in _estado["lista"] if n["id"] != ident]
        _gravar()


def nao_perturbe(ligado: bool):
    with _trava:
        _estado["nao_perturbe"] = bool(ligado)
        _gravar()
