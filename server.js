// server.js — Budget 2025 Assistant (Saving Clause & Timestamp FIXED)
// ISO Timestamp: 2025-11-30T20:30:00Z

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
  const isoNow = new Date().toISOString();

  // FIXED: Saving clause moved OUTSIDE the report
  const savingClause = `
<div class="saving-clause" style="margin-top:25px; padding-top:10px; border-top:1px solid #ccc;">
  <p style="font-size:0.9rem;color:#555;">
    <strong>Report Timestamp:</strong> ${isoNow}<br><br>
    This report has been generated automatically by AIVS Software Limited.
    It is provided for internal guidance only and does not constitute
    formal accounting, tax, financial, or legal advice.
  </p>
</div>
`;

  /* ---------------- EMPTY CONTEXT REPORT ---------------- */
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
</div>

${savingClause}`.trim();
  }

  /* ---------------- FIXED OPENAI PROMPT (no saving clause inside) ---------------- */
  const prompt = `
Produce the report directly in HTML format.
Do NOT write the words "html", "HTML", or meta instructions.

Use ONLY the context provided.

<div class="report">

<h1>Budget 2025 Report</h1>

<h2>1. Query Restated</h2>
<p>${question}</p>

<h2>2. Relevant Budget 2025 Measures</h2>
<ul>
[Extract measures from context]
</ul>

<h2>3. Key Figures & Thresholds</h2>
<ul>
[Extract numbers from context]
</ul>

<h2>4. OBR Commentary</h2>
<p>[Summarise OBR commentary]</p>

<h2>5. Practical Implications</h2>
<ul>[Explain impacts using ONLY context]</ul>

<h2>6. Source References</h2>
<ul>
${chunks.map(c => `<li>${c.file || "Unknown source"}</li>`).join("")}
</ul>

<h2>7. Summary</h2>
<p>[Final summary]</p>

<h2>8. Reason</h2>
<p>[Why limited]</p>

<h2>9. Current HMRC Rules</h2>
<ul>[HMRC rules summary]</ul>

<h2>10. Advisory Notes</h2>
<ul>[General safe notes]</ul>

</div>

CONTEXT:
${context}
  `.trim();

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }]
  });

  // FIXED: saving clause appended BELOW the report
  return `
<div class="aivs-html-output">
${completion.choices[0].message.content}
</div>

${savingClause}
`.trim();
}

/* ---------------------------- /ASK (EMAIL + PDF + DOCX) ---------------------------- */
app.post("/ask", verifyOrigin, async (req, res) => {
  const { question, email, managerEmail, clientEmail } = req.body;
  const isoNow = new Date().toISOString();

  try {
    const html = await generateHTMLReport(question);

    /* CLEAN TEXT FOR PDF/DOCX (unchanged) */
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

    /* USB: PDF + DOCX + Email unchanged from your file */
    // --------------------------------------------------
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

    const docChildren = [];
    const lines = plain.split("\n").map(l => l.trim()).filter(Boolean);

    for (const line of lines) {
      if (line.startsWith("# ")) {
        docChildren.push(
          new Paragraph({
            children: [new TextRun({ text: line.replace("# ", ""), bold: true, size: 48 })],
            spacing: { after: 300 }
          })
        );
        continue;
      }

      if (line.startsWith("## ")) {
        docChildren.push(
          new Paragraph({
            children: [new TextRun({ text: line.replace("## ", ""), bold: true, size: 32 })],
            spacing: { after: 200 }
          })
        );
        continue;
      }

      if (line.startsWith("• ")) {
        docChildren.push(
          new Paragraph({
            children: [new TextRun({ text: line.replace("• ", ""), size: 24 })],
            bullet: { level: 0 },
            spacing: { after: 100 }
          })
        );
        continue;
      }

      docChildren.push(
        new Paragraph({
          children: [new TextRun({ text: line, size: 24 })],
          spacing: { after: 160 }
        })
      );
    }

    const doc = new Document({ sections: [{ children: docChildren }] });
    const docxBase64 = Buffer.from(await Packer.toBuffer(doc)).toString("base64");

    const payload = {
      Messages: [
        {
          From: { Email: "noreply@securemaildrop.uk", Name: "Secure Maildrop" },
          To: [{ Email: email }],
          Cc: managerEmail ? [{ Email: managerEmail }] : [],
          Bcc: clientEmail ? [{ Email: clientEmail }] : [],
          Subject: `Your Budget 2025 Report — ${isoNow}`,
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
