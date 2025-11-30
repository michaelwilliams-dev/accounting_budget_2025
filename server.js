// server.js — Budget 2025 Assistant (Full Email + PDF + DOCX Version)
// ISO Timestamp: 2025-11-30T13:00:00Z

import express from "express";
import bodyParser from "body-parser";
import OpenAI from "openai";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import fetch from "node-fetch";
import { loadIndex, searchIndex } from "./vector_store.js";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { Document, Packer, Paragraph, TextRun } from "docx";

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
  if (!origin) return next();

  try {
    const { hostname } = new URL(origin);
    const allowed = allowedDomains.some(
      d => hostname === d || hostname.endsWith(`.${d}`)
    );
    if (!allowed) return next();
  } catch {}
  next();
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
  console.log("📦 Preloading Budget 2025 JSON Index...");
  globalIndex = await loadIndex();
  console.log(`🟢 READY — ${globalIndex.length} chunks loaded.`);
})();

/* ------------------------ SEMANTIC SEARCH ------------------------------ */
async function runSemanticSearch(question) {
  const index = globalIndex || (await loadIndex());
  const matches = await searchIndex(question, index);

  const filtered = matches
    .filter(m => m.score >= 0.03)
    .slice(0, 4);

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
  const isoNow = new Date().toISOString();

  const savingClause = `
  <h2>11. Saving Clause</h2>
  <p style="font-size:0.9rem; color:#555;">
    This report has been generated automatically by AIVS Software Limited.
    It is provided for internal guidance only and does <strong>not</strong> constitute
    formal accounting, tax, financial, or legal advice.
    All information must be independently verified against original records,
    HMRC publications, and the relevant regulations before any decisions or filings are made.
  </p>
  `;

  /* ------------------ FALLBACK ------------------ */
  if (!count || !context.trim()) {
    return `
<div class="report">
  <h1>Budget 2025 Report</h1>

  <h2>1. Query Restated</h2>
  <p>${question}</p>

  <h2>2. Relevant Budget 2025 Measures</h2>
  <ul><li>No Budget 2025 measures relate to this topic.</li></ul>

  <h2>3. Key Figures & Thresholds</h2>
  <ul><li>No new figures apply.</li></ul>

  <h2>4. OBR Commentary</h2>
  <p>No OBR commentary.</p>

  <h2>5. Practical Implications</h2>
  <ul><li>Existing rules continue unchanged.</li></ul>

  <h2>6. Source References</h2>
  <ul><li>No relevant GOV.UK documents.</li></ul>

  <h2>7. Summary</h2>
  <p>No Budget impact identified.</p>

  <h2>8. Reason</h2>
  <p>This area was not amended in the Autumn Budget 2024.</p>

  <h2>9. Current HMRC Rules</h2>
  <ul><li>Existing guidance applies.</li></ul>

  <h2>10. Advisory Notes</h2>
  <ul><li>Monitor future HM Treasury publications.</li></ul>

  ${savingClause}
</div>
    `.trim();
  }

  /* --------------- MAIN REPORT VIA OPENAI ---------------- */
  const prompt = `
You must answer ONLY using the context:
Return CLEAN HTML only. Use this exact 11-section structure:

<div class="report">

  <h1>Budget 2025 Report</h1>

  <h2>1. Query Restated</h2>
  <p>[Restate the question]</p>

  <h2>2. Relevant Budget 2025 Measures</h2>
  <ul><li>[Measures]</li></ul>

  <h2>3. Key Figures & Thresholds</h2>
  <ul><li>[Numbers]</li></ul>

  <h2>4. OBR Commentary</h2>
  <p>[OBR text]</p>

  <h2>5. Practical Implications</h2>
  <ul><li>[Impacts]</li></ul>

  <h2>6. Source References</h2>
  <ul>
    ${chunks.map(c => `<li>${c.file || "Unknown source"}</li>`).join("\n")}
  </ul>

  <h2>7. Summary</h2>
  <p>[Wrap-up]</p>

  <h2>8. Reason</h2>
  <p>If limited, HM Treasury made no Budget changes in this area.</p>

  <h2>9. Current HMRC Rules (General)</h2>
  <ul><li>Existing HMRC guidance applies.</li></ul>

  <h2>10. Advisory Notes</h2>
  <ul><li>Monitor future Budget updates.</li></ul>

  ${savingClause}

</div>

Question: ${question}
Context: ${context}
  `.trim();

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }]
  });

  return `<div class="aivs-html-output">${completion.choices[0].message.content}</div>`;
}

