import type * as types from "../../../types/types.js"
import {
  buildInvoiceCaption,
  guardShopCommand,
  invoiceMatches,
  loadInvoiceDb,
  normalizeNumber,
  saveInvoiceDb,
  shopHeader,
  toUserJid,
} from "../../../libs/shop.js"

const command: types.Command = {
  name: "facturapaga",
  alias: ["facpaga", "pagarfactura"],
  description: "Marcar/renovar factura como pagada.",
  using: "<numeroCliente> <servicio>",
  category: "extras",
  hidden: true,
  flags: ["only.groups"],
  requires: [],
  execute: async (wss, ctx) => {
    if (!(await guardShopCommand(wss, ctx, { requireEnabled: false, requireOrganizer: true }))) return

    await ctx.mctx.react("💳").catch(() => {})

    const numeroCliente = normalizeNumber(ctx.args[0])
    const servicio = ctx.args.slice(1).join(" ").toLowerCase().trim()

    if (!numeroCliente || !servicio) {
      await ctx.mctx.reply(
        `「✦」 *Uso correcto:*\n${ctx.usedPrefix}${ctx.commandName} <numeroCliente> <servicio>\n\n📌 Ejemplo ›\n${ctx.usedPrefix}${ctx.commandName} 573161325891 netflix`,
      )
      return
    }

    const db = loadInvoiceDb(ctx)
    const matches = db.facturas
      .map((invoice, index) => ({ invoice, index }))
      .filter(({ invoice }) => invoiceMatches(invoice, numeroCliente, servicio))
      .sort((a, b) => Number(b.invoice.fechaCreacion || 0) - Number(a.invoice.fechaCreacion || 0))

    if (!matches.length) {
      await ctx.mctx.reply(`🔎 No hay facturas para:\n• Cliente: *${numeroCliente}*\n• Servicio: *${servicio}*`)
      return
    }

    const picked = matches[0]
    const invoice = picked.invoice
    const now = Date.now()
    invoice.fechaCreacion = now
    invoice.fechaProximoPago = now + Number(invoice.ciclo?.ms || 0)
    invoice.estado = "pagado"
    invoice.recordatorioEnviado = false
    invoice.fechaRecordatorio = null
    invoice.historial = Array.isArray(invoice.historial) ? invoice.historial : []
    invoice.historial.push({ fecha: now, evento: "pago", detalle: "Pago registrado (renovación)" })
    db.facturas[picked.index] = invoice

    if (!saveInvoiceDb(db, ctx)) {
      await ctx.mctx.reply("「✘」 Error guardando *facturas.json*.")
      return
    }

    const caption = buildInvoiceCaption(invoice, "Factura generada (PAGO EXITOSO)")
    const targets = Array.from(
      new Set([ctx.mctx.chat.jid, toUserJid(invoice.cliente.numero), toUserJid(invoice.vendedor.numero)].filter(Boolean)),
    )

    for (const jid of targets) {
      try {
        await wss.sendMessage(jid, { text: caption }, { quoted: jid === ctx.mctx.chat.jid ? ctx.mctx.message.original : undefined })
      } catch {}
    }

    await ctx.mctx.reply(shopHeader("Factura", ["Estado › pagada/renovada", `ID › ${invoice.id}`, `Cliente › +${numeroCliente}`]))
    await ctx.mctx.react("✅").catch(() => {})
  },
}

export default command
