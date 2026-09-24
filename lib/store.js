const fs = require('fs');
const path = require('path');

// Простое файловое хранилище для защиты от повторной обработки одного
// и того же callback (V5Pay может присылать уведомление несколько раз).
//
// ВАЖНО: для небольшого одного сервера этого достаточно. Если позже
// появится несколько серверов/инстансов или нагрузка вырастет —
// стоит перенести это в настоящую БД (Postgres/SQLite/Redis).

const DB_FILE = path.join(__dirname, '..', 'data', 'processed-orders.json');

function ensureFile() {
  const dir = path.dirname(DB_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, '{}');
}

function load() {
  ensureFile();
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function save(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function isProcessed(transactionId) {
  if (!transactionId) return false;
  const data = load();
  return Boolean(data[transactionId]);
}

function markProcessed(transactionId, info) {
  if (!transactionId) return;
  const data = load();
  data[transactionId] = { ...info, processedAt: new Date().toISOString() };
  save(data);
}

module.exports = { isProcessed, markProcessed };
