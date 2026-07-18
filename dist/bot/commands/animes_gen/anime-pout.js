import { sendAnimeReaction } from "../../../libs/anime-reactions.js";
export default {
    name: "pout",
    alias: ["puchero"],
    description: "Hace un puchero.",
    category: "anime",
    hidden: false,
    requires: [],
    flags: ["all.chats"],
    execute: async (wss, ectx) => {
        await sendAnimeReaction(wss, ectx, {
            category: "pout",
            selfCaption: (actor) => `\`${actor}\` hace un puchero 😠`,
        });
    },
};
