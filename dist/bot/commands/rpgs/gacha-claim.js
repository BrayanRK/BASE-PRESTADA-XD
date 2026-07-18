import { formatUser, getDisplayName, getRuntimeGacha, sendText } from "../../../libs/gacha.js";
import { getScopedGroupJid } from "../../../libs/bot-scope.js";
const cooldowns = new Map();
export default {
    name: "claim",
    alias: ["c", "reclamar"],
    description: "Reclama el último personaje del grupo",
    category: "games",
    using: "",
    flags: ["only.groups"],
    requires: [],
    hidden: false,
    execute: async (wss, { mctx, bot, group, usedPrefix }) => {
        const db = getRuntimeGacha(bot, group);
        const scopedGroupJid = getScopedGroupJid(bot, mctx.chat.jid);
        const key = `${scopedGroupJid}:${mctx.sender.jid}`;
        const left = (cooldowns.get(key) || 0) - Date.now();
        if (left > 0) {
            await mctx.react("⏳");
            await mctx.reply(`「❀」 Espera *${Math.ceil(left / 60000)} min* para reclamar otra vez.`);
            return;
        }
        try {
            await mctx.react("🎴");
            const character = db.getLastRolledCharacter(scopedGroupJid);
            if (!character) {
                await mctx.reply(`「❀」 No hay personaje activo. Usa *${usedPrefix}rw* primero.`);
                return;
            }
            const owner = db.getCharacterOwner(character.id);
            if (owner) {
                const user = await formatUser(wss, mctx, owner, "tag");
                await sendText(wss, mctx, `*｢✧｣* Ese personaje ya fue reclamado por ${user.text}.`, user.mentions);
                return;
            }
            const result = db.claimCharacter(mctx.sender.jid, character.id);
            if (!result.ok) {
                await mctx.reply(`「❀」 No pude reclamar ese personaje.`);
                return;
            }
            cooldowns.set(key, Date.now() + 5 * 60 * 1000);
            db.clearLastRolledCharacter(scopedGroupJid);
            const nick = await getDisplayName(wss, mctx, mctx.sender.jid);
            const rendered = db.renderClaimMessage({ userId: mctx.sender.jid, nick, character, currency: bot.currency || "coins" });
            await sendText(wss, mctx, rendered.text, rendered.mentions);
            await mctx.react("✅");
        }
        catch (error) {
            console.error("[Gacha claim]", error);
            await mctx.react("❌");
            await mctx.reply(`「❀」 Error al reclamar el personaje.`);
        }
    },
};
