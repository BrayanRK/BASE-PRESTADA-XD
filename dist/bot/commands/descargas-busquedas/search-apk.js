import { dvyerApkSearch, dvyerTitle, dvyerAuthor, dvyerSize, dvyerThumb, dvyerLink, dvyerUserError, evogbSearchApk, evogbTitle, evogbAuthor, evogbSize, evogbThumb, evogbLink, evogbUserError } from "../../../libs/downloads.js";
const clean = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const cleanFileName = (v, fb = "app.apk") => { const f = v.replace(/[^a-z0-9._-]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, ""); return f ? (f.endsWith(".apk") ? f : `${f}.apk`) : fb; };
const searchCaption = (caption) => ["「◈」 *Búsqueda realizada*", caption?.trim()].filter(Boolean).join("\n\n");
const resultCaption = (title, dev, size, pkg, updated, link) => searchCaption(["「📦」 APK encontrada", "", `✦ Nombre › ${title}`, dev && `✦ Dev › ${dev}`, pkg && `✦ Paquete › ${pkg}`, size && `✦ Tamaño › ${size}`, updated && `✦ Actualizado › ${updated}`, link && `✦ Link › ${link}`].filter(Boolean).join("\n"));
const sendApk = async (wss, mctx, item, getTitle, getDev, getSize, getLink, getThumb) => {
    const title = getTitle(item);
    const dev = getDev(item);
    const size = getSize(item);
    const pkg = clean(item?.package || item?.packageName || "");
    const updated = clean(item?.lastUpdated || item?.updated || "");
    const link = getLink(item);
    const caption = resultCaption(title, dev, size, pkg, updated, link);
    const fileName = cleanFileName(pkg || title);
    if (link && /\.apk(?:\?|#|$)/i.test(link)) {
        await wss.sendMessage(mctx.chat.jid, { document: { url: link }, fileName, mimetype: "application/vnd.android.package-archive", caption }, { quoted: mctx.message.original });
    }
    else {
        const thumb = getThumb(item);
        if (thumb && /^https?:\/\//i.test(thumb)) {
            await wss.sendMessage(mctx.chat.jid, { image: { url: thumb }, caption }, { quoted: mctx.message.original });
        }
        else {
            await mctx.reply(caption);
        }
    }
};
export default {
    name: "apksearch", alias: ["apk", "buscarapk"],
    description: "Busca y descarga archivos APK.",
    category: "downloaders", using: "<nombre>", flags: ["all.chats"], requires: [], hidden: false,
    execute: async (wss, { mctx, args }) => {
        const query = args.join(" ").trim();
        if (!query) {
            await mctx.react("⚠️");
            await mctx.reply("「⚠」 Escribe el nombre de la APK.");
            return;
        }
        try {
            await mctx.react("🔎");
            const pickRandom = (list) => list.length ? list[Math.floor(Math.random() * list.length)] : undefined;
            try {
                const items = await dvyerApkSearch(query);
                const item = pickRandom(items.slice(0, 10));
                if (item) {
                    await sendApk(wss, mctx, item, dvyerTitle, dvyerAuthor, dvyerSize, dvyerLink, dvyerThumb);
                    await mctx.react("✅");
                    return;
                }
            }
            catch (e) {
                console.error("[apksearch] DV-YER falló:", e instanceof Error ? e.message : e);
            }
            const items = await evogbSearchApk(query);
            const item = pickRandom(items.slice(0, 10));
            if (!item) {
                await mctx.react("❌");
                await mctx.reply("「✖」 No encontré resultados.");
                return;
            }
            await sendApk(wss, mctx, item, evogbTitle, evogbAuthor, evogbSize, evogbLink, evogbThumb);
            await mctx.react("✅");
        }
        catch (e) {
            console.error("[apksearch] Error:", e instanceof Error ? e.message : e);
            await mctx.react("❌");
            await mctx.reply(`「✖」 ${dvyerUserError(e, evogbUserError(e, "No se pudo realizar la búsqueda."))}`);
        }
    },
};
