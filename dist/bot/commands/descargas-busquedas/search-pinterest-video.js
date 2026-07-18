import { downloadPinterest, isPinterestUrl, searchPinterestMedia } from "../../../libs/downloads.js";
import { evogbLink, evogbMediaUrl, evogbSearchPinterestVideo, evogbTitle, evogbUserError } from "../../../libs/downloads.js";
const usage = () => "「⚠」 Escribe qué buscar o pega un link de Pinterest.";
const short = (v, max = 900) => v.length > max ? `${v.slice(0, max - 3)}...` : v;
const pickRandom = (list) => list.length ? list[Math.floor(Math.random() * list.length)] : undefined;
const downloadCaption = (c) => ["「◈」 *Descarga realizada*", c?.trim()].filter(Boolean).join("\n\n");
const searchCaption = (c) => ["「◈」 *Búsqueda realizada*", c?.trim()].filter(Boolean).join("\n\n");
const isVideoLike = (url) => /\.(mp4|mov|m4v|webm)(\?|#|$)/i.test(url) || /(?:v\d?\.pinimg\.com|pinimg\.com\/videos|video)/i.test(url);
export default {
    name: "pinvid",
    alias: ["pinterestvideo", "pinvideo", "pvideo"],
    description: "Busca videos de Pinterest o descarga desde link.",
    category: "downloaders",
    using: "<texto|link>",
    flags: ["all.chats"],
    requires: [],
    hidden: false,
    execute: async (wss, { mctx, args }) => {
        const query = args.join(" ").trim();
        if (!query) {
            await mctx.react("⚠️");
            await mctx.reply(usage());
            return;
        }
        if (isPinterestUrl(query)) {
            try {
                await mctx.react("⌛");
                const medias = await downloadPinterest(query);
                const media = medias.find((m) => m.type === "video");
                if (!media)
                    throw new Error("Sin video");
                await wss.sendMessage(mctx.chat.jid, { video: { url: media.url }, caption: downloadCaption(media.caption), mimetype: "video/mp4" }, { quoted: mctx.message.original });
                await mctx.react("✅");
            }
            catch (error) {
                console.error("[pinvid-link] Error:", error instanceof Error ? error.message : error);
                await mctx.react("❌");
                await mctx.reply("「✖」 No pude obtener el video de ese link.");
            }
            return;
        }
        await mctx.react("🔎");
        let evogbErr;
        try {
            const items = await evogbSearchPinterestVideo(query);
            const valid = items.filter((item) => {
                try {
                    const u = evogbMediaUrl(item) || evogbLink(item);
                    return Boolean(u && /^https?:\/\//i.test(u));
                }
                catch {
                    return false;
                }
            });
            const item = pickRandom(valid);
            if (!item)
                throw new Error("Sin videos");
            let mediaUrl = "";
            try {
                mediaUrl = evogbMediaUrl(item);
            }
            catch {
                mediaUrl = evogbLink(item);
            }
            const pageUrl = evogbLink(item);
            const cap = searchCaption(short(["「📌」 Pinterest Video", "", `✦ Título › ${evogbTitle(item, query)}`, pageUrl ? `✦ Link › ${pageUrl}` : ""].filter(Boolean).join("\n")));
            if (!mediaUrl || !isVideoLike(mediaUrl))
                throw new Error("No hay video directo");
            await wss.sendMessage(mctx.chat.jid, { video: { url: mediaUrl }, caption: cap, mimetype: "video/mp4" }, { quoted: mctx.message.original });
            await mctx.react("✅");
            return;
        }
        catch (e) {
            evogbErr = e;
            console.error("[pinvid] EVOGB falló:", e instanceof Error ? e.message : e);
        }
        try {
            const medias = await searchPinterestMedia(query);
            const media = pickRandom(medias.filter((m) => m.type === "video"));
            if (!media)
                throw new Error("Sin videos");
            await wss.sendMessage(mctx.chat.jid, { video: { url: media.url }, caption: searchCaption(media.caption), mimetype: "video/mp4" }, { quoted: mctx.message.original });
            await mctx.react("✅");
        }
        catch (e) {
            console.error("[pinvid] btch falló:", e instanceof Error ? e.message : e);
            await mctx.react("❌");
            await mctx.reply(`「✖」 ${evogbUserError(evogbErr, "No se pudo buscar el video.")}`);
        }
    },
};
