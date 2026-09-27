# 日本語問い合わせトリアージ API 設計

日付: 2026-09-27

Cloudflare Workers 上で Workers AI の `typesafe/jev` を呼び、日本語の問い合わせを振り分ける検証用 API の方針。質問（Choice / Noul / Score）の文言・選択肢・閾値は、HTTP ハンドラを触らずにプリセットファイルだけで差し替えられる。

## 目的

次を確認できること。

- `env.AI.run('typesafe/jev', { state, questions })` が Noul / Choice / Score を1回の呼び出しで返すこと。Choice と Score は confidence と確率、Noul は `noul`（0 から 1）だけを持つ
- 日本語の件名と本文を state に入れたとき、部署の振り分けが分かれること
- confidence と確率の差をコード側の閾値で見て、自動振り分けと要確認を分けられること
- 質問の中身を変えたあと、デプロイだけで反映され、試す画面と `GET /api/presets` に出ること

モデルは文章を生成しない。返信文、メール取り込み、チケット保存は作らない。

## 採用する構成

質問定義の置き場所は3案ある。

| 案 | 内容 | 向いていること | 今回向かない理由 |
| --- | --- | --- | --- |
| A. リポジトリ内のプリセット | 質問・閾値・判定を1ファイルに書き、デプロイで反映する | 差分がレビューでき、型で壊れた質問を防げる | — |
| B. リクエストに質問を載せる | 呼び出す側が毎回 questions を送る | デプロイなしで文言を試せる | API が Jev の薄いプロキシになり、トリアージの方針が呼び出し側に散る |
| C. KV などで実行時に編集 | 管理 API から質問を更新する | デプロイなしで本番の文言を変えられる | 認証、検証、履歴が別途必要で、最初の検証には大きい |

案 A を採用する。試したい文言がもう一つあるときは、既存プリセットを書き換えるか、別ファイルをレジストリに足す。`wrangler deploy` が反映の単位になる。

呼び出し側は質問を送らない。送るのは件名、本文、使うプリセット名だけである。

## 全体の流れ

```text
ブラウザの試す画面 または curl
        │  POST /api/triage  { subject, body, preset }
        ▼
Worker（認証、入力検証、プリセット解決）
        │  state を組み立て、プリセットの questions を付ける
        ▼
env.AI.run('typesafe/jev', …)
        │  answers, model, usage
        ▼
src/decide.ts の decide(answers, preset)（閾値は preset.policy）
        │
        ▼
JSON（decision, answers, usage）
```

Workers AI のバインディング名は `AI`。モデル ID は `typesafe/jev`。公式ドキュメント上のコンテキストは 32,000 トークン、確認できている応答例のモデル名は `jev-1.13.0`。料金の公開値は入力 100 万トークンあたり $0.042、出力は $0。

参考: https://developers.cloudflare.com/ai/models/typesafe/jev/

## API層

パッケージマネージャは pnpm、言語は TypeScript、HTTP は Hono とする。土台は Hono 公式の `cloudflare-workers` テンプレート（`pnpm create hono` で選ぶもの）に合わせる。入口は `src/index.ts`、設定は `wrangler.jsonc`、開発とデプロイは `pnpm dev` / `pnpm deploy`（中身は `wrangler dev` / `wrangler deploy`）である。

Cloudflare のドキュメントにある Vite + React の Hono テンプレートは、SPA を同じ Worker に載せる構成である。この検証 API の画面は `public/index.html` 一枚なので、そちらは使わない。

根拠にした公式の指針:

- 構成と静的ファイル: https://hono.dev/docs/getting-started/cloudflare-workers
- ハンドラの書き方とファイル分割: https://hono.dev/docs/guides/best-practices
- ミドルウェアの分離: https://hono.dev/docs/guides/middleware
- バリデーション: https://hono.dev/docs/guides/validation
- Bearer 認証: https://hono.dev/docs/middleware/builtin/bearer-auth
- テスト: https://hono.dev/docs/guides/testing
- 例外: https://hono.dev/docs/api/exception
- 型の共有: https://hono.dev/docs/helpers/factory
- API をアセットより先に処理する: https://developers.cloudflare.com/workers/static-assets/routing/worker-script/

