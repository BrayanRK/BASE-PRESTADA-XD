import type * as types from "../../../types/types.js"
import { evogbBrat, evogbMediaUrl, evogbUserError } from "../../../libs/downloads.js"
import { createSticker, getDefaultStickerMeta, getSavedStickerMeta } from "../../../libs/stickers.js"

const usage = (): string => "「⚠」 Escribe un texto."

const fetchBratBuffer = async (url: string): Promise<Buffer> => {
  if (/^data:/i.test(url)) {
    const match = url.match(/^data:([^;]+);base64,(.+)$/)
    if (!match) throw new Error("URL de datos inválida")
    return Buffer.from(match[2], "base64")
  }

  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 ZetaTS/Brat" },
    signal: AbortSignal.timeout(90_000),
  })

  if (!response.ok) throw new Error(`HTTP ${response.status} descargando gif`)
  return Buffer.from(await response.arrayBuffer())
}

export default {
  name: "bratvid",
  alias: ["bratvideo", "bratgif"],
  description: "Genera sticker animado brat.",
  category: "downloaders",
  using: "<texto>",
  flags: ["all.chats"],
  requires: [],
  hidden: false,
  execute: async (wss, { mctx, args, bot, user }) => {
    const text = args.join(" ").trim()
    if (!text) { await mctx.react("⚠️"); await mctx.reply(usage()); return }

    try {
      await mctx.react("⌛")
      const data = await evogbBrat(text, true)
      const mediaUrl = evogbMediaUrl(data)
      const buffer = await fetchBratBuffer(mediaUrl)
      const stickerMeta = await getSavedStickerMeta(mctx.sender.jid, getDefaultStickerMeta(mctx, bot, user))
      const sticker = await createSticker(buffer, stickerMeta)
      await wss.sendMessage(mctx.chat.jid, { sticker }, { quoted: mctx.message.original })
      await mctx.react("✅")
    } catch (error) {
      console.error("[bratvid] Error:", error instanceof Error ? error.message : error)
      await mctx.react("❌")
      await mctx.reply(`「✖」 ${evogbUserError(error, "No se pudo generar el sticker animado brat.")}`)
    }
  },
} as types.Command
