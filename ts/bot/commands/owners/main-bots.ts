import * as types from "../../../types/types.js"
import * as bot from "../../bot.js"

export default <types.Command>{
  name: "bots",
  alias: ["sockets"],
  description: "Ver sockets activos actualmente.",
  flags: ["all.chats"],
  requires: [],
  hidden: true,
  category: "bot",
  execute: async (_, { mctx }) => {
    const counts = <Record<types.TypeBots, number>>{
      main: 0,
      premium: 0,
      free: 0,
    }

    bot.Bot.bots.forEach((v) => {
      counts[v.bot_type as types.TypeBots]++
    })

    let message = `「♛」 Sockets\n`
    message += `│ Total › ${bot.Bot.bots.size.toLocaleString("en-US")}\n`
    message += `│ Oficiales › ${counts.main.toLocaleString("en-US")}\n`
    message += `│ Premium › ${counts.premium.toLocaleString("en-US")}\n`
    message += `╰ Gratis › ${counts.free.toLocaleString("en-US")}`
    await mctx.reply(message)
  },
}
