import { sendAnimeReaction } from "../../../libs/anime-reactions.js";
export default {
    name: "cringe",
    alias: [],
    description: "Muestra vergüenza ajena.",
    category: "anime",
    hidden: false,
    requires: [],
    flags: ["all.chats"],
    execute: async (wss, ectx) => {
        await sendAnimeReaction(wss, ectx, {
            category: "cringe",
            selfCaption: (actor) => `\`${actor}\` siente vergüenza ajena 😬`,
        });
    },
};
