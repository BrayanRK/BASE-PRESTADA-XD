import type * as types from "../../../types/types.js"
import { dvyerMALNews, dvyerTitle, dvyerLink, dvyerUserError } from "../../../libs/downloads.js"

const resultCaption = (text: string) => `「◈」 *Noticias — MyAnimeList*\n\n${text}`

export default {
  name: "malnews",
  alias: ["animenews"],
  description: "Obtiene noticias recientes de anime desde MyAnimeList.",
  category: "anime",
  using: "",
  flags: ["all.chats"],
  requires: [],
  hidden: false,
  execute: async (_wss, { mctx }) => {
    try {
      await mctx.react("⌛")
      const items = await dvyerMALNews()
      if (!items.length) {
        await mctx.react("❌")
        await mctx.reply("「✖」 No hay noticias disponibles.")
        return
      }

      const text = items.slice(0, 8).map((item, i) => {
        const title = dvyerTitle(item)
        const link = dvyerLink(item)
        return [`${i + 1}. ${title}`, link ? `Link: ${link}` : ""].filter(Boolean).join("\n")
      }).join("\n\n")

      await mctx.reply(resultCaption(text))
      await mctx.react("✅")
    } catch (error) {
      console.error("[malnews] Error:", error instanceof Error ? error.message : error)
      await mctx.react("❌")
      await mctx.reply(`「✖」 ${dvyerUserError(error, "No se pudo obtener la información.")}`)
    }
  },
} as types.Command
