import { sendAnimeReaction } from "../../../libs/anime-reactions.js";
export default {
    name: "think",
    alias: ["pensar"],
    description: "Piensa.",
    category: "anime",
    hidden: false,
    requires: [],
    flags: ["all.chats"],
    execute: async (wss, ectx) => {
        await sendAnimeReaction(wss, ectx, {
            category: "think",
            selfCaption: (actor) => `\`${actor}\` está pensando 🤔`,
        });
    },
};
