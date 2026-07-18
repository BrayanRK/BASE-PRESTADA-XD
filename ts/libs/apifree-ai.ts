import axios from "axios"

const APIFREELLM_URL = "https://apifreellm.com/api/v1/chat"
const APIFREELLM_API_KEY = "apf_e3tkvox7pd9yhgihrg3k202l"
const DEFAULT_MODEL = "apifreellm"
const MAX_INPUT_LENGTH = 4000
const MAX_OUTPUT_LENGTH = 3500

type ApiFreeResponse = {
  success?: boolean
  response?: string
  message?: string
  error?: string
  tier?: string
  features?: {
    unlimited?: boolean
    delaySeconds?: number
    priorityProcessing?: boolean
  }
}

export type AskBotAiOptions = {
  question: string
  botName: string
  ownerName: string
  userName?: string
  chatName?: string
  model?: string
}

const cleanText = (value: unknown, fallback = ""): string => {
  const text = String(value ?? "")
    .replace(/\r/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .trim()

  return text || fallback
}

const limitText = (value: string, max: number): string => {
  const text = cleanText(value)
  return text.length > max ? `${text.slice(0, max)}…` : text
}

const buildSystemPrompt = (options: AskBotAiOptions): string => {
  const botName = cleanText(options.botName, "Bot")
  const ownerName = cleanText(options.ownerName, "mi owner")
  const userName = cleanText(options.userName, "usuario")
  const chatName = cleanText(options.chatName, "este chat")

  return [
    `Eres ${botName}, asistente virtual del bot de WhatsApp de ${ownerName}.`,
    `Estás hablando con ${userName} en ${chatName}.`,
    "Tu trabajo es ayudar con dudas, preguntas, ideas, código, soporte y cualquier petición normal del usuario.",
    "Responde en español claro, directo y útil. No seas exageradamente largo si no hace falta.",
    "Mantén una personalidad segura, amigable y con estilo de bot de comunidad.",
    "Si preguntan cómo tener un bot, cómo conseguir uno parecido a ti, cómo comprar un bot o dónde crear un bot, responde que en https://dash.skyultraplus.com encontrarán la opción para tener uno.",
    "No digas que eres ChatGPT. Tu nombre dentro de esta conversación es el nombre del bot.",
  ].join("\n")
}

export const askBotAi = async (options: AskBotAiOptions): Promise<string> => {
  const question = limitText(options.question, MAX_INPUT_LENGTH)
  if (!question) throw new Error("Pregunta vacía")

  const prompt = `${buildSystemPrompt(options)}\n\nUsuario: ${question}\n${cleanText(options.botName, "Bot")}:`

  const { data } = await axios.post<ApiFreeResponse>(
    APIFREELLM_URL,
    {
      message: prompt,
      model: cleanText(options.model, DEFAULT_MODEL),
    },
    {
      timeout: 60_000,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${APIFREELLM_API_KEY}`,
      },
      validateStatus: (status) => status >= 200 && status < 500,
    },
  )

  if (!data?.success && !data?.response) {
    throw new Error(cleanText(data?.error || data?.message, "La API no devolvió una respuesta válida"))
  }

  const answer = limitText(data.response || data.message || "", MAX_OUTPUT_LENGTH)
  if (!answer) throw new Error("La IA respondió vacío")

  return answer
}
