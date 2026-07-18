import { sendAnimeReaction } from "../../../libs/anime-reactions.js";
export default {
    name: "nod",
    alias: ["claro"],
    description: "Asiente con la cabeza.",
    category: "anime",
    hidden: false,
    requires: [],
    flags: ["all.chats"],
    execute: async (wss, ectx) => {
        await sendAnimeReaction(wss, ectx, {
            category: "nod",
            selfCaption: (actor) => `\`${actor}\` asiente con la cabeza 👌`,
        });
    },
};
