import { dvyerImageHD, dvyerMediaUrl, dvyerUserError, evogbMediaUrl, evogbUpscale, evogbUserError, findFirstUrl, } from "../../../libs/downloads.js";
import { downloadMediaBuffer } from "../../../libs/media.js";
const usage = () => "「⚠」 Responde a una imagen o envía una URL.";
const doneCaption = "「◈」 *Imagen mejorada*";
const uploadBuffer = async (buffer, mimetype) => {
    const mime = mimetype || "image/jpeg";
    const ext = mime.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "jpg";
    const blob = new Blob([buffer], { type: mime });
    const form = new FormData();
    form.set("file", blob, `image.${ext}`);
    const res = await fetch("https://tmpfiles.org/api/v1/upload", {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(60_000),
    });
    const text = await res.text();
    let json;
    try {
        json = JSON.parse(text);
    }
    catch {
        throw new Error(`tmpfiles no-JSON: ${text.slice(0, 100)}`);
    }
    const raw = json?.data?.url || json?.url || "";
    if (!raw)
        throw new Error(`tmpfiles sin URL: ${text.slice(0, 150)}`);
    return raw.replace("tmpfiles.org/", "tmpfiles.org/dl/");
};
const getImageUrl = async (mctx, argsText) => {
    const directUrl = findFirstUrl(argsText) ||
        findFirstUrl(mctx.quoted?.message?.text || "") ||
        findFirstUrl(mctx.message.text || "");
    if (directUrl)
        return directUrl;
    const source = mctx.quoted?.download ? mctx.quoted : mctx.download ? mctx : null;
    if (!source?.download)
        throw new Error("Sin imagen");
    const mimetype = source.message.mimetype || "";
    if (mimetype && !/^image\//i.test(mimetype))
        throw new Error("No es imagen");
    const buffer = await downloadMediaBuffer(source, "imagen");
    if (!buffer?.length)
        throw new Error("No se pudo descargar la imagen");
    return uploadBuffer(buffer, mimetype);
};
export default {
    name: "hd",
    alias: ["imagehd", "imghd", "upscale", "upscaledv", "mejorar", "remini"],
    description: "Mejora y escala una imagen a mayor resolución.",
    category: "utilities",
    using: "<url | responder imagen>",
    flags: ["all.chats"],
    requires: [],
    hidden: false,
    execute: async (wss, { mctx, args }) => {
        let inputUrl;
        try {
            inputUrl = await getImageUrl(mctx, args.join(" ").trim());
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : "";
            if (msg === "Sin imagen" || msg === "No es imagen") {
                await mctx.react("⚠️");
                await mctx.reply(usage());
            }
            else {
                console.error("[hd] upload falló:", msg);
                await mctx.react("❌");
                await mctx.reply("「✖」 No se pudo subir la imagen. Intenta con una URL directa.");
            }
            return;
        }
        await mctx.react("🖼️");
        let err1;
        try {
            const data = await dvyerImageHD(inputUrl, 2, "auto");
            const imageUrl = dvyerMediaUrl(data);
            await wss.sendMessage(mctx.chat.jid, { image: { url: imageUrl }, caption: doneCaption }, { quoted: mctx.message.original });
            await mctx.react("✅");
            return;
        }
        catch (e) {
            err1 = e;
            console.error("[hd] DV-YER falló:", e instanceof Error ? e.message : e);
        }
        try {
            const data = await evogbUpscale(inputUrl);
            const imageUrl = evogbMediaUrl(data);
            await wss.sendMessage(mctx.chat.jid, { image: { url: imageUrl }, caption: doneCaption }, { quoted: mctx.message.original });
            await mctx.react("✅");
        }
        catch (e) {
            console.error("[hd] EVOGB falló:", e instanceof Error ? e.message : e);
            await mctx.react("❌");
            const m1 = dvyerUserError(err1, "");
            const m2 = evogbUserError(e, "No se pudo mejorar la imagen.");
            await mctx.reply(`「✖」 ${m1 && m1 !== m2 ? `${m1} / ${m2}` : m2}`);
        }
    },
};
