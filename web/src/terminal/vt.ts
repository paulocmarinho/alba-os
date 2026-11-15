// Emulador de terminal do Lúmen (subconjunto de VT100/xterm suficiente para bash, ls, nano, htop simples).

export type Estilo = {
  fg: string | null;
  bg: string | null;
  negrito: boolean;
  inverso: boolean;
  sublinhado: boolean;
  fraco: boolean;
};

export type Celula = { c: string; e: Estilo };

const PADRAO: Estilo = { fg: null, bg: null, negrito: false, inverso: false, sublinhado: false, fraco: false };

const PALETA = [
  "#1d2b2e", "#e06c75", "#7fd0a0", "#e9c46a", "#6fa8dc", "#c792ea", "#5fc9bd", "#d8e6e2",
  "#4e6266", "#ff8a92", "#9ff0bf", "#ffd98a", "#93c2f0", "#ddb2ff", "#86e5d8", "#ffffff",
];

function cor256(n: number): string {
  if (n < 16) return PALETA[n];
  if (n < 232) {
    const i = n - 16;
    const v = [0, 95, 135, 175, 215, 255];
    return `rgb(${v[Math.floor(i / 36)]},${v[Math.floor(i / 6) % 6]},${v[i % 6]})`;
  }
  const g = 8 + (n - 232) * 10;
  return `rgb(${g},${g},${g})`;
}

const LIMITE_HISTORICO = 2000;

export class TelaTerminal {
  colunas: number;
  linhas: number;
  tela: Celula[][] = [];
  historico: Celula[][] = [];
  cx = 0;
  cy = 0;
  cursorVisivel = true;
  modoAplicacao = false; // DECCKM: setas mandam ESC O A
  colagemComColchetes = false;
  private estilo: Estilo = { ...PADRAO };
  private quebraPendente = false;
  private topo = 0;
  private base = 0;
  private salvo = { x: 0, y: 0, e: { ...PADRAO } };
  private principal: { tela: Celula[][]; cx: number; cy: number } | null = null;
  private estado: "normal" | "esc" | "csi" | "osc" | "conjunto" = "normal";
  private params = "";
  private osc = "";
  responder: (dados: string) => void = () => {};

  constructor(colunas = 80, linhas = 24) {
    this.colunas = colunas;
    this.linhas = linhas;
    this.tela = Array.from({ length: linhas }, () => this.linhaVazia());
    this.base = linhas - 1;
  }

  private celulaVazia(): Celula {
    return { c: " ", e: { ...PADRAO, bg: this.estilo.bg } };
  }

  private linhaVazia(): Celula[] {
    return Array.from({ length: this.colunas }, () => ({ c: " ", e: PADRAO }));
  }

  redimensionar(colunas: number, linhas: number) {
    colunas = Math.max(10, colunas);
    linhas = Math.max(4, linhas);
    if (colunas === this.colunas && linhas === this.linhas) return;
    const ajustar = (l: Celula[]) =>
      l.length >= colunas ? l.slice(0, colunas) : l.concat(Array.from({ length: colunas - l.length }, () => ({ c: " ", e: PADRAO })));
    this.tela = this.tela.map(ajustar);
    this.historico = this.historico.map(ajustar);
    while (this.tela.length > linhas) {
      if (this.cy > 0) {
        const l = this.tela.shift()!;
        if (!this.principal) this.historico.push(l);
        this.cy--;
      } else {
        this.tela.pop();
      }
    }
    while (this.tela.length < linhas) {
      const vinda = !this.principal ? this.historico.pop() : undefined;
      if (vinda) {
        this.tela.unshift(ajustar(vinda));
        this.cy++;
      } else {
        this.tela.push(Array.from({ length: colunas }, () => ({ c: " ", e: PADRAO })));
      }
    }
    this.colunas = colunas;
    this.linhas = linhas;
    this.topo = 0;
    this.base = linhas - 1;
    this.cx = Math.min(this.cx, colunas - 1);
    this.cy = Math.min(this.cy, linhas - 1);
  }

  escrever(dados: string) {
    for (const ch of dados) this.processar(ch);
  }

