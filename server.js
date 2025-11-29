// vector_store.js — Stable Budget Assistant Version
// Zero FAISS. Zero external models. Pure keyword search.
// This is the SAME method your Accounting Assistant uses.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// IMPORTANT — JSON must be in the same folder as server.js on Render
const JSON_PATH = path.join(__dirname, "budget_demo_2025.json");

/* ---------------------- Load JSON Index ---------------------- */
export async function loadIndex() {
  console.log("📦 Loading Budget 2025 JSON...");

  if (!fs.existsSync(JSON_PATH)) {
    throw new Error(`JSON index file missing at: ${JSON_PATH}`);
  }

  const raw = fs.readFileSync(JSON_PATH, "utf8");
  const data = JSON.parse(raw);

  const entries = data.map((o, idx) => ({
    id: idx,
    text: o.text || "",
    embedding: o.embedding || [] // not used but kept for compatibility
  }));

  console.log(`🟢 Index ready — ${entries.length} chunks loaded.`);
  return entries;
}

/* ---------------------- Search Function ---------------------- */
export async function searchIndex(query, entries) {
  if (!entries || entries.length === 0) return [];

  const q = String(query).toLowerCase();
  const words = q.split(/\W+/).filter(w => w.length > 2);

  return entries
    .map(e => {
      const t = e.text.toLowerCase();
      let score = 0;
      for (const w of words) {
        if (t.includes(w)) score += 1;
      }
      return { ...e, score };
    })
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 40);
}
