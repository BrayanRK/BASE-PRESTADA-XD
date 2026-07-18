import("./dist/main.js").catch((error) => {
  console.error("[ZETA] Error iniciando dist/main.js:", error)
  process.exit(1)
})