### 依存

| パッケージ | 役割 |
| --- | --- |
| `hono` | ルーティング、`c.json`、`bearerAuth`、`HTTPException` |
| `zod` | リクエスト JSON のスキーマ |
| `@hono/zod-validator` | `zValidator`。検証済みの値を `c.req.valid('json')` で取る |
| `wrangler`、`typescript`、`vitest`、`@cloudflare/vitest-plugin`、`@cloudflare/workers-types` | 開発とテスト |

`package.json` の `packageManager` は pnpm にする。Hono のバリデーションガイドは、組み込みの薄い `validator` よりサードパーティを使うよう書いている。例の本線は Zod と `@hono/zod-validator` なので、それに合わせる。

### 型とバインディング

バインディング型は手書きしない。`pnpm cf-typegen`（`wrangler types --env-interface CloudflareBindings`）で `worker-configuration.d.ts` を生成する。インターフェース名を `CloudflareBindings` にするのは、Hono 自身の `Env` 型と名前が衝突しないようにする公式の指定である。

```ts
type AppEnv = { Bindings: CloudflareBindings }
const factory = createFactory<AppEnv>()
const app = factory.createApp()
```

`Bindings` を入口、サブアプリ、ミドルウェアのそれぞれに書くと定義が重複する。Factory Helper は、その繰り返しを避けて `createFactory` に一度だけ付ける書き方を示している。この API はその形にする。

Workers AI は `c.env.AI.run('typesafe/jev', …)`。シークレット `TRIAGE_TOKEN` は `c.env.TRIAGE_TOKEN`。モジュールのトップレベルでは読まない。Hono の Cloudflare ガイドは、Basic / Bearer の秘密をミドルウェアの中で `c.env` から取るよう指定している。

### ファイルとルート

ハンドラはパス定義の直後に書く。パスパラメータの型が途切れるため、コントローラ関数へ切り出さない（Hono の Best Practices）。推論と `decide` は `Context` を受け取らない関数にし、ハンドラから呼ぶ。

ルートが増えたときの公式の分割は、ファイルごとの Hono を `app.route()` でマウントする形である。API は `/api` にまとめてマウントする。入口と `src/routes/api.ts` は `factory.createApp()`、bearer は `factory.createMiddleware()` にする。`c.env` はサブアプリとミドルウェアでも型付きで読める。

`api` は `.use('*', bearer).get(...).post(...)` とチェーンし、`export type ApiType = typeof api` を残す。認証を別の `api.use` 文に分けると、この `ApiType` にミドルウェアが乗らない。RPC 用クライアントは今は作らない。試す画面は `fetch` のままにする。`GET /presets` も `use('*')` の対象である。

```text
src/index.ts                 アプリ本体。/api のマウント、onError、notFound
src/factory.ts               createFactory。Bindings はここだけ
src/routes/api.ts            GET /presets と POST /triage。Zod スキーマもここ
src/middleware/bearer.ts     factory.createMiddleware で bearerAuth を包む
src/triage.ts                state 組み立て、推論、decide の呼び出し
src/decide.ts                プリセット横断の判定
src/presets/types.ts
src/presets/registry.ts
src/presets/inquiry-triage.ts
public/index.html
```

