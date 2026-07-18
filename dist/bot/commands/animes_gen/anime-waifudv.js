import { dvyerWaifu, dvyerMediaUrl, dvyerUserError } from "../../../libs/downloads.js";
export default {
    name: "waifudv",
    alias: ["waifu2"],
    description: "Devuelve una imagen aleatoria de waifu.",
    category: "anime",
    using: "",
    flags: ["all.chats"],
    requires: [],
    hidden: false,
    execute: async (wss, { mctx }) => {
        try {
            await mctx.react("⌛");
            const data = await dvyerWaifu();
            const imageUrl = dvyerMediaUrl(data);
            await wss.sendMessage(mctx.chat.jid, { image: { url: imageUrl }, caption: "「◈」 *Aquí tienes tu waifu*" }, { quoted: mctx.message.original });
            await mctx.react("✅");
        }
        catch (error) {
            console.error("[waifudv] Error:", error instanceof Error ? error.message : error);
            await mctx.react("❌");
            await mctx.reply(`「✖」 ${dvyerUserError(error, "No se pudo obtener la imagen.")}`);
        }
    },
};
