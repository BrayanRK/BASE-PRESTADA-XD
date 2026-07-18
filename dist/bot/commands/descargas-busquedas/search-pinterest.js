import { downloadPinterest, isPinterestUrl, searchPinterestMedia } from "../../../libs/downloads.js";
import { evogbLink, evogbSearchPinterest, evogbThumb, evogbTitle, evogbUserError } from "../../../libs/downloads.js";
const usage = () => "「⚠」 Escribe qué buscar o pega un link de Pinterest.";
const isUrl = (v) => typeof v === "string" && /^https?:\/\//i.test(v.trim());
const looksImage = (url) => /\.(jpg|jpeg|png|webp|gif)(\?|#|$)/i.test(url) || /pinimg\.com/i.test(url);
const looksBad = (url) => /(?:logo|favicon|avatar|ads?|static\/img|pinterest\.com\/pinimg)/i.test(url);
const pickRandom = (list) => list.length ? list[Math.floor(Math.random() * list.length)] : undefined;
const downloadCaption = (c) => ["「◈」 *Descarga realizada*", c?.trim()].filter(Boolean).join("\n\n");
const searchCaption = (c) => ["「◈」 *Búsqueda realizada*", c?.trim()].filter(Boolean).join("\n\n");
const pickEvogbImage = (item) => {
    const candidates = [evogbThumb(item), item?.image, item?.imageUrl, item?.thumbnail, item?.url, item?.link].filter(isUrl);
    return candidates.find((u) => looksImage(u) && !looksBad(u)) || candidates.find((u) => !looksBad(u)) || "";
};
export default {
    name: "pinterest",
    alias: ["pin", "pinsearch"],
    description: "Busca imágenes de Pinterest o descarga desde link.",
    category: "downloaders",
    using: "<texto|link>",
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
        if (isPinterestUrl(query)) {
            try {
                await mctx.react("⌛");
                const medias = await downloadPinterest(query);
                const media = medias.find((m) => m.type === "image" || m.type === "gif") || medias[0];
                if (!media)
                    throw new Error("Sin media");
                await wss.sendMessage(mctx.chat.jid, media.type === "video"
                    ? { video: { url: media.url }, caption: downloadCaption(media.caption), mimetype: "video/mp4" }
                    : { image: { url: media.url }, caption: downloadCaption(media.caption) }, { quoted: mctx.message.original });
                await mctx.react("✅");
            }
            catch (error) {
                console.error("[pin-link] Error:", error instanceof Error ? error.message : error);
                await mctx.react("❌");
                await mctx.reply("「✖」 No pude obtener la imagen de ese link.");
            }
            return;
        }
        await mctx.react("🔎");
        let evogbErr;
        try {
            const items = await evogbSearchPinterest(query);
            const valid = items.filter((i) => pickEvogbImage(i));
            const item = pickRandom(valid);
            if (!item)
                throw new Error("Sin imágenes EVOGB");
            const image = pickEvogbImage(item);
            const title = evogbTitle(item, query);
            const link = evogbLink(item);
            const cap = searchCaption([title, link && link !== image ? `Link: ${link}` : ""].filter(Boolean).join("\n"));
            await wss.sendMessage(mctx.chat.jid, { image: { url: image }, caption: cap }, { quoted: mctx.message.original });
            await mctx.react("✅");
            return;
        }
        catch (e) {
            evogbErr = e;
            console.error("[pinterest] EVOGB falló:", e instanceof Error ? e.message : e);
        }
        try {
            const medias = await searchPinterestMedia(query);
            const media = pickRandom(medias.filter((m) => m.type === "image" || m.type === "gif")) || pickRandom(medias);
            if (!media)
                throw new Error("Sin imágenes");
            await wss.sendMessage(mctx.chat.jid, media.type === "video"
                ? { video: { url: media.url }, caption: searchCaption(media.caption), mimetype: "video/mp4" }
                : { image: { url: media.url }, caption: searchCaption(media.caption) }, { quoted: mctx.message.original });
            await mctx.react("✅");
        }
        catch (e) {
            console.error("[pinterest] btch falló:", e instanceof Error ? e.message : e);
            await mctx.react("❌");
            await mctx.reply(`「✖」 ${evogbUserError(evogbErr, "No encontré imágenes de Pinterest.")}`);
        }
    },
};
