import { getExchangeRate } from "@tamtamchik/exchanger"

export class CurrencyError extends Error {
  userMessage: string
  constructor(msg = "Error de conversión", userMsg = "No se pudo realizar la conversión.") {
    super(msg); this.name = "CurrencyError"; this.userMessage = userMsg
  }
}

const CACHE_MS = 60 * 60 * 1000 // 1 hora
const FALLBACK_API = "https://open.er-api.com/v6/latest"
const FALLBACK_TIMEOUT = 12_000

// Respaldo gratuito (sin api key) por si el módulo npm @tamtamchik/exchanger
// falla (Yahoo Finance caído, cambio de formato, etc). Así cumplimos "no quiero errores".
const fetchFallbackRate = async (fromCode: string, toCode: string): Promise<number> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FALLBACK_TIMEOUT)
  ;(timer as any).unref?.()

  try {
    const res = await fetch(`${FALLBACK_API}/${fromCode}`, { signal: controller.signal })
    if (!res.ok) throw new CurrencyError(`HTTP ${res.status}`, "No se pudo obtener la tasa de cambio en este momento.")

    const data = await res.json().catch(() => null) as { result?: string; rates?: Record<string, number> } | null
    if (!data || data.result !== "success" || !data.rates) {
      throw new CurrencyError("Respuesta inválida", "El servicio de tasas de cambio no respondió correctamente.")
    }

    const rate = data.rates[toCode]
    if (typeof rate !== "number" || !Number.isFinite(rate)) {
      throw new CurrencyError("Tasa no encontrada", "No hay tasa de cambio disponible para esa combinación de monedas.")
    }

    return rate
  } catch (error) {
    if (error instanceof CurrencyError) throw error
    if (error instanceof Error && error.name === "AbortError") {
      throw new CurrencyError("Timeout", "El servicio de tasas de cambio tardó demasiado en responder, intenta de nuevo.")
    }
    throw new CurrencyError("Fetch falló", "No se pudo conectar con el servicio de tasas de cambio.")
  } finally {
    clearTimeout(timer)
  }
}

export const getRate = async (fromCode: string, toCode: string): Promise<number> => {
  if (fromCode === toCode) return 1

  try {
    const rate = await getExchangeRate(fromCode, toCode, { cacheDurationMs: CACHE_MS })
    if (typeof rate === "number" && Number.isFinite(rate) && rate > 0) return rate
    throw new CurrencyError("Tasa inválida", "La tasa de cambio recibida no es válida.")
  } catch (primaryError) {
    console.error(
      "[currency] @tamtamchik/exchanger falló, usando respaldo:",
      primaryError instanceof Error ? primaryError.message : primaryError,
    )

    try {
      return await fetchFallbackRate(fromCode, toCode)
    } catch (fallbackError) {
      if (fallbackError instanceof CurrencyError) throw fallbackError
      throw new CurrencyError("Ambos proveedores fallaron", "No se pudo obtener la tasa de cambio, intenta de nuevo más tarde.")
    }
  }
}
