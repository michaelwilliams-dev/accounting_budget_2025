// public/script.js — Budget 2025 / Accountant Assistant Frontend
// ISO Timestamp: 🕒 2025-11-29T13:45:00Z
// ✔ Correct output element (#response)
// ✔ Handles backend fields: html, answer, reportText
// ✔ Clear button added (question + output only)

console.log("CLIENT JS VERSION = v2025-11-29T13:45:00Z (Budget/Accountant Assistant)");

document.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);

  const generateBtn = $("generate");
  const clearBtn = $("clear");              // ← NEW
  const output = $("response");

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
        output.innerHTML = data.html;
      } else if (data?.answer) {
        output.innerHTML = data.answer;
      } else if (data?.reportText) {
        output.innerHTML = data.reportText;
      } else {
        output.innerHTML = "⚠️ No report returned. Please check backend logs.";
        console.warn("⚠️ Unexpected backend response structure:", data);
      }

      // ---- SHOW CLEAR BUTTON (NEW) ----
      if (clearBtn) clearBtn.style.display = "block";

    } catch (err) {
      console.error("❌ Network or fetch error:", err);
      output.textContent =
        "❌ Failed to contact backend: " + (err.message || String(err));
    }
  });

  // ---- CLEAR BUTTON LOGIC (NEW) ----
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      if (clarificationInput) clarificationInput.value = ""; // clear question only
      if (output) output.innerHTML = "";                    // clear output
      clearBtn.style.display = "none";                      // hide button again
    });
  }
});
