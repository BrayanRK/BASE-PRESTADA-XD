import { formatNumber, formatUser, getMentionedJid, getRuntimeGacha, sendText, gachaHeader, gachaHint, gachaPageFooter, paginate, parsePageArgs, } from "../../../libs/gacha.js";
export default {
    name: "harem",
    alias: ["waifus", "claims"],
    description: "Muestra personajes reclamados.",
    category: "games",
    using: "<@usuario> <página>",
    flags: ["only.groups"],
    requires: [],
    hidden: false,
    execute: async (wss, { mctx, args, bot, group, usedPrefix }) => {
        try {
            await mctx.react("📚");
            const parsed = parsePageArgs(args);
            const db = getRuntimeGacha(bot, group);
            const target = getMentionedJid(mctx) || mctx.sender.jid;
            const who = await formatUser(wss, mctx, target, target === mctx.sender.jid ? "nick" : "tag");
            const items = db
                .getUserEntries(target)
                .sort((a, b) => Number(b.character.value || 0) - Number(a.character.value || 0));
            if (!items.length) {
                await sendText(wss, mctx, `${gachaHeader("Harem vacío:", `‹*${who.text}*›`)}\n\n▢ Personajes » *0*\n♡ Valor total » *0* ${bot.currency}\n\n> Usa *${usedPrefix}rollwaifu* para empezar.`, who.mentions);
                return;
            }
            const totalValue = items.reduce((acc, item) => acc + Number(item.character.value || 0), 0);
            const page = paginate(items, parsed.page, 10);
            const lines = page.items.map(({ character, entry }) => {
                const sale = entry.sale_price ? ` • Venta: *${formatNumber(entry.sale_price)}* ${bot.currency}` : "";
                return `» *${character.name}* (${formatNumber(character.value)}) • ${character.source}${sale}`;
            });
            const text = `${gachaHeader("Nombre:", `‹*${who.text}*›`)}\n\n` +
                `▢ Personajes » *${items.length}*\n` +
                `♡ Valor total » *${formatNumber(totalValue)}* ${bot.currency}\n` +
                `▢ Lista de personajes:\n\n` +
                `${lines.join("\n")}` +
                `${gachaPageFooter(page.page, page.pages)}\n` +
                `${page.pages > 1 ? gachaHint(usedPrefix, "harem") : ""}`;
            await sendText(wss, mctx, text, who.mentions);
            await mctx.react("✅");
        }
        catch (error) {
            console.error("[Gacha harem]", error);
            await mctx.react("❌");
            await mctx.reply(`「❀」 No pude mostrar el harem.`);
        }
    },
};
