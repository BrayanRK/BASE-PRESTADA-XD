import { dvyerEaseMate, dvyerTitle, dvyerLink, dvyerUserError } from "../../../libs/downloads.js";
const usage = () => "「⚠」 Escribe qué modelo de IA buscar.";
const resultCaption = (text) => `「◈」 *Resultados EaseMate*\n\n${text}`;
export default {
    name: "easemate",
    alias: [],
    description: "Scraper de modelos de inteligencia artificial.",
    category: "utilities",
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
            const items = await dvyerEaseMate(query);
            if (!items.length) {
                await mctx.react("❌");
                await mctx.reply("「✖」 No encontré resultados.");
                return;
            }
            const text = items.slice(0, 8).map((item, i) => {
                const title = dvyerTitle(item);
                const link = dvyerLink(item);
                return [`${i + 1}. ${title}`, link ? `Link: ${link}` : ""].filter(Boolean).join("\n");
            }).join("\n\n");
            await mctx.reply(resultCaption(text));
            await mctx.react("✅");
        }
        catch (error) {
            console.error("[easemate] Error:", error instanceof Error ? error.message : error);
            await mctx.react("❌");
            await mctx.reply(`「✖」 ${dvyerUserError(error, "No se pudo realizar la búsqueda.")}`);
        }
    },
};
