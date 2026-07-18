import * as database from '../../../database/database.js';
import * as baileys from 'baileys';
export default {
    name: 'setrange',
    alias: ['setrank'],
    description: 'Otorga un rango a un usuario.',
    category: 'owner',
    requires: ['owner.user'],
    flags: ['only.groups'],
    using: '<@user> <range>',
    hidden: true,
    execute: async (_, { mctx, args }) => {
        if (!args.length) {
            await mctx.reply('「♛」 Etiqueta al usuario seguido del rango que se le otorgará.');
            return;
        }
        const mentioned = baileys.jidEncode(args[0].replace(/[^0-9]/g, ''), 'lid');
        const user = await database.Users.get(mentioned);
        if (!user) {
            await mctx.reply(`「♛」 El usuario @${mentioned.split('@')[0]} no está registrado en la base de datos.`);
            return;
        }
        const ranges = ['Owner', 'Mod', 'Premium', 'User'];
        if (!ranges.includes(args[1])) {
            let message = `「♛」 El rango *${args[1]}* no es válido.\n\n`;
            message += `> *✦* Rangos válidos › ${ranges.map((v) => `*${v}*`).join(', ')}`;
            await mctx.reply(message);
            return;
        }
        if (user.range === args[1]) {
            await mctx.reply(`「♛」 El usuario @${mentioned.split('@')[0]} ya tenia el rango *${user.range}*.`);
            return;
        }
        await database.Users.update(mentioned, {
            $set: {
                range: args[1],
            },
        });
        await mctx.reply(`「❖」 Se le otorgó el rango *${args[1]}* al usuario @${mentioned.split('@')[0]}.`);
    },
};
