import { sendAnimeReaction } from "../../../libs/anime-reactions.js";
export default {
    name: "sleep",
    alias: ["dormir"],
    description: "Duerme.",
    category: "anime",
    hidden: false,
    requires: [],
    flags: ["all.chats"],
    execute: async (wss, ectx) => {
        await sendAnimeReaction(wss, ectx, {
            category: "sleep",
            selfCaption: (actor) => `\`${actor}\` está durmiendo 😴`,
        });
    },
};
