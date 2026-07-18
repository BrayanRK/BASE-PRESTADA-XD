import type * as types from "../../../types/types.js"
import { dvyerHuggingFace, dvyerUserError } from "../../../libs/downloads.js"

const usage = (): string => "「⚠」 Escribe el nombre del modelo. Ej: .huggingface gpt2"
const resultCaption = (text: string) => `「◈」 *Modelo HuggingFace*\n\n${text}`

export default {
  name: "huggingface",
  alias: ["hf"],
  description: "Obtiene metadata de modelos de IA desde HuggingFace.",
  category: "utilities",
  using: "<modelo>",
  flags: ["all.chats"],
  requires: [],
  hidden: false,
  execute: async (_wss, { mctx, args }) => {
    const model = args.join(" ").trim()
    if (!model) {
      await mctx.react("⚠️")
      await mctx.reply(usage())
      return
    }

    try {
      await mctx.react("🤖")
      const data = await dvyerHuggingFace(model)

      const lines = Object.entries(data as Record<string, unknown>)
        .filter(([key]) => !["ok", "success", "status"].includes(key))
        .slice(0, 12)
        .map(([key, value]) => `✦ ${key} › ${Array.isArray(value) ? value.join(", ") : String(value)}`)

      await mctx.reply(resultCaption(lines.join("\n") || "Sin datos."))
      await mctx.react("✅")
    } catch (error) {
      console.error("[huggingface] Error:", error instanceof Error ? error.message : error)
      await mctx.react("❌")
      await mctx.reply(`「✖」 ${dvyerUserError(error, "No se pudo obtener la información.")}`)
    }
  },
} as types.Command
