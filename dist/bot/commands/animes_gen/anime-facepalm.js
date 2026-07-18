import { sendAnimeReaction } from "../../../libs/anime-reactions.js";
export default {
    name: "facepalm",
    alias: ["palface"],
    description: "Se da una palmada en la cara.",
    category: "anime",
    hidden: false,
    requires: [],
    flags: ["all.chats"],
    execute: async (wss, ectx) => {
        await sendAnimeReaction(wss, ectx, {
            category: "facepalm",
            selfCaption: (actor) => `\`${actor}\` se da una palmada en la cara 🤦‍♀️`,
        });
    },
};