`src/middleware/bearer.ts` は `factory.createMiddleware()` で書く。`c.env.TRIAGE_TOKEN` が空なら、その場で 401 と `{ "error": "unauthorized" }` を返す。空でなければ `const auth = bearerAuth<AppEnv>({ token: c.env.TRIAGE_TOKEN, ... })` とし、`return auth(c, next)` する。`bearerAuth` の Context は引数を付けないと Hono の既定 `Env` になり、Factory の `Bindings` と一致しない。型の中身は `AppEnv` の一箇所に置く。生成しただけで `next()` に進む書き方にはしない。比較は `token` オプションに任せる。Hono の実装はここで `timingSafeEqual` を使う。`verifyToken` は使わない。`verifyToken` を渡すと比較がコールバック任せになり、`token` と同時には指定できない。ヘッダ無しと不一致の本文は `{ "error": "unauthorized" }`、ステータスは 401 にする。許可文字種に合わないトークンは 400 で、本文も `{ "error": "unauthorized" }` にする（`invalidAuthenticationHeader.message`）。`bearerAuth` はトークン文字を `/[A-Za-z0-9._~+/-]+=*/` に限る。検証用トークンはこの文字種にする。

`src/index.ts` は次を担う。

- `app.route('/api', api)`
- `app.notFound` は `{ "error": "not_found" }` を 404 で返す
- `app.onError` は、メッセージが `Malformed JSON in request body` の `HTTPException` を 400 と `{ "error": "invalid_request", "details": "Malformed JSON in request body" }` に変える。これはバリデータが本文だけの `HTTPException` を投げるためで、それ以外の `HTTPException` は例外ガイドどおり `getResponse()` を返す。どちらでもない例外は `console.error(error)` したあと `{ "error": "internal_error" }` を 500 で返す。エラー本文は JSON なので `c.json` にする
- `export default app`

推論失敗は `HTTPException(502, { res })`、プリセット定義の不備は `HTTPException(500, { res })` として投げ、レスポンス JSON は「エラー一覧」に合わせる。

`POST /api/triage` の JSON は `zValidator('json', schema, hook)` にかける。スキーマは `z.strictObject` で、未知のキーを失敗にする。スキーマ不一致のとき、hook は 400 と `{ "error": "invalid_request", "details": "<どの項目がどの規則に反したか>" }` を返す。`Content-Type: application/json` が無いと Hono は JSON をパースせず、バリデータには空オブジェクトが渡るので、hook が同じ 400 を返す。`Content-Type` が JSON でも本文が壊れているときは、hook の前に Hono が `HTTPException(400)` を投げる。これは `onError` が上の `invalid_request` JSON に変える。テストで JSON を送るときも `Content-Type: application/json` を付ける。

### 静的ファイルと API の優先

`wrangler.jsonc` の `assets.directory` は `./public`。`assets.run_worker_first` は `["/api/*"]`。`GET /` はアセットの `index.html` が先に返る。`/api/*` は常に Hono が先に処理するので、認証と JSON の 404 がアセットに隠れない。SPA 用の `not_found_handling` は付けない。

`wrangler.jsonc` には、これまで決めた項目に加えて `main` を `src/index.ts`、`minify` を true、`compatibility_flags` に `nodejs_compat`、`observability.enabled` を true にする。

### テスト

Hono のテストガイドは Cloudflare の Vitest 連携に従うよう書いている。現行の案内は `@cloudflare/vitest-plugin` の `cloudflareTest()` で、`@cloudflare/vitest-pool-workers` からは移行する。`@cloudflare/vitest-pool-workers@0.22` の workerd は compatibility date の上限が 2026-08-22 で、この Worker の `2026-09-27` を起動できない。API のテストは `app.request(path, init, env)` で行う。AI バインディングは第3引数の env で差し替える。`decide` の単体テストは Hono を通さない。

## プリセット

プリセットは「Jev に渡す質問」と「返ってきた答えをどう扱うか」を同じファイルに置く。ハンドラはプリセット ID で引き、state の組み立てと推論のあと、共有の `decide(answers, preset)` を呼ぶ。

