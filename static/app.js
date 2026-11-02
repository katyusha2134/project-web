// ==================================================
// Global Configuration
// ==================================================
const API_BASE = "https://researchers-icq-main-folders.trycloudflare.com";
const AUTH_BASE = `${API_BASE}/api/v1/auth`;

// ==================================================
// Global App State
// ==================================================
const AppState = {
  activeTab: "translate",
  ocr:  { srcLang: "en", tgtLang: "th" },
  chat: { isBusy: false },
  stt:  { mediaRecorder: null, audioChunks: [], isRecording: false, activeBtnId: null },
  auth: {
    token:    localStorage.getItem("auth_token")    || null,
    username: localStorage.getItem("auth_username") || null,
  }
};

// ==================================================
// Utils
// ==================================================
function $(id) { return document.getElementById(id); }

function normalizeLang(code) {
  if (!code) return "en";
  return code.split("-")[0];
}

function authHeaders() {
  return AppState.auth.token ? { Authorization: `Bearer ${AppState.auth.token}` } : {};
}

/** [ADD] Toast notification */
function showToast(message, type = "info", duration = 3000) {
  const container = $("toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toast.style.animationDuration = `${duration}ms`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

/** [ADD] Shake feedback */
function shakeElement(el) {
  if (!el) return;
  el.classList.add("shake");
  setTimeout(() => el.classList.remove("shake"), 450);
}

/** [ADD] Button loading state */
function setButtonLoading(btn, loading) {
  if (!btn) return;
  if (loading) {
    btn.classList.add("btn-loading");
    btn.disabled = true;
  } else {
    btn.classList.remove("btn-loading");
    btn.disabled = false;
  }
}

/** [ADD] Character counter */
function updateCharCount() {
  const ta = $("input-text");
  const counter = $("char-count");
  if (!ta || !counter) return;
  const len = ta.value.length;
  const max = ta.maxLength > 0 ? ta.maxLength : 5000;
  counter.textContent = `${len} / ${max}`;
  counter.classList.toggle("warn",   len > max * 0.8 && len <= max * 0.95);
  counter.classList.toggle("danger", len > max * 0.95);
}

/** [ADD] Ripple effect on all buttons */
document.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn || btn.disabled) return;
  const rect = btn.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const ripple = document.createElement("span");
  ripple.className = "btn-ripple";
  ripple.style.width  = ripple.style.height = `${size}px`;
  ripple.style.left   = `${e.clientX - rect.left - size / 2}px`;
  ripple.style.top    = `${e.clientY - rect.top  - size / 2}px`;
  btn.appendChild(ripple);
  setTimeout(() => ripple.remove(), 620);
});

// ==================================================
// Init
// ==================================================
document.addEventListener("DOMContentLoaded", () => {
  initLanguageSelectors();
  updateAuthUI();
  updateCharCount();

  if (!navigator.mediaDevices || !window.MediaRecorder) {
    document.querySelectorAll(".mic-button").forEach(btn => btn.style.display = "none");
  }
});

