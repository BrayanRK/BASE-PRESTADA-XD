import { sendAnimeReaction } from "../../../libs/anime-reactions.js";
export default {
    name: "husbando",
    alias: [],
    description: "Muestra un husbando aleatorio.",
    category: "anime",
    hidden: false,
    requires: [],
    flags: ["all.chats"],
    execute: async (wss, ectx) => {
        await sendAnimeReaction(wss, ectx, {
            category: "husbando",
            selfCaption: (actor) => `Aquí tienes un husbando para ti, \`${actor}\`! 💖`,
        });
    },
};