```ts
type NoulQuestion = {
  type: 'noul'
  instructions: string
  criteria?: { true: string; false: string }
}

type ChoiceQuestion = {
  type: 'choice'
  instructions: string
  criteria: Record<string, string>
}

type ScoreQuestion = {
  type: 'score'
  instructions: string
  criteria: string[]
}

type Questions = Record<string, NoulQuestion | ChoiceQuestion | ScoreQuestion>

type InquiryInput = {
  subject: string
  body: string
}

type Policy = {
  routeOn: {
    question: string
    minConfidence: number
    ambiguityMargin: number
  }
  flags: Array<{
    question: string
    noulAtLeast: number
    signal: string
  }>
}

type Preset = {
  id: string
  description: string
  questions: Questions
  policy: Policy
  buildState: (input: InquiryInput) => { subject: string; body: string }
}
```

判定関数 `decide(answers, preset)` は `src/decide.ts` に一つだけ置く。プリセットファイルが持つのはデータ（`questions` と `policy`）と、state の形（`buildState`）である。最初のプリセットの `buildState` は、空の件名を `""` にして `{ subject, body }` を返す。

レジストリは `src/presets/registry.ts` のマップだけとする。マップのキーと `preset.id` は一致させる。新しいプリセットはファイルを追加し、このマップに1行足す。

プリセットは次を満たす。満たさないものはプログラムの不備として、そのプリセットへのリクエストを `500` `internal_error` にする。テストはレジストリの全件をこの条件で検査する。

- `routeOn.question` は `questions` にあり、型は Choice
- `flags[].question` はそれぞれ `questions` にあり、型は Noul
- `flags[].signal` はプリセット内で重複しない
- `minConfidence` と `ambiguityMargin` と `noulAtLeast` は 0 以上 1 以下

### 質問を変えるときに触る場所

| 変えたいもの | 編集箇所 |
| --- | --- |
| 選択肢、指示文、段階の文言 | そのプリセットの `questions` |
| 自動振り分けに使う Choice のキー、confidence の下限、確率の接近幅 | `policy.routeOn` |
| 緊急や営業メールのような Noul を信号にする条件 | `policy.flags` に1件足す、または数値を変える |
| 別バリエーションを残したまま試す | 新しいプリセットファイルをレジストリに追加する |
| HTTP の形、認証、試す画面の描画 | 変えない |

Score の質問を足すと、`answers` に載り、応答の `signals.scores` にも載る。v1 では Score は action を変えない。Noul は `policy.flags` に書いたものだけが信号になる。Choice は `policy.routeOn.question` の1つだけが振り分けに使われる。それ以外の Choice は `answers` に残る。

質問キーをリネームしたときは、同じファイルの `policy` のキー参照も合わせる。ハンドラ側に質問キーは書かない。

### 初期プリセット `inquiry-triage`

指示文と criteria は英語で書く。本文は呼び出し側が書いた日本語のまま state に入れる。TypeSafe は主言語を英語としており、日本語の入力は受け付けるが精度は落ちると説明している。指示文を日本語にした比較は、別プリセットとして後から足す。

state:

```json
{ "subject": "件名", "body": "本文" }
```

questions:

- `department`（Choice）: `sales` / `support` / `billing` / `recruit` / `other`
  - 指示: `body` の問い合わせをどのチームが扱うか。`subject` は文脈として使う
- `is_urgent`（Noul）: すぐに返答が要る緊急の表現か
  - true: 期限や「至急」など、時間的な切迫がある
  - false: 急ぐ表現がない
- `is_sales_pitch`（Noul）: 顧客からの問い合わせではなく、こちらへの売り込みか
- `frustration`（Score）: `Calm` / `Frustrated` / `Very angry`

policy の初期値:

| 項目 | 値 | 意味 |
| --- | --- | --- |
| `routeOn.question` | `department` | 振り分けに使う Choice |
| `routeOn.minConfidence` | `0.6` | これ未満は要確認 |
| `routeOn.ambiguityMargin` | `0.15` | 上位2選択肢の確率差がこれ未満なら要確認 |
| `flags` の `is_urgent` | `noulAtLeast: 0.8`、`signal: "urgent"` | 以上なら `signals.flags.urgent = true` |
| `flags` の `is_sales_pitch` | `noulAtLeast: 0.9`、`signal: "salesPitch"` | 以上なら `signals.flags.salesPitch = true` |