// ==================================================
// Language Selectors
// ==================================================
const LANG_MAP = {
  en: "English", th: "Thai", ja: "Japanese", zh: "Chinese", ko: "Korean",
  fr: "French",  de: "German", es: "Spanish", ru: "Russian", vi: "Vietnamese", id: "Indonesian"
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

/** [ADD] Swap languages */
function swapLanguages() {
  const src = $("src-lang");
  const tgt = $("tgt-lang");
  if (!src || !tgt) return;
  const tmp = src.value;
  src.value = tgt.value;
  tgt.value = tmp;
}

// ==================================================
// Auth
// ==================================================
function openAuthModal(tab = "login") {
  $("auth-modal").classList.remove("hidden");
  switchAuthTab(tab);
  hideAuthError();
}

function closeAuthModal() {
  $("auth-modal").classList.add("hidden");
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

function hideAuthError() { $("auth-error").classList.add("hidden"); }

async function handleLogin(event) {
  event.preventDefault();
  hideAuthError();

  const username = $("login-username").value.trim();
  const password = $("login-password").value;

  try {
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
    showToast(`ยินดีต้อนรับ ${username}`, "success");
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
    showToast("สมัครสมาชิกสำเร็จ 🎉", "success");
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
  showToast("ออกจากระบบแล้ว", "info");
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
async function translateText(event) {
  const btn = event?.currentTarget;
  const inputEl = $("input-text");
  const text = inputEl?.value.trim();

  if (!text) {
    showToast("กรุณาใส่ข้อความ", "error");
    shakeElement(inputEl);
    return;
  }

  const src    = normalizeLang($("src-lang").value);
  const tgt    = normalizeLang($("tgt-lang").value);
  const engine = document.querySelector('input[name="engine"]:checked')?.value || "auto";

  setButtonLoading(btn, true);
  $("output-text").innerText = "กำลังแปล...";

  try {
    const res = await fetch(`${API_BASE}/api/v1/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ text, source_lang: src, target_lang: tgt, engine })
    });

    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    $("output-text").innerText = data.translation || "(ไม่สามารถแปลได้)";

    // [ADD] Success flash
    const resultArea = document.querySelector(".result-area");
    if (resultArea) {
      resultArea.classList.remove("flash");
      void resultArea.offsetWidth;
      resultArea.classList.add("flash");
    }
    showToast("แปลสำเร็จ", "success", 2000);
  } catch (e) {
    console.error(e);
    $("output-text").innerText = "แปลไม่สำเร็จ";
    showToast("แปลไม่สำเร็จ กรุณาลองใหม่", "error");
  } finally {
    setButtonLoading(btn, false);
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
    img.classList.remove("hidden");   // เอา class hidden ออกแทน
  };
  reader.readAsDataURL(file);
}

async function runOCR() {
  const input = $("image-input");
  if (!input || input.files.length === 0) {
    showToast("กรุณาเลือกรูปภาพ", "error");
    return "";
  }

  $("ocr-extracted").innerText  = "กำลังอ่านภาพ...";
  $("ocr-translated").innerText = "-";

  const formData = new FormData();
  formData.append("file", input.files[0]);

  try {
    const res = await fetch(`${API_BASE}/api/v1/ocr`, {
      method: "POST",
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
    showToast("OCR ล้มเหลว", "error");
    return "";
  }
}

async function translateImage(event) {
  const btn = event?.currentTarget;
  AppState.activeTab = "ocr";

  setButtonLoading(btn, true);
  try {
    const extracted = await runOCR();
    if (!extracted.trim()) return;

    const src = normalizeLang(AppState.ocr.srcLang);
    const tgt = normalizeLang(AppState.ocr.tgtLang);

    $("ocr-translated").innerText = "กำลังแปล...";

    const res = await fetch(`${API_BASE}/api/v1/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ text: extracted, source_lang: src, target_lang: tgt, engine: "auto" })
    });

    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    $("ocr-translated").innerText = data.translation || "-";
    showToast("สแกนและแปลสำเร็จ", "success", 2000);
  } catch (e) {
    console.error(e);
    $("ocr-translated").innerText = "แปลไม่สำเร็จ";
    showToast("แปลไม่สำเร็จ", "error");
  } finally {
    setButtonLoading(btn, false);
  }
}

// ==================================================
// Chat
// ==================================================
function appendChatMessage(text, role = "bot") {
  const box = $("chat-history");
  if (!box) return;
  const div = document.createElement("div");
  div.className = `msg ${role}`;
  div.innerText = text.replace(/\*\*/g, "");
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
  return div;
}

/** [ADD] Typing indicator (animated dots) */
function appendTypingIndicator() {
  const box = $("chat-history");
  if (!box) return null;
  const div = document.createElement("div");
  div.className = "msg bot";
  div.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
  return div;
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
  const typingEl = appendTypingIndicator();

  try {
    const res = await fetch(`${API_BASE}/api/v1/chatbot`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ message: msg })
    });

    if (!res.ok) throw new Error(res.status);
    const data = await res.json();

    typingEl?.remove();
    appendChatMessage(data.reply || "(ไม่มีคำตอบ)", "bot");
  } catch (e) {
    console.error(e);
    typingEl?.remove();
    appendChatMessage("Chatbot ไม่สามารถตอบได้", "bot");
    showToast("ส่งข้อความไม่สำเร็จ", "error");
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

  document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));

  const tab = document.getElementById(tabId);
  if (tab) {
    tab.style.display = "block";
    tab.classList.add("active");
  }

  document.querySelectorAll(".tab-btn").forEach(btn => {
    if (btn.getAttribute("onclick")?.includes(tabId)) btn.classList.add("active");
  });
}

