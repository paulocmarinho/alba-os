import { createContext, useContext } from "react";
import type { Config, Sistema } from "./api";
import type { NomeIcone } from "./componentes/Icone";
import type { Tocando } from "./apps/Musica";

export type IdApp = "arquivos" | "terminal" | "notas" | "ajustes" | "visualizador" | "instalador" | "musica" | "loja" | "monitor";

export const APPS: Record<
  IdApp,
  { nome: string; icone: NomeIcone; classe: string; largura: number; altura: number; unico: boolean; semMoldura?: boolean }
> = {
  arquivos: { nome: "Arquivos", icone: "folder", classe: "files", largura: 980, altura: 640, unico: false },
  terminal: { nome: "Terminal", icone: "terminal", classe: "terminal", largura: 780, altura: 480, unico: false },
  notas: { nome: "Notas", icone: "note", classe: "notes", largura: 760, altura: 540, unico: false },
  ajustes: { nome: "Ajustes", icone: "settings", classe: "settings", largura: 880, altura: 600, unico: true },
  visualizador: { nome: "Imagem", icone: "image", classe: "viewer", largura: 820, altura: 600, unico: false },
  musica: { nome: "Sleeve", icone: "music", classe: "music", largura: 1120, altura: 720, unico: true, semMoldura: true },
  monitor: { nome: "Monitor de Atividade", icone: "activity", classe: "monitor", largura: 980, altura: 660, unico: true },
  loja: { nome: "Alba Store", icone: "store", classe: "store", largura: 1100, altura: 720, unico: true },
  instalador: { nome: "Instalar o Alba OS", icone: "install", classe: "install", largura: 900, altura: 640, unico: true },
};

export type Janela = {
  id: number;
  app: IdApp;
  titulo: string;
  x: number;
  y: number;
  largura: number;
  altura: number;
  minimizada: boolean;
  maximizada: boolean;
  z: number;
  props: Record<string, any>;
};

export type Contexto = {
  sistema: Sistema;
  config: Config;
  agora: Date;
  mudarConfig: (mudancas: Partial<Config>) => Promise<void>;
  abrir: (app: IdApp, props?: Record<string, any>) => void;
  fechar: (id: number) => void;
  renomearJanela: (id: number, titulo: string) => void;
  aviso: (texto: string) => void;
  confirmar: (opcoes: { titulo: string; texto?: string; ok?: string; perigo?: boolean }) => Promise<boolean>;
  perguntar: (opcoes: { titulo: string; texto?: string; valor?: string; ok?: string; senha?: boolean; perigo?: boolean }) => Promise<string | null>;
  bloquear: () => void;
  tocando: Tocando | null;
  definirTocando: (t: Tocando | null) => void;
  energia: (acao: "desligar" | "reiniciar") => void;
};

export const CtxAlba = createContext<Contexto | null>(null);

export function useAlba() {
  const c = useContext(CtxAlba);
  if (!c) throw new Error("Contexto do Alba ausente");
  return c;
}

export function dataLonga(d: Date) {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d);
}

export function dataSemAno(d: Date) {
  const t = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(d);
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function hora(d: Date) {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}

export function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] || "") + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase() || "L";
}

/** Apps fixos no dock quando o usuário ainda não mexeu (igual a DOCK_PADRAO na casca). */
export const DOCK_PADRAO = ["arquivos", "musica", "firefox.desktop", "terminal", "notas", "loja", "ajustes"];

export function listaDock(config: Config | null | undefined): string[] {
  return Array.isArray(config?.dock) ? config!.dock! : DOCK_PADRAO;
}
