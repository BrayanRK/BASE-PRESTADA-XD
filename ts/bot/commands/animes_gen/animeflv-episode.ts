import type * as types from "../../../types/types.js"
import { dvyerAnimeFLVEpisode, dvyerUserError } from "../../../libs/downloads.js"

const usage = (): string => "「⚠」 Escribe el slug del episodio."
const resultCaption = (text: string) => `「◈」 *Servidores del episodio*\n\n${text}`

export default {
  name: "animeflvepisode",
  alias: ["animeflvep"],
  description: "Obtiene los servidores y enlaces de descarga de un episodio.",
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
      const data = await dvyerAnimeFLVEpisode(slug)

      const lines = Object.entries(data as Record<string, unknown>)
        .filter(([key]) => !["ok", "success", "status"].includes(key))
        .slice(0, 12)
        .map(([key, value]) => `✦ ${key} › ${Array.isArray(value) ? value.join(", ") : String(value)}`)

      await mctx.reply(resultCaption(lines.join("\n") || "Sin datos."))
      await mctx.react("✅")
    } catch (error) {
      console.error("[animeflvepisode] Error:", error instanceof Error ? error.message : error)
      await mctx.react("❌")
      await mctx.reply(`「✖」 ${dvyerUserError(error, "No se pudo obtener la información.")}`)
    }
  },
} as types.Command
