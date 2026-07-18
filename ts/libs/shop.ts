import fs from "node:fs"
import path from "node:path"
import type * as types from "../types/types.js"
import { getConnection } from "../database/connect.js"
import { getEffectiveBotJid, normalizeStorageJid } from "./bot-scope.js"

export type ShopCommandContext = types.CommandExecuteContext

export type ShopItemConfig = {
  key: string
  command: string
  setCommand: string
  title: string
  emoji: string
  emptyText: string
  fallbackCaption: string
  aliases?: string[]
}

export type ShopStoredItem = {
  texto?: string
  imagen?: string | null
  updatedBy?: string
  updatedAt?: string
}

export type ShopDb = Record<string, Record<string, ShopStoredItem>>

export type ShopCycle = {
  valor: number
  unidad: "m" | "h" | "d"
  ms: number
  texto: string
}

export type ShopInvoice = {
  id: string
  bot_jid?: string
  group_jid?: string
  servicio: string
  precio: number
  ciclo: ShopCycle
  fechaCreacion: number
  fechaProximoPago: number
  estado: "pagado" | "no pagado" | "pendiente"
  recordatorioEnviado?: boolean
  fechaRecordatorio?: number | null
  cliente: { numero: string; nombre: string }
  vendedor: { numero: string; nombre: string }
  historial: Array<{ fecha: number; evento: string; detalle: string }>
}

const FEATURE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS group_shop_settings_v1 (
    bot_jid TEXT NOT NULL,
    group_jid TEXT NOT NULL,
    enabled INTEGER DEFAULT 0,
    updated_by TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(bot_jid, group_jid)
  )
