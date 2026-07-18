import * as baileys from "baileys"
import type * as types from "../types/types.js"

export const secretSettingKey = (groupJid: string): string => `secret:${groupJid}`

export type SecretRevealResult = {
  ok: boolean
  reason?: string
  type?: "image" | "video" | "audio"
}

const unwrapViewOnceMessage = (content: any): any => {
  let current = content

  for (let i = 0; i < 10; i++) {
    const next =
      current?.viewOnceMessage?.message ||
      current?.viewOnceMessageV2?.message ||
      current?.viewOnceMessageV2Extension?.message ||
      current?.ephemeralMessage?.message ||
      current?.documentWithCaptionMessage?.message ||
      current?.editedMessage?.message ||
      current?.deviceSentMessage?.message

    if (!next || next === current) break
    current = next
  }

  return current || content || {}
}

const getSourceContent = (message?: baileys.WAMessage | null): any => {
  return (message as any)?.__zetaOriginal?.message || message?.message || {}
}

const getInnerMessage = (message?: baileys.WAMessage | null): any => unwrapViewOnceMessage(getSourceContent(message))

const getMediaPayload = (message?: baileys.WAMessage | null) => {
  const inner = getInnerMessage(message)
  const image = inner?.imageMessage
  const video = inner?.videoMessage
  const audio = inner?.audioMessage

  if (image) return { type: "image" as const, payload: image, inner }
  if (video) return { type: "video" as const, payload: video, inner }
  if (audio) return { type: "audio" as const, payload: audio, inner }

  return null
}

export const isViewOnceMessage = (message?: baileys.WAMessage | null): boolean => {
  const content = getSourceContent(message)
  if (
    content?.viewOnceMessage ||
    content?.viewOnceMessageV2 ||
    content?.viewOnceMessageV2Extension
  ) {
    return true
  }

  const media = getMediaPayload(message)
  return Boolean(media?.payload?.viewOnce)
}

const jidNumber = (jid?: string | null): string =>
  String(jid || "")
    .split(":")[0]
    .split("@")[0]
    .replace(/[^0-9]/g, "")

const getSenderJid = (message?: baileys.WAMessage | null, fallback = ""): string => {
  return String(message?.key?.participant || message?.participant || message?.key?.remoteJid || fallback || "")
}

const buildCaption = (message: baileys.WAMessage, payload: any, fallbackSender = ""): string => {
  const sender = getSenderJid(message, fallbackSender)
  const number = jidNumber(sender)
  const originalCaption = String(payload?.caption || "").trim()
  const header = number
    ? `「✧」 Secret\n│ Revelado de › @${number}\n╰ Tipo › mensaje de una sola vez`
    : `「✧」 Secret\n╰ Tipo › mensaje de una sola vez`

  return originalCaption ? `${header}\n\n${originalCaption}` : header
}

export const revealViewOnceMessage = async (
  wss: types.WASocket,
  chatJid: string,
  sourceMessage?: baileys.WAMessage | null,
  quoted?: baileys.WAMessage | null,
  fallbackSender = "",
): Promise<SecretRevealResult> => {
  if (!sourceMessage) return { ok: false, reason: "No hay mensaje para revelar." }

  if (!isViewOnceMessage(sourceMessage)) {
    return { ok: false, reason: "El mensaje citado no es de una sola vez." }
  }

  const media = getMediaPayload(sourceMessage)
  if (!media) {
    return { ok: false, reason: "Solo puedo revelar imágenes, videos y audios de una sola vez." }
  }

  const downloadMessage = { ...sourceMessage, message: media.inner } as baileys.WAMessage
  let buffer: Buffer | null = null
  try {
    buffer = (await baileys.downloadMediaMessage(downloadMessage, "buffer", {})) as Buffer
  } catch {}

  if (!buffer?.length) {
    return { ok: false, reason: "No pude descargar el contenido. Responde el mensaje justo después de recibirlo e inténtalo otra vez." }
  }

  const mentions = Array.from(
    new Set([
      getSenderJid(sourceMessage, fallbackSender),
      ...(media.payload?.contextInfo?.mentionedJid || []),
    ].filter(Boolean)),
  )
  const mimetype = String(media.payload?.mimetype || "")

  if (media.type === "image") {
    await wss.sendMessage(
      chatJid,
      {
        image: buffer,
        mimetype: mimetype || "image/jpeg",
        caption: buildCaption(sourceMessage, media.payload, fallbackSender),
        mentions,
      },
      { quoted: quoted || sourceMessage },
    )
    return { ok: true, type: "image" }
  }

  if (media.type === "video") {
    await wss.sendMessage(
      chatJid,
      {
        video: buffer,
        mimetype: mimetype || "video/mp4",
        caption: buildCaption(sourceMessage, media.payload, fallbackSender),
        mentions,
      },
      { quoted: quoted || sourceMessage },
    )
    return { ok: true, type: "video" }
  }

  await wss.sendMessage(
    chatJid,
    {
      audio: buffer,
      mimetype: mimetype || "audio/ogg; codecs=opus",
      ptt: /ogg|opus/i.test(mimetype),
      mentions,
    },
    { quoted: quoted || sourceMessage },
  )

  return { ok: true, type: "audio" }
}
