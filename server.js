// server.js — Budget 2025 Assistant (pure-JS version)
// ISO Timestamp: 🕒 2025-10-15T02:10:00Z

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
  "accounting-budget-2025.onrender.com"
];

function verifyOrigin(req, res, next) {
  const origin = req.get("Origin");
  if (!origin) return res.status(403).json({ error: "Forbidden – no Origin header" });

  try {
    const { hostname } = new URL(origin);
    const allowed = allowedDomains.some(
      (d) => hostname === d || hostname.endsWith(`.${d}`)
    );
    if (!allowed) return res.status(403).json({ error: "Forbidden – Origin not allowed", origin });

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

/* ------------------------- Load Index --------------------------- */
let globalIndex = null;

(async () => {
  try {
    console.log("📦 Preloading Budget 2025 Vector Index...");
    globalIndex = await loadIndex();
    console.log(`✅ Loaded ${globalIndex.length} Budget embedding chunks.`);
  } catch (e) {
    console.error("❌ Preload failed:", e.message);
  }
})();

/* --------------------------- FAISS Search ----------------------------- */
async function queryFaissIndex(question) {
  try {
    const index = globalIndex || (await loadIndex());
    const matches = await searchIndex(question, index);
    const filtered = matches.filter((m) => m.score >= 0.03);
    const texts = filtered.map((m) => m.text);
    console.log(`🔎 Found ${texts.length} chunks for “${question}”`);
    return { joined: texts.join("\n\n"), count: filtered.length };
  } catch {
    return { joined: "", count: 0 };
  }
}

/* ----------------------- Budget 2025 Report Generator ----------------------------- */
async function generateBudget2025Report(query) {
  const { joined, count } = await queryFaissIndex(query);
  let context = joined;

  if (context.length > 50000) context = context.slice(0, 50000);

  const prompt = `
You are analysing the official UK Autumn Budget 2025 documentation.

Use ONLY the extracted text provided below:
• Autumn Budget 2025 Red Book
• Office for Budget Responsibility (OBR) Economic & Fiscal Outlook (EFO)
• HM Treasury Policy Costings
• TIINs (Tax Information and Impact Notes)
• Any other supporting Budget 2025 documents

RULES:
- If the context does not contain enough information, reply:
  "The Budget 2025 documents provided do not answer this question."
- Do NOT guess.
- Do NOT invent policy.
- Do NOT use prior knowledge beyond this context.

Question: "${query}"

Structure:
1. Query
2. Relevant Budget 2025 measures
3. Key figures & thresholds mentioned
4. OBR commentary 
5. Practical implications
6. Source references (Red Book, OBR, TIIN)
7. Plain English wrap-up

Context:
${context}`.trim();

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
  });

  return completion.choices[0].message.content.trim();
}

/* --------------------------- PDF Helper ------------------------------- */
function sanitizeForPdf(txt = "") {
  return String(txt).replace(/[^\x09\x0A\x0D\x20-\x7E£–—]/g, "").trim();
}

async function buildPdfBufferStructured({ fullName, ts, question, reportText }) {
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage();
  let { width, height } = page.getSize();

  const fontBody = await pdfDoc.embedStandardFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedStandardFont(StandardFonts.HelveticaBold);

  const fsTitle = 16;
  const fsBody = 11;
  const margin = 50;
  const lh = fsBody * 1.4;

  const draw = (txt, x, y, size, font) =>
    page.drawText(String(txt), { x, y, size, font });

  let y = height - margin;

  const ensure = () => {
    if (y - lh < margin) {
      page = pdfDoc.addPage();
      ({ width, height } = page.getSize());
      y = height - margin;
    }
  };

  const wrap = (txt, x, maxWidth, size = fsBody, font = fontBody) => {
    const words = String(txt).split(/\s+/);
    let cur = "";
    const rows = [];

    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(test, size) > maxWidth && cur) {
        rows.push(cur);
        cur = w;
      } else cur = test;
    }
    rows.push(cur);
    return rows;
  };

  const para = (txt, x, size = fsBody, font = fontBody) => {
    for (const line of wrap(sanitizeForPdf(txt), x, width - x - margin, size, font)) {
      ensure();
      draw(line, x, y, size, font);
      y -= lh;
    }
  };

  draw("Budget 2025 Report", margin, y, fsTitle, fontBold);
  y -= fsTitle * 1.4;
  para(`Prepared for: ${fullName || "N/A"}`, margin);
  para(`Timestamp (UK): ${ts}`, margin);
  para(question, margin);
  para(reportText, margin);

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

/* ------------------------------ /ask ---------------------------------- */
app.post("/ask", verifyOrigin, async (req, res) => {
  const { question, email, managerEmail, clientEmail } = req.body || {};
  if (!question) return res.status(400).json({ error: "Missing question" });

  try {
    const ts = new Date().toISOString();
    const reportText = await generateBudget2025Report(question);
    const pdfBuf = await buildPdfBufferStructured({
      fullName: email,
      ts,
      question,
      reportText,
    });

    res.json({ question, answer: reportText, timestamp: ts });
  } catch (err) {
    res.status(500).json({ error: "Report generation failed" });
  }
});

/* ------------------------------ Root Route ---------------------------- */
app.get("/", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "budget.html"))
);

app.listen(Number(PORT), "0.0.0.0", () =>
  console.log(`🟢 Budget 2025 Assistant running on port ${PORT}`)
);
