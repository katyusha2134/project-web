// ==================================================
// Global Configuration
// ==================================================
//const API_BASE = "http://127.0.0.1:8000"; localhost
const API_BASE = "https://continue-stock-respiratory-holiday.trycloudflare.com"; //publc domain (ต้องเปลี่ยนทุกครั้งที่ปิดเครื่อง หรือปิด terminal )


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
  },

  // STT recording state
  stt: {
    mediaRecorder: null,
    audioChunks:   [],
    isRecording:   false,
    activeBtnId:   null,
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

  // ถ้า browser ไม่รองรับ MediaRecorder ให้ซ่อนปุ่ม mic
  if (!navigator.mediaDevices || !window.MediaRecorder) {
    document.querySelectorAll(".mic-button").forEach(btn => {
      btn.style.display = "none";
    });
  }
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
  const src    = $("src-lang");
  const tgt    = $("tgt-lang");
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

  if (src)    src.value    = "en";
  if (tgt)    tgt.value    = "th";
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

  const src    = normalizeLang($("src-lang").value);
  const tgt    = normalizeLang($("tgt-lang").value);
  const engine = document.querySelector('input[name="engine"]:checked')?.value || "auto";

  $("output-text").innerText = "กำลังแปล...";

  try {
    const res = await fetch(`${API_BASE}/api/v1/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, source_lang: src, target_lang: tgt, engine })
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

  $("ocr-extracted").innerText  = "กำลังอ่านภาพ...";
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
      body: JSON.stringify({ text: extracted, source_lang: src, target_lang: tgt, engine: "auto" })
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
// Chat (Append-based)
// ==================================================
function appendChatMessage(text, role = "bot") {
  const box = $("chat-history");
  if (!box) return;

  const div = document.createElement("div");
  div.className  = `msg ${role}`;
  div.innerText  = text.replace(/\*\*/g, "");

  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

async function sendChat() {
  AppState.activeTab = "chat";
  if (AppState.chat.isBusy) return;

  const input   = $("chat-input");
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
    tabId.includes("ocr")  ? "ocr"  : "translate";

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


// ==================================================
// [REPLACED] TEXT TO SPEECH  →  Hybrid TTS  (server-side)
// ==================================================
async function speakText(elementId, langSelectorId) {
  const el = document.getElementById(elementId);
  if (!el) return;

  const text = (el.value || el.innerText || "").trim();
  if (!text) return;

  const langCode = normalizeLang(
    document.getElementById(langSelectorId)?.value || "en"
  );

  try {
    const formData = new FormData();
    formData.append("text",     text);
    formData.append("language", langCode);
    formData.append("speed",    "1.0");

    const res = await fetch(`${API_BASE}/api/v1/tts`, {
      method: "POST",
      body:   formData,
    });

    if (!res.ok) throw new Error(`TTS failed: ${res.status}`);

    // รับ audio blob (WAV หรือ MP3) แล้วเล่นทันที
    const blob     = await res.blob();
    const audioUrl = URL.createObjectURL(blob);
    const audio    = new Audio(audioUrl);

    audio.onended = () => URL.revokeObjectURL(audioUrl);
    audio.play();
  } catch (e) {
    console.error("TTS error:", e);
    alert("ไม่สามารถสังเคราะห์เสียงได้");
  }
}


// ==================================================
// [REPLACED] SPEECH TO TEXT  →  faster-whisper  (server-side)
// ==================================================

/**
 * startSpeech(targetId)
 *  - ครั้งแรก: เริ่ม record (ปุ่มเปลี่ยนเป็น 🔴)
 *  - ครั้งสอง: หยุด → ส่ง audio ไป /api/v1/stt → ใส่ transcript ลงใน element
 */
async function startSpeech(targetId) {
  const stt = AppState.stt;

  // ─── หยุด recording ───────────────────────────────────────
  if (stt.isRecording && stt.activeBtnId === targetId) {
    stt.mediaRecorder.stop();
    return;
  }

  // ─── เริ่ม recording ──────────────────────────────────────
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    stt.audioChunks  = [];
    stt.isRecording  = true;
    stt.activeBtnId  = targetId;

    // หา mic button ที่ตรงกับ targetId แล้วเปลี่ยน icon
    const micBtn = document.querySelector(
      `.mic-button[onclick*="${targetId}"]`
    );
    if (micBtn) micBtn.textContent = "🔴";

    const mediaRecorder = new MediaRecorder(stream);
    stt.mediaRecorder   = mediaRecorder;

    mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) stt.audioChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      // คืน icon กลับ
      if (micBtn) micBtn.textContent = "🎤";

      stt.isRecording = false;
      stream.getTracks().forEach(t => t.stop());

      const blob     = new Blob(stt.audioChunks, { type: "audio/webm" });
      const formData = new FormData();
      formData.append("file", blob, "recording.webm");

      // ส่งภาษา src ตาม selector (ถ้ามี)
      const langCode = normalizeLang(
        document.getElementById("src-lang")?.value || "en"
      );
      formData.append("language", langCode);

      try {
        const target = document.getElementById(targetId);
        if (target) target.value = "กำลังถอดความ...";

        const res  = await fetch(`${API_BASE}/api/v1/stt`, {
          method: "POST",
          body:   formData,
        });

        if (!res.ok) throw new Error(`STT failed: ${res.status}`);
        const data = await res.json();

        if (target) target.value += (target.value.includes("กำลังถอดความ...") ? "" : " ") + (data.text || "");
        if (target) target.value = target.value.replace("กำลังถอดความ...", "").trim();
      } catch (err) {
        console.error("STT error:", err);
        const target = document.getElementById(targetId);
        if (target) target.value = target.value.replace("กำลังถอดความ...", "").trim();
        alert("ถอดความเสียงไม่สำเร็จ");
      }
    };

    mediaRecorder.start();
  } catch (err) {
    console.error("Microphone error:", err);
    alert("ไม่สามารถเข้าถึง Microphone ได้");
    stt.isRecording = false;
  }
}


// ==================================================
// [KEEP] COPY FUNCTION
// ==================================================
function copyText(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;

  const text = el.value || el.innerText;
  navigator.clipboard.writeText(text);
}