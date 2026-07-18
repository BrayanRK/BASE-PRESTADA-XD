import { searchTikTokVideos } from "../../../libs/downloads.js";
import { evogbLink, evogbSearchTikTok, evogbUserError, dvyerTikTokSearch, dvyerLink } from "../../../libs/downloads.js";
const busy = new Set();
const doneText = "「◈」 *Búsqueda realizada*";
const pickRandom = (list) => list.length ? list[Math.floor(Math.random() * list.length)] : undefined;
const isVideoUrl = (url) => !!url && /^https?:\/\//i.test(url) && /\.(mp4|webm)(\?|#|$)/i.test(url);
export default {
    name: "tiktoksearch",
    alias: ["ttsearch", "buscariktok", "tiktokbuscar"],
    description: "Busca un video aleatorio de TikTok por texto.",
    category: "downloaders",
    using: "<texto>",
    flags: ["all.chats"],
    requires: [],
    hidden: false,
    execute: async (wss, { mctx, args }) => {
        const query = args.join(" ").trim();
        if (!query) {
            await mctx.react("⚠️");
            await mctx.reply("「⚠」 Escribe qué buscar.");
            return;
        }
        if (busy.has(mctx.sender.jid)) {
            await mctx.reply("「♬」 Búsqueda en proceso.");
            return;
        }
        busy.add(mctx.sender.jid);
        try {
            await mctx.react("⏳");
            const [dvyerResult, evogbResult] = await Promise.allSettled([
                dvyerTikTokSearch(query).then((items) => items.map((i) => dvyerLink(i)).filter(isVideoUrl)),
                evogbSearchTikTok(query).then((items) => items.map((i) => evogbLink(i)).filter(isVideoUrl)),
            ]);
            const dvyerVideos = dvyerResult.status === "fulfilled" ? dvyerResult.value : [];
            const evogbVideos = evogbResult.status === "fulfilled" ? evogbResult.value : [];
            const allVideos = [...dvyerVideos, ...evogbVideos];
            const video = pickRandom(allVideos.slice(0, 15));
            if (video) {
                await wss.sendMessage(mctx.chat.jid, { video: { url: video }, caption: doneText, mimetype: "video/mp4" }, { quoted: mctx.message.original });
                await mctx.react("✅");
                return;
            }
            const medias = await searchTikTokVideos(query);
            const media = pickRandom(medias.slice(0, 10));
            if (!media?.url)
                throw new Error("Sin resultados");
            await wss.sendMessage(mctx.chat.jid, { video: { url: media.url }, caption: doneText, mimetype: "video/mp4" }, { quoted: mctx.message.original });
            await mctx.react("✅");
        }
        catch (error) {
            console.error("[tiktoksearch] Error:", error);
            await mctx.react("❌");
            await mctx.reply(`「✖」 ${evogbUserError(error, "No se pudo realizar la búsqueda.")}`);
        }
        finally {
            busy.delete(mctx.sender.jid);
        }
    },
};