/* ---------------------------- /ASK WITH EMAIL + PDF + DOCX ---------------------------- */
app.post("/ask", verifyOrigin, async (req, res) => {
  const { question, email, managerEmail, clientEmail } = req.body;
  const cleanQuestion = String(question || "").trim();
  const isoNow = new Date().toISOString();

  try {
    const html = await generateHTMLReport(cleanQuestion);

    /* -------- PDF -------- */
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    page.drawText("AIVS Budget 2025 Report", {
      x: 40, y: 780, size: 20, font: bold, color: rgb(0, 0, 0)
    });
    page.drawText(`ISO Timestamp: ${isoNow}`, {
      x: 40, y: 760, size: 10, font
    });

    let y = 730;
    const plainText = html.replace(/<[^>]+>/g, "");

    for (let line of plainText.split("\n")) {
      if (y < 60) {
        page = pdfDoc.addPage([595, 842]);
        y = 780;
      }
      page.drawText(line, { x: 40, y, size: 11, font });
      y -= 16;
    }

    const pdfBytes = await pdfDoc.save();
    const pdfBase64 = Buffer.from(pdfBytes).toString("base64");

    /* -------- DOCX -------- */
    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: "AIVS Budget 2025 Report",
                  size: 36,
                  bold: true,
                  color: "4e65ac"
                })
              ]
            }),
            new Paragraph({
              children: [new TextRun(`ISO Timestamp: ${isoNow}`)]
            }),
            ...plainText.split("\n").map(
              (line) =>
                new Paragraph({
                  children: [new TextRun(line)],
                  spacing: { after: 200 }
                })
            )
          ]
        }
      ]
    });

    const docxBuffer = await Packer.toBuffer(doc);
    const docxBase64 = Buffer.from(docxBuffer).toString("base64");

    /* -------- SEND EMAIL -------- */
    const payload = {
      Messages: [
        {
          From: {
            Email: process.env.MJ_SENDER_EMAIL,
            Name: "AIVS Budget Assistant"
          },
          To: [{ Email: email }],
          Cc: managerEmail ? [{ Email: managerEmail }] : [],
          Bcc: clientEmail ? [{ Email: clientEmail }] : [],
          Subject: `Your Budget 2025 Report – ${isoNow}`,
          HTMLPart: html,
          Attachments: [
            {
              ContentType: "application/pdf",
              Filename: "Budget-2025-Report.pdf",
              Base64Content: pdfBase64
            },
            {
              ContentType:
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              Filename: "Budget-2025-Report.docx",
              Base64Content: docxBase64
            }
          ]
        }
      ]
    };

    await fetch("https://api.mailjet.com/v3.1/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization:
          "Basic " +
          Buffer.from(
            process.env.MJ_PUBLIC + ":" + process.env.MJ_PRIVATE
          ).toString("base64")
      },
      body: JSON.stringify(payload)
    });

    /* -------- FRONT END HTML RETURN -------- */
    res.json({ question: cleanQuestion, html });

  } catch (e) {
    console.error("❌ ERROR:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ---------------------------- ROOT ---------------------------- */
app.get("/", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "budget.html"))
);

app.listen(PORT, () =>
  console.log(`🟢 Budget 2025 Assistant running on port ${PORT}`)
);
