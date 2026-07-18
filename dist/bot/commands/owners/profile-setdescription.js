import * as database from "../../../database/database.js";
export default {
    name: "setdescription",
    alias: ["setdesc"],
    description: "Establecer tu descripcion.",
    category: "main",
    using: "[Descripcion]",
    hidden: false,
    requires: [],
    flags: ["only.groups"],
    execute: async (_, { mctx, args }) => {
        const description = args.join(" ").replace(/\s+/g, " ").trim();
        if (!description) {
            await mctx.reply("「♛」 Perfil\n│ Escribe una descripción para tu perfil.\n╰ Uso › *setdescription Soy buena onda*");
            return;
        }
        if (description.length > 180) {
            await mctx.reply("「⚠」 La descripción no puede pasar de 180 caracteres.");
            return;
        }
        await database.Users.update(mctx.sender.jid, {
            $set: {
                description,
            },
        });
        await mctx.reply(`「♛」 Perfil\n│ Descripción actualizada.\n╰ Texto › *${description}*`);
    },
};
