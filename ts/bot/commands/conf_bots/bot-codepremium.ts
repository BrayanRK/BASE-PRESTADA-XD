import fs from "node:fs/promises"
import path from "node:path"
import * as baileys from "baileys"
import * as bot from "../../bot.js"
import * as libs from "../../../libs/libs.js"
import { PremiumManager, sameUser, socketUsage, unmarkSocketStopped } from "../../../libs/socket-manager.js"
import type * as types from "../../../types/types.js"

type ActivePremiumCodeProcess = {
  startedAt: number
  stop: () => Promise<void>
}

const activePremiumCodeProcesses = new Map<string, ActivePremiumCodeProcess>()
const LINK_TIMEOUT_MS = 10 * 60 * 1000

const box = (title: string, lines: string[]): string => {
  return [`╭─〔 ${title} 〕`, ...lines.map((line) => `│ ${line}`), "╰────────────"].join("\n")
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const normalizeToken = (value: unknown): string => String(value || "").trim().toUpperCase()
const normalizeNumber = (value: unknown): string => String(value || "").replace(/[^0-9]/g, "")

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

const formatPairingCode = (code: unknown): string => {
  const clean = String(code || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase()
  if (clean.length < 8) return ""
  const value = clean.slice(0, 8)
  return `${value.slice(0, 4)}-${value.slice(4)}`
}

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | null = null

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

const getSessionPath = (targetNumber: string): string => {
  return path.join(process.cwd(), "prembots", `prem-${targetNumber}`)
}

const getPremiumBackupPath = (targetNumber: string): string => {
  return path.join(process.cwd(), "backups", "premium-sockets", `prem-${targetNumber}`)
}

const cleanCodePremiumAttempt = async (sessionPath: string, targetNumber: string): Promise<void> => {
  await fs.rm(sessionPath, { recursive: true, force: true }).catch(() => null)
  await fs.rm(getPremiumBackupPath(targetNumber), { recursive: true, force: true }).catch(() => null)
}

const resolveWhatsappJid = async (wss: types.WASocket, targetNumber: string): Promise<string | null> => {
  const candidates = Array.from(
    new Set([`${targetNumber}@s.whatsapp.net`, baileys.jidEncode(targetNumber, "s.whatsapp.net")]),
  )

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

const getPairingRequester = async (
  ws: bot.Bot,
  timeoutMs = 35_000,
): Promise<(phoneNumber: string) => Promise<string>> => {
  const startedAt = Date.now()

  while (Date.now() - startedAt <= timeoutMs) {
    const sock = (ws as any).socket
    const requester = sock?.requestPairingCode

    if (typeof requester === "function") return requester.bind(sock)
    await delay(250)
  }

  throw new Error("Baileys aún no expuso requestPairingCode")
}

const createCodePremiumSocket = async (
  wss: types.WASocket,
  mctx: types.MessageContext,
  usedPrefix: string,
  rawToken: string,
  rawPhoneNumber?: string,
): Promise<void> => {
  if (mctx.is_group) {
    await mctx.reply(
      box("SOCKET PREMIUM", [
        "Acceso › privado",
        `Uso › ${usedPrefix}codepremium solo funciona por privado.`,
      ]),
    )
    return
  }

  const token = normalizeToken(rawToken)
  const targetNumber = normalizeNumber(rawPhoneNumber)

  if (!token || !targetNumber || targetNumber.length < 8) {
    await mctx.reply(
      socketUsage("Socket Premium", [
        `Código › ${usedPrefix}codepremium <token> <número>`,
        "Formato › número solo con dígitos, sin + ni espacios.",
      ]),
    )
    return
  }

  const ownerResult = await PremiumManager.getCodeOwner(token)
  if (!ownerResult.success || !ownerResult.userJid) {
    await mctx.reply(box("SOCKET PREMIUM", ["Token › inválido", `Motivo › ${ownerResult.message}`]))
    return
  }

  const foundJid = await resolveWhatsappJid(wss, targetNumber)
  if (!foundJid) {
    await mctx.reply(box("SOCKET PREMIUM", [`Número › ${targetNumber}`, "Estado › no existe en WhatsApp."]))
    return
  }

  // Antes de tocar la sesión: si ese número YA tiene un socket activo, no se pisa por la
  // libre. Cualquiera con un token válido podía antes vincular el número de OTRA persona y
  // borrar su sesión activa sin avisar. Ahora se bloquea, y si es el mismo owner se le pide
  // detenerlo primero con .stop para evitar dos sockets peleando por los mismos creds.
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

  const lockKey = `codepremium:${token}:${targetNumber}`
  const oldProcess = activePremiumCodeProcesses.get(lockKey)
  if (oldProcess && Date.now() - oldProcess.startedAt < LINK_TIMEOUT_MS) {
    await mctx.reply(
      box("SOCKET PREMIUM", [
        "Estado › proceso activo",
        "Acción › usa el código que ya se envió o espera que expire.",
        `Número › ${targetNumber}`,
      ]),
    )
    return
  }

  if (oldProcess) {
    await oldProcess.stop().catch(() => null)
    activePremiumCodeProcesses.delete(lockKey)
  }

  const sessionPath = getSessionPath(targetNumber)
  let finished = false
  let connected = false
  let codeSent = false
  let errorSent = false
  let credentialWatchdog: ReturnType<typeof setTimeout> | null = null
  let linkingWatchdog: ReturnType<typeof setTimeout> | null = null

  unmarkSocketStopped(targetNumber)
  await cleanCodePremiumAttempt(sessionPath, targetNumber)
  await mctx.react("⏳")

  const ws = new bot.Bot({
    bot_id: `premium-code-${Math.random().toString(36).slice(2, 12)}`,
    bot_jid: `${targetNumber}@s.whatsapp.net`,
    owner_jid: ownerResult.userJid,
    bot_type: "premium",
    connection_method: "code",
    session_path: sessionPath,
  })

  const finish = (): void => {
    finished = true
    if (credentialWatchdog) clearTimeout(credentialWatchdog)
    if (linkingWatchdog) clearTimeout(linkingWatchdog)
    if (activePremiumCodeProcesses.get(lockKey)?.stop === stopProcess) activePremiumCodeProcesses.delete(lockKey)
  }

  const failClean = async (): Promise<void> => {
    if (connected) return
    await ws.cleanupLinkingAttempt().catch(() => null)
    await cleanCodePremiumAttempt(sessionPath, targetNumber)
  }

  async function stopProcess(): Promise<void> {
    if (finished) return
    errorSent = true
    finish()
    await failClean()
  }

  activePremiumCodeProcesses.set(lockKey, { startedAt: Date.now(), stop: stopProcess })

  const sendPremiumCode = async (rawCode: unknown): Promise<boolean> => {
    if (finished || connected || codeSent) return false

    const code = formatPairingCode(rawCode)
    if (!code) return false

    codeSent = true
    ;(ws as any).codesSent = Math.max(Number((ws as any).codesSent || 0), 1)

    await mctx.reply(
      box("SOCKET PREMIUM", [
        "Método › CodePremium",
        `Código › *${code}*`,
        `Número › ${targetNumber}`,
        "Validez › temporal",
        "Nota › vincula desde ese mismo número.",
      ]),
      "s.whatsapp.net",
    )

    return true
  }

  const requestCodeOnce = async (): Promise<void> => {
    let lastError = "sin respuesta"

    for (let attempt = 1; attempt <= 2; attempt++) {
      if (finished || connected || codeSent) return

      try {
        const requester = await getPairingRequester(ws, attempt === 1 ? 35_000 : 12_000)
        await delay(attempt === 1 ? 3_500 : 5_000)

        const rawCode = await withTimeout(
          requester(targetNumber),
          35_000,
          "WhatsApp/Baileys tardó demasiado en entregar el code",
        )

        const sentOk = await sendPremiumCode(rawCode)
        if (sentOk) return

        throw new Error("WhatsApp/Baileys devolvió un code vacío")
      } catch (error) {
        lastError = libs.formatError(String(error instanceof Error ? error.message : error))
      }
    }

    if (finished || connected || codeSent || errorSent) return

    errorSent = true
    await mctx.react("❌")
    await mctx.reply(
      box("SOCKET PREMIUM", [
        "Estado › no se pudo entregar el code",
        `Número › ${targetNumber}`,
        `Motivo › ${lastError}`,
        "Token › sigue válido para volver a intentar.",
      ]),
    )

    await failClean()
    finish()
  }

  ws.ev.on("bot.code", async (e) => {
    await sendPremiumCode(e.code)
  })

  ws.ev.on("bot.error", async (e) => {
    if (finished || connected || codeSent || errorSent) return
    errorSent = true
    await mctx.react("❌")
    await mctx.reply(
      box("SOCKET PREMIUM", [
        "Estado › error al generar code",
        `Motivo › ${libs.formatError(String(e.error))}`,
        "Token › sigue válido para volver a intentar.",
      ]),
    )
    await failClean()
    finish()
  })

  ws.ev.on("bot.close", async () => {
    if (finished || connected || codeSent) return
    if (!errorSent) {
      errorSent = true
      await mctx.react("❌")
      await mctx.reply(
        box("SOCKET PREMIUM", [
          "Estado › conexión cerrada antes de entregar code",
          "Token › sigue válido para volver a intentar.",
        ]),
      )
    }
    await failClean()
    finish()
  })

  ws.ev.on("bot.logout", async (e) => {
    if (finished || connected || codeSent) return
    if (!errorSent) {
      errorSent = true
      await mctx.react("❌")
      await mctx.reply(
        box("SOCKET PREMIUM", [
          "Estado › intento rechazado/cerrado",
          `Motivo › ${libs.formatError(String(e.reason || e.error || "sin detalle"))}`,
          "Token › sigue válido si no llegó a conectarse.",
        ]),
      )
    }
    await failClean()
    finish()
  })

  ws.ev.on("bot.open", async (e) => {
    if (finished) return
    connected = true

    const botNumber = jidNumber(e.botjid)
    const codeResult = await PremiumManager.useCode(token, botNumber)

    if (!codeResult.success) {
      await mctx.react("❌")
      await mctx.reply(box("SOCKET PREMIUM", ["Estado › token rechazado", `Motivo › ${codeResult.message}`]))
      await ws.cleanupLinkingAttempt().catch(() => null)
      await cleanCodePremiumAttempt(sessionPath, targetNumber)
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

  ;(ws as any).pairingCodeRequested = true

  try {
    await ws.connect()
  } catch (error) {
    if (!errorSent) {
      errorSent = true
      await mctx.react("❌")
      await mctx.reply(
        box("SOCKET PREMIUM", [
          "Estado › error al iniciar codepremium",
          `Motivo › ${libs.formatError(String(error))}`,
          "Token › sigue válido para volver a intentar.",
        ]),
      )
    }
    await failClean()
    finish()
    return
  }

  requestCodeOnce().catch(async (error) => {
    if (finished || connected || codeSent || errorSent) return
    errorSent = true
    await mctx.react("❌")
    await mctx.reply(
      box("SOCKET PREMIUM", [
        "Estado › no se pudo entregar el code",
        `Número › ${targetNumber}`,
        `Motivo › ${libs.formatError(String(error))}`,
        "Token › sigue válido para volver a intentar.",
      ]),
    )
    await failClean()
    finish()
  })

  credentialWatchdog = setTimeout(async () => {
    if (finished || connected || codeSent) return
    if (!errorSent) {
      errorSent = true
      await mctx.react("❌")
      await mctx.reply(
        box("SOCKET PREMIUM", [
          "Estado › WhatsApp/Baileys no entregó el code",
          `Número › ${targetNumber}`,
          "Token › sigue válido para volver a intentar.",
        ]),
      )
    }
    await failClean()
    finish()
  }, 120_000)

  linkingWatchdog = setTimeout(async () => {
    if (finished || connected) return
    if (!errorSent) {
      errorSent = true
      await mctx.react("❌")
      await mctx.reply(
        box("SOCKET PREMIUM", [
          codeSent ? "Estado › tiempo agotado para vincular el code" : "Estado › no se generó code",
          "Token › sigue válido para volver a intentar.",
        ]),
      )
    }
    await failClean()
    finish()
  }, LINK_TIMEOUT_MS)
}

const command: types.Command = {
  name: "codepremium",
  alias: ["codigopremium", "pairpremium"],
  description: "Crear un sub-bot premium con código de vinculación.",
  category: "bot",
  hidden: false,
  requires: [],
  flags: ["all.chats"],
  using: "<token> <número>",
  execute: async (wss, { mctx, args, usedPrefix }) => {
    await createCodePremiumSocket(wss, mctx, usedPrefix, args[0], args[1])
  },
}

export default command
