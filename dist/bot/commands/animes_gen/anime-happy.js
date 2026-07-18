import { sendAnimeReaction } from "../../../libs/anime-reactions.js";
export default {
    name: "happy",
    alias: ["feliz"],
    description: "Muestra felicidad.",
    category: "anime",
    hidden: false,
    requires: [],
    flags: ["all.chats"],
    execute: async (wss, ectx) => {
        await sendAnimeReaction(wss, ectx, {
            category: "happy",
            selfCaption: (actor) => `\`${actor}\` está feliz 😄`,
        });
    },
};
