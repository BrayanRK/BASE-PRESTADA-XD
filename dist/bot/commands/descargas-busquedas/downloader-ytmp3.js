import { downloadYouTube, extractYoutubeId, resolveYoutubeInfo, sendYoutubeInfoCard, dvyerYtMp3, dvyerAudioFile, dvyerUserError, evogbYtMp3, evogbMediaUrl, evogbUserError } from "../../../libs/downloads.js";
const isYoutubeLink = (t) => Boolean(extractYoutubeId(t));
export default {
    name: "ytmp3", alias: [],
    description: "Descarga audio MP3 usando link de YouTube.",
    category: "downloaders", using: "<link>", flags: ["all.chats"], requires: [], hidden: false,
    execute: async (wss, { mctx, args }) => {
        const url = args.join(" ").trim();
        if (!url || !isYoutubeLink(url)) {
            await mctx.react("⚠️");
            await mctx.reply("「⚠」 Envía un link de YouTube válido.");
            return;
        }
        let video = null;
        let err1, err2;
        try {
            await mctx.react("🔎");
            video = await resolveYoutubeInfo(url);
            await sendYoutubeInfoCard(wss, mctx, video, "audio");
        }
        catch { }
        try {
            await mctx.react("🎧");
            if (!video)
                video = await resolveYoutubeInfo(url);
            const data = await dvyerYtMp3(video.url);
            const audio = dvyerAudioFile(data, "audio");
            await wss.sendMessage(mctx.chat.jid, { audio: { url: audio.mediaUrl }, mimetype: audio.mimetype, fileName: audio.fileName }, { quoted: mctx.message.original });
            await mctx.react("✅");
            return;
        }
        catch (e) {
            err1 = e;
            console.error("[ytmp3] DV-YER falló:", e instanceof Error ? e.message : e);
        }
        try {
            if (!video)
                video = await resolveYoutubeInfo(url);
            const data = await evogbYtMp3(video.url);
            await wss.sendMessage(mctx.chat.jid, { audio: { url: evogbMediaUrl(data) }, mimetype: "audio/mpeg", fileName: String(data.fileName || data.filename || "audio.mp3") }, { quoted: mctx.message.original });
            await mctx.react("✅");
            return;
        }
        catch (e) {
            err2 = e;
            console.error("[ytmp3] EVOGB falló:", e instanceof Error ? e.message : e);
        }
        try {
            if (!video)
                video = await resolveYoutubeInfo(url);
            const r = await downloadYouTube(video, "audio");
            await wss.sendMessage(mctx.chat.jid, { audio: r.buffer, mimetype: r.mime || "audio/mpeg", fileName: `${r.filename}${r.ext || ".mp3"}` }, { quoted: mctx.message.original });
            await mctx.react("✅");
        }
        catch (e) {
            console.error("[ytmp3] local falló:", e instanceof Error ? e.message : e);
            await mctx.react("❌");
            await mctx.reply(`「✖」 ${dvyerUserError(err1, evogbUserError(err2, "No se pudo realizar la descarga."))}`);
        }
    },
};
