// vector_store.js — Budget 2025 Assistant
// Pure semantic loader + cosine search (Accounting Assistant method)

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const JSON_PATH = path.join(__dirname, "budget_demo_2025.json");

/* ---------------------- Load JSON Index ---------------------- */
export async function loadIndex() {
  console.log("📦 Preloading Budget 2025 JSON Index...");

  const raw = fs.readFileSync(JSON_PATH, "utf8");
  const data = JSON.parse(raw);

  const entries = data.map((o, i) => ({
    id: i,
    text: o.text || "",
    embedding: Float32Array.from(o.embedding || [])
  }));

  console.log(`🟢 Ready — ${entries.length} chunks loaded.`);
  return entries;
}

/* ---------------------- Cosine Similarity ---------------------- */
function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/* ---------------------- Search Function ---------------------- */
export async function searchIndex(query, entries) {
  if (!entries || entries.length === 0) return [];

  // Encode query using SAME embedding model as your JSON
  // But since we can’t embed on Render, we use a keyword-boost method
  const words = query.toLowerCase().split(/\W+/).filter(w => w.length > 2);

  return entries
    .map(e => {
      // keyword overlap score (fallback method)
      const text = e.text.toLowerCase();
      let score = 0;
      for (const w of words) if (text.includes(w)) score += 1;

      return { ...e, score };
    })
    .filter(r => r.score > 0)           // MUST return at least some chunks
    .sort((a, b) => b.score - a.score)  // highest matches first
    .slice(0, 40);                      // return top 40 chunks
}
