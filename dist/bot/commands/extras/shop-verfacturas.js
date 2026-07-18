import { formatDate, formatRemaining, getInvoiceStatus, guardShopCommand, loadInvoiceDb } from "../../../libs/shop.js";
const command = {
    name: "verfactura",
    alias: ["verfac", "facturas"],
    description: "Listar facturas registradas.",
    category: "extras",
    hidden: true,
    flags: ["only.groups"],
    requires: [],
    execute: async (wss, ctx) => {
        if (!(await guardShopCommand(wss, ctx, { requireEnabled: false, requireOrganizer: true })))
            return;
        await ctx.mctx.react("📄").catch(() => { });
        const db = loadInvoiceDb(ctx);
        if (!db.facturas.length) {
            await ctx.mctx.reply(`「◇」 📂 No hay facturas registradas aún.`);
            return;
        }
        let text = "🧾 *LISTA DE FACTURAS*\n\n";
        const now = Date.now();
        db.facturas.forEach((invoice, index) => {
            const remaining = Math.max(0, Number(invoice.fechaProximoPago || 0) - now);
            text += `📌 *Factura #${index + 1}*\n`;
            text += `🆔 ID: ${invoice.id}\n`;
            text += `💼 Servicio: ${invoice.servicio}\n`;
            text += `💰 Precio: ${invoice.precio}\n`;
            text += `🔄 Ciclo: ${invoice.ciclo?.texto || "-"}\n`;
            text += `📅 Creada: ${formatDate(invoice.fechaCreacion)}\n`;
            text += `📅 Próximo pago: ${formatDate(invoice.fechaProximoPago)}\n`;
            text += `⏳ Tiempo restante: ${formatRemaining(remaining)}\n`;
            text += `📊 Estado: ${getInvoiceStatus(invoice).toUpperCase()}\n\n`;
            text += `👤 Cliente: ${invoice.cliente?.nombre || "-"} (${invoice.cliente?.numero || "-"})\n`;
            text += `🛒 Vendedor: ${invoice.vendedor?.nombre || "-"} (${invoice.vendedor?.numero || "-"})\n`;
            text += "──────────────\n\n";
        });
        const chunks = text.trim().match(/[\s\S]{1,3500}/g) || [text.trim()];
        for (const chunk of chunks)
            await ctx.mctx.reply(chunk);
        await ctx.mctx.react("✅").catch(() => { });
    },
};
export default command;
