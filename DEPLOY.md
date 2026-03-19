# CropWorks デプロイ手順書

> **対象環境**: Ubuntu 22.04 LTS / 既存 LAMP サーバー同居  
> **構成**: Nginx → React SPA (`/var/www/crop/`) + FastAPI uvicorn (`:8000`)  
> **所要時間**: 初回 約30〜45分

---

## 目次

1. [前提条件](#1-前提条件)
2. [ディレクトリ・ユーザー準備](#2-ディレクトリユーザー準備)
3. [Python 環境 / FastAPI セットアップ](#3-python-環境--fastapi-セットアップ)
4. [MariaDB セットアップ](#4-mariadb-セットアップ)
5. [環境変数設定](#5-環境変数設定)
6. [systemd サービス登録・起動](#6-systemd-サービス登録起動)
7. [React フロントエンド ビルド・配置](#7-react-フロントエンド-ビルド配置)
8. [Nginx 設定](#8-nginx-設定)
9. [SSL 証明書取得 (Let's Encrypt)](#9-ssl-証明書取得-lets-encrypt)
10. [動作確認チェックリスト](#10-動作確認チェックリスト)
11. [アップデート手順](#11-アップデート手順)
12. [トラブルシューティング](#12-トラブルシューティング)

---

## 1. 前提条件

```
□ Python 3.12 インストール済み
□ Node.js 20+ / npm インストール済み
□ MariaDB 10.6+ 稼働中
□ Nginx インストール済み
□ ドメイン取得済み・DNS A レコード設定済み
□ ポート 80, 443 が外部から到達可能
```

---

## 2. ディレクトリ・ユーザー準備

```bash
# アプリ用ユーザー作成（rootで実行しない）
sudo useradd -r -s /bin/false cropworks

# ディレクトリ作成
sudo mkdir -p /opt/cropworks          # API コード
sudo mkdir -p /var/www/crop           # React ビルド成果物
sudo mkdir -p /var/crop-photos        # 写真アップロード先
sudo mkdir -p /var/log/cropworks

# 所有権設定
sudo chown -R cropworks:www-data /opt/cropworks
sudo chown -R www-data:www-data  /var/www/crop
sudo chown -R cropworks:www-data /var/crop-photos
sudo chmod 775 /var/crop-photos
```

---

## 3. Python 環境 / FastAPI セットアップ

```bash
# ソースコード配置
sudo cp -r crop-api/* /opt/cropworks/
sudo chown -R cropworks:cropworks /opt/cropworks/

# venv 作成
sudo -u cropworks python3.12 -m venv /opt/cropworks/venv

# 依存パッケージインストール
sudo -u cropworks /opt/cropworks/venv/bin/pip install --upgrade pip
sudo -u cropworks /opt/cropworks/venv/bin/pip install \
  fastapi "uvicorn[standard]" sqlalchemy pymysql \
  "passlib[bcrypt]" "python-jose[cryptography]" \
  python-multipart Pillow pydantic-settings
```

---

## 4. MariaDB セットアップ

```bash
# MariaDB にログイン
sudo mysql -u root -p
```

```sql
-- DB・ユーザー作成
CREATE DATABASE cropworks CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'cropworks'@'localhost' IDENTIFIED BY '強いパスワードに変更';
GRANT ALL PRIVILEGES ON cropworks.* TO 'cropworks'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

```bash
# テーブル自動作成は FastAPI 起動時に実行される（models.Base.metadata.create_all）
# シードデータ投入（初回のみ）
sudo -u cropworks /opt/cropworks/venv/bin/python /opt/cropworks/seed.py
```

---

## 5. 環境変数設定

```bash
sudo cp /opt/cropworks/.env.example /opt/cropworks/.env
sudo nano /opt/cropworks/.env
```

```dotenv
DATABASE_URL=mysql+pymysql://cropworks:パスワード@localhost/cropworks
SECRET_KEY=openssl rand -hex 32 の出力値をここに貼る
ALLOWED_ORIGINS=https://your.domain.example.com
PHOTO_DIR=/var/crop-photos
ACCESS_TOKEN_EXPIRE_MINUTES=1440
```

```bash
# SECRET_KEY 生成（実行してコピー）
openssl rand -hex 32

# パーミッション保護
sudo chmod 600 /opt/cropworks/.env
sudo chown cropworks:cropworks /opt/cropworks/.env
```

---

## 6. systemd サービス登録・起動

```bash
# サービスファイル配置
sudo cp /opt/cropworks/crop-api.service /etc/systemd/system/cropworks.service
```

`/etc/systemd/system/cropworks.service` を確認・編集:

```ini
[Unit]
Description=CropWorks FastAPI
After=network.target mariadb.service

[Service]
Type=simple
User=cropworks
Group=cropworks
WorkingDirectory=/opt/cropworks
EnvironmentFile=/opt/cropworks/.env
ExecStart=/opt/cropworks/venv/bin/uvicorn main:app \
    --host 127.0.0.1 \
    --port 8000 \
    --workers 2
Restart=always
RestartSec=5
StandardOutput=append:/var/log/cropworks/app.log
StandardError=append:/var/log/cropworks/error.log

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable cropworks
sudo systemctl start cropworks

# 起動確認
sudo systemctl status cropworks
curl http://127.0.0.1:8000/api/v1/health
# → {"status":"ok"}
```

---

## 7. React フロントエンド ビルド・配置

```bash
cd crop-frontend

# 依存インストール
npm ci

# 本番ビルド
npm run build
# → dist/ ディレクトリに生成される

# 配置
sudo rsync -av --delete dist/ /var/www/crop/
sudo chown -R www-data:www-data /var/www/crop/

# 確認
ls -la /var/www/crop/
# index.html, assets/, sw.js, manifest.webmanifest が存在すること
```

---

## 8. Nginx 設定

```bash
# 設定ファイル配置
sudo cp cropworks-nginx.conf /etc/nginx/sites-available/cropworks.conf

# ドメイン名を実際のものに置換
sudo sed -i 's/your\.domain\.example\.com/実際のドメイン/g' \
  /etc/nginx/sites-available/cropworks.conf

# 有効化
sudo ln -s /etc/nginx/sites-available/cropworks.conf \
           /etc/nginx/sites-enabled/cropworks.conf

# 設定テスト
sudo nginx -t

# ※ SSL 証明書取得前は https ブロックをコメントアウトし
#   HTTP のみで起動してから certbot を実行する
```

---

## 9. SSL 証明書取得 (Let's Encrypt)

```bash
# certbot インストール（未インストールの場合）
sudo apt install certbot python3-certbot-nginx -y

# 証明書取得（Nginx プラグイン使用）
sudo certbot --nginx -d your.domain.example.com

# 自動更新確認
sudo systemctl status certbot.timer
sudo certbot renew --dry-run

# Nginx 再起動
sudo systemctl reload nginx
```

---

## 10. 動作確認チェックリスト

```
□ https://your.domain.example.com/ にアクセスしてログイン画面が表示される
□ ログイン → 作物一覧が表示される
□ 作業ログ追加・写真アップロードが動作する
□ 収穫記録の追加・編集・削除が動作する
□ CSV ダウンロード（作業ログ / 収穫記録）が動作する
□ スマホのブラウザで「ホーム画面に追加」が表示される（PWA）
□ /api/v1/health が {"status":"ok"} を返す
□ SSL 証明書が有効（ブラウザの鍵マーク確認）
□ HTTP アクセスが HTTPS にリダイレクトされる
```

---

## 11. アップデート手順

### API のみ更新

```bash
sudo cp -r crop-api/* /opt/cropworks/
sudo systemctl restart cropworks
sudo journalctl -u cropworks -f   # ログ確認
```

### フロントエンドのみ更新

```bash
cd crop-frontend
npm ci && npm run build
sudo rsync -av --delete dist/ /var/www/crop/
# ブラウザキャッシュはハッシュ付きファイル名で自動破棄される
```

### 両方更新（推奨手順）

```bash
cd crop-frontend && npm ci && npm run build
sudo rsync -av --delete dist/ /var/www/crop/
sudo cp -r crop-api/* /opt/cropworks/
sudo systemctl restart cropworks
```

---

## 12. トラブルシューティング

### API が起動しない

```bash
sudo journalctl -u cropworks -n 50 --no-pager
# よくある原因:
#   - .env の DATABASE_URL が間違っている
#   - MariaDB が起動していない
#   - ポート 8000 が既に使われている（lsof -i:8000）
```

### 写真がアップロードできない

```bash
# ディレクトリ権限確認
ls -la /var/crop-photos/
# cropworks ユーザーに書き込み権限があること
sudo chown cropworks:www-data /var/crop-photos && sudo chmod 775 /var/crop-photos
```

### Nginx 502 Bad Gateway

```bash
# FastAPI が起動しているか確認
curl http://127.0.0.1:8000/api/v1/health
sudo systemctl status cropworks
```

### PWA がインストールできない（ホーム画面追加が出ない）

```bash
# manifest.webmanifest が配信されているか確認
curl -I https://your.domain.example.com/manifest.webmanifest
# Content-Type: application/manifest+json であること

# sw.js が配信されているか確認
curl -I https://your.domain.example.com/sw.js
# Cache-Control: no-store, no-cache であること
```

### MariaDB 接続エラー

```sql
-- 権限確認
SHOW GRANTS FOR 'cropworks'@'localhost';
-- テーブル確認
USE cropworks; SHOW TABLES;
```

---

*最終更新: 2026-03*
