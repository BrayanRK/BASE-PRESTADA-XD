import { downloadMediaBuffer, hasMime } from "../../../libs/media.js";
import { webp2png } from "../../../libs/webp2mp4.js";
const usage = (prefix = ".") => {
    return `*｢✧｣* Convierte sticker a imagen.

*Uso:*
> Responde a un sticker con *${prefix}toimg*
> También sirve: *${prefix}img* o *${prefix}jpg*`;
};
export default {
    name: "toimg",
    alias: ["jpg", "img"],
    description: "Convierte un sticker webp a imagen PNG",
    category: "utilities",
    using: "(responde a sticker)",
    requires: [],
    flags: ["all.chats"],
    hidden: false,
    execute: async (wss, { mctx, usedPrefix }) => {
        const source = mctx.quoted ?? mctx;
        const mime = source.message.mimetype || "";
        if (!mctx.quoted || !hasMime(mime, /webp/)) {
            await mctx.react("⚠️");
            await mctx.reply(usage(usedPrefix));
            return;
        }
        try {
            await mctx.react("⏳");
            const media = await downloadMediaBuffer(source, "sticker");
            const image = await webp2png(media);
            await wss.sendMessage(mctx.chat.jid, {
                image,
                mimetype: "image/png",
                fileName: "sticker.png",
            }, { quoted: mctx.message.original });
            await mctx.react("✅");
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "No pude convertir el sticker a imagen.";
            console.error("[toimg] Error:", error);
            await mctx.react("❌");
            await mctx.reply(`「🛠」 Convertidor IMG\n│ Estado › ${message}\n╰ Uso › revisa el formato abajo.\n\n${usage(usedPrefix)}`);
        }
    },
};
