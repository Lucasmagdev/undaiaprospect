import io
import re
import base64
import os
import json
import struct
import subprocess
import logging
import asyncio
import threading
import wave
import uuid
import xml.sax.saxutils as xmlesc
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from kokoro_onnx import Kokoro

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

PORT      = int(os.getenv("PORT", 5050))
TTS_VOICE = os.getenv("TTS_VOICE", "pf_dora")
TTS_SPEED = float(os.getenv("TTS_SPEED", "0.85"))

PIPER_BIN       = os.getenv("PIPER_BIN", "/opt/tts_server/piper/piper")
PIPER_MODEL_DIR = os.getenv("PIPER_MODEL_DIR", "/opt/tts_server/piper_models")
PIPER_VOICE     = os.getenv("PIPER_VOICE", "pt_BR-faber-medium")

PIPER_NOISE_SCALE  = float(os.getenv("PIPER_NOISE_SCALE", "0.5"))
PIPER_NOISE_W      = float(os.getenv("PIPER_NOISE_W", "0.75"))
PIPER_SENT_SILENCE = float(os.getenv("PIPER_SENT_SILENCE", "0.2"))

# Edge TTS — vozes neurais da Microsoft
# FranciscaNeural suporta style="chat" → muda completamente a prosódia para conversacional
EDGE_VOICE_F = os.getenv("EDGE_VOICE_F", "pt-BR-FranciscaNeural")
EDGE_VOICE_M = os.getenv("EDGE_VOICE_M", "pt-BR-AntonioNeural")

# WebSocket direto (permite SSML com mstts:express-as style="chat")
_EDGE_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4"
_EDGE_WSS   = "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1"

XTTS_SPEAKER_WAV = os.getenv("XTTS_SPEAKER_WAV", "/opt/tts_server/xtts_speaker.wav")
FFMPEG_BIN       = os.getenv("FFMPEG_BIN", "ffmpeg")

app    = FastAPI()
kokoro = Kokoro("kokoro-v1.0.onnx", "voices-v1.0.bin")

_xtts_model = None
_xtts_lock  = threading.Lock()


# ── text preprocessing ───────────────────────────────────────────────────────

_ABBREVS = [
    (r'\bvc\b',   'você'),    (r'\bvcs\b',  'vocês'),
    (r'\btb\b',   'também'), (r'\btbm\b',  'também'),
    (r'\bpq\b',   'porque'),  (r'\bq\b',    'que'),
    (r'\bpra\b',  'para'),    (r'\bpro\b',  'para o'),
    (r'\bmto\b',  'muito'),   (r'\bmt\b',   'muito'),
    (r'\btá\b',   'está'),    (r'\btô\b',   'estou'),
    (r'\bblz\b',  'beleza'),  (r'\bflw\b',  'falou'),
    (r'\bvlw\b',  'valeu'),   (r'\bokei\b', 'okay'),
    (r'\bmsm\b',  'mesmo'),   (r'\bqdo\b',  'quando'),
    (r'\bhj\b',   'hoje'),    (r'\bsdds\b', 'saudades'),
]
_ABBREV_RE = [(re.compile(p, re.IGNORECASE), r) for p, r in _ABBREVS]


