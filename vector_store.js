// vector_store.js — Budget Assistant (pure JS vector search)
// ISO Timestamp: 2025-11-28

import fs from "fs";
import path from "path";
import { SentenceTransformer } from "sentence-transformers";

const ROOT_DIR = path.resolve();

// Budget 2025 JSON index (same format as 2024)
const META_FILE = path.join(ROOT_DIR, "budget_demo_2025.json");

console.log("🟢 vector_store.js using JSON index:", META_FILE);

// 🔥 Use the SAME MiniLM model as embedding script
const model = new SentenceTransformer("all-MiniLM-L6-v2");

// ------------------------------------------------------------
// LOAD JSON INDEX (text + embedding)
// ------------------------------------------------------------
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

// ------------------------------------------------------------
// SEARCH (local MiniLM embedding + dot product)
// ------------------------------------------------------------
export async function searchIndex(query, index) {
  if (!query || query.length < 3) return [];

  console.log("🔍 Query:", query);

  // 🔥 FIX: local embedding, NOT OpenAI API
  const q = await model.encode(query, { convertToFloat32: true });

  const results = index.map(obj => ({
    ...obj,
    score: dotProduct(q, obj.embedding)
  }));

  return results.sort((a, b) => b.score - a.score).slice(0, 20);
}

// ------------------------------------------------------------
// DOT PRODUCT
// ------------------------------------------------------------
function dotProduct(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  return a.reduce((sum, v, i) => sum + v * b[i], 0);
}