  private processar(ch: string) {
    const code = ch.codePointAt(0)!;
    switch (this.estado) {
      case "normal":
        if (code === 0x1b) {
          this.estado = "esc";
        } else if (code < 0x20 || code === 0x7f) {
          this.controle(code);
        } else {
          this.imprimir(ch);
        }
        return;
      case "esc":
        this.escape(ch);
        return;
      case "csi":
        if ((code >= 0x30 && code <= 0x3f) || code === 0x20) {
          this.params += ch;
        } else if (code >= 0x40 && code <= 0x7e) {
          this.estado = "normal";
          this.csi(ch, this.params);
          this.params = "";
        } else if (code === 0x1b) {
          this.estado = "esc";
          this.params = "";
        }
        return;
      case "osc":
        if (code === 0x07) {
          this.estado = "normal";
          this.osc = "";
        } else if (code === 0x1b) {
          this.estado = "esc"; // ESC \ termina o OSC
          this.osc = "";
        } else if (this.osc.length < 512) {
          this.osc += ch;
        }
        return;
      case "conjunto":
        this.estado = "normal";
        return;
    }
  }

  private controle(code: number) {
    switch (code) {
      case 0x07:
        break;
      case 0x08:
        if (this.cx > 0) this.cx--;
        this.quebraPendente = false;
        break;
      case 0x09:
        this.cx = Math.min(this.colunas - 1, (Math.floor(this.cx / 8) + 1) * 8);
        break;
      case 0x0a:
      case 0x0b:
      case 0x0c:
        this.avancarLinha();
        break;
      case 0x0d:
        this.cx = 0;
        this.quebraPendente = false;
        break;
    }
  }

  private escape(ch: string) {
    this.estado = "normal";
    switch (ch) {
      case "[":
        this.estado = "csi";
        this.params = "";
        break;
      case "]":
        this.estado = "osc";
        this.osc = "";
        break;
      case "(":
      case ")":
      case "*":
      case "+":
        this.estado = "conjunto";
        break;
      case "7":
        this.salvo = { x: this.cx, y: this.cy, e: { ...this.estilo } };
        break;
      case "8":
        this.cx = this.salvo.x;
        this.cy = this.salvo.y;
        this.estilo = { ...this.salvo.e };
        break;
      case "D":
        this.avancarLinha();
        break;
      case "E":
        this.cx = 0;
        this.avancarLinha();
        break;
      case "M":
        if (this.cy === this.topo) this.rolarAbaixo(1);
        else if (this.cy > 0) this.cy--;
        break;
      case "c":
        this.reiniciar();
        break;
      case "=":
      case ">":
      case "\\":
        break;
    }
  }

  private reiniciar() {
    this.estilo = { ...PADRAO };
    this.tela = Array.from({ length: this.linhas }, () => this.linhaVazia());
    this.cx = 0;
    this.cy = 0;
    this.topo = 0;
    this.base = this.linhas - 1;
    this.cursorVisivel = true;
    this.modoAplicacao = false;
  }

  private imprimir(ch: string) {
    if (this.quebraPendente) {
      this.cx = 0;
      this.avancarLinha();
      this.quebraPendente = false;
    }
    this.tela[this.cy][this.cx] = { c: ch, e: { ...this.estilo } };
    if (this.cx === this.colunas - 1) {
      this.quebraPendente = true;
    } else {
      this.cx++;
    }
  }

  private avancarLinha() {
    this.quebraPendente = false;
    if (this.cy === this.base) {
      this.rolarAcima(1);
    } else if (this.cy < this.linhas - 1) {
      this.cy++;
    }
  }

  private rolarAcima(n: number) {
    for (let i = 0; i < n; i++) {
      const saiu = this.tela.splice(this.topo, 1)[0];
      if (this.topo === 0 && !this.principal) {
        this.historico.push(saiu);
        if (this.historico.length > LIMITE_HISTORICO) this.historico.shift();
      }
      this.tela.splice(this.base, 0, Array.from({ length: this.colunas }, () => this.celulaVazia()));
    }
  }

  private rolarAbaixo(n: number) {
    for (let i = 0; i < n; i++) {
      this.tela.splice(this.base, 1);
      this.tela.splice(this.topo, 0, Array.from({ length: this.colunas }, () => this.celulaVazia()));
    }
  }

  private limparLinha(y: number, de: number, ate: number) {
    for (let x = Math.max(0, de); x <= Math.min(this.colunas - 1, ate); x++) this.tela[y][x] = this.celulaVazia();
  }

