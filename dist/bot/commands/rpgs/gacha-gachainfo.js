import { formatNumber, formatUser, getMentionedJid, getRuntimeGacha, gachaTitle, sendText } from "../../../libs/gacha.js";
import { getScopedGroupJid } from "../../../libs/bot-scope.js";
export default {
    name: "gachainfo",
    alias: ["ginfo", "infogacha"],
    description: "Muestra tu perfil gacha",
    category: "games",
    using: "<@usuario>",
    flags: ["only.groups"],
    requires: [],
    hidden: false,
    execute: async (wss, { mctx, bot, group }) => {
        try {
            await mctx.react("📊");
            const db = getRuntimeGacha(bot, group);
            const scopedGroupJid = getScopedGroupJid(bot, mctx.chat.jid);
            const target = getMentionedJid(mctx) || mctx.sender.jid;
            const who = await formatUser(wss, mctx, target, target === mctx.sender.jid ? "nick" : "tag");
            const stats = db.getUserStats(target);
            const balance = await db.getBalance(scopedGroupJid, target);
            const haremInfo = db.getHaremInfo();
            const text = `${gachaTitle("Perfil Gacha", who.text)}\n> ✦ Personajes › *${stats.count}*\n> ✧ Valor harem › *${formatNumber(stats.value)}* ${bot.currency}\n> ✩ Votos acumulados › *${formatNumber(stats.votes)}*\n> ❖ En venta › *${stats.saleCount}*\n> ◈ Balance › *${formatNumber(balance)}* ${bot.currency}\n> ⌁ Harem compartido › *${haremInfo.shared ? "Sí" : "No"}*`;
            await sendText(wss, mctx, text, who.mentions);
            await mctx.react("✅");
        }
        catch (error) {
            console.error("[Gacha info user]", error);
            await mctx.react("❌");
            await mctx.reply(`「❀」 No pude mostrar el perfil gacha.`);
        }
    },
};
