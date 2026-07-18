import type * as types from "../../../types/types.js"
import { dvyerAnimeFLVAnime, dvyerUserError } from "../../../libs/downloads.js"

const usage = (): string => "「⚠」 Escribe el slug del anime. Ej: .animeflvanime kimetsu-no-yaiba"
const resultCaption = (text: string) => `「◈」 *Detalle de anime*\n\n${text}`
const clean = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim()

export default {
  name: "animeflvanime",
  alias: ["animeflvdetalle"],
  description: "Obtiene el detalle de un anime: géneros, sinopsis y episodios.",
  category: "anime",
  using: "<slug>",
  flags: ["all.chats"],
  requires: [],
  hidden: false,
  execute: async (_wss, { mctx, args }) => {
    const slug = args.join(" ").trim().replace(/\s+/g, "-").toLowerCase()
    if (!slug) {
      await mctx.react("⚠️")
      await mctx.reply(usage())
      return
    }

    try {
      await mctx.react("⌛")
      const data = await dvyerAnimeFLVAnime(slug)

      const title = clean((data as any)?.title)
      const synopsis = clean((data as any)?.synopsis)
      const genres = Array.isArray((data as any)?.genres) ? (data as any).genres.join(", ") : ""
      const episodes = Array.isArray((data as any)?.episodes) ? (data as any).episodes : []

      const lines = [
        title && `✦ Título › ${title}`,
        genres && `✦ Géneros › ${genres}`,
        synopsis && `✦ Sinopsis › ${synopsis}`,
        episodes.length ? `✦ Episodios › ${episodes.length} disponibles` : "",
      ].filter(Boolean)

      await mctx.reply(resultCaption(`${lines.join("\n")}\n\nUsa *.animeflvepisode <slug-episodio>* para ver enlaces.`))
      await mctx.react("✅")
    } catch (error) {
      console.error("[animeflvanime] Error:", error instanceof Error ? error.message : error)
      await mctx.react("❌")
      await mctx.reply(`「✖」 ${dvyerUserError(error, "No se pudo obtener la información.")}`)
    }
  },
} as types.Command
