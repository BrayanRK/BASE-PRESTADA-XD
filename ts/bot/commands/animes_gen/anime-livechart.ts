import type * as types from "../../../types/types.js"
import { dvyerLivechartSchedule, dvyerTitle, dvyerUserError } from "../../../libs/downloads.js"

const resultCaption = (text: string) => `「◈」 *Calendario de emisión — Livechart*\n\n${text}`
const clean = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim()

export default {
  name: "livechart",
  alias: ["animecalendar", "horarioanime"],
  description: "Obtiene el calendario de episodios de anime próximos a emitirse.",
  category: "anime",
  using: "",
  flags: ["all.chats"],
  requires: [],
  hidden: false,
  execute: async (_wss, { mctx }) => {
    try {
      await mctx.react("⌛")
      const items = await dvyerLivechartSchedule()
      if (!items.length) {
        await mctx.react("❌")
        await mctx.reply("「✖」 No hay datos disponibles.")
        return
      }

      const text = items.slice(0, 10).map((item, i) => {
        const title = dvyerTitle(item)
        const time = clean((item as any)?.time || (item as any)?.airTime || (item as any)?.timestamp)
        return [`${i + 1}. ${title}`, time ? `Hora: ${time}` : ""].filter(Boolean).join("\n")
      }).join("\n\n")

      await mctx.reply(resultCaption(text))
      await mctx.react("✅")
    } catch (error) {
      console.error("[livechart] Error:", error instanceof Error ? error.message : error)
      await mctx.react("❌")
      await mctx.reply(`「✖」 ${dvyerUserError(error, "No se pudo obtener la información.")}`)
    }
  },
} as types.Command
