import { sendAnimeReaction } from "../../../libs/anime-reactions.js";
export default {
    name: "yawn",
    alias: ["bos", "bosteza"],
    description: "Bosteza.",
    category: "anime",
    hidden: false,
    requires: [],
    flags: ["all.chats"],
    execute: async (wss, ectx) => {
        await sendAnimeReaction(wss, ectx, {
            category: "yawn",
            selfCaption: (actor) => `\`${actor}\` bosteza 🥱`,
        });
    },
};
