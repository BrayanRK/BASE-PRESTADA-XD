import { sendAnimeReaction } from "../../../libs/anime-reactions.js";
export default {
    name: "dance",
    alias: ["bailar"],
    description: "Baila.",
    category: "anime",
    hidden: false,
    requires: [],
    flags: ["all.chats"],
    execute: async (wss, ectx) => {
        await sendAnimeReaction(wss, ectx, {
            category: "dance",
            selfCaption: (actor) => `\`${actor}\` está bailando 💃`,
        });
    },
};