`

const VENTAS_PATH = path.join(process.cwd(), "ventas365.json")
const FACTURAS_PATH = path.join(process.cwd(), "facturas.json")
const MAX_IMAGE_BYTES = 8 * 1024 * 1024

const SHOP_SCOPE_SEPARATOR = "::"

const isShopContext = (value: unknown): value is ShopCommandContext => {
  return Boolean(value && typeof value === "object" && "mctx" in value && "bot" in value)
}

export const getShopBotJid = (bot: Partial<types.BotDocument> | string | null | undefined): string => {
  if (typeof bot === "string") return normalizeStorageJid(bot) || "default@lid"
  return getEffectiveBotJid(bot || undefined) || "default@lid"
}

export const getShopScopeKey = (
  ctxOrBot: ShopCommandContext | Partial<types.BotDocument> | string | null | undefined,
  groupJid?: string,
): string => {
  const botJid = isShopContext(ctxOrBot) ? getShopBotJid(ctxOrBot.bot) : getShopBotJid(ctxOrBot)
  const realGroupJid = isShopContext(ctxOrBot) ? ctxOrBot.mctx.chat.jid : String(groupJid || "")
  return `${botJid}${SHOP_SCOPE_SEPARATOR}${realGroupJid}`
}

export const getShopGroupJid = (
  ctxOrGroup: ShopCommandContext | string | null | undefined,
): string => {
  return isShopContext(ctxOrGroup) ? ctxOrGroup.mctx.chat.jid : String(ctxOrGroup || "")
}

let tableReady: Promise<void> | null = null

export const SHOP_ITEMS: ShopItemConfig[] = [
  {
    key: "setpago",
    command: "pago",
    setCommand: "setpago",
    title: "Pagos",
    emoji: "",
    emptyText: "No hay información de pago guardada con *setpago*.",
    fallbackCaption: "Información de pago",
  },
  {
    key: "setpago2",
    command: "pago2",
    setCommand: "setpago2",
    title: "Pagos 2",
    emoji: "",
    emptyText: "No hay información de pago guardada con *setpago2*.",
    fallbackCaption: "Información de pago",
  },
  {
    key: "setstock",
    command: "stock",
    setCommand: "setstock",
    title: "Stock",
    emoji: "",
    emptyText: "No hay stock configurado para este grupo.",
    fallbackCaption: "Stock disponible",
  },
  {
    key: "setstock2",
    command: "stock2",
    setCommand: "setstock2",
    title: "Stock 2",
    emoji: "",
    emptyText: "No hay contenido guardado con *setstock2* en este grupo.",
    fallbackCaption: "Stock 2",
  },
  {
    key: "setstock3",
    command: "stock3",
    setCommand: "setstock3",
    title: "Stock 3",
    emoji: "",
    emptyText: "No hay contenido guardado con *setstock3* en este grupo.",
    fallbackCaption: "Stock 3",
  },
  {
    key: "setnetflix",
    command: "netflix",
    setCommand: "setnetflix",
    title: "Netflix",
    emoji: "",
    emptyText: "No hay contenido guardado con *setnetflix* en este grupo.",
    fallbackCaption: "Contenido Netflix",
  },
  {
    key: "setpeliculas",
    command: "peliculas",
    setCommand: "setpeliculas",
    title: "Películas",
    emoji: "",
    emptyText: "No hay películas configuradas para este grupo.",
    fallbackCaption: "Películas disponibles",
  },
  {
    key: "setpromo",
    command: "promo",
    setCommand: "setpromo",
    title: "Promo",
    emoji: "",
    emptyText: "No hay información de promoción guardada con *setpromo*.",
    fallbackCaption: "Promoción del grupo",
  },
  {
    key: "setsoporte",
    command: "soporte",
    setCommand: "setsoporte",
    title: "Soporte",
    emoji: "",
    emptyText: "No hay información de soporte guardada con *setsoporte*.",
    fallbackCaption: "Información de soporte",
  },
  {
    key: "setcanvas",
    command: "canvas",
    setCommand: "setcanvas",
    title: "Canvas",
    emoji: "",
    emptyText: "No hay canvas configurado para este grupo.",
    fallbackCaption: "Canvas",
  },
  {
    key: "setcombos",
    command: "combos",
    setCommand: "setcombos",
    title: "Combos",
    emoji: "",
    emptyText: "No se ha establecido ningún texto para *combos* en este grupo.",
    fallbackCaption: "Combos",
  },
  {
    key: "setdiamantes",
    command: "diamantes",
    setCommand: "setdiamantes",
    title: "Diamantes",
    emoji: "",
    emptyText: "No hay contenido guardado con *setdiamantes* en este grupo.",
    fallbackCaption: "Diamantes",
  },
  {
    key: "setseguidores",
    command: "seguidores",
    setCommand: "setseguidores",
    title: "Seguidores",
    emoji: "",
    emptyText: "No hay contenido guardado con *setseguidores* en este grupo.",
    fallbackCaption: "Seguidores",
  },
  {
    key: "setduos",
    command: "duos",
    setCommand: "setduos",
    title: "Dúos",
    emoji: "",
    emptyText: "No hay contenido guardado con *setduos* en este grupo.",
    fallbackCaption: "Dúos",
  },
  {
    key: "settrios",
    command: "trios",
    setCommand: "settrios",
    title: "Tríos",
    emoji: "",
    emptyText: "No hay contenido guardado con *settrios* en este grupo.",
    fallbackCaption: "Tríos",
  },
  {
    key: "setlotes",
    command: "lotes",
    setCommand: "setlotes",
    title: "Lotes",
    emoji: "",
    emptyText: "No hay contenido guardado con *setlotes* en este grupo.",
    fallbackCaption: "Lotes",
  },
  {
    key: "settramites",
    command: "tramites",
    setCommand: "settramites",
    title: "Trámites",
    emoji: "",
    emptyText: "No hay trámites configurados para este grupo.",
    fallbackCaption: "Trámites",
  },
  {
    key: "setdiamantes2",
    command: "diamantes2",
    setCommand: "setdiamantes2",
    title: "Diamantes 2",
    emoji: "💎",
    emptyText: "No hay información de diamantes 2 configurada. Un admin debe usar *setdiamantes2*.",
    fallbackCaption: "Recarga de Diamantes FF",
    aliases: ["d2", "diams2"],
  },
  {
    key: "setmaxeos",
    command: "maxeos",
    setCommand: "setmaxeos",
    title: "Maxeos",
    emoji: "⚡",
    emptyText: "No hay información de maxeos configurada. Un admin debe usar *setmaxeos*.",
    fallbackCaption: "Maxeos de Personajes y Mascotas FF",
    aliases: ["max", "maxeo"],
  },
  {
    key: "setlikes",
    command: "likes",
    setCommand: "setlikes",
    title: "Likes FF",
    emoji: "👍",
    emptyText: "No hay información de likes configurada. Un admin debe usar *setlikes*.",
    fallbackCaption: "Servicio de Likes Free Fire",
    aliases: ["likesff", "likesff"],
  },
  {
    key: "setpases",
    command: "pases",
    setCommand: "setpases",
    title: "Pases",
    emoji: "🎫",
    emptyText: "No hay información de pases configurada. Un admin debe usar *setpases*.",
    fallbackCaption: "Pases de Batalla y Élite FF",
    aliases: ["pase", "pasebatalla"],
  },
  {
    key: "setfragmentos",
    command: "fragmentos",
    setCommand: "setfragmentos",
    title: "Fragmentos",
    emoji: "🔴",
    emptyText: "No hay información de fragmentos configurada. Un admin debe usar *setfragmentos*.",
    fallbackCaption: "Fragmentos de Memoria y Tokens FF",
    aliases: ["frags", "frag", "tokens"],
  },
  {
    key: "setstock4",
    command: "stock4",
    setCommand: "setstock4",
    title: "Stock 4",
    emoji: "",
    emptyText: "No hay contenido guardado con *setstock4* en este grupo.",
    fallbackCaption: "Stock 4",
    aliases: [],
  },
]

export const cleanText = (value: unknown, fallback = ""): string => {
  const text = String(value ?? "").replace(/\r/g, "").trim()
  return text || fallback
}

export const normalizeNumber = (value?: string | null): string =>
  String(value || "")
    .split(":")[0]
    .split("@")[0]
    .replace(/\D/g, "")

export const toUserJid = (number: string): string => `${normalizeNumber(number)}@s.whatsapp.net`

export const formatDate = (value: number): string => {
  const date = new Date(Number(value || Date.now()))
  return date.toLocaleString("es-ES", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export const formatRemaining = (ms: number): string => {
  if (!Number.isFinite(ms) || ms <= 0) return "0s"
  let seconds = Math.floor(ms / 1000)
  const days = Math.floor(seconds / 86400)
  seconds %= 86400
  const hours = Math.floor(seconds / 3600)
  seconds %= 3600
  const minutes = Math.floor(seconds / 60)
  seconds %= 60
  const parts: string[] = []
  if (days) parts.push(`${days}d`)
  if (hours) parts.push(`${hours}h`)
  if (minutes) parts.push(`${minutes}m`)
  if (seconds) parts.push(`${seconds}s`)
  return parts.join(" ") || "0s"
}

export const parseCycle = (value: string): ShopCycle | null => {
  const match = String(value || "").trim().toLowerCase().match(/^(\d+)([mhd])$/)
  if (!match) return null

  const valor = Number(match[1])
  const unidad = match[2] as "m" | "h" | "d"
  if (!Number.isFinite(valor) || valor <= 0) return null

  const ms = unidad === "m" ? valor * 60_000 : unidad === "h" ? valor * 3_600_000 : valor * 86_400_000
  return { valor, unidad, ms, texto: `${valor}${unidad}` }
}

export const shopHeader = (title: string, lines: string[] = []): string => {
  let text = `「◈」 ${title}\n`
  for (const line of lines) text += `◈ ${line}\n`
  return text.trimEnd()
}

export const ensureShopTable = async (): Promise<void> => {
  if (tableReady) return tableReady

  tableReady = new Promise((resolve) => {
    try {
      const db = getConnection()
      db.run(FEATURE_TABLE_SQL, (err) => {
        if (err) console.error("[Shop] Error creando tabla:", err)
        db.run("CREATE INDEX IF NOT EXISTS idx_shop_scope ON group_shop_settings_v1 (bot_jid, group_jid)", () => {})
        resolve()
      })
    } catch (error) {
      console.error("[Shop] Error abriendo DB:", error)
      resolve()
    }
  })

  return tableReady
}

export const isShopEnabled = async (
  bot: Partial<types.BotDocument> | string,
  groupJid?: string,
): Promise<boolean> => {
  await ensureShopTable()

  const botJid = typeof bot === "string" && groupJid ? bot : getEffectiveBotJid(bot as Partial<types.BotDocument>)
  const realGroupJid = groupJid || String(bot || "")

  return new Promise((resolve) => {
    try {
      const db = getConnection()
      db.get(
        "SELECT enabled FROM group_shop_settings_v1 WHERE bot_jid = ? AND group_jid = ?",
        [botJid, realGroupJid],
        (err, row: { enabled?: number } | undefined) => {
          if (err) {
            console.error("[Shop] Error leyendo estado:", err)
            resolve(false)
            return
          }

          resolve(Boolean(row?.enabled))
        },
      )
    } catch (error) {
      console.error("[Shop] Error leyendo estado:", error)
      resolve(false)
    }
  })
}

export const setShopEnabled = async (
  bot: Partial<types.BotDocument> | string,
  groupJid: string,
  enabled: boolean,
  updatedBy: string,
): Promise<boolean> => {
  await ensureShopTable()

  const botJid = typeof bot === "string" ? bot : getEffectiveBotJid(bot)

  return new Promise((resolve) => {
    try {
      const db = getConnection()
      db.run(
        `INSERT INTO group_shop_settings_v1 (bot_jid, group_jid, enabled, updated_by, updated_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(bot_jid, group_jid) DO UPDATE SET
           enabled = excluded.enabled,
           updated_by = excluded.updated_by,
           updated_at = CURRENT_TIMESTAMP`,
        [botJid, groupJid, enabled ? 1 : 0, updatedBy],
        (err) => {
          if (err) {
            console.error("[Shop] Error guardando estado:", err)
            resolve(false)
            return
          }

          resolve(true)
        },
      )
    } catch (error) {
      console.error("[Shop] Error guardando estado:", error)
      resolve(false)
    }
  })
}

export const isShopOrganizer = (ctx: ShopCommandContext): boolean => {
  return Boolean(ctx.userIsAdmin || ctx.userIsOwner || ctx.userIsBotOwner || ctx.mctx.message.from_me)
}

export const sendShopDisabled = async (ctx: ShopCommandContext): Promise<void> => {
  const prefix = ctx.usedPrefix || "."
  let text = shopHeader("Shop apagado", [
    "Estado 》 desactivado",
    `Grupo 》 ${ctx.mctx.chat.name || "grupo"}`,
  ])
  text += `\n\n⟡ Un admin debe activarlo con:\n╎ *${prefix}shop on*`
  await ctx.mctx.reply(text)
}

export const guardShopCommand = async (
  _wss: types.WASocket,
  ctx: ShopCommandContext,
  options: { requireEnabled?: boolean; requireOrganizer?: boolean } = {},
): Promise<boolean> => {
  const requireEnabled = options.requireEnabled ?? true
  const requireOrganizer = options.requireOrganizer ?? false

  if (!ctx.mctx.is_group) {
    await ctx.mctx.reply("⚠ Este comando solo puede usarse en grupos.")
    return false
  }

  if (requireEnabled && !(await isShopEnabled(ctx.bot, ctx.mctx.chat.jid))) {
    await sendShopDisabled(ctx)
    return false
  }

  if (requireOrganizer && !isShopOrganizer(ctx)) {
    await ctx.mctx.reply("⚠ Solo admins o el dueño del bot pueden editar el shop.")
    return false
  }

  return true
}

const readJsonFile = <T>(filePath: string, fallback: T): T => {
  try {
    if (!fs.existsSync(filePath)) return fallback
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T
  } catch {
    return fallback
  }
}

const writeJsonFile = (filePath: string, value: unknown): boolean => {
  try {
    const tmp = `${filePath}.tmp`
    fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`)
    fs.renameSync(tmp, filePath)
    return true
  } catch (error) {
    console.error(`[Shop] Error guardando ${path.basename(filePath)}:`, error)
    return false
  }
}

