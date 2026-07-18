import type * as types from "../../../types/types.js"
import { downloadMediaBuffer, hasMime } from "../../../libs/media.js"
import { webp2mp4 } from "../../../libs/webp2mp4.js"

const usage = (prefix = "."): string => {
  return `*｢✧｣* Convierte sticker a video/GIF MP4.

*Uso:*
> Responde a un sticker con *${prefix}tomp4*
> También sirve: *${prefix}webp2mp4* o *${prefix}tovideo*`
}

export default {
  name: "tomp4",
  alias: ["webp2mp4", "tovideo"],
  description: "Convierte sticker webp a video/GIF MP4",
  category: "utilities",
  using: "(responde a sticker)",
  requires: [],
  flags: ["all.chats"],
  hidden: false,
  execute: async (wss, { mctx, usedPrefix }) => {
    const source = mctx.quoted ?? mctx
    const mime = source.message.mimetype || ""

    if (!mctx.quoted || !hasMime(mime, /webp|sticker/)) {
      await mctx.react("⚠️")
      await mctx.reply(usage(usedPrefix))
      return
    }

    try {
      await mctx.react("⏳")

      const media = await downloadMediaBuffer(source, "sticker")
      const video = await webp2mp4(media)

      await wss.sendMessage(
        mctx.chat.jid,
        {
          video,
          mimetype: "video/mp4",
          fileName: "sticker.mp4",
          gifPlayback: true,
        },
        { quoted: mctx.message.original },
      )

      await mctx.react("✅")
    } catch (error) {
      const message = error instanceof Error ? error.message : "No pude convertir el sticker a MP4."
      console.error("[tomp4] Error:", error)
      await mctx.react("❌")
      await mctx.reply(`「🛠」 Convertidor MP4\n│ Estado › ${message}\n╰ Uso › revisa el formato abajo.\n\n${usage(usedPrefix)}`)
    }
  },
} as types.Command
