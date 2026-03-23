import pytesseract
from PIL import Image
import io

def run_ocr(image_bytes: bytes) -> str:
    img = Image.open(io.BytesIO(image_bytes))
    return pytesseract.image_to_string(img, lang="eng+tha")
