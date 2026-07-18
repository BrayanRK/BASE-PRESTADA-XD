import { createSticker, downloadStickerBuffer, getDefaultStickerMeta, getSavedStickerMeta, getStickerUsage, isStickerMedia, mergeStickerMeta, parseStickerArgs, } from "../../../libs/stickers.js";
export default {
    name: "sticker",
    alias: ["s"],
    description: "Convierte imágenes, videos, GIFs o stickers con pack personalizado",
    category: "utilities",
    using: "[packname|author]",
    requires: [],
    flags: ["all.chats"],
    hidden: false,
    execute: async (wss, { mctx, args, user, bot, usedPrefix }) => {
        const source = mctx.quoted ?? mctx;
        const parsed = parseStickerArgs(args);
        const mime = source.message.mimetype || "";
        const hasDownloadableMedia = Boolean(source.download && !/^(audio|text)\//i.test(mime));
        const hasMedia = isStickerMedia(mime) || hasDownloadableMedia;
        if (!hasMedia && !parsed.url) {
            const fallback = getDefaultStickerMeta(mctx, bot, user);
            const saved = await getSavedStickerMeta(mctx.sender.jid, fallback);
            return mctx.reply(`${getStickerUsage(usedPrefix)}`);
        }
        try {
            await mctx.react("⏳");
            const fallback = getDefaultStickerMeta(mctx, bot, user);
            const saved = await getSavedStickerMeta(mctx.sender.jid, fallback);
            const meta = mergeStickerMeta(saved, parsed);
            const input = await downloadStickerBuffer(source, parsed.url);
            const sticker = await createSticker(input, meta);
            await wss.sendMessage(mctx.chat.jid, { sticker }, { quoted: mctx.message.original });
            await mctx.react("✅");
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo crear el sticker.";
            console.error("[Sticker] Error:", error);
            await mctx.react("❌");
            await mctx.reply(`「🛠」 ${message}`);
        }
    },
};
