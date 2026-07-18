import fs from "node:fs/promises"
import path from "node:path"
import * as baileys from "baileys"
import type * as types from "../types/types.js"
import {
  DEFAULT_COMMAND_PREFIXES,
  getUniversalConfig,
  isRuntimeSetupComplete,
  normalizeOwnerJid,
  normalizePrefixes,
  parseOptionalUrl,
  type SetupAssetKey,
  type SetupTextKey,
  type UniversalBotConfig,
  updateUniversalConfig,
} from "./zeta_cf.js"

const ASSET_DIR = path.join("base_zeta_assets", "oficial")
const MAX_MEDIA_SIZE = 25 * 1024 * 1024
const CACHE_TTL_MS = 5 * 60 * 1000

type AnyMessage = any

type SetupStep =
  | { type: "asset"; index: number; key: SetupAssetKey; fileBase: string; label: string; prompt: string }
  | { type: "text"; key: SetupTextKey; prompt: string }
  | { type: "prefixes"; prompt: string }
  | { type: "done" }

type MediaCandidate = {
  message: baileys.WAMessage
  mimetype: string
  size: number
}

const assetSteps: Array<{ key: SetupAssetKey; fileBase: string; label: string; prompt: string }> = [
  { key: "generalImage", fileBase: "imagen-general", label: "imagen general", prompt: "Envía la imagen general." },
  { key: "subMainImage", fileBase: "imagen-sub-principal", label: "imagen sub principal", prompt: "Envía la imagen sub principal." },
  { key: "rpgImage", fileBase: "imagen-rpg", label: "imagen RPG", prompt: "Envía la imagen RPG." },
  { key: "welcomeImage", fileBase: "imagen-bienvenidas-salidas", label: "imagen de bienvenida/salida", prompt: "Envía la imagen de bienvenida y salida." },
]

const textSteps: Array<{ key: SetupTextKey; prompt: string }> = [
  { key: "channelUrl", prompt: "Envía el enlace del canal oficial. Si no tienes, envía 0." },
  { key: "facebookUrl", prompt: "Envía el enlace de Facebook. Si no tienes, envía 0." },
  { key: "instagramUrl", prompt: "Envía el enlace de Instagram. Si no tienes, envía 0." },
  { key: "tiktokUrl", prompt: "Envía el enlace de TikTok. Si no tienes, envía 0." },
  { key: "telegramUrl", prompt: "Envía el enlace de Telegram. Si no tienes, envía 0." },
]

let lastPromptKey = ""
let processingStep = false

const mediaCache = new Map<string, MediaCandidate>()
const savedSourceIds = new Set<string>()
const setupWarnings = new Map<string, number>()
const WARNING_TTL_MS = 60_000

const cleanText = (value: unknown): string => String(value ?? "").trim()

const safeNormalizeJid = (jid?: string | null): string => {
  if (!jid) return ""
  try {
    return baileys.jidNormalizedUser(jid)
  } catch {
    return String(jid)
  }
}

const unwrapMessageContent = (content: AnyMessage): AnyMessage => {
  let current = content || {}

  for (let i = 0; i < 16; i++) {
    const next =
      current?.ephemeralMessage?.message ||
      current?.viewOnceMessage?.message ||
      current?.viewOnceMessageV2?.message ||
      current?.viewOnceMessageV2Extension?.message ||
      current?.documentWithCaptionMessage?.message ||
      current?.deviceSentMessage?.message?.message ||
      current?.deviceSentMessage?.message ||
      current?.editedMessage?.message ||
      current?.protocolMessage?.editedMessage

    if (!next || next === current) break
    current = next
  }

  return current || content || {}
}

const getMessageType = (content: AnyMessage): string =>
  Object.keys(content || {}).find((key) => key !== "senderKeyDistributionMessage" && key !== "messageContextInfo") || ""

const getTextFromContent = (content: AnyMessage): string => {
  const c = unwrapMessageContent(content)

  return cleanText(
    c?.conversation ||
      c?.extendedTextMessage?.text ||
      c?.imageMessage?.caption ||
      c?.videoMessage?.caption ||
      c?.documentMessage?.caption ||
      c?.documentWithCaptionMessage?.message?.documentMessage?.caption ||
      "",
  )
}