export const loadShopDb = (): ShopDb => readJsonFile<ShopDb>(VENTAS_PATH, {})
export const saveShopDb = (db: ShopDb): boolean => writeJsonFile(VENTAS_PATH, db)

export const getShopItemByCommand = (command: string): ShopItemConfig | undefined => {
  const name = String(command || "").toLowerCase().trim()
  return SHOP_ITEMS.find((item) => item.command === name || item.setCommand === name || item.key === name)
}

export const getShopItem = (ctx: ShopCommandContext, item: ShopItemConfig): ShopStoredItem | null => {
  const db = loadShopDb()
  const scopedKey = getShopScopeKey(ctx)
  const legacyKey = getShopGroupJid(ctx)
  const data = db[scopedKey]?.[item.key] || db[legacyKey]?.[item.key]
  if (!data || (!data.texto && !data.imagen)) return null
  return data
}

export const listShopStoredItems = (ctx: ShopCommandContext): Array<{ item: ShopItemConfig; data: ShopStoredItem | null }> => {
  return SHOP_ITEMS.map((item) => ({ item, data: getShopItem(ctx, item) }))
}

export const setShopItem = (ctx: ShopCommandContext, item: ShopItemConfig, data: ShopStoredItem): boolean => {
  const db = loadShopDb()
  const scopedKey = getShopScopeKey(ctx)
  if (!db[scopedKey]) db[scopedKey] = {}
  db[scopedKey][item.key] = data
  return saveShopDb(db)
}

