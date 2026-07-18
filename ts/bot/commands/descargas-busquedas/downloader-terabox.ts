import type * as types from "../../../types/types.js"
import { dvyerTerabox, dvyerMediaUrl, dvyerUserError } from "../../../libs/downloads.js"

const usage = (): string => "「⚠」 Envía un link de TeraBox."
const isLink = (text: string): boolean => /https?:\/\//i.test(text)
const doneCaption = (caption?: string) => ["「◈」 *Descarga realizada*", caption?.trim()].filter(Boolean).join("\n\n")

export default {
  name: "terabox",
  alias: [],
  description: "Descarga archivos directos desde TeraBox.",
  category: "downloaders",
  using: "<link>",
  flags: ["all.chats"],
  requires: [],
  hidden: false,
  execute: async (wss, { mctx, args }) => {
    const url = args.join(" ").trim()
    if (!url || !isLink(url)) {
      await mctx.react("⚠️")
      await mctx.reply(usage())
      return
    }

    try {
      await mctx.react("⌛")
      const data = await dvyerTerabox(url)
      const fileUrl = dvyerMediaUrl(data)
      const name = String((data as any).fileName || (data as any).filename || (data as any).title || "archivo")
      const size = (data as any).size || (data as any).sizeMb || (data as any).sizeBytes

      await wss.sendMessage(
        mctx.chat.jid,
        { document: { url: fileUrl }, fileName: name, mimetype: String((data as any).mimetype || "application/octet-stream"), caption: doneCaption(`✦ Nombre › ${name}${size ? `\n✦ Peso › ${size}` : ""}`) },
        { quoted: mctx.message.original },
      )
      await mctx.react("✅")
    } catch (error) {
      console.error("[terabox] Error:", error instanceof Error ? error.message : error)
      await mctx.react("❌")
      await mctx.reply(`「✖」 ${dvyerUserError(error, "No se pudo realizar la descarga.")}`)
    }
  },
} as types.Command
