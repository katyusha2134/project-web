"""
TTS Service — edge-tts only
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ทุกภาษา → edge-tts (Microsoft Neural TTS)
ไม่ต้อง GPU / ไม่ต้อง model ใดๆ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

import io

EDGE_VOICE_MAP: dict[str, str] = {
    "th":      "th-TH-PremwadeeNeural",
    "en":      "en-US-JennyNeural",
    "zh":      "zh-CN-XiaoxiaoNeural",
    "ja":      "ja-JP-NanamiNeural",
    "ko":      "ko-KR-SunHiNeural",
    "fr":      "fr-FR-DeniseNeural",
    "de":      "de-DE-KatjaNeural",
    "es":      "es-ES-ElviraNeural",
    "ru":      "ru-RU-SvetlanaNeural",
    "vi":      "vi-VN-HoaiMyNeural",
    "id":      "id-ID-GadisNeural",
    "default": "en-US-JennyNeural",
}


async def synthesize_speech(
    text: str,
    language: str = "en",
    speed: float = 1.0,
    ref_audio_path: str | None = None,
    ref_text: str | None = None,
) -> tuple[bytes, str]:
    """Returns (audio_bytes, mime_type)"""
    import edge_tts

    lang  = language.lower().split("-")[0]
    voice = EDGE_VOICE_MAP.get(lang, EDGE_VOICE_MAP["default"])

    # edge-tts รองรับ speed ผ่าน rate parameter (+/-%)
    rate_pct = int((speed - 1.0) * 100)
    rate_str = f"+{rate_pct}%" if rate_pct >= 0 else f"{rate_pct}%"

    communicate = edge_tts.Communicate(text, voice, rate=rate_str)
    buf = io.BytesIO()
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            buf.write(chunk["data"])
    buf.seek(0)
    return buf.read(), "audio/mpeg"


def preload_models():
    """stub — edge-tts ไม่ต้อง preload"""
    pass