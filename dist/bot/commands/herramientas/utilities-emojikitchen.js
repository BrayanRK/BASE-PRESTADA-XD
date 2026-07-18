import { dvyerTenorEmoji, dvyerMediaUrl, dvyerUserError, DvyerError } from "../../../libs/downloads.js";
import { createSticker, getDefaultStickerMeta, getSavedStickerMeta } from "../../../libs/stickers.js";
const usage = () => "「⚠」 Envía dos emojis para combinar.\n✦ Uso › emojimix 😀😎";
const extractEmojis = (input) => [...input].filter((c) => /\p{Extended_Pictographic}/u.test(c));
// Codepoint base del emoji (ignora variation selector FE0F y ZWJ), en hex minúscula.
// Ej: "🔥" -> "1f525"
const baseCodepointHex = (emoji) => {
    for (const ch of emoji) {
        const cp = ch.codePointAt(0);
        if (cp && cp !== 0xfe0f && cp !== 0x200d)
            return cp.toString(16);
    }
    return "";
};
// Las URLs de Emoji Kitchen incluyen el codepoint hex de cada emoji (ej. u1f525_u1f60a).
// Si el codepoint de un emoji pedido no aparece en la URL, lo que llegó NO es realmente
// esa mezcla (la API devolvió otra cosa "por default"/fallback), así que la descartamos.
const urlMatchesEmoji = (url, emoji) => {
    const hex = baseCodepointHex(emoji);
    return hex.length > 0 && url.toLowerCase().includes(hex);
};
const tryFetch = async (a, b) => {
    const attempts = [
        [a, b],
        [b, a],
    ];
    for (const [x, y] of attempts) {
        try {
            const data = await dvyerTenorEmoji(`${x}_${y}`);
            const url = dvyerMediaUrl(data);
            if (url && urlMatchesEmoji(url, a) && urlMatchesEmoji(url, b))
                return url;
            console.error(`[emojimix] Descartado por no coincidir codepoints (${x}_${y}):`, url);
        }
        catch { }
    }
    return null;
};
export default {
    name: "emojimix",
    alias: ["emojikitchen", "combineremoji"],
    description: "Combina dos emojis usando Emoji Kitchen y envía como sticker.",
    category: "utilities",
    using: "[emoji][emoji]",
    flags: ["all.chats"],
    requires: [],
    hidden: false,
    execute: async (wss, { mctx, args, bot, user }) => {
        const input = args.join("").trim();
        const emojis = extractEmojis(input);
        if (emojis.length < 2) {
            await mctx.reply(usage());
            return;
        }
        const emoji1 = emojis[0];
        const emoji2 = emojis[1];
        try {
            await mctx.react("🎭");
            const imageUrl = await tryFetch(emoji1, emoji2);
            if (!imageUrl) {
                await mctx.react("❌");
                await mctx.reply(`「✖」 Mezcla imposible › ${emoji1} + ${emoji2}`);
                return;
            }
            const response = await fetch(imageUrl, {
                headers: { "User-Agent": "Mozilla/5.0 ZetaTS/EmojiKitchen" },
            });
            if (!response.ok)
                throw new DvyerError(`HTTP ${response.status}`, "No se pudo descargar la imagen.");
            const buffer = Buffer.from(await response.arrayBuffer());
            if (!buffer.length)
                throw new DvyerError("Vacío", "No se pudo procesar la imagen.");
            const fallback = getDefaultStickerMeta(mctx, bot, user);
            const meta = await getSavedStickerMeta(mctx.sender.jid, fallback);
            const sticker = await createSticker(buffer, meta);
            await wss.sendMessage(mctx.chat.jid, { sticker }, { quoted: mctx.message.original });
            await mctx.react("✅");
        }
        catch (error) {
            console.error("[emojimix] Error:", error instanceof Error ? error.message : error);
            await mctx.react("❌");
            await mctx.reply(`「✖」 ${dvyerUserError(error, "No se pudo generar la combinación.")}`);
        }
    },
};
