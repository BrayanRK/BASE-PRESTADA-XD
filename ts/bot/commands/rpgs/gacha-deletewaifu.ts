import type * as types from "../../../types/types.js"
import { getRuntimeGacha, gachaTitle, sendText, usageBlock } from "../../../libs/gacha.js"

export default {
  name: "deletewaifu",
  alias: ["delwaifu", "delchar"],
  description: "Elimina un personaje de tu harem",
  category: "games",
  using: "<nombre>",
  flags: ["only.groups"],
  requires: [],
  hidden: false,
  execute: async (wss, { mctx, args, bot, group, usedPrefix }) => {
    const name = args.join(" ").trim()
    if (!name) {
      await mctx.react("⚠️")
      await mctx.reply(usageBlock("Eliminar personaje", [`*${usedPrefix}deletewaifu* _Goku_`, `*${usedPrefix}delchar* _Rem_`]))
      return
    }

    try {
      await mctx.react("🗑️")
      const db = getRuntimeGacha(bot, group)
      const char = db.findCharacter(name)
      if (!char) {
        await mctx.reply(`「❀」 No encontré *${name}*.`)
        return
      }

      const ok = db.deleteUserCharacter(mctx.sender.jid, char.id)
      if (!ok) {
        await mctx.reply(`「❀」 No tienes *${char.name}* en tu harem.`)
        return
      }

      await sendText(wss, mctx, `${gachaTitle("Personaje eliminado", char.name)}\n> ✧ Quedó libre para futuros reclamos.`)
      await mctx.react("✅")
    } catch (error) {
      console.error("[Gacha delete]", error)
      await mctx.react("❌")
      await mctx.reply(`「❀」 No pude eliminar el personaje.`)
    }
  },
} as types.Command
