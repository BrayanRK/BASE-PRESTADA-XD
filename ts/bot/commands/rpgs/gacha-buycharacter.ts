import type * as types from "../../../types/types.js"
import { formatNumber, formatUser, getRuntimeGacha, gachaTitle, sendText, usageBlock } from "../../../libs/gacha.js"
import { getScopedGroupJid } from "../../../libs/bot-scope.js"

export default {
  name: "buycharacter",
  alias: ["buychar", "buyc"],
  description: "Compra un personaje en venta",
  category: "games",
  using: "<nombre>",
  flags: ["only.groups"],
  requires: [],
  hidden: false,
  execute: async (wss, { mctx, args, bot, group, usedPrefix }) => {
    const name = args.join(" ").trim()
    if (!name) {
      await mctx.react("⚠️")
      await mctx.reply(usageBlock("Comprar personaje", [`*${usedPrefix}buyc* _Goku_`, `*${usedPrefix}buycharacter* _Rem_`]))
      return
    }

    try {
      await mctx.react("💸")
      const db = getRuntimeGacha(bot, group)
    const scopedGroupJid = getScopedGroupJid(bot, mctx.chat.jid)
      const char = db.findCharacter(name)
      if (!char) {
        await mctx.reply(`「❀」 No encontré *${name}*.`)
        return
      }

      const result = await db.buyCharacter(scopedGroupJid, mctx.sender.jid, char.id)
      if (!result.ok) {
        const reason = result.reason === "money"
          ? `No tienes suficiente ${bot.currency}. Precio: *${formatNumber(result.price || 0)}*.`
          : result.reason === "self"
            ? "Ese personaje ya es tuyo."
            : "Ese personaje no está en venta."
        await mctx.reply(`「❀」 ${reason}`)
        return
      }

      const seller = await formatUser(wss, mctx, result.seller || "", "tag")
      await sendText(wss, mctx, `${gachaTitle("Compra realizada", char.name)}\n> ✧ Pagaste › *${formatNumber(result.price || 0)}* ${bot.currency}\n> ✦ Vendedor › ${seller.text}`, seller.mentions)
      await mctx.react("✅")
    } catch (error) {
      console.error("[Gacha buy]", error)
      await mctx.react("❌")
      await mctx.reply(`「❀」 No pude comprar el personaje.`)
    }
  },
} as types.Command
