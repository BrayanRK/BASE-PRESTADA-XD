import fs from "node:fs/promises"
import path from "node:path"
import * as bot from "../../bot.js"
import * as libs from "../../../libs/libs.js"
import qrcode from "qrcode"
import type * as types from "../../../types/types.js"
import { freeSocketConnectedMessage } from "../../../libs/socket-manager.js"
import { getEffectiveBotJid } from "../../../libs/bot-scope.js"

const qrSocketLocks = new Set<string>()

const box = (title: string, lines: string[]): string => {
  return [`╭─〔 ${title} 〕`, ...lines.map((line) => `│ ${line}`), "╰────────────"].join("\n")
}

const getFreeQrSessionPath = (): string => {
  return path.join(process.cwd(), "freebots", `free-pending-${Date.now()}`)
}

const cleanupUnlinkedSession = async (sessionPath?: string) => {
  if (!sessionPath) return
  await fs.rm(sessionPath, { recursive: true, force: true }).catch(() => null)
}

// Vinculación SOLO por QR. No recibe número de antemano (se escanea el QR con
// el teléfono que se quiera vincular), así que no hay riesgo de chocar/pisar
// la sesión de un número ya activo: cada intento usa una carpeta "pending-*" propia.
export const createFreeQrSocket = async (
  wss: types.WASocket,
  mctx: types.MessageContext,
  parentBot?: Partial<types.BotDocument>,
) => {
  if (!mctx.is_group) {
    await mctx.reply(box("SOCKET FREE", ["Acceso › grupo", "Uso › envía .qr dentro de un grupo."]))
    return
  }

  const lockKey = mctx.chat.jid
  if (qrSocketLocks.has(lockKey)) {
    await mctx.reply(box("SOCKET FREE", ["Estado › proceso activo", "Detalle › espera el QR actual."]))
    return
  }

  qrSocketLocks.add(lockKey)
  await mctx.react("⏳")

  const parentBotJid = parentBot?.bot_type === "premium" ? "" : getEffectiveBotJid(parentBot)
  const hierarchyParentJid = getEffectiveBotJid(parentBot)
  const sessionPath = getFreeQrSessionPath()
  await cleanupUnlinkedSession(sessionPath)

  const ws = new bot.Bot({
    bot_id: `free-qr-${Math.random().toString(36).slice(2, 12)}`,
    bot_jid: null,
    owner_jid: mctx.sender.jid,
    bot_type: "free",
    parent_bot_jid: parentBotJid,
    hierarchy_parent_jid: hierarchyParentJid,
    connection_method: "qr",
    session_path: sessionPath,
  })

  let isConnected = false
  let hasSentCredential = false
  let hasSentError = false

  const unlock = () => qrSocketLocks.delete(lockKey)
  const failClean = async () => {
    if (isConnected) return
    unlock()
    await cleanupUnlinkedSession(sessionPath)
  }

  ws.ev.on("bot.qr", async (e) => {
    if (hasSentCredential || isConnected) return
    hasSentCredential = true

    const { key } = await wss.sendMessage(
      mctx.chat.jid,
      {
        image: await qrcode.toBuffer(e.qr, { scale: 8 }),
        caption: box("SOCKET FREE", ["Método › QR", "Validez › temporal", "Nota › configuración limitada"]),
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
  name: "qr",
  alias: [],
  description: "Crear un sub-bot free con código QR desde un grupo.",
  category: "bot",
  hidden: false,
  requires: [],
  flags: ["only.groups"],
  execute: async (wss, { mctx, bot }) => {
    await createFreeQrSocket(wss, mctx, bot)
  },
}

export default command
