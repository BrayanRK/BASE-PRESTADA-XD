import type * as types from "../../../types/types.js"
import { GachaDatabaseIndividual } from "../../../libs/gacha.js"
import { getEffectiveBotJid } from "../../../libs/bot-scope.js"

export default {
  name: "fetchchar",
  alias: ["fc"],
  description: "Obtiene personajes de AniList",
  using: "fetchchar [cantidad] [continue]",
  category: "moderation",
  flags: ["only.groups"],
  hidden: false,
  requires: ["owner.user"],
  execute: async (wss, { mctx, args, bot, group }) => {
    const amount = Number.parseInt(args[0]) || 4000
    const shouldContinue = args.includes("continue") || args.includes("c")

    if (amount > 4000) {
      return await mctx.reply(`「❀」 《✧》No puedes obtener más de 100 personajes a la vez.`)
    }

    const mainBotJid = bot.bot_type === "free" ? getEffectiveBotJid(bot) : undefined
    const gachaDb = new GachaDatabaseIndividual(getEffectiveBotJid(bot) || "default@lid", bot.bot_type, mainBotJid)

    try {
      await mctx.reply(`《✧》Obteniendo ${amount} personajes${shouldContinue ? " (continuando)" : ""}...`)

      let result
      if (shouldContinue) {
        const lastPage = 1
        result = await gachaDb.fetchCharactersContinue(lastPage, amount)
      } else {
        result = await gachaDb.fetchCharactersBatch(amount)
      }

      let message = `✦ *PERSONAJES OBTENIDOS* ✦\n\n`
      message += `✅ Agregados: *${result.added}*\n`
      message += `⏭️ Omitidos: *${result.skipped}*\n`
      message += `📄 Siguiente página: *${result.nextPage}*\n\n`
      message += `《✧》Total en base de datos: *${gachaDb.getTotalCharactersCount()}*\n\n`
      message += `*Usa #fetchchar ${amount} continue para continuar*`

      await mctx.reply(message)
    } catch (error) {
      await mctx.reply(`「❀」 Error al obtener personajes: ${error}`)
    }
  },
} as types.Command
