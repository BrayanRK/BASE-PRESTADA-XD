import { randomUUID } from "node:crypto"
import type * as types from "../../../types/types.js"
import { box } from "../../../libs/zeta_texto.js"

const API_KEY_PLACEHOLDER = "COLOCA_AQUI_TU_API_KEY"

const CONFIG = Object.freeze({
  API_KEY: "16c65dcf2247cb736766caaa358feebac55400e83a05a23c".trim(),
  API_URL: "https://api.consultaunica.mx/v3/sc_premium",

  FIRST_POLL_DELAY_MS: 30_000,
  POLL_INTERVAL_MS: 5_000,
  MAX_PROCESSING_TIME_MS: 10 * 60_000,
  HTTP_TIMEOUT_MS: 30_000,
  TRANSIENT_POLL_RETRIES: 3,
})

const CURP_REGEX = /^[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[0-9A-Z][0-9]$/
const RETRIABLE_HTTP_STATUSES = new Set([500, 502, 503, 504])
const activeRequests = new Set<string>()

const API_ERROR_CODES = new Map<string, string>([
  ["invalid_idempotency_key", "invalid_idempotency_key"],
  ["webhookUrl debe ser https y apuntar a un host público accesible", "invalid_webhook_url"],
  ["No se encontró la Clave para realizar consultas", "missing_api_key"],
  ["Cuenta no válida, favor de verificar su clave de consulta", "unauthorized_user"],
  ["Usuario no encontrado", "user_not_found"],
  ["La CURP ingresada no es válida, favor de verificar", "invalid_curp"],
  ["No se encontró información en el IMSS para la CURP ingresada", "no_data_found"],
  ["El IMSS reportó inconsistencias en los datos de esta CURP", "imss_data_inconsistency"],
  ["Ya existe una consulta en curso para esta CURP, espere a que termine antes de reintentar", "duplicate_in_progress"],
  ["El servicio no se encuentra disponible, favor de consultar más tarde", "service_unavailable"],
  ["El sistema se encuentra a máxima capacidad, favor de esperar unos minutos antes de reintentar", "system_at_capacity"],
  ["El servicio de semanas cotizadas premium no está disponible, favor de intentar más tarde", "system_paused"],
  ["No fue posible recuperar el PDF del reporte, favor de reintentar la consulta", "pdf_download_failed"],
  ["Ocurrió un error inesperado, favor de reintentar", "unknown"],
])

class ScPremiumError extends Error {
  status: number
  stage: string
  code: string
  data: any
  uuid: string | null

  constructor({ message, status = 0, stage = "unknown", code = "", data = null, uuid = null, cause = null }: {
    message: string; status?: number; stage?: string; code?: string; data?: any; uuid?: string | null; cause?: unknown
  }) {
    super(message, cause ? { cause } : undefined)
    this.name = "ScPremiumError"
    this.status = status
    this.stage = stage
    this.code = code
    this.data = data
    this.uuid = uuid
  }
}

export const runNssLookup = async (wss: types.WASocket, mctx: types.MessageContext, rawCurp: string): Promise<void> => {
  const curp = normalizeCurp(rawCurp)

  if (!CURP_REGEX.test(curp)) {
    return void (await mctx.reply(box("CURP no válida", [
      "Verifica que contenga 18 caracteres",
      "y esté escrita correctamente.",
    ])))
  }

  if (!isApiKeyConfigured()) {
    return void (await mctx.reply(box("Servicio temporalmente no disponible", [
      "La configuración del servicio debe ser",
      "revisada por el administrador.",
    ])))
  }

  const requestKey = curp
  if (activeRequests.has(requestKey)) {
    return void (await mctx.reply(box("Consulta en proceso", [
      "Ya estamos generando este documento.",
      "Espera a que finalice antes de solicitarlo nuevamente.",
    ])))
  }

  activeRequests.add(requestKey)
  await react(mctx, "⏳")

  let reportUuid = ""

  try {
      const idempotencyKey = createIdempotencyKey()
      const submitData = await submitReport(curp, idempotencyKey)
      reportUuid = extractUuid(submitData)

      if (!reportUuid) {
        throw new ScPremiumError({
          message: "La solicitud no devolvió un identificador.",
          status: 502, stage: "submit_response", code: "missing_uuid", data: submitData,
        })
      }

      const responseCurp = normalizeCurp(submitData.curp)
      const responseNss = extractNss(submitData, null)
      const responseFullName = extractFullName(submitData, null)

      if (responseCurp !== curp || !responseNss || !responseFullName) {
        throw new ScPremiumError({
          message: "La solicitud devolvió datos incompletos.",
          status: 502, stage: "submit_data_validation", code: "invalid_submit_data", data: submitData, uuid: reportUuid,
        })
      }

      const completedData = await waitForReport(reportUuid)
      const pdfBuffer = decodePdf(completedData.pdfBase64, reportUuid)

      await mctx.reply(`✅ Aceptado: ${curp}, ${responseNss}, ${responseFullName}`)

      try {
        await wss.sendMessage(mctx.chat.jid, {
          document: pdfBuffer,
          mimetype: "application/pdf",
          fileName: `${curp}.pdf`,
        })
      } catch (error) {
        throw new ScPremiumError({
          message: "El PDF fue generado, pero WhatsApp no pudo enviarlo.",
          status: 502, stage: "whatsapp_document_send", code: "document_send_failed", uuid: reportUuid, cause: error,
        })
      }

      await react(mctx, "✅")
    } catch (error) {
      const finalError = normalizeError(error, reportUuid)
      logInternalError(finalError)
      await react(mctx, "❌")
      return void (await mctx.reply(formatClientError(curp, finalError)))
    } finally {
      activeRequests.delete(requestKey)
    }
}

export const matchStandaloneCurp = (text: string): string | null => {
  const curp = normalizeCurp(text)
  return CURP_REGEX.test(curp) ? curp : null
}

export default {
  name: "nss",
  alias: [],
  description: "Constancia de Semanas Cotizadas del IMSS.",
  using: "<CURP>",
  category: "lucasxt",
  hidden: true,
  flags: ["all.chats"],
  requires: [],
  execute: async (wss: types.WASocket, ectx: types.CommandExecuteContext) => {
    const { mctx, args, usedPrefix, commandName } = ectx
    const prefix = usedPrefix || "."
    const cmdName = commandName || "nss"
    const curpArg = args.join(" ").trim()

    if (!curpArg) {
      return void (await mctx.reply(box("Constancia de Semanas Cotizadas IMSS", [
        "Escribe el comando seguido de tu CURP,",
        "o mándala sola sin comando:",
        "",
        `${prefix}${cmdName} LOOA531113HTCPBN07`,
      ])))
    }

    await runNssLookup(wss, mctx, curpArg)
  },
} as types.Command

async function submitReport(curp: string, idempotencyKey: string): Promise<any> {
  let lastError: unknown
  const maxAttempts = 3

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await requestJson(CONFIG.API_URL, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "x-api-key": CONFIG.API_KEY,
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({ curp }),
      }, "submit")

      if (!result.response.ok) throw createApiError(result, "submit")

      if (!isPlainObject(result.data)) {
        throw new ScPremiumError({
          message: "El servicio devolvió una respuesta inválida.",
          status: 502, stage: "submit_response", code: "invalid_submit_response", data: result.data,
        })
      }

      return result.data
    } catch (error) {
      lastError = error

      const isConnectionFailure = error instanceof ScPremiumError && ["network_error", "request_timeout"].includes(error.code)
      const isTemporaryServiceFailure = error instanceof ScPremiumError && error.status === 503
      const isInternalServerFailure = error instanceof ScPremiumError && error.status === 500
      const isConcurrentIdempotencyRequest = error instanceof ScPremiumError && error.status === 409

      const canRetry = attempt < maxAttempts && (isConnectionFailure || isInternalServerFailure || isTemporaryServiceFailure || isConcurrentIdempotencyRequest)

      if (!canRetry) throw error

      let retryDelay = 3_000
      if (isTemporaryServiceFailure) retryDelay = 60_000 * (2 ** (attempt - 1))
      else if (isConcurrentIdempotencyRequest) retryDelay = 5_000
      else if (isInternalServerFailure) retryDelay = 5_000 * attempt

      await sleep(retryDelay)
    }
  }

  throw lastError
}

