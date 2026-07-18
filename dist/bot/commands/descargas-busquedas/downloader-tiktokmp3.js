import { evogbMediaUrl, evogbTikTokMp3, evogbUserError } from "../../../libs/downloads.js";
const doneCaption = (caption) => ["「◈」 *Descarga realizada*", caption?.trim()].filter(Boolean).join("\n\n");
const TIKTOK_REGEX = /(?:https?:\/\/)?(?:www\.|vm\.|vt\.|m\.)?tiktok\.com\/[^\s]+/i;
export default {
    name: "tiktokmp3", alias: ["ttmp3", "ttaudio"],
    description: "Descarga audio MP3 de TikTok.",
    category: "downloaders", using: "<link>", flags: ["all.chats"], requires: [], hidden: false,
    execute: async (wss, { mctx, args }) => {
        const url = args.join(" ").trim().match(TIKTOK_REGEX)?.[0] || "";
        if (!url) {
            await mctx.react("⚠️");
            await mctx.reply("「⚠」 Envía un link de TikTok.");
            return;
        }
        try {
            await mctx.react("🎧");
            const data = await evogbTikTokMp3(url);
            await wss.sendMessage(mctx.chat.jid, { audio: { url: evogbMediaUrl(data) }, mimetype: "audio/mpeg", fileName: String(data.fileName || data.filename || "tiktok.mp3") }, { quoted: mctx.message.original });
            await mctx.react("✅");
        }
        catch (e) {
            console.error("[tiktokmp3] Error:", e instanceof Error ? e.message : e);
            await mctx.react("❌");
            await mctx.reply(`「✖」 ${evogbUserError(e, "No se pudo realizar la descarga.")}`);
        }
    },
};
