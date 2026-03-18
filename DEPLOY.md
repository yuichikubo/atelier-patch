# ATELIER — Vercel + Supabase デプロイ手順

所要時間：約20分

---

## STEP 1 — Supabaseプロジェクト作成（5分）

1. https://supabase.com にアクセス → 無料アカウント作成
2. **New project** → プロジェクト名を入力（例: `atelier-cms`）
3. パスワードを設定 → **Create new project**（1〜2分待つ）
4. 左メニュー **SQL Editor** を開く
5. `prisma/supabase-setup.sql` の内容を貼り付けて **Run** を実行

テーブル `pages` が作成されます。

**APIキーを取得：**
- 左メニュー **Settings** → **API**
- `URL` をコピー → `NEXT_PUBLIC_SUPABASE_URL` に使う
- `anon public` キーをコピー → `NEXT_PUBLIC_SUPABASE_ANON_KEY` に使う
- `service_role` キーをコピー → `SUPABASE_SERVICE_ROLE_KEY` に使う

---

## STEP 2 — GitHubにプッシュ（3分）

```bash
cd atelier-patch
git init
git add .
git commit -m "initial commit"
# GitHubで新しいリポジトリを作成して：
git remote add origin https://github.com/あなたのユーザー名/atelier-cms.git
git push -u origin main
```

---

## STEP 3 — Vercelにデプロイ（5分）

1. https://vercel.com にアクセス → GitHubでログイン
2. **Add New Project** → 作成したリポジトリを選択
3. **Import**
4. **Environment Variables** に以下を追加：

```
ANTHROPIC_API_KEY        = sk-ant-あなたのキー
NEXT_PUBLIC_SUPABASE_URL = https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY = eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY     = eyJhbGci...
USE_SUPABASE             = true
NEXT_PUBLIC_SITE_URL     = https://あなたのプロジェクト.vercel.app
```

5. **Deploy** を押す

Vercelが自動で `npm install && next build` を実行します。

---

## STEP 4 — デプロイ後の確認

デプロイ完了後：

| URL | 内容 |
|---|---|
| `https://あなたのドメイン.vercel.app/cms/pages` | ページ一覧 |
| `https://あなたのドメイン.vercel.app/cms/new` | 新規ページ作成 |
| `https://あなたのドメイン.vercel.app/site/home` | 公開ページ（Publish後） |

---

## ローカル開発（Supabaseなし）

```bash
# .env.local の設定（USE_SUPABASE を設定しない = fsモード）
cp .env.local.example .env.local
# ANTHROPIC_API_KEY を入力

npm install
npm run dev
```

`USE_SUPABASE` が未設定の場合、従来の `data/pages/*.json` ストレージが使われます。

---

## トラブルシューティング

**ビルドエラー：Module not found '@supabase/supabase-js'**
→ `npm install` を実行

**500エラー：SUPABASE env vars not set**
→ Vercelの環境変数に `NEXT_PUBLIC_SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY` が設定されているか確認

**ページが表示されない（/site/home）**
→ `/cms/pages` からページを開いてPublishボタンを押す