async function waitForReport(uuid: string): Promise<any> {
  const deadline = Date.now() + CONFIG.MAX_PROCESSING_TIME_MS
  let transientFailures = 0

  await sleep(CONFIG.FIRST_POLL_DELAY_MS)

  while (Date.now() < deadline) {
    let result: any

    try {
      result = await requestJson(`${CONFIG.API_URL}/${encodeURIComponent(uuid)}`, {
        method: "GET",
        headers: { accept: "application/json", "x-api-key": CONFIG.API_KEY },
      }, "poll")
    } catch (error) {
      if (shouldRetryPollError(error, transientFailures)) {
        transientFailures += 1
        const canContinue = await sleepBeforeDeadline(CONFIG.POLL_INTERVAL_MS * transientFailures, deadline)
        if (!canContinue) break
        continue
      }
      throw error
    }

    if (!result.response.ok) {
      if (shouldRetryPoll(result.response.status, transientFailures)) {
        transientFailures += 1
        const canContinue = await sleepBeforeDeadline(getPollHttpRetryDelay(result.response.status, transientFailures), deadline)
        if (!canContinue) break
        continue
      }
      throw createApiError(result, "poll", uuid)
    }

    transientFailures = 0

    if (!isPlainObject(result.data)) {
      throw new ScPremiumError({
        message: "El servicio devolvió una respuesta inválida.",
        status: 502, stage: "poll_response", code: "invalid_poll_response", data: result.data, uuid,
      })
    }

    if (Number(result.data.version) !== 1) {
      throw new ScPremiumError({
        message: "El servicio devolvió una versión no compatible.",
        status: 502, stage: "unsupported_version", code: "unsupported_version", data: result.data, uuid,
      })
    }

    const responseUuid = String(result.data.uuid || "").trim()
    if (responseUuid !== String(uuid).trim()) {
      throw new ScPremiumError({
        message: "La respuesta no corresponde a la solicitud realizada.",
        status: 502, stage: "uuid_mismatch", code: "uuid_mismatch", data: result.data, uuid,
      })
    }

    const status = String(result.data.status || "").trim().toLowerCase()

    if (status === "completed") {
      if (!result.data.pdfBase64) {
        throw new ScPremiumError({
          message: "El reporte terminó, pero no devolvió el documento.",
          status: 502, stage: "completed_without_pdf", code: "missing_pdf", data: result.data, uuid,
        })
      }
      return result.data
    }

    if (status === "failed") {
      const message = String(result.data.errorMessage || result.data.message || "").trim()
      throw new ScPremiumError({
        message: message || "La generación del reporte no pudo completarse.",
        status: 422, stage: "report_failed", code: resolveApiErrorCode(message, 422), data: result.data, uuid,
      })
    }

    if (status !== "pending") {
      throw new ScPremiumError({
        message: "El servicio devolvió un estado no reconocido.",
        status: 502, stage: "unknown_status", code: "unknown_status", data: result.data, uuid,
      })
    }

    await sleep(Math.min(CONFIG.POLL_INTERVAL_MS, Math.max(0, deadline - Date.now())))
  }

  throw new ScPremiumError({
    message: "El reporte superó el tiempo máximo de procesamiento.",
    status: 408, stage: "poll_timeout", code: "poll_timeout", uuid,
  })
}

