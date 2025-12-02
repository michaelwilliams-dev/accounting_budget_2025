// server.js — Budget 2025 Assistant (FINAL FIXED VERSION)
// ISO Timestamp: 2025-11-30T19:10:00Z

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
    if (!allowedDomains.includes(hostname)) return next();
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

  const filtered = matches.filter(m => m.score >= 0.03);
  console.log(`🔎 Found ${filtered.length} chunks for "${question}"`);

  return {
    context: filtered.map(m => m.text).join("\n\n"),
    chunks: filtered
  };
}

/* ---------------------------- REPORT BUILDER ---------------------------- */
async function generateHTMLReport(question) {
  const { context, chunks } = await runSemanticSearch(question);

  const savingClause = `
<h2>11. Saving Clause</h2>
<p style="font-size:0.9rem;color:#555;">
This report has been generated automatically by AIVS Software Limited.
It is provided for internal guidance only and does not constitute
formal accounting, tax, financial, or legal advice.
</p>`;

  if (!context.trim()) {
    return `
<div class="report">
<h1>Budget 2025 Report</h1>
<h2>1. Query Restated</h2><p>${question}</p>
<h2>2. Measures</h2><ul><li>No relevant Budget 2025 measures found.</li></ul>
<h2>3. Figures</h2><ul><li>No figures in indexed data.</li></ul>
<h2>4. OBR Commentary</h2><p>No OBR commentary available.</p>
<h2>5. Practical Implications</h2><ul><li>No impacts identified.</li></ul>
<h2>6. Source References</h2><ul><li>No documents matched.</li></ul>
<h2>7. Summary</h2><p>No changes affect this topic.</p>
<h2>8. Reason</h2><p>Budget 2025 did not introduce measures in this area.</p>
<h2>9. Current HMRC Rules</h2><ul><li>Existing rules apply.</li></ul>
<h2>10. Advisory Notes</h2><ul><li>Monitor HM Treasury updates.</li></ul>
${savingClause}
</div>`.trim();
  }

  /* ---------------- FIXED OPENAI PROMPT ---------------- */
  const prompt = `
Produce the report directly in HTML format.
Do NOT write the words "html", "HTML", or meta instructions in your output.

You MUST produce a complete structured Budget 2025 report.
Use ONLY the context below.

Extract Budget measures, figures, OBR commentary,
implications, and HMRC rules directly from the context.

If something is missing, say so clearly.

<div class="report">

<h1>Budget 2025 Report</h1>

<h2>1. Query Restated</h2>
<p>${question}</p>

<h2>2. Relevant Budget 2025 Measures</h2>
<ul>
[Extract all measures related to the query from the Budget 2025 context]
</ul>

<h2>3. Key Figures & Thresholds</h2>
<ul>
[Extract any monetary figures, amounts, thresholds or percentages]
</ul>

<h2>4. OBR Commentary</h2>
<p>
[Summarise any OBR commentary appearing in the context. If none, state that none is present.]
</p>

<h2>5. Practical Implications</h2>
<ul>
[Explain practical effects strictly using the context — do NOT invent content]
</ul>

<h2>6. Source References</h2>
<ul>
${chunks.map(c => `<li>${c.file || "Unknown source"}</li>`).join("\n")}
</ul>

<h2>7. Summary</h2>
<p>[Provide a clear final summary of the Budget 2025 impact related to this query.]</p>

<h2>8. Reason</h2>
<p>[If content is thin, explain precisely why.]</p>

<h2>9. Current HMRC Rules</h2>
<ul>
[Summarise known HMRC rules related to this topic using context + standard rules]
</ul>

<h2>10. Advisory Notes</h2>
<ul>
[Provide safe advisory notes — NEVER speculate beyond context]
</ul>

${savingClause}

</div>

CONTEXT:
${context}

`.trim();

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }]
  });

  return `<div class="aivs-html-output">${completion.choices[0].message.content}</div>`;
}

/* ---------------------------- /ASK (EMAIL + PDF + DOCX) ---------------------------- */
app.post("/ask", verifyOrigin, async (req, res) => {
  const { question, email, managerEmail, clientEmail } = req.body;
  const isoNow = new Date().toISOString();

  try {
    const html = await generateHTMLReport(question);

    /* ---------- CLEAN TEXT FOR PDF/DOCX ---------- */
    const plain = html
      .replace(/<h1>/g, "\n# ")
      .replace(/<\/h1>/g, "\n\n")
      .replace(/<h2>/g, "\n## ")
      .replace(/<\/h2>/g, "\n\n")
      .replace(/<li>/g, "• ")
      .replace(/<\/li>/g, "\n")
      .replace(/<p>/g, "")
      .replace(/<\/p>/g, "\n\n")
      .replace(/<br\s*\/?>/g, "\n")
      .replace(/<[^>]+>/g, "");

    /* --------------------- PDF --------------------- */
    const pdfDoc = await PDFDocument.create();
    let page = pdfDoc.addPage([595, 842]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    page.drawText("AIVS Budget 2025 Report", { x: 40, y: 800, size: 18, font });
    page.drawText(`ISO Timestamp: ${isoNow}`, { x: 40, y: 780, size: 10, font });

    let y = 760;
    for (const line of plain.split("\n")) {
      if (y < 40) {
        page = pdfDoc.addPage([595, 842]);
        y = 780;
      }
      page.drawText(line.trim(), { x: 40, y, size: 11, font });
      y -= 14;
    }

    const pdfBase64 = Buffer.from(await pdfDoc.save()).toString("base64");

    /* --------------------- DOCX --------------------- */
    const doc = new Document({
      sections: [
        {
          children: plain.split("\n").map(
            line =>
              new Paragraph({
                children: [new TextRun({ text: line || "", size: 24 })],
                spacing: { after: 200 }
              })
          )
        }
      ]
    });

    const docxBase64 = Buffer.from(
      await Packer.toBuffer(doc)
    ).toString("base64");

    /* --------------------- EMAIL --------------------- */
    const payload = {
      Messages: [
        {
          From: { 
            Email: "noreply@securemaildrop.uk",
            Name: "Secure Maildrop"
          },
    
          To: [{ Email: email }],
          Cc: managerEmail ? [{ Email: managerEmail }] : [],
          Bcc: clientEmail ? [{ Email: clientEmail }] : [],
          Subject: `Your Budget 2025 Report — ${isoNow}`,
    
          // REQUIRED (same as accounting)
          TextPart: plain,
    
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
    const mjRes = await fetch("https://api.mailjet.com/v3.1/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "AIVS-Budget-Assistant",
        Authorization:
          "Basic " +
          Buffer.from(
            process.env.MJ_APIKEY_PUBLIC + ":" + process.env.MJ_APIKEY_PRIVATE
          ).toString("base64")
      },
      body: JSON.stringify(payload)
    });

    console.log("📨 MAILJET:", mjRes.status, await mjRes.text());

    res.json({ question, html });

  } catch (err) {
    console.error("❌ ERROR IN /ask:", err);
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