def preprocess(text: str, casual: bool = False) -> str:
    """
    casual=True → modo conversacional para WhatsApp:
      - vírgula em vez de ponto para quebra de linha (pausa mais curta e suave)
      - NÃO força ponto final (evita prosódia de "fim de narração")
    casual=False → modo formal para Piper/Kokoro que precisam de pontuação
    """
    text = re.sub(
        r'R\$\s*(\d{1,3}(?:\.\d{3})*),(\d{2})',
        lambda m: f"R$ {m.group(1).replace('.', '')} reais e {m.group(2)} centavos", text)
    text = re.sub(
        r'R\$\s*(\d{1,3}(?:\.\d{3})*)',
        lambda m: f"R$ {m.group(1).replace('.', '')} reais", text)
    text = re.sub(r'(\d+)%', r'\1 por cento', text)
    text = re.sub(r'\b(\d{2})\s*\.\s*(\d{3,5})\b', r'\1\2', text)
    text = text.replace('&', ' e ').replace(' p/', ' para ')
    text = re.sub(r'\b(kk+|hah+a*|heh+e*|rs+)\b', '', text, flags=re.IGNORECASE)
    for pat, repl in _ABBREV_RE:
        text = pat.sub(repl, text)

    if casual:
        # Quebra de linha → vírgula (pausa curta, não narração)
        text = re.sub(r'([^.!?,])\n', r'\1, ', text)
    else:
        text = re.sub(r'([^.!?])\n', r'\1. ', text)
        text = text.strip()
        if text and text[-1] not in '.!?':
            text += '.'

    return re.sub(r'\s{2,}', ' ', text).strip()


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def humanize_for_audio(text: str) -> str:
    text = re.sub(r'\s*\n+\s*', '. ', text.strip())
    replacements = [
        (r'\bde forma automática\b', 'de um jeito automático'),
        (r'\bsem precisar ficar respondendo tudo na mão\b',
         'sem você precisar responder tudo manualmente'),
        (r'\bÉ algo simples\b', 'É bem simples'),
        (r'\bdá pra mostrar\b', 'eu consigo te mostrar'),
        (r'\bPosso te mandar como funciona\??', 'Posso te mandar rapidinho como funciona?'),
        (r'\bqueria te mandar\b', 'queria te mostrar'),
        (r'\baqui da região\b', 'da sua região'),
    ]
    for pattern, repl in replacements:
        text = re.sub(pattern, repl, text, flags=re.IGNORECASE)

    text = re.sub(r'\s{2,}', ' ', text).strip()
    if text and not re.match(r'^(oi|olá|ola)\b', text, flags=re.IGNORECASE):
        text = 'Oi, tudo bem? ' + text
    return text


def compose_spoken_text(text: str, style: str = "chat", styledegree: float = 1.5,
                        character: str = "casual", prefix: str = "",
                        suffix: str = "", humanize_audio: bool = False) -> str:
    if humanize_audio:
        text = humanize_for_audio(text)

    parts = [p for p in [prefix.strip(), text.strip(), suffix.strip()] if p]
    full = " ".join(parts)

    casual_mode = character != "professional"
    processed = preprocess(full, casual=casual_mode)
    styledegree = clamp(styledegree, 0.01, 2.0)

    if character == "professional" or style == "customerservice":
        processed = re.sub(r'!+', '.', processed)
        processed = re.sub(r'\s*,\s*', '. ', processed)
        processed = re.sub(r'\s{2,}', ' ', processed).strip()
        if processed and processed[-1] not in ".!?":
            processed += "."

    if character == "enthusiastic" or style == "excited":
        processed = re.sub(r'\.\s+', '! ', processed)
        if styledegree >= 1.2:
            processed = re.sub(r'\?$', '?', processed)
            processed = re.sub(r'\.$', '!', processed)

    if style == "calm":
        processed = re.sub(r'!+', '.', processed)
        processed = re.sub(r'\.\s+', ', ', processed)

    if style == "hopeful" and processed and processed[-1] == '.':
        processed = processed[:-1] + '?'

    return re.sub(r'\s{2,}', ' ', processed).strip()


def styled_speed(speed: float, style: str = "chat", styledegree: float = 1.5,
                 character: str = "casual") -> float:
    style_base = {
        "calm": 0.90,
        "friendly": 1.02,
        "chat": 1.04,
        "excited": 1.11,
        "hopeful": 1.03,
        "customerservice": 0.97,
    }.get(style, 1.0)
    char_base = {
        "casual": 1.03,
        "enthusiastic": 1.06,
        "professional": 0.96,
        "custom": 1.0,
    }.get(character, 1.0)

    intensity = clamp(styledegree, 0.5, 2.0)
    factor = 1 + ((style_base * char_base) - 1) * intensity
    return clamp(speed * factor, 0.5, 1.5)


# ── post-processing ──────────────────────────────────────────────────────────

