import { googleSearch } from "../../../libs/downloads.js";
import { dvyerGet } from "../../../libs/downloads.js";
import axios from "axios";
const usage = () => "「⚠」 Escribe qué buscar.";
const clean = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const pickRandom = (list) => list.length ? list[Math.floor(Math.random() * list.length)] : undefined;
const normalize = (data) => {
    const list = Array.isArray(data) ? data
        : Array.isArray(data?.results) ? data.results
            : Array.isArray(data?.data) ? data.data
                : Array.isArray(data?.items) ? data.items
                    : [];
    return list.map((item) => ({
        title: clean(item.title || item.name || ""),
        description: clean(item.description || item.snippet || item.desc || item.body || ""),
        url: clean(item.url || item.link || item.href || ""),
    })).filter((r) => r.url);
};
const searchDvyer = async (query) => {
    try {
        const data = await dvyerGet("/search/google", { query });
        const results = normalize(data);
        if (results.length)
            return results;
    }
    catch { }
    return [];
};
const searchFallback = async (query) => {
    try {
        const { data } = await axios.get(`https://api.alyachan.dev/api/google?q=${encodeURIComponent(query)}&apikey=Gata-Dios`, { timeout: 20_000 });
        const results = normalize(data);
        if (results.length)
            return results;
    }
    catch { }
    try {
        const { data } = await axios.get(`https://api.dorratz.com/v3/googlesearch?q=${encodeURIComponent(query)}`, { timeout: 20_000 });
        const results = normalize(data);
        if (results.length)
            return results;
    }
    catch { }
    return [];
};
export default {
    name: "google",
    alias: ["buscar", "gsearch"],
    description: "Busca resultados web en Google.",
    category: "downloaders",
    using: "<texto>",
    flags: ["all.chats"],
    requires: [],
    hidden: false,
    execute: async (_wss, { mctx, args }) => {
        const query = args.join(" ").trim();
        if (!query) {
            await mctx.react("⚠️");
            await mctx.reply(usage());
            return;
        }
        try {
            await mctx.react("🔎");
            let results = await searchDvyer(query);
            if (!results.length)
                results = await googleSearch(query).catch(() => []);
            if (!results.length)
                results = await searchFallback(query);
            if (!results.length) {
                await mctx.react("❌");
                await mctx.reply("「✖」 No encontré resultados.");
                return;
            }
            const item = pickRandom(results.slice(0, 10));
            const text = ["「◈」 *Búsqueda realizada*", [item.title, item.description, item.url].filter(Boolean).join("\n")].filter(Boolean).join("\n\n");
            await mctx.reply(text.slice(0, 3000));
            await mctx.react("✅");
        }
        catch (error) {
            console.error("[google] Error:", error instanceof Error ? error.message : error);
            await mctx.react("❌");
            await mctx.reply("「✖」 No se pudo realizar la búsqueda.");
        }
    },
};
