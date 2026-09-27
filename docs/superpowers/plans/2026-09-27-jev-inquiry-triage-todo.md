# 日本語問い合わせトリアージ API 進捗

日付: 2026-09-27

別セッションはここから続ける。仕様は `docs/superpowers/specs/2026-09-27-jev-inquiry-triage-design.md`。タスクの中身は `docs/superpowers/plans/2026-09-27-jev-inquiry-triage.md`。

ブランチは `feature/jev-triage`。コミットはしていない。作業ツリーは未追跡の実装一式。

## 次にやること

1. `test/api.test.ts` の TypeScript エラーを直す。`pnpm exec tsc --noEmit` が次の7件で落ちる。実行時の `pnpm exec vitest run test/api.test.ts` は 9 件成功している。`response.json()` が `unknown` なので、読む箇所に型を付ける。
   - `test/api.test.ts:98` `extraJson`
   - `test/api.test.ts:106`
   - `test/api.test.ts:117`
   - `test/api.test.ts:165`
   - `test/api.test.ts:166`
   - `test/api.test.ts:181`
   - `test/api.test.ts:182`
2. Task 6（HTTP API）を直したあと、仕様レビューとコード品質レビューをサブエージェントにかけ、指摘の妥当性を確認してから次へ進む。
3. Task 7: `public/index.html`。トークンは `sessionStorage` のみ。`GET /api/presets` で選択肢と指示文・criteria を出す。件名と本文を送り、`decision.action`、`reasons`、`signals`、`answers` を表示する。仕様の5件を入力欄へ入れる。CORS は付けない。`public/.gitkeep` は画面を置いたら消してよい。
4. 画面はブラウザで、トークン保存、プリセット表示、送信、サンプル投入まで確認する。`pnpm dev` の前に gitignore 済みの `.dev.vars` へ `TRIAGE_TOKEN=` を書く。値はソースと `wrangler.jsonc` に置かない。
5. 全テストは `pnpm exec vitest run`。Workers のテストランナーはローカルの Wrangler ログに書くため、サンドボックスでは権限が要ることがある。

## 完了

レビューは各タスクで仕様適合のあとコード品質。Important は直して再レビュー済み。

| タスク | 状態 | テスト |
| --- | --- | --- |
| 1. 土台 | 完了 | `tsc --noEmit` はソース単体で成功。Vitest は設定起動を確認 |
| 2. プリセット | 完了 | `test/presets.test.ts` 12 件 |
| 3. decide | 完了 | `test/decide.test.ts` 19 件 |
| 4. Bearer | 完了 | `test/bearer.test.ts` 5 件 |
| 5. 推論の結合 | 完了 | `test/triage.test.ts` 5 件 |
| 6. HTTP API | 実装済み、型エラーが残る。レビュー前 | `test/api.test.ts` 9 件は実行成功。`tsc` は上記7件 |
| 7. 試す画面 | 未着手 | `public/index.html` は無い |

## 計画から変えたところ

- テストランナーは `@cloudflare/vitest-plugin@1.2.8` の `cloudflareTest()`。設計に書いてある `@cloudflare/vitest-pool-workers@0.22` の workerd は compatibility date の上限が 2026-08-22 で、指定の `2026-09-27` を起動できない。
- `vitest.config.ts` の `remoteBindings` は false。true だとリモートプロキシが `CLOUDFLARE_API_TOKEN` を要求する。テスト用トークンは `process.env.TRIAGE_TOKEN ??= 'test-token'`。
- `nodejs_compat` のため `@types/node` を足した。
- pnpm 12 は `package.json` の `pnpm` フィールドを読まない。`pnpm-workspace.yaml` の `allowBuilds` で `esbuild` と `workerd` の install script を許可している。
- pnpm の導入は [公式 Installation](https://pnpm.io/ja/installation)（standalone スクリプトまたは `npx get-pnpm`）。Corepack は使わない。バージョン合わせは `pnpm self-update`（`packageManager` ピンを参照）。
- ストアはプロジェクト内の `.pnpm-store/`。gitignore 済み。消さない。
- `decide` の数値判定は `Number.isFinite`。`NaN` と `Infinity` は JSON にすると `null` になる。
- Score の `legend` は公式応答どおり、インデックス文字列をキーにしたオブジェクト。
- リモートが無いので worktree には移していない。`main` ではなく `feature/jev-triage` で作業している。

## まだ見えている警告

Vitest 起動時に「AI bindings always access remote resources」と出る。`wrangler.jsonc` の `ai.binding` は設計どおり `AI` のみ。`remote: true` は足していない。テストは AI を `app.request` の env で差し替える。

## 触らないこと

仕様の「今回やらないこと」に従う。コミットとデプロイは、このセッションでは頼まれていない。
