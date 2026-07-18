import { dvyerWindows, dvyerMediaUrl, dvyerUserError, dvyerTitle } from "../../../libs/downloads.js";
const usage = () => "「⚠」 Escribe el nombre o URL del programa.";
const doneCaption = (caption) => ["「◈」 *Descarga realizada*", caption?.trim()].filter(Boolean).join("\n\n");
export default {
    name: "windl",
    alias: [],
    description: "Descarga software para Windows dado su nombre o URL.",
    category: "downloaders",
    using: "<nombre | url>",
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
        try {
            await mctx.react("⌛");
            const data = await dvyerWindows(query);
            const fileUrl = dvyerMediaUrl(data);
            const title = dvyerTitle(data, query);
            const size = data.size || data.sizeMb || data.sizeBytes;
            await wss.sendMessage(mctx.chat.jid, { document: { url: fileUrl }, fileName: String(data.fileName || data.filename || `${title}.exe`), mimetype: String(data.mimetype || "application/octet-stream"), caption: doneCaption(`✦ Nombre › ${title}${size ? `\n✦ Peso › ${size}` : ""}`) }, { quoted: mctx.message.original });
            await mctx.react("✅");
        }
        catch (error) {
            console.error("[windl] Error:", error instanceof Error ? error.message : error);
            await mctx.react("❌");
            await mctx.reply(`「✖」 ${dvyerUserError(error, "No se pudo realizar la descarga.")}`);
        }
    },
};
