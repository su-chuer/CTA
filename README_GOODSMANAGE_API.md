# 物資庫存管理系統（goodsmanage.html）後端 API 串接規格說明（V349）

本版本以 **V346** 正常運作版為基礎，將 `js/goodsmanage.js` 重構為 **API 優先串接 + 靜態 JSON 自動備援** 架構，並完整保留原有下拉選單、庫存檢核與操作互動邏輯。

## 1. 前端 API 設定位置
位於 `js/goodsmanage.js` 中的 `GOODS_API_CONFIG`（亦支援外部在載入前透過 `window.GOODS_API_CONFIG` 覆寫）：
- `baseUrl`: `'/api/goods-manage'`
- `fallbackJsonUrl`: `'json/goods_manage_data.json?v=349'`（無後端 API 或本機/GitHub Pages 靜態展示時自動回退讀取）

## 2. API 端點一覽

| 功能項目 | HTTP Method | 端點路徑 | 說明 |
| :--- | :--- | :--- | :--- |
| 取得初始狀態與主檔 | `GET` | `/api/goods-manage/state` | 回傳倉庫主檔、物品主檔、庫存明細與單據紀錄 |
| 新增廠商入庫 | `POST` | `/api/goods-manage/vendor-in` | 請求 Body 含 `action: "create"`, `record`, `_snapshot` |
| 修改廠商入庫 | `PUT` | `/api/goods-manage/vendor-in/:id` | 請求 Body 含 `action: "update"`, `record`, `_snapshot` |
| 刪除廠商入庫 | `DELETE` | `/api/goods-manage/vendor-in/:id` | 請求 Body 含 `action: "delete"`, `id`, `_snapshot` |
| 新增出庫 / 調貨 | `POST` | `/api/goods-manage/transfer-out` | 請求 Body 含 `action: "create"`, `transferRecord`, `signInRecord`, `_snapshot` |
| 修改出庫 / 調貨 | `PUT` | `/api/goods-manage/transfer-out/:id` | 請求 Body 含 `action: "update"`, `record`, `_snapshot` |
| 刪除出庫 / 調貨 | `DELETE` | `/api/goods-manage/transfer-out/:id` | 請求 Body 含 `action: "delete"`, `id`, `_snapshot` |
| 簽收入庫確認 | `POST` | `/api/goods-manage/sign-in/confirm` | 請求 Body 含 `action: "confirm"`, `signInId`, `transferId`, `_snapshot` |
| 簽收入庫退回 | `POST` | `/api/goods-manage/sign-in/return` | 請求 Body 含 `action: "return"`, `signInId`, `transferId`, `_snapshot` |
| 新增盤差紀錄 | `POST` | `/api/goods-manage/diff` | 請求 Body 含 `action: "create"`, `record`, `_snapshot` |
| 修改盤差紀錄 | `PUT` | `/api/goods-manage/diff/:id` | 請求 Body 含 `action: "update"`, `record`, `_snapshot` |
| 刪除盤差紀錄 | `DELETE` | `/api/goods-manage/diff/:id` | 請求 Body 含 `action: "delete"`, `id`, `_snapshot` |
| 清空所有庫存與單據 | `POST` | `/api/goods-manage/clear-all` | 請求 Body 含 `action: "clearAll"`, `_snapshot` |

## 3. 狀態快照（`_snapshot`）結構
每次資料異動請求皆會於 JSON Body 附上 `_snapshot`，包含：
- `warehouses`, `regionalWarehouses`, `areaWarehouses`, `areaWarehouseRegions`, `goodsItems`, `diffReasons`
- `inventoryDatasets`, `regionalInventoryDatasets`, `areaInventoryDatasets`
- `vendorInRecords`, `signInRecords`, `transferOutRecords`, `diffRecords`
- `counters`（`nextVendorRecordId`, `nextSignInRecordId`, `nextTransferRecordId`, `nextDiffRecordId`, `nextMovementId`）

後端可直接儲存 `_snapshot` 或依單筆異動欄位寫入資料庫；若後端回傳 `{ "ok": true, "state": { ... } }`，前端會自動以最新 `state` 同步畫面。
