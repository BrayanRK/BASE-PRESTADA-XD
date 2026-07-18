import { sendAnimeReaction } from "../../../libs/anime-reactions.js";
export default {
    name: "blush",
    alias: ["sonroja"],
    description: "Se sonroja.",
    category: "anime",
    hidden: false,
    requires: [],
    flags: ["all.chats"],
    execute: async (wss, ectx) => {
        await sendAnimeReaction(wss, ectx, {
            category: "blush",
            selfCaption: (actor) => `\`${actor}\` se sonroja 😳`,
        });
    },
};
