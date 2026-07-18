import { dvyerImageConvert, dvyerMediaUrl, dvyerUserError, evogbMediaUrl, evogbUpload, findFirstUrl, toDataUrl } from "../../../libs/downloads.js";
const usage = () => "「⚠」 Responde a una imagen o envía una URL y formato. Ej: .imgconvert webp";
const ALLOWED = ["png", "jpg", "jpeg", "webp", "gif", "bmp", "tiff", "avif"];
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
    name: "imageconvert",
    alias: ["imgconvert", "convertimg"],
    description: "Convierte una imagen a otro formato.",
    category: "utilities",
    using: "<formato> <url | responder imagen>",
    flags: ["all.chats"],
    requires: [],
    hidden: false,
    execute: async (wss, { mctx, args }) => {
        try {
            const format = (args.find((a) => ALLOWED.includes(a.toLowerCase())) || "png").toLowerCase();
            const rest = args.filter((a) => a.toLowerCase() !== format).join(" ").trim();
            const inputUrl = await getImageUrl(mctx, rest).catch(() => "");
            if (!inputUrl) {
                await mctx.react("⚠️");
                await mctx.reply(usage());
                return;
            }
            await mctx.react("🖼️");
            const data = await dvyerImageConvert(inputUrl, format);
            const fileUrl = dvyerMediaUrl(data);
            await wss.sendMessage(mctx.chat.jid, { document: { url: fileUrl }, fileName: `converted.${format}`, mimetype: `image/${format === "jpg" ? "jpeg" : format}`, caption: "「◈」 *Imagen convertida*" }, { quoted: mctx.message.original });
            await mctx.react("✅");
        }
        catch (error) {
            console.error("[imageconvert] Error:", error instanceof Error ? error.message : error);
            await mctx.react("❌");
            await mctx.reply(`「✖」 ${dvyerUserError(error, "No se pudo convertir la imagen.")}`);
        }
    },
};
