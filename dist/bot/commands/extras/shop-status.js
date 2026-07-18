import { isShopEnabled, listShopStoredItems, shopHeader } from "../../../libs/shop.js";
const command = {
    name: "shopstatus",
    alias: ["estadotienda", "ventasstatus"],
    description: "Revisar qué secciones del shop ya están configuradas.",
    category: "extras",
    hidden: true,
    flags: ["only.groups"],
    requires: [],
    execute: async (_, ctx) => {
        const enabled = await isShopEnabled(ctx.bot, ctx.mctx.chat.jid);
        const items = listShopStoredItems(ctx);
        const ready = items.filter((entry) => entry.data).length;
        let text = shopHeader("Shop Status", [
            `Estado › ${enabled ? "activado" : "desactivado"}`,
            `Configurados › ${ready}/${items.length}`,
        ]);
        text += "\n\n⟡ Secciones";
        for (const { item, data } of items) {
            text += `\n╎ ${data ? "✅" : "❌"} *${ctx.usedPrefix}${item.command}* › ${item.title}`;
        }
        await ctx.mctx.reply(text);
    },
};
export default command;