const digitsFromJid = (jid?: string | null): string =>
  String(jid || "")
    .split(":")[0]
    .split("@")[0]
    .replace(/[^0-9]/g, "")

const mexicanAlt = (number: string): string => (number.startsWith("521") ? `52${number.slice(3)}` : "")

const numberMatches = (value: string, expected: string): boolean => {
  if (!value || !expected) return false
  return value === expected || value === mexicanAlt(expected) || mexicanAlt(value) === expected
}

const sameJidOrNumber = (left?: string | null, right?: string | null): boolean => {
  const a = safeNormalizeJid(left)
  const b = safeNormalizeJid(right)
  if (!a || !b) return false
  if (a === b) return true

  const aDigits = digitsFromJid(a)
  const bDigits = digitsFromJid(b)
  return Boolean(aDigits && bDigits && (aDigits === bDigits || aDigits === mexicanAlt(bDigits) || mexicanAlt(aDigits) === bDigits))
}

const getBotPhoneNumber = (wss: types.WASocket): string => digitsFromJid(wss.user?.id)
const getBotLid = (wss: types.WASocket): string => safeNormalizeJid((wss.user as any)?.lid)
const getBotPnJid = (wss: types.WASocket): string => {
  const number = getBotPhoneNumber(wss)
  return number ? `${number}@s.whatsapp.net` : ""
}

const getRawChatJid = (message: baileys.WAMessage): string => safeNormalizeJid(message.key.remoteJid)

const getChatCacheKeys = (message: baileys.WAMessage, wss: types.WASocket, config = getUniversalConfig()): string[] => {
  const keys = new Set<string>()
  const chatJid = getRawChatJid(message)
  const locked = config.setup?.lockedChatJid || ""

  if (chatJid) keys.add(chatJid)
  if (locked) keys.add(locked)

  const chatDigits = digitsFromJid(chatJid)
  if (chatDigits) keys.add(`num:${chatDigits}`)

  const botNumber = getBotPhoneNumber(wss)
  const botLidNumber = digitsFromJid(getBotLid(wss))
  if (botNumber) keys.add(`num:${botNumber}`)
  if (botLidNumber) keys.add(`num:${botLidNumber}`)

  if (message.key.fromMe) keys.add("fromMe")

  return Array.from(keys).filter(Boolean)
}

const cacheMedia = (message: baileys.WAMessage, wss: types.WASocket, media: MediaCandidate | null) => {
  if (!media) return
  const keys = getChatCacheKeys(message, wss)
  for (const key of keys) mediaCache.set(key, media)

  setTimeout(() => {
    for (const key of keys) {
      const current = mediaCache.get(key)
      if (current?.message.key.id === media.message.key.id) mediaCache.delete(key)
    }
  }, CACHE_TTL_MS)
}

const getCachedMedia = (message: baileys.WAMessage, wss: types.WASocket): MediaCandidate | null => {
  for (const key of getChatCacheKeys(message, wss)) {
    const media = mediaCache.get(key)
    if (media) return media
  }
  return null
}

const clearCachedMedia = (message: baileys.WAMessage, wss: types.WASocket) => {
  for (const key of getChatCacheKeys(message, wss)) mediaCache.delete(key)
}

const getPromptTarget = (wss: types.WASocket, config = getUniversalConfig()): string =>
  config.setup?.lockedChatJid || getBotPnJid(wss) || getBotLid(wss)

const isOwnBotChat = (message: baileys.WAMessage, wss: types.WASocket, config = getUniversalConfig()): boolean => {
  const chatJid = getRawChatJid(message)
  if (!chatJid || chatJid.endsWith("@g.us") || chatJid.endsWith("@newsletter")) return false

  if (config.setup?.lockedChatJid) {
    return sameJidOrNumber(config.setup.lockedChatJid, chatJid)
  }

  if (message.key.fromMe) return true

  const chatNumber = digitsFromJid(chatJid)
  const botNumber = getBotPhoneNumber(wss)
  const botLidNumber = digitsFromJid(getBotLid(wss))

  return numberMatches(chatNumber, botNumber) || numberMatches(chatNumber, botLidNumber)
}

