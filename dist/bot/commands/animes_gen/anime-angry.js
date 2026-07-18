import { sendAnimeReaction } from "../../../libs/anime-reactions.js";
export default {
    name: "angry",
    alias: ["enojo", "molesto"],
    description: "Muestra enojo.",
    category: "anime",
    hidden: false,
    requires: [],
    flags: ["all.chats"],
    execute: async (wss, ectx) => {
        await sendAnimeReaction(wss, ectx, {
            category: "angry",
            selfCaption: (actor) => `\`${actor}\` está enojado(a) 😡`,
        });
    },
};
