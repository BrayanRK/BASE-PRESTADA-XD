import type * as types from "../../../types/types.js"
import { PremiumManager } from "../../../libs/socket-manager.js"
import { canManagePremiumTokens, denyFreeSocketMessage, socketOwnerOnlyMessage } from "../../../libs/socket-manager.js"

const command: types.Command = {
  name: "sumprem",
  alias: ["sumtoken"],
  description: "Confirma/reactiva premium permanente de un bot",
  category: "premb",
  flags: ["all.chats"],
  requires: ["bot.owner"],
  hidden: false,
  execute: async (wss, { mctx, args, bot }) => {
    if (String(bot.bot_type) === "free") {
      await mctx.reply(denyFreeSocketMessage())
      return
    }

    if (!canManagePremiumTokens(mctx.sender.jid, bot)) {
      await mctx.reply(socketOwnerOnlyMessage())
      return
    }

    if (!args.length) {
      await mctx.reply("*｢✧｣* Ingresa el número del bot premium\n\nEjemplo: /sumprem 000000000000")
      return
    }

    const botNumber = args[0].replace(/[^0-9]/g, "")

    if (!botNumber) {
      await mctx.reply("*｢✧｣* Ingresa un número válido")
      return
    }

    try {
      await mctx.react("⏳")

      const result = await PremiumManager.extendPremium(botNumber)

      if (result.success) {
        await mctx.react("✅")
        await mctx.reply(`*｢❀｣* Premium permanente confirmado\n\n> *✦* Bot › @${botNumber}\n> *✦* ${result.message}`)
      } else {
        await mctx.react("❌")
        await mctx.reply(`*｢✧｣* ${result.message}`)
      }
    } catch (error) {
      await mctx.react("❌")
      await mctx.reply(`*｢✧｣* Error: ${error.message}`)
    }
  },
}

export default command
