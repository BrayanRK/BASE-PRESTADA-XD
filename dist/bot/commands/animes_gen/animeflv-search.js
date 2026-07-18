import { dvyerAnimeFLVSearch, dvyerTitle, dvyerUserError } from "../../../libs/downloads.js";
const usage = () => "「⚠」 Escribe el nombre del anime.";
const resultCaption = (text) => `「◈」 *Búsqueda AnimeFLV*\n\n${text}`;
export default {
    name: "animeflvsearch",
    alias: ["animeflvbuscar"],
    description: "Busca animes por título en AnimeFLV.",
    category: "anime",
    using: "<nombre>",
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
            const items = await dvyerAnimeFLVSearch(query);
            if (!items.length) {
                await mctx.react("❌");
                await mctx.reply("「✖」 No encontré resultados.");
                return;
            }
            const text = items.slice(0, 10).map((item, i) => {
                const title = dvyerTitle(item);
                const slug = String(item?.slug || "");
                return [`${i + 1}. ${title}`, slug ? `Slug: ${slug}` : ""].filter(Boolean).join("\n");
            }).join("\n\n");
            await mctx.reply(resultCaption(`${text}\n\nUsa *.animeflvanime <slug>* para ver detalles.`));
            await mctx.react("✅");
        }
        catch (error) {
            console.error("[animeflvsearch] Error:", error instanceof Error ? error.message : error);
            await mctx.react("❌");
            await mctx.reply(`「✖」 ${dvyerUserError(error, "No se pudo realizar la búsqueda.")}`);
        }
    },
};
