# セットアップ方法

このファイルは、Mantleなつまつりを開発・公開する人向けのメモです。

アプリの遊び方は [README.md](./README.md) を見てください。

## 技術構成

- Next.js
- TypeScript
- Tailwind CSS
- App Router
- 共有API
- viem
- wagmi
- Reown AppKit / WalletConnect
- Mantle Sepolia Testnet

## ローカルで動かす

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

## Vercelで公開する

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

公開後は、まずアプリのトップURLを共有します。使う人は `お祭りURLを作る` を押して自分たちのお祭りを作ります。

作った後は、お店画面のお祭りURLを家族の端末で開くと同じお祭りに入れます。別の家で使う場合は、トップURLから新しく作るか、お店画面の `新しいお祭り` を押して別URLを作ります。

古いお祭りが不要になった場合は、お店側の設定から `このお祭りを削除` を押します。削除すると、そのお祭りの設定、売上、履歴、お客さんの残高は消え、作成TOPへ戻ります。

## データ共有の仕組み

このアプリは `src/app/api/festival` の共有APIで状態を保存します。

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

## Mantle Sepolia 実決済

ウォレット接続には Reown AppKit / WalletConnect を使います。特定ウォレットをただ開くのではなく、ウォレット接続後に購入ボタンから送金し、購入時はウォレット側で送金を承認します。

スマホでは同じ端末内のウォレットアプリへ遷移する接続を想定しています。安定して確認する場合は、ローカルIPアドレスよりもHTTPSで公開したURLを使うのがおすすめです。

Mantle Sepolia の接続情報:

- Chain ID: `5003`
- RPC URL: `https://rpc.sepolia.mantle.xyz`
- Currency: `MNT`
- Explorer: `https://explorer.sepolia.mantle.xyz`

Reown側のAllowed Domainsには、Vercelの公開URLを追加してください。

購入が成功すると、決済履歴に以下を保存します。

- `payerAddress`
- `recipientAddress`
- `transactionHash`
- `blockNumber`
- `gasUsed`
- `status`

注文状態は `pending_wallet` → `submitted` → `confirmed` → `completed` で進みます。ウォレット拒否は `rejected`、チェーン検証失敗は `failed` になります。

オンチェーンの `confirmed` はクライアントの自己申告ではなく、サーバー側でTx receipt、from、to、valueをMantle Sepoliaから取得して検証してから記録します。

秘密鍵やシードフレーズは、コードやGitHubに入れません。署名と送金承認はお客さん端末のウォレット側で行います。

## 確認コマンド

```bash
npm run lint
npm run build
```