export const deleteShopItem = (ctx: ShopCommandContext, itemKey: string): boolean => {
  const db = loadShopDb()
  const scopedKey = getShopScopeKey(ctx)
  const legacyKey = getShopGroupJid(ctx)

  if (itemKey === "all") {
    db[scopedKey] = {}
    if (db[legacyKey]) db[legacyKey] = {}
    return saveShopDb(db)
  }

  const item = getShopItemByCommand(itemKey)
  if (!item) return false

  if (db[scopedKey]) delete db[scopedKey][item.key]
  if (db[legacyKey]) delete db[legacyKey][item.key]
  return saveShopDb(db)
}

export const getQuotedOrDirectImageBuffer = async (ctx: ShopCommandContext): Promise<Buffer | null> => {
  const quotedMime = String(ctx.mctx.quoted?.message?.mimetype || "")
  if (/^image\//i.test(quotedMime) && ctx.mctx.quoted?.download) {
    const buffer = (await ctx.mctx.quoted.download().buffer().catch(() => null)) as Buffer | null
    if (buffer?.length) return buffer
  }

  const directMime = String(ctx.mctx.message.mimetype || "")
  if (/^image\//i.test(directMime) && ctx.mctx.download) {
    const buffer = (await ctx.mctx.download().buffer().catch(() => null)) as Buffer | null
    if (buffer?.length) return buffer
  }

  return null
}

