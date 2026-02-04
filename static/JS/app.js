// ==================================================
// Global Configuration
// ==================================================
const API_BASE = "http://127.0.0.1:8000";


// ==================================================
// Global App State
// ==================================================
const AppState = {
  activeTab: "translate",

  ocr: {
    srcLang: "en",
    tgtLang: "th"
  },

  chat: {
    isBusy: false
  }
};


// ==================================================
// Utils
// ==================================================
function $(id) {
  return document.getElementById(id);
}

function normalizeLang(code) {
  if (!code) return "en";
  return code.split("-")[0];
}


// ==================================================
// Init
// ==================================================
document.addEventListener("DOMContentLoaded", () => {
  initLanguageSelectors();
});


// ==================================================
// Language Selectors
// ==================================================
const LANG_MAP = {
  en: "English",
  th: "Thai",
  ja: "Japanese",
  zh: "Chinese",
  ko: "Korean",
  fr: "French",
  de: "German",
  es: "Spanish",
  ru: "Russian",
  vi: "Vietnamese",
  id: "Indonesian"
};

function initLanguageSelectors() {
  const src = $("src-lang");
  const tgt = $("tgt-lang");
  const ocrSrc = $("ocr-src-lang");
  const ocrTgt = $("ocr-tgt-lang");

  [src, tgt, ocrSrc, ocrTgt].forEach(sel => {
    if (!sel) return;
    sel.innerHTML = "";
    Object.entries(LANG_MAP).forEach(([code, name]) => {
      const opt = document.createElement("option");
      opt.value = code;
      opt.textContent = name;
      sel.appendChild(opt);
    });
  });

  if (src) src.value = "en";
  if (tgt) tgt.value = "th";
  if (ocrSrc) ocrSrc.value = "en";
  if (ocrTgt) ocrTgt.value = "th";

  if (ocrSrc) ocrSrc.onchange = () => AppState.ocr.srcLang = ocrSrc.value;
  if (ocrTgt) ocrTgt.onchange = () => AppState.ocr.tgtLang = ocrTgt.value;
}


// ==================================================
// Text Translate
// ==================================================
async function translateText() {
  const text = $("input-text")?.value.trim();
  if (!text) return alert("กรุณาใส่ข้อความ");

  const src = normalizeLang($("src-lang").value);
  const tgt = normalizeLang($("tgt-lang").value);
  const engine =
    document.querySelector('input[name="engine"]:checked')?.value || "auto";

  $("output-text").innerText = "กำลังแปล...";

  try {
    const res = await fetch(`${API_BASE}/api/v1/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        source_lang: src,
        target_lang: tgt,
        engine
      })
    });

    if (!res.ok) throw new Error(res.status);
    const data = await res.json();

    $("output-text").innerText = data.translation || "(ไม่สามารถแปลได้)";
  } catch (e) {
    console.error(e);
    $("output-text").innerText = "แปลไม่สำเร็จ";
  }
}


// ==================================================
// OCR
// ==================================================
function previewImage() {
  const file = $("image-input")?.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = e => {
    const img = $("image-preview");
    img.src = e.target.result;
    img.style.display = "block";
  };
  reader.readAsDataURL(file);
}

async function runOCR() {
  const input = $("image-input");
  if (!input || input.files.length === 0) {
    alert("กรุณาเลือกรูปภาพ");
    return "";
  }

  $("ocr-extracted").innerText = "กำลังอ่านภาพ...";
  $("ocr-translated").innerText = "-";

  const formData = new FormData();
  formData.append("file", input.files[0]);

  try {
    const res = await fetch(`${API_BASE}/api/v1/ocr`, {
      method: "POST",
      body: formData
    });

    if (!res.ok) throw new Error(res.status);
    const data = await res.json();

    $("ocr-extracted").innerText = data.text || "(ไม่พบข้อความ)";
    return data.text || "";
  } catch (e) {
    console.error(e);
    $("ocr-extracted").innerText = "OCR ล้มเหลว";
    return "";
  }
}


// ==================================================
// OCR → Translate
// ==================================================
async function translateImage() {
  AppState.activeTab = "ocr";

  const extracted = await runOCR();
  if (!extracted.trim()) return;

  const src = normalizeLang(AppState.ocr.srcLang);
  const tgt = normalizeLang(AppState.ocr.tgtLang);

  $("ocr-translated").innerText = "กำลังแปล...";

  try {
    const res = await fetch(`${API_BASE}/api/v1/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: extracted,
        source_lang: src,
        target_lang: tgt,
        engine: "auto"
      })
    });

    if (!res.ok) throw new Error(res.status);
    const data = await res.json();

    $("ocr-translated").innerText = data.translation || "-";
  } catch (e) {
    console.error(e);
    $("ocr-translated").innerText = "แปลไม่สำเร็จ";
  }
}


// ==================================================
// Chat (Append-based, Gemini backend)
// ==================================================
function appendChatMessage(text, role = "bot") {
  const box = $("chat-history");
  if (!box) return;

  const div = document.createElement("div");
  div.className = `msg ${role}`;
  div.innerText = text.replace(/\*\*/g, "");

  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

async function sendChat() {
  AppState.activeTab = "chat";
  if (AppState.chat.isBusy) return;

  const input = $("chat-input");
  const history = $("chat-history");
  if (!input || !history) return;

  const msg = input.value.trim();
  if (!msg) return;

  AppState.chat.isBusy = true;
  input.value = "";

  appendChatMessage(msg, "user");
  appendChatMessage("กำลังคิด...", "bot");

  try {
    const res = await fetch(`${API_BASE}/api/v1/chatbot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: msg })
    });

    if (!res.ok) throw new Error(res.status);
    const data = await res.json();

    history.lastChild.remove();
    appendChatMessage(data.reply || "(ไม่มีคำตอบ)", "bot");
  } catch (e) {
    console.error(e);
    history.lastChild.remove();
    appendChatMessage("Chatbot ไม่สามารถตอบได้", "bot");
  } finally {
    AppState.chat.isBusy = false;
  }
}


// ==================================================
// Tabs
// ==================================================
function openTab(tabId) {
  AppState.activeTab =
    tabId.includes("chat") ? "chat" :
    tabId.includes("ocr") ? "ocr" : "translate";

  document.querySelectorAll(".tab-content").forEach(el => {
    el.style.display = "none";
    el.classList.remove("active");
  });

  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.classList.remove("active");
  });

  const tab = document.getElementById(tabId);
  if (tab) {
    tab.style.display = "block";
    tab.classList.add("active");
  }

  document.querySelectorAll(".tab-btn").forEach(btn => {
    if (btn.getAttribute("onclick")?.includes(tabId)) {
      btn.classList.add("active");
    }
  });
}
