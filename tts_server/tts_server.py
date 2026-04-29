import io
import re
import base64
import os
import struct
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from kokoro_onnx import Kokoro

PORT      = int(os.getenv("PORT", 5050))
TTS_VOICE = os.getenv("TTS_VOICE", "pf_dora")
TTS_SPEED = float(os.getenv("TTS_SPEED", "0.85"))

PIPER_BIN        = os.getenv("PIPER_BIN", "/opt/tts_server/piper/piper")
PIPER_MODEL_DIR  = os.getenv("PIPER_MODEL_DIR", "/opt/tts_server/piper_models")
PIPER_VOICE      = os.getenv("PIPER_VOICE", "pt_BR-faber-medium")

app    = FastAPI()
kokoro = Kokoro("kokoro-v1.0.onnx", "voices-v1.0.bin")


# ── text preprocessing ──────────────────────────────────────────────────────

def preprocess(text: str) -> str:
    text = re.sub(r'R\$\s*(\d+)', r'R$ \1 reais', text)
    text = re.sub(r'(\d+)%', r'\1 por cento', text)
    text = re.sub(r'\b(\d{2})\s*\.\s*(\d{3})\b', r'\1\2', text)
    text = text.replace('&', 'e').replace(' p/', ' para').replace('vc', 'você')
    text = text.replace('tb ', 'também ').replace('tbm ', 'também ')
    text = re.sub(r'([^.!?])\n', r'\1. ', text)
    return text.strip()


# ── WAV helpers ─────────────────────────────────────────────────────────────

def pcm_to_wav(pcm_bytes: bytes, sample_rate: int, channels: int = 1, bits: int = 16) -> bytes:
    buf = io.BytesIO()
    block_align = channels * bits // 8
    byte_rate   = sample_rate * block_align
    buf.write(b"RIFF")
    buf.write(struct.pack("<I", 36 + len(pcm_bytes)))
    buf.write(b"WAVE")
    buf.write(b"fmt ")
    buf.write(struct.pack("<IHHIIHH", 16, 1, channels, sample_rate, byte_rate, block_align, bits))
    buf.write(b"data")
    buf.write(struct.pack("<I", len(pcm_bytes)))
    buf.write(pcm_bytes)
    return buf.getvalue()


def samples_to_wav(samples: np.ndarray, sample_rate: int) -> bytes:
    pcm = (np.clip(samples, -1.0, 1.0) * 32767).astype(np.int16).tobytes()
    return pcm_to_wav(pcm, sample_rate)


# ── engines ──────────────────────────────────────────────────────────────────

def synth_kokoro(text: str, voice: str, speed: float) -> bytes:
    samples, sr = kokoro.create(preprocess(text), voice=voice, speed=speed, lang="pt-br")
    return samples_to_wav(samples, sr)


def synth_piper(text: str, voice: str, speed: float = 1.0) -> bytes:
    model_path = Path(PIPER_MODEL_DIR) / f"{voice}.onnx"
    config_path = Path(PIPER_MODEL_DIR) / f"{voice}.onnx.json"
    if not model_path.exists():
        raise RuntimeError(f"Modelo Piper nao encontrado: {model_path}")
    # Piper length_scale: >1 = mais lento, <1 = mais rapido (inverso do speed)
    length_scale = round(1.0 / max(speed, 0.1), 3)
    cmd = [PIPER_BIN, "--model", str(model_path), "--output_raw",
           "--length-scale", str(length_scale)]
    if config_path.exists():
        cmd += ["--config", str(config_path)]
    result = subprocess.run(cmd, input=preprocess(text).encode("utf-8"),
                            capture_output=True, timeout=30)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.decode())
    return pcm_to_wav(result.stdout, sample_rate=22050)


# ── routes ───────────────────────────────────────────────────────────────────

class SynthRequest(BaseModel):
    text:     str
    engine:   str   = "kokoro"     # "kokoro" | "piper"
    voice:    str   = ""           # vazio = usa default do engine
    speed:    float = TTS_SPEED
    language: str   = "pt-br"


@app.get("/health")
def health():
    piper_ok = Path(PIPER_BIN).exists()
    return {
        "ok": True,
        "engines": {
            "kokoro": {"default_voice": TTS_VOICE, "speed": TTS_SPEED},
            "piper":  {"available": piper_ok, "default_voice": PIPER_VOICE},
        },
    }


@app.get("/engines")
def engines():
    piper_ok = Path(PIPER_BIN).exists()
    piper_voices = [p.stem.replace(".onnx", "") for p in Path(PIPER_MODEL_DIR).glob("*.onnx")] if Path(PIPER_MODEL_DIR).exists() else []
    kokoro_voices = list(sorted(kokoro.get_voices()))
    return {
        "kokoro": {"voices": [v for v in kokoro_voices if v.startswith("p")], "default": TTS_VOICE},
        "piper":  {"available": piper_ok, "voices": piper_voices, "default": PIPER_VOICE},
    }


@app.post("/synthesize")
def synthesize(req: SynthRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="text vazio")
    try:
        if req.engine == "piper":
            voice = req.voice or PIPER_VOICE
            wav   = synth_piper(req.text, voice, req.speed)
        else:
            voice = req.voice or TTS_VOICE
            wav   = synth_kokoro(req.text, voice, req.speed)
        return JSONResponse({"audio_base64": base64.b64encode(wav).decode(), "format": "wav", "engine": req.engine})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT)
