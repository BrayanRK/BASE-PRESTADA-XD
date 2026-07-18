import type * as types from "../../../types/types.js"
import { GachaDatabaseIndividual } from "../../../libs/gacha.js"
import fs from "fs"
import path from "path"
import { getEffectiveBotJid } from "../../../libs/bot-scope.js"

const progressFile = path.join(process.cwd(), "cache", "fetch_progress.json")

function loadProgress(): number {
  try {
    if (fs.existsSync(progressFile)) {
      const data = JSON.parse(fs.readFileSync(progressFile, "utf8"))
      return data.lastPage || 1
    }
  } catch (error) {
    console.error("Error loading progress:", error)
  }
  return 1
}

export default {
  name: "getchar",
  alias: ["gc"],
  description: "Continúa obteniendo personajes desde donde se quedó",
  using: "getchar [cantidad]",
  category: "moderation",
  flags: ["only.groups"],
  hidden: false,
  requires: ["bot.owner"],
  execute: async (wss, { mctx, args, bot }) => {
    const gachaDb = new GachaDatabaseIndividual(getEffectiveBotJid(bot) || "default@lid")

    try {
      const batchSize = Number.parseInt(args[0]) || 50
      const lastPage = loadProgress()

      if (batchSize > 200) {
        return await mctx.reply("《✧》El límite máximo es de 200 personajes por lote.")
      }

      await mctx.reply(`「❀」 Continuando obtención desde la página ${lastPage}...`)

      const result = await gachaDb.fetchCharactersContinue(lastPage, batchSize)

      await mctx.reply(
        `✅ *Obtención completada*\n\n✅ Personajes añadidos: *${result.added}*\n⏭️ Personajes omitidos: *${result.skipped}*\n📊 Total procesados: *${result.added + result.skipped}*\n📄 Próxima página: *${result.nextPage}*`,
      )
    } catch (error) {
      await mctx.reply(`「❀」 Error al obtener personajes: ${error}`)
    }
  },
} as types.Command
