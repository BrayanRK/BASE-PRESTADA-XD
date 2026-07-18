import { getDefaultStickerMeta, getSavedStickerMeta, mergeStickerMeta, parseStickerArgs, saveStickerMeta, } from "../../../libs/stickers.js";
export default {
    name: "setmeta",
    alias: ["setpack", "pack", "seto"],
    description: "Guarda packname y author por defecto para stickers",
    category: "utilities",
    using: "<packname|author>",
    requires: [],
    flags: ["all.chats"],
    hidden: false,
    execute: async (wss, { mctx, args, user, bot, usedPrefix }) => {
        const fallback = getDefaultStickerMeta(mctx, bot, user);
        if (!args.length || args[0]?.toLowerCase() === "info") {
            const current = await getSavedStickerMeta(mctx.sender.jid, fallback);
            return mctx.reply(`「🛠」 Configuración de stickers
│ Uso › *${usedPrefix}setmeta Mi Pack|Mi Firma*
│ Packname › *${current.packname}*
╰ Author › *${current.author}*`);
        }
        const parsed = parseStickerArgs(args);
        const meta = mergeStickerMeta(fallback, parsed);
        if (!parsed.packname && !parsed.author) {
            return mctx.reply(`「🛠」 Formato incorrecto
╰ Uso › *${usedPrefix}setmeta packname|author*`);
        }
        try {
            const saved = await saveStickerMeta(mctx.sender.jid, mctx.sender.name || user.name, meta.packname, meta.author);
            await mctx.reply(`「🛠」 Pack de stickers guardado
│ Packname › *${saved.packname}*
│ Author › *${saved.author}*
╰ Estado › *${usedPrefix}s* usará esos metadatos.`);
        }
        catch (error) {
            console.error("[SetMeta] Error:", error);
            await mctx.reply(`「🛠」 No pude guardar el pack de stickers.`);
        }
    },
};
