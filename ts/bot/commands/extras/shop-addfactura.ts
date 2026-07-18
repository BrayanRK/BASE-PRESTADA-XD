import type * as types from "../../../types/types.js"
import {
  buildInvoiceCaption,
  createInvoice,
  guardShopCommand,
  loadInvoiceDb,
  normalizeNumber,
  parseCycle,
  saveInvoiceDb,
  shopHeader,
  toUserJid,
} from "../../../libs/shop.js"

const command: types.Command = {
  name: "addfactura",
  alias: ["addfac", "facturaadd"],
  description: "Crear factura de ciclo para un cliente.",
  using: "<numCliente> <numVendedor> <servicio> <precio> <nombreCliente> <nombreVendedor> <ciclo>",
  category: "extras",
  hidden: true,
  flags: ["only.groups"],
  requires: [],
  execute: async (wss, ctx) => {
    if (!(await guardShopCommand(wss, ctx, { requireEnabled: false, requireOrganizer: true }))) return

    await ctx.mctx.react("🧾").catch(() => {})

    if (ctx.args.length < 7) {
      await ctx.mctx.reply(
        `「✦」 *Uso correcto:*\n${ctx.usedPrefix}${ctx.commandName} <numCliente> <numVendedor> <servicio> <precio> <nombreCliente> <nombreVendedor> <ciclo>\n\n📌 Ejemplo ›\n${ctx.usedPrefix}${ctx.commandName} 50784747474 573161325891 netflix 2.99 raul felipe 1d\n\n➕ Notas:\n• Nombres sin espacios, usa guiones: juan_perez\n• Ciclo: 1m / 1h / 1d`,
      )
      return
    }

    const numCliente = normalizeNumber(ctx.args[0])
    const numVendedor = normalizeNumber(ctx.args[1])
    const servicio = String(ctx.args[2] || "").trim().toLowerCase()
    const precio = Number(ctx.args[3])
    const nombreCliente = String(ctx.args[4] || "").replace(/_/g, " ").trim()
    const nombreVendedor = String(ctx.args[5] || "").replace(/_/g, " ").trim()
    const ciclo = parseCycle(ctx.args[6])

    if (!numCliente || !numVendedor || !servicio || !Number.isFinite(precio) || precio < 0 || !nombreCliente || !nombreVendedor || !ciclo) {
      await ctx.mctx.reply("「✘」 Parámetros inválidos. Revisa número, servicio, precio, nombres y ciclo.")
      return
    }

    const invoice = createInvoice({
      servicio,
      precio,
      ciclo,
      cliente: { numero: numCliente, nombre: nombreCliente },
      vendedor: { numero: numVendedor, nombre: nombreVendedor },
      scope: { botJid: ctx.bot.bot_jid, groupJid: ctx.mctx.chat.jid },
    })

    const db = loadInvoiceDb(ctx)
    db.facturas.push(invoice)

    if (!saveInvoiceDb(db, ctx)) {
      await ctx.mctx.reply("「✘」 Error guardando *facturas.json*.")
      return
    }

    const caption = buildInvoiceCaption(invoice, "Factura generada (PAGO EXITOSO)")
    const targets = Array.from(new Set([ctx.mctx.chat.jid, toUserJid(numCliente), toUserJid(numVendedor)].filter(Boolean)))

    for (const jid of targets) {
      try {
        await wss.sendMessage(jid, { text: caption }, { quoted: jid === ctx.mctx.chat.jid ? ctx.mctx.message.original : undefined })
      } catch {}
    }

    await ctx.mctx.reply(shopHeader("Factura", ["Estado › creada", `ID › ${invoice.id}`, `Cliente › +${numCliente}`]))
    await ctx.mctx.react("✅").catch(() => {})
  },
}

export default command
