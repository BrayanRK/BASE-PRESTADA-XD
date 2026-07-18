import { deleteShopItem, getShopItemByCommand, guardShopCommand, shopHeader } from "../../../libs/shop.js";
const command = {
    name: "shopdel",
    alias: ["delshop", "borrarshop", "delventas"],
    description: "Borrar una sección o todo el shop.",
    using: "[sección/all]",
    category: "extras",
    hidden: true,
    flags: ["only.groups"],
    requires: [],
    execute: async (wss, ctx) => {
        if (!(await guardShopCommand(wss, ctx, { requireEnabled: false, requireOrganizer: true })))
            return;
        const target = String(ctx.args[0] || "").toLowerCase().trim();
        if (!target) {
            await ctx.mctx.reply(`${shopHeader("Shop Del", ["Uso › " + ctx.usedPrefix + "shopdel stock", "Uso › " + ctx.usedPrefix + "shopdel all"])}\n\n╎ También sirve con: pago, netflix, promo, soporte, canvas, combos, diamantes, seguidores, duos, trios, lotes, tramites.`);
            return;
        }
        if (target !== "all" && !getShopItemByCommand(target)) {
            await ctx.mctx.reply(`「⚠」 No reconozco la sección *${target}*. Usa *${ctx.usedPrefix}menushop*.`);
            return;
        }
        const ok = deleteShopItem(ctx, target);
        if (!ok) {
            await ctx.mctx.reply("「✘」 No pude borrar esa sección del shop.");
            return;
        }
        await ctx.mctx.reply(shopHeader("Shop", [
            `Acción › ${target === "all" ? "shop limpiado" : "sección borrada"}`,
            `Sección › ${target}`,
        ]));
    },
};
export default command;
