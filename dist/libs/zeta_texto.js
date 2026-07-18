/**
 * Formato de texto unificado para respuestas del bot.
 * Estilo: 「◈」 TÍTULO seguido de líneas con ◈
 * No usar en: fichas de llamado (tag-design), menús (menu-design) ni comandos de YT.
 */
export const box = (title, lines) => [`「◈」 ${title}`, ...lines.filter((line) => line !== undefined && line !== null).map((line) => `◈ ${line}`)].join("\n");
export const boxLine = (text) => `◈ ${text}`;
export const boxTitle = (title) => `「◈」 ${title}`;
