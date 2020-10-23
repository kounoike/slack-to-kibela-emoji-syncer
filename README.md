REA# Slack-to-Kibela Emoji Syncer

Slack絵文字をKibelaに同期する感じのヤツ

Herokuにデプロイする感じ。
SLACKとKibelaの両方でトークンが必要。

[![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy?template=https://github.com/kounoike/slack-to-kibela-emoji-syncer/tree/master)

これでデプロイして必要な変数を埋めればOK

## 使い方

なんとか頑張ってインストールする。

どっかのチャンネルに呼ぶ。

そのチャンネルで `hello` と送ると返してくれる（動作確認）。

そのチャンネルで `emoji sync` と送ると同期を始める。（TODO:チャンネルに呼ばないで同期開始するイケてる方法）

絵文字の追加イベントも見ているので以降追加された絵文字は自動的にKibelaにも追加される。

TODO:削除イベントを見てKibela側からも削除する。

## Slack ⚡️ Bolt

A framework to build Slack apps, fast.

* https://slack.dev/bolt
* https://github.com/SlackAPI/bolt

## How to build

### Create a Slack App

https://api.slack.com/apps

* Features > OAuth & Permissions:
  * Scopes:
    * "channels:history"
    * "chat:write"
    * "emoji:read"
  * Click "Save Changes"
* Features > Bot User:
  * Click "Add a Bot User"
  * Click "Add Bot User"
* Settings > Install App:
  * Complete "Install App"

### Run the app on your local machine

```bash
export SLACK_SIGNING_SECRET=abcd1234567890123456789012345678
export SLACK_BOT_TOKEN=xoxb-123456789012-123456789012-abcd12345678901234567890
export KIBELA_TOKEN=secret/...............
export KIBELA_TEAM=yourteamname
export DEBUG=1
npm run local
```

### Deploy to Heroku

[![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy?template=https://github.com/seratch/bolt-on-heroku/tree/master)

* Set env variables on Heroku
  * (Slack) Settings > Basic Information > App Credentials > Siginging Secret
  * (Slack) Settings > Install App > Bot User OAuth Access Token

[![Heroku deployment page](https://raw.githubusercontent.com/seratch/bolt-on-heroku/master/deploy_to_heroku.png)](https://heroku.com/deploy?template=https://github.com/seratch/bolt-on-heroku/tree/master)

### Enable Slack Events Subscription

* Features > Event Subscriptions:
  * Enable Events:
    * Change from "Off" to "On"
  * Request URL:
    * Set "https://{your app name}.herokuapp.com/slack/events"
  * Subscribe to Workspace Events:
    * Add "message.channels"
    * Add "emoji_changed"
  * Click "Save Changes"

### Try the Slack App

* Invite your bot to a Slack channel
* Post "hello" in the channel
* You'll receive a response from the bot

![hello](https://raw.githubusercontent.com/seratch/bolt-on-heroku/master/hello.png)

