// server.js — Budget Assistant (pure-JS version)
// ISO Timestamp: 🕒 2025-11-07T09:10:00Z

import express from "express";
import bodyParser from "body-parser";
import OpenAI from "openai";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fetch from "node-fetch";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { Buffer } from "buffer";
import { loadIndex, searchIndex } from "./vector_store.js";
import cors from "cors";

dotenv.config();
const app = express();
app.use(cors());
app.options("*", cors());

/* --------------------------- Origin Security ---------------------------- */
const allowedDomains = [
  "assistants.aivs.uk",
  "accounting-budget-2025.onrender.com",
  "budget-assistant.onrender.com",
  "localhost"
];

function verifyOrigin(req, res, next) {
  const origin = req.get("Origin");
  if (!origin) return res.status(403).json({ error: "Forbidden" });

  try {
    const { hostname } = new URL(origin);
    const allowed = allowedDomains.some(
      (d) => hostname === d || hostname.endsWith(`.${d}`)
    );
    if (!allowed)
      return res.status(403).json({ error: "Origin not allowed", origin });

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

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* ------------------------- Cached FAISS Index --------------------------- */
let globalIndex = null;
(async () => {
  try {
    console.log("📦 Preloading FAISS vector index (Budget Assistant)...");
    globalIndex = await loadIndex(10000);
    console.log(`✅ Preloaded ${globalIndex.length} vectors.`);
  } catch (e) {
    console.error("❌ Preload failed:", e.message);
  }
})();

/* --------------------------- FAISS Search ----------------------------- */
async function queryFaissIndex(question) {
  try {
    const index = globalIndex || (await loadIndex(10000));
    const matches = await searchIndex(question, index);

    // ✅ FIX: Use chunk instead of text
    const filtered = matches.filter((m) => m.score >= 0.03);
    const texts = filtered.map((m) => m.chunk);

    console.log(`🔎 Found ${texts.length} chunks for “${question}”`);
    return { joined: texts.join("\n\n"), count: filtered.length };
  } catch (err) {
    console.error("❌ FAISS query failed:", err.message);
    return { joined: "", count: 0 };
  }
}

/* ----------------------- Report Generator ----------------------------- */
async function generateBudgetReport(query) {
  const { joined, count } = await queryFaissIndex(query);

  let context = joined;
  if (context.length > 50000) context = context.slice(0, 50000);

  // ✅ FIX: Correct strict RAG prompt
  const prompt = `
You are the AIVS UK Budget Retrieval Engine.

You must answer ONLY using the context provided below.
The context contains FAISS-retrieved chunks from:
- Autumn Budget 2025 Red Book
- Policy Costings
- TIINs
- OBR EFO
- HMT official publications

RULES:
- If the answer is not found in the context, reply:
  "The Budget 2025 documents do not provide this information."
- Do NOT guess.
- Do NOT invent figures or policy.
- Do NOT use prior knowledge.
- Stay strictly inside the supplied Budget 2025 context.

Question: "${query}"

Structure:
1. Query
2. Summary of Measures (Budget-only)
3. Fiscal & Economic Impact
4. Business/Household Implications
5. Key Figures & Dates (ONLY if found in context)
6. Document Source References
7. Wrap-up

Context:
${context}`.trim();

  const completion = await openai.chat.completions.create({
    model: "gpt-5",
    messages: [{ role: "user", content: prompt }],
  });

  let text = completion.choices[0].message.content.trim();
  text = text.replace(/8\)\s*Appendix[\s\S]*$/gi, "").trim();

  // --- ISO 42001 fairness check ---
  let fairnessResult = "";
  try {
    const fairnessCheck = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are an ISO 42001 fairness auditor. Identify any gender, age, racial, or cultural bias in the text below. Respond 'No bias detected' if compliant.",
        },
        { role: "user", content: text },
      ],
    });
    fairnessResult = fairnessCheck.choices[0].message.content.trim();
  } catch (e) {
    fairnessResult = "Fairness verification failed: " + e.message;
  }

  const now = new Date();
  const dateSeed = `${String(now.getFullYear()).slice(2)}${String(
    now.getMonth() + 1
  ).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const randomPart = Math.floor(1000 + Math.random() * 9000);
  const regRand = `${dateSeed}-${randomPart}`;

  const footer = `
This report was prepared using the AIVS FAISS-indexed Autumn Budget 2025 data,
derived entirely from verified UK Treasury and OBR publications.

ISO 42001 Fairness Verification: ${fairnessResult}
Reg. No. AIVS/UK/BUDG/${regRand}/${count}
© AIVS Software Limited 2025 — All rights reserved.`;

  return `${text}\n\n${footer}`;
}

/* ------------------------------ /ask ---------------------------------- */
app.post("/ask", verifyOrigin, async (req, res) => {
  const { question, email, managerEmail, clientEmail } = req.body || {};
  if (!question) return res.status(400).json({ error: "Missing question" });

  try {
    const ts = new Date().toISOString();
    const reportText = await generateBudgetReport(question);

    const pdfBuf = await buildPdfBufferStructured({
      fullName: email,
      ts,
      question,
      reportText,
    });

    const docParagraphs = [];

    docParagraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "BUDGET ASSISTANT REPORT",
            bold: true,
            size: 32,
          }),
        ],
        alignment: "center",
      })
    );

    const lines = String(reportText)
      .replace(/\n{2,}/g, "\n")
      .split(/\n| {2,}/);

    for (const raw of lines) {
      const t = raw.trim();
      if (!t) {
        docParagraphs.push(new Paragraph(""));
        continue;
      }
      if (t.startsWith("This report was prepared using")) break;

      docParagraphs.push(
        new Paragraph({
          children: [new TextRun({ text: t, size: 22 })],
        })
      );
    }

    const now = new Date();
    const dateSeed = `${String(now.getFullYear()).slice(2)}${String(
      now.getMonth() + 1
    ).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const randomPart = Math.floor(1000 + Math.random() * 9000);
    const regRand = `${dateSeed}-${randomPart}`;

    const footerText = `
This report was prepared using the AIVS FAISS-indexed Autumn Budget 2025 data,
derived entirely from verified UK Treasury and OBR publications.

Reg. No. AIVS/UK/BUDG/${regRand}/${globalIndex ? globalIndex.length : 0}
© AIVS Software Limited 2025 — All rights reserved.`;

    docParagraphs.push(
      new Paragraph({
        children: [new TextRun({ text: footerText, italics: true, size: 20 })],
      })
    );

    const doc = new Document({ sections: [{ children: docParagraphs }] });
    const docBuf = await Packer.toBuffer(doc);

    res.json({ question, answer: reportText, timestamp: ts });
  } catch (err) {
    res.status(500).json({ error: "Report generation failed" });
  }
});

app.get("/", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "budget.html"))
);

app.listen(Number(PORT), "0.0.0.0", () =>
  console.log(`🟢 Budget Assistant running on port ${PORT}`)
);