この数値は検証の出発点である。変えるときはプリセットの `policy` だけを編集する。

`is_urgent` と `is_sales_pitch` と `frustration` は action を変えない。緊急でも、部署の confidence が足りていれば `auto_route` のまま `signals.flags.urgent` が true になる。Score の高さで人手に回すルールは v1 の `policy` には無い。

## 判定

`decide` は次の順で理由を集める。レビュー理由が1つでもあれば action は `needs_review`、なければ `auto_route`。確率はモデルが返した値のまま使い、合計が 1 でなくても正規化し直さない。比較は厳密で、`confidence` が `minConfidence` と等しいときは `low_confidence` にしない。確率差が `ambiguityMargin` と等しいときは `ambiguous_choice` にしない。`noul` が `noulAtLeast` と等しいときはフラグを true にする。

振り分け先の文字列は、返却の `choice` を使う。`probabilities` の最大キーが `choice` と違っても、`choice` を置き換えない。`probabilities` は接近の判定にだけ使う。

1. `questions` の各キーについて、答えが無い、または `type` が質問と違う → `incomplete_answers`
2. 振り分けの答えについて:
   - `choice` が文字列で `confidence` が数値なら、`signals.route` は `{ choice, confidence }`。criteria に無い文字列でも載せる。このとき action が `needs_review` なら、`route.choice` は自動振り分け先にしない
   - そうでなければ `signals.route` は `null` とし、`incomplete_answers` を付ける
   - `confidence` が数値で `confidence < minConfidence` → `low_confidence`
   - `choice` が文字列で、その質問の criteria のキーに無い → `incomplete_answers`
   - `probabilities` がオブジェクトでない → `incomplete_answers`。接近の判定は行わない
   - `probabilities` の数値が2つ以上あるとき、最大と2番目の差が `ambiguityMargin` 未満 → `ambiguous_choice`。数値が1つ以下ならこの理由は付けない

`auto_route` のときの `reasons` は `["choice_confident"]` とする。要確認のときは上の理由を重複なく並べ、`choice_confident` は入れない。`incomplete_answers` があっても、読めた信号は埋める。

信号の欠落は次のとおりにする。

- 振り分けの `choice` が文字列でない、または `confidence` が数値でないときは `signals.route` は `null`
- `policy.flags` の各信号は、対応する Noul の `noul` が数値なら閾値と比べた boolean、数値でなければ `null`
- `questions` にある各 Score は、`score` が数値なら `signals.scores` に入れる。数値でなければ `null`

Score の表示ラベルは、`legend` のインデックスのうち `score` に最も近い整数（同距離なら小さい方）の文言にする。`legend` が無いときはラベルを空文字にし、`incomplete_answers` を付ける。`score` が `1.04` で legend が Calm / Frustrated / Very angry なら Frustrated。

応答の `decision` は次の形に固定する。質問を増やしても、この外側の形は変えない。増分は `signals.flags` と `signals.scores` と生の `answers` に出る。

```ts
type Decision = {
  action: 'auto_route' | 'needs_review'
  reasons: string[]
  signals: {
    route: { choice: string; confidence: number } | null
    flags: Record<string, boolean | null>
    scores: Record<string, { score: number; label: string } | null>
  }
}
```

`signals.flags` のキーは `policy.flags[].signal` である。初期プリセットでは `urgent` と `salesPitch`。

## HTTP API

ベースは同一 Worker。試す画面は静的アセット、API は Worker が処理する。

認証は全 API で必須。実装は「API層」の `bearerAuth` に従う。不一致と未設定はどちらも `401` と `{ "error": "unauthorized" }`。比較用のトークンはソースと `wrangler.jsonc` に置かない。ローカルは gitignore した `.dev.vars` の `TRIAGE_TOKEN` に書く。

