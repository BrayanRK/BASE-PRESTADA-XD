import { sendAnimeReaction } from "../../../libs/anime-reactions.js";
export default {
    name: "bored",
    alias: ["aburrido"],
    description: "Muestra aburrimiento.",
    category: "anime",
    hidden: false,
    requires: [],
    flags: ["all.chats"],
    execute: async (wss, ectx) => {
        await sendAnimeReaction(wss, ectx, {
            category: "bored",
            selfCaption: (actor) => `\`${actor}\` está aburrido 🥱`,
        });
    },
};