  private csi(final: string, bruto: string) {
    const privado = bruto.startsWith("?");
    const nums = (privado ? bruto.slice(1) : bruto).replace(/[ >=!]/g, "").split(";").map((p) => (p === "" ? NaN : parseInt(p, 10)));
    const n = (i: number, padrao = 1) => (Number.isNaN(nums[i]) || nums[i] === undefined || nums[i] === 0 ? padrao : nums[i]);
    this.quebraPendente = false;
    switch (final) {
      case "A":
        this.cy = Math.max(this.cy < this.topo ? 0 : this.topo, this.cy - n(0));
        break;
      case "B":
        this.cy = Math.min(this.cy > this.base ? this.linhas - 1 : this.base, this.cy + n(0));
        break;
      case "C":
        this.cx = Math.min(this.colunas - 1, this.cx + n(0));
        break;
      case "D":
        this.cx = Math.max(0, this.cx - n(0));
        break;
      case "E":
        this.cx = 0;
        this.cy = Math.min(this.linhas - 1, this.cy + n(0));
        break;
      case "F":
        this.cx = 0;
        this.cy = Math.max(0, this.cy - n(0));
        break;
      case "G":
      case "`":
        this.cx = Math.min(this.colunas - 1, n(0) - 1);
        break;
      case "d":
        this.cy = Math.min(this.linhas - 1, n(0) - 1);
        break;
      case "H":
      case "f":
        this.cy = Math.min(this.linhas - 1, n(0) - 1);
        this.cx = Math.min(this.colunas - 1, n(1) - 1);
        break;
      case "J": {
        const modo = Number.isNaN(nums[0]) ? 0 : nums[0];
        if (modo === 0) {
          this.limparLinha(this.cy, this.cx, this.colunas - 1);
          for (let y = this.cy + 1; y < this.linhas; y++) this.limparLinha(y, 0, this.colunas - 1);
        } else if (modo === 1) {
          this.limparLinha(this.cy, 0, this.cx);
          for (let y = 0; y < this.cy; y++) this.limparLinha(y, 0, this.colunas - 1);
        } else {
          for (let y = 0; y < this.linhas; y++) this.limparLinha(y, 0, this.colunas - 1);
          if (modo === 3) this.historico = [];
        }
        break;
      }
      case "K": {
        const modo = Number.isNaN(nums[0]) ? 0 : nums[0];
        if (modo === 0) this.limparLinha(this.cy, this.cx, this.colunas - 1);
        else if (modo === 1) this.limparLinha(this.cy, 0, this.cx);
        else this.limparLinha(this.cy, 0, this.colunas - 1);
        break;
      }
      case "X":
        this.limparLinha(this.cy, this.cx, this.cx + n(0) - 1);
        break;
      case "P": {
        const linha = this.tela[this.cy];
        linha.splice(this.cx, Math.min(n(0), this.colunas - this.cx));
        while (linha.length < this.colunas) linha.push(this.celulaVazia());
        break;
      }
      case "@": {
        const linha = this.tela[this.cy];
        for (let i = 0; i < n(0); i++) linha.splice(this.cx, 0, this.celulaVazia());
        linha.length = this.colunas;
        break;
      }
      case "L":
        if (this.cy >= this.topo && this.cy <= this.base) {
          for (let i = 0; i < n(0); i++) {
            this.tela.splice(this.base, 1);
            this.tela.splice(this.cy, 0, Array.from({ length: this.colunas }, () => this.celulaVazia()));
          }
        }
        break;
      case "M":
        if (this.cy >= this.topo && this.cy <= this.base) {
          for (let i = 0; i < n(0); i++) {
            this.tela.splice(this.cy, 1);
            this.tela.splice(this.base, 0, Array.from({ length: this.colunas }, () => this.celulaVazia()));
          }
        }
        break;
      case "S":
        this.rolarAcima(n(0));
        break;
      case "T":
        this.rolarAbaixo(n(0));
        break;
      case "r":
        this.topo = Math.max(0, n(0) - 1);
        this.base = Math.min(this.linhas - 1, n(1, this.linhas) - 1);
        if (this.base <= this.topo) {
          this.topo = 0;
          this.base = this.linhas - 1;
        }
        this.cx = 0;
        this.cy = 0;
        break;
      case "s":
        this.salvo = { x: this.cx, y: this.cy, e: { ...this.estilo } };
        break;
      case "u":
        this.cx = this.salvo.x;
        this.cy = this.salvo.y;
        break;
      case "m":
        this.sgr(nums);
        break;
      case "n":
        if (nums[0] === 6) this.responder(`\x1b[${this.cy + 1};${this.cx + 1}R`);
        else if (nums[0] === 5) this.responder("\x1b[0n");
        break;
      case "c":
        if (!privado) this.responder("\x1b[?1;2c");
        break;
      case "h":
      case "l": {
        const ligar = final === "h";
        if (privado) {
          for (const m of nums) {
            if (m === 1) this.modoAplicacao = ligar;
            else if (m === 25) this.cursorVisivel = ligar;
            else if (m === 2004) this.colagemComColchetes = ligar;
            else if (m === 1049 || m === 47 || m === 1047) this.telaAlternativa(ligar);
          }
        }
        break;
      }
    }
  }

