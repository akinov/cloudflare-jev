# jev-triage

日本語問い合わせのトリアージ API（Cloudflare Workers）。

## 前提

- **Node.js** — `.node-version` を参照（nodenv / fnm 等）。`package.json` の `engines.node` 以上。
- **pnpm 12** — [公式インストール](https://pnpm.io/ja/installation)に従う。**Corepack は使わない**（pnpm 公式は standalone スクリプトまたは `npx get-pnpm` を推奨）。

## pnpm のセットアップ

未インストールの場合（macOS / Linux）:

```bash
curl -fsSL https://get.pnpm.io/install.sh | env PNPM_VERSION=12.6.0 sh -
```

Node.js 22.13 以降が入っている場合:

```bash
npx get-pnpm
```

リポジトリを clone したあと、ピン留めされたバージョンに合わせる:

```bash
pnpm self-update
```

更新は `pnpm self-update`（`packageManager` フィールドがある場合はそのバージョンに合わせる）。

## 開発

```bash
pnpm install
pnpm cf-typegen
```

### テスト

Cloudflare アカウントなしで、認証・プリセット・判定・HTTP を確認する。テストは AI を差し替える。

```bash
pnpm test
pnpm exec tsc --noEmit
```

Vitest 起動時に `AI bindings always access remote resources` と出ることがある。`vitest.config.ts` の `remoteBindings` は `false` のままにする。`true` にするとリモートプロキシが `CLOUDFLARE_API_TOKEN` を要求する。

### ローカルサーバ

Worker と `public/index.html` はローカルで動く。Workers AI のモデルは常に Cloudflare 上で実行され、ローカル開発でも利用料がかかる。

```bash
cp .dev.vars.example .dev.vars
pnpm exec wrangler login
pnpm dev
```

`.dev.vars` の `TRIAGE_TOKEN=` に任意の文字列を書く。このファイルは gitignore 済み。値はソースと `wrangler.jsonc` に書かない。`.env` は使わない。非対話環境では `wrangler login` の代わりに `CLOUDFLARE_API_TOKEN` を設定する。未ログインだと `pnpm dev` はログインを求める。

Wrangler が表示した URL（通常は `http://localhost:8787`）を開く。画面のトークンは `.dev.vars` の `TRIAGE_TOKEN` と同じ値にする。保存先はブラウザの `sessionStorage` だけで、HTML には埋め込まない。確認するのは次の4点。

1. トークンを保存し、プリセット一覧が出ること
2. 選んだプリセットの指示文と criteria が出ること
3. サンプルを本文へ投入できること
4. 送信結果に `decision.action`、`reasons`、`signals`、`answers` が出ること

同じ確認を curl で行う場合、シェルの `TRIAGE_TOKEN` は `.dev.vars` と同じ値にする。

```bash
curl -s http://localhost:8787/api/presets \
  -H "Authorization: Bearer $TRIAGE_TOKEN"

curl -s http://localhost:8787/api/triage \
  -H "Authorization: Bearer $TRIAGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"subject":"注文が届きません","body":"先週注文した商品がまだ届いていません。至急確認をお願いします。"}'
```

本番のトークンは `pnpm exec wrangler secret put TRIAGE_TOKEN` で登録する。