async function requestJson(url: string, options: any, stage: string): Promise<{ response: Response; data: any; raw: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CONFIG.HTTP_TIMEOUT_MS)

  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    const raw = await response.text()
    const data = parseJsonBody(raw)
    return { response, data, raw }
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new ScPremiumError({ message: "El servicio tardó demasiado en responder.", status: 408, stage, code: "request_timeout", cause: error })
    }
    throw new ScPremiumError({ message: "No fue posible conectar con el servicio.", status: 503, stage, code: "network_error", cause: error })
  } finally {
    clearTimeout(timer)
  }
}

function decodePdf(value: string, uuid: string): Buffer {
  if (typeof value !== "string" || !value.trim()) throwPdfError("El documento recibido está vacío.", "pdf_empty", uuid)

  const cleanBase64 = value.replace(/^data:application\/pdf;base64,/i, "").replace(/\s+/g, "")

  if (!isValidBase64(cleanBase64)) throwPdfError("El documento recibido no tiene un formato válido.", "pdf_base64", uuid)

  const pdfBuffer = Buffer.from(cleanBase64, "base64")

  if (!pdfBuffer.length) throwPdfError("El documento recibido está vacío.", "pdf_empty", uuid)
  if (pdfBuffer.subarray(0, 4).toString("ascii") !== "%PDF") throwPdfError("El archivo recibido no corresponde a un PDF válido.", "pdf_signature", uuid)

  return pdfBuffer
}

