// server.js — Budget 2025 Assistant (Accounting-style version)
// ISO Timestamp: 2025-11-28T23:12:00Z

import express from "express";
import bodyParser from "body-parser";
import OpenAI from "openai";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import { loadIndex, searchIndex } from "./vector_store.js";

dotenv.config();
const app = express();
app.use(cors());
app.options("*", cors());

/* --------------------------- Origin Security ---------------------------- */
const allowedDomains = [
  "assistants.aivs.uk",
  "accounting-budget-2025.onrender.com"
];

function verifyOrigin(req, res, next) {
  const origin = req.get("Origin");
  if (!origin) return res.status(403).json({ error: "Forbidden – no Origin header" });

  try {
    const { hostname } = new URL(origin);
    const allowed = allowedDomains.some(
      d => hostname === d || hostname.endsWith(`.${d}`)
    );
    if (!allowed)
      return res.status(403).json({ error: "Forbidden – Origin not allowed" });

    next();
  } catch {
    return res.status(400).json({ error: "Invalid Origin header" });
  }
}
/* ----------------------------------------------------------------------- */

const PORT = process.env.PORT || 10000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* ------------------------- Load Index --------------------------- */
let globalIndex = [];

(async () => {
  try {
    console.log("📦 Preloading Budget 2025 JSON Index...");
    globalIndex = await loadIndex();
    console.log(`🟢 READY — ${globalIndex.length} chunks loaded.`);
  } catch (e) {
    console.error("❌ Preload failed:", e.message);
  }
})();

/* --------------------------- Ask Route --------------------------- */
app.post("/ask", verifyOrigin, async (req, res) => {
  const { question } = req.body || {};
  if (!question) return res.status(400).json({ error: "Missing question" });

  const cleanQuestion = String(question).trim();
  const matches = await searchIndex(cleanQuestion, globalIndex);

  // join matched chunks
  const context = matches.map(m => m.text).join("\n\n");

  const prompt = `
You are analysing the official UK Autumn Budget 2025 documentation.

Use ONLY the text provided below.

RULES:
- If the Budget 2025 content does NOT answer the question, reply exactly:
  "The Budget 2025 documents provided do not answer this question."
- No external knowledge.
- No assumptions.
- Only answer from the extracted text.

QUESTION:
"${cleanQuestion}"

CONTEXT:
${context}
  `.trim();

  try {
    const ai = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }]
    });

    const answer = ai.choices[0].message.content.trim();
    res.json({ answer, chunks_used: matches.length });
  } catch (err) {
    console.error("❌ OpenAI error:", err);
    res.status(500).json({ error: "AI processing failed" });
  }
});

/* --------------------------- Root --------------------------- */
app.get("/", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "budget.html"))
);

app.listen(Number(PORT), "0.0.0.0", () =>
  console.log(`🟢 Budget Assistant running on port ${PORT}`)
);
