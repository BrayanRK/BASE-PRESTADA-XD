import { formatNumber, getCharacterImage, getRuntimeGacha, getDisplayName, gachaTitle, sendImage, sendText } from "../../../libs/gacha.js";
import { getScopedGroupJid } from "../../../libs/bot-scope.js";
const cooldowns = new Map();
export default {
    name: "rollwaifu",
    alias: ["rw", "roll"],
    description: "Lanza un personaje aleatorio",
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
            await mctx.reply(`「❀」 Espera *${Math.ceil(left / 60000)} min* para volver a usar *${usedPrefix}rw*.`);
            return;
        }
        try {
            await mctx.react("🎲");
            const character = db.getRandomCharacter();
            if (!character) {
                await mctx.reply(`${gachaTitle("Gacha vacío", "No hay personajes registrados todavía.")}\n> Agrega personajes a *database/characters_shared.json* o usa tus comandos de carga.`);
                return;
            }
            cooldowns.set(key, Date.now() + 9 * 60 * 1000);
            db.saveLastCharacter(character, scopedGroupJid);
            const owner = db.getCharacterOwner(character.id);
            const ownerName = owner ? await getDisplayName(wss, mctx, owner) : "Libre";
            const caption = `${gachaTitle(character.name, "Personaje encontrado.")}\n> ✧ Valor › *${formatNumber(character.value)}* ${bot.currency}\n> ✦ Serie › *${character.source}*\n> ✩ Género › *${character.gender || "Desconocido"}*\n> ❖ Estado › *${owner ? `De ${ownerName}` : "Libre"}*\n\n✐ Usa *${usedPrefix}claim* o *${usedPrefix}c* para reclamarlo.`;
            const image = getCharacterImage(character);
            if (image)
                await sendImage(wss, mctx, image, caption);
            else
                await sendText(wss, mctx, caption);
            await mctx.react("✅");
        }
        catch (error) {
            console.error("[Gacha roll]", error);
            await mctx.react("❌");
            await mctx.reply(`「❀」 No pude lanzar personaje.`);
        }
    },
};
