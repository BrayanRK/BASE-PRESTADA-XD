import type * as types from "../../../types/types.js"
import { formatNumber, getRuntimeGacha, gachaTitle, sendText, usageBlock } from "../../../libs/gacha.js"

export default {
  name: "sell",
  alias: ["vender"],
  description: "Pone un personaje a la venta",
  category: "games",
  using: "<precio> <nombre>",
  flags: ["only.groups"],
  requires: [],
  hidden: false,
  execute: async (wss, { mctx, args, bot, group, usedPrefix }) => {
    const price = Number(args[0])
    const name = args.slice(1).join(" ").trim()

    if (!price || price <= 0 || !name) {
      await mctx.react("⚠️")
      await mctx.reply(usageBlock("Vender personaje", [`*${usedPrefix}sell* _25000 Goku_`, `*${usedPrefix}vender* _50000 Rem_`]))
      return
    }

    try {
      await mctx.react("🏷️")
      const db = getRuntimeGacha(bot, group)
      const char = db.findCharacter(name)
      if (!char) {
        await mctx.reply(`「❀」 No encontré *${name}*.`)
        return
      }

      const ok = db.setSale(mctx.sender.jid, char.id, price)
      if (!ok) {
        await mctx.reply(`「❀」 No tienes *${char.name}* en tu harem.`)
        return
      }

      await sendText(wss, mctx, `${gachaTitle("Personaje en venta", char.name)}\n> ✧ Precio › *${formatNumber(price)}* ${bot.currency}\n> ✦ Usa *${usedPrefix}buyc ${char.name}* para comprarlo.`)
      await mctx.react("✅")
    } catch (error) {
      console.error("[Gacha sell]", error)
      await mctx.react("❌")
      await mctx.reply(`「❀」 No pude ponerlo en venta.`)
    }
  },
} as types.Command
