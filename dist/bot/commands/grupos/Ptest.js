export default {
    name: "ptest",
    description: "Panel de prueba",
    category: "owner",
    execute: async (_wss, { mctx }) => {
        const text = `
*MONITOR DEL SISTEMA*

「◈」 📡 ESTADO DE RED
◈ 📶 Internet Download : Test
◈ 📶 Internet Upload   : Test
◈ 📊 Calidad de Red    : 😎 TEST
◈ ⏳ Velocidad del Bot : Test
◈ 🤖 Uptime del Bot    : Test

「◈」 🖥️ ENTORNO DEL SERVIDOR
◈ 💻 Sistema Operativo : Test
◈ 🧩 Plataforma        : Test
◈ 🏷️ Nombre del Host   : Test
◈ 🌍 Zona Horaria      : Test
◈ 🚀 Tiempo Encendido  : Test

「◈」 🧠 RENDIMIENTO DE CPU
◈ 🔧 Modelo CPU        : Test
◈ 🧮 Núcleos           : Test
◈ 🦠 GHz               : Test
◈ 📈 Uso               : Test
◈ 🔥 Estado de Carga   : 🟢 TEST

「◈」 💾 GESTIÓN DE MEMORIA
◈ 📥 Memoria Usada     : Test
◈ 📉 Memoria Libre     : Test
◈ 📦 Memoria Total     : Test
◈ 📊 Utilizado         : Test
◈ 🧠 Estado Memoria    : 🟢 TEST

「◈」 💽 ALMACENAMIENTO
◈ 📂 Espacio Usado     : Test
◈ 📂 Espacio Libre     : Test
◈ 📂 Espacio Total     : Test
◈ 📊 Utilizado         : Test`;
        await mctx.reply(text.trim());
    },
};
