import * as baileys from "baileys"
import type * as types from "../../types/types.js"
import * as database from "../../database/database.js"
import { ensureScopedGroupSeed, getInheritedBotConfig } from "../../libs/bot-scope.js"

const messageCache = new Map<string, baileys.WAMessage>()
const MESSAGE_CACHE_TTL_MS = 10 * 60 * 1000

export const cacheMessage = (message: baileys.WAMessage): void => {
  const remoteJid = message.key?.remoteJid
  const id = message.key?.id
  if (!remoteJid || !id || !/@g\.us$/i.test(remoteJid)) return
  if (message.message?.protocolMessage) return

  const cacheKey = `${remoteJid}:${id}`
  messageCache.set(cacheKey, message)
  setTimeout(() => messageCache.delete(cacheKey), MESSAGE_CACHE_TTL_MS)
}

const safeNormalizeJid = (jid?: string | null): string => {
  if (!jid) return ""
  try {
    return baileys.jidNormalizedUser(jid)
  } catch {
    return String(jid)
  }
}

const resolveBot = async (wss: types.WASocket): Promise<types.BotDocument | null> => {
  try {
    const pnJid = safeNormalizeJid(wss.user?.id)
    const lidJid = safeNormalizeJid((wss.user as any)?.lid || wss.user?.id)
    const lookupJid = lidJid && (await database.Bots.has(lidJid)) ? lidJid : pnJid
    if (!lookupJid) return null
    const raw = await database.Bots.find(lookupJid)
    return raw ? await getInheritedBotConfig(raw) : null
  } catch {
    return null
  }
}

const buildNotify = async (
  wss: types.WASocket,
  remoteJid: string,
  cached: baileys.WAMessage,
  senderJid: string,
): Promise<void> => {
  const botDoc = await resolveBot(wss)
  const scopedGroupJid = await ensureScopedGroupSeed(botDoc, remoteJid)
  const group = await database.Groups.get(scopedGroupJid)
  if (!group || !(group as any).antidelete_enabled) return

  const senderNumber = senderJid.split("@")[0].split(":")[0]
  const msg = cached.message

  const audioMsg = msg?.audioMessage
  if (audioMsg) {
    try {
      await wss.sendMessage(remoteJid, { forward: cached, force: true } as any)
    } catch {}
    return
  }

  const imageMsg = msg?.imageMessage
  const videoMsg = msg?.videoMessage
  const documentMsg = msg?.documentMessage
  const stickerMsg = msg?.stickerMessage
  const textMsg = msg?.conversation || msg?.extendedTextMessage?.text || ""

  if (!imageMsg && !videoMsg && !documentMsg && !stickerMsg && !textMsg) return

  const tag = senderNumber ? `@${senderNumber}` : "alguien"
  const caption = imageMsg?.caption || videoMsg?.caption || documentMsg?.caption || ""
  const tipo = imageMsg ? "imagen" : videoMsg ? "video" : documentMsg ? "documento" : stickerMsg ? "sticker" : "mensaje"

  const lines: string[] = [
    `「◈」 Anti Delete`,
    `│ Tipo › ${tipo} eliminado`,
    `│ Por › ${tag}`,
  ]
  if (textMsg) lines.push(`│ Texto › ${textMsg}`)
  if (caption) lines.push(`│ Descripción › ${caption}`)

  try {
    if (imageMsg || videoMsg || documentMsg || stickerMsg) {
      await wss.sendMessage(remoteJid, { forward: cached, force: true } as any)
    }
  } catch {}

  await wss.sendMessage(remoteJid, {
    text: lines.join("\n"),
    mentions: senderJid ? [senderJid] : [],
  })
}

export const handleRevokeInUpsert = async (
  message: baileys.WAMessage,
  wss: types.WASocket,
): Promise<boolean> => {
  try {
    const proto = message.message?.protocolMessage
    if (!proto) return false

    const REVOKE_TYPE = 0
    if ((proto.type as unknown as number) !== REVOKE_TYPE) return false

    const remoteJid = message.key?.remoteJid
    if (!remoteJid || !/@g\.us$/i.test(remoteJid)) return false

    const deletedKey = proto.key
    const deletedId = deletedKey?.id
    if (!deletedId) return false

    const senderJid = deletedKey?.participant
      ? deletedKey.participant
      : deletedKey?.fromMe
        ? (wss.user?.id || "")
        : (message.key?.participant || "")

    const cacheKey = `${remoteJid}:${deletedId}`
    const cached = messageCache.get(cacheKey)
    if (!cached) return true

    messageCache.delete(cacheKey)

    const originalSender: string = cached.key?.participant || (cached as any).participant || senderJid || ""
    await buildNotify(wss, remoteJid, cached, originalSender)
    return true
  } catch (error) {
    console.error("[AntiDelete] handleRevokeInUpsert error:", error)
    return false
  }
}

export const handleMessagesDelete = async (
  event: baileys.BaileysEventMap["messages.delete"],
  wss: types.WASocket,
): Promise<void> => {
  try {
    if (!("keys" in event) || !event.keys?.length) return

    for (const key of event.keys) {
      const remoteJid = key.remoteJid
      if (!remoteJid || !/@g\.us$/i.test(remoteJid)) continue
      const messageId = key.id
      if (!messageId) continue

      const cacheKey = `${remoteJid}:${messageId}`
      const cached = messageCache.get(cacheKey)
      if (!cached) continue

      messageCache.delete(cacheKey)
      const senderJid: string = cached.key?.participant || (cached as any).participant || ""
      await buildNotify(wss, remoteJid, cached, senderJid)
    }
  } catch (error) {
    console.error("[AntiDelete] handleMessagesDelete error:", error)
  }
}
