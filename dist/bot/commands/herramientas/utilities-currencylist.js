// Lista visible para el usuario (un renglón representativo por país/moneda).
// Debe mantenerse en el mismo orden/criterio que utilities-currencyconvert.ts
const ROWS = [
    { flag: "🇦🇷", label: "Argentina", code: "ARS", aliasExample: "arg" },
    { flag: "🇲🇽", label: "México", code: "MXN", aliasExample: "mx" },
    { flag: "🇨🇴", label: "Colombia", code: "COP", aliasExample: "col" },
    { flag: "🇵🇪", label: "Perú", code: "PEN", aliasExample: "per" },
    { flag: "🇨🇱", label: "Chile", code: "CLP", aliasExample: "chi" },
    { flag: "🇻🇪", label: "Venezuela", code: "VES", aliasExample: "ven" },
    { flag: "🇧🇴", label: "Bolivia", code: "BOB", aliasExample: "bol" },
    { flag: "🇵🇾", label: "Paraguay", code: "PYG", aliasExample: "par" },
    { flag: "🇺🇾", label: "Uruguay", code: "UYU", aliasExample: "uru" },
    { flag: "🇧🇷", label: "Brasil", code: "BRL", aliasExample: "bra" },
    { flag: "🇪🇨", label: "Ecuador", code: "USD", aliasExample: "ecu" },
    { flag: "🇬🇹", label: "Guatemala", code: "GTQ", aliasExample: "gua" },
    { flag: "🇭🇳", label: "Honduras", code: "HNL", aliasExample: "hon" },
    { flag: "🇳🇮", label: "Nicaragua", code: "NIO", aliasExample: "nic" },
    { flag: "🇨🇷", label: "Costa Rica", code: "CRC", aliasExample: "cri" },
    { flag: "🇵🇦", label: "Panamá", code: "PAB", aliasExample: "pan" },
    { flag: "🇩🇴", label: "República Dominicana", code: "DOP", aliasExample: "rd" },
    { flag: "🇨🇺", label: "Cuba", code: "CUP", aliasExample: "cub" },
    { flag: "🇸🇻", label: "El Salvador", code: "USD", aliasExample: "sal" },
    { flag: "🇺🇸", label: "Estados Unidos", code: "USD", aliasExample: "usa" },
    { flag: "🇪🇸", label: "España", code: "EUR", aliasExample: "esp" },
    { flag: "🇪🇺", label: "Europa", code: "EUR", aliasExample: "eu" },
    { flag: "🇬🇧", label: "Reino Unido", code: "GBP", aliasExample: "uk" },
    { flag: "🇯🇵", label: "Japón", code: "JPY", aliasExample: "jap" },
    { flag: "🇨🇳", label: "China", code: "CNY", aliasExample: "chn" },
    { flag: "🇨🇦", label: "Canadá", code: "CAD", aliasExample: "can" },
    { flag: "🇦🇺", label: "Australia", code: "AUD", aliasExample: "aus" },
    { flag: "🇨🇭", label: "Suiza", code: "CHF", aliasExample: "sui" },
    { flag: "🇮🇳", label: "India", code: "INR", aliasExample: "ind" },
    { flag: "🇰🇷", label: "Corea del Sur", code: "KRW", aliasExample: "cor" },
    { flag: "🇷🇺", label: "Rusia", code: "RUB", aliasExample: "rus" },
    { flag: "🇹🇷", label: "Turquía", code: "TRY", aliasExample: "tur" },
    { flag: "🇿🇦", label: "Sudáfrica", code: "ZAR", aliasExample: "suf" },
];
const buildList = () => {
    const lines = ROWS.map((r) => `${r.flag} ${r.label} (${r.code}) › ${r.aliasExample}`);
    return [
        "「🌍」 Países disponibles para conversión",
        "",
        ...lines,
        "",
        "✦ Cada país acepta varios pronombres (código ISO, abreviación, nombre completo o nombre de la moneda).",
        "✦ Uso › .cv <país origen> <monto> - <país destino>",
        "✦ Ejemplo › .cv arg 5 - mx",
    ].join("\n");
};
export default {
    name: "listcb",
    alias: [
        "listcv", "listacb", "listadocb", "listapaises",
        "paisescb", "monedaslist", "listcambio", "listcurrency", "listdivisas",
    ],
    description: "Muestra la lista de países/monedas soportados por el conversor de moneda.",
    category: "utilities",
    using: "",
    flags: ["all.chats"],
    requires: [],
    hidden: false,
    execute: async (_wss, { mctx }) => {
        try {
            await mctx.reply(buildList());
        }
        catch (error) {
            console.error("[listcb] Error:", error instanceof Error ? error.message : error);
            await mctx.reply("「✖」 No se pudo mostrar la lista, intenta de nuevo.");
        }
    },
};