def postprocess(samples: np.ndarray, sr: int,
                normalize: bool = True,
                trim_silence: bool = True,
                fade_ms: int = 80) -> np.ndarray:
    samples = samples.astype(np.float32)

    if trim_silence and len(samples) > 0:
        indices = np.where(np.abs(samples) > 0.01)[0]
        if len(indices):
            pad   = int(0.02 * sr)
            start = max(0, indices[0] - pad)
            end   = min(len(samples), indices[-1] + pad + 1)
            samples = samples[start:end]

    if fade_ms > 0 and len(samples) > 0:
        n = min(int(fade_ms / 1000 * sr), len(samples) // 4)
        if n > 0:
            ramp = np.linspace(0.0, 1.0, n, dtype=np.float32)
            samples[:n]  *= ramp
            samples[-n:] *= ramp[::-1]

    if normalize and len(samples) > 0:
        rms = np.sqrt(np.mean(samples ** 2))
        if rms > 1e-6:
            target_rms = 10 ** (-18 / 20)
            samples = np.clip(samples * (target_rms / rms), -1.0, 1.0)

    return samples


# ── WAV helpers ──────────────────────────────────────────────────────────────

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


def wav_bytes_to_samples(wav_bytes: bytes) -> tuple:
    with wave.open(io.BytesIO(wav_bytes), 'rb') as wf:
        sr       = wf.getframerate()
        raw      = wf.readframes(wf.getnframes())
        channels = wf.getnchannels()
    samples = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    if channels > 1:
        samples = samples.reshape(-1, channels).mean(axis=1)
    return samples, sr


def mp3_to_wav_bytes(mp3_bytes: bytes, sr_out: int = 24000) -> bytes | None:
    try:
        result = subprocess.run(
            [FFMPEG_BIN, "-hide_banner", "-loglevel", "error",
             "-i", "pipe:0", "-f", "wav", "-acodec", "pcm_s16le",
             "-ar", str(sr_out), "-ac", "1", "pipe:1"],
            input=mp3_bytes, capture_output=True, timeout=30)
        return result.stdout if result.returncode == 0 else None
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return None


def apply_pitch_wav(wav_bytes: bytes, sample_rate: int, pitch_pct: float = 0.0) -> bytes:
    pitch_pct = clamp(float(pitch_pct or 0.0), -50.0, 50.0)
    if abs(pitch_pct) < 0.5:
        return wav_bytes

    factor = clamp(1.0 + (pitch_pct / 100.0), 0.5, 1.5)
    tempo = clamp(1.0 / factor, 0.5, 2.0)
    audio_filter = f"asetrate={sample_rate}*{factor:.4f},aresample={sample_rate},atempo={tempo:.4f}"
    try:
        result = subprocess.run(
            [FFMPEG_BIN, "-hide_banner", "-loglevel", "error",
             "-i", "pipe:0", "-af", audio_filter,
             "-f", "wav", "-acodec", "pcm_s16le",
             "-ar", str(sample_rate), "-ac", "1", "pipe:1"],
            input=wav_bytes, capture_output=True, timeout=30)
        return result.stdout if result.returncode == 0 and result.stdout else wav_bytes
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return wav_bytes


# ── Edge TTS via WebSocket direto (SSML com style="chat") ───────────────────

async def _edge_stream_ssml(ssml: str) -> bytes:
    """
    Chama a API Edge TTS diretamente via WebSocket com SSML customizado.
    Permite usar mstts:express-as style="chat" que transforma a prosódia
    de leitura/narração para conversa casual — diferença audível enorme.
    """
    from aiohttp import ClientSession, WSMsgType
    conn_id = uuid.uuid4().hex
    ts = datetime.now(timezone.utc).strftime(
        "%a %b %d %Y %H:%M:%S GMT+0000 (Coordinated Universal Time)")

    async with ClientSession() as session:
        async with session.ws_connect(
            f"{_EDGE_WSS}?TrustedClientToken={_EDGE_TOKEN}&ConnectionId={conn_id}",
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0"
                ),
                "Origin": "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
                "Pragma": "no-cache",
                "Cache-Control": "no-cache",
            },
        ) as ws:
            await ws.send_str(
                f"X-Timestamp:{ts}\r\n"
                "Content-Type:application/json; charset=utf-8\r\n"
                "Path:speech.config\r\n\r\n"
                '{"context":{"synthesis":{"audio":{"metadataoptions":{'
                '"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},'
                '"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}'
            )
            await ws.send_str(
                f"X-RequestId:{conn_id}\r\n"
                "Content-Type:application/ssml+xml\r\n"
                f"X-Timestamp:{ts}\r\n"
                f"Path:ssml\r\n\r\n{ssml}"
            )

            chunks = []
            async for msg in ws:
                if msg.type == WSMsgType.BINARY:
                    # Protocolo: 2 bytes big-endian = tamanho do header, depois audio
                    header_len = int.from_bytes(msg.data[:2], "big")
                    audio = msg.data[2 + header_len:]
                    if audio:
                        chunks.append(audio)
                elif msg.type == WSMsgType.TEXT:
                    if "Path:turn.end" in msg.data:
                        break

    return b"".join(chunks)