const isOwnSetupNoticeRaw = (message: baileys.WAMessage): boolean => {
  if (!message.key.fromMe) return false
  const text = getTextFromContent(message.message)
  return (
    text.startsWith("*Configuración de ") ||
    text.startsWith("Envía la imagen") ||
    text.startsWith("Envía el enlace") ||
    text.startsWith("Ponga el número") ||
    text.startsWith("Envía los prefijos") ||
    text.startsWith("Falta la ") ||
    text.startsWith("✅ ")
  )
}

const getCurrentStep = (config = getUniversalConfig()): SetupStep => {
  for (let index = 0; index < assetSteps.length; index++) {
    const step = assetSteps[index]
    if (!config.setup?.assets?.[step.key]?.path) return { type: "asset", index, ...step }
  }

  for (const step of textSteps) {
    if (!config.setup?.textCompleted?.[step.key]) return { type: "text", ...step }
  }

  if (!config.setup?.prefixes?.length) {
    return { type: "prefixes", prompt: "Por último, envía los prefijos del bot. Puedes mandar uno o varios separados por espacio, coma o salto de línea. Ejemplo: . # !" }
  }

  return { type: "done" }
}

const sendSafe = async (wss: types.WASocket, jid: string, text: string, quoted?: baileys.WAMessage) => {
  if (!jid) return
  try {
    await wss.sendMessage(jid, { text }, quoted ? { quoted } : undefined)
  } catch {
    try {
      await wss.sendMessage(jid, { text })
    } catch {}
  }
}

const sendWarningOnce = async (wss: types.WASocket, jid: string, key: string, text: string, quoted?: baileys.WAMessage) => {
  const now = Date.now()
  const mapKey = `${jid}:${key}`
  const last = setupWarnings.get(mapKey) || 0
  if (now - last < WARNING_TTL_MS) return
  setupWarnings.set(mapKey, now)
  await sendSafe(wss, jid, text, quoted)
}

const sendCurrentPrompt = async (wss: types.WASocket, force = false) => {
  const config = getUniversalConfig()
  if (config.setup?.completed) return

  const step = getCurrentStep(config)
  if (step.type === "done") return

  const target = getPromptTarget(wss, config)
  if (!target) return

  const promptId = step.type === "asset" || step.type === "text" ? step.key : "prefixes"
  const promptKey = `${step.type}:${promptId}:${target}`
  if (!force && lastPromptKey === promptKey) return
  lastPromptKey = promptKey

  await sendSafe(wss, target, `*Configuración de ${config.botName}*\n\n${step.prompt}`)
}

const getMediaInfoFromContent = (content: AnyMessage): { mimetype: string; size: number } | null => {
  const c = unwrapMessageContent(content)
  const media = c?.imageMessage || c?.videoMessage || c?.stickerMessage || c?.documentMessage || c?.documentWithCaptionMessage?.message?.documentMessage
  if (!media) return null

  const mimetype = String(media.mimetype || "").toLowerCase()
  const size = Number(media.fileLength || 0)

  if (!(mimetype.startsWith("image/") || mimetype.startsWith("video/"))) return null
  if (size && size > MAX_MEDIA_SIZE) return null

  return { mimetype: mimetype || "application/octet-stream", size }
}

const extractCurrentMedia = (message: baileys.WAMessage): MediaCandidate | null => {
  const content = unwrapMessageContent(message.message)
  const info = getMediaInfoFromContent(content)
  if (!info) return null

  return { message: { ...message, message: content } as baileys.WAMessage, ...info }
}

const getContextInfoFromContent = (content: AnyMessage): AnyMessage => {
  const c = unwrapMessageContent(content)
  const type = getMessageType(c)

  return (
    c?.[type]?.contextInfo ||
    c?.extendedTextMessage?.contextInfo ||
    c?.imageMessage?.contextInfo ||
    c?.videoMessage?.contextInfo ||
    c?.documentMessage?.contextInfo ||
    c?.documentWithCaptionMessage?.message?.documentMessage?.contextInfo ||
    null
  )
}

