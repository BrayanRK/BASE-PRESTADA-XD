import { downloadInstagram, isInstagramUrl, dvyerInstagram, dvyerMediaUrl } from "../../../libs/downloads.js";
const busy = new Set();
const doneCaption = (caption) => {
    const trimmed = caption?.trim();
    if (!trimmed)
        return "「◈」 *Descarga realizada*";
    return trimmed.startsWith("「◈」")
        ? trimmed
        : ["「◈」 *Descarga realizada*", trimmed].filter(Boolean).join("\n\n");
};
export default {
    name: "instagram", alias: ["ig", "igdl", "instagramdl", "instagram2", "ig2", "igdl2"],
    description: "Descarga videos o imágenes de Instagram.",
    category: "downloaders", using: "<link>", flags: ["all.chats"], requires: [], hidden: false,
    execute: async (wss, { mctx, args }) => {
        const url = args[0]?.trim();
        if (!url || !isInstagramUrl(url)) {
            await mctx.react("⚠️");
            await mctx.reply("「⚠」 Envía un link.");
            return;
        }
        if (busy.has(mctx.sender.jid)) {
            await mctx.reply("「☊」 Descarga en proceso, espera a que termine.");
            return;
        }
        busy.add(mctx.sender.jid);
        try {
            await mctx.react("⌛");
            try {
                const medias = await downloadInstagram(url);
                const media = medias[0];
                if (media) {
                    await wss.sendMessage(mctx.chat.jid, media.type === "video" ? { video: media.buffer || { url: media.url }, caption: doneCaption(media.caption), fileName: media.fileName, mimetype: media.mime || "video/mp4" } : { image: media.buffer || { url: media.url }, caption: doneCaption(media.caption), mimetype: media.mime || "image/jpeg" }, { quoted: mctx.message.original });
                    await mctx.react("✅");
                    return;
                }
            }
            catch (e) {
                console.error("[instagram] Local falló:", e instanceof Error ? e.message : e);
            }
            try {
                const data = await dvyerInstagram(url);
                const mediaUrl = dvyerMediaUrl(data);
                const isVideo = /\.(mp4|webm|mov)([\?#]|$)/i.test(mediaUrl) || String(data.type).includes("video");
                await wss.sendMessage(mctx.chat.jid, isVideo ? { video: { url: mediaUrl }, caption: doneCaption(), mimetype: "video/mp4" } : { image: { url: mediaUrl }, caption: doneCaption(), mimetype: "image/jpeg" }, { quoted: mctx.message.original });
                await mctx.react("✅");
                return;
            }
            catch (e) {
                console.error("[instagram] DV-YER falló:", e instanceof Error ? e.message : e);
            }
        }
        catch (e) {
            console.error("[instagram] Error:", e);
            await mctx.react("❌");
            await mctx.reply("「✖」 No se pudo realizar la descarga.");
        }
        finally {
            busy.delete(mctx.sender.jid);
        }
    },
};
