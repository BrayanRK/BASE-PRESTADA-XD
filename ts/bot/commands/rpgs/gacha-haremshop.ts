import type * as types from "../../../types/types.js"
import {
  formatNumber,
  getDisplayName,
  getRuntimeGacha,
  sendText,
  gachaHeader,
  gachaHint,
  gachaPageFooter,
  parsePageArgs,
} from "../../../libs/gacha.js"

export default {
  name: "haremshop",
  alias: ["tiendawaifus", "wshop"],
  description: "Muestra personajes en venta.",
  category: "games",
  using: "<página>",
  flags: ["only.groups"],
  requires: [],
  hidden: false,
  execute: async (wss, { mctx, args, bot, group, usedPrefix }) => {
    try {
      await mctx.react("🛒")

      const parsed = parsePageArgs(args)
      const db = getRuntimeGacha(bot, group)
      const sales = db.getSales(parsed.page, 10)

      if (!sales.total) {
        await mctx.reply(`${gachaHeader("Tienda vacía")}\n\n▢ Ventas » *0*\n\n> Usa *${usedPrefix}sell precio nombre* para vender.`)
        return
      }

      const safePage = Math.min(parsed.page, sales.pages)
      const lines = await Promise.all(sales.items.map(async (item) => {
        const seller = await getDisplayName(wss, mctx, item.seller)
        return `» *${item.character.name}* (${formatNumber(item.character.value)}) • *${formatNumber(item.price)}* ${bot.currency}\n  Vendedor: ${seller} · Comprar: *${usedPrefix}buyc ${item.character.name}*`
      }))

      const text =
        `${gachaHeader("Tienda Gacha")}\n\n` +
        `▢ Ventas » *${sales.total}*\n` +
        `♡ Página » *${safePage}/${sales.pages}*\n` +
        `▢ Lista de personajes:\n\n` +
        `${lines.join("\n")}` +
        `${gachaPageFooter(safePage, sales.pages)}\n` +
        `${sales.pages > 1 ? gachaHint(usedPrefix, "wshop") : ""}`

      await sendText(wss, mctx, text)
      await mctx.react("✅")
    } catch (error) {
      console.error("[Gacha shop]", error)
      await mctx.react("❌")
      await mctx.reply(`「❀」 No pude abrir la tienda.`)
    }
  },
} as types.Command
