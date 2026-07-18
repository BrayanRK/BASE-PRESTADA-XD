import type * as types from "../../../types/types.js"
import { dvyerAnimeKompiLatest, dvyerTitle, dvyerLink, dvyerUserError } from "../../../libs/downloads.js"

const resultCaption = (text: string) => `「◈」 *Últimos episodios — AnimeKompi*\n\n${text}`

export default {
  name: "animekompi",
  alias: ["animekompilatest"],
  description: "Obtiene los episodios más recientes del feed de AnimeKompi.",
  category: "anime",
  using: "",
  flags: ["all.chats"],
  requires: [],
  hidden: false,
  execute: async (_wss, { mctx }) => {
    try {
      await mctx.react("⌛")
      const items = await dvyerAnimeKompiLatest()
      if (!items.length) {
        await mctx.react("❌")
        await mctx.reply("「✖」 No hay episodios disponibles.")
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
      console.error("[animekompi] Error:", error instanceof Error ? error.message : error)
      await mctx.react("❌")
      await mctx.reply(`「✖」 ${dvyerUserError(error, "No se pudo obtener la información.")}`)
    }
  },
} as types.Command
