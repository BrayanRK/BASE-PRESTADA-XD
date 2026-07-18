import { dvyerImageCompress, dvyerMediaUrl, dvyerUserError, evogbMediaUrl, evogbUpload, findFirstUrl, toDataUrl } from "../../../libs/downloads.js";
const usage = () => "「⚠」 Responde a una imagen o envía una URL.";
const getImageUrl = async (mctx, argsText) => {
    const directUrl = findFirstUrl(argsText) || findFirstUrl(mctx.quoted?.message?.text || "") || findFirstUrl(mctx.message.text || "");
    if (directUrl)
        return directUrl;
    const source = mctx.quoted?.download ? mctx.quoted : mctx.download ? mctx : null;
    if (!source?.download)
        throw new Error("Sin imagen");
    const mimetype = source.message.mimetype || "";
    if (mimetype && !/^image\//i.test(mimetype))
        throw new Error("No es imagen");
    const buffer = await source.download().buffer();
    if (!buffer?.length)
        throw new Error("No se pudo descargar la imagen");
    const uploaded = await evogbUpload(toDataUrl(buffer, mimetype || "image/jpeg"), "auto", "file");
    return evogbMediaUrl(uploaded);
};
export default {
    name: "imagecompress",
    alias: ["imgcompress", "comprimir"],
    description: "Comprime una imagen para reducir su peso.",
    category: "utilities",
    using: "<url | responder imagen>",
    flags: ["all.chats"],
    requires: [],
    hidden: false,
    execute: async (wss, { mctx, args }) => {
        try {
            const inputUrl = await getImageUrl(mctx, args.join(" ").trim()).catch(() => "");
            if (!inputUrl) {
                await mctx.react("⚠️");
                await mctx.reply(usage());
                return;
            }
            await mctx.react("🗜️");
            const data = await dvyerImageCompress(inputUrl);
            const fileUrl = dvyerMediaUrl(data);
            const size = data.size || data.sizeMb || data.sizeBytes;
            await wss.sendMessage(mctx.chat.jid, { image: { url: fileUrl }, caption: ["「◈」 *Imagen comprimida*", size ? `✦ Peso › ${size}` : ""].filter(Boolean).join("\n") }, { quoted: mctx.message.original });
            await mctx.react("✅");
        }
        catch (error) {
            console.error("[imagecompress] Error:", error instanceof Error ? error.message : error);
            await mctx.react("❌");
            await mctx.reply(`「✖」 ${dvyerUserError(error, "No se pudo comprimir la imagen.")}`);
        }
    },
};
