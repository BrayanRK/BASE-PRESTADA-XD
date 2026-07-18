import type * as types from "../../../types/types.js"
import { dvyerCheckHost, dvyerUserError } from "../../../libs/downloads.js"

const usage = (): string => "「⚠」 Escribe un host o dominio. Ej: .checkhost google.com"
const resultCaption = (text: string) => `「◈」 *Información de host*\n\n${text}`

export default {
  name: "checkhost",
  alias: ["host", "dns"],
  description: "Consulta información DNS e IP de un host o dominio.",
  category: "utilities",
  using: "<host>",
  flags: ["all.chats"],
  requires: [],
  hidden: false,
  execute: async (_wss, { mctx, args }) => {
    const host = args.join(" ").trim()
    if (!host) {
      await mctx.react("⚠️")
      await mctx.reply(usage())
      return
    }

    try {
      await mctx.react("🌐")
      const data = await dvyerCheckHost(host)

      const lines = Object.entries(data as Record<string, unknown>)
        .filter(([key]) => !["ok", "success", "status"].includes(key))
        .map(([key, value]) => `✦ ${key} › ${Array.isArray(value) ? value.join(", ") : String(value)}`)

      await mctx.reply(resultCaption(lines.join("\n") || "Sin datos."))
      await mctx.react("✅")
    } catch (error) {
      console.error("[checkhost] Error:", error instanceof Error ? error.message : error)
      await mctx.react("❌")
      await mctx.reply(`「✖」 ${dvyerUserError(error, "No se pudo consultar el host.")}`)
    }
  },
} as types.Command
