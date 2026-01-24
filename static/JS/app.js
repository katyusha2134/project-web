// ==========================================
// 1. ฐานข้อมูลภาษา (ISO Codes) - เรียง A-Z
// ==========================================
const languages = {
    // --- ภาษาหลัก (ไว้บนสุดเพื่อความสะดวก) ---
    "th-TH": "Thai (ไทย)",
    "en-US": "English (อังกฤษ)",

    // --- รายชื่อเรียงตามตัวอักษร A-Z ---
    "af-ZA": "Afrikaans (แอฟริคานส์)",
    "sq-AL": "Albanian (แอลเบเนีย)",
    "am-ET": "Amharic (อัมฮาริก)",
    "ar-SA": "Arabic (อาหรับ)",
    "ar-EG": "Arabic Egypt (อาหรับ-อียิปต์)",
    "hy-AM": "Armenian (อาร์มีเนีย)",
    "az-AZ": "Azerbaijani (อาเซอร์ไบจาน)",
    "be-BY": "Belarusian (เบลารุส)",
    "bn-IN": "Bengali (เบงกาลี)",
    "bs-BA": "Bosnian (บอสเนีย)",
    "bg-BG": "Bulgarian (บัลแกเรีย)",
    "my-MM": "Burmese (พม่า)",
    "ceb-PH": "Cebuano (เซบูอาโน)",
    "zh-CN": "Chinese Simplified (จีนตัวย่อ)",
    "zh-TW": "Chinese Traditional (จีนตัวเต็ม)",
    "hr-HR": "Croatian (โครเอเชีย)",
    "cs-CZ": "Czech (เช็ก)",
    "da-DK": "Danish (เดนมาร์ก)",
    "nl-NL": "Dutch (ดัตช์)",
    "en-GB": "English UK (อังกฤษ-สหราชอาณาจักร)",
    "eo-EO": "Esperanto (เอสเปรันโต)",
    "et-EE": "Estonian (เอสโตเนีย)",
    "fi-FI": "Finnish (ฟินแลนด์)",
    "fr-FR": "French (ฝรั่งเศส)",
    "fr-CA": "French Canada (ฝรั่งเศส-แคนาดา)",
    "fy-NL": "Frisian (ฟริเซียน)",
    "ka-GE": "Georgian (จอร์เจีย)",
    "de-DE": "German (เยอรมัน)",
    "el-GR": "Greek (กรีก)",
    "gu-IN": "Gujarati (คุชราต)",
    "ha-NG": "Hausa (เฮาซา)",
    "he-IL": "Hebrew (ฮีบรู)",
    "hi-IN": "Hindi (ฮินดี)",
    "hu-HU": "Hungarian (ฮังการี)",
    "is-IS": "Icelandic (ไอซ์แลนด์)",
    "ig-NG": "Igbo (อิกโบ)",
    "id-ID": "Indonesian (อินโดนีเซีย)",
    "ga-IE": "Irish (ไอริช)",
    "it-IT": "Italian (อิตาลี)",
    "ja-JP": "Japanese (ญี่ปุ่น)",
    "jv-ID": "Javanese (ชวา)",
    "kk-KZ": "Kazakh (คาซัค)",
    "km-KH": "Khmer (เขมร)",
    "ko-KR": "Korean (เกาหลี)",
    "ky-KG": "Kyrgyz (คีร์กีซ)",
    "lo-LA": "Lao (ลาว)",
    "la-VA": "Latin (ละติน)",
    "lv-LV": "Latvian (ลัตเวีย)",
    "lt-LT": "Lithuanian (ลิทัวเนีย)",
    "mk-MK": "Macedonian (มาซิโดเนีย)",
    "ms-MY": "Malay (มาเลย์)",
    "mt-MT": "Maltese (มอลตา)",
    "mr-IN": "Marathi (มราฐี)",
    "mn-MN": "Mongolian (มองโกเลีย)",
    "ne-NP": "Nepali (เนปาล)",
    "no-NO": "Norwegian (นอร์เวย์)",
    "ps-AF": "Pashto (พัชโต)",
    "fa-IR": "Persian (เปอร์เซีย)",
    "pl-PL": "Polish (โปแลนด์)",
    "pt-PT": "Portuguese (โปรตุเกส)",
    "pt-BR": "Portuguese Brazil (โปรตุเกส-บราซิล)",
    "pa-IN": "Punjabi (ปัญจาบ)",
    "ro-RO": "Romanian (โรมาเนีย)",
    "ru-RU": "Russian (รัสเซีย)",
    "sr-RS": "Serbian (เซอร์เบีย)",
    "si-LK": "Sinhala (สิงหล)",
    "sk-SK": "Slovak (สโลวัก)",
    "sl-SI": "Slovenian (สโลวีเนีย)",
    "es-ES": "Spanish (สเปน)",
    "es-MX": "Spanish Mexico (สเปน-เม็กซิโก)",
    "su-ID": "Sundanese (ซุนดา)",
    "sw-KE": "Swahili (สวาฮีลี)",
    "sv-SE": "Swedish (สวีเดน)",
    "tl-PH": "Tagalog (ฟิลิปปินส์)",
    "tg-TJ": "Tajik (ทาจิก)",
    "ta-IN": "Tamil (ทมิฬ)",
    "te-IN": "Telugu (เตลูกู)",
    "tr-TR": "Turkish (ตุรกี)",
    "uk-UA": "Ukrainian (ยูเครน)",
    "ur-PK": "Urdu (อูรดู)",
    "uz-UZ": "Uzbek (อุซเบก)",
    "vi-VN": "Vietnamese (เวียดนาม)",
    "cy-GB": "Welsh (เวลส์)",
    "xh-ZA": "Xhosa (โคซา)",
    "yo-NG": "Yoruba (โยรูบา)",
    "zu-ZA": "Zulu (ซูลู)"
};

