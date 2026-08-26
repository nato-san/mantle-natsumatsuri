# Mantleなつまつり

子どもの夏祭りごっこで、MNTを使った屋台体験をするためのWebアプリです。

ローカル共有デモとして、お店端末と複数のお客さん端末を分けて遊べます。支払いモードを切り替えると、Mantle Sepolia Testnet の test MNT 決済も使えます。

Vercelに公開すると、家ごとに別々のお祭りURLを作れます。Aさんの家とBさんの家が同じ時間に使っても、URLのお祭りIDが違えば設定・お客さん・売上履歴は混ざりません。

アプリ自体を共有する時は、`?festival=...` が付いていないURLを案内します。開いた人はトップの `お祭りURLを作る` から自分たち専用のお祭りURLを作れます。

## できること

- お客さん画面
  - 端末ごとに別のお客さんとして参加
  - れんしゅうモードでは、それぞれ別の所持金を保持
  - test MNTモードでは、アプリ内残高を隠してウォレット支払いに切り替え
  - げんざいの 1 MNT のねだんを表示
  - 円価格から自動計算されたMNT価格で購入

- お店画面
  - 店舗を切り替えて売上を確認
  - このお祭りURLを確認、コピー
  - 新しいお祭りURLを作成
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
  - 作成TOPへ戻る
  - もう使わないお祭りを削除

## 初期設定

- お祭り名: わがやのなつまつり
- 1 MNTのねだん: 100円
- お客さんの初期所持金: 10 MNT
- 初期店舗
  - たこやき: 200円
  - ポップコーン: 100円
  - わなげ: 100円

## アプリの使い方

### 1. お祭りURLを作る

まず、アプリのトップURLを開きます。

```text
https://example.vercel.app/
```

トップ画面で `お祭りURLを作る` を押すと、自分たち専用のお祭りURLができます。

```text
https://example.vercel.app/?festival=festival-123
```

このURLを共有すると、同じお祭りに参加できます。

### 2. お店端末を用意する

お祭りURLを開いて、`おみせ` を押します。

お店側では、以下ができます。

- 売上を見る
- 店舗ごとの履歴を見る
- お祭りURLをコピーする
- お祭り名やお店を設定する
- 1 MNTのねだんを変える
- `れんしゅう` / `test MNT` を切り替える
- 古いお祭りを削除する

設定はお店側からだけ操作します。

### 3. お客さん端末を用意する

同じお祭りURLをスマホや別のPCで開いて、`おきゃくさん` を押します。

お客さん側では、むずかしい設定は出ません。

- げんざいの 1 MNT のねだんを見る
- 商品を見る
- `かう！` / `あそぶ！` を押す
- 買えたら、お店で商品と引き換える

れんしゅうモードでは、端末ごとに別のお客さんとして扱われます。お客さんごとに所持金が分かれるので、兄弟や友だちがそれぞれのスマホで遊べます。

### 4. みんなに共有する

アプリそのものを紹介する時は、`?festival=...` が付いていないトップURLを共有します。

```text
https://example.vercel.app/
```

遊ぶ人は自分で `お祭りURLを作る` を押して、自分の家のお祭りを作れます。

すでに作ったお祭りに参加してもらう時は、お祭りID付きのURLを共有します。

```text
https://example.vercel.app/?festival=festival-123
```

Aさんの家とBさんの家が同じ時間に使っても、お祭りURLが違えば、設定・お客さん・売上履歴は混ざりません。

## データ共有の仕組み

このアプリは `src/app/api/festival` の共有APIで状態を保存します。

アプリのトップURL:

```text
https://example.vercel.app/
```

このURLから `お祭りURLを作る` を押すと、その仲間専用のお祭りURLができます。

お祭りごとにURLへ `festival` IDを付けます。

```text
https://example.vercel.app/?festival=festival-123
```

同じURLを開いた端末は同じお祭りに参加します。違う `festival` IDのURLを開いた端末は、別のお祭りになります。

