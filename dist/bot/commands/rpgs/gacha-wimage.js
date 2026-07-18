import { formatNumber, getCharacterImage, getRuntimeGacha, getDisplayName, gachaTitle, sendImage, usageBlock } from "../../../libs/gacha.js";
export default {
    name: "charimage",
    alias: ["waifuimage", "cimage", "wimage"],
    description: "Muestra una imagen aleatoria de un personaje",
    category: "games",
    using: "<nombre>",
    flags: ["only.groups"],
    requires: [],
    hidden: false,
    execute: async (wss, { mctx, args, bot, group, usedPrefix }) => {
        const query = args.join(" ").trim();
        if (!query) {
            await mctx.react("⚠️");
            await mctx.reply(usageBlock("Imagen de personaje", [`*${usedPrefix}charimage* _Goku_`, `*${usedPrefix}wimage* _Asuka_`]));
            return;
        }
        try {
            await mctx.react("🖼️");
            const db = getRuntimeGacha(bot, group);
            const char = db.findCharacter(query);
            if (!char) {
                await mctx.reply(`「❀」 No encontré *${query}*.`);
                return;
            }
            const image = getCharacterImage(char);
            if (!image) {
                await mctx.reply(`「❀」 *${char.name}* no tiene imagen disponible.`);
                return;
            }
            const owner = db.getCharacterOwner(char.id);
            const ownerName = owner ? await getDisplayName(wss, mctx, owner) : "Libre";
            const caption = `${gachaTitle(char.name, "Imagen aleatoria.")}\n> ✧ Valor › *${formatNumber(char.value)}* ${bot.currency}\n> ✦ Serie › *${char.source}*\n> ❖ Estado › *${owner ? `De ${ownerName}` : "Libre"}*`;
            await sendImage(wss, mctx, image, caption);
            await mctx.react("✅");
        }
        catch (error) {
            console.error("[Gacha image]", error);
            await mctx.react("❌");
            await mctx.reply(`「❀」 No pude enviar la imagen.`);
        }
    },
};