const extractQuotedMedia = (message: baileys.WAMessage, wss: types.WASocket): MediaCandidate | null => {
  const contextInfo = getContextInfoFromContent(message.message)
  const quotedMessage = contextInfo?.quotedMessage
  if (!quotedMessage) return null

  const quotedContent = unwrapMessageContent(quotedMessage)
  const info = getMediaInfoFromContent(quotedContent)
  if (!info) return null

  const participant = safeNormalizeJid(contextInfo.participant)
  const botPn = safeNormalizeJid(wss.user?.id)
  const botLid = getBotLid(wss)

  const quoted: baileys.WAMessage = {
    key: {
      remoteJid: safeNormalizeJid(contextInfo.remoteJid || message.key.remoteJid),
      participant,
      fromMe: sameJidOrNumber(participant, botPn) || sameJidOrNumber(participant, botLid),
      id: contextInfo.stanzaId || "",
    },
    message: quotedContent,
  } as baileys.WAMessage

  return { message: quoted, ...info }
}

const getMediaExtension = (mimetype: string): string => {
  const mime = mimetype.toLowerCase()
  if (mime.includes("png")) return "png"
  if (mime.includes("webp")) return "webp"
  if (mime.includes("gif")) return "gif"
  if (mime.includes("video")) return "mp4"
  return "jpg"
}

const streamToBuffer = async (stream: any): Promise<Buffer> => {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return Buffer.concat(chunks)
}

const mediaNodeFromMessage = (message: baileys.WAMessage): { node: AnyMessage; type: string } | null => {
  const c = unwrapMessageContent(message.message)
  if (c?.imageMessage) return { node: c.imageMessage, type: "image" }
  if (c?.videoMessage) return { node: c.videoMessage, type: "video" }
  if (c?.stickerMessage) return { node: c.stickerMessage, type: "sticker" }
  if (c?.documentMessage) return { node: c.documentMessage, type: "document" }
  if (c?.documentWithCaptionMessage?.message?.documentMessage) return { node: c.documentWithCaptionMessage.message.documentMessage, type: "document" }
  return null
}

const downloadMediaBuffer = async (media: MediaCandidate): Promise<Buffer> => {
  const direct = await baileys.downloadMediaMessage(media.message, "buffer", {}).catch(() => null)
  if (Buffer.isBuffer(direct) && direct.length) return direct

  const node = mediaNodeFromMessage(media.message)
  if (node && typeof (baileys as any).downloadContentFromMessage === "function") {
    const stream = await (baileys as any).downloadContentFromMessage(node.node, node.type).catch(() => null)
    if (stream) {
      const buffer = await streamToBuffer(stream)
      if (buffer.length) return buffer
    }
  }

  throw new Error("No se pudo descargar el archivo.")
}

const deleteOldAssetVariants = async (dir: string, fileBase: string) => {
  for (const ext of ["jpg", "jpeg", "png", "webp", "gif", "mp4"]) {
    await fs.rm(path.join(dir, `${fileBase}.${ext}`), { force: true }).catch(() => {})
  }
}

const saveSetupMedia = async (media: MediaCandidate, step: Extract<SetupStep, { type: "asset" }>) => {
  const buffer = await downloadMediaBuffer(media)
  if (buffer.length > MAX_MEDIA_SIZE) throw new Error("El archivo es demasiado pesado.")

  await fs.mkdir(ASSET_DIR, { recursive: true, mode: 0o700 })

  const extension = getMediaExtension(media.mimetype)
  await deleteOldAssetVariants(ASSET_DIR, step.fileBase)

  const relativePath = path.join(ASSET_DIR, `${step.fileBase}.${extension}`)
  await fs.writeFile(relativePath, buffer, { mode: 0o600 })

  return {
    path: relativePath,
    mimetype: media.mimetype || "application/octet-stream",
    size: buffer.length,
    savedAt: new Date().toISOString(),
  }
}

