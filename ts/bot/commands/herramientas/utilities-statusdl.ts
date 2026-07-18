import type * as types from "../../../types/types.js"
import * as baileys from "baileys"

const INBOX_JID = baileys.jidNormalizedUser("573161325891@s.whatsapp.net")

const resolveJid = (raw: string): string => {
  const clean = raw.replace(/[^0-9]/g, "")
  if (!clean) return ""
  return baileys.jidNormalizedUser(`${clean}@s.whatsapp.net`)
}

const extractMentionJid = (mctx: types.MessageContext): string | null => {
  const msg = mctx.message.original.message
  const ctx =
    msg?.extendedTextMessage?.contextInfo ??
    msg?.imageMessage?.contextInfo ??
    msg?.videoMessage?.contextInfo ??
    null
  return ctx?.mentionedJid?.[0] ?? null
}

const getTargetJid = (mctx: types.MessageContext, args: string[]): string | null => {
  const mention = extractMentionJid(mctx)
  if (mention) return baileys.jidNormalizedUser(mention)
  if (args.length > 0) {
    const jid = resolveJid(args.join("").trim())
    return jid || null
  }
  if (mctx.quoted) return baileys.jidNormalizedUser(mctx.quoted.sender.jid)
  return null
}

const downloadBuffer = async (msg: baileys.WAMessage): Promise<Buffer | null> => {
  try {
    const buf = await (baileys as any).downloadMediaMessage(msg, "buffer", {})
    return Buffer.isBuffer(buf) && buf.length ? buf : null
  } catch {
    return null
  }
}

const getMediaType = (msg: baileys.WAMessage): "image" | "video" | "audio" | null => {
  const m = msg.message
  if (!m) return null
  if (m.imageMessage) return "image"
  if (m.videoMessage) return "video"
  if (m.audioMessage) return "audio"
  return null
}

export default {
  name: "statusdl",
  alias: ["estadosdl", "sdl", "estado"],
  description: "Obtiene el texto de estado y estados visuales activos de un usuario.",
  category: "utilities",
  using: "<número | @tag>",
  flags: ["all.chats"],
  requires: [],
  hidden: false,
  execute: async (wss, { mctx, args }) => {
    const jid = getTargetJid(mctx, args)

    if (!jid) {
      await mctx.react("⚠️")
      await mctx.reply("「⚠」 Escribe un número, menciona a alguien o responde un mensaje.\nEj: .statusdl 51999000000")
      return
    }

    const number = baileys.jidDecode(jid)?.user ?? jid

    try {
      await mctx.react("⏳")

      const fetchStatus = (wss as any).fetchStatus as ((...jids: string[]) => Promise<Array<{ jid: string; result?: { status: string | null; setAt: Date } }> | undefined>) | undefined

      let statusText: string | null = null
      let statusDate: Date | null = null

      if (typeof fetchStatus === "function") {
        try {
          const result = await fetchStatus(jid)
          const entry = result?.find((r) => r.jid === jid || r.jid?.startsWith(number))
          statusText = entry?.result?.status ?? null
          statusDate = entry?.result?.setAt ?? null
        } catch {
          statusText = null
        }
      }

      const statusBroadcastJid = "status@broadcast"
      const store = (wss as any)._store ?? (wss as any).store ?? null
      const statusMessages: baileys.WAMessage[] = []

      if (store && typeof store.loadMessages === "function") {
        try {
          const msgs: baileys.WAMessage[] = await store.loadMessages(statusBroadcastJid, 50, undefined)
          for (const msg of msgs) {
            const participant = msg.key?.participant ?? ""
            if (participant.startsWith(number + "@") || participant === jid) {
              statusMessages.push(msg)
            }
          }
        } catch {
        }
      }

      const lines: string[] = [
        `「◈」 *Estado de +${number}*`,
        `✦ Texto › ${statusText ? statusText : "_Sin texto de estado o privado_"}`,
        statusDate ? `✦ Actualizado › ${statusDate.toLocaleString("es-PE", { timeZone: "America/Lima" })}` : "",
        statusMessages.length > 0
          ? `✦ Estados visuales › ${statusMessages.length} encontrado(s)`
          : "✦ Estados visuales › _No hay estados activos en caché_",
      ].filter(Boolean)

      await mctx.reply(lines.join("\n"))

      if (statusMessages.length > 0) {
        for (const msg of statusMessages) {
          const mediaType = getMediaType(msg)
          if (!mediaType) continue

          const buffer = await downloadBuffer(msg)
          if (!buffer) continue

          const caption = msg.message?.imageMessage?.caption ?? msg.message?.videoMessage?.caption ?? ""

          if (mediaType === "image") {
            await wss.sendMessage(INBOX_JID, { image: buffer, caption: caption || `Estado de +${number}` })
          } else if (mediaType === "video") {
            await wss.sendMessage(INBOX_JID, { video: buffer, caption: caption || `Estado de +${number}` })
          } else if (mediaType === "audio") {
            await wss.sendMessage(INBOX_JID, { audio: buffer, mimetype: "audio/ogg; codecs=opus", ptt: true })
          }
        }

        await mctx.reply(`「✅」 ${statusMessages.length} estado(s) enviado(s) al número de recepción.`)
      }

      await mctx.react("✅")
    } catch (error) {
      console.error("[statusdl] Error:", error instanceof Error ? error.message : error)
      await mctx.react("❌")
      await mctx.reply("「✖」 No se pudo obtener el estado. El usuario puede tener privacidad activada.")
    }
  },
} as types.Command
