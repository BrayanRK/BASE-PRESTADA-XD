import { freeFireHeader, guardFreeFireCommand } from "../../../libs/freefire.js";
const command = {
    name: "ffreglas",
    alias: ["reglasff", "ffrules"],
    description: "Enviar reglas rápidas para partidas Free Fire.",
    category: "extras",
    hidden: true,
    flags: ["only.groups"],
    requires: [],
    execute: async (wss, ctx) => {
        if (!(await guardFreeFireCommand(wss, ctx, { requireOrganizer: false })))
            return;
        const text = `${freeFireHeader("Reglas Free Fire", [`Grupo › ${ctx.mctx.chat.name || "grupo"}`])}

⟡ Reglas rápidas
╎ 1. Puntualidad: sala se cierra a la hora marcada.
╎ 2. Sin hacks, bugs ni cuentas prestadas raras.
╎ 3. Respeto entre clanes y jugadores.
╎ 4. Si no estás listo, pasas a suplente.
╎ 5. Captura resultado al terminar.
╎ 6. Admin decide desempates o repetición.

╰ Jueguen serio, pero sin armar novela.`;
        await ctx.mctx.reply(text);
    },
};
export default command;
