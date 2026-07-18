import fs from "node:fs/promises"
import path from "node:path"
import * as bot from "../../bot.js"
import * as libs from "../../../libs/libs.js"
import * as baileys from "baileys"
import { PremiumManager, sameUser, socketUsage, unmarkSocketStopped } from "../../../libs/socket-manager.js"
import qrcode from "qrcode"
import type * as types from "../../../types/types.js"

const premiumSocketLocks = new Set<string>()

const jidNumber = (jid?: string | null): string =>
  String(jid || "")
    .split(":")[0]
    .split("@")[0]
    .replace(/[^0-9]/g, "")

const sameNumber = (left?: string | null, right?: string | null): boolean => {
  const a = jidNumber(left)
  const b = jidNumber(right)
  return Boolean(a && b && a === b)
}

const box = (title: string, lines: string[]): string => {
  return [`╭─〔 ${title} 〕`, ...lines.map((line) => `│ ${line}`), "╰────────────"].join("\n")
}

const normalizeToken = (value: unknown): string => String(value || "").trim().toUpperCase()
const normalizeNumber = (value: unknown): string => String(value || "").replace(/[^0-9]/g, "")

const getSessionPath = (method: "qr" | "code", targetNumber?: string): string => {
  const id = method === "code" && targetNumber ? targetNumber : `pending-${Date.now()}`
  return path.join(process.cwd(), "prembots", `prem-${id}`)
}

const cleanupUnlinkedSession = async (sessionPath?: string) => {
  if (!sessionPath) return
  await fs.rm(sessionPath, { recursive: true, force: true }).catch(() => null)
}

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