### `POST /api/triage`

リクエスト:

```json
{
  "subject": "注文した商品が届きません",
  "body": "先週注文した商品がまだ届かず、至急確認してください。",
  "preset": "inquiry-triage"
}
```

| フィールド | 規則 |
| --- | --- |
| `body` | 必須の文字列。前後の空白を除いたあと、1文字以上、8000文字以下 |
| `subject` | キーが無いときは空文字。あるときは文字列。前後の空白を除いたあと200文字以下。空文字になってもよい |
| `preset` | キーが無いときは `inquiry-triage`。あるときは文字列。未知の ID は `404` |

Zod では次の順に処理する。未知キーは `z.strictObject` で失敗させる。`body` は文字列必須、`subject` と `preset` はキー省略を許す。文字列フィールドは先に trim し、そのあと長さを見る。`subject` の省略は trim 後の `""` と同じ値にする。`preset` の省略は `inquiry-triage` にする。型が文字列でない値は 400 にする。

`Content-Type` が `application/json` でない、上記のフィールド規則に反する、未知のフィールドがある、のときは `400` と `{ "error": "invalid_request", "details": "<どの規則に反したか>" }`。これは `zValidator` の hook が返す。JSON として読めない本文は hook に届かず、`onError` が同じ `error` の 400 を返す。`details` はそのとき `Malformed JSON in request body` である。

成功時 `200`:

```json
{
  "preset": "inquiry-triage",
  "model": "jev-1.13.0",
  "decision": {
    "action": "auto_route",
    "reasons": ["choice_confident"],
    "signals": {
      "route": { "choice": "support", "confidence": 0.91 },
      "flags": { "urgent": true, "salesPitch": false },
      "scores": {
        "frustration": { "score": 1.04, "label": "Frustrated" }
      }
    }
  },
  "answers": {},
  "usage": { "input_tokens": 0, "output_tokens": 0 }
}
```

上の `answers` と `usage` は形を示すための空オブジェクトである。実装は Workers AI の応答をそのまま入れる。`model` も応答の値を使う。Worker 側でモデル版を固定して上書きしない。`GET /api/presets` の例にある空の `questions` と `policy` も同様で、実装はプリセットの中身をすべて返す。

推論が失敗したときはリトライしない。タイムアウト、429、その他の上流エラーも同じ扱いにする。`502` と `{ "error": "model_unavailable" }` を返す。上流の本文はクライアントへ返さない。ログにはステータスと短いメッセージだけを残す。

### `GET /api/presets`

登録済みプリセットの ID、説明、`questions`、`policy` を返す。認証はトリアージと同じ。質問の現行定義を、ソースを開かずに確認するためのもの。

```json
{
  "presets": [
    {
      "id": "inquiry-triage",
      "description": "日本語の問い合わせを部署へ振り分ける",
      "questions": {},
      "policy": {}
    }
  ]
}
```

### 試す画面 `GET /`

`public/index.html` は「API層」の静的アセット設定で配信する。`/api/` で未定義のパス、および `POST /api/triage` と `GET /api/presets` 以外のメソッドは `404` `{ "error": "not_found" }` を返す。

画面にあるもの:

- トークン入力。値は `sessionStorage` にだけ置き、HTML には埋め込まない
- プリセット選択。`GET /api/presets` の結果で埋める。選んだプリセットの指示文と criteria を画面に表示する
- 件名と本文の入力
- 送信結果。`decision.action`、`reasons`、`signals`、`answers` を表示する

他オリジン向けの CORS ヘッダは付けない。

## Worker の配置

ファイルツリーと Hono の責務は「API層」に書いた。`wrangler.jsonc` の項目は次のとおり。

