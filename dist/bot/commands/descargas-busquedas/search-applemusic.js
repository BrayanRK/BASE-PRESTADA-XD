import { dvyerAppleMusicSearch, dvyerTitle, dvyerAuthor, dvyerLink, dvyerUserError } from "../../../libs/downloads.js";
const usage = () => "「⚠」 Escribe el nombre de la canción.";
const searchCaption = (caption) => ["「◈」 *Búsqueda realizada*", caption?.trim()].filter(Boolean).join("\n\n");
export default {
    name: "applemusicsearch",
    alias: ["amsearch"],
    description: "Busca canciones en Apple Music.",
    category: "downloaders",
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
            const items = await dvyerAppleMusicSearch(query);
            if (!items.length) {
                await mctx.react("❌");
                await mctx.reply("「✖」 No encontré resultados.");
                return;
            }
            const text = items.slice(0, 8).map((item, i) => {
                const title = dvyerTitle(item);
                const author = dvyerAuthor(item, "");
                const link = dvyerLink(item);
                return [`${i + 1}. ${title}`, author ? `Artista: ${author}` : "", link ? `Link: ${link}` : ""].filter(Boolean).join("\n");
            }).join("\n\n");
            await mctx.reply(searchCaption(text));
            await mctx.react("✅");
        }
        catch (error) {
            console.error("[applemusicsearch] Error:", error instanceof Error ? error.message : error);
            await mctx.react("❌");
            await mctx.reply(`「✖」 ${dvyerUserError(error, "No se pudo realizar la búsqueda.")}`);
        }
    },
};
