import { dvyerAnimeFLVLatest, dvyerTitle, dvyerLink, dvyerUserError } from "../../../libs/downloads.js";
const resultCaption = (text) => `「◈」 *Últimos episodios — AnimeFLV*\n\n${text}`;
export default {
    name: "animeflvlatest",
    alias: ["animeflv"],
    description: "Obtiene los últimos episodios publicados en AnimeFLV.",
    category: "anime",
    using: "",
    flags: ["all.chats"],
    requires: [],
    hidden: false,
    execute: async (_wss, { mctx }) => {
        try {
            await mctx.react("⌛");
            const items = await dvyerAnimeFLVLatest();
            if (!items.length) {
                await mctx.react("❌");
                await mctx.reply("「✖」 No hay episodios disponibles.");
                return;
            }
            const text = items.slice(0, 10).map((item, i) => {
                const title = dvyerTitle(item);
                const ep = String(item?.episode || item?.ep || "");
                const link = dvyerLink(item);
                return [`${i + 1}. ${title}${ep ? ` — Ep ${ep}` : ""}`, link ? `Link: ${link}` : ""].filter(Boolean).join("\n");
            }).join("\n\n");
            await mctx.reply(resultCaption(text));
            await mctx.react("✅");
        }
        catch (error) {
            console.error("[animeflvlatest] Error:", error instanceof Error ? error.message : error);
            await mctx.react("❌");
            await mctx.reply(`「✖」 ${dvyerUserError(error, "No se pudo obtener la información.")}`);
        }
    },
};
