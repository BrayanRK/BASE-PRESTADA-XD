import { sendAnimeReaction } from "../../../libs/anime-reactions.js";
export default {
    name: "like",
    alias: ["ok"],
    description: "Muestra pulgar hacia arriba.",
    category: "anime",
    hidden: false,
    requires: [],
    flags: ["all.chats"],
    execute: async (wss, ectx) => {
        await sendAnimeReaction(wss, ectx, {
            category: "thumbsup",
            selfCaption: (actor) => `\`${actor}\` muestra pulgar hacia arriba 👍`,
        });
    },
};