export const createShopSetCommand = (item: ShopItemConfig): types.Command => ({
  name: item.setCommand,
  alias: [],
  description: `Configurar ${item.title.toLowerCase()} del shop.`,
  using: "[texto] / responder imagen",
  category: "extras",
  hidden: true,
  flags: ["only.groups"],
  requires: [],
  execute: async (wss, ctx) => {
    if (!(await guardShopCommand(wss, ctx, { requireEnabled: false, requireOrganizer: true }))) return



    const _rawMsg = ctx.mctx.message.text || ""
    const _prefixCmd = `${ctx.usedPrefix || ""}${item.setCommand}`
    const _cmdIdx = _rawMsg.toLowerCase().indexOf(_prefixCmd.toLowerCase())
    const _afterCmd = _cmdIdx >= 0 ? _rawMsg.slice(_cmdIdx + _prefixCmd.length) : ""
    const textoArg = _afterCmd.replace(/^[ \t]/, "").trimEnd()
    const quotedText = ctx.mctx.quoted?.message?.text?.trim() || ""
    const texto = textoArg || quotedText
    const imageBuffer = await getQuotedOrDirectImageBuffer(ctx)

    if (!texto && !imageBuffer) {
      await ctx.mctx.reply(
        `✏️ Usa:\n\n• *${ctx.usedPrefix}${item.setCommand} <texto>*\n• O responde a una *imagen* con: *${ctx.usedPrefix}${item.setCommand} <texto>*`,
      )
      return
    }

    if (imageBuffer && imageBuffer.length > MAX_IMAGE_BYTES) {
      await ctx.mctx.reply("⚠️ La imagen es muy grande, máximo 8 MB.")
      return
    }

    const saved = setShopItem(ctx, item, {
      texto,
      imagen: imageBuffer ? imageBuffer.toString("base64") : null,
      updatedBy: ctx.mctx.sender.jid,
      updatedAt: new Date().toISOString(),
    })

    if (!saved) {
      await ctx.mctx.reply("❌ No pude guardar el contenido del shop.")
      return
    }

    await ctx.mctx.reply(`✅ *${item.title.toUpperCase()} actualizado con éxito.*`)
  },
})

