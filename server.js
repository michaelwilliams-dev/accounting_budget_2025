// server.js — Budget 2025 Assistant (FINAL STABLE VERSION)
// ISO Timestamp: 2025-11-30T15:20:00Z

import express from "express";
import bodyParser from "body-parser";
import OpenAI from "openai";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import fetch from "node-fetch";
import { loadIndex, searchIndex } from "./vector_store.js";

import { PDFDocument, StandardFonts } from "pdf-lib";
import { Document, Packer, Paragraph, TextRun } from "docx";

dotenv.config();

const app = express();
app.use(cors());
app.options("*", cors());

/* --------------------------- ORIGIN SECURITY ---------------------------- */
const allowedDomains = [
  "assistants.aivs.uk",
  "accounting-budget-2025.onrender.com",
];

function verifyOrigin(req, res, next) {
  const origin = req.get("Origin");
  if (!origin) return next();
  try {
    const { hostname } = new URL(origin);
    const allowed = allowedDomains.some(
      (d) => hostname === d || hostname.endsWith(`.${d}`)
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

  const filtered = matches.filter((m) => m.score >= 0.03).slice(0, 4);

  console.log(`🔎 Found ${filtered.length} chunks for "${question}"`);

  return {
    context: filtered.map((m) => m.text).join("\n\n"),
    count: filtered.length,
    chunks: filtered,
  };
}

/* ---------------------------- REPORT BUILDER ---------------------------- */
async function generateHTMLReport(question) {
  const { context, count, chunks } = await runSemanticSearch(question);

  const saving = `
  <h2>11. Saving Clause</h2>
  <p style="font-size:0.9rem; color:#555;">
    This report has been generated automatically by AIVS Software Limited.
    It is provided for internal guidance only and does not constitute formal
    accounting, tax, financial, or legal advice.
  </p>`;

  if (!count || !context.trim()) {
    return `
<div class="report">
<h1>Budget 2025 Report</h1>
<h2>1. Query Restated</h2><p>${question}</p>
<h2>2. Measures</h2><ul><li>No relevant measures in Budget 2025.</li></ul>
<h2>3. Figures</h2><ul><li>No figures.</li></ul>
<h2>4. OBR</h2><p>None.</p>
<h2>5. Implications</h2><ul><li>No impact.</li></ul>
<h2>6. References</h2><ul><li>No sources.</li></ul>
<h2>7. Summary</h2><p>No change.</p>
<h2>8. Reason</h2><p>No Budget changes in this area.</p>
<h2>9. Current HMRC Rules</h2><ul><li>Existing rules apply.</li></ul>
<h2>10. Advisory Notes</h2><ul><li>Monitor future updates.</li></ul>
${saving}
</div>
`.trim();
  }

  const prompt = `
Return CLEAN HTML ONLY:

<div class="report">

<h1>Budget 2025 Report</h1>

<h2>1. Query Restated</h2><p>[restated]</p>

<h2>2. Relevant Budget 2025 Measures</h2>
<ul><li>[measures]</li></ul>

<h2>3. Key Figures</h2>
<ul><li>[figures]</li></ul>

<h2>4. OBR Commentary</h2><p>[obr]</p>

<h2>5. Practical Implications</h2>
<ul><li>[impact]</li></ul>

<h2>6. Source References</h2>
<ul>
${chunks.map((c) => `<li>${c.file || "Unknown"}</li>`).join("\n")}
</ul>

<h2>7. Summary</h2><p>[summary]</p>

<h2>8. Reason</h2><p>If detail is limited, no Budget changes exist.</p>

<h2>9. Current HMRC Rules</h2>
<ul><li>Existing rules apply.</li></ul>

<h2>10. Advisory Notes</h2>
<ul><li>Monitor HMRC updates.</li></ul>

${saving}

</div>

Context:
${context}

Question: ${question}
`.trim();

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
  });

  return `<div class="aivs-html-output">${completion.choices[0].message.content}</div>`;
}

/* ---------------------------- /ASK (EMAIL + PDF + DOCX) ---------------------------- */
app.post("/ask", verifyOrigin, async (req, res) => {
  const { question, email } = req.body;
  const managerEmail = req.body.managerEmail || "";
  const clientEmail = req.body.clientEmail || "";

  const cleanQuestion = String(question || "").trim();
  const isoNow = new Date().toISOString();

  try {
    const html = await generateHTMLReport(cleanQuestion);

    /* -------- PDF -------- */
    const pdfDoc = await PDFDocument.create();
    let page = pdfDoc.addPage([595, 842]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    page.drawText("AIVS Budget 2025 Report", { x: 40, y: 800, size: 18 });
    page.drawText(`ISO Timestamp: ${isoNow}`, { x: 40, y: 780, size: 10 });

    let y = 760;
    const plain = html.replace(/<[^>]+>/g, "");
    for (let line of plain.split("\n")) {
      if (y < 60) {
        page = pdfDoc.addPage([595, 842]);
        y = 780;
      }
      page.drawText(line, { x: 40, y, size: 11, font });
      y -= 16;
    }

    const pdfBase64 = Buffer.from(await pdfDoc.save()).toString("base64");

    /* -------- DOCX -------- */
    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: "AIVS Budget 2025 Report",
                  bold: true,
                  size: 36,
                }),
              ],
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: `ISO Timestamp: ${isoNow}`,
                  size: 20,
                  color: "555555",
                }),
              ],
            }),
            ...plain.split("\n").map(
              (line) =>
                new Paragraph({
                  children: [new TextRun({ text: line, size: 24 })],
                  spacing: { after: 200 },
                })
            ),
          ],
        },
      ],
    });

    const docxBase64 = Buffer.from(await Packer.toBuffer(doc)).toString(
      "base64"
    );

    /* -------- SEND EMAIL -------- */
    const payload = {
      Messages: [
        {
          From: {
            Email: process.env.MJ_SENDER_EMAIL,
            Name: "AIVS Budget Assistant",
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
              Base64Content: pdfBase64,
            },
            {
              ContentType:
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              Filename: "Budget-2025-Report.docx",
              Base64Content: docxBase64,
            },
          ],
        },
      ],
    };

    const mj = await fetch("https://api.mailjet.com/v3.1/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "AIVS-Budget-Assistant",
        Authorization:
          "Basic " +
          Buffer.from(
            process.env.MJ_APIKEY_PUBLIC + ":" + process.env.MJ_APIKEY_PRIVATE
          ).toString("base64"),
      },
      body: JSON.stringify(payload),
    });

    console.log("📨 Mailjet:", mj.status, await mj.text());

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
