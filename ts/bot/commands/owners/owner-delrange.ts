import * as types from '../../../types/types.js';
import * as database from '../../../database/database.js';

export default <types.Command>{
    name: 'delrange',
    alias: ['delrank'],
    description: 'Remueve el rol de un usuario.',
    category: 'owner',
    requires: ['owner.user'],
    using: '<@user>',
    flags: ['only.groups'],
    hidden: true,
    execute: async (_, { mctx }) => {
        const mentioned = mctx.message.mentioned[0] || (mctx.quoted ?? mctx).sender.jid;
        if (!mentioned) {
            await mctx.reply('「♛」 Etiqueta al usuario del cual será removido su rango.');
            return;
        }
        const user = await database.Users.get(mentioned);
        if (!user) {
            await mctx.reply(`「♛」 El usuario @${mentioned.split('@')[0]} no está registrado en la base de datos.`);
            return;
        }
        if (user.range === 'User') {
            await mctx.reply(`「♛」 El usuario @${mentioned.split('@')[0]} no tiene un rango otorgado.`);
            return;
        }
        await database.Users.update(mentioned, {
            $set: {
                range: 'User',
            },
        });
        await mctx.reply(`「❖」 Se le removió el rol *${user.range}* al usuario @${mentioned.split("@")[0]}.`);
    },
};
