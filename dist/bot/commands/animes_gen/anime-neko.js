import { sendAnimeReaction } from "../../../libs/anime-reactions.js";
export default {
    name: "neko",
    alias: [],
    description: "Muestra una neko aleatoria.",
    category: "anime",
    hidden: false,
    requires: [],
    flags: ["all.chats"],
    execute: async (wss, ectx) => {
        await sendAnimeReaction(wss, ectx, {
            category: "neko",
            selfCaption: (actor) => `Aquí tienes una neko para ti, \`${actor}\`! 🐱`,
        });
    },
};
