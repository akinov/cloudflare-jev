# 日本語問い合わせトリアージ API 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cloudflare Workers 上で `typesafe/jev` を呼び、日本語問い合わせを部署へ振り分ける検証 API と試す画面を作る。

**Architecture:** 質問と閾値はプリセットファイルに置く。Hono の `/api` が認証と入力検証を行い、`decide` がモデルの答えを action に変える。画面は `public/index.html` 一枚で、Workers Static Assets が配信する。

**Tech Stack:** pnpm、TypeScript、Hono、Zod、`@hono/zod-validator`、Wrangler、Vitest、`@cloudflare/vitest-plugin`

**仕様:** `docs/superpowers/specs/2026-09-27-jev-inquiry-triage-design.md`

**続き:** 実装の途中経過と次にやること: `docs/superpowers/plans/2026-09-27-jev-inquiry-triage-todo.md`

---

### Task 1: プロジェクト土台

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `wrangler.jsonc`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `.dev.vars.example`

- [ ] **Step 1: 依存と設定を置く**

`package.json` の `packageManager` は pnpm。scripts は `dev` = `wrangler dev`、`deploy` = `wrangler deploy`、`test` = `vitest`、`cf-typegen` = `wrangler types --env-interface CloudflareBindings`。

依存: `hono`、`zod`、`@hono/zod-validator`。開発依存: `wrangler`、`typescript`、`vitest`、`@cloudflare/vitest-plugin`、`@cloudflare/workers-types`。

`wrangler.jsonc`:

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "jev-triage",
  "main": "src/index.ts",
  "compatibility_date": "2026-09-27",
  "compatibility_flags": ["nodejs_compat"],
  "minify": true,
  "ai": { "binding": "AI" },
  "assets": {
    "directory": "./public",
    "run_worker_first": ["/api/*"]
  },
  "observability": { "enabled": true },
  "secrets": { "required": ["TRIAGE_TOKEN"] }
}
```

`.gitignore` は `node_modules/`、`.wrangler/`、`.dev.vars`、`dist/`。`.dev.vars.example` は `TRIAGE_TOKEN=` のみ。トークン値は書かない。

`vitest.config.ts` は `@cloudflare/vitest-plugin` の `cloudflareTest()` と Vitest の `defineConfig` で `wrangler.jsonc` を読む。`remoteBindings` は false。テスト用の `TRIAGE_TOKEN` は `miniflare.bindings` に置く。Hono のテストガイドは Cloudflare の Vitest 連携に従い、現行の案内は `@cloudflare/vitest-plugin` である。`@cloudflare/vitest-pool-workers@0.22` の workerd は compatibility date の上限が 2026-08-22 で、指定の `2026-09-27` を起動できない。テスト用の型は `test/tsconfig.json` の `types` に `@cloudflare/vitest-plugin/types` を置く。

- [ ] **Step 2: インストールと型生成**

pnpm を [公式手順](https://pnpm.io/ja/installation)で入れる（Corepack は使わない）。プロジェクト直下で `pnpm self-update` してから `pnpm install`。
Run: `pnpm cf-typegen`
Expected: `worker-configuration.d.ts` の `CloudflareBindings` に `AI` と `TRIAGE_TOKEN: string` がある。

### Task 2: プリセット

**Files:**
- Create: `src/presets/types.ts`
- Create: `src/presets/inquiry-triage.ts`
- Create: `src/presets/registry.ts`
- Create: `src/presets/validate.ts`
- Test: `test/presets.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

レジストリの全プリセットが検証を通り、`inquiry-triage` の policy 初期値と質問キーが仕様どおりであることを確認する。壊したプリセット（Choice でない `routeOn`、Noul でない flag、重複 signal、範囲外の閾値、マップのキーと `id` の不一致）は違反になる。

- [ ] **Step 2: テストが失敗することを確認する**

- [ ] **Step 3: 型、初期プリセット、レジストリ、`presetViolations` を実装する**

指示文と criteria は英語。`buildState` は空の件名を `""` にして `{ subject, body }` を返す。違反があるプリセットへのリクエストは後続タスクで 500 にする。検証関数は違反の説明を配列で返し、クライアント向け本文には載せない。

- [ ] **Step 4: テストが通ることを確認する**

### Task 3: decide