function createApiError(result: any, stage: string, uuid: string | null = null): ScPremiumError {
  const details = extractApiDetails(result.data, result.raw, result.response.status)
  return new ScPremiumError({
    message: details.message,
    status: result.response.status,
    stage,
    code: details.code,
    data: { ...(isPlainObject(result.data) ? result.data : {}), normalizedDescription: details.description, normalizedErrorCode: details.code },
    uuid,
  })
}

function extractApiDetails(data: any, raw = "", status = 0) {
  let message = ""
  let description = ""

  if (typeof data?.detail === "string") message = data.detail.trim()
  else if (Array.isArray(data?.detail)) message = data.detail.map(formatValidationDetail).join(" | ")
  else if (typeof data?.message === "string") message = data.message.trim()
  else if (typeof data?.error === "string") message = data.error.trim()

  if (typeof data?.description === "string") description = data.description.trim()
  if (!message) message = String(raw || "").trim() || "El servicio devolvió un error."

  return { message, description, code: resolveApiErrorCode(message, status, data) }
}

function resolveApiErrorCode(message: string, status = 0, data: any = null): string {
  const cleanMessage = String(message || "").trim()

  if (API_ERROR_CODES.has(cleanMessage)) return API_ERROR_CODES.get(cleanMessage)!
  if (cleanMessage.startsWith("Debe esperar")) return "rate_limit_exceeded"
  if (cleanMessage.startsWith("Has alcanzado el límite de consultas diarias")) return "insufficient_credits"
  if (status === 401) return "unauthorized_user"
  if (status === 404) return "report_not_found"
  if (status === 409) return "concurrent_idempotent_request"
  if (status === 429) return "rate_limit_exceeded"
  if (status === 503) return "service_unavailable"
  if (status >= 500) return "server_error"
  if (Array.isArray(data?.detail)) return "validation_error"

  return ""
}

function formatValidationDetail(item: any): string {
  const location = Array.isArray(item?.loc) ? item.loc.join(".") : "dato"
  const message = item?.msg || "valor inválido"
  return `${location}: ${message}`
}

function formatClientError(curp: string, error: ScPremiumError): string {
  return `❌ Sobre tu consulta de la CURP ${curp}:\n\n${error.message}`
}

function normalizeError(error: unknown, uuid = ""): ScPremiumError {
  if (error instanceof ScPremiumError) {
    if (!error.uuid && uuid) error.uuid = uuid
    return error
  }
  return new ScPremiumError({ message: (error as any)?.message || String(error), stage: "unexpected", code: "unexpected", uuid, cause: error })
}

