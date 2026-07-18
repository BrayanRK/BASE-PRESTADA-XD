import { freeFireHeader, isFreeFireEnabled, isFreeFireOrganizer, setFreeFireEnabled, } from "../../../libs/freefire.js";
const command = {
    name: "ff",
    alias: ["freefire"],
    description: "Activar/desactivar los comandos Free Fire del grupo.",
    using: "[on/off]",
    category: "extras",
    hidden: false,
    flags: ["only.groups"],
    requires: [],
    execute: async (_, ctx) => {
        if (!ctx.mctx.is_group) {
            await ctx.mctx.reply("「⚠」 Este comando solo puede usarse en grupos.");
            return;
        }
        if (!isFreeFireOrganizer(ctx)) {
            await ctx.mctx.reply("「⚠」 Solo admins o el dueño del bot pueden activar/desactivar Free Fire.");
            return;
        }
        const option = String(ctx.args[0] || "").trim().toLowerCase();
        const enabled = await isFreeFireEnabled(ctx.bot, ctx.mctx.chat.jid);
        if (!option) {
            let text = freeFireHeader("Free Fire", [
                `Estado › ${enabled ? "activado" : "desactivado"}`,
                `Grupo › ${ctx.mctx.chat.name || "grupo"}`,
            ]);
            text += `\n\n⟡ Uso\n╎ *${ctx.usedPrefix}ff on* › activar\n╎ *${ctx.usedPrefix}ff off* › desactivar\n╎ *${ctx.usedPrefix}ffmenu* › ver comandos`;
            await ctx.mctx.reply(text);
            return;
        }
        if (!["on", "off", "enable", "disable"].includes(option)) {
            await ctx.mctx.reply(`「⚠」 Usa *${ctx.usedPrefix}ff on* o *${ctx.usedPrefix}ff off*.`);
            return;
        }
        const nextEnabled = option === "on" || option === "enable";
        if (enabled === nextEnabled) {
            await ctx.mctx.reply(`${freeFireHeader("Free Fire", [
                `Estado › ya estaba ${enabled ? "activado" : "desactivado"}`,
                `Grupo › ${ctx.mctx.chat.name || "grupo"}`,
            ])}`);
            return;
        }
        const saved = await setFreeFireEnabled(ctx.bot, ctx.mctx.chat.jid, nextEnabled, ctx.mctx.sender.jid);
        if (!saved) {
            await ctx.mctx.reply("「⚠」 No se pudo guardar el estado de Free Fire. Intenta otra vez.");
            return;
        }
        let text = freeFireHeader("Extras", [
            "Módulo › Free Fire",
            `Estado › ${nextEnabled ? "activado" : "desactivado"}`,
            `Grupo › ${ctx.mctx.chat.name || "grupo"}`,
        ]);
        if (nextEnabled) {
            text += `\n\n⟡ Listo\n╎ Usa *${ctx.usedPrefix}ffmenu* para ver todos los comandos.`;
        }
        else {
            text += `\n\n╎ Los comandos Free Fire quedan bloqueados hasta usar *${ctx.usedPrefix}ff on*.`;
        }
        await ctx.mctx.reply(text);
    },
};
export default command;
