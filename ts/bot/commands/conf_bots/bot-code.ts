import fs from "node:fs/promises"
import path from "node:path"
import * as bot from "../../bot.js"
import * as libs from "../../../libs/libs.js"
import * as baileys from "baileys"
import type * as types from "../../../types/types.js"
import { freeSocketConnectedMessage, sameUser, socketUsage } from "../../../libs/socket-manager.js"
import { getEffectiveBotJid } from "../../../libs/bot-scope.js"

const codeSocketLocks = new Set<string>()

const box = (title: string, lines: string[]): string => {
  return [`╭─〔 ${title} 〕`, ...lines.map((line) => `│ ${line}`), "╰────────────"].join("\n")
}

const normalizeNumber = (value: unknown): string => String(value || "").replace(/[^0-9]/g, "")

const jidNumber = (jid?: string | null): string =>
  String(jid || "")
    .split(":")[0]
    .split("@")[0]
    .replace(/[^0-9]/g, "")

const resolveWhatsappJid = async (wss: types.WASocket, targetNumber: string): Promise<string | null> => {
  const candidates = Array.from(new Set([
    `${targetNumber}@s.whatsapp.net`,
    baileys.jidEncode(targetNumber, "s.whatsapp.net"),
  ]))

  for (const candidate of candidates) {
    try {
      const result = await wss.onWhatsApp(candidate)
      const found = result?.find((item: any) => item?.exists && item?.jid)
      if (found?.jid) return found.jid
    } catch {
      continue
    }
  }

  return null
}

const getFreeCodeSessionPath = (targetNumber: string): string => {
  return path.join(process.cwd(), "freebots", `free-${targetNumber}`)
}

const cleanupUnlinkedSession = async (sessionPath?: string) => {
  if (!sessionPath) return
  await fs.rm(sessionPath, { recursive: true, force: true }).catch(() => null)
}

// Vinculación SOLO por código, para un número puntual. Acá sí hay riesgo de chocar con
// un número que ya tenga un free bot activo (free no pide token), por eso se verifica
// antes de tocar cualquier sesión.
export const createFreeCodeSocket = async (
  wss: types.WASocket,
  mctx: types.MessageContext,
  phoneNumber?: string,
  parentBot?: Partial<types.BotDocument>,
) => {
  if (!mctx.is_group) {
    await mctx.reply(box("SOCKET FREE", ["Acceso › grupo", "Uso › envía .code <número> dentro de un grupo."]))
    return
  }

  const targetNumber = normalizeNumber(phoneNumber)
  if (!targetNumber || targetNumber.length < 8) {
    await mctx.reply(socketUsage("SOCKET FREE", [`Uso › #code <número>`, `Formato › solo números, sin + ni espacios.`]))
    return
  }

  const botJid = await resolveWhatsappJid(wss, targetNumber)
  if (!botJid) {
    await mctx.reply(box("SOCKET FREE", [`Número › ${targetNumber}`, "Estado › no existe en WhatsApp."]))
    return
  }

  // Free no pide token, así que sin este chequeo cualquiera en cualquier grupo podía
  // escribir .code <número> de un free bot ajeno ya activo y borrarle la sesión sin permiso.
  const existingActive = Array.from(bot.Bot.bots.entries()).find(
    ([jid, data]) => jidNumber(jid || data.bot_jid) === targetNumber,
  )
  if (existingActive) {
    const sameOwner = sameUser(existingActive[1].owner_jid, mctx.sender.jid)
    await mctx.reply(
      box("SOCKET FREE", [
        `Número › ${targetNumber}`,
        "Estado › ya hay un socket activo en ese número",
        sameOwner
          ? "Solución › usa .stop antes de volver a vincularlo."
          : "Motivo › ese número pertenece a otro usuario, no se puede re-vincular.",
      ]),
    )
    return
  }

  const lockKey = `${mctx.chat.jid}:${targetNumber}`
  if (codeSocketLocks.has(lockKey)) {
    await mctx.reply(box("SOCKET FREE", ["Estado › proceso activo", "Detalle › espera el código actual."]))
    return
  }

  codeSocketLocks.add(lockKey)
  await mctx.react("⏳")

  const parentBotJid = parentBot?.bot_type === "premium" ? "" : getEffectiveBotJid(parentBot)
  const hierarchyParentJid = getEffectiveBotJid(parentBot)
  const sessionPath = getFreeCodeSessionPath(targetNumber)
  await cleanupUnlinkedSession(sessionPath)

  const ws = new bot.Bot({
    bot_id: `free-code-${Math.random().toString(36).slice(2, 12)}`,
    bot_jid: botJid,
    owner_jid: mctx.sender.jid,
    bot_type: "free",
    parent_bot_jid: parentBotJid,
    hierarchy_parent_jid: hierarchyParentJid,
    connection_method: "code",
    session_path: sessionPath,
  })

  let isConnected = false
  let hasSentCredential = false
  let hasSentError = false

  const unlock = () => codeSocketLocks.delete(lockKey)
  const failClean = async () => {
    if (isConnected) return
    unlock()
    await cleanupUnlinkedSession(sessionPath)
  }

  ws.ev.on("bot.code", async (e) => {
    if (hasSentCredential || isConnected) return
    hasSentCredential = true

    const { key } = await wss.sendMessage(
      mctx.chat.jid,
      {
        text: box("SOCKET FREE", [
          "Método › Código",
          `Código › *${e.code}*`,
          `Bot › @${targetNumber}`,
          "Nota › configuración limitada",
        ]),
        mentions: botJid ? [botJid] : [],
      },
      { quoted: mctx.message.original },
    )

    setTimeout(async () => {
      if (!isConnected) await wss.sendMessage(mctx.chat.jid, { delete: key }).catch(() => null)
    }, 60_000)
  })

  ws.ev.on("bot.error", async (e) => {
    if (hasSentError) return
    hasSentError = true
    await mctx.react("❌")
    await mctx.reply(box("SOCKET FREE", ["Estado › error", `Motivo › ${libs.formatError(String(e.error))}`]))
    await failClean()
  })

  ws.ev.on("bot.open", async (e) => {
    isConnected = true
    unlock()
    await mctx.react("✅")
    const number = e.botjid.split("@")[0]
    const { text, mentions } = freeSocketConnectedMessage(number, mctx.sender.jid, parentBotJid)
    await wss.sendMessage(mctx.chat.jid, { text, mentions }, { quoted: mctx.message.original })
  })

  try {
    await ws.connect()
  } catch (error) {
    await mctx.react("❌")
    await mctx.reply(box("SOCKET FREE", ["Estado › error al iniciar", `Motivo › ${libs.formatError(String(error))}`]))
    await failClean()
    return
  }

  setTimeout(async () => {
    if (!isConnected) await failClean()
  }, 130_000)
}

const command: types.Command = {
  name: "code",
  alias: ["codigo"],
  description: "Crear un sub-bot free con código de vinculación desde un grupo.",
  category: "bot",
  hidden: false,
  requires: [],
  flags: ["only.groups"],
  using: "<número>",
  execute: async (wss, { mctx, args, bot }) => {
    await createFreeCodeSocket(wss, mctx, args[0], bot)
  },
}

export default command