function extractUuid(data: any): string {
  return String(data?.uuid || "").trim()
}

function extractNss(submitData: any, completedData: any): string {
  const value = findFirstValue([submitData, completedData], ["nss", "result.nss", "data.nss"])
  return String(value || "").replace(/\D/g, "").trim()
}

function extractFullName(submitData: any, completedData: any): string {
  const fullName = findFirstValue([submitData, completedData], ["fullname", "fullName", "result.fullname", "result.fullName", "data.fullname", "data.fullName"])
  if (fullName) return normalizePersonName(fullName)

  for (const source of [submitData, submitData?.result, submitData?.data, completedData, completedData?.result, completedData?.data]) {
    if (!isPlainObject(source)) continue
    const name = [source.name, source.paternalName, source.maternalName].map(normalizePersonName).filter(Boolean).join(" ")
    if (name) return name
  }
  return ""
}

function findFirstValue(sources: any[], paths: string[]): any {
  for (const source of sources) {
    for (const path of paths) {
      const value = getPath(source, path)
      if (value !== undefined && value !== null && String(value).trim()) return value
    }
  }
  return ""
}

function getPath(source: any, path: string): any {
  return String(path).split(".").reduce((value, key) => (value && typeof value === "object" ? value[key] : undefined), source)
}

function parseJsonBody(raw: string): any {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return { unparsedBody: raw.slice(0, 1000) }
  }
}

function throwPdfError(message: string, code: string, uuid: string): never {
  throw new ScPremiumError({ message, status: 502, stage: code, code, uuid })
}

function shouldRetryPoll(status: number, failures: number): boolean {
  return RETRIABLE_HTTP_STATUSES.has(status) && failures < CONFIG.TRANSIENT_POLL_RETRIES
}

function getPollHttpRetryDelay(status: number, failures: number): number {
  return status === 503 ? 60_000 * (2 ** (failures - 1)) : CONFIG.POLL_INTERVAL_MS * failures
}

function shouldRetryPollError(error: unknown, failures: number): boolean {
  return error instanceof ScPremiumError && ["network_error", "request_timeout"].includes(error.code) && failures < CONFIG.TRANSIENT_POLL_RETRIES
}

function createIdempotencyKey(): string {
  return `nss_${randomUUID().replace(/-/g, "")}`
}

function isApiKeyConfigured(): boolean {
  return Boolean(CONFIG.API_KEY && CONFIG.API_KEY !== API_KEY_PLACEHOLDER)
}

function isPlainObject(value: any): boolean {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function isValidBase64(value: string): boolean {
  return Boolean(value && value.length % 4 !== 1 && /^[A-Za-z0-9+/]*={0,2}$/.test(value))
}

function normalizeCurp(value = ""): string {
  return String(value).trim().replace(/\s+/g, "").toUpperCase()
}

function normalizePersonName(value = ""): string {
  return String(value || "").replace(/\s+/g, " ").trim().toUpperCase()
}

function sleep(milliseconds: number): Promise<void> {
  const delay = Math.max(0, Number(milliseconds) || 0)
  return new Promise((resolve) => setTimeout(resolve, delay))
}

async function sleepBeforeDeadline(milliseconds: number, deadline: number): Promise<boolean> {
  const remaining = Math.max(0, deadline - Date.now())
  if (remaining === 0) return false
  await sleep(Math.min(milliseconds, remaining))
  return Date.now() < deadline
}

async function react(mctx: types.MessageContext, emoji: string): Promise<void> {
  try {
    await mctx.react(emoji)
  } catch {
  }
}

function logInternalError(error: ScPremiumError): void {
  if (String(process.env.SC_PREMIUM_DEBUG || "") !== "1") return
  console.error("[lucasxt:nss]", { status: error.status, stage: error.stage, code: error.code, uuid: error.uuid, message: error.message })
}
