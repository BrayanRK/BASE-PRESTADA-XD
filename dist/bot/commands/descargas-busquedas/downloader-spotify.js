import { downloadYouTube, resolveYoutubeInfo, dvyerSpotify, dvyerSpotifySearch, dvyerMediaUrl, dvyerTitle, dvyerAuthor, dvyerLink, dvyerUserError, evogbSpotifyDl, evogbSearchSpotify, evogbMediaUrl, evogbTitle, evogbAuthor, evogbLink, evogbUserError } from "../../../libs/downloads.js";
const s = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const isSpotifyLink = (v) => /spotify\.com/i.test(v);
const mkCaption = (title, artist, album, url) => ["「🎧」 Spotify DL", "", `✦ Título › ${title}`, `✦ Artista › ${artist}`, album && `✦ Álbum › ${album}`, url && `✦ Spotify › ${url}`].filter(Boolean).join("\n").slice(0, 1000);
export default {
    name: "spotify", alias: ["sp", "sfydl", "spdl"],
    description: "Busca por nombre o descarga audio desde link de Spotify.",
    category: "downloaders", using: "<link | canción>", flags: ["all.chats"], requires: [], hidden: false,
    execute: async (wss, { mctx, args }) => {
        const input = args.join(" ").trim() || mctx.quoted?.message?.text || "";
        if (!input) {
            await mctx.react("⚠️");
            await mctx.reply("「⚠」 Escribe un link o nombre de Spotify.");
            return;
        }
        let spotifyLink = isSpotifyLink(input) ? input : "";
        let ytQuery = input;
        let err1, err2;
        await mctx.react("🎧");
        try {
            const tracks = await dvyerSpotifySearch(input);
            const t = tracks[0];
            if (t) {
                spotifyLink = dvyerLink(t) || spotifyLink;
                ytQuery = `${dvyerTitle(t)} ${dvyerAuthor(t, "")}`.trim() || input;
            }
        }
        catch (e) {
            err1 = e;
        }
        if (spotifyLink) {
            try {
                const data = await dvyerSpotify(spotifyLink);
                await wss.sendMessage(mctx.chat.jid, { audio: { url: dvyerMediaUrl(data) }, mimetype: "audio/mpeg", fileName: `${s(data.title) || "spotify"}.mp3` }, { quoted: mctx.message.original });
                await mctx.react("✅");
                return;
            }
            catch (e) {
                err1 = e;
                console.error("[spotify] DV-YER dl falló:", e instanceof Error ? e.message : e);
            }
        }
        try {
            const tracks = await evogbSearchSpotify(input);
            const t = tracks[0];
            if (t) {
                spotifyLink = evogbLink(t) || spotifyLink;
                ytQuery = `${evogbTitle(t)} ${evogbAuthor(t, "")}`.trim() || input;
            }
        }
        catch (e) {
            err2 = e;
        }
        if (spotifyLink) {
            try {
                const data = await evogbSpotifyDl(spotifyLink);
                await wss.sendMessage(mctx.chat.jid, { audio: { url: evogbMediaUrl(data) }, mimetype: "audio/mpeg", fileName: String(data.fileName || data.filename || `${s(ytQuery)}.mp3`) }, { quoted: mctx.message.original });
                await mctx.react("✅");
                return;
            }
            catch (e) {
                err2 = e;
                console.error("[spotify] EVOGB dl falló:", e instanceof Error ? e.message : e);
            }
        }
        try {
            const video = await resolveYoutubeInfo(`${ytQuery} audio`);
            const r = await downloadYouTube(video, "audio");
            await wss.sendMessage(mctx.chat.jid, { audio: r.buffer, mimetype: r.mime || "audio/mpeg", fileName: `${r.filename}${r.ext || ".mp3"}` }, { quoted: mctx.message.original });
            await mctx.react("✅");
        }
        catch (e) {
            await mctx.react("❌");
            await mctx.reply(`「✖」 ${dvyerUserError(err1, evogbUserError(err2, "No se pudo realizar la descarga."))}`);
        }
    },
};
