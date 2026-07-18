import { guardShopCommand, normalizeNumber } from "../../../libs/shop.js";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const command = {
    name: "sorteo",
    alias: ["rifa", "giveaway"],
    description: "Hacer sorteo entre miembros no admins del grupo.",
    using: "[premio o motivo]",
    category: "extras",
    hidden: true,
    flags: ["only.groups"],
    requires: [],
    execute: async (wss, ctx) => {
        if (!(await guardShopCommand(wss, ctx, { requireEnabled: false, requireOrganizer: true })))
            return;
        const prize = ctx.args.join(" ").trim();
        if (!prize) {
            await ctx.mctx.reply(`「✦」 Usa el comando así:\n\n*${ctx.usedPrefix}sorteo [premio o motivo]*\nEjemplo ›\n*${ctx.usedPrefix}sorteo Carro Fino*`);
            return;
        }
        await ctx.mctx.react("🎲").catch(() => { });
        const metadata = ctx.groupMetadata?.participants?.length ? ctx.groupMetadata : await wss.groupMetadata(ctx.mctx.chat.jid);
        const botNumber = normalizeNumber(wss.user?.id || ctx.mctx.me.jids.pn || ctx.mctx.me.jids.lid);
        const adminNumbers = new Set((metadata.participants || [])
            .filter((p) => p?.admin === "admin" || p?.admin === "superadmin")
            .flatMap((p) => [p?.id, p?.jid])
            .map((jid) => normalizeNumber(jid))
            .filter(Boolean));
        const elegibles = (metadata.participants || [])
            .map((p) => String(p?.jid || p?.id || ""))
            .filter((jid) => jid && /@(s\.whatsapp\.net|lid)$/i.test(jid))
            .filter((jid) => {
            const number = normalizeNumber(jid);
            return number && number !== botNumber && !adminNumbers.has(number);
        });
        const unique = Array.from(new Map(elegibles.map((jid) => [normalizeNumber(jid), jid])).values());
        if (!unique.length) {
            await ctx.mctx.reply("「⚠」 No hay suficientes participantes para hacer el sorteo.");
            return;
        }
        const winner = unique[Math.floor(Math.random() * unique.length)];
        const steps = [
            "🎁 Preparando el sorteo...",
            "🎰 Revolviendo nombres...",
            "🌀 Cargando suerte...",
            "🎯 Apuntando al ganador...",
        ];
        let temp = await wss.sendMessage(ctx.mctx.chat.jid, { text: steps[0] }, { quoted: ctx.mctx.message.original });
        for (const step of steps.slice(1)) {
            await sleep(900);
            temp = await wss.sendMessage(ctx.mctx.chat.jid, { edit: temp.key, text: step });
        }
        await sleep(900);
        await wss.sendMessage(ctx.mctx.chat.jid, {
            edit: temp.key,
            text: `🎉 *SORTEO REALIZADO*\n\n🏆 *Premio:* ${prize}\n👑 *Ganador:* @${normalizeNumber(winner)}`,
            mentions: [winner],
        });
    },
};
export default command;
