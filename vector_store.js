// vector_store.js — Budget 2025 Assistant (Pure Semantic FAISS Search)
// ISO Timestamp: 2025-11-28

import fs from "fs";
import path from "path";
import faiss from "faiss-node";
import { SentenceTransformer } from "sentence-transformers";

const ROOT_DIR = path.resolve();
const META_FILE = path.join(ROOT_DIR, "budget_demo_2025.json");
const INDEX_FILE = path.join(ROOT_DIR, "budget_demo_2025.index");

console.log("🟢 vector_store.js using:", META_FILE);

let embeddings = [];
let meta = [];
let faissIndex = null;

const model = new SentenceTransformer("all-MiniLM-L6-v2");

// --------------------- Load JSON metadata ---------------------
export async function loadIndex() {
  if (meta.length > 0) return meta;

  try {
    const raw = await fs.promises.readFile(META_FILE, "utf8");
    meta = JSON.parse(raw);
    console.log(`✅ Loaded ${meta.length} chunks (metadata)`);
    return meta;
  } catch (err) {
    console.error("❌ Failed to load metadata:", err.message);
    return [];
  }
}

// --------------------- Load FAISS index ------------------------
async function loadFaissIndex() {
  if (faissIndex) return faissIndex;
  try {
    faissIndex = faiss.readIndex(INDEX_FILE);
    console.log("🟢 FAISS index loaded (semantic search enabled)");
    return faissIndex;
  } catch (err) {
    console.error("❌ Failed to load FAISS index:", err.message);
    return null;
  }
}

// --------------------- Pure Semantic Search --------------------
export async function searchIndex(query, indexMeta) {
  try {
    if (!query || query.length < 3) return [];

    const faissIdx = await loadFaissIndex();
    if (!faissIdx) return [];

    const qEmbedding = await model.encode(query, { convertToTensor: false });
    const qFloat32 = new Float32Array(qEmbedding);

    const k = 20; // number of semantic neighbours to pull
    const result = faissIdx.search(qFloat32, k);
    const { distances, labels } = result;

    const results = [];

    for (let i = 0; i < labels.length; i++) {
      const id = labels[i];
      if (id < 0) continue;

      results.push({
        ...indexMeta[id],
        score: distances[i] // lower distance = better match (L2)
      });
    }

    // sort by semantic similarity (ascending L2)
    return results.sort((a, b) => a.score - b.score);
  } catch (err) {
    console.error("❌ Semantic search error:", err);
    return [];
  }
}
