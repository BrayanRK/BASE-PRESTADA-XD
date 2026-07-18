import { dvyerAppleMusic, dvyerAppleMusicSearch, dvyerMediaUrl, dvyerTitle, dvyerAuthor, dvyerLink, dvyerUserError } from "../../../libs/downloads.js";
const usage = () => "「⚠」 Envía un link o nombre de Apple Music.";
const isAppleMusicLink = (v) => /music\.apple\.com/i.test(v);
const doneCaption = (caption) => ["「◈」 *Descarga realizada*", caption?.trim()].filter(Boolean).join("\n\n");
export default {
    name: "applemusic",
    alias: ["applemusicdl", "amdl"],
    description: "Descarga MP3 de Apple Music dado su URL o nombre.",
    category: "downloaders",
    using: "<link | canción>",
    flags: ["all.chats"],
    requires: [],
    hidden: false,
    execute: async (wss, { mctx, args }) => {
        const input = args.join(" ").trim();
        if (!input) {
            await mctx.react("⚠️");
            await mctx.reply(usage());
            return;
        }
        let link = isAppleMusicLink(input) ? input : "";
        try {
            await mctx.react("🎵");
            if (!link) {
                const items = await dvyerAppleMusicSearch(input);
                const item = items[0];
                if (item)
                    link = dvyerLink(item);
            }
            if (!link) {
                await mctx.react("❌");
                await mctx.reply("「✖」 No encontré resultados.");
                return;
            }
            const data = await dvyerAppleMusic(link);
            const fileUrl = dvyerMediaUrl(data);
            const title = dvyerTitle(data, input);
            const author = dvyerAuthor(data, "");
            await wss.sendMessage(mctx.chat.jid, { audio: { url: fileUrl }, mimetype: "audio/mpeg", fileName: `${title}.mp3` }, { quoted: mctx.message.original });
            await mctx.reply(doneCaption(`✦ Título › ${title}${author ? `\n✦ Artista › ${author}` : ""}`));
            await mctx.react("✅");
        }
        catch (error) {
            console.error("[applemusic] Error:", error instanceof Error ? error.message : error);
            await mctx.react("❌");
            await mctx.reply(`「✖」 ${dvyerUserError(error, "No se pudo realizar la descarga.")}`);
        }
    },
};
