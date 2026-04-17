# Kaetai Kensa

建設現場の引き渡し前検査向けに、図面PDFへピン・引き出し線・吹き出しで指摘登録し、業者別PDFを出力するシステムです。

## 技術スタック

- Next.js App Router + TypeScript + shadcn/ui
- react-konva + konva
- zustand
- Supabase (Postgres/Auth/Storage)
- Python FastAPI + reportlab + pdf2image

## ディレクトリ構成

- `app`: Next.jsアプリ本体
- `pdf_service`: Python PDF生成サービス
- `supabase`: SQLスキーマ・RLS・seed
- `scripts`: 補助スクリプト

## 事前準備

1. Supabaseプロジェクトを作成
2. AuthでEmail/Passwordを有効化
3. SQL Editorで次を順に実行
   - `supabase/schema.sql`
   - `supabase/policies.sql`
   - 必要に応じて `supabase/seed.sql`
4. `drawings-pdf` `drawings-images` `exports-pdf` バケットが作成されていることを確認

## 環境変数

ルートに `.env.local` を作成:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
PDF_SERVICE_URL=http://localhost:8001
```

`pdf_service/.env` は必須ではありませんが、必要なら `pdf_service/.env.example` をコピーして利用してください。

## ローカル起動

### 1. Next.js

```bash
npm install
npm run dev
```

`http://localhost:3000` を開く

### 2. Python PDFサービス

```bash
cd pdf_service
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

`http://localhost:8001/health` が `{"ok": true}` を返せば正常

### Dockerで同時起動

```bash
docker compose up --build
```

## 実装済み機能

- `/login` でSupabase Authログイン
- 初回ログイン時に `/api/profile/bootstrap` で tenant/profile を自動作成
- `/projects` で案件作成・検索・一覧
- `/projects/[id]`
  - 図面タブ: PDFアップロード、ページ画像生成、図面一覧
  - 業者タブ: 追加/編集/削除
  - 出力タブ: 業者選択、階フィルタ、PDF出力
- `/projects/[id]/drawings/[drawingId]`
  - ページ画像描画 + 注記レイヤ
  - モード切替(移動/追加/編集)
  - 指摘モーダル(階数/区分/内容/担当業者)
  - 指摘一覧、検索、業者フィルタ、ジャンプ、ドラッグ更新、削除
- `/api/exports`
  - Next.jsで必要データ収集
  - Python `/generate` へ依頼
  - 生成PDFを `exports-pdf` に保存し署名URLを返却

## PDF生成仕様

`pdf_service/main.py` で以下を満たします。

- reportlab `UnicodeCIDFont("HeiseiKakuGo-W5")` 登録
- A4縦
- 1ページ目: 物件情報、凡例、指摘一覧Table
- 2ページ目以降: 図面ページ画像にピン/線/吹き出しを重畳
- `ParagraphStyle` と `TableStyle` に `fontName="HeiseiKakuGo-W5"` を適用
- 出力ファイル名は英数字と `_` のみ

## 主要API

- `GET/POST /api/projects`
- `GET/PATCH/DELETE /api/projects/[id]`
- `GET/POST /api/projects/[id]/drawings`
- `GET/POST /api/projects/[id]/contractors`
- `PATCH/DELETE /api/contractors/[id]`
- `GET/POST /api/drawings/[drawingId]/issues`
- `PATCH/DELETE /api/issues/[issueId]`
- `POST /api/exports`

## seed補助スクリプト

```bash
npm run seed:contractors -- <tenant_id>
```

指定tenantに固定8業者を追加します。