export const createShopViewCommand = (item: ShopItemConfig): types.Command => ({
  name: item.command,
  alias: item.aliases || [],
  description: `Ver ${item.title.toLowerCase()} del shop.`,
  category: "extras",
  hidden: true,
  flags: ["only.groups"],
  requires: [],
  execute: async (wss, ctx) => {
    if (!(await guardShopCommand(wss, ctx, { requireEnabled: true, requireOrganizer: false }))) return

    const data = getShopItem(ctx, item)
    if (!data) {
      await ctx.mctx.reply(item.emptyText)
      return
    }

    if (data.imagen) {
      try {
        const buffer = Buffer.from(data.imagen, "base64")
        await wss.sendMessage(
          ctx.mctx.chat.jid,
          { image: buffer, caption: data.texto || item.fallbackCaption },
          { quoted: ctx.mctx.message.original },
        )
        return
      } catch (error) {
        console.error(`[Shop] Error enviando imagen ${item.command}:`, error)
      }
    }

    await ctx.mctx.reply(data.texto || item.fallbackCaption)
  },
})

export const shopMenu = async (ctx: ShopCommandContext): Promise<string> => {
  const enabled = ctx.mctx.is_group ? await isShopEnabled(ctx.bot, ctx.mctx.chat.jid) : false
  const prefix = ctx.usedPrefix || "."
  const stored = ctx.mctx.is_group ? listShopStoredItems(ctx) : []
  const ready = stored.filter((entry) => entry.data).length

  const products = SHOP_ITEMS.map((item) => `│ ◦ *${prefix}${item.command}*\n│ │ ${item.title}`).join("\n")
  const setters = SHOP_ITEMS.map((item) => `│ ◦ *${prefix}${item.setCommand}*\n│ │ Guardar ${item.title}`).join("\n")

  let text = `${shopHeader("TIENDA", [
    `Estado › ${enabled ? "activado" : "desactivado"}`,
    `Grupo › ${ctx.mctx.chat.name || "privado"}`,
    `Configurados › ${ready}/${SHOP_ITEMS.length}`,
  ])}\n\n`

  text += `╭─〔 CONTROL 〕\n`
  text += `│ ◦ *${prefix}shop on*\n│ │ Activa la tienda en este grupo\n`
  text += `│ ◦ *${prefix}shop off*\n│ │ Apaga la tienda en este grupo\n`
  text += `│ ◦ *${prefix}shopstatus*\n│ │ Revisa qué secciones faltan\n`
  text += `╰────────────\n\n`

  text += `╭─〔 PRODUCTOS 〕\n${products}\n╰────────────\n\n`
  text += `╭─〔 CONFIGURACIÓN 〕\n${setters}\n╰────────────\n\n`

  text += `╭─〔 FACTURAS 〕\n`
  text += `│ ◦ *${prefix}addfactura*\n│ │ Crear factura de ciclo\n`
  text += `│ ◦ *${prefix}facturapaga*\n│ │ Renovar o marcar pago\n`
  text += `│ ◦ *${prefix}verfactura*\n│ │ Listar facturas\n`
  text += `│ ◦ *${prefix}delfactura*\n│ │ Borrar facturas\n`
  text += `╰────────────\n\n`

  text += `╭─〔 EXTRA 〕\n`
  text += `│ ◦ *${prefix}sorteo <premio>*\n│ │ Hacer un sorteo rápido del grupo\n`
  text += `╰────────────\n\n`

  text += `╭─〔 LIMPIEZA 〕\n`
  text += `│ ◦ *${prefix}shopdel <sección>*\n│ │ Borra solo una sección\n`
  text += `│ ◦ *${prefix}shopdel all*\n│ │ Limpia toda la tienda\n`
  text += `╰────────────`

  return text
}