// ==========================================
// 2. ฟังก์ชันจัดการหน้าเว็บทั่วไป (UI)
// ==========================================

// เรียกใช้งานทันทีที่เปิดเว็บ เพื่อโหลดรายชื่อภาษา
document.addEventListener('DOMContentLoaded', populateLanguages);

// ฟังก์ชันสลับ Tab (แปลภาษา / OCR / Chatbot)
function openTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    document.getElementById(tabId).style.display = 'block';
    event.currentTarget.classList.add('active');
}

// ฟังก์ชันจัดรูปแบบข้อความ (ทำตัวหนา และ bullet points)
function formatText(text) {
    let formatted = text;
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
    formatted = formatted.replace(/^\* /gm, '• ');
    formatted = formatted.replace(/\n/g, '<br>');
    return formatted;
}

// ฟังก์ชันโหลดภาษาลงใน Dropdown Select
function populateLanguages() {
    const selects = ['src-lang', 'tgt-lang', 'ocr-tgt-lang'];
    
    selects.forEach(id => {
        const select = document.getElementById(id);
        if(!select) return;

        select.innerHTML = ''; // ล้างค่าเก่า
        
        for (const [code, name] of Object.entries(languages)) {
            const option = document.createElement("option");
            option.value = code; // ส่งรหัสภาษาไปให้ Web Speech API (เช่น th-TH)
            option.text = name;
            select.appendChild(option);
        }
    });

    // ตั้งค่าเริ่มต้น (ต้นทาง: อังกฤษ, ปลายทาง: ไทย)
    document.getElementById('src-lang').value = "en-US";
    document.getElementById('tgt-lang').value = "th-TH";
    
    // เช็คก่อนว่ามี element นี้ไหม (กัน error ในบางหน้า)
    if(document.getElementById('ocr-tgt-lang')) {
        document.getElementById('ocr-tgt-lang').value = "th-TH";
    }
}

// ฟังก์ชันสลับภาษาต้นทาง <-> ปลายทาง
function swapLanguages() {
    const src = document.getElementById('src-lang');
    const tgt = document.getElementById('tgt-lang');
    const temp = src.value;
    src.value = tgt.value;
    tgt.value = temp;
}

// ==========================================
// 3. ฟังก์ชันเกี่ยวกับเสียง (Speech & Audio)
// ==========================================

// ฟังก์ชันพูดแล้วพิมพ์ (Speech-to-Text)
function startSpeech(elementId) {
    if (!('webkitSpeechRecognition' in window)) {
        alert("เบราว์เซอร์ของคุณไม่รองรับการสั่งงานด้วยเสียง (แนะนำให้ใช้ Google Chrome)");
        return;
    }
    
    const recognition = new webkitSpeechRecognition();
    // ตั้งค่าภาษาที่จะฟัง ให้ตรงกับภาษาที่เลือกใน Dropdown
    recognition.lang = document.getElementById('src-lang').value;
    recognition.interimResults = false;

    recognition.onstart = function() {
        document.getElementById(elementId).placeholder = "กำลังฟัง... พูดได้เลย!";
    };

    recognition.onresult = function(event) {
        const transcript = event.results[0][0].transcript;
        document.getElementById(elementId).value = transcript;
    };

    recognition.onerror = function(event) {
        alert("เกิดข้อผิดพลาดในการรับเสียง: " + event.error);
    };

    recognition.start();
}

// ฟังก์ชันอ่านเสียง (Text-to-Speech)
function speakText(elementId, langSelectId) {
    let text = "";
    if (elementId === 'input-text') {
        text = document.getElementById(elementId).value;
    } else {
        text = document.getElementById(elementId).innerText;
    }

    if (!text) return;

    const utterance = new SpeechSynthesisUtterance(text);
    // ดึงรหัสภาษาจาก Select (เช่น th-TH) เพื่อให้อ่านออกเสียงถูกสำเนียง
    utterance.lang = document.getElementById(langSelectId).value; 
    window.speechSynthesis.speak(utterance);
}

