import { formatUser, formatNumber, getMentionedJid, getRuntimeGacha, gachaTitle, sendText, usageBlock } from "../../../libs/gacha.js";
export default {
    name: "giveallharem",
    alias: [],
    description: "Regala todos tus personajes a otro usuario",
    category: "games",
    using: "<@usuario>",
    flags: ["only.groups"],
    requires: [],
    hidden: false,
    execute: async (wss, { mctx, bot, group, usedPrefix }) => {
        const target = getMentionedJid(mctx);
        if (!target) {
            await mctx.react("⚠️");
            await mctx.reply(usageBlock("Regalar todo", [`*${usedPrefix}giveallharem* _@usuario_`]));
            return;
        }
        if (target === mctx.sender.jid) {
            await mctx.reply(`「❀」 No puedes regalarte todo a ti mismo.`);
            return;
        }
        try {
            await mctx.react("🎁");
            const db = getRuntimeGacha(bot, group);
            const count = db.transferAll(mctx.sender.jid, target);
            if (!count) {
                await mctx.reply(`「❀」 No tienes personajes para regalar.`);
                return;
            }
            const receiver = await formatUser(wss, mctx, target, "tag");
            await sendText(wss, mctx, `${gachaTitle("Harem transferido", `Se regalaron ${formatNumber(count)} personajes.`)}\n> ✧ Nuevo dueño › ${receiver.text}`, receiver.mentions);
            await mctx.react("✅");
        }
        catch (error) {
            console.error("[Gacha give all]", error);
            await mctx.react("❌");
            await mctx.reply(`「❀」 No pude transferir el harem.`);
        }
    },
};
