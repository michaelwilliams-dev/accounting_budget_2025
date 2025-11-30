// server.js — Budget 2025 Assistant (HTML-output version)
// ISO Timestamp: 2025-11-29T10:55:00Z

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

/* --------------------------- ORIGIN SECURITY ---------------------------- */
const allowedDomains = [
  "assistants.aivs.uk",
  "accounting-budget-2025.onrender.com"
];

function verifyOrigin(req, res, next) {
  const origin = req.get("Origin");
  if (!origin)
    return res.status(403).json({ error: "Forbidden – no Origin header" });

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

const PORT = process.env.PORT || 3002;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.json());

/* ---------------------------- LOAD INDEX ------------------------------- */
let globalIndex = null;

(async () => {
  try {
    console.log("📦 Preloading Budget 2025 JSON Index...");
    globalIndex = await loadIndex();
    console.log(`🟢 READY — ${globalIndex.length} chunks loaded.`);
  } catch (e) {
    console.error("❌ Preload failed:", e.message);
  }
})();

/* ------------------------ SEMANTIC SEARCH WRAPPER ---------------------- */
async function runSemanticSearch(question) {
  const index = globalIndex || (await loadIndex());
  const matches = await searchIndex(question, index);
  const filtered = matches.filter(m => m.score >= 0.03);

  console.log(`🔎 Found ${filtered.length} chunks for "${question}"`);

  return {
    context: filtered.map(m => m.text).join("\n\n"),
    count: filtered.length,
    chunks: filtered
  };
}

/* ---------------------------- REPORT BUILDER ---------------------------- */
async function generateHTMLReport(question) {
  const { context, count, chunks } = await runSemanticSearch(question);

  if (!count || !context.trim()) {
    return `
      <div class="report">
        <h1>Budget 2025 Report</h1>
        <p>The Budget 2025 documents provided do not answer this question.</p>
      </div>
    `;
  }

  // Enforce strict HTML structure for the model
  const prompt = `
You must answer ONLY using the context below.
Answer as CLEAN HTML (not markdown). Follow this structure EXACTLY:

<div class="report">

  <h1>Budget 2025 Report</h1>

  <h2>1. Query Restated</h2>
  <p>[One sentence]</p>

  <h2>2. Relevant Budget 2025 measures</h2>
  <ul>
    <li>[Bullet]</li>
    <li>[Bullet]</li>
  </ul>

  <h2>3. Key Figures & Thresholds</h2>
  <ul>
    <li>[figure if present]</li>
  </ul>

  <h2>4. OBR commentary</h2>
  <p>[Only if in context]</p>

  <h2>5. Practical implications</h2>
  <ul>
    <li>[impact]</li>
  </ul>

  <h2>6. Source References</h2>
  <ul>
    ${chunks
      .map(c => `<li>${c.file || "Unknown file"}</li>`)
      .join("\n")}
  </ul>

  <h2>7. Summary</h2>
  <p>[Short wrap-up]</p>

</div>

RULES:
- HTML ONLY.
- NO markdown.
- NO guessing.
- Use only the supplied context.
- If no info: return the fallback HTML message.

Question:
"${question}"

Context:
${context}
  `.trim();

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
  });

  return `<div class="aivs-html-output">${completion.choices[0].message.content.trim()}</div>`;
}

/* ------------------------------- /ASK ---------------------------------- */
app.post("/ask", verifyOrigin, async (req, res) => {
  const { question } = req.body || {};
  if (!question) return res.status(400).json({ error: "Missing question" });

  const cleanQuestion = String(question).replace(/\s+/g, " ").trim();

  try {
    const html = await generateHTMLReport(cleanQuestion);
    res.json({ question: cleanQuestion, html });
  } catch (err) {
    console.error("❌ Report generation failed:", err);
    res.status(500).json({ error: "Report generation failed" });
  }
});

/* ------------------------------- ROOT ---------------------------------- */
app.get("/", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "budget.html"))
);

app.listen(Number(PORT), "0.0.0.0", () =>
  console.log(`🟢 Budget 2025 Assistant running on port ${PORT}`)
);
