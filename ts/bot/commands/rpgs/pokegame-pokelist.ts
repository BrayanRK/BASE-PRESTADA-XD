import * as types from '../../../types/types.js';
import * as libs from '../../../libs/index.js';

export default <types.Command>{
    name: 'pokelist',
    alias: ['plist'],
    description: 'Muestra la lista de pokémones.',
    category: 'pokegame',
    using: '<page>',
    flags: ['only.groups'],
    requires: [],
    hidden: false,
    execute: async (wss, { mctx, args }) => {
        const page = Math.max(1, parseInt(args[0]) || 1);
        const limit = 10;
        const skip = (page - 1) * limit;
        const sortedPokemon = libs.pokemon.sort((a, b) => b.base_stat.attack - a.base_stat.attack).slice(skip, skip + limit);
        if (!sortedPokemon.length) {
            await mctx.reply(`「⚡」 No hay pokémones en la página *${page}*.`);
            return;
        }
        let message = `*｢❀｣* Pokémones › *${libs.pokemon.length.toLocaleString()}*\n\n`;
        sortedPokemon.forEach((v, i) => {
            message += `*✦* ${(page - 1) * limit + i + 1} › *${v.name}*\n`;
            message += `> *•* Tipo › *${v.types.join(', ')}*\n`;
            message += `> *•* Vida › *${v.base_stat.hp}*\n`;
            message += `> *•* Ataque › *${v.base_stat.attack}*\n`;
            message += `> *•* Defenza › *${v.base_stat.defense}*\n`;
            message += `> *•* Velocidad › *${v.base_stat.speed}*\n`;
        });
        const totalPages = Math.ceil(libs.pokemon.length / limit);
        message += `\n→ Página › *${page}* de *${totalPages}*`;
        await mctx.reply(message);
    },
};