// ==================================================
// TEXT TO SPEECH (server-side)
// ==================================================
async function speakText(elementId, langSelectorId) {
  const el = document.getElementById(elementId);
  if (!el) return;

  const text = (el.value || el.innerText || "").trim();
  if (!text) return;

  const langCode = normalizeLang(document.getElementById(langSelectorId)?.value || "en");

  try {
    const formData = new FormData();
    formData.append("text", text);
    formData.append("language", langCode);
    formData.append("speed", "1.0");

    const res = await fetch(`${API_BASE}/api/v1/tts`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) throw new Error(`TTS failed: ${res.status}`);

    const blob = await res.blob();
    const audioUrl = URL.createObjectURL(blob);
    const audio = new Audio(audioUrl);

    audio.onended = () => URL.revokeObjectURL(audioUrl);
    audio.play();
  } catch (e) {
    console.error("TTS error:", e);
    showToast("ไม่สามารถสังเคราะห์เสียงได้", "error");
  }
}

// ==================================================
// SPEECH TO TEXT (faster-whisper)
// ==================================================
async function startSpeech(targetId) {
  const stt = AppState.stt;

  // หยุด recording
  if (stt.isRecording && stt.activeBtnId === targetId) {
    stt.mediaRecorder.stop();
    return;
  }

  // เริ่ม recording
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    stt.audioChunks = [];
    stt.isRecording = true;
    stt.activeBtnId = targetId;

    const micBtn = document.querySelector(`.mic-button[onclick*="${targetId}"]`);
    if (micBtn) micBtn.textContent = "🔴";

    const mediaRecorder = new MediaRecorder(stream);
    stt.mediaRecorder = mediaRecorder;

    mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) stt.audioChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      if (micBtn) micBtn.textContent = "🎤";
      stt.isRecording = false;
      stream.getTracks().forEach(t => t.stop());

      const blob     = new Blob(stt.audioChunks, { type: "audio/webm" });
      const formData = new FormData();
      formData.append("file", blob, "recording.webm");

      const langCode = normalizeLang(document.getElementById("src-lang")?.value || "en");
      formData.append("language", langCode);

      try {
        const target = document.getElementById(targetId);
        if (target) target.value = "กำลังถอดความ...";

        const res  = await fetch(`${API_BASE}/api/v1/stt`, {
          method: "POST",
          body: formData,
        });

        if (!res.ok) throw new Error(`STT failed: ${res.status}`);
        const data = await res.json();

        if (target) target.value = (data.text || "").trim();
      } catch (err) {
        console.error("STT error:", err);
        const target = document.getElementById(targetId);
        if (target) target.value = target.value.replace("กำลังถอดความ...", "").trim();
        showToast("ถอดความเสียงไม่สำเร็จ", "error");
      }
    };

    mediaRecorder.start();
    showToast("กำลังฟัง... พูดได้เลย", "info", 2000);
  } catch (err) {
    console.error("Microphone error:", err);
    showToast("ไม่สามารถเข้าถึง Microphone ได้", "error");
    stt.isRecording = false;
  }
}

// ==================================================
// COPY
// ==================================================
function copyText(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;

  const text = el.value || el.innerText;
  navigator.clipboard.writeText(text)
    .then(() => showToast("คัดลอกแล้ว ✓", "success", 1800))
    .catch(() => showToast("คัดลอกไม่สำเร็จ", "error"));
}