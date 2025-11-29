// vector_store.js — Budget 2025 keyword semantic search
// ISO Timestamp: 2025-11-28T23:10:00Z

import fs from "fs";
import path from "path";

const ROOT_DIR = path.resolve();
const META_FILE = path.join(ROOT_DIR, "budget_demo_2025.json");

console.log("🟢 vector_store.js using JSON index:", META_FILE);

// LOAD JSON INDEX (text-only search)
export async function loadIndex() {
  try {
    const raw = await fs.promises.readFile(META_FILE, "utf8");
    const data = JSON.parse(raw);
    console.log(`✅ Loaded ${data.length} chunks from JSON.`);
    return data;
  } catch (err) {
    console.error("❌ Failed to load index:", err.message);
    return [];
  }
}

/**
 * PURE KEYWORD "SEMANTIC-LITE" SEARCH
 * - No embeddings
 * - No FAISS
 * - No local models
 * - 100% Render-safe and reliable
 */
export async function searchIndex(query, index) {
  if (!query || query.length < 3) return [];

  const qWords = query.toLowerCase().split(/\s+/);

  const results = index.map(obj => {
    const text = obj.text.toLowerCase();
    let score = 0;

    for (const w of qWords) {
      if (text.includes(w)) score++;
    }
    return { ...obj, score };
  });

  return results
    .filter(r => r.score > 0)     // must match at least 1 keyword
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);                // return top 12 chunks
}
