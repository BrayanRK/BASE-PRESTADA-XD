import { freeFireHeader, guardFreeFireCommand, parseTimeInput, renderSchedule } from "../../../libs/freefire.js";
const command = {
    name: "ffhorario",
    alias: ["ffhora", "horarioff", "horariosff"],
    description: "Convertir una hora Free Fire para varios países.",
    using: "[hora]",
    category: "extras",
    hidden: true,
    flags: ["only.groups"],
    requires: [],
    execute: async (wss, ctx) => {
        if (!(await guardFreeFireCommand(wss, ctx, { requireOrganizer: false })))
            return;
        const rawTime = ctx.args.join(" ").trim();
        if (!rawTime || !parseTimeInput(rawTime)) {
            await ctx.mctx.reply(`${freeFireHeader("Horarios Free Fire", [`Uso › ${ctx.usedPrefix}ffhorario 8:00pm`])}\n\n╎ Formatos válidos: *8pm*, *8:30pm*, *20:30*`);
            return;
        }
        let text = freeFireHeader("Horarios Free Fire", [`Hora base › ${parseTimeInput(rawTime)?.normalized || rawTime}`]);
        text += `\n\n⟡ Países\n${renderSchedule(rawTime)}`;
        await ctx.mctx.reply(text);
    },
};
export default command;
