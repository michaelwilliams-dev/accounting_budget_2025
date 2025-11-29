// vector_store.js — Budget Assistant (JSON embedding search)
// ISO Timestamp: 2025-11-28

import fs from "fs";
import path from "path";

const ROOT_DIR = path.resolve();
const META_FILE = path.join(ROOT_DIR, "budget_demo_2025.json");

console.log("🟢 vector_store.js using JSON index:", META_FILE);

// LOAD JSON INDEX
export async function loadIndex() {
  try {
    const raw = await fs.promises.readFile(META_FILE, "utf8");
    const data = JSON.parse(raw);
    console.log(`✅ Loaded ${data.length} embedded chunks.`);
    return data;
  } catch (err) {
    console.error("❌ Failed to load index:", err.message);
    return [];
  }
}

// SEARCH using pre-computed embeddings ONLY
export async function searchIndex(query, index) {
  if (!query || query.length < 3) return [];

  console.log("🔍 Query:", query);

  // convert query into lowercase keywords
  const qWords = query.toLowerCase().split(/\s+/);

  // VERY SIMPLE relevance scoring:
  // score += 1 for each matching keyword
  const results = index.map(obj => {
    const text = obj.text.toLowerCase();
    let score = 0;
    for (const w of qWords) {
      if (text.includes(w)) score++;
    }
    return { ...obj, score };
  });

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);
}
