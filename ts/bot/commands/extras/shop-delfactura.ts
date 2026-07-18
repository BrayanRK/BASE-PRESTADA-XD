import type * as types from "../../../types/types.js"
import { guardShopCommand, invoiceMatches, loadInvoiceDb, normalizeNumber, saveInvoiceDb } from "../../../libs/shop.js"

const command: types.Command = {
  name: "delfactura",
  alias: ["delfac", "borrarfactura"],
  description: "Eliminar factura por cliente/servicio.",
  using: "<numeroCliente> <servicio> [all]",
  category: "extras",
  hidden: true,
  flags: ["only.groups"],
  requires: [],
  execute: async (wss, ctx) => {
    if (!(await guardShopCommand(wss, ctx, { requireEnabled: false, requireOrganizer: true }))) return

    await ctx.mctx.react("🗑️").catch(() => {})
    const numeroCliente = normalizeNumber(ctx.args[0])
    const eliminarTodas = String(ctx.args[ctx.args.length - 1] || "").toLowerCase() === "all"
    const servicio = (eliminarTodas ? ctx.args.slice(1, -1) : ctx.args.slice(1)).join(" ").toLowerCase().trim()

    if (!numeroCliente || !servicio) {
      await ctx.mctx.reply(
        `「✦」 *Uso correcto:*\n${ctx.usedPrefix}${ctx.commandName} <numeroCliente> <servicio> [all]\n\n📌 Ejemplos ›\n• ${ctx.usedPrefix}${ctx.commandName} 573161325891 netflix\n• ${ctx.usedPrefix}${ctx.commandName} 573161325891 netflix all`,
      )
      return
    }

    const db = loadInvoiceDb(ctx)
    const matches = db.facturas
      .map((invoice, index) => ({ invoice, index }))
      .filter(({ invoice }) => invoiceMatches(invoice, numeroCliente, servicio))

    if (!matches.length) {
      await ctx.mctx.reply(`🔎 No encontré facturas para:\n• Cliente: *${numeroCliente}*\n• Servicio: *${servicio}*`)
      return
    }

    const removed = [] as string[]

    if (eliminarTodas) {
      for (const { invoice, index } of matches.sort((a, b) => b.index - a.index)) {
        removed.push(invoice.id)
        db.facturas.splice(index, 1)
      }
    } else {
      const newest = matches.slice().sort((a, b) => Number(b.invoice.fechaCreacion || 0) - Number(a.invoice.fechaCreacion || 0))[0]
      removed.push(newest.invoice.id)
      db.facturas.splice(newest.index, 1)
    }

    if (!saveInvoiceDb(db, ctx)) {
      await ctx.mctx.reply("「✘」 Error guardando cambios en *facturas.json*.")
      return
    }

    const text = eliminarTodas
      ? `「❖」 *${removed.length} factura(s) eliminada(s)*\n• Cliente: *${numeroCliente}*\n• Servicio: *${servicio}*\n\n🧾 Id(s): ${removed.join(", ")}`
      : `「❖」 *Factura eliminada*\n• Cliente: *${numeroCliente}*\n• Servicio: *${servicio}*\n\n🧾 ID: ${removed.join(", ")}\n\n💡 Para eliminar todas:\n${ctx.usedPrefix}${ctx.commandName} ${numeroCliente} ${servicio} all`

    await ctx.mctx.reply(text)
    await ctx.mctx.react("✅").catch(() => {})
  },
}

export default command
