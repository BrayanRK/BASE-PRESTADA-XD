import type * as types from "../../../types/types.js"
import { dvyerMac, dvyerMediaUrl, dvyerUserError, dvyerTitle } from "../../../libs/downloads.js"

const usage = (): string => "「⚠」 Escribe el nombre o URL del programa."
const doneCaption = (caption?: string) => ["「◈」 *Descarga realizada*", caption?.trim()].filter(Boolean).join("\n\n")

export default {
  name: "macdl",
  alias: [],
  description: "Descarga software para macOS dado su nombre o URL.",
  category: "downloaders",
  using: "<nombre | url>",
  flags: ["all.chats"],
  requires: [],
  hidden: false,
  execute: async (wss, { mctx, args }) => {
    const query = args.join(" ").trim()
    if (!query) {
      await mctx.react("⚠️")
      await mctx.reply(usage())
      return
    }

    try {
      await mctx.react("⌛")
      const data = await dvyerMac(query)
      const fileUrl = dvyerMediaUrl(data)
      const title = dvyerTitle(data, query)
      const size = (data as any).size || (data as any).sizeMb || (data as any).sizeBytes

      await wss.sendMessage(
        mctx.chat.jid,
        { document: { url: fileUrl }, fileName: String((data as any).fileName || (data as any).filename || `${title}.exe`), mimetype: String((data as any).mimetype || "application/octet-stream"), caption: doneCaption(`✦ Nombre › ${title}${size ? `\n✦ Peso › ${size}` : ""}`) },
        { quoted: mctx.message.original },
      )
      await mctx.react("✅")
    } catch (error) {
      console.error("[macdl] Error:", error instanceof Error ? error.message : error)
      await mctx.react("❌")
      await mctx.reply(`「✖」 ${dvyerUserError(error, "No se pudo realizar la descarga.")}`)
    }
  },
} as types.Command
