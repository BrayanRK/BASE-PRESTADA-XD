import type * as baileys from "baileys"
import type * as types from "../types/types.js"
import { getConnection } from "../database/connect.js"
import { getEffectiveBotJid } from "./bot-scope.js"

export type FreeFireCommandContext = types.CommandExecuteContext

export type FreeFireModeConfig = {
  command: string
  title: string
  label: string
  squads: number
  substitutesPerSquad: number
  emoji?: string
  description?: string
  usage?: string
}

export type FreeFireParticipant = baileys.GroupParticipant & {
  id: string
}

const DEFAULT_BASE_TIME = "8:00pm"

const FEATURE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS group_freefire_settings_v2 (
    bot_jid TEXT NOT NULL,
    group_jid TEXT NOT NULL,
    enabled INTEGER DEFAULT 0,
    updated_by TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(bot_jid, group_jid)
  )
`

let tableReady: Promise<void> | null = null

export const ensureFreeFireTable = async (): Promise<void> => {
  if (tableReady) return tableReady

  tableReady = new Promise((resolve) => {
    try {
      const db = getConnection()
      db.run(FEATURE_TABLE_SQL, (err) => {
        if (err) console.error("[FreeFire] Error creando tabla:", err)
        db.run("CREATE INDEX IF NOT EXISTS idx_freefire_scope ON group_freefire_settings_v2 (bot_jid, group_jid)", () => {})
        resolve()
      })
    } catch (error) {
      console.error("[FreeFire] Error abriendo DB:", error)
      resolve()
    }
  })

  return tableReady
}

export const isFreeFireEnabled = async (
  bot: Partial<types.BotDocument> | string,
  groupJid?: string,
): Promise<boolean> => {
  await ensureFreeFireTable()

  const botJid = typeof bot === "string" && groupJid ? bot : getEffectiveBotJid(bot as Partial<types.BotDocument>)
  const realGroupJid = groupJid || String(bot || "")

  return new Promise((resolve) => {
    try {
      const db = getConnection()
      db.get(
        "SELECT enabled FROM group_freefire_settings_v2 WHERE bot_jid = ? AND group_jid = ?",
        [botJid, realGroupJid],
        (err, row: { enabled?: number } | undefined) => {
          if (err) {
            console.error("[FreeFire] Error leyendo estado:", err)
            resolve(false)
            return
          }

          resolve(Boolean(row?.enabled))
        },
      )
    } catch (error) {
      console.error("[FreeFire] Error leyendo estado:", error)
      resolve(false)
    }
  })
}

export const setFreeFireEnabled = async (
  bot: Partial<types.BotDocument> | string,
  groupJid: string,
  enabled: boolean,
  updatedBy: string,
): Promise<boolean> => {
  await ensureFreeFireTable()

  const botJid = typeof bot === "string" ? bot : getEffectiveBotJid(bot)

  return new Promise((resolve) => {
    try {
      const db = getConnection()
      db.run(
        `INSERT INTO group_freefire_settings_v2 (bot_jid, group_jid, enabled, updated_by, updated_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(bot_jid, group_jid) DO UPDATE SET
           enabled = excluded.enabled,
           updated_by = excluded.updated_by,
           updated_at = CURRENT_TIMESTAMP`,
        [botJid, groupJid, enabled ? 1 : 0, updatedBy],
        (err) => {
          if (err) {
            console.error("[FreeFire] Error guardando estado:", err)
            resolve(false)
            return
          }

          resolve(true)
        },
      )
    } catch (error) {
      console.error("[FreeFire] Error guardando estado:", error)
      resolve(false)
    }
  })
}

export const normalizeJidNumber = (jid?: string): string => String(jid || "").split("@")[0].split(":")[0].replace(/\D/g, "")

export const mentionTag = (jid: string): string => `@${normalizeJidNumber(jid) || jid.split("@")[0]}`

export const isFreeFireOrganizer = (ctx: FreeFireCommandContext): boolean => {
  return Boolean(ctx.userIsAdmin || ctx.userIsOwner || ctx.userIsBotOwner || ctx.mctx.message.from_me)
}

export const freeFireHeader = (title: string, lines: string[] = []): string => {
  let text = `「◈」 🔥 ${title}\n`
  for (const line of lines) text += `◈ ${line}\n`
  return text.trimEnd()
}

export const sendFreeFireDisabled = async (ctx: FreeFireCommandContext): Promise<void> => {
  const prefix = ctx.usedPrefix || "."
  let text = freeFireHeader("Free Fire apagado", [
    "Estado 》 desactivado",
    `Grupo 》 ${ctx.mctx.chat.name || "grupo"}`,
  ])
  text += `\n\n⟡ Un admin debe activarlo con:\n╎ *${prefix}ff on*`
  await ctx.mctx.reply(text)
}

export const guardFreeFireCommand = async (
  _wss: types.WASocket,
  ctx: FreeFireCommandContext,
  options: { requireEnabled?: boolean; requireOrganizer?: boolean } = {},
): Promise<boolean> => {
  const requireEnabled = options.requireEnabled ?? true
  const requireOrganizer = options.requireOrganizer ?? true

  if (!ctx.mctx.is_group) {
    await ctx.mctx.reply("⚠ Este comando solo puede usarse en grupos.")
    return false
  }

  if (requireEnabled && !(await isFreeFireEnabled(ctx.bot, ctx.mctx.chat.jid))) {
    await sendFreeFireDisabled(ctx)
    return false
  }

  if (requireOrganizer && !isFreeFireOrganizer(ctx)) {
    await ctx.mctx.reply("⚠ Solo admins o el dueño del bot pueden usar comandos de organización Free Fire.")
    return false
  }

  return true
}

export const getGroupParticipants = async (
  wss: types.WASocket,
  ctx: FreeFireCommandContext,
): Promise<FreeFireParticipant[]> => {
  let metadata = ctx.groupMetadata
  if (!metadata?.participants?.length) metadata = await wss.groupMetadata(ctx.mctx.chat.jid)

  const botNumber = normalizeJidNumber(wss.user?.id)
  const botPn = normalizeJidNumber(ctx.mctx.me.jids.pn)
  const botLid = ctx.mctx.me.jids.lid

  return (metadata.participants || [])
    .filter((participant: any) => {
      const jid = String(participant.id || "")
      const number = normalizeJidNumber(jid)
      if (!jid) return false
      if (jid === botLid) return false
      if (botNumber && number === botNumber) return false
      if (botPn && number === botPn) return false
      return true
    })
    .map((participant: any) => participant as FreeFireParticipant)
}

export const shuffle = <T>(items: T[]): T[] => {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

export const parseTimeInput = (raw: string): { h: number; m: number; normalized: string } | null => {
  const input = String(raw || "").trim().toLowerCase().replace(/\s+/g, "")
  if (!input) return null

  const match = input.match(/^(\d{1,2})(?::(\d{1,2}))?(am|pm)?$/i)
  if (!match) return null

  let h = Number(match[1])
  const m = Number(match[2] || 0)
  const suffix = match[3]

  if (!Number.isFinite(h) || !Number.isFinite(m) || m < 0 || m > 59) return null
  if (suffix) {
    if (h < 1 || h > 12) return null
    if (suffix === "pm" && h !== 12) h += 12
    if (suffix === "am" && h === 12) h = 0
  } else if (h > 23) {
    return null
  }

  return { h, m, normalized: to12Hour(h, m) }
}

export const to12Hour = (hour: number, minute: number): string => {
  const normalizedHour = ((hour % 24) + 24) % 24
  const suffix = normalizedHour >= 12 ? "pm" : "am"
  const displayHour = normalizedHour % 12 || 12
  return `${displayHour}:${String(minute).padStart(2, "0")}${suffix}`
}

export const renderSchedule = (rawTime: string): string => {
  const parsed = parseTimeInput(rawTime || DEFAULT_BASE_TIME)
  if (!parsed) return "╎ Formato de hora inválido. Ejemplo: 8:00pm"

  const zones = [
    { country: "🇲🇽 México", offset: 0 },
    { country: "🇨🇴 Colombia", offset: 0 },
    { country: "🇵🇪 Perú", offset: 0 },
    { country: "🇵🇦 Panamá", offset: 0 },
    { country: "🇪🇨 Ecuador", offset: 0 },
    { country: "🇸🇻 El Salvador", offset: 0 },
    { country: "🇧🇴 Bolivia", offset: 1 },
    { country: "🇻🇪 Venezuela", offset: 1 },
    { country: "🇺🇸 USA", offset: 1 },
    { country: "🇨🇱 Chile", offset: 2 },
    { country: "🇦🇷 Argentina", offset: 2 },
    { country: "🇪🇸 España", offset: 7 },
  ]

  return zones.map((zone) => `╎ ${zone.country} 》 *${to12Hour(parsed.h + zone.offset, parsed.m)}*`).join("\n")
}

export const renderPlayers = (players: FreeFireParticipant[]): string => {
  if (!players.length) return "╎ sin jugadores"
  return players.map((player, index) => `╎ ${index === 0 ? "👑" : "⚔️"} ${mentionTag(player.id)}`).join("\n")
}

export const buildVersusText = (
  config: FreeFireModeConfig,
  groupName: string,
  rawTime: string,
  participants: FreeFireParticipant[],
): { text: string; mentions: string[] } => {
  const picked = shuffle(participants)
  const mentions: string[] = []
  let cursor = 0
  let text = freeFireHeader("Free Fire", [
    `Modalidad 》 ${config.label}`,
    `Grupo 》 ${groupName || "grupo"}`,
    `Jugadores 》 ${config.squads * (4 + config.substitutesPerSquad)}`,
  ])

  text += `\n\n⟡ Horarios\n${renderSchedule(rawTime)}`
  text += `\n\n⟡ Escuadras`

  for (let i = 0; i < config.squads; i++) {
    const starters = picked.slice(cursor, cursor + 4)
    cursor += 4
    const substitutes = picked.slice(cursor, cursor + config.substitutesPerSquad)
    cursor += config.substitutesPerSquad

    mentions.push(...starters.map((p) => p.id), ...substitutes.map((p) => p.id))
    text += `\n\n「◈」 Escuadra ${i + 1}\n${renderPlayers(starters)}\n◈ Suplentes\n${renderPlayers(substitutes)}`
  }

  text += `\n\n╎ Organizado por 》 ${config.title}`
  return { text, mentions: Array.from(new Set(mentions)) }
}

export const createFreeFireVersusCommand = (config: FreeFireModeConfig): types.Command => {
  const required = config.squads * (4 + config.substitutesPerSquad)

  return {
    name: config.command,
    alias: [`ff${config.command}`],
    description: config.description || `Organizar partida Free Fire ${config.label}.`,
    using: config.usage || "[hora]",
    category: "extras",
    hidden: true,
    flags: ["only.groups"],
    requires: [],
    execute: async (wss, ctx) => {
      if (!(await guardFreeFireCommand(wss, ctx))) return

      const rawTime = ctx.args.join(" ").trim()
      if (!rawTime || !parseTimeInput(rawTime)) {
        await ctx.mctx.reply(
          `${freeFireHeader(config.label, ["Uso 》 " + ctx.usedPrefix + config.command + " 8:00pm"])}\n\n╎ Formatos válidos: *8pm*, *8:30pm*, *20:30*`,
        )
        return
      }

      await ctx.mctx.react(config.emoji || "🎮").catch(() => {})

      const participants = await getGroupParticipants(wss, ctx)
      if (participants.length < required) {
        await ctx.mctx.reply(
          `${freeFireHeader("Faltan jugadores", [
            `Modalidad 》 ${config.label}`,
            `Necesarios 》 ${required}`,
            `Disponibles 》 ${participants.length}`,
          ])}\n\n╎ Invita más gente o usa una modalidad menor.`,
        )
        return
      }

      const { text, mentions } = buildVersusText(config, ctx.mctx.chat.name, rawTime, participants)
      await wss.sendMessage(ctx.mctx.chat.jid, { text, mentions }, { quoted: ctx.mctx.message.original })
    },
  }
}

export const freeFireMenu = async (ctx: FreeFireCommandContext): Promise<string> => {
  const enabled = ctx.mctx.is_group ? await isFreeFireEnabled(ctx.bot, ctx.mctx.chat.jid) : false
  const prefix = ctx.usedPrefix || "."

  let text = `${freeFireHeader("FREE FIRE MENU", [
    `Estado › ${enabled ? "activado" : "desactivado"}`,
    `Grupo › ${ctx.mctx.chat.name || "privado"}`,
  ])}\n\n`

  text += `╭─〔 ⚙️ CONTROL 〕\n`
  text += `│ ◦ *${prefix}ff on*\n│ │ Activar módulo en este grupo\n`
  text += `│ ◦ *${prefix}ff off*\n│ │ Desactivar módulo en este grupo\n`
  text += `╰────────────\n\n`

  text += `╭─〔 🎮 PARTIDAS RÁPIDAS 〕\n`
  text += `│ ◦ *${prefix}ffvs 4vs4*\n│ │ Inscripción respondiendo al mensaje\n`
  text += `│ ◦ *${prefix}4vs4 8:00pm*\n│ │ 2 escuadras + suplentes\n`
  text += `│ ◦ *${prefix}6vs6 8:00pm*\n│ │ 3 escuadras + suplentes\n`
  text += `│ ◦ *${prefix}12vs12 8:00pm*\n│ │ 4 escuadras + suplentes\n`
  text += `│ ◦ *${prefix}16vs16 8:00pm*\n│ │ 5 escuadras + suplentes\n`
  text += `│ ◦ *${prefix}20vs20 8:00pm*\n│ │ 6 escuadras + suplentes\n`
  text += `│ ◦ *${prefix}24vs24 8:00pm*\n│ │ 7 escuadras + suplentes\n`
  text += `╰────────────\n\n`

  text += `╭─〔 🏆 APOYO PARA CLANES 〕\n`
  text += `│ ◦ *${prefix}guerr 8:00pm*\n│ │ Guerra de clanes\n`
  text += `│ ◦ *${prefix}mapas*\n│ │ Mapa aleatorio\n`
  text += `│ ◦ *${prefix}ffhorario 8:00pm*\n│ │ Horarios por país\n`
  text += `│ ◦ *${prefix}ffsorteo 4 8:00pm*\n│ │ Sorteo por escuadras\n`
  text += `│ ◦ *${prefix}ffreglas*\n│ │ Reglas listas para copiar\n`
  text += `╰────────────`

  return text
}
