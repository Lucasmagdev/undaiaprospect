import io
import base64
import os
import struct

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from kokoro_onnx import Kokoro

PORT = int(os.getenv("PORT", 5050))
VOICE = os.getenv("TTS_VOICE", "pf_dora")  # pt-br female; pm_alex = male
SPEED = float(os.getenv("TTS_SPEED", "1.0"))

app = FastAPI()
kokoro = Kokoro("kokoro-v1.0.onnx", "voices-v1.0.bin")


class SynthRequest(BaseModel):
    text: str
    language: str = "pt-br"
    voice: str = VOICE
    speed: float = SPEED


def _samples_to_wav_bytes(samples: np.ndarray, sample_rate: int) -> bytes:
    pcm = (np.clip(samples, -1.0, 1.0) * 32767).astype(np.int16).tobytes()
    buf = io.BytesIO()
    # WAV header
    data_size = len(pcm)
    buf.write(b"RIFF")
    buf.write(struct.pack("<I", 36 + data_size))
    buf.write(b"WAVE")
    buf.write(b"fmt ")
    buf.write(struct.pack("<IHHIIHH", 16, 1, 1, sample_rate, sample_rate * 2, 2, 16))
    buf.write(b"data")
    buf.write(struct.pack("<I", data_size))
    buf.write(pcm)
    return buf.getvalue()


@app.get("/health")
def health():
    return {"ok": True, "default_voice": VOICE}


@app.post("/synthesize")
def synthesize(req: SynthRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="text vazio")
    try:
        samples, sample_rate = kokoro.create(
            req.text,
            voice=req.voice,
            speed=req.speed,
            lang=req.language,
        )
        wav_bytes = _samples_to_wav_bytes(samples, sample_rate)
        audio_b64 = base64.b64encode(wav_bytes).decode()
        return JSONResponse({"audio_base64": audio_b64, "format": "wav"})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT)
