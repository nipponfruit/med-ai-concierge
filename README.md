# 医師監修AIコンシェルジュ MVP（Express）

非診断・非処方のB2B向けヘルスケアWeb API。ローカルKB + 埋め込み（OpenAI/TF-IDFフォールバック）で出典付き回答を返します。危険徴候は受診勧奨テンプレに誘導します。

## セットアップ
1) 依存インストール（package.jsonに従い一括）
```
npm install
```
2) 環境変数
```
cp .env.example .env
# または
cp config/example.env .env
# 必要に応じて CORS_ORIGIN, OPENAI_API_KEY を設定
```
3) 起動
```
npm run dev
# or
npm start
```

## 使い方
- ブラウザで `http://localhost:3000/` を開き、チャットUIから質問。
- 出典バッジ、免責表示、監修ポリシー版数（/healthのpolicyVersion）が表示されます。

## エンドポイント
- GET `/health` ヘルスチェック（{ status, ready, kbCount, policyVersion, time }）
- GET `/kb/list` KB一覧（id, title, url, source, updated_at）
- POST `/kb/reload` KB再読込
- POST `/api/ask` { query } を受け取り、以下を返す:
```json
{
  "answer": "…",
  "citations": [{"title":"…","url":"…","source":"…"}],
  "risk_level": "low|medium|high",
  "triage_hint": "…"
}
```
※ 出典0件の場合は `citations: [{"title":"no_citation"}]` を返します。

## 医師監修ポリシー
- 断定診断・処方はしない（一般的情報に限定）。
- 禁句（診断して/処方して/違法な薬物 等）を含む質問はガードレールにより受診勧奨テンプレへ置換し、`risk_level=high`。
- 出典ゼロのときは「情報不足テンプレ」を返す。
- 高リスク（胸痛/呼吸困難/意識障害/大量出血/アナフィラキシー/けいれん等）は受診勧奨テンプレを明示。

## ローカルKBと埋め込み
- KBは以下の順で読み込み：
  1. `kb/*.md`（フロントマター対応: id/title/url/source/updated_at）
  2. `data/kb/*.json`（フォールバック・マージ）
- 既定: TF-IDF（日本語対応のため文字2-gram）。
- `OPENAI_API_KEY`があればOpenAI Embeddings(text-embedding-3-small)に自動切替。失敗時は自動フォールバック。

## ディレクトリ
- `public/` チャットUI（`/`で配信）
- `server.js` Expressエントリ
- `src/kb.js` KB読込（Markdown + JSON）
- `src/retriever.js` リトリーバ（Embeddings/TF-IDF）
- `src/policy.js` ポリシー/テンプレ/リスク検知/禁句検知
- `kb/*.md` サンプルKB（Markdown）
- `data/kb/*.json` サンプルKB（JSON）
- `config/example.env` 環境変数サンプル

## 免責
本APIは一般的な健康情報提供を目的とし、診断・処方・緊急対応の指示を行うものではありません。緊急時は119番、または地域の救急相談(#7119等)を利用してください。
