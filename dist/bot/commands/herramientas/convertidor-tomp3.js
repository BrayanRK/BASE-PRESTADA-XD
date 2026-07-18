import { downloadMediaBuffer, hasMime } from "../../../libs/media.js";
import { mimeToExt, toAudio } from "../../../libs/converter.js";
const usage = (prefix = ".") => {
    return `*｢✧｣* Convierte audio o video a MP3.

*Uso:*
> Responde a un video/audio/nota de voz con *${prefix}tomp3*
> También sirve: *${prefix}toaudio*`;
};
export default {
    name: "tomp3",
    alias: ["toaudio"],
    description: "Convierte audio o video a MP3",
    category: "utilities",
    using: "(responde a audio/video)",
    requires: [],
    flags: ["all.chats"],
    hidden: false,
    execute: async (wss, { mctx, usedPrefix }) => {
        const source = mctx.quoted ?? mctx;
        const mime = source.message.mimetype || "";
        if (!hasMime(mime, /audio|video/)) {
            await mctx.react("⚠️");
            await mctx.reply(usage(usedPrefix));
            return;
        }
        try {
            await mctx.react("⏳");
            const media = await downloadMediaBuffer(source, "audio/video");
            const audio = await toAudio(media, mimeToExt(mime));
            await wss.sendMessage(mctx.chat.jid, {
                audio,
                mimetype: "audio/mpeg",
                ptt: false,
                fileName: "audio.mp3",
            }, { quoted: mctx.message.original });
            await mctx.react("✅");
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "No pude convertir a MP3.";
            console.error("[tomp3] Error:", error);
            await mctx.react("❌");
            await mctx.reply(`「🛠」 Convertidor MP3\n│ Estado › ${message}\n╰ Uso › revisa el formato abajo.\n\n${usage(usedPrefix)}`);
        }
    },
};
