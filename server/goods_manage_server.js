const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_FILE = path.join(ROOT_DIR, 'json', 'goods_manage_data.json');

app.use(express.json({ limit: '10mb' }));
app.use(express.static(ROOT_DIR));

function readStore() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return {};
    }
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('讀取 JSON 失敗：', err);
    return {};
  }
}

function writeStore(data) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmpFile = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpFile, DATA_FILE);
}

// 取得目前完整庫存與單據 JSON 狀態
app.get('/api/goods-manage/state', (req, res) => {
  const data = readStore();
  res.json(data);
});

// 儲存/同步完整快照至 json/goods_manage_data.json
app.put('/api/goods-manage/state', (req, res) => {
  try {
    const incoming = req.body && typeof req.body === 'object'
      ? (req.body.state && typeof req.body.state === 'object' ? req.body.state : req.body)
      : null;
    if (!incoming) {
      return res.status(400).json({ ok: false, message: '無效的狀態資料' });
    }
    const current = readStore();
    const merged = Object.assign({}, current, incoming);
    writeStore(merged);
    res.json({ ok: true, message: '已儲存至 json/goods_manage_data.json' });
  } catch (err) {
    console.error('寫入 JSON 失敗：', err);
    res.status(500).json({ ok: false, message: '寫入 JSON 失敗' });
  }
});

// 各模組異動端點（支援 POST / PUT / DELETE，優先採用前端傳來的 _snapshot 寫入 JSON）
['vendor-in', 'transfer-out', 'sign-in', 'diff'].forEach((routeName) => {
  app.all(`/api/goods-manage/${routeName}`, (req, res) => {
    try {
      const body = req.body || {};
      const current = readStore();
      const snapshot = body._snapshot && typeof body._snapshot === 'object' ? body._snapshot : null;
      const nextData = snapshot ? Object.assign({}, current, snapshot) : current;
      if (snapshot) {
        writeStore(nextData);
      }
      res.json({ ok: true, route: routeName, method: req.method });
    } catch (err) {
      console.error(`處理 ${routeName} 失敗：`, err);
      res.status(500).json({ ok: false, message: '同步失敗' });
    }
  });
});

// 清空庫存並寫回 JSON
app.post('/api/goods-manage/clear', (req, res) => {
  try {
    const body = req.body || {};
    const current = readStore();
    const snapshot = body._snapshot && typeof body._snapshot === 'object' ? body._snapshot : null;
    const cleared = snapshot
      ? Object.assign({}, current, snapshot)
      : Object.assign({}, current, {
          inventoryDatasets: {},
          regionalInventoryDatasets: {},
          areaInventoryDatasets: {},
          vendorInRecords: [],
          signInRecords: [],
          transferOutRecords: [],
          diffRecords: []
        });
    writeStore(cleared);
    res.json({ ok: true, message: '已清空並更新 JSON' });
  } catch (err) {
    console.error('清空 JSON 失敗：', err);
    res.status(500).json({ ok: false, message: '清空失敗' });
  }
});

app.listen(PORT, () => {
  console.log(`Goods Manage API Server running at http://localhost:${PORT}`);
  console.log(`JSON storage target: ${DATA_FILE}`);
});