const syncSetupAssetsToBotRecord = async (wss: types.WASocket, config: UniversalBotConfig) => {
  try {
    const database = await import("../database/database.js")
    const jids = new Set<string>()
    if (wss.user?.id) jids.add(safeNormalizeJid(wss.user.id))
    if ((wss.user as any)?.lid) jids.add(getBotLid(wss))

    for (const jid of Array.from(jids).filter(Boolean)) {
      await database.Bots.set(jid, {
        bot_jid: jid,
        name: config.botName,
        owner_jid: config.ownerJid,
        owner_lid: config.ownerLid,
        owner_pn: config.ownerPn,
        owner_name: config.ownerName,
        owner_number: config.ownerNumber,
        logo_url: config.setup.assets.generalImage?.path || "",
        thumbnail_url: config.setup.assets.generalImage?.path || "",
        submenu_url: config.setup.assets.subMainImage?.path || "",
        welcome_url: config.setup.assets.welcomeImage?.path || "",
        rpg_url: config.setup.assets.rpgImage?.path || "",
        channel_url: config.channelUrl || "",
        facebook_url: config.socialLinks?.facebook || "",
        instagram_url: config.socialLinks?.instagram || "",
        tiktok_url: config.socialLinks?.tiktok || "",
        telegram_url: config.socialLinks?.telegram || "",
        prefixes: (config.setup.prefixes || []).join(" "),
        setup_completed: true,
        setup_step: 0,
        bot_type: "main",
        currency: config.currencyName,
      })
    }
  } catch {}
}

const completeSetup = async (wss: types.WASocket, chatJid: string, prefixes: string[]) => {
  const safePrefixes = prefixes.length ? prefixes : [...DEFAULT_COMMAND_PREFIXES]

  const config = updateUniversalConfig({
    setup: {
      completed: true,
      lockedChatJid: chatJid,
      prefixes: safePrefixes,
      updatedAt: new Date().toISOString(),
    },
  })

  await syncSetupAssetsToBotRecord(wss, config)
  lastPromptKey = ""
  await sendSafe(wss, chatJid, `✅ ${config.botName} listo.\nPrefijos: ${safePrefixes.join(" ")}`)
}

export const ensurePostConnectionSetup = async (wss: types.WASocket) => {
  if (isRuntimeSetupComplete()) return
  await sendCurrentPrompt(wss, true)
}

export const isPostConnectionSetupComplete = (): boolean => isRuntimeSetupComplete()

export const getMatchedCommandPrefix = (text: string, bot?: Partial<types.BotDocument> | null): string => {
  if (!isRuntimeSetupComplete()) return ""

  const config = getUniversalConfig()
  const botPrefixes = normalizePrefixes((bot as any)?.prefixes || "")
  const prefixes = (botPrefixes.length ? botPrefixes : config.setup.prefixes?.length ? config.setup.prefixes : [...DEFAULT_COMMAND_PREFIXES])
    .slice()
    .sort((a, b) => b.length - a.length)
  return prefixes.find((prefix) => cleanText(text).startsWith(prefix)) || ""
}

