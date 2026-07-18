import * as baileys from "baileys"
import type * as types from "../types/types.js"

type MediaKind = "image" | "video" | "audio" | "sticker" | "document"

const unwrapMessageContent = (content: any): any => {
  let current = content

  for (let i = 0; i < 12; i++) {
    const next =
      current?.ephemeralMessage?.message ||
      current?.viewOnceMessage?.message ||
      current?.viewOnceMessageV2?.message ||
      current?.viewOnceMessageV2Extension?.message ||
      current?.documentWithCaptionMessage?.message ||
      current?.editedMessage?.message ||
      current?.deviceSentMessage?.message

    if (!next || next === current) break
    current = next
  }

  return current || content || {}
}

const toBuffer = (value: unknown): Buffer | null => {
  if (!value) return null

  if (Buffer.isBuffer(value)) {
    return value.length ? value : null
  }

  if (value instanceof ArrayBuffer) {
    const buffer = Buffer.from(value)
    return buffer.length ? buffer : null
  }

  if (ArrayBuffer.isView(value)) {
    const buffer = Buffer.from(value.buffer, value.byteOffset, value.byteLength)
    return buffer.length ? buffer : null
  }

  if (typeof value === "object" && value !== null) {
    const data = (value as any).data
    if (data) return toBuffer(data)
  }

  return null
}

const streamToBuffer = async (stream: AsyncIterable<Uint8Array> | NodeJS.ReadableStream): Promise<Buffer | null> => {
  const chunks: Buffer[] = []

  for await (const chunk of stream as any) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  const buffer = Buffer.concat(chunks)
  return buffer.length ? buffer : null
}

const getMediaNode = (content: any): { node: any; kind: MediaKind } | null => {
  const message = unwrapMessageContent(content)

  if (message?.imageMessage) return { node: message.imageMessage, kind: "image" }
  if (message?.videoMessage) return { node: message.videoMessage, kind: "video" }
  if (message?.audioMessage) return { node: message.audioMessage, kind: "audio" }
  if (message?.stickerMessage) return { node: message.stickerMessage, kind: "sticker" }
  if (message?.documentMessage) return { node: message.documentMessage, kind: "document" }

  return null
}

const downloadByContextMethod = async (source: types.MessageContext): Promise<Buffer | null> => {
  if (!source.download) return null

  const raw = await source.download().buffer().catch(() => null)
  return toBuffer(raw)
}

const downloadByMediaMessage = async (source: types.MessageContext): Promise<Buffer | null> => {
  const original = source.message.original
  if (!original?.message) return null

  const raw = await (baileys as any).downloadMediaMessage(original, "buffer", {}).catch(() => null)
  return toBuffer(raw)
}

const downloadByContent = async (source: types.MessageContext): Promise<Buffer | null> => {
  const media = getMediaNode(source.message.original?.message)
  if (!media) return null

  const stream = await (baileys as any).downloadContentFromMessage(media.node, media.kind).catch(() => null)
  if (!stream) return null

  return streamToBuffer(stream)
}

export const downloadMediaBuffer = async (
  source: types.MessageContext,
  label = "archivo",
): Promise<Buffer> => {
  const methods = [
    () => downloadByContextMethod(source),
    () => downloadByMediaMessage(source),
    () => downloadByContent(source),
  ]

  for (const method of methods) {
    const buffer = await method().catch(() => null)
    if (buffer?.length) return buffer
  }

  throw new Error(`No pude descargar el ${label}. Reenvía la media y responde al mensaje nuevo.`)
}

export const hasMime = (mime: string, regex: RegExp): boolean => {
  return regex.test(String(mime || "").toLowerCase())
}
