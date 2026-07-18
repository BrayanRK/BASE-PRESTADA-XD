import { instagramStalk } from "../../../libs/downloads.js";
const searchCaption = (caption) => ["「◈」 *Búsqueda realizada*", caption?.trim()].filter(Boolean).join("\n\n");
export default {
    name: "igstalk",
    alias: ["igsearch", "instagramsearch"],
    description: "Muestra información pública de un perfil de Instagram.",
    category: "downloaders",
    using: "<username>",
    flags: ["all.chats"],
    requires: [],
    hidden: false,
    execute: async (wss, { mctx, args, usedPrefix, commandName }) => {
        const username = args[0]?.replace(/^@/, "").trim();
        if (!username) {
            await mctx.react("⚠️");
            await mctx.reply("「⚠」 Escribe el usuario.");
            return;
        }
        try {
            await mctx.react("⌛");
            const profile = await instagramStalk(username);
            const text = `「☊」 Perfil de Instagram
│ Usuario › ${profile.username}
│ Nombre › ${profile.name}
│ Bio › ${profile.bio || "Sin biografía"}
│ Seguidores › ${profile.followers || "N/A"}
│ Seguidos › ${profile.following || "N/A"}
│ Posts › ${profile.posts || "N/A"}
╰ URL › ${profile.url || `https://instagram.com/${profile.username}`}`;
            if (profile.avatar) {
                await wss.sendMessage(mctx.chat.jid, { image: { url: profile.avatar }, caption: searchCaption(text) }, { quoted: mctx.message.original });
            }
            else {
                await mctx.reply(searchCaption(text));
            }
            await mctx.react("✅");
        }
        catch (error) {
            console.error("[igstalk] Error:", error);
            await mctx.react("❌");
            await mctx.reply("「✖」 No se pudo realizar la búsqueda.");
        }
    },
};
