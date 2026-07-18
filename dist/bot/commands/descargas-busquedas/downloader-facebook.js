import { downloadFacebook, isFacebookUrl } from "../../../libs/downloads.js";
const busy = new Set();
const usage = (_prefix = ".", _command = "fb") => "「⚠」 Envía un link.";
const doneCaption = (caption) => {
    const trimmed = caption?.trim();
    if (!trimmed)
        return "「◈」 *Descarga realizada*";
    return trimmed.startsWith("「◈」")
        ? trimmed
        : ["「◈」 *Descarga realizada*", trimmed].filter(Boolean).join("\n\n");
};
export default {
    name: "facebook",
    alias: ["fb", "facebookdl", "fbdl", "fb2", "facebook2"],
    description: "Descarga videos o imágenes de Facebook.",
    category: "downloaders",
    using: "<link>",
    flags: ["all.chats"],
    requires: [],
    hidden: false,
    execute: async (wss, { mctx, args, usedPrefix, commandName }) => {
        const url = args[0]?.trim();
        if (!url || !isFacebookUrl(url)) {
            await mctx.react("⚠️");
            await mctx.reply(usage(usedPrefix, commandName));
            return;
        }
        if (busy.has(mctx.sender.jid)) {
            await mctx.reply(`「☍」 Descarga en proceso
│ Usuario › @${mctx.sender.jid.split("@")[0]}
╰ Estado › espera a que termine la descarga actual.`);
            return;
        }
        busy.add(mctx.sender.jid);
        try {
            await mctx.react("⌛");
            const media = await downloadFacebook(url);
            await wss.sendMessage(mctx.chat.jid, media.type === "video"
                ? {
                    video: media.buffer || { url: media.url },
                    caption: doneCaption(media.caption),
                    fileName: media.fileName,
                    mimetype: media.mime || "video/mp4",
                }
                : {
                    image: media.buffer || { url: media.url },
                    caption: doneCaption(media.caption),
                    mimetype: media.mime || "image/jpeg",
                }, { quoted: mctx.message.original });
            await mctx.react("✅");
        }
        catch (error) {
            console.error("[facebook] Error:", error);
            await mctx.react("❌");
            await mctx.reply("「✖」 No se pudo realizar la descarga.");
        }
        finally {
            busy.delete(mctx.sender.jid);
        }
    },
};
