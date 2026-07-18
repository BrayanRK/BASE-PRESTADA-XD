import { sendAnimeReaction } from "../../../libs/anime-reactions.js";
export default {
    name: "shrug",
    alias: [],
    description: "Se encoge de hombros.",
    category: "anime",
    hidden: false,
    requires: [],
    flags: ["all.chats"],
    execute: async (wss, ectx) => {
        await sendAnimeReaction(wss, ectx, {
            category: "shrug",
            selfCaption: (actor) => `\`${actor}\` se encoge de hombros 🤷‍♀️`,
        });
    },
};
