import { buildQuoteCard } from "../../../libs/canva-card.js";
import { createSticker, getDefaultStickerMeta, getSavedStickerMeta } from "../../../libs/stickers.js";
const MAX_TEXT_LENGTH = 100;
const COOLDOWN_MS = 10_000;
const CACHE_TTL_MS = 5 * 60_000;
const DEFAULT_AVATAR = "https://telegra.ph/file/24fa902ead26340f3df2c.png";
const stickerCache = new Map();
const lastRequest = new Map();
const usage = (prefix, command) => `「❗」 Uso incorrecto.\nEjemplo › ${prefix + command} texto\nTambién puedes responder a un mensaje y solo escribir ${prefix + command}.`;
export default {
    name: "qc",
    alias: ["quote", "quotely"],
    description: "Genera un sticker tipo \"cita\" con el texto y el avatar de quien hablas.",
    category: "utilities",
    using: "<texto>",
    flags: ["all.chats"],
    requires: [],
    hidden: false,
    execute: async (wss, { mctx, args, usedPrefix, commandName, bot, user }) => {
        const text = (args.length ? args.join(" ") : mctx.quoted?.message.text || "").trim();
        if (!text) {
            await mctx.react("⚠️");
            await mctx.reply(usage(usedPrefix, commandName));
            return;
        }
        if (text.length > MAX_TEXT_LENGTH) {
            await mctx.react("⚠️");
            await mctx.reply(`「❗」 El texto no puede tener más de ${MAX_TEXT_LENGTH} caracteres.`);
            return;
        }
        const ownJid = mctx.me.jids.lid || mctx.me.jids.pn;
        const who = mctx.message.mentionedJid?.[0] ||
            mctx.quoted?.sender.jid ||
            (mctx.message.from_me ? ownJid : mctx.sender.jid);
        if (!who) {
            await mctx.react("⚠️");
            await mctx.reply(usage(usedPrefix, commandName));
            return;
        }
        const senderKey = mctx.sender.jid.split("@")[0];
        const now = Date.now();
        const lastUse = lastRequest.get(senderKey) || 0;
        if (now - lastUse < COOLDOWN_MS) {
            const remaining = Math.ceil((COOLDOWN_MS - (now - lastUse)) / 1000);
            await mctx.reply(`「⏰」 Espera ${remaining}s antes de volver a usar ${usedPrefix + commandName}.`);
            return;
        }
        lastRequest.set(senderKey, now);
        const cacheKey = `${who}:${text}`;
        const cached = stickerCache.get(cacheKey);
        if (cached) {
            try {
                await wss.sendMessage(mctx.chat.jid, { sticker: cached }, { quoted: mctx.message.original });
            }
            catch (error) {
                console.error("[qc] Error reenviando desde cache:", error);
            }
            return;
        }
        try {
            await mctx.react("⌛");
            const [avatarUrl, name] = await Promise.all([
                wss.profilePictureUrl(who).catch(() => DEFAULT_AVATAR),
                wss.getName(who).catch(() => "Usuario"),
            ]);
            const image = await buildQuoteCard({ text, name: name || "Usuario", avatarUrl });
            const stickerMeta = await getSavedStickerMeta(mctx.sender.jid, getDefaultStickerMeta(mctx, bot, user));
            const sticker = await createSticker(image, stickerMeta);
            stickerCache.set(cacheKey, sticker);
            setTimeout(() => stickerCache.delete(cacheKey), CACHE_TTL_MS);
            await wss.sendMessage(mctx.chat.jid, { sticker }, { quoted: mctx.message.original });
            await mctx.react("✅");
        }
        catch (error) {
            console.error("[qc] Error:", error instanceof Error ? error.message : error);
            await mctx.react("❌");
            await mctx.reply("「🛠」 No se pudo generar el sticker de cita, intenta de nuevo en unos minutos.");
        }
    },
};
