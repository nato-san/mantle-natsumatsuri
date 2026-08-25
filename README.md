# Mantleなつまつり

子どもの夏祭りごっこで、MNTを使った屋台体験をするためのWebアプリです。

まずはローカル共有デモとして、お店端末と複数のお客さん端末を分けて遊べる状態にしています。次のステップで Mantle Sepolia Testnet の test MNT 決済を接続する予定です。

## できること

- お客さん画面
  - 端末ごとに別のお客さんとして参加
  - それぞれ別の所持金を保持
  - げんざいの 1 MNT のねだんを表示
  - 円価格から自動計算されたMNT価格で購入

- お店画面
  - 店舗を切り替えて売上を確認
  - 店舗別売上、販売件数、決済履歴を表示
  - 全店舗合計を表示
  - Mantle Sepolia / Demo として明示

- お祭り設定
  - お店側からだけ操作
  - お祭り名を変更
  - 1 MNTのねだんを変更
  - 店舗の追加、編集、削除
  - 残高と履歴をリセット

## 初期設定

- お祭り名: わがやのなつまつり
- 1 MNTのねだん: 100円
- お客さんの初期所持金: 10 MNT
- 初期店舗
  - たこやき: 200円
  - ポップコーン: 100円
  - わなげ: 100円

## 使い方

依存関係を入れます。

```bash
npm install
```

開発用に起動します。

```bash
npm run dev -- --hostname 0.0.0.0 --port 3000
```

本番ビルドで確認する場合はこちらです。

```bash
npm run build
npm run start -- --hostname 0.0.0.0 --port 3000
```

同じMacで見る場合:

```text
http://127.0.0.1:3000
```

スマホや別端末で見る場合は、アプリを起動しているPC/Macと同じWi-Fiにつなぎ、そのPC/MacのIPアドレスで開きます。

例:

```text
http://192.168.11.17:3000
```

## 複数端末での動き

このアプリは `src/app/api/festival` の共有APIで状態を保存します。

お客さん端末ごとにブラウザ内で別IDを作るため、複数人で開いても所持金は別々です。お客さんが商品を買うと、共有APIに購入履歴が保存され、お店画面に反映されます。

現在の保存先はローカルファイルです。

```text
data/festival-state.json
```

このファイルには当日の履歴やお客さん情報が入るため、GitHubには含めません。

## STEP 2: Mantle Sepolia 実決済

次の実装では、購入処理を Mantle Sepolia Testnet の送金に接続します。

想定している保存項目:

- `recipientAddress`
- `transactionHash`
- `blockNumber`
- `gasUsed`

秘密鍵やシードフレーズは、コードやGitHubに入れません。お客さん端末のウォレットから test MNT を送る方式にします。

## 技術構成

- Next.js
- TypeScript
- Tailwind CSS
- App Router
- ローカル共有API
- 将来的に viem で Mantle Sepolia 接続予定

## 確認コマンド

```bash
npm run lint
npm run build
```