  private telaAlternativa(ligar: boolean) {
    if (ligar && !this.principal) {
      this.principal = { tela: this.tela, cx: this.cx, cy: this.cy };
      this.tela = Array.from({ length: this.linhas }, () => this.linhaVazia());
      this.cx = 0;
      this.cy = 0;
    } else if (!ligar && this.principal) {
      this.tela = this.principal.tela;
      this.cx = this.principal.cx;
      this.cy = this.principal.cy;
      this.principal = null;
      this.topo = 0;
      this.base = this.linhas - 1;
    }
  }

  private sgr(nums: number[]) {
    if (nums.length === 0 || (nums.length === 1 && Number.isNaN(nums[0]))) {
      this.estilo = { ...PADRAO };
      return;
    }
    for (let i = 0; i < nums.length; i++) {
      const p = Number.isNaN(nums[i]) ? 0 : nums[i];
      if (p === 0) this.estilo = { ...PADRAO };
      else if (p === 1) this.estilo.negrito = true;
      else if (p === 2) this.estilo.fraco = true;
      else if (p === 4) this.estilo.sublinhado = true;
      else if (p === 7) this.estilo.inverso = true;
      else if (p === 22) {
        this.estilo.negrito = false;
        this.estilo.fraco = false;
      } else if (p === 24) this.estilo.sublinhado = false;
      else if (p === 27) this.estilo.inverso = false;
      else if (p >= 30 && p <= 37) this.estilo.fg = PALETA[p - 30];
      else if (p === 39) this.estilo.fg = null;
      else if (p >= 40 && p <= 47) this.estilo.bg = PALETA[p - 40];
      else if (p === 49) this.estilo.bg = null;
      else if (p >= 90 && p <= 97) this.estilo.fg = PALETA[p - 90 + 8];
      else if (p >= 100 && p <= 107) this.estilo.bg = PALETA[p - 100 + 8];
      else if (p === 38 || p === 48) {
        let cor: string | null = null;
        if (nums[i + 1] === 5) {
          cor = cor256(nums[i + 2] ?? 0);
          i += 2;
        } else if (nums[i + 1] === 2) {
          cor = `rgb(${nums[i + 2] ?? 0},${nums[i + 3] ?? 0},${nums[i + 4] ?? 0})`;
          i += 4;
        }
        if (p === 38) this.estilo.fg = cor;
        else this.estilo.bg = cor;
      }
    }
  }

  /** Teclas especiais para o que o terminal espera receber. */
  tecla(e: { key: string; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }): string | null {
    const app = this.modoAplicacao;
    const setas: Record<string, string> = { ArrowUp: "A", ArrowDown: "B", ArrowRight: "C", ArrowLeft: "D" };
    if (setas[e.key]) return (app ? "\x1bO" : "\x1b[") + setas[e.key];
    const mapa: Record<string, string> = {
      Enter: "\r",
      Backspace: "\x7f",
      Tab: "\t",
      Escape: "\x1b",
      Home: "\x1b[H",
      End: "\x1b[F",
      Delete: "\x1b[3~",
      Insert: "\x1b[2~",
      PageUp: "\x1b[5~",
      PageDown: "\x1b[6~",
      F1: "\x1bOP",
      F2: "\x1bOQ",
      F3: "\x1bOR",
      F4: "\x1bOS",
      F5: "\x1b[15~",
      F6: "\x1b[17~",
      F7: "\x1b[18~",
      F8: "\x1b[19~",
      F9: "\x1b[20~",
      F10: "\x1b[21~",
      F11: "\x1b[23~",
      F12: "\x1b[24~",
    };
    if (e.key === "Tab" && e.shiftKey) return "\x1b[Z";
    if (mapa[e.key]) return mapa[e.key];
    if (e.ctrlKey && !e.altKey && e.key.length === 1) {
      const k = e.key.toLowerCase();
      if (k >= "a" && k <= "z") return String.fromCharCode(k.charCodeAt(0) - 96);
      if (k === "[") return "\x1b";
      if (k === "\\") return "\x1c";
      if (k === "]") return "\x1d";
      if (k === " ") return "\x00";
    }
    if (e.altKey && !e.ctrlKey && e.key.length === 1) return "\x1b" + e.key;
    return null;
  }
}
