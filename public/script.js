// public/script.js — Budget 2025 / Accountant Assistant Frontend
// ISO Timestamp: 🕒 2025-11-29T13:45:00Z
// ✔ Correct output element (#response)
// ✔ Correctly handles backend fields: html, answer, reportText
// ✔ Removes false "No report returned" warnings

console.log("CLIENT JS VERSION = v2025-11-29T13:45:00Z (Budget/Accountant Assistant)");

document.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);

  const generateBtn = $("generate");
  const output = $("response");  // Correct container

  const emailInput = $("email");
  const managerInput = $("managerEmail");
  const clientInput = $("clientEmail");
  const clarificationInput = $("clarification") || $("topic") || $("question");
  const isoSpan = $("iso-timestamp");

  if (isoSpan) isoSpan.textContent = new Date().toISOString();

  if (!generateBtn) {
    console.error("❌ Missing #generate button");
    return;
  }

  if (!output) {
    console.error("❌ Missing #response container in HTML");
    return;
  }

  generateBtn.addEventListener("click", async () => {
    const question = clarificationInput?.value?.trim() || "";
    const email = emailInput?.value?.trim() || "";
    const managerEmail = managerInput?.value?.trim() || "";
    const clientEmail = clientInput?.value?.trim() || "";

    if (!question) {
      output.textContent = "❌ Please enter a question or topic.";
      return;
    }

    const payload = {
      question,
      email,
      managerEmail,
      clientEmail,
      ts: new Date().toISOString(),
    };

    console.log("📤 [CLIENT /ask] Sending payload:", payload);
    output.textContent = "⏳ Generating Budget 2025 report… please wait.";

    try {
      const res = await fetch("/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        output.textContent = `❌ Server error: ${data?.error || res.status}`;
        console.error("❌ Backend error:", data);
        return;
      }

      console.log("📥 [CLIENT /ask] Response:", data);

      // Corrected response handler
      if (data?.html) {
        output.innerHTML = data.html;           // Budget Assistant HTML output
      } else if (data?.answer) {
        output.innerHTML = data.answer;         // Legacy assistants
      } else if (data?.reportText) {
        output.innerHTML = data.reportText;     // Fallback
      } else {
        output.innerHTML = "⚠️ No report returned. Please check backend logs.";
        console.warn("⚠️ Unexpected backend response structure:", data);
      }

    } catch (err) {
      console.error("❌ Network or fetch error:", err);
      output.textContent =
        "❌ Failed to contact backend: " + (err.message || String(err));
    }
  });
});
