// vector_store.js — Budget 2025 Assistant (Cosine Semantic Search)
// ISO Timestamp: 2025-11-28

import fs from "fs";
import path from "path";
import { SentenceTransformer } from "sentence-transformers";

const ROOT_DIR = path.resolve();
const META_FILE = path.join(ROOT_DIR, "budget_demo_2025.json");

console.log("🟢 vector_store.js loading:", META_FILE);

let indexData = null;
const model = new SentenceTransformer("all-MiniLM-L6-v2");

// ---------------------- Load JSON -------------------------
export async function loadIndex() {
  if (indexData) return indexData;

  try {
    const raw = await fs.promises.readFile(META_FILE, "utf8");
    indexData = JSON.parse(raw);
    console.log(`✅ Loaded ${indexData.length} chunks with embeddings`);
    return indexData;
  } catch (err) {
    console.error("❌ Failed to load embeddings JSON:", err.message);
    return [];
  }
}

// ------------------- Cosine Similarity ---------------------
function cosineSim(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// ------------------- Pure Semantic Search ------------------
export async function searchIndex(query, index) {
  if (!query || query.length < 3) return [];

  const qEmbed = await model.encode(query, { convertToTensor: false });
  const qArr = Array.from(qEmbed);

  const scored = index.map((obj) => ({
    ...obj,
    score: cosineSim(qArr, obj.embedding)
  }));

  return scored
    .sort((a, b) => b.score - a.score)   // higher cosine = better
    .slice(0, 20);
}
