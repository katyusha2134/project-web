from model_loader import translate_local
from cloud_gemini import translate_cloud

def hybrid_translate(text, src, tgt, engine):
    if engine == "local":
        return translate_local(text, src, tgt), "local"

    if engine == "cloud":
        return translate_cloud(text, tgt), "cloud"

    # auto (policyOption B)
    try:
        return translate_local(text, src, tgt), "local"
    except Exception:
        return translate_cloud(text, tgt), "cloud"
