const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  host: '177.7.38.137',
  port: 22,
  username: 'root',
  password: 'Picole@2222@',
  readyTimeout: 20000,
};

const REMOTE_DIR = '/opt/tts_server';
const FILES = ['tts_server.py', 'requirements.txt'];

function run(conn, cmd) {
  return new Promise((resolve, reject) => {
    let out = '', err = '';
    conn.exec(cmd, (e, stream) => {
      if (e) return reject(e);
      stream.on('data', d => { process.stdout.write(d); out += d; });
      stream.stderr.on('data', d => { process.stderr.write(d); err += d; });
      stream.on('close', code => code === 0 ? resolve(out) : reject(new Error(`Exit ${code}: ${err}`)));
    });
  });
}

function uploadFile(sftp, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    sftp.fastPut(localPath, remotePath, e => e ? reject(e) : resolve());
  });
}

function mkdir(sftp, dir) {
  return new Promise(resolve => sftp.mkdir(dir, e => resolve()));
}

async function deploy() {
  const conn = new Client();

  await new Promise((resolve, reject) => {
    conn.on('ready', resolve).on('error', reject).connect(CONFIG);
  });

  console.log('✓ Conectado à VPS');

  // Upload files via SFTP
  const sftp = await new Promise((resolve, reject) =>
    conn.sftp((e, s) => e ? reject(e) : resolve(s))
  );

  await mkdir(sftp, REMOTE_DIR);
  console.log(`✓ Diretório ${REMOTE_DIR} pronto`);

  for (const file of FILES) {
    const local = path.join(__dirname, file);
    const remote = `${REMOTE_DIR}/${file}`;
    await uploadFile(sftp, local, remote);
    console.log(`✓ Upload: ${file}`);
  }

  sftp.end();

  // Setup ambiente
  console.log('\n==> Instalando python3-venv e dependências...');
  await run(conn, `
    apt-get install -y python3-venv python3-pip 2>&1 | tail -5
  `);
  await run(conn, `
    cd ${REMOTE_DIR} &&
    python3 -m venv venv &&
    source venv/bin/activate &&
    pip install -q --upgrade pip &&
    pip install -q -r requirements.txt
  `);

  // Baixar modelos Kokoro
  console.log('\n==> Verificando modelos Kokoro...');
  await run(conn, `
    cd ${REMOTE_DIR} &&
    if [ ! -f "kokoro-v1.0.onnx" ]; then
      echo "Baixando modelos (pode demorar ~2min)..."
      source venv/bin/activate
      pip install -q huggingface_hub
      python3 -c "
from huggingface_hub import hf_hub_download
print('Baixando kokoro-v1.0.onnx...')
hf_hub_download('hexgrad/Kokoro-82M', 'kokoro-v1.0.onnx', local_dir='.')
print('Baixando voices-v1.0.bin...')
hf_hub_download('hexgrad/Kokoro-82M', 'voices-v1.0.bin', local_dir='.')
print('Modelos baixados!')
"
    else
      echo "Modelos já existem, pulando download"
    fi
  `);

  // Systemd service
  console.log('\n==> Configurando systemd...');
  const SERVICE = `[Unit]
Description=KokoroTTS FastAPI Server
After=network.target

[Service]
WorkingDirectory=${REMOTE_DIR}
ExecStart=${REMOTE_DIR}/venv/bin/python tts_server.py
Restart=always
RestartSec=5
Environment=PORT=5050
Environment=TTS_VOICE=pf_dora

[Install]
WantedBy=multi-user.target
`;
  await run(conn, `cat > /etc/systemd/system/tts-server.service << 'EOF'\n${SERVICE}EOF`);
  await run(conn, 'systemctl daemon-reload && systemctl enable tts-server && systemctl restart tts-server');

  await new Promise(r => setTimeout(r, 3000));

  console.log('\n==> Status do serviço:');
  await run(conn, 'systemctl status tts-server --no-pager');

  console.log('\n==> Testando health endpoint...');
  await run(conn, 'curl -s http://localhost:5050/health || echo "aguardando servidor inicializar..."');

  conn.end();
  console.log('\n✓ Deploy concluído!');
  console.log('  URL: http://177.7.38.137:5050/health');
}

deploy().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
