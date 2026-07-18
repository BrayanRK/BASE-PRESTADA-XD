import type * as types from "../../../types/types.js"
import { isShopEnabled, isShopOrganizer, setShopEnabled, shopHeader } from "../../../libs/shop.js"

const command: types.Command = {
  name: "shop",
  alias: ["ventas", "tienda"],
  description: "Activar/desactivar el módulo shop del grupo.",
  using: "[on/off]",
  category: "extras",
  hidden: false,
  flags: ["only.groups"],
  requires: [],
  execute: async (_, ctx) => {
    if (!ctx.mctx.is_group) {
      await ctx.mctx.reply("「⚠」 Este comando solo puede usarse en grupos.")
      return
    }

    if (!isShopOrganizer(ctx)) {
      await ctx.mctx.reply("「⚠」 Solo admins o el dueño del bot pueden activar/desactivar el shop.")
      return
    }

    const option = String(ctx.args[0] || "").trim().toLowerCase()
    const enabled = await isShopEnabled(ctx.bot, ctx.mctx.chat.jid)

    if (!option) {
      let text = shopHeader("Shop", [
        `Estado › ${enabled ? "activado" : "desactivado"}`,
        `Grupo › ${ctx.mctx.chat.name || "grupo"}`,
      ])
      text += `\n\n⟡ Uso\n╎ *${ctx.usedPrefix}shop on* › activar\n╎ *${ctx.usedPrefix}shop off* › desactivar\n╎ *${ctx.usedPrefix}menushop* › ver comandos`
      await ctx.mctx.reply(text)
      return
    }

    if (!["on", "off", "enable", "disable"].includes(option)) {
      await ctx.mctx.reply(`「⚠」 Usa *${ctx.usedPrefix}shop on* o *${ctx.usedPrefix}shop off*.`)
      return
    }

    const nextEnabled = option === "on" || option === "enable"
    if (enabled === nextEnabled) {
      await ctx.mctx.reply(
        shopHeader("Shop", [
          `Estado › ya estaba ${enabled ? "activado" : "desactivado"}`,
          `Grupo › ${ctx.mctx.chat.name || "grupo"}`,
        ]),
      )
      return
    }

    const saved = await setShopEnabled(ctx.bot, ctx.mctx.chat.jid, nextEnabled, ctx.mctx.sender.jid)
    if (!saved) {
      await ctx.mctx.reply("「⚠」 No se pudo guardar el estado del shop. Intenta otra vez.")
      return
    }

    let text = shopHeader("Extras", [
      "Módulo › Shop / Ventas",
      `Estado › ${nextEnabled ? "activado" : "desactivado"}`,
      `Grupo › ${ctx.mctx.chat.name || "grupo"}`,
    ])

    if (nextEnabled) {
      text += `\n\n⟡ Listo\n╎ Usa *${ctx.usedPrefix}menushop* para ver todos los comandos.`
    } else {
      text += `\n\n╎ Los comandos shop quedan bloqueados hasta usar *${ctx.usedPrefix}shop on*.`
    }

    await ctx.mctx.reply(text)
  },
}

export default command