def synth_edge(text: str, voice: str, speed: float = 1.0,
               style: str = "chat", styledegree: float = 1.5,
               pitch_pct: float = -3.0, character: str = "casual",
               prefix: str = "", suffix: str = "", humanize_audio: bool = False,
               normalize=True, trim_silence=True, fade_ms=80) -> tuple:
    lang     = "-".join(voice.split("-")[:2])
    rate_str = f"{int((speed - 1.0) * 100):+d}%"
    pitch_str = f"{pitch_pct:+.0f}%"
    sd       = max(0.01, min(2.0, styledegree))

    # Monta texto completo com prefixo/sufixo
    processed = compose_spoken_text(
        text, style=style, styledegree=styledegree,
        character=character, prefix=prefix, suffix=suffix,
        humanize_audio=humanize_audio)

    # Personagem → perfil de pré-processamento
    clean = xmlesc.escape(processed)

    ssml = (
        f'<speak version="1.0" '
        f'xmlns="http://www.w3.org/2001/10/synthesis" '
        f'xmlns:mstts="https://www.w3.org/2001/mstts" '
        f'xml:lang="{lang}">'
        f'<voice name="{voice}">'
        f'<mstts:express-as style="{style}" styledegree="{sd}">'
        f'<prosody rate="{rate_str}" pitch="{pitch_str}">'
        f'{clean}'
        f'</prosody>'
        f'</mstts:express-as>'
        f'</voice>'
        f'</speak>'
    )

    loop = asyncio.new_event_loop()
    try:
        mp3_bytes = loop.run_until_complete(_edge_stream_ssml(ssml))
    finally:
        loop.close()

    if not mp3_bytes:
        raise RuntimeError("Edge TTS retornou áudio vazio")

    wav_bytes = mp3_to_wav_bytes(mp3_bytes)
    if wav_bytes:
        samples, sr = wav_bytes_to_samples(wav_bytes)
        samples = postprocess(samples, sr, normalize=normalize,
                              trim_silence=trim_silence, fade_ms=fade_ms)
        return samples_to_wav(samples, sr), "wav"

    log.warning("ffmpeg indisponível — retornando MP3 sem post-process")
    return mp3_bytes, "mp3"


# ── Kokoro / Piper ───────────────────────────────────────────────────────────

def synth_kokoro(text: str, voice: str, speed: float,
                 style: str = "chat", styledegree: float = 1.5,
                 pitch_pct: float = -3.0, character: str = "casual",
                 prefix: str = "", suffix: str = "", humanize_audio: bool = False,
                 normalize=True, trim_silence=True, fade_ms=80) -> bytes:
    spoken = compose_spoken_text(
        text, style=style, styledegree=styledegree,
        character=character, prefix=prefix, suffix=suffix,
        humanize_audio=humanize_audio)
    speed = styled_speed(speed, style=style, styledegree=styledegree, character=character)
    samples, sr = kokoro.create(spoken, voice=voice, speed=speed, lang="pt-br")
    samples = postprocess(samples, sr, normalize=normalize, trim_silence=trim_silence, fade_ms=fade_ms)
    return apply_pitch_wav(samples_to_wav(samples, sr), sr, pitch_pct)


