import { formatUser, getRuntimeGacha, gachaTitle, sendText, usageBlock } from "../../../libs/gacha.js";
export default {
    name: "trade",
    alias: ["intercambiar"],
    description: "Intercambia personaje con otro usuario",
    category: "games",
    using: "<tu personaje> / <personaje 2>",
    flags: ["only.groups"],
    requires: [],
    hidden: false,
    execute: async (wss, { mctx, args, bot, group, usedPrefix }) => {
        const text = args.join(" ");
        const [mineName, otherName] = text.split("/").map((v) => v.trim());
        if (!mineName || !otherName) {
            await mctx.react("⚠️");
            await mctx.reply(usageBlock("Intercambiar", [`*${usedPrefix}trade* _Goku / Rem_`, `*${usedPrefix}intercambiar* _Asuka / Mikasa_`]));
            return;
        }
        try {
            await mctx.react("🔁");
            const db = getRuntimeGacha(bot, group);
            const mine = db.findCharacter(mineName);
            const other = db.findCharacter(otherName);
            if (!mine || !other) {
                await mctx.reply(`「❀」 No encontré uno de los personajes del intercambio.`);
                return;
            }
            const result = db.tradeCharacters(mctx.sender.jid, mine.id, other.id);
            if (!result.ok) {
                const reason = result.reason === "mine"
                    ? `No tienes *${mine.name}*.`
                    : `*${other.name}* no pertenece a otro usuario.`;
                await mctx.reply(`「❀」 ${reason}`);
                return;
            }
            const otherUser = await formatUser(wss, mctx, result.otherUser || "", "tag");
            await sendText(wss, mctx, `${gachaTitle("Intercambio realizado", `${mine.name} ↔ ${other.name}`)}\n> ✧ Intercambiaste con ${otherUser.text}`, otherUser.mentions);
            await mctx.react("✅");
        }
        catch (error) {
            console.error("[Gacha trade]", error);
            await mctx.react("❌");
            await mctx.reply(`「❀」 No pude hacer el intercambio.`);
        }
    },
};
