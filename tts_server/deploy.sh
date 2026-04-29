#!/usr/bin/env bash
# Deploy KokoroTTS server to VPS
# Usage: bash deploy.sh
set -e

VPS_IP="177.7.38.137"
VPS_USER="root"
REMOTE_DIR="/opt/tts_server"
PORT=5050

echo "==> Copiando arquivos para VPS..."
scp tts_server.py requirements.txt "${VPS_USER}@${VPS_IP}:${REMOTE_DIR}/" 2>/dev/null || (
  ssh "${VPS_USER}@${VPS_IP}" "mkdir -p ${REMOTE_DIR}"
  scp tts_server.py requirements.txt "${VPS_USER}@${VPS_IP}:${REMOTE_DIR}/"
)

echo "==> Configurando ambiente na VPS..."
ssh "${VPS_USER}@${VPS_IP}" bash <<'REMOTE'
set -e
cd /opt/tts_server

# Python venv
python3 -m venv venv 2>/dev/null || true
source venv/bin/activate

pip install -q --upgrade pip
pip install -q -r requirements.txt

# Baixar modelos Kokoro se nao existirem
if [ ! -f "kokoro-v1.0.onnx" ]; then
  echo "Baixando modelo kokoro-v1.0.onnx..."
  pip install -q huggingface_hub
  python3 - <<'PY'
from huggingface_hub import hf_hub_download
hf_hub_download("hexgrad/Kokoro-82M", "kokoro-v1.0.onnx", local_dir=".")
hf_hub_download("hexgrad/Kokoro-82M", "voices-v1.0.bin", local_dir=".")
PY
fi

echo "Modelos OK"
REMOTE

echo "==> Criando systemd service..."
ssh "${VPS_USER}@${VPS_IP}" bash <<REMOTE
cat > /etc/systemd/system/tts-server.service <<EOF
[Unit]
Description=KokoroTTS FastAPI Server
After=network.target

[Service]
WorkingDirectory=/opt/tts_server
ExecStart=/opt/tts_server/venv/bin/python tts_server.py
Restart=always
RestartSec=5
Environment=PORT=${PORT}
Environment=TTS_VOICE=pf_dora

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable tts-server
systemctl restart tts-server
sleep 2
systemctl status tts-server --no-pager
REMOTE

echo ""
echo "==> TTS Server rodando em http://${VPS_IP}:${PORT}"
echo "    Health: curl http://${VPS_IP}:${PORT}/health"
