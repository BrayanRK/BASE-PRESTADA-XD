import type * as types from "../../../types/types.js"
import { getRuntimeGacha, gachaTitle, sendText, usageBlock } from "../../../libs/gacha.js"

export default {
  name: "removesale",
  alias: ["removerventa"],
  description: "Quita un personaje de la venta",
  category: "games",
  using: "<nombre>",
  flags: ["only.groups"],
  requires: [],
  hidden: false,
  execute: async (wss, { mctx, args, bot, group, usedPrefix }) => {
    const filtered = args.filter((arg, index) => !(index === 0 && /^\d+$/.test(arg)))
    const name = filtered.join(" ").trim()

    if (!name) {
      await mctx.react("⚠️")
      await mctx.reply(usageBlock("Quitar venta", [`*${usedPrefix}removesale* _Goku_`, `*${usedPrefix}removerventa* _Rem_`]))
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

      const ok = db.removeSale(mctx.sender.jid, char.id)
      if (!ok) {
        await mctx.reply(`「❀」 *${char.name}* no está en venta o no es tuyo.`)
        return
      }

      await sendText(wss, mctx, `${gachaTitle("Venta eliminada", char.name)}\n> ✧ Ya no aparece en la tienda.`)
      await mctx.react("✅")
    } catch (error) {
      console.error("[Gacha removesale]", error)
      await mctx.react("❌")
      await mctx.reply(`「❀」 No pude quitar la venta.`)
    }
  },
} as types.Command
