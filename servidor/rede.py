"""Rede pelo NetworkManager (nmcli): Wi-Fi, cabo e conexão atual."""

from __future__ import annotations

import re
import shutil
import subprocess


class ErroRede(Exception):
    pass


def _nmcli(*args, tempo=20):
    if not shutil.which("nmcli"):
        raise ErroRede("O gerenciador de rede não está instalado.")
    try:
        r = subprocess.run(["nmcli", *args], capture_output=True, text=True, timeout=tempo,
                           env={"LANG": "C", "LC_ALL": "C", "PATH": "/usr/bin:/bin"})
    except subprocess.TimeoutExpired as e:
        raise ErroRede("A rede demorou demais para responder.") from e
    return r.returncode, r.stdout, r.stderr


def _campos(linha: str) -> list[str]:
    """Separa uma linha do "nmcli -t" (":" separa campos; "\\:" é dois-pontos de verdade)."""
    return [p.replace("\\:", ":").replace("\\\\", "\\") for p in re.split(r"(?<!\\):", linha)]


def estado() -> dict:
    dispositivos = []
    cod, saida, _ = _nmcli("-t", "-f", "DEVICE,TYPE,STATE,CONNECTION", "device")
    if cod == 0:
        for linha in saida.splitlines():
            p = _campos(linha)
            if len(p) < 4 or p[1] not in ("wifi", "ethernet"):
                continue
            dispositivos.append({"dispositivo": p[0], "tipo": p[1], "estado": p[2],
                                 "conectado": p[2].startswith("connected"), "nome": p[3] if p[3] != "--" else ""})
    cod, saida, _ = _nmcli("radio", "wifi")
    wifi_ligado = cod == 0 and saida.strip() == "enabled"
    tem_wifi = any(d["tipo"] == "wifi" for d in dispositivos)
    cabo = next((d for d in dispositivos if d["tipo"] == "ethernet" and d["conectado"]), None)
    wifi = next((d for d in dispositivos if d["tipo"] == "wifi" and d["conectado"]), None)
    sinal = None
    if wifi:
        for rede in redes(rescan=False):
            if rede["ativa"]:
                sinal = rede["sinal"]
                break
    return {
        "tem_wifi": tem_wifi,
        "wifi_ligado": wifi_ligado,
        "wifi": {"nome": wifi["nome"], "sinal": sinal} if wifi else None,
        "cabo": {"nome": cabo["nome"] or "Cabo", "dispositivo": cabo["dispositivo"]} if cabo else None,
        "online": bool(wifi or cabo),
    }


def redes(rescan: bool = True) -> list[dict]:
    cod, saida, _ = _nmcli("-t", "-f", "IN-USE,SSID,SIGNAL,SECURITY", "device", "wifi", "list",
                           "--rescan", "yes" if rescan else "no", tempo=30)
    if cod != 0:
        return []
    vistas: dict[str, dict] = {}
    for linha in saida.splitlines():
        p = _campos(linha)
        if len(p) < 4 or not p[1]:
            continue  # redes ocultas não têm nome
        ssid = p[1]
        try:
            sinal = int(p[2])
        except ValueError:
            sinal = 0
        seguranca = p[3].strip()
        item = {"ssid": ssid, "sinal": sinal, "segura": seguranca not in ("", "--"),
                "empresarial": "802.1X" in seguranca, "ativa": p[0].strip() == "*"}
        antiga = vistas.get(ssid)
        if not antiga or item["ativa"] or (not antiga["ativa"] and sinal > antiga["sinal"]):
            vistas[ssid] = item
    salvas = conexoes_salvas()
    lista = list(vistas.values())
    for r in lista:
        r["salva"] = r["ssid"] in salvas
    lista.sort(key=lambda r: (not r["ativa"], not r["salva"], -r["sinal"]))
    return lista


def conexoes_salvas() -> set[str]:
    cod, saida, _ = _nmcli("-t", "-f", "NAME,TYPE", "connection", "show")
    if cod != 0:
        return set()
    return {p[0] for p in (_campos(l) for l in saida.splitlines()) if len(p) >= 2 and p[1] == "802-11-wireless"}


def _erro(saida: str, erro: str) -> str:
    texto = (erro or saida).strip()
    if "Secrets were required" in texto or "802-11-wireless-security.psk" in texto or "password" in texto.lower():
        return "Senha incorreta."
    if "No network with SSID" in texto:
        return "Essa rede não está mais ao alcance."
    if "Not authorized" in texto or "not authorized" in texto:
        return "Sem permissão para mudar a rede. Atualize o Alba em Ajustes › Sobre."
    return texto.splitlines()[-1].replace("Error: ", "") if texto else "Não consegui conectar."


def ligar_wifi(ligado: bool):
    cod, saida, erro = _nmcli("radio", "wifi", "on" if ligado else "off")
    if cod != 0:
        raise ErroRede(_erro(saida, erro))


def conectar(ssid: str, senha: str | None):
    ssid = (ssid or "").strip()
    if not ssid or len(ssid) > 64:
        raise ErroRede("Escolha uma rede.")
    if ssid in conexoes_salvas() and not senha:
        cod, saida, erro = _nmcli("connection", "up", "id", ssid, tempo=45)
    else:
        args = ["device", "wifi", "connect", ssid]
        if senha:
            if len(senha) < 8:
                raise ErroRede("A senha de Wi-Fi tem pelo menos 8 caracteres.")
            args += ["password", senha]
        cod, saida, erro = _nmcli(*args, tempo=45)
        if cod != 0 and ssid not in {r for r in conexoes_ativas()}:
            # Uma tentativa com senha errada deixa uma conexão salva quebrada: apaga.
            _nmcli("connection", "delete", "id", ssid)
    if cod != 0:
        raise ErroRede(_erro(saida, erro))


def conexoes_ativas() -> list[str]:
    cod, saida, _ = _nmcli("-t", "-f", "NAME", "connection", "show", "--active")
    return [l.replace("\\:", ":") for l in saida.splitlines()] if cod == 0 else []


def desconectar():
    cod, saida, _ = _nmcli("-t", "-f", "DEVICE,TYPE,STATE", "device")
    for linha in saida.splitlines():
        p = _campos(linha)
        if len(p) >= 3 and p[1] == "wifi" and p[2].startswith("connected"):
            _nmcli("device", "disconnect", p[0])


def esquecer(ssid: str):
    cod, saida, erro = _nmcli("connection", "delete", "id", ssid)
    if cod != 0:
        raise ErroRede(_erro(saida, erro))
