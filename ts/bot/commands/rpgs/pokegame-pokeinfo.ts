import * as types from '../../../types/types.js';
import * as libs from '../../../libs/index.js';

export default <types.Command>{
    name: 'pokeinfo',
    alias: ['pinfo'],
    description: 'Muestra la información de un pokémon.',
    category: 'pokegame',
    using: '<pokemon>',
    flags: ['only.groups'],
    requires: [],
    hidden: false,
    execute: async (wss, { mctx, args }) => {
        if (!args.length) {
            await mctx.reply(`「⚡」 Ingresa el nombre del pokémon.`);
            return;
        }
        const pokemon = libs.pokemon.find((v) => v.name.toLowerCase() === args[0].toLowerCase());
        if (!pokemon) {
            await mctx.reply(`「⚡」 No existe un pokémon con el nombre de *${args[0]}*`);
            return;
        }
        let message = `*｢❀｣* Pokémon › *${pokemon.name}*\n\n`;
        message += `> *✦* Tipo › *${pokemon.types.join(', ')}*\n`;
        message += `> *✦* Vida › *${pokemon.base_stat.hp}*\n`;
        message += `> *✦* Ataque › *${pokemon.base_stat.attack}*\n`;
        message += `> *✦* Defenza › *${pokemon.base_stat.defense}*\n`;
        message += `> *✦* Velocidad › *${pokemon.base_stat.speed}*`;
        await wss.sendMessage(mctx.chat.jid, {
            image: {
                url: pokemon.sprite,
            },
            caption: message,
        }, {
            quoted: mctx.message.original,
        });
    },
};
