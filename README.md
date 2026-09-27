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
cp .dev.vars.example .dev.vars   # TRIAGE_TOKEN= を設定
pnpm dev
pnpm test
pnpm exec tsc --noEmit
```
