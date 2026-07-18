import type * as types from "../../../types/types.js"
import { dvyerAnimeDAOSearch, dvyerTitle, dvyerLink, dvyerUserError } from "../../../libs/downloads.js"

const usage = (): string => "「⚠」 Escribe el nombre del anime."
const resultCaption = (text: string) => `「◈」 *Búsqueda — AnimeDAO*\n\n${text}`

export default {
  name: "animedao",
  alias: ["animedaosearch"],
  description: "Busca animes por título en AnimeDAO.",
  category: "anime",
  using: "<nombre>",
  flags: ["all.chats"],
  requires: [],
  hidden: false,
  execute: async (_wss, { mctx, args }) => {
    const query = args.join(" ").trim()
    if (!query) {
      await mctx.react("⚠️")
      await mctx.reply(usage())
      return
    }

    try {
      await mctx.react("🔎")
      const items = await dvyerAnimeDAOSearch(query)
      if (!items.length) {
        await mctx.react("❌")
        await mctx.reply("「✖」 No encontré resultados.")
        return
      }

      const text = items.slice(0, 10).map((item, i) => {
        const title = dvyerTitle(item)
        const link = dvyerLink(item)
        return [`${i + 1}. ${title}`, link ? `Link: ${link}` : ""].filter(Boolean).join("\n")
      }).join("\n\n")

      await mctx.reply(resultCaption(text))
      await mctx.react("✅")
    } catch (error) {
      console.error("[animedao] Error:", error instanceof Error ? error.message : error)
      await mctx.react("❌")
      await mctx.reply(`「✖」 ${dvyerUserError(error, "No se pudo realizar la búsqueda.")}`)
    }
  },
} as types.Command
