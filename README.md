# 1min.ai 自動簽到 GitHub Action

這是一個用於 1min.ai 自動簽到的 GitHub Action，支援帳號密碼登入和 TOTP 雙因子驗證。

## 功能特色

- 🤖 自動每日簽到
- 🔐 支援 TOTP 雙因子驗證
- 📊 顯示帳戶餘額資訊
- ⏰ 可自訂執行時間
- 📝 自動保存執行日誌

## 快速開始

### 1. 使用此模板創建新專案

點擊 "Use this template" 按鈕創建你自己的專案，或者 Fork 此專案到你的 GitHub 帳號。

### 2. 設定 GitHub Secrets

在你的 GitHub 專案中，前往 `Settings` > `Secrets and variables` > `Actions`，新增以下 secrets：

**必要設定：**
- `EMAIL`: 你的 1min.ai 帳號
- `PASSWORD`: 你的 1min.ai 密碼

**可選設定：**
- `TOTP_SECRET`: 你的 TOTP 金鑰（如果有啟用雙因子驗證才需要）

### 3. 啟用 GitHub Actions

確保你的專案已啟用 GitHub Actions，第一次執行會自動開始。

## 自訂設定

### 修改執行時間

編輯 `.github/workflows/daily-checkin.yml` 檔案中的 cron 表達式：

```yaml
schedule:
  - cron: '0 8 * * *'  # 每天 UTC 8:00 (台北時間 16:00)
```

常用時間設定：
- `0 0 * * *` - 每天 UTC 0:00 (台北時間 8:00)
- `0 8 * * *` - 每天 UTC 8:00 (台北時間 16:00)
- `0 12 * * *` - 每天 UTC 12:00 (台北時間 20:00)

### 手動執行

你也可以在 GitHub Actions 頁面手動觸發執行：
1. 前往你的專案 > Actions 頁面
2. 選擇 "1min.ai 每日自動簽到" workflow
3. 點擊 "Run workflow" 按鈕

## 本地測試

如果你想在本地測試腳本：

```bash
# 安裝相依套件
npm install

# 設定環境變數
export EMAIL="your-email@example.com"
export PASSWORD="your-password"
export TOTP_SECRET="your-totp-secret"  # 可選

# 執行測試
npm start
```

## 專案結構

```
├── .github/workflows/
│   └── daily-checkin.yml    # GitHub Action 工作流程
├── src/
│   └── index.js             # 主要簽到邏輯
├── package.json             # 專案設定檔
└── README.md               # 說明文件
```

## 注意事項

- 請確保你的 GitHub 帳號有足夠的 Actions 使用額度
- 建議定期檢查執行結果
- 如果連續失敗，請檢查帳號密碼是否正確
- TOTP 金鑰只有在啟用雙因子驗證時才需要設定

## 安全性

- 所有敏感資訊都儲存在 GitHub Secrets 中
- 不會在日誌中顯示完整的帳號密碼資訊
- 使用官方 GitHub Actions 確保安全性

## 故障排除

### 常見問題

1. **登入失敗 401 錯誤**
   - 檢查 EMAIL 和 PASSWORD 是否正確
   - 確認帳號沒有被鎖定

2. **TOTP 驗證失敗**
   - 檢查 TOTP_SECRET 是否正確
   - 確認時間同步正確

3. **GitHub Action 沒有執行**
   - 檢查 cron 表達式是否正確
   - 確認 GitHub Actions 已啟用

### 查看執行日誌

1. 前往你的專案 > Actions 頁面
2. 點擊最近的執行記錄
3. 查看詳細的執行日誌

## 授權

MIT License