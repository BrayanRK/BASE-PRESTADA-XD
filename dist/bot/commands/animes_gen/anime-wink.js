import { sendAnimeReaction } from "../../../libs/anime-reactions.js";
export default {
    name: "wink",
    alias: ["giño", "giñar"],
    description: "Guiña un ojo.",
    category: "anime",
    hidden: false,
    requires: [],
    flags: ["all.chats"],
    execute: async (wss, ectx) => {
        await sendAnimeReaction(wss, ectx, {
            category: "wink",
            selfCaption: (actor) => `\`${actor}\` guiña un ojo 😉`,
        });
    },
};
