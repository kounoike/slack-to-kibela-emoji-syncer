import { App } from '@slack/bolt';
import { LinkUnfurls, MessageAttachment } from '@slack/types';
import fetch from "node-fetch";
import gql from "graphql-tag";
import { print as printGql } from "graphql/language/printer"
import { ChatUnfurlArguments } from '@slack/web-api';
const imageDataURI = require("image-data-uri");

const kibelaTeam = process.env.KIBELA_TEAM;
const kibelaToken = process.env.KIBELA_TOKEN;
const kibelaEndpoint = `https://${kibelaTeam}.kibe.la/api/v1`;
const userAgent = "Slack-To-Kibela-Emoji-Syncer/1.0.0";

const kibelaEmojiMutationQuery = gql`
mutation($code: String!, $url: String!) {
  createCustomEmoji(input: {
    emojiCode: $code
    imageDataUrl: $url
  }){
    clientMutationId
  }
}
`

const kibelaLinkDescriptionQuery = gql`
query($path: String!) {
  note: noteFromPath(path: $path) {
    author {
      id
      account
      avatarImage(size:MEDIUM) {
        url
      }
      realName
      url
    }
    folderName
    groups {
      name
    }
    commentCount
    id
    title
    url
    publishedAt
    updatedAt
    summary: contentSummaryHtml
  }
}
`

async function createEmoji(code: string, imageUrl: string) {
  return imageDataURI.encodeFromURL(imageUrl).then((datauri: string) => {
    console.log(`${code}: ${imageUrl} : ${datauri.slice(0, 60)}`);
    return fetch(kibelaEndpoint, {
      method: "POST",
      redirect: "follow",
      headers: {
        Authorization: `Bearer ${kibelaToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": userAgent
      },
      body: JSON.stringify({
        query: printGql(kibelaEmojiMutationQuery),
        variables: {
          code: code,
          url: datauri
        }
      })
    }).then(response => {
      console.log(`create request ${code}: ${JSON.stringify(response)}`)
    }).catch(e => console.log(`fetch request error: ${e}`))
  })
}

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET
});
if (process.env.DEBUG) {
  app.use(async (args: any) => {
    console.log(JSON.stringify(args));
    return await args.next();
  });
}
app.message(/hello/, async ({ message, say }) => {
  // say() sends a message to the channel where the event was triggered
  await say(`Hey there <@${message.user}>!`);
});

app.message(/emoji sync/, async ({ message, context, say }) => {
  const result = await app.client.emoji.list({token: context.botToken}) as any;
  if (result.ok) {
    say(`Start emoji sync`)
    for (const code in result.emoji) {
      await createEmoji(code, result.emoji[code]).catch(e => console.log(`CreateEmoji Error: ${e}`));
    }
    say(`OK! imported ${Object.keys(result.emoji).length} emojis`);
  } else {
    console.log(result.error);
  }
});

app.event('emoji_changed', async({event, client}) => {
  try {
    if(event.subtype === "add") {
      if(event.name && event.value) {
        console.log(`creating ${event.name} emoji....`);
        await createEmoji(event.name, event.value);
        console.log(`create ${event.name} emoji done.`);
      }
    }
  } catch (error) {
    console.log(error);
  }
});

async function getKibelaNoteUnfurlFromUrl(url: string): Promise<[string, MessageAttachment]|[]> {
  return new Promise(function(resolve, reject) {
    fetch(kibelaEndpoint, {
      method: "POST",
      redirect: "follow",
      headers: {
        Authorization: `Bearer ${kibelaToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": userAgent
      },
      body: JSON.stringify({
        query: printGql(kibelaLinkDescriptionQuery),
        variables: {
          path: url
        }
      })
    }).then((res) => res.json()).then((json) => {
      if (json.data) {
        const note = json.data.note;
        // const attachment: MessageAttachment = {
        //   author_icon: note.author.avatarImage.url,
        //   author_name: note.author.account,
        //   author_link: note.author.url,
        //   title: note.title,
        //   title_link: note.url,
        //   text: note.summary
        // };
        const folderName = note.folderName || "フォルダ未設定";
        const attachment: MessageAttachment = {
          color: "#327AC2",
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `<${note.url}|*${note.title}*>`,
              }
            },
            {
              type: "section",
              fields: [
                {
                  type: "mrkdwn",
                  text: `*Author:*\n${note.author.realName}`
                },
                {
                  type: "mrkdwn",
                  text: `*Folder:*\n${folderName}`
                },
                {
                  type: "mrkdwn",
                  text: `*Group:*\n${note.groups.map((g:any)=>g.name).join(', ')}`
                },
                {
                  type: "mrkdwn",
                  text: `*Published at:*\n${note.publishedAt}`
                },
                {
                  type: "mrkdwn",
                  text: `*Updated at:*\n${note.updatedAt}`
                },
                {
                  type: "mrkdwn",
                  text: `*Comments:*\n${note.commentCount}`
                }
              ]
            },
            {
              type: "section",
              text: {
                type: "plain_text",
                text: note.summary
              }
            }
          ]
        };
        console.log(url, attachment);
        resolve([url, attachment]);
      } else {
        resolve([]);
      }
    }).catch(e => reject(e));
  });
}

app.event('link_shared', async({event, client}) => {
  const channel = event.channel;
  const messageTs = event.message_ts;
  Promise.all(event.links.map(async (link) => getKibelaNoteUnfurlFromUrl(link.url as string))).then(values => {
    const unfurls = Object.fromEntries(values.filter(v => v.length > 0));
    const unfurlArgs: ChatUnfurlArguments = {
      channel: channel,
      ts: messageTs,
      unfurls: unfurls
    };
    console.log(JSON.stringify(unfurlArgs));
    client.chat.unfurl(unfurlArgs);
  }).catch((e) => console.log(e));
});

(async () => {
  // Start your app
  await app.start(process.env.PORT || 3000);
  console.log('⚡️ Bolt app is running!');
})();

