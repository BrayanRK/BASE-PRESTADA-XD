import { googleImageSearch } from "../../../libs/downloads.js";
import { dvyerGet, evogbSearchPinterest, evogbThumb } from "../../../libs/downloads.js";
import axios from "axios";
const forbidden = ["porno", "porn", "gore", "cum", "semen", "hentai", "desnudo", "desnuda", "muertos", "pornhub", "xnxx", "xvideos", "xxx", "rule34", "pedofilia", "necrofilia", "nsfw", "ahegao", "zoofilia", "cp"];
const usage = () => "「⚠」 Escribe qué buscar.";
const isUrl = (v) => typeof v === "string" && /^https?:\/\//i.test(v.trim());
const pickRandom = (list) => list.length ? list[Math.floor(Math.random() * list.length)] : undefined;
const caption = (q) => `「◈」 *Búsqueda de imagen*\n\n${q}`;
const searchDvyerImage = async (query) => {
    try {
        const data = await dvyerGet("/search/images", { query });
        const list = Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : Array.isArray(data?.data) ? data.data : [];
        const urls = list.map((i) => i?.url || i?.image || i?.link || "").filter(isUrl);
        const pick = pickRandom(urls);
        if (pick && typeof pick === 'string')
            return pick;
        return "";
    }
    catch {
        return "";
    }
};
const searchFallbackImage = async (query) => {
    try {
        const { data } = await axios.get(`https://api.alyachan.dev/api/imagesearch?q=${encodeURIComponent(query)}&apikey=Gata-Dios`, { timeout: 20_000 });
        const list = Array.isArray(data?.data) ? data.data : [];
        const urls = list.map((i) => i?.url || i?.image || "").filter(isUrl);
        const pick = pickRandom(urls);
        if (pick && typeof pick === 'string')
            return pick;
    }
    catch { }
    return "";
};
const searchEvogbImage = async (query) => {
    try {
        const items = await evogbSearchPinterest(query);
        const urls = items.map((i) => evogbThumb(i) || i?.image || i?.url || "").filter(isUrl);
        const pick = pickRandom(urls);
        if (pick)
            return pick;
        return "";
    }
    catch {
        return "";
    }
};
export default {
    name: "imagen",
    alias: ["image", "gimage", "img"],
    description: "Busca una imagen.",
    category: "downloaders",
    using: "<texto>",
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
        const lower = query.toLowerCase();
        if (forbidden.some((w) => lower.includes(w))) {
            await mctx.react("🚫");
            await mctx.reply("「🚫」 Búsqueda rechazada.");
            return;
        }
        try {
            await mctx.react("⌛");
            const [dvyerImg, googleImg, evogbImg] = await Promise.allSettled([
                searchDvyerImage(query),
                googleImageSearch(query).catch(() => ""),
                searchEvogbImage(query),
            ]);
            const imageUrl = (dvyerImg.status === "fulfilled" && dvyerImg.value) ||
                (googleImg.status === "fulfilled" && googleImg.value) ||
                (evogbImg.status === "fulfilled" && evogbImg.value) ||
                "";
            if (!imageUrl) {
                await mctx.react("❌");
                await mctx.reply("「✖」 No encontré imágenes.");
                return;
            }
            await wss.sendMessage(mctx.chat.jid, { image: { url: imageUrl }, caption: caption(query) }, { quoted: mctx.message.original });
            await mctx.react("✅");
        }
        catch (error) {
            console.error("[imagen] Error:", error instanceof Error ? error.message : error);
            await mctx.react("❌");
            await mctx.reply("「✖」 No se pudo buscar la imagen.");
        }
    },
};