def synth_piper(text: str, voice: str, speed: float = 1.0,
                style: str = "chat", styledegree: float = 1.5,
                pitch_pct: float = -3.0, character: str = "casual",
                prefix: str = "", suffix: str = "", humanize_audio: bool = False,
                noise_scale=PIPER_NOISE_SCALE, noise_w=PIPER_NOISE_W,
                sentence_silence=PIPER_SENT_SILENCE,
                normalize=True, trim_silence=True, fade_ms=80) -> bytes:
    model_path  = Path(PIPER_MODEL_DIR) / f"{voice}.onnx"
    config_path = Path(PIPER_MODEL_DIR) / f"{voice}.onnx.json"
    if not model_path.exists():
        raise RuntimeError(f"Modelo Piper não encontrado: {model_path}")

    spoken = compose_spoken_text(
        text, style=style, styledegree=styledegree,
        character=character, prefix=prefix, suffix=suffix,
        humanize_audio=humanize_audio)
    speed = styled_speed(speed, style=style, styledegree=styledegree, character=character)
    length_scale = round(1.0 / max(speed, 0.1), 3)
    cmd = [PIPER_BIN, "--model", str(model_path), "--output_raw",
           "--length-scale", str(length_scale),
           "--noise-scale", str(noise_scale),
           "--noise-w", str(noise_w),
           "--sentence-silence", str(sentence_silence)]
    if config_path.exists():
        cmd += ["--config", str(config_path)]

    result = subprocess.run(cmd, input=spoken.encode("utf-8"),
                            capture_output=True, timeout=30)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.decode(errors="replace"))

    sr = 22050
    if config_path.exists():
        try:
            sr = json.loads(config_path.read_text()).get("audio", {}).get("sample_rate", 22050)
        except Exception:
            pass

    samples = np.frombuffer(result.stdout, dtype=np.int16).astype(np.float32) / 32768.0
    samples = postprocess(samples, sr, normalize=normalize, trim_silence=trim_silence, fade_ms=fade_ms)
    return apply_pitch_wav(samples_to_wav(samples, sr), sr, pitch_pct)


# ── XTTS v2 ──────────────────────────────────────────────────────────────────

def _get_xtts():
    global _xtts_model
    if _xtts_model is None:
        with _xtts_lock:
            if _xtts_model is None:
                try:
                    from TTS.api import TTS as CoquiTTS
                except ImportError:
                    raise RuntimeError(
                        "Coqui TTS não instalado. Execute:\n"
                        "pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu\n"
                        "pip install git+https://github.com/idiap/coqui-ai-TTS")
                log.info("Carregando XTTS v2 — primeira vez leva ~30-60s...")
                _xtts_model = CoquiTTS("tts_models/multilingual/multi-dataset/xtts_v2", gpu=False)
                log.info("XTTS v2 pronto.")
    return _xtts_model


def _ensure_xtts_speaker():
    if not Path(XTTS_SPEAKER_WAV).exists():
        log.info("Gerando referência XTTS via Kokoro pf_dora...")
        ref = ("Olá, tudo bem? É um prazer falar com você. "
               "Estou aqui para ajudar no que precisar.")
        wav = synth_kokoro(ref, "pf_dora", 1.0, normalize=True, trim_silence=False, fade_ms=0)
        Path(XTTS_SPEAKER_WAV).write_bytes(wav)


def synth_xtts(text: str, speed: float = 1.0, speaker_wav: str = "",
               style: str = "chat", styledegree: float = 1.5,
               pitch_pct: float = -3.0, character: str = "casual",
               prefix: str = "", suffix: str = "", humanize_audio: bool = False,
               normalize=True, trim_silence=True, fade_ms=80) -> bytes:
    _ensure_xtts_speaker()
    tts     = _get_xtts()
    ref_wav = speaker_wav or XTTS_SPEAKER_WAV
    import tempfile, os as _os
    tmp = tempfile.mktemp(suffix=".wav")
    try:
        spoken = compose_spoken_text(
            text, style=style, styledegree=styledegree,
            character=character, prefix=prefix, suffix=suffix,
            humanize_audio=humanize_audio)
        speed = styled_speed(speed, style=style, styledegree=styledegree, character=character)
        tts.tts_to_file(text=spoken, speaker_wav=ref_wav,
                        language="pt", file_path=tmp, speed=speed)
        samples, sr = wav_bytes_to_samples(Path(tmp).read_bytes())
    finally:
        try:
            _os.unlink(tmp)
        except OSError:
            pass
    samples = postprocess(samples, sr, normalize=normalize,
                          trim_silence=trim_silence, fade_ms=fade_ms)
    return apply_pitch_wav(samples_to_wav(samples, sr), sr, pitch_pct)


# ── routes ───────────────────────────────────────────────────────────────────

class SynthRequest(BaseModel):
    text:             str
    engine:           str   = "edge"
    voice:            str   = ""
    speed:            float = TTS_SPEED
    language:         str   = "pt-br"
    noise_scale:      float = PIPER_NOISE_SCALE
    noise_w:          float = PIPER_NOISE_W
    sentence_silence: float = PIPER_SENT_SILENCE
    speaker_wav:      str   = ""
    normalize:        bool  = True
    trim_silence:     bool  = True
    fade_ms:          int   = 80
    # Edge TTS — controles de expressão via SSML
    style:            str   = "chat"   # express-as: chat|friendly|calm|excited|hopeful|customerservice
    styledegree:      float = 1.5      # intensidade do estilo 0.01–2.0
    pitch_pct:        float = -3.0     # variação de tom em %
    # Personagem — perfil de pré-processamento do texto
    character:        str   = "casual" # casual|enthusiastic|professional|custom
    prefix:           str   = ""       # texto inserido antes da mensagem
    suffix:           str   = ""       # texto inserido depois da mensagem
    humanize_audio:   bool  = False    # adapta texto escrito para fala curta de WhatsApp


