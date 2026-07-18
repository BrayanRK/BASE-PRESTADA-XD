import { GachaDatabaseIndividual } from "../../../libs/gacha.js";
import { getEffectiveBotJid } from "../../../libs/bot-scope.js";
export default {
    name: "addrw",
    alias: ["addcharacter"],
    description: "Añade un personaje manualmente (Solo owner)",
    using: "addrw <nombre> <género> <fuente> <valor> <imagen_url>",
    category: "owner",
    flags: ["only.groups"],
    hidden: false,
    requires: ["bot.owner"],
    execute: async (wss, { mctx, args, bot }) => {
        const gachaDb = new GachaDatabaseIndividual(getEffectiveBotJid(bot) || "default@lid");
        if (args.length < 5) {
            return await mctx.reply("❀ Uso del comando:\n\n*#addrw <nombre> <género> <fuente> <valor> <imagen_url>*\n\n*Ejemplo:*\n#addrw Asuka Female Evangelion 1500 https://example.com/image.jpg");
        }
        const [name, gender, source, valueStr, imageUrl, ...extraImages] = args;
        const value = Number.parseInt(valueStr) || Math.floor(Math.random() * 2000) + 1000;
        try {
            const images = [imageUrl, ...extraImages].filter((url) => url && url.startsWith("http"));
            if (images.length === 0) {
                return await mctx.reply(`「❀」 Debes proporcionar al menos una URL de imagen válida.`);
            }
            const characterData = {
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                name,
                gender,
                source,
                value,
                image: images[0],
                img: images,
                vid: [],
                user_id: null,
                status: "Libre",
                votes: 0,
            };
            const success = gachaDb.addCharacter(characterData);
            if (success) {
                await gachaDb.saveToJson();
                const botInfo = `🤖 ${getEffectiveBotJid(bot)?.split("@")[0]}`;
                await mctx.reply(`✅ *Personaje añadido exitosamente*\n\n❀ Nombre » *${name}*\n🚻 Género » *${gender}*\n❖ Fuente » *${source}*\n✰ Valor » *${value}*\n🖼️ Imágenes » *${images.length}*`);
            }
            else {
                await mctx.reply(`「❀」 Error al añadir el personaje. Puede que ya exista un personaje con ese nombre.`);
            }
        }
        catch (error) {
            await mctx.reply(`「❀」 Error al añadir personaje: ${error}`);
        }
    },
};
