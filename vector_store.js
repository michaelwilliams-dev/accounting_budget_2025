// vector_store.js — Budget Assistant FAISS Loader
// ISO Timestamp: 2025-10-13T11:15:00Z

import path from "path";
import fs from "fs";
import faiss from "faiss-node";
import { OpenAI } from "openai";

const ROOT_DIR = path.resolve();

// Your Budget 2025 FAISS paths (NOT accountant paths)
const INDEX_FILE = path.join(ROOT_DIR, "budget_demo_2025.index");
const META_FILE  = path.join(ROOT_DIR, "budget_demo_2025.json");

console.log("🟢 vector_store.js (Budget) using FAISS:", INDEX_FILE);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* ------------------ LOAD FAISS BINARY INDEX ------------------ */
export async function loadIndex() {
  try {
    const index = faiss.readIndex(INDEX_FILE);
    console.log(`✅ Loaded FAISS index (${index.ntotal} vectors)`);
    return index;
  } catch (err) {
    console.error("❌ Failed to load FAISS index:", err.message);
    return null;
  }
}

/* ---------------------- LOAD METADATA ------------------------- */
export async function loadMetadata() {
  try {
    const raw = await fs.promises.readFile(META_FILE, "utf8");
    const meta = JSON.parse(raw);
    console.log(`📘 Loaded metadata (${meta.length} chunks)`);
    return meta;
  } catch (err) {
    console.error("❌ Failed to load metadata:", err.message);
    return [];
  }
}

/* ------------------ SEARCH (FAISS + OpenAI) -------------------- */
export async function searchIndex(query, meta, index) {
  if (!query || query.length < 3) return [];

  const emb = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: [query],
  });

  const q = emb.data[0].embedding;
  const [distances, ids] = index.search(q, 20);

  const results = [];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (id < 0) continue;

    results.push({
      ...meta[id],
      score: 1 - distances[i],
    });
  }

  return results.sort((a, b) => b.score - a.score);
}
