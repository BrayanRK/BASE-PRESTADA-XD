/**
 * Formato de texto unificado para respuestas del bot.
 * Estilo: 「◈」 TÍTULO seguido de líneas con ◈
 * No usar en: fichas de llamado (tag-design), menús (menu-design) ni comandos de YT.
 */
export const box = (title: string, lines: string[]): string =>
  [`「◈」 ${title}`, ...lines.filter((line) => line !== undefined && line !== null).map((line) => `◈ ${line}`)].join("\n")

export const boxLine = (text: string): string => `◈ ${text}`

export const boxTitle = (title: string): string => `「◈」 ${title}`
