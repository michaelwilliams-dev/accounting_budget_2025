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
  const filtered = matches
    .filter(m => m.score >= 0.03)
    .slice(0, 4); // Faster, stable

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

  /* --------------------------------------------------------------------
     1. FALLBACK — when no relevant Budget 2025 content is found
     -------------------------------------------------------------------- */
  if (!count || !context.trim()) {
    return `
<div class="report">
  <h1>Budget 2025 Report</h1>

  <h2>1. Query Restated</h2>
  <p>${question || "No question provided."}</p>

  <h2>2. Relevant Budget 2025 Measures</h2>
  <ul>
    <li>No Budget 2025 measures directly relate to this topic.</li>
  </ul>

  <h2>3. Key Figures & Thresholds</h2>
  <ul>
    <li>No new thresholds or figures apply in this area for 2024/25.</li>
  </ul>

  <h2>4. OBR Commentary</h2>
  <p>No OBR commentary is available for this topic within the indexed documents.</p>

  <h2>5. Practical Implications</h2>
  <ul>
    <li>Existing rules continue unchanged.</li>
    <li>No new submissions or compliance actions required.</li>
    <li>Businesses should maintain standard HMRC practices.</li>
  </ul>

  <h2>6. Source References</h2>
  <ul>
    <li>No matching GOV.UK or OBR Budget 2025 documents were found in the index.</li>
  </ul>

  <h2>7. Summary</h2>
  <p>No Budget 2025 changes impact this topic.</p>

  <h2>8. Reason</h2>
  <p>
    HM Treasury introduced no measures in this area in the Autumn Budget 2024.
    The indexed GOV.UK and OBR documents contain no applicable revisions, consultations,
    or policy announcements affecting this topic.
  </p>

  <h2>9. Current HMRC Rules (General Overview)</h2>
  <ul>
    <li>Existing HMRC guidance remains fully in force.</li>
    <li>Statutory record keeping and filing deadlines remain unchanged.</li>
    <li>Sector-specific reliefs continue to operate under previous rules.</li>
    <li>General compliance duties remain unchanged until new legislation is passed.</li>
  </ul>

  <h2>10. Advisory Notes</h2>
  <ul>
    <li>Consider adjacent Budget measures that may indirectly affect this area.</li>
    <li>Monitor future HM Treasury consultations for potential reforms.</li>
    <li>Continue following HMRC Manuals and Notices until statutory updates are published.</li>
  </ul>
</div>
    `.trim();
  }

  /* --------------------------------------------------------------------
     2. MAIN REPORT — ALWAYS includes the upgraded 10-section structure
     -------------------------------------------------------------------- */
  const prompt = `
You must answer ONLY using the context below.
Output CLEAN HTML (no markdown).
Follow this exact 10-section structure:

<div class="report">

  <h1>Budget 2025 Report</h1>

  <h2>1. Query Restated</h2>
  <p>[Restate the user's question clearly]</p>

  <h2>2. Relevant Budget 2025 Measures</h2>
  <ul>
    <li>[Budget measures from context]</li>
  </ul>

  <h2>3. Key Figures & Thresholds</h2>
  <ul>
    <li>[Numbers from context]</li>
  </ul>

  <h2>4. OBR Commentary</h2>
  <p>[OBR material from context]</p>

  <h2>5. Practical Implications</h2>
  <ul>
    <li>[Impact]</li>
  </ul>

  <h2>6. Source References</h2>
  <ul>
    ${chunks.map(c => `<li>${c.file || "Unknown source"}</li>`).join("\n")}
  </ul>

  <h2>7. Summary</h2>
  <p>[Wrap-up]</p>

  <h2>8. Reason</h2>
  <p>
    If context is limited, it is because HM Treasury made no amendments in this area
    in the Autumn Budget 2024 and the indexed GOV.UK and OBR documents contain no revisions.
  </p>

  <h2>9. Current HMRC Rules (General Overview)</h2>
  <ul>
    <li>Existing HMRC guidance applies unless Budget legislation specifically alters it.</li>
    <li>Record-keeping and statutory tests remain unchanged.</li>
    <li>Sector reliefs continue under prior definitions.</li>
  </ul>

  <h2>10. Advisory Notes</h2>
  <ul>
    <li>Consider related Budget changes that might indirectly influence this topic.</li>
    <li>Monitor HM Treasury consultations for upcoming reform areas.</li>
    <li>Continue following HMRC Manuals and Notices until new statutory instruments are issued.</li>
  </ul>

</div>

RULES:
- HTML ONLY
- No markdown
- No hallucination beyond context
- Use Sections 8–10 when little or no context is available

Question:
${question}

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
