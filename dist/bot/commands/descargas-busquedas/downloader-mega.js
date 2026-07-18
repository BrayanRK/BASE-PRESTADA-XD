import { dvyerMega, dvyerMediaUrl, dvyerUserError } from "../../../libs/downloads.js";
const usage = () => "「⚠」 Envía un link de MEGA.";
const isLink = (text) => /https?:\/\//i.test(text);
const doneCaption = (caption) => ["「◈」 *Descarga realizada*", caption?.trim()].filter(Boolean).join("\n\n");
export default {
    name: "mega",
    alias: [],
    description: "Descarga archivos directos desde MEGA.",
    category: "downloaders",
    using: "<link>",
    flags: ["all.chats"],
    requires: [],
    hidden: false,
    execute: async (wss, { mctx, args }) => {
        const url = args.join(" ").trim();
        if (!url || !isLink(url)) {
            await mctx.react("⚠️");
            await mctx.reply(usage());
            return;
        }
        try {
            await mctx.react("⌛");
            const data = await dvyerMega(url);
            const fileUrl = dvyerMediaUrl(data);
            const name = String(data.fileName || data.filename || data.title || "archivo");
            const size = data.size || data.sizeMb || data.sizeBytes;
            await wss.sendMessage(mctx.chat.jid, { document: { url: fileUrl }, fileName: name, mimetype: String(data.mimetype || "application/octet-stream"), caption: doneCaption(`✦ Nombre › ${name}${size ? `\n✦ Peso › ${size}` : ""}`) }, { quoted: mctx.message.original });
            await mctx.react("✅");
        }
        catch (error) {
            console.error("[mega] Error:", error instanceof Error ? error.message : error);
            await mctx.react("❌");
            await mctx.reply(`「✖」 ${dvyerUserError(error, "No se pudo realizar la descarga.")}`);
        }
    },
};
