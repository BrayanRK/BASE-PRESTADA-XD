import { downloadYouTube, extractYoutubeId, resolveYoutubeInfo, sendYoutubeInfoCard, dvyerYtMp4, dvyerMediaUrl, dvyerUserError, evogbYtMp4, evogbMediaUrl, evogbUserError, verifyMediaUrl } from "../../../libs/downloads.js";
const isYoutubeLink = (t) => Boolean(extractYoutubeId(t));
const HEDGE_DELAY_MS = 4000;
class HedgeTimeout extends Error {
}
export default {
    name: "ytmp4", alias: ["ytvideo", "ytv"],
    description: "Descarga video MP4 usando link de YouTube.",
    category: "downloaders", using: "<link>", flags: ["all.chats"], requires: [], hidden: false,
    execute: async (wss, { mctx, args }) => {
        const url = args.join(" ").trim();
        if (!url || !isYoutubeLink(url)) {
            await mctx.react("⚠️");
            await mctx.reply("「⚠」 Envía un link de YouTube válido.");
            return;
        }
        let video = null;
        try {
            await mctx.react("🔎");
            video = await resolveYoutubeInfo(url);
            await sendYoutubeInfoCard(wss, mctx, video, "video");
        }
        catch { }
        if (!video) {
            try {
                video = await resolveYoutubeInfo(url);
            }
            catch {
                await mctx.react("❌");
                await mctx.reply("「✖」 No se pudo procesar ese link.");
                return;
            }
        }
        await mctx.react("🎬");
        let dvyerErr, evogbErr;
        const dvyerTask = (async () => {
            try {
                const data = await dvyerYtMp4(video.url, "720");
                const mediaUrl = dvyerMediaUrl(data);
                await verifyMediaUrl(mediaUrl);
                return { provider: "DV-YER", mediaUrl, fileName: String(data.fileName || data.filename || "video.mp4") };
            }
            catch (e) {
                dvyerErr = e;
                throw e;
            }
        })();
        const runEvogb = () => (async () => {
            try {
                const data = await evogbYtMp4(video.url, "720");
                const mediaUrl = evogbMediaUrl(data);
                await verifyMediaUrl(mediaUrl);
                return { provider: "EVOGB", mediaUrl, fileName: String(data.fileName || data.filename || "video.mp4") };
            }
            catch (e) {
                evogbErr = e;
                throw e;
            }
        })();
        let won = null;
        try {
            won = await Promise.race([dvyerTask, new Promise((_, reject) => setTimeout(() => reject(new HedgeTimeout()), HEDGE_DELAY_MS))]);
        }
        catch (e) {
            try {
                won = e instanceof HedgeTimeout ? await Promise.any([dvyerTask, runEvogb()]) : await runEvogb();
            }
            catch { /* ambas fallaron, sigue al fallback local */ }
        }
        if (won) {
            await wss.sendMessage(mctx.chat.jid, { video: { url: won.mediaUrl }, mimetype: "video/mp4", fileName: won.fileName, caption: `by: ${won.provider}` }, { quoted: mctx.message.original });
            await mctx.react("✅");
            return;
        }
        console.error("[ytmp4] DV-YER/EVOGB fallaron:", dvyerErr instanceof Error ? dvyerErr.message : dvyerErr, "|", evogbErr instanceof Error ? evogbErr.message : evogbErr);
        try {
            const r = await downloadYouTube(video, "video");
            await wss.sendMessage(mctx.chat.jid, { video: r.buffer, mimetype: r.mime || "video/mp4", fileName: `${r.filename}${r.ext || ".mp4"}`, caption: "by: Local" }, { quoted: mctx.message.original });
            await mctx.react("✅");
        }
        catch (e) {
            console.error("[ytmp4] local falló:", e instanceof Error ? e.message : e);
            await mctx.react("❌");
            await mctx.reply(`「✖」 ${dvyerUserError(dvyerErr, evogbUserError(evogbErr, "No se pudo realizar la descarga."))}`);
        }
    },
};