お客さん端末ごとにブラウザ内で別IDを作るため、複数人で開いても所持金は別々です。お客さんIDはお祭りIDごとに分かれるため、Aさん宅のお客さん残高とBさん宅のお客さん残高は混ざりません。お客さんが商品を買うと、そのお祭りの共有APIに購入履歴が保存され、同じURLのお店画面に反映されます。

ローカルで動かす場合、保存先はローカルファイルです。

```text
data/festivals/{festivalId}.json
```

Vercelで公開してUpstash Redisを接続している場合、保存先はRedisになります。

古いローカル保存がある場合は、初期のお祭りID `wagaya` として `data/festival-state.json` から自動移行します。

このファイルには当日の履歴やお客さん情報が入るため、GitHubには含めません。

## セットアップ方法

### ローカルで動かす

依存関係を入れます。

```bash
npm install
```

開発用に起動します。

```bash
npm run dev -- --hostname 0.0.0.0 --port 3000
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

本番ビルドで確認する場合はこちらです。

```bash
npm run build
npm run start -- --hostname 0.0.0.0 --port 3000
```

### Vercelで公開する

Vercelに公開すると、誰でもスマホやPCから使えます。

ただしVercel上ではローカルファイル保存が長期保存に向かないため、公開して家ごとにちゃんと使う場合は Upstash Redis を使います。

VercelのStorage連携でUpstash Redisを接続すると、自動で環境変数が追加されます。

このアプリは、以下の環境変数名に対応しています。

```text
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
KV_REST_API_URL
KV_REST_API_TOKEN
STORAGE_URL
STORAGE_TOKEN
STORAGE_REST_API_URL
STORAGE_REST_API_TOKEN
STORAGE_KV_REST_API_URL
STORAGE_KV_REST_API_TOKEN
```

WalletConnectを使う場合は、ReownのProject IDも設定します。

```text
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=ReownのProject ID
```

## Mantle Sepolia 実決済

お祭り設定で支払いモードを `test MNT` にすると、お客さん端末のウォレットから Mantle Sepolia Testnet で送金します。

test MNTモードでは、子ども画面の `のこり MNT` は表示しません。実際の残高はウォレット側で確認するためです。

ウォレット接続には Reown AppKit / WalletConnect を使います。特定ウォレットをただ開くのではなく、ウォレット接続後に購入ボタンから送金し、購入時はウォレット側で送金を承認します。

スマホでは同じ端末内のウォレットアプリへ遷移する接続を想定しています。安定して確認する場合は、ローカルIPアドレスよりもHTTPSで公開したURLを使うのがおすすめです。

Mantle Sepolia の接続情報:

- Chain ID: `5003`
- RPC URL: `https://rpc.sepolia.mantle.xyz`
- Currency: `MNT`
- Explorer: `https://explorer.sepolia.mantle.xyz`

使う前に、お店ごとに `test MNTの受け取り先` を設定してください。受け取り先が未設定だと、子ども側では購入できません。

購入が成功すると、決済履歴に以下を保存します。

- `payerAddress`
- `recipientAddress`
- `transactionHash`
- `blockNumber`
- `gasUsed`
- `status`

注文状態は `pending_wallet` → `submitted` → `confirmed` → `completed` で進みます。ウォレット拒否は `rejected`、チェーン検証失敗は `failed` になります。

オンチェーンの `confirmed` はクライアントの自己申告ではなく、サーバー側でTx receipt、from、to、valueをMantle Sepoliaから取得して検証してから記録します。

お店側には、購入した商品、MNT金額、支払い元ウォレット、Mantle Sepolia Explorerへのリンクが表示されます。

お店側で `商品をわたした！ OK` を押すと `completed` になり、お客さん側の受取画面も `おかいもの完了！` に変わります。

秘密鍵やシードフレーズは、コードやGitHubに入れません。署名と送金承認はお客さん端末のウォレット側で行います。

うまくいかない時は、お店側設定から支払いモードを `れんしゅう` に戻すと、オンチェーンなしで遊べます。

## 技術構成

- Next.js
- TypeScript
- Tailwind CSS
- App Router
- ローカル共有API
- viem
- wagmi
- Reown AppKit / WalletConnect
- Mantle Sepolia Testnet

## 確認コマンド

```bash
npm run lint
npm run build
```
