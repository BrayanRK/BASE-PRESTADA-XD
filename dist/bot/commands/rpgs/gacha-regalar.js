import { formatUser, getMentionedJid, getRuntimeGacha, gachaTitle, removeMentionFromArgs, sendText, usageBlock } from "../../../libs/gacha.js";
export default {
    name: "givechar",
    alias: ["givewaifu", "regalar"],
    description: "Regala un personaje a otro usuario",
    category: "games",
    using: "<@usuario> <nombre>",
    flags: ["only.groups"],
    requires: [],
    hidden: false,
    execute: async (wss, { mctx, args, bot, group, usedPrefix }) => {
        const target = getMentionedJid(mctx);
        const name = removeMentionFromArgs(args, target);
        if (!target || !name) {
            await mctx.react("⚠️");
            await mctx.reply(usageBlock("Regalar personaje", [`*${usedPrefix}givechar* _@usuario Goku_`, `*${usedPrefix}regalar* _@usuario Rem_`]));
            return;
        }
        if (target === mctx.sender.jid) {
            await mctx.reply(`「❀」 No puedes regalarte un personaje a ti mismo.`);
            return;
        }
        try {
            await mctx.react("🎁");
            const db = getRuntimeGacha(bot, group);
            const char = db.findCharacter(name);
            if (!char) {
                await mctx.reply(`「❀」 No encontré *${name}*.`);
                return;
            }
            const ok = db.transferCharacter(mctx.sender.jid, target, char.id);
            if (!ok) {
                await mctx.reply(`「❀」 No tienes *${char.name}* en tu harem.`);
                return;
            }
            const receiver = await formatUser(wss, mctx, target, "tag");
            await sendText(wss, mctx, `${gachaTitle("Regalo entregado", char.name)}\n> ✧ Nuevo dueño › ${receiver.text}`, receiver.mentions);
            await mctx.react("✅");
        }
        catch (error) {
            console.error("[Gacha give]", error);
            await mctx.react("❌");
            await mctx.reply(`「❀」 No pude regalar el personaje.`);
        }
    },
};