export type ShopInvoiceDb = { facturas: ShopInvoice[] }
type StoredInvoiceDb = { facturas?: ShopInvoice[]; scopes?: Record<string, ShopInvoice[]> }

const readRawInvoiceDb = (): StoredInvoiceDb => readJsonFile<StoredInvoiceDb>(FACTURAS_PATH, { facturas: [], scopes: {} })

export const loadInvoiceDb = (ctx?: ShopCommandContext): ShopInvoiceDb => {
  const raw = readRawInvoiceDb()
  if (!ctx) return { facturas: Array.isArray(raw.facturas) ? raw.facturas : [] }

  const scopedKey = getShopScopeKey(ctx)
  const scoped = Array.isArray(raw.scopes?.[scopedKey]) ? raw.scopes![scopedKey] : []

  return { facturas: scoped }
}

export const saveInvoiceDb = (db: ShopInvoiceDb, ctx?: ShopCommandContext): boolean => {
  if (!ctx) return writeJsonFile(FACTURAS_PATH, db)

  const raw = readRawInvoiceDb()
  const scopedKey = getShopScopeKey(ctx)
  raw.scopes = raw.scopes || {}
  raw.scopes[scopedKey] = Array.isArray(db.facturas) ? db.facturas : []
  if (!Array.isArray(raw.facturas)) raw.facturas = []
  return writeJsonFile(FACTURAS_PATH, raw)
}

export const invoiceMatches = (invoice: ShopInvoice, numeroCliente: string, servicio: string): boolean => {
  return normalizeNumber(invoice?.cliente?.numero) === normalizeNumber(numeroCliente) &&
    String(invoice?.servicio || "").toLowerCase().trim() === String(servicio || "").toLowerCase().trim()
}

export const buildInvoiceCaption = (invoice: ShopInvoice, title = "Factura generada"): string => {
  const status = getInvoiceStatus(invoice)
  return `🧾 *${title}*
📄 ID: ${invoice.id}
🛠 Servicio: ${invoice.servicio}
💵 Precio: $ ${Number(invoice.precio).toFixed(2)}
🔁 Ciclo: cada ${invoice.ciclo.texto}
🗓 Creada: ${formatDate(invoice.fechaCreacion)}
⏭ Próximo pago: ${formatDate(invoice.fechaProximoPago)}
📊 Estado: ${status.toUpperCase()}

👤 Cliente: ${invoice.cliente.nombre} (+${invoice.cliente.numero})
🏪 Vendedor: ${invoice.vendedor.nombre} (+${invoice.vendedor.numero})`
}

export const getInvoiceStatus = (invoice: ShopInvoice): string => {
  if (Date.now() > Number(invoice.fechaProximoPago || 0)) return "no pagado"
  return invoice.estado || "pagado"
}

export const createInvoice = (input: {
  servicio: string
  precio: number
  ciclo: ShopCycle
  cliente: { numero: string; nombre: string }
  vendedor: { numero: string; nombre: string }
  scope?: { botJid?: string; groupJid?: string }
}): ShopInvoice => {
  const now = Date.now()
  return {
    id: `FAC-${now}`,
    bot_jid: input.scope?.botJid || "",
    group_jid: input.scope?.groupJid || "",
    servicio: input.servicio,
    precio: input.precio,
    ciclo: input.ciclo,
    fechaCreacion: now,
    fechaProximoPago: now + input.ciclo.ms,
    estado: "pagado",
    recordatorioEnviado: false,
    fechaRecordatorio: null,
    cliente: input.cliente,
    vendedor: input.vendedor,
    historial: [{ fecha: now, evento: "pago", detalle: "Pago inicial registrado" }],
  }
}
