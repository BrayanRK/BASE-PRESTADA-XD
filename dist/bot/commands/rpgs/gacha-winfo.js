import { formatNumber, getRuntimeGacha, getDisplayName, gachaTitle, sendText, usageBlock } from "../../../libs/gacha.js";
export default {
    name: "charinfo",
    alias: ["winfo", "waifuinfo"],
    description: "Muestra información de un personaje",
    category: "games",
    using: "<nombre>",
    flags: ["only.groups"],
    requires: [],
    hidden: false,
    execute: async (wss, { mctx, args, bot, group, usedPrefix }) => {
        const query = args.join(" ").trim();
        if (!query) {
            await mctx.react("⚠️");
            await mctx.reply(usageBlock("Info de personaje", [`*${usedPrefix}charinfo* _Goku_`, `*${usedPrefix}winfo* _Satoru Gojou_`]));
            return;
        }
        try {
            await mctx.react("🔎");
            const db = getRuntimeGacha(bot, group);
            const char = db.findCharacter(query);
            if (!char) {
                await mctx.reply(`「❀」 No encontré *${query}* en el gacha.`);
                return;
            }
            const owner = db.getCharacterOwner(char.id);
            const ownerName = owner ? await getDisplayName(wss, mctx, owner) : "Libre";
            const text = `${gachaTitle("Ficha de personaje", char.name)}\n> ✧ Valor › *${formatNumber(char.value)}* ${bot.currency}\n> ✦ Serie › *${char.source}*\n> ✩ Género › *${char.gender || "Desconocido"}*\n> ❖ Estado › *${owner ? `De ${ownerName}` : "Libre"}*\n> ⌁ Votos › *${formatNumber(char.votes || 0)}*\n> ❐ Imágenes › *${char.img?.length || 0}*\n> ▷ Videos › *${char.vid?.length || 0}*\n> ID › \`${char.id}\``;
            await sendText(wss, mctx, text);
            await mctx.react("✅");
        }
        catch (error) {
            console.error("[Gacha info]", error);
            await mctx.react("❌");
            await mctx.reply(`「❀」 Error al buscar información.`);
        }
    },
};
