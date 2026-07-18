import * as types from '../../../types/types.js';

export default <types.Command>{
    name: 'trainerinfo',
    alias: ['tinfo'],
    description: 'Muestra la información del entrenador y sus recursos.',
    category: 'pokegame',
    using: '<@participant>',
    flags: ['only.groups'],
    requires: [],
    hidden: false,
    execute: async (wss, { mctx, group }) => {
        const mentioned = mctx.message.mentioned[0] || (mctx.quoted ?? mctx).sender.jid;
        const groupUser = group.users.find((v) => v.user_jid === mentioned);
        if (!groupUser) {
            await mctx.reply(`「⚡」 El participante @${mentioned.split('@')[0]} no está registrado en este grupo.`);
            return;
        }
        const strongestPokemon = groupUser.pokemon.sort((a, b) => b.base_stat.attack - a.base_stat.attack)[0];
        let message = `*｢❀｣* Entrenador › *${await wss.getName(mentioned)}*\n\n`;
        message += `> *✦* Pokémones › *${groupUser.pokemon.length.toLocaleString()}*\n`;
        message += `> *✦* Bayas › *${groupUser.berries.toLocaleString()}*\n`;
        message += `> *✦* Pociones › *${groupUser.potions.toLocaleString()}*\n`;
        message += `> *✦* Galletas › *${groupUser.cookies.toLocaleString()}*\n`;
        message += `> *✦* Potenciadores › *${groupUser.enhancers.toLocaleString()}*\n`;
        message += `> *✦* Pokémon más fuerte › *${strongestPokemon ? strongestPokemon.name : 'Ninguno'}*`;
        await mctx.reply(message);
    },
};
