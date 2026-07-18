import type * as types from "../../../types/types.js"
import { getRuntimeGacha, gachaTitle, sendText } from "../../../libs/gacha.js"

export default {
  name: "delclaimmsg",
  alias: [],
  description: "Restablece el mensaje de claim",
  category: "games",
  using: "",
  flags: ["only.groups"],
  requires: [],
  hidden: false,
  execute: async (wss, { mctx, bot, group }) => {
    try {
      await mctx.react("🧹")
      const db = getRuntimeGacha(bot, group)
      db.deleteClaimMessage(mctx.sender.jid)
      await sendText(wss, mctx, `${gachaTitle("Mensaje reiniciado", "Tu claim vuelve al texto default.")}`)
      await mctx.react("✅")
    } catch (error) {
      console.error("[Gacha delclaim]", error)
      await mctx.react("❌")
      await mctx.reply(`「❀」 No pude reiniciar el mensaje.`)
    }
  },
} as types.Command