@app.get("/health")
def health():
    return {
        "ok": True,
        "engines": {
            "kokoro": {"default_voice": TTS_VOICE, "speed": TTS_SPEED},
            "piper":  {"available": Path(PIPER_BIN).exists(), "default_voice": PIPER_VOICE},
            "edge":   {"voices": {"female": EDGE_VOICE_F, "male": EDGE_VOICE_M},
                       "ssml_style": "chat"},
            "xtts":   {"loaded": _xtts_model is not None},
        },
    }


@app.get("/engines")
def engines():
    piper_voices  = ([p.stem.replace(".onnx", "") for p in Path(PIPER_MODEL_DIR).glob("*.onnx")]
                     if Path(PIPER_MODEL_DIR).exists() else [])
    kokoro_voices = [v for v in sorted(kokoro.get_voices()) if v.startswith("p")]
    return {
        "kokoro": {"voices": kokoro_voices, "default": TTS_VOICE},
        "piper":  {"available": Path(PIPER_BIN).exists(), "voices": piper_voices, "default": PIPER_VOICE},
        "edge":   {"voices": [EDGE_VOICE_F, EDGE_VOICE_M], "default": EDGE_VOICE_F, "style": "chat"},
        "xtts":   {"loaded": _xtts_model is not None},
    }


@app.post("/synthesize")
def synthesize(req: SynthRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="text vazio")
    # Edge TTS: default speed 1.0 (0.85 soa muito lento/narrador para áudio casual)
    speed = req.speed if req.engine != "edge" else max(req.speed, 1.0)
    try:
        fmt = "wav"
        if req.engine == "piper":
            voice = req.voice or PIPER_VOICE
            wav   = synth_piper(req.text, voice, speed,
                                style=req.style, styledegree=req.styledegree,
                                pitch_pct=req.pitch_pct, character=req.character,
                                prefix=req.prefix, suffix=req.suffix,
                                humanize_audio=req.humanize_audio,
                                noise_scale=req.noise_scale, noise_w=req.noise_w,
                                sentence_silence=req.sentence_silence,
                                normalize=req.normalize, trim_silence=req.trim_silence,
                                fade_ms=req.fade_ms)
        elif req.engine == "edge":
            voice    = req.voice or EDGE_VOICE_F
            wav, fmt = synth_edge(req.text, voice, speed,
                                  style=req.style, styledegree=req.styledegree,
                                  pitch_pct=req.pitch_pct, character=req.character,
                                  prefix=req.prefix, suffix=req.suffix,
                                  humanize_audio=req.humanize_audio,
                                  normalize=req.normalize, trim_silence=req.trim_silence,
                                  fade_ms=req.fade_ms)
        elif req.engine == "xtts":
            wav = synth_xtts(req.text, speed, req.speaker_wav,
                             style=req.style, styledegree=req.styledegree,
                             pitch_pct=req.pitch_pct, character=req.character,
                             prefix=req.prefix, suffix=req.suffix,
                             humanize_audio=req.humanize_audio,
                             normalize=req.normalize, trim_silence=req.trim_silence,
                             fade_ms=req.fade_ms)
        else:  # kokoro
            voice = req.voice or TTS_VOICE
            wav   = synth_kokoro(req.text, voice, speed,
                                 style=req.style, styledegree=req.styledegree,
                                 pitch_pct=req.pitch_pct, character=req.character,
                                 prefix=req.prefix, suffix=req.suffix,
                                 humanize_audio=req.humanize_audio,
                                 normalize=req.normalize, trim_silence=req.trim_silence,
                                 fade_ms=req.fade_ms)

        return JSONResponse({
            "audio_base64": base64.b64encode(wav).decode(),
            "format": fmt,
            "engine": req.engine,
        })
    except Exception as e:
        log.error("synth error [%s]: %s", req.engine, e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT)
