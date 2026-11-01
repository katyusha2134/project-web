// ==================================================
// Global Configuration
// ==================================================
//const API_BASE = "http://127.0.0.1:8000"; localhost
const API_BASE = "https://setting-dense-imposed-drug.trycloudflare.com"; //publc domain (ต้องเปลี่ยนทุกครั้งที่ปิดเครื่อง หรือปิด terminal )

// [เพิ่ม] endpoint พื้นฐานของ auth
const AUTH_BASE = `${API_BASE}/api/v1/auth`;


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
  },

  // [เพิ่ม] Auth state — token/username เก็บใน localStorage เพื่อให้ login ค้างข้าม session
  auth: {
    token:    localStorage.getItem("auth_token")    || null,
    username: localStorage.getItem("auth_username") || null,
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

// [เพิ่ม] คืน header Authorization ถ้า login อยู่ — ใช้ spread เข้า fetch headers เดิมได้เลย
function authHeaders() {
  return AppState.auth.token
    ? { Authorization: `Bearer ${AppState.auth.token}` }
    : {};
}


// ==================================================
// Init
// ==================================================
document.addEventListener("DOMContentLoaded", () => {
  initLanguageSelectors();
  updateAuthUI(); // [เพิ่ม] อัปเดตแถบ auth ตาม token ที่มีอยู่ (ถ้าเคย login ค้างไว้)

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
// [เพิ่ม] Auth — modal open/close, tab switch
// ==================================================
function openAuthModal(tab = "login") {
  const modal = $("auth-modal");
  modal.classList.remove("hidden");
  // [แก้ไข] บังคับ display ตรงๆ ผ่าน inline !important กัน CSS ภายนอก/cache เก่ามาชนอีก
  modal.style.setProperty("display", "flex", "important");
  switchAuthTab(tab);
  hideAuthError();
}

function closeAuthModal() {
  const modal = $("auth-modal");
  modal.classList.add("hidden");
  // [แก้ไข] บังคับ display ตรงๆ ผ่าน inline !important กัน CSS ภายนอก/cache เก่ามาชนอีก
  modal.style.setProperty("display", "none", "important");
  hideAuthError();
  $("login-form").reset();
  $("register-form").reset();
}

function switchAuthTab(tab) {
  const isLogin = tab === "login";

  $("auth-tab-login").classList.toggle("active", isLogin);
  $("auth-tab-register").classList.toggle("active", !isLogin);
  $("login-form").classList.toggle("hidden", !isLogin);
  $("register-form").classList.toggle("hidden", isLogin);
  hideAuthError();
}

function showAuthError(message) {
  const el = $("auth-error");
  el.innerText = message;
  el.classList.remove("hidden");
}

function hideAuthError() {
  $("auth-error").classList.add("hidden");
}


// ==================================================
// [เพิ่ม] Auth — login / register / logout
// ==================================================
async function handleLogin(event) {
  event.preventDefault();
  hideAuthError();

  const username = $("login-username").value.trim();
  const password = $("login-password").value;

  try {
    // /api/v1/auth/login รับ OAuth2PasswordRequestForm → ต้องส่งเป็น form-urlencoded ไม่ใช่ JSON
    const body = new URLSearchParams();
    body.append("username", username);
    body.append("password", password);

    const res = await fetch(`${AUTH_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString()
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "เข้าสู่ระบบไม่สำเร็จ");

    AppState.auth.token    = data.access_token;
    AppState.auth.username = username;
    localStorage.setItem("auth_token", data.access_token);
    localStorage.setItem("auth_username", username);

    updateAuthUI();
    closeAuthModal();
  } catch (e) {
    console.error("Login error:", e);
    showAuthError(e.message || "เข้าสู่ระบบไม่สำเร็จ");
  }
}

async function handleRegister(event) {
  event.preventDefault();
  hideAuthError();

  const username = $("register-username").value.trim();
  const email    = $("register-email").value.trim();
  const password = $("register-password").value;

  try {
    const res = await fetch(`${AUTH_BASE}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "สมัครสมาชิกไม่สำเร็จ");

    // สมัครสำเร็จ → login ต่อให้เลยเพื่อความลื่นไหล
    const body = new URLSearchParams();
    body.append("username", username);
    body.append("password", password);

    const loginRes = await fetch(`${AUTH_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString()
    });
    const loginData = await loginRes.json();
    if (!loginRes.ok) throw new Error(loginData.detail || "สมัครสำเร็จ แต่เข้าสู่ระบบอัตโนมัติไม่สำเร็จ");

    AppState.auth.token    = loginData.access_token;
    AppState.auth.username = username;
    localStorage.setItem("auth_token", loginData.access_token);
    localStorage.setItem("auth_username", username);

    updateAuthUI();
    closeAuthModal();
  } catch (e) {
    console.error("Register error:", e);
    showAuthError(e.message || "สมัครสมาชิกไม่สำเร็จ");
  }
}

function handleLogout() {
  AppState.auth.token    = null;
  AppState.auth.username = null;
  localStorage.removeItem("auth_token");
  localStorage.removeItem("auth_username");
  updateAuthUI();
}

function updateAuthUI() {
  const guestBox = $("auth-guest");
  const userBox  = $("auth-user");
  const nameEl   = $("auth-username");

  if (AppState.auth.token) {
    guestBox.classList.add("hidden");
    userBox.classList.remove("hidden");
    nameEl.innerHTML = `<i class="fas fa-user-check"></i> ${AppState.auth.username}`;
  } else {
    guestBox.classList.remove("hidden");
    userBox.classList.add("hidden");
  }
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
      // [แก้ไข] แนบ Authorization header ถ้า login อยู่ — backend ผูกประวัติกับ user อัตโนมัติ
      headers: { "Content-Type": "application/json", ...authHeaders() },
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
    // [แก้ไข] เอา class "hidden" ออกแทนการตั้ง inline style เฉยๆ
    // เพราะ .hidden ตอนนี้เป็น !important ต้องเอา class ออกจริงๆ ถึงจะโชว์ได้
    img.classList.remove("hidden");
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
      // [แก้ไข] แนบ token ถ้ามี — ห้ามตั้ง Content-Type เองตอนใช้ FormData (browser จัดการ boundary ให้)
      headers: { ...authHeaders() },
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
      // [แก้ไข] แนบ token ถ้ามี
      headers: { "Content-Type": "application/json", ...authHeaders() },
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
      // [แก้ไข] แนบ token ถ้ามี — backend จะผูก chat_sessions กับ user นี้อัตโนมัติ
      headers: { "Content-Type": "application/json", ...authHeaders() },
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
