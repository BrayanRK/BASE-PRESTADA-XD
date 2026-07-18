import { dvyerApkModDl, dvyerMediaUrl, dvyerUserError, dvyerTitle } from "../../../libs/downloads.js";
const usage = () => "「⚠」 Escribe el nombre de la APK MOD.";
const doneCaption = (caption) => ["「◈」 *Descarga realizada*", caption?.trim()].filter(Boolean).join("\n\n");
const cleanFileName = (v, fb = "app.apk") => { const f = v.replace(/[^a-z0-9._-]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, ""); return f ? (f.endsWith(".apk") ? f : `${f}.apk`) : fb; };
export default {
    name: "apkmod",
    alias: ["apkmoddl", "modapk"],
    description: "Descarga APK MOD con enlace interno.",
    category: "downloaders",
    using: "<nombre>",
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
            const data = await dvyerApkModDl(query);
            const fileUrl = dvyerMediaUrl(data);
            const title = dvyerTitle(data, query);
            const size = data.size || data.sizeMb || data.sizeBytes;
            await wss.sendMessage(mctx.chat.jid, { document: { url: fileUrl }, fileName: cleanFileName(title), mimetype: "application/vnd.android.package-archive", caption: doneCaption(`✦ Nombre › ${title}${size ? `\n✦ Peso › ${size}` : ""}`) }, { quoted: mctx.message.original });
            await mctx.react("✅");
        }
        catch (error) {
            console.error("[apkmod] Error:", error instanceof Error ? error.message : error);
            await mctx.react("❌");
            await mctx.reply(`「✖」 ${dvyerUserError(error, "No se pudo realizar la descarga.")}`);
        }
    },
};
