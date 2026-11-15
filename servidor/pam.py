"""Confere a senha de um usuário pelo PAM do sistema, sem bibliotecas extras (só ctypes)."""

import ctypes
import ctypes.util
import os

_libpam = ctypes.CDLL(ctypes.util.find_library("pam") or "libpam.so.0")
_libc = ctypes.CDLL(ctypes.util.find_library("c") or "libc.so.6")

PAM_PROMPT_ECHO_OFF = 1
PAM_PROMPT_ECHO_ON = 2
PAM_SUCCESS = 0


class _PamHandle(ctypes.Structure):
    _fields_ = [("handle", ctypes.c_void_p)]


class _PamMessage(ctypes.Structure):
    _fields_ = [("msg_style", ctypes.c_int), ("msg", ctypes.c_char_p)]


class _PamResponse(ctypes.Structure):
    _fields_ = [("resp", ctypes.c_char_p), ("resp_retcode", ctypes.c_int)]


_CONV_FUNC = ctypes.CFUNCTYPE(
    ctypes.c_int,
    ctypes.c_int,
    ctypes.POINTER(ctypes.POINTER(_PamMessage)),
    ctypes.POINTER(ctypes.POINTER(_PamResponse)),
    ctypes.c_void_p,
)


class _PamConv(ctypes.Structure):
    _fields_ = [("conv", _CONV_FUNC), ("appdata_ptr", ctypes.c_void_p)]


_pam_start = _libpam.pam_start
_pam_start.restype = ctypes.c_int
_pam_start.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.POINTER(_PamConv), ctypes.POINTER(_PamHandle)]

_pam_authenticate = _libpam.pam_authenticate
_pam_authenticate.restype = ctypes.c_int
_pam_authenticate.argtypes = [_PamHandle, ctypes.c_int]

_pam_acct_mgmt = _libpam.pam_acct_mgmt
_pam_acct_mgmt.restype = ctypes.c_int
_pam_acct_mgmt.argtypes = [_PamHandle, ctypes.c_int]

_pam_end = _libpam.pam_end
_pam_end.restype = ctypes.c_int
_pam_end.argtypes = [_PamHandle, ctypes.c_int]

_calloc = _libc.calloc
_calloc.restype = ctypes.c_void_p
_calloc.argtypes = [ctypes.c_size_t, ctypes.c_size_t]

_strdup = _libc.strdup
_strdup.restype = ctypes.c_void_p
_strdup.argtypes = [ctypes.c_char_p]


def _servico():
    """Usa o serviço PAM do Alba se existir; senão, o de login do sistema."""
    for nome in ("alba", "login", "other"):
        if os.path.exists(f"/etc/pam.d/{nome}"):
            return nome
    return "login"


def autenticar(usuario: str, senha: str) -> bool:
    senha_b = senha.encode("utf-8")

    @_CONV_FUNC
    def conversa(n_mensagens, mensagens, respostas, _dados):
        endereco = _calloc(n_mensagens, ctypes.sizeof(_PamResponse))
        respostas[0] = ctypes.cast(endereco, ctypes.POINTER(_PamResponse))
        for i in range(n_mensagens):
            if mensagens[i].contents.msg_style in (PAM_PROMPT_ECHO_OFF, PAM_PROMPT_ECHO_ON):
                respostas[0][i].resp = ctypes.cast(_strdup(senha_b), ctypes.c_char_p)
                respostas[0][i].resp_retcode = 0
        return PAM_SUCCESS

    alca = _PamHandle()
    conv = _PamConv(conversa, None)
    if _pam_start(_servico().encode(), usuario.encode("utf-8"), ctypes.byref(conv), ctypes.byref(alca)) != PAM_SUCCESS:
        return False
    try:
        if _pam_authenticate(alca, 0) != PAM_SUCCESS:
            return False
        return _pam_acct_mgmt(alca, 0) == PAM_SUCCESS
    finally:
        _pam_end(alca, 0)