export const createPremiumSocket = async (
  wss: types.WASocket,
  mctx: types.MessageContext,
  method: "qr" | "code",
  usedPrefix: string,
  rawToken: string,
  rawPhoneNumber?: string,
) => {
  if (mctx.is_group) {
    await mctx.reply(
      box("SOCKET PREMIUM", [
        "Acceso › privado",
        `Uso › ${usedPrefix}${method === "code" ? "codepremium" : "qrpremium"} solo funciona por privado.`,
      ]),
    )
    return
  }

  const token = normalizeToken(rawToken)
  if (!token) {
    await mctx.reply(
      socketUsage("Socket Premium", [
        `QR › ${usedPrefix}qrpremium <token>`,
        `Código › ${usedPrefix}codepremium <token> <número>`,
      ]),
    )
    return
  }

  const targetNumber = normalizeNumber(rawPhoneNumber)
  if (method === "code" && (!targetNumber || targetNumber.length < 8)) {
    await mctx.reply(
      box("SOCKET PREMIUM", [
        `Uso › ${usedPrefix}codepremium <token> <número>`,
        "Formato › solo números, sin + ni espacios.",
      ]),
    )
    return
  }

  const lockKey = `${method}:${token}:${targetNumber || "qr"}`
  if (premiumSocketLocks.has(lockKey)) {
    await mctx.reply(box("SOCKET PREMIUM", ["Estado › proceso activo", "Detalle › espera el código/QR actual."]))
    return
  }

  const ownerResult = await PremiumManager.getCodeOwner(token)
  if (!ownerResult.success || !ownerResult.userJid) {
    await mctx.reply(box("SOCKET PREMIUM", ["Token › inválido", `Motivo › ${ownerResult.message}`]))
    return
  }

  let botJid: string | null = null
  if (method === "code") {
    botJid = await resolveWhatsappJid(wss, targetNumber)
    if (!botJid) {
      await mctx.reply(box("SOCKET PREMIUM", [`Número › ${targetNumber}`, "Estado › no existe en WhatsApp."]))
      return
    }

    // Mismo resguardo que en .codepremium: si ese número ya tiene un socket activo no se
    // pisa silenciosamente. Antes cualquier token válido permitía borrar la sesión activa
    // de OTRO número con solo conocer/adivinar el número objetivo.
    const existingActive = Array.from(bot.Bot.bots.entries()).find(
      ([jid, data]) => jidNumber(jid || data.bot_jid) === targetNumber,
    )
    if (existingActive) {
      const sameOwner = sameUser(existingActive[1].owner_jid, ownerResult.userJid)
      await mctx.reply(
        box("SOCKET PREMIUM", [
          `Número › ${targetNumber}`,
          "Estado › ya hay un socket activo en ese número",
          sameOwner
            ? `Solución › usa ${usedPrefix}stop ${targetNumber} y vuelve a intentar.`
            : "Motivo › ese número pertenece a otro usuario, no se puede re-vincular.",
        ]),
      )
      return
    }
  }

  premiumSocketLocks.add(lockKey)
  if (targetNumber) unmarkSocketStopped(targetNumber)
  await mctx.react("⏳")

  const sessionPath = getSessionPath(method, targetNumber)
  await cleanupUnlinkedSession(sessionPath)

  const ws = new bot.Bot({
    bot_id: `${method === "qr" ? "premium-qr" : "premium-code"}-` + Math.random().toString(36).slice(2, 12),
    bot_jid: botJid,
    owner_jid: ownerResult.userJid,
    bot_type: "premium",
    connection_method: method,
    session_path: sessionPath,
  })

  let sent = 0
  let sentCredential = false
  let isConnected = false
  let finished = false
  let hasSentError = false
  const maxAttempts = method === "qr" ? 3 : 1

  let watchdog: ReturnType<typeof setTimeout> | null = null

  const finish = () => {
    finished = true
    if (watchdog) clearTimeout(watchdog)
    premiumSocketLocks.delete(lockKey)
  }

  const failClean = async () => {
    if (isConnected) return
    await ws.cleanupLinkingAttempt().catch(() => null)
    premiumSocketLocks.delete(lockKey)
    await cleanupUnlinkedSession(sessionPath)
  }

  ws.ev.on("bot.qr", async (e) => {
    if (isConnected || sent >= maxAttempts) return
    sent++
    sentCredential = true
    const qrBuffer = await qrcode.toBuffer(e.qr, { scale: 8 })

    await wss.sendMessage(mctx.chat.jid, {
      image: qrBuffer,
      caption: box("SOCKET PREMIUM", [
        "Método › QR",
        `Token › ${token}`,
        "Validez › temporal",
      ]),
    })
  })

  ws.ev.on("bot.code", async (e) => {
    if (isConnected || sent >= maxAttempts) return
    sent++
    sentCredential = true

    await mctx.reply(
      box("SOCKET PREMIUM", [
        "Método › Código",
        `Código › *${e.code}*`,
        `Número › ${targetNumber}`,
        "Validez › temporal",
      ]),
      "s.whatsapp.net",
    )
  })

  ws.ev.on("bot.error", async (e) => {
    if (finished || hasSentError) return
    hasSentError = true
    await mctx.react("❌")
    await mctx.reply(box("SOCKET PREMIUM", ["Estado › error", `Motivo › ${libs.formatError(String(e.error))}`]))
    await failClean()
  })

  ws.ev.on("bot.open", async (e) => {
    if (finished) return
    isConnected = true
    const botNumber = jidNumber(e.botjid)
    const codeResult = await PremiumManager.useCode(token, botNumber)

    if (!codeResult.success) {
      await mctx.react("❌")
      await mctx.reply(box("SOCKET PREMIUM", ["Estado › token rechazado", `Motivo › ${codeResult.message}`]))
      await ws.cleanupLinkingAttempt().catch(() => null)
      await cleanupUnlinkedSession(sessionPath)
      finish()
      return
    }

    await mctx.react("✅")
    const botPn = `${botNumber}@s.whatsapp.net`
    const ownerPn = `${jidNumber(ownerResult.userJid)}@s.whatsapp.net`
    const successMentions = [botPn, ownerPn]
    const successText = box("SOCKET PREMIUM CONECTADO", [
      `Bot › @${botNumber}`,
      `Tipo › ${libs.getBotType("premium")}`,
      `Owner › @${jidNumber(ownerResult.userJid)}`,
      "Estado › listo para configurar",
      `Vigencia › ${codeResult.message.replace(/^Código premium activado exitosamente\.\s*/i, "")}`,
    ])

    await wss.sendMessage(mctx.chat.jid, { text: successText, mentions: successMentions }, { quoted: mctx.message.original })

    if (!sameNumber(mctx.chat.jid, ownerResult.userJid)) {
      await wss
        .sendMessage(ownerResult.userJid!, { text: successText, mentions: successMentions })
        .catch(() => null)
    }

    finish()
  })

  try {
    await ws.connect()
  } catch (error) {
    await mctx.react("❌")
    await mctx.reply(box("SOCKET PREMIUM", ["Estado › error al iniciar", `Motivo › ${libs.formatError(String(error))}`]))
    await failClean()
    return
  }

  watchdog = setTimeout(async () => {
    if (finished || isConnected) return

    if (!hasSentError) {
      hasSentError = true
      await mctx.react("❌")
      await mctx.reply(
        box("SOCKET PREMIUM", sentCredential
          ? [
              "Estado › tiempo agotado para vincular",
              `Método › ${method === "code" ? "código" : "QR"}`,
              "Token › sigue válido para volver a intentar.",
            ]
          : [
              "Estado › no se generó credencial",
              `Método › ${method === "code" ? "código" : "QR"}`,
              "Solución › intenta de nuevo; el token sigue válido.",
            ]),
      )
    }

    await failClean()
    finish()
  }, method === "code" ? 170_000 : 130_000)
}

const command: types.Command = {
  name: "qrpremium",
  alias: ["qrprem"],
  description: "Crear un sub-bot premium por QR.",
  category: "bot",
  hidden: false,
  requires: [],
  flags: ["all.chats"],
  using: "<token>",
  execute: async (wss, { mctx, args, usedPrefix }) => {
    await createPremiumSocket(wss, mctx, "qr", usedPrefix, args[0])
  },
}

export default command