- Worker 名: `jev-triage`
- `main`: `src/index.ts`
- `compatibility_date`: `2026-09-27`
- `compatibility_flags`: `nodejs_compat`
- `ai.binding`: `AI`
- `assets.directory`: `./public`
- `assets.run_worker_first`: `["/api/*"]`
- `minify`: true
- `observability.enabled`: true
- `secrets.required`: `["TRIAGE_TOKEN"]`

`.dev.vars` は gitignore し、ローカルの `TRIAGE_TOKEN` を置く。`.env` は併用しない。本番の値は `wrangler secret put TRIAGE_TOKEN` で登録する。`secrets.required` があるので、`wrangler types` が生成する `CloudflareBindings` に `TRIAGE_TOKEN: string` が含まれる。値そのものは `wrangler.jsonc` に書かない。

ログは JSON で、プリセット ID、`model`、`action`、`reasons`、トークン数、本文の文字数を出す。件名と本文そのものは出さない。

## エラー一覧

| 状態 | HTTP | `error` |
| --- | --- | --- |
| トークン不一致、または未設定 | 401 | `unauthorized` |
| Authorization のトークンが `bearerAuth` の許可文字種に合わない | 400 | `unauthorized` |
| 入力が規則に反する | 400 | `invalid_request` |
| プリセットが無い | 404 | `unknown_preset` |
| パスまたはメソッドが未定義 | 404 | `not_found` |
| 推論の失敗 | 502 | `model_unavailable` |
| プリセット定義が「プリセット」節の条件を満たさない | 500 | `internal_error` |
| それ以外の例外 | 500 | `internal_error` |

`passThroughOnException` は使わない。例外はキャッチして上の JSON を返す。

## テスト

自動テストはモデルを呼ばない。ランナーは「API層」の Vitest と `app.request` に従う。

- `decide` に、自信のある Choice、低い confidence、確率が接近した Choice、欠けた答え、閾値前後の Noul、中間の Score を渡し、action と reasons と signals を確認する
- `POST /api/triage` は `app.request` の env で AI を固定応答に差し替え、成功、401（不一致とトークン未設定）、400、未知のプリセットを確認する。JSON を送るテストは `Content-Type: application/json` を付ける
- 推論が例外を投げたとき 502、プリセット定義が条件を満たさないとき 500、criteria に無い `choice` のとき `needs_review` かつ `signals.route.choice` がその文字列、を確認する
- プリセットを1つ足したレジストリで、ルートファイルのハンドラを増やさずに `GET /api/presets` に出ることを確認する

デプロイ後に人が見るサンプルは5件。期待 action をメモして試す画面から送る。

| サンプル | 期待の目安 |
| --- | --- |
| 届かない注文を、急いで確認してほしい | `support` かつ `urgent` |
| 請求書の金額が違う | `billing` |
| 採用応募の問い合わせ | `recruit` |
| 製品導入の売り込みメール | `salesPitch: true` |
| 部署が読み取れない短い一文 | `needs_review` |

期待と違った場合は、質問文か `policy` の数値をプリセット側で直す。ハンドラは直さない。

## 今回やらないこと

- メールやフォーム基盤からの取り込み
- 判定結果の保存（D1 や KV）
- 返信文の生成
- リクエストボディでの questions 上書き
- 実行中の質問編集
- 推論の自動リトライ
- TypeSafe 直 API との比較計測
- 日本語で書いた指示文のプリセット（仕組みは許す。初期データには入れない）
- Hono RPC のクライアント（`hono/client`）。ルートのチェーンと `ApiType` の export だけ行う
- Vite や React の画面
- GitHub Actions からのデプロイ

## 完了の見方

- 初期プリセットで `POST /api/triage` が `model` と4つの `answers` と `decision` を返す
- Choice の criteria を1語変えてデプロイすると、`GET /api/presets` と試す画面の表示が変わり、ハンドラの差分は無い
- 上の自動テストが通る
- 5件の日本語サンプルを試す画面から送り、action と信号を目で確認できる
