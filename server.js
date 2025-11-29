
// server.js — Budget 2025 Assistant (stable, crash-proof)
// ISO Timestamp: 2025-11-28T20:00:00Z

import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import fetch from "node-fetch";

import { loadIndex, searchIndex } from "./vector_store.js";

dotenv.config();

const app = express();
app.use(cors());
app.options("*", cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 10000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "public")));

/* --------------------- Load JSON Index ----------------------- */
let GLOBAL_INDEX = [];

(async () => {
  try {
    console.log("📦 Loading Budget 2025 JSON Index...");
    GLOBAL_INDEX = await loadIndex();
    console.log(`🟢 READY — ${GLOBAL_INDEX.length} chunks loaded.`);
  } catch (err) {
    console.error("❌ Failed to load index:", err);
    process.exit(1);
  }
})();

/* ----------------------- /ask route --------------------------- */
app.post("/ask", async (req, res) => {
  try {
    const { question } = req.body || {};
    if (!question) return res.status(400).json({ error: "Missing question" });

    const clean = String(question).trim();

    const results = await searchIndex(clean, GLOBAL_INDEX);

    const context = results.map(r => r.text).join("\n\n");

    if (!context) {
      return res.json({
        answer: "No matching content found in the Budget 2025 documents.",
        contextCount: 0
      });
    }

    const response = {
      answer: context.slice(0, 5000),
      contextCount: results.length
    };

    return res.json(response);

  } catch (err) {
    console.error("❌ /ask failed:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

/* ---------------------- Root route ---------------------------- */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "budget.html"));
});

/* --------------------- Start server --------------------------- */
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🟢 Budget Assistant running on port ${PORT}`);
});
