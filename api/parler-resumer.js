// Fonction serverless Vercel pour « Parler et résumer ».
// Les secrets sont lus uniquement depuis les variables d’environnement Vercel.

const { timingSafeEqual } = require("node:crypto");

const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const GROQ_TIMEOUT_MS = 22000;
const ALLOWED_CONTENT_TYPES = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav"
]);

const ACTIVITY_OPTIONS = [
  "Café", "Bar", "Restaurant", "Salon de thé", "Crêperie", "Gaufres",
  "Brunch", "Pâtisserie", "Bubble tea", "Épicerie", "À emporter", "Livraison"
];
const CUISINE_OPTIONS = [
  "Française", "Tourangelle", "Coréenne", "Chinoise", "Japonaise", "Thaïlandaise",
  "Vietnamienne", "Indienne", "Africaine", "Italienne", "Libanaise", "Turque",
  "Végétarienne", "Vegan"
];

function readRawBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let settled = false;

    const fail = error => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    req.on("data", chunk => {
      if (settled) return;
      total += chunk.length;
      if (total > maxBytes) {
        fail(Object.assign(new Error("payload_too_large"), { code: "PAYLOAD_TOO_LARGE" }));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks));
    });
    req.on("error", fail);
  });
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

function isSameOriginRequest(req) {
  const origin = String(req.headers.origin || "").trim();
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "")
    .split(",")[0]
    .trim();
  if (!origin || !host) return false;

  try {
    const originUrl = new URL(origin);
    const localDevelopment = ["localhost", "127.0.0.1"].includes(originUrl.hostname);
    return originUrl.host === host && (originUrl.protocol === "https:" || localDevelopment);
  } catch {
    return false;
  }
}

function sanitizedList(list, allowed) {
  if (!Array.isArray(list)) return [];
  const clean = list
    .filter(value => typeof value === "string")
    .map(value => value.trim())
    .filter(Boolean)
    .filter(value => !allowed || allowed.includes(value));
  return [...new Set(clean)].slice(0, 8);
}

function emptyResult(extra = {}) {
  return {
    transcription: "",
    resume: "",
    activities: [],
    cuisines: [],
    services: [],
    keywords: [],
    ...extra
  };
}

async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  if (!isSameOriginRequest(req)) {
    res.status(403).json({ error: "forbidden_origin" });
    return;
  }

  if (!process.env.TOURS_ICI_ADMIN_KEY || !safeEqual(req.headers["x-admin-key"], process.env.TOURS_ICI_ADMIN_KEY)) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  if (!process.env.GROQ_API_KEY) {
    res.status(500).json({ error: "server_misconfigured" });
    return;
  }

  const announcedLength = Number(req.headers["content-length"] || 0);
  if (Number.isFinite(announcedLength) && announcedLength > MAX_AUDIO_BYTES) {
    res.status(413).json({ error: "payload_too_large" });
    return;
  }

  const contentType = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    res.status(415).json({ error: "unsupported_media_type" });
    return;
  }

  let audioBuffer;
  try {
    audioBuffer = await readRawBody(req, MAX_AUDIO_BYTES);
  } catch (error) {
    res.status(error.code === "PAYLOAD_TOO_LARGE" ? 413 : 400).json({
      error: error.code === "PAYLOAD_TOO_LARGE" ? "payload_too_large" : "invalid_body"
    });
    return;
  }

  if (!audioBuffer.length) {
    res.status(400).json({ error: "empty_audio" });
    return;
  }

  let transcription = "";
  try {
    const extension = (contentType.split("/")[1] || "webm").replace("x-", "");
    const form = new FormData();
    form.append("file", new Blob([audioBuffer], { type: contentType }), `note.${extension}`);
    form.append("model", "whisper-large-v3-turbo");
    form.append("language", "fr");
    form.append("response_format", "json");
    form.append("temperature", "0");

    const whisperResponse = await fetchWithTimeout(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        body: form
      },
      GROQ_TIMEOUT_MS
    );

    if (!whisperResponse.ok) {
      res.status(whisperResponse.status === 429 ? 429 : 502).json({ error: "transcription_failed" });
      return;
    }

    const whisperJson = await whisperResponse.json();
    transcription = String(whisperJson.text || "").trim().slice(0, 6000);
  } catch (error) {
    const timedOut = error?.name === "AbortError";
    res.status(timedOut ? 504 : 502).json({ error: timedOut ? "transcription_timeout" : "transcription_failed" });
    return;
  }

  if (transcription.length < 3) {
    res.status(200).json(emptyResult({ warning: "empty_transcription" }));
    return;
  }

  const prompt = `Tu aides à rédiger la fiche d’un établissement local à Tours (France) à partir d’une note vocale retranscrite automatiquement.
Corrige l’orthographe et la grammaire, retire les répétitions et hésitations, puis rédige un résumé professionnel, naturel et factuel en français, en 2 à 3 phrases maximum.
N’invente aucune information absente de la transcription.
Choisis les activités et cuisines uniquement dans les listes autorisées par le schéma.
Le champ services doit reprendre les activités pertinentes.
Ajoute jusqu’à 5 mots-clés courts, factuels et utiles.

Transcription :
${transcription}`;

  try {
    const chatResponse = await fetchWithTimeout(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "openai/gpt-oss-20b",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.3,
          max_completion_tokens: 500,
          reasoning_format: "hidden",
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "tours_ici_place_summary",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  resume: { type: "string" },
                  activities: { type: "array", items: { type: "string", enum: ACTIVITY_OPTIONS } },
                  cuisines: { type: "array", items: { type: "string", enum: CUISINE_OPTIONS } },
                  services: { type: "array", items: { type: "string", enum: ACTIVITY_OPTIONS } },
                  keywords: { type: "array", items: { type: "string" } }
                },
                required: ["resume", "activities", "cuisines", "services", "keywords"],
                additionalProperties: false
              }
            }
          }
        })
      },
      GROQ_TIMEOUT_MS
    );

    if (!chatResponse.ok) {
      res.status(200).json(emptyResult({
        transcription,
        warning: chatResponse.status === 429 ? "summary_rate_limited" : "summary_failed"
      }));
      return;
    }

    const chatJson = await chatResponse.json();
    const rawContent = chatJson.choices?.[0]?.message?.content || "{}";

    let aiPayload;
    try {
      aiPayload = JSON.parse(rawContent);
    } catch {
      res.status(200).json(emptyResult({ transcription, warning: "summary_invalid" }));
      return;
    }

    res.status(200).json({
      transcription,
      resume: typeof aiPayload.resume === "string" ? aiPayload.resume.trim().slice(0, 600) : "",
      activities: sanitizedList(aiPayload.activities, ACTIVITY_OPTIONS),
      cuisines: sanitizedList(aiPayload.cuisines, CUISINE_OPTIONS),
      services: sanitizedList(aiPayload.services, ACTIVITY_OPTIONS),
      keywords: sanitizedList(aiPayload.keywords).map(value => value.slice(0, 30)).slice(0, 5)
    });
  } catch (error) {
    const timedOut = error?.name === "AbortError";
    res.status(200).json(emptyResult({
      transcription,
      warning: timedOut ? "summary_timeout" : "summary_failed"
    }));
  }
}

module.exports = handler;
module.exports.config = {
  api: {
    bodyParser: false
  }
};
