import type * as types from "../../../types/types.js"
import {
  formatNumber,
  getDisplayName,
  getRuntimeGacha,
  sendText,
  gachaHeader,
  gachaHint,
  gachaPageFooter,
  paginate,
  parsePageArgs,
} from "../../../libs/gacha.js"

export default {
  name: "favoritetop",
  alias: ["favtop"],
  description: "Muestra personajes favoritos por votos.",
  category: "games",
  using: "<página>",
  flags: ["only.groups"],
  requires: [],
  hidden: false,
  execute: async (wss, { mctx, args, bot, group, usedPrefix }) => {
    try {
      await mctx.react("💫")

      const parsed = parsePageArgs(args)
      const db = getRuntimeGacha(bot, group)
      const all = db.loadCharacters()
        .filter((char) => Number(char.votes || 0) > 0)
        .sort((a, b) => Number(b.votes || 0) - Number(a.votes || 0) || Number(b.value || 0) - Number(a.value || 0))

      if (!all.length) {
        await mctx.reply(`「❀」 No hay personajes votados todavía.`)
        return
      }

      const page = paginate(all, parsed.page, 10)
      const lines = await Promise.all(page.items.map(async (char, index) => {
        const owner = db.getCharacterOwner(char.id)
        const ownerText = owner ? await getDisplayName(wss, mctx, owner) : "Libre."
        return `» *#${page.start + index + 1}* ${char.name} • ${formatNumber(char.votes || 0)} votos\n  Valor: *${formatNumber(char.value)}* ${bot.currency} · ${ownerText}`
      }))

      const text =
        `${gachaHeader("Favoritos")}\n\n` +
        `▢ Personajes votados » *${all.length}*\n` +
        `♡ Orden » *Más votos*\n` +
        `▢ Lista de personajes:\n\n` +
        `${lines.join("\n")}` +
        `${gachaPageFooter(page.page, page.pages)}\n` +
        `${page.pages > 1 ? gachaHint(usedPrefix, "favtop") : ""}`

      await sendText(wss, mctx, text)
      await mctx.react("✅")
    } catch (error) {
      console.error("[Gacha favtop]", error)
      await mctx.react("❌")
      await mctx.reply(`「❀」 No pude mostrar favoritos.`)
    }
  },
} as types.Command