export const handlePostConnectionSetupRaw = async (message: baileys.WAMessage, wss: types.WASocket): Promise<boolean> => {
  const config = getUniversalConfig()
  if (config.setup?.completed) return false
  if (!message?.message) return true
  if (isOwnSetupNoticeRaw(message)) return true
  if (!isOwnBotChat(message, wss, config)) return true

  const text = getTextFromContent(message.message)
  const currentMedia = extractCurrentMedia(message)
  const quotedMedia = extractQuotedMedia(message, wss)
  cacheMedia(message, wss, currentMedia)

  if (processingStep) return true
  processingStep = true

  try {
    const current = getUniversalConfig()
    const chatJid = getRawChatJid(message)
    const lockedChatJid = current.setup?.lockedChatJid || chatJid || getPromptTarget(wss, current)
    const step = getCurrentStep(current)

    if (step.type === "asset") {
      const media = currentMedia || quotedMedia || getCachedMedia(message, wss)

      if (!media) {
        if (cleanText(text)) {
          await sendSafe(wss, chatJid, `Falta la ${step.label}.`, message)
          return true
        }

        await sendCurrentPrompt(wss)
        return true
      }

      const sourceId = `${step.key}:${media.message.key.remoteJid || ""}:${media.message.key.id || ""}:${media.size}`
      if (savedSourceIds.has(sourceId)) return true

      try {
        const asset = await saveSetupMedia(media, step)
        savedSourceIds.add(sourceId)
        setTimeout(() => savedSourceIds.delete(sourceId), CACHE_TTL_MS)
        clearCachedMedia(message, wss)

        updateUniversalConfig({
          setup: {
            lockedChatJid,
            assets: { [step.key]: asset },
            updatedAt: new Date().toISOString(),
          },
        })

        await sendSafe(wss, lockedChatJid, `✅ ${step.label} guardada.`)
        await sendCurrentPrompt(wss, true)
        return true
      } catch {
        await sendSafe(wss, chatJid, "No pude guardar la imagen. Reenvíala.", message)
        return true
      }
    }

    if (step.type === "text") {
      const raw = cleanText(text)

      if (step.key === "ownerJid") {
        const ownerJid = raw === "0" ? normalizeOwnerJid(lockedChatJid || chatJid) : normalizeOwnerJid(raw)
        if (!ownerJid) {
          await sendSafe(wss, chatJid, "Número inválido. Ponga el número del owner con prefijo, junto o separado. También puedes enviar 0 para usar el contacto por defecto.", message)
          return true
        }

        updateUniversalConfig({
          ownerJid,
          setup: {
            lockedChatJid,
            textCompleted: { ownerJid: true },
            updatedAt: new Date().toISOString(),
          },
        })

        await sendSafe(wss, lockedChatJid, "✅ Owner guardado.")
        await sendCurrentPrompt(wss, true)
        return true
      }

      const parsed = parseOptionalUrl(raw)
      if (!parsed.ok) {
        await sendWarningOnce(
          wss,
          chatJid,
          `link:${step.key}`,
          `「◈」 CONFIGURACIÓN
◈ Enlace inválido
◈ Ejemplo › https://instagram.com/usuario
◈ Omitir › envía 0`,
          message,
        )
        return true
      }

      const socialUpdate: any = {}
      const configUpdate: any = {
        setup: {
          lockedChatJid,
          textCompleted: { [step.key]: true },
          updatedAt: new Date().toISOString(),
        },
      }

      if (step.key === "channelUrl") configUpdate.channelUrl = parsed.value
      if (step.key === "facebookUrl") socialUpdate.facebook = parsed.value
      if (step.key === "instagramUrl") socialUpdate.instagram = parsed.value
      if (step.key === "tiktokUrl") socialUpdate.tiktok = parsed.value
      if (step.key === "telegramUrl") socialUpdate.telegram = parsed.value
      if (Object.keys(socialUpdate).length) configUpdate.socialLinks = socialUpdate

      updateUniversalConfig(configUpdate)

      await sendSafe(wss, lockedChatJid, parsed.value ? "✅ Enlace guardado." : "✅ Omitido.")
      await sendCurrentPrompt(wss, true)
      return true
    }

    if (step.type === "prefixes") {
      const prefixes = normalizePrefixes(cleanText(text).replace(/[,_|]+/g, " ").replace(/\n+/g, " "))
      if (!prefixes.length) {
        await sendSafe(wss, chatJid, "Envía al menos un prefijo. Ejemplo válido: . # !", message)
        return true
      }

      await completeSetup(wss, lockedChatJid, prefixes)
      return true
    }

    await completeSetup(wss, lockedChatJid, current.setup.prefixes || [...DEFAULT_COMMAND_PREFIXES])
    return true
  } finally {
    processingStep = false
  }
}

export const handlePostConnectionSetupMessage = async (
  mctx: types.MessageContext,
  wss: types.WASocket,
): Promise<boolean> => {
  if (getUniversalConfig().setup?.completed) return false
  const original = mctx.message.original as baileys.WAMessage | null
  if (original?.message) return handlePostConnectionSetupRaw(original, wss)
  return true
}