**Files:**
- Create: `src/decide.ts`
- Test: `test/decide.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

仕様「判定」の比較規則を固定する。自信のある Choice、`confidence === minConfidence`、それ未満、確率差が `ambiguityMargin` と等しいときと未満、欠けた答え、criteria に無い choice、probabilities がオブジェクトでない、数値が1つ、Noul の閾値ちょうど、Score `1.04` のラベル、legend 欠落、`probabilities` の最大キーが `choice` と違うとき。

- [ ] **Step 2: テストが失敗することを確認する**

- [ ] **Step 3: `decide` を実装する**

数値は `Number.isFinite` のものだけ数値として扱う。`NaN` と `Infinity` は JSON にすると `null` になるため、数値ではないものとして扱う。確率は正規化しない。理由は重複なく、発見順は「質問の欠落または型不一致」「振り分けの検査」「Score の legend 欠落」。レビュー理由が無ければ `reasons` は `["choice_confident"]`。

Score の `legend` は公式応答どおり、インデックス文字列をキーにしたオブジェクト。最も近い整数インデックス（同距離は小さい方）の文言をラベルにする。

- [ ] **Step 4: テストが通ることを確認する**

### Task 4: Bearer 認証

**Files:**
- Create: `src/middleware/bearer.ts`
- Test: `test/bearer.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`TRIAGE_TOKEN` が空なら 401 `{ "error": "unauthorized" }`。ヘッダ無しと不一致は 401、同じ本文。許可文字種に合わないトークンは 400、本文は `{ "error": "unauthorized" }`。一致すれば後続が 200。

- [ ] **Step 2: テストが失敗することを確認する**

- [ ] **Step 3: `createMiddleware` で実装する**

空トークンは `bearerAuth` を作らず 401。空でなければ `token` オプションと比較し、`verifyToken` は使わない。メッセージは `noAuthenticationHeader.message`、`invalidToken.message`、`invalidAuthenticationHeader.message` に `{ error: "unauthorized" }` を渡す。

- [ ] **Step 4: テストが通ることを確認する**

### Task 5: 推論の結合

**Files:**
- Create: `src/triage.ts`
- Test: `test/triage.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

固定の Jev 応答から `model`、`answers`、`usage`、`decision` を組み立てる。`AI.run` は1回だけ、モデル ID は `typesafe/jev`、state は `{ subject, body }`、questions はプリセットのもの。例外のときは 502 用の失敗になり、再呼び出ししない。不正プリセットはモデルを呼ばず内部エラー。ログ用オブジェクトに件名と本文の文字列が無いこと。

- [ ] **Step 2: テストが失敗することを確認する**

- [ ] **Step 3: `runTriage` を実装する**

`Context` は受け取らない。成功ログは JSON で、プリセット ID、model、action、reasons、トークン数、本文の文字数。失敗ログはステータスと 200 文字までのメッセージだけ。

- [ ] **Step 4: テストが通ることを確認する**

### Task 6: HTTP API

**Files:**
- Create: `src/routes/api.ts`
- Create: `src/index.ts`
- Test: `test/api.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`app.request` で成功、401（不一致とトークン未設定）、400（規則違反、未知キー、壊れた JSON、Content-Type 無し）、未知プリセット 404、推論例外 502、不正プリセット 500、criteria に無い choice、プリセットをレジストリに足すとハンドラを増やさずに `GET /api/presets` に出ること。未定義パスは 404 `{ "error": "not_found" }`。JSON を送るテストは `Content-Type: application/json` を付ける。

- [ ] **Step 2: テストが失敗することを確認する**

- [ ] **Step 3: ルートと onError を実装する**

`api` は `.use('*', bearer).get('/presets', ...).post('/triage', ...)` のチェーン。`export type ApiType = typeof api`。スキーマは `z.strictObject`。文字列は trim してから長さを見る。`subject` 省略は `""`、`preset` 省略は `inquiry-triage`。

`onError` はメッセージが `Malformed JSON in request body` の `HTTPException` を 400 `{ "error": "invalid_request", "details": "Malformed JSON in request body" }` にする。他の `HTTPException` は `getResponse()`。それ以外はログして 500 `{ "error": "internal_error" }`。`passThroughOnException` は使わない。

- [ ] **Step 4: テストが通ることを確認する**

### Task 7: 試す画面

**Files:**
- Create: `public/index.html`

- [ ] **Step 1: 一枚の HTML を書く**

トークンは `sessionStorage` のみ。`GET /api/presets` で選択肢を埋め、選んだプリセットの指示文と criteria を表示する。件名と本文を送り、`decision.action`、`reasons`、`signals`、`answers` を表示する。仕様の5件を入力欄へ入れるボタンを置く。CORS ヘッダは付けない。トークンは HTML に埋め込まない。

- [ ] **Step 2: 画面の振る舞いを確認する**

ブラウザでトークン保存、プリセット表示、送信結果、サンプル投入を確認する。