// ฟังก์ชันคัดลอกข้อความ
function copyText(elementId) {
    let text = "";
    if (elementId === 'input-text') {
        text = document.getElementById(elementId).value;
    } else {
        text = document.getElementById(elementId).innerText;
    }
    
    navigator.clipboard.writeText(text).then(() => {
        alert("คัดลอกเรียบร้อย!");
    });
}

// ==========================================
// 4. ฟังก์ชันหลัก (Translate, Chatbot, OCR)
// ==========================================

// 1. แปลข้อความ (Translate Text)
async function translateText() {
    const text = document.getElementById('input-text').value;
    
    // ดึงรหัสภาษา (เช่น th-TH)
    const srcCode = document.getElementById('src-lang').value;
    const tgtCode = document.getElementById('tgt-lang').value;
    
    // แปลงรหัสเป็นชื่อภาษาภาษาอังกฤษ (เช่น th-TH -> Thai) เพื่อส่งให้ AI เข้าใจ
    const srcName = languages[srcCode].split(" (")[0]; 
    const tgtName = languages[tgtCode].split(" (")[0];

    if(!text) return alert("กรุณาพิมพ์ข้อความ");

    document.getElementById('output-text').innerHTML = "<i>กำลังแปล...</i>";
    
    try {
        const res = await fetch('/api/v1/translate', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ text: text, source_lang: srcName, target_lang: tgtName })
        });
        const data = await res.json();
        document.getElementById('output-text').innerText = data.translation;
    } catch(e) {
        document.getElementById('output-text').innerText = "เกิดข้อผิดพลาดในการแปล";
        console.error(e);
    }
}

// 2. แชทบอท (Chatbot)
async function sendChat() {
    const input = document.getElementById('chat-input');
    const msg = input.value;
    if(!msg) return;

    const chatBox = document.getElementById('chat-history');
    
    // ใส่ข้อความฝั่งคนถาม (User)
    chatBox.innerHTML += `<div class="msg user">${msg}</div>`;
    input.value = '';
    chatBox.scrollTop = chatBox.scrollHeight;

    // ใส่สถานะกำลังพิมพ์...
    const loadingId = "loading-" + Date.now();
    chatBox.innerHTML += `<div class="msg bot" id="${loadingId}">...</div>`;
    chatBox.scrollTop = chatBox.scrollHeight;

    try {
        const res = await fetch('/api/v1/chatbot', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ message: msg })
        });
        const data = await res.json();
        
        // ลบสถานะกำลังพิมพ์ออก แล้วใส่ข้อความจริง
        document.getElementById(loadingId).remove();
        chatBox.innerHTML += `<div class="msg bot">${formatText(data.reply)}</div>`;
        
    } catch(e) {
        document.getElementById(loadingId).innerText = "ระบบขัดข้อง";
    }
    chatBox.scrollTop = chatBox.scrollHeight;
}

// 3. แปลรูปภาพ (OCR)
function previewImage() {
    const file = document.getElementById('image-input').files[0];
    if(file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = document.getElementById('image-preview');
            img.src = e.target.result;
            img.style.display = 'block';
        }
        reader.readAsDataURL(file);
    }
}

// แก้ไขฟังก์ชัน translateImage ให้จัดรูปแบบข้อความสวยๆ
async function translateImage() {
    const fileInput = document.getElementById('image-input');
    
    // ดึงภาษาปลายทาง
    const tgtCode = document.getElementById('ocr-tgt-lang').value;
    const tgtName = languages[tgtCode].split(" (")[0]; 
    
    if(fileInput.files.length === 0) return alert("กรุณาเลือกรูปภาพ");

    const formData = new FormData();
    formData.append('image', fileInput.files[0]);
    formData.append('target_lang', tgtName);

    // ใส่สถานะกำลังโหลดแบบสวยๆ
    document.getElementById('ocr-extracted').innerHTML = "<i>🔍 กำลังสแกนตัวอักษร...</i>";
    document.getElementById('ocr-translated').innerHTML = "<i>✨ กำลังเรียบเรียงคำแปล...</i>";
    
    try {
        const res = await fetch('/api/v1/ocr-translate', {
            method: 'POST',
            body: formData
        });
        
        const data = await res.json();
        if(data.error) {
            alert(data.error);
            document.getElementById('ocr-extracted').innerText = "เกิดข้อผิดพลาด";
            document.getElementById('ocr-translated').innerText = "-";
        } else {
            // จุดสำคัญ! ใช้ formatText() ช่วยลบ ** และจัดบรรทัด
            // และใช้ innerHTML แทน innerText เพื่อให้แสดงตัวหนาได้จริง
            document.getElementById('ocr-extracted').innerText = data.extracted_text;
            document.getElementById('ocr-translated').innerHTML = formatText(data.translation);
        }
    } catch(e) {
        alert("Server Error: เชื่อมต่อไม่ได้");
    }
}