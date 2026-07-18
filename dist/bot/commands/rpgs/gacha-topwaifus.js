import { formatNumber, getDisplayName, getRuntimeGacha, sendText, gachaHeader, gachaHint, gachaPageFooter, paginate, parsePageArgs, } from "../../../libs/gacha.js";
export default {
    name: "waifusboard",
    alias: ["waifustop", "topwaifus", "wtop"],
    description: "Muestra top de personajes con mayor valor.",
    category: "games",
    using: "<página>",
    flags: ["only.groups"],
    requires: [],
    hidden: false,
    execute: async (wss, { mctx, args, bot, group, usedPrefix }) => {
        try {
            await mctx.react("🏆");
            const parsed = parsePageArgs(args);
            const db = getRuntimeGacha(bot, group);
            const all = db.loadCharacters().sort((a, b) => Number(b.value || 0) - Number(a.value || 0));
            if (!all.length) {
                await mctx.reply(`「❀」 No hay personajes registrados.`);
                return;
            }
            const page = paginate(all, parsed.page, 10);
            const lines = await Promise.all(page.items.map(async (char, index) => {
                const owner = db.getCharacterOwner(char.id);
                const ownerText = owner ? await getDisplayName(wss, mctx, owner) : "Libre.";
                return `» *#${page.start + index + 1}* ${char.name} (${formatNumber(char.value)}) • ${ownerText}\n  Serie: ${char.source}`;
            }));
            const text = `${gachaHeader("Top Waifus")}\n\n` +
                `▢ Personajes » *${all.length}*\n` +
                `♡ Orden » *Mayor valor*\n` +
                `▢ Lista de personajes:\n\n` +
                `${lines.join("\n")}` +
                `${gachaPageFooter(page.page, page.pages)}\n` +
                `${page.pages > 1 ? gachaHint(usedPrefix, "wtop") : ""}`;
            await sendText(wss, mctx, text);
            await mctx.react("✅");
        }
        catch (error) {
            console.error("[Gacha top]", error);
            await mctx.react("❌");
            await mctx.reply(`「❀」 No pude mostrar el top.`);
        }
    },
};
