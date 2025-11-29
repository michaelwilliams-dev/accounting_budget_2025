// vector_store.js — Budget Assistant (Semantic Search with OpenAI embeddings)
// ISO Timestamp: 2025-11-29

import fs from "fs";
import path from "path";
import { OpenAI } from "openai";

const ROOT_DIR = path.resolve();
const META_FILE = path.join(ROOT_DIR, "budget_demo_2025.json");

console.log("🟢 vector_store.js using JSON index:", META_FILE);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// ------------------------------------------------------------
// LOAD JSON INDEX — contains text + OpenAI 1536-dim embeddings
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
// SEMANTIC SEARCH — OpenAI embedding + dot product
// MUST match the model used to create the embeddings
// ------------------------------------------------------------
export async function searchIndex(query, index) {
  if (!query || query.length < 3) return [];

  console.log("🔍 Query:", query);

  // Generate query embedding using SAME model used in your JSON embeddings
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",  // ⭐ correct model for your existing vectors
    input: query
  });

  const q = response.data[0].embedding;

  // Dot-product scoring against your stored 1536-d vectors
  const results = index.map(obj => ({
    ...obj,
    score: dotProduct(q, obj.embedding)
  }));

  // Return top 5 most relevant vectors
  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

// ------------------------------------------------------------
// DOT PRODUCT — must match 1536-dim vectors
// ------------------------------------------------------------
function dotProduct(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  return a.reduce((sum, v, i) => sum + v * b[i], 0);
}
