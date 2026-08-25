# Mantleなつまつり

子どもの夏祭りごっこで、MNTを使った屋台体験をするためのWebアプリです。

ローカル共有デモとして、お店端末と複数のお客さん端末を分けて遊べます。支払いモードを切り替えると、Mantle Sepolia Testnet の test MNT 決済も使えます。

## できること

- お客さん画面
  - 端末ごとに別のお客さんとして参加
  - れんしゅうモードでは、それぞれ別の所持金を保持
  - test MNTモードでは、アプリ内残高を隠してウォレット支払いに切り替え
  - げんざいの 1 MNT のねだんを表示
  - 円価格から自動計算されたMNT価格で購入

- お店画面
  - 店舗を切り替えて売上を確認
  - 店舗別売上、販売件数、決済履歴を表示
  - 全店舗合計を表示
  - Mantle Sepolia / Demo または Mantle Sepolia / On-chain として明示

- お祭り設定
  - お店側からだけ操作
  - お祭り名を変更
  - 1 MNTのねだんを変更
  - れんしゅう / test MNT の支払いモードを切り替え
  - 店舗の追加、編集、削除
  - 店舗ごとのtest MNT受け取り先アドレスを設定
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

## Mantle Sepolia 実決済

お祭り設定で支払いモードを `test MNT` にすると、お客さん端末のウォレットから Mantle Sepolia Testnet で送金します。

test MNTモードでは、子ども画面の `のこり MNT` は表示しません。実際の残高はウォレット側で確認するためです。

Mantle Sepolia の接続情報:

- Chain ID: `5003`
- RPC URL: `https://rpc.sepolia.mantle.xyz`
- Currency: `MNT`
- Explorer: `https://explorer.sepolia.mantle.xyz`

使う前に、お店ごとに `test MNTの受け取り先` を設定してください。受け取り先が未設定だと、子ども側では購入できません。

購入が成功すると、決済履歴に以下を保存します。

- `transactionHash`
- `blockNumber`
- `gasUsed`

秘密鍵やシードフレーズは、コードやGitHubに入れません。署名はお客さん端末のウォレット側で行います。

うまくいかない時は、お店側設定から支払いモードを `れんしゅう` に戻すと、オンチェーンなしで遊べます。

## 技術構成

- Next.js
- TypeScript
- Tailwind CSS
- App Router
- ローカル共有API
- viem
- Mantle Sepolia Testnet

## 確認コマンド

```bash
npm run lint
npm run build
```
