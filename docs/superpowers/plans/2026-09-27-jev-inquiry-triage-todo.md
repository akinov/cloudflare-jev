# 日本語問い合わせトリアージ API 進捗

日付: 2026-09-27

別セッションはここから続ける。仕様は `docs/superpowers/specs/2026-09-27-jev-inquiry-triage-design.md`。タスクの中身は `docs/superpowers/plans/2026-09-27-jev-inquiry-triage.md`。

ブランチは `feature/jev-triage`。Task 6 までコミット済み。Task 7 の画面は実装済み（ブラウザ確認は未）。

## 次にやること

1. 画面はブラウザで、トークン保存、プリセット表示、送信、サンプル投入まで確認する。`pnpm dev` の前に gitignore 済みの `.dev.vars` へ `TRIAGE_TOKEN=` を書く。値はソースと `wrangler.jsonc` に置かない。
2. 全テストは `pnpm exec vitest run`。Workers のテストランナーはローカルの Wrangler ログに書くため、サンドボックスでは権限が要ることがある。
3. 実装ブランチの統合（merge / PR）は別途判断。

## 完了

レビューは各タスクで仕様適合のあとコード品質。Important は直して再レビュー済み。

| タスク | 状態 | テスト |
| --- | --- | --- |
| 1. 土台 | 完了 | `tsc --noEmit` はソース単体で成功。Vitest は設定起動を確認 |
| 2. プリセット | 完了 | `test/presets.test.ts` 12 件 |
| 3. decide | 完了 | `test/decide.test.ts` 19 件 |
| 4. Bearer | 完了 | `test/bearer.test.ts` 5 件 |
| 5. 推論の結合 | 完了 | `test/triage.test.ts` 5 件 |
| 6. HTTP API | 完了（サブエージェントレビュー済み） | `test/api.test.ts` 9 件、`tsc --noEmit` OK |
| 7. 試す画面 | 実装済み、ブラウザ確認待ち | `public/index.html` |

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
