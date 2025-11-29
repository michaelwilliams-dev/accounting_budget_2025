// vector_store.js — Budget Assistant (JSON embedding search)
// RESTORED WORKING VERSION

import fs from "fs";
import path from "path";

const ROOT_DIR = path.resolve();
const META_FILE = path.join(ROOT_DIR, "budget_demo_2025.json");

console.log("🟢 vector_store.js using JSON index:", META_FILE);

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

// SIMPLE KEYWORD SEARCH (working version)
export async function searchIndex(query, index) {
  if (!query || query.length < 3) return [];

  console.log("🔍 Query:", query);

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
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}
