// A cor do Alba acompanha o dia: o "vidro" da barra, do dock, dos painéis e da barra de título
// das janelas ganha um tom diferente na madrugada, de manhã, durante o dia, à tarde e à noite.
// A mesma tabela existe em sistema/casca/tema_janelas.py (para a barra de título do labwc).
import type { Config } from "./api";

export type Fase = "madrugada" | "manha" | "dia" | "tarde" | "noite";

type Tom = { vidro: string; borda: string; brilho: string };

export const FASES: Record<Fase, { nome: string; destaque: string; claro: Tom; escuro: Tom }> = {
  madrugada: {
    nome: "Madrugada",
    destaque: "#7a6ff0",
    claro: { vidro: "#ebeaf5", borda: "#d9d6ec", brilho: "#9d8cf2" },
    escuro: { vidro: "#1b1a2e", borda: "#2c2a48", brilho: "#8f82f5" },
  },
  manha: {
    nome: "Manhã",
    destaque: "#e0662f",
    claro: { vidro: "#f7eee8", borda: "#ecdccf", brilho: "#f39a62" },
    escuro: { vidro: "#241d22", borda: "#3a2e33", brilho: "#f08a55" },
  },
  dia: {
    nome: "Dia",
    destaque: "#2f7fe0",
    claro: { vidro: "#eef2f8", borda: "#d8dfeb", brilho: "#6fb2f2" },
    escuro: { vidro: "#1d2033", borda: "#2d3250", brilho: "#5ea5ee" },
  },
  tarde: {
    nome: "Fim de tarde",
    destaque: "#d9822b",
    claro: { vidro: "#f6ece0", borda: "#eadac6", brilho: "#f2b257" },
    escuro: { vidro: "#251f1d", borda: "#3b312b", brilho: "#eba54c" },
  },
  noite: {
    nome: "Noite",
    destaque: "#5b6ee1",
    claro: { vidro: "#e7eaf4", borda: "#d3d8ea", brilho: "#7d8ff0" },
    escuro: { vidro: "#171a2f", borda: "#272c4c", brilho: "#7385f0" },
  },
};

const NEUTRO = { claro: FASES.dia.claro, escuro: FASES.dia.escuro };

export function faseDoDia(d: Date): Fase {
  const h = d.getHours();
  if (h < 5) return "madrugada";
  if (h < 10) return "manha";
  if (h < 16) return "dia";
  if (h < 19) return "tarde";
  return "noite";
}

/** Variáveis de cor da interface para o horário e as escolhas do usuário. */
export function coresDoHorario(config: Config, agora: Date): React.CSSProperties {
  const fase = faseDoDia(agora);
  const escuro = config.tema === "escuro";
  const tons = config.vidro_horario === false ? NEUTRO : FASES[fase];
  const tom = escuro ? tons.escuro : tons.claro;
  return {
    "--destaque": config.destaque_auto ? FASES[fase].destaque : config.destaque,
    "--vidro": tom.vidro,
    "--vidro-borda": tom.borda,
    "--horizonte": tom.brilho,
  } as React.CSSProperties;
}
