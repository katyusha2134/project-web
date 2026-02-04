import torch
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM

MODEL_PATH = "/home/krit/qlora_env/main/m2m100_qlora/final_m2m100_model"

tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH)

model = AutoModelForSeq2SeqLM.from_pretrained(
    MODEL_PATH,
    torch_dtype=torch.float16,
    device_map="auto"
)
model.eval()

def translate_local(text: str, src: str, tgt: str) -> str:
    tokenizer.src_lang = src
    inputs = tokenizer(text, return_tensors="pt").to(model.device)

    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            forced_bos_token_id=tokenizer.lang_code_to_id[tgt],
            max_length=512
        )

    return tokenizer.decode(outputs[0], skip_special_tokens=True)
