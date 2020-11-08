import fs from 'fs';
import express from 'express';
import bodyParser from 'body-parser';
import { App, ExpressReceiver, LinkSharedEvent } from '@slack/bolt';
import { LinkUnfurls, MessageAttachment } from '@slack/types';
import fetch from "node-fetch";
import gql from "graphql-tag";
import { print as printGql } from "graphql/language/printer"
import { ChatUnfurlArguments, WebClient } from '@slack/web-api';
const {htmlToText} = require('html-to-text');
const LRU = require('lru');
const jspngopt = require("jspngopt");

// const kuromoji = require('kuromoji')
import * as kuromoji from 'kuromoji'
import { isConstructorDeclaration } from 'typescript';
import { send } from 'process';
const D3Node = require('d3-node')
const d3 = require('d3')
const cloud = require('d3-cloud')
const { JSDOM } = require('jsdom')
const Canvas = require('canvas')
const fabric = require('fabric').fabric

const dicPath = './node_modules/kuromoji/dict';
// const dicPath = './dict';
// const targetPosList = ['名詞', '形容詞', '動詞'];
const targetPosList = ['名詞'];
const ngWords = ['https', '://', '[', ']', '@', 'co', 'jp', 'com', '/', 'in', "もの","これ","ため","それ","ところ","よう", "の", "こと", "とき", "ん"]

const imageDataURI = require("image-data-uri");

const emojiChannel = process.env.EMOJI_CHANNEL || "#emoji";
const kibelaTeam = process.env.KIBELA_TEAM;
const kibelaToken = process.env.KIBELA_TOKEN;
const kibelaEndpoint = `https://${kibelaTeam}.kibe.la/api/v1`;
const userAgent = "Slack-To-Kibela-Emoji-Syncer/1.0.0";
const fontFile = "./font.ttf";
const w = 420;
const h = 180;
const fontSize = 50;
const fontMinSize = 20;
const padding = 2;
const numImageCaches = parseInt(process.env.NUM_IMAGE_CACHE || "200");

const kibelaEmojiMutationQuery = gql`
mutation($code: String!, $url: String!) {
  createCustomEmoji(input: {
    emojiCode: $code
    imageDataUrl: $url
  }){
    clientMutationId
  }
}
`;

const kibelaLinkDescriptionQuery = gql`
query($path: String!) {
  note: noteFromPath(path: $path) {
    author {
      realName
      url
    }
    contributors(first: 5) {
      totalCount
      nodes {
        realName
        url
      }
    }
    folder {
      path
      fullName
    }
    groups {
      name
      path
    }
    likers {
      totalCount
    }
    commentsCount
    id
    title
    url
    publishedAt
    contentUpdatedAt
  }
}
`;

const kibelaContentQuery = gql`
query($id: ID!) {
  note: note(id: $id) {
    content: contentHtml
  }
}
`;

const kibelaGetIdFromPathQuery = gql`
query($path: String!) {
  note: noteFromPath(path: $path) {
    id
  }
}
`;

const wordCloudResultCache = new LRU(numImageCaches);
wordCloudResultCache.on('evict', (e:{key:string, value:any}) => {
  console.warn(`LRU Cache evicted: ${e.key}`)
});
const generatingWordClouds: any = {}; 

const pngOptimizer = new jspngopt.Optimizer();

async function createEmoji(code: string, imageUrl: string) {
  return imageDataURI.encodeFromURL(imageUrl).then((datauri: string) => {
    // console.log(`${code}: ${imageUrl} : ${datauri.slice(0, 60)}`);
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
    }).catch(e => console.error(`fetch request error: ${e}`))
  })
}

const receiver = new ExpressReceiver({signingSecret: process.env.SLACK_SIGNING_SECRET || "", endpoints: "/real_slack/events"})
let serverHostName = "";

receiver.router.post("/slack/events", async (req, res, next) => {
  serverHostName = req.hostname;
  req.url = '/real_slack/events';
  console.log("redirect to real_slack");
  res.redirect(307, "/real_slack/events");
});

// receiver.app.use(express.static('public'));
receiver.app.use(bodyParser.json({limit: "10mb"}));

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver
});
if (process.env.DEBUG) {
  app.use(async (args: any) => {
    // console.log(JSON.stringify(args));
    return await args.next();
  });
}

app.message(/hello/, async ({ message, say }) => {
  // say() sends a message to the channel where the event was triggered
  await say(`Hey there <@${message.user}>! from ${serverHostName}`);
});

app.message(/emoji sync/, async ({ message, context, say }) => {
  const result = await app.client.emoji.list({token: context.botToken}) as any;
  if (result.ok) {
    say(`Start emoji sync`)
    for (const code in result.emoji) {
      await createEmoji(code, result.emoji[code]).catch(e => console.error(`CreateEmoji Error: ${e}`));
    }
    say(`OK! imported ${Object.keys(result.emoji).length} emojis`);
  } else {
    console.error(result.error);
  }
});

app.event('emoji_changed', async({event, client, context}) => {
  try {
    if(event.subtype === "add") {
      if(event.name && event.value && !event.value.startsWith("alias:")) {
        console.log(`creating ${event.name} emoji....`);
        await createEmoji(event.name, event.value);
        console.log(`create ${event.name} emoji done.`);
        const result = await app.client.chat.postMessage({
          token: context.botToken,
          channel: emojiChannel,
          mrkdwn: true,
          text: "",
          attachments: [
            {
              blocks: [
                {
                  type: "section",
                  text: {
                    type: "mrkdwn",
                    text: `新しい絵文字: :${event.name}: \`:${event.name}:\` が登録されました。`,
                  },
                  accessory: {
                    type: "image",
                    image_url: event.value,
                    alt_text: event.name
                  }
                }
              ]
            }
          ]
        });
        console.log("result", JSON.stringify(result));
      }
    }
  } catch (error) {
    console.error(JSON.stringify(error));
  }
});

async function getWordCloudImage(content: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    kuromoji.builder({dicPath}).build((err: any, tokenizer: any) => {
        if (err) {
            console.error("kuromoji error:", err)
            reject(err)
        }
        const tokens = tokenizer.tokenize(content)
        const words = tokens
        .filter((t:any) => targetPosList.includes(t.pos))
        .filter((t:any) => t.basic_form !== '*')
        .map((t:any) => t.basic_form)
        // .map((t:any) => t.basic_form === '*' ? t.surface_form : t.basic_form)
        // [{text: 単語, value: 出現回数}]の形にReduce
        .filter((t:string) => !ngWords.includes(t))
        .reduce((data:any[], text:string) => {
            const target = data.find(c => c.text === text)
            if(target) {
            target.value = target.value + 1
            } else {
            data.push({
                text,
                value: 1,
            })
            }
            return data
        }, [])
        // .filter((t:any) => t.text.length > 1)
        .slice(0, 100)
        // console.log(JSON.stringify(words))
        // const sumWords = words.map((w) => w.value).reduce((a, b) => a + b)
        const maxWords = Math.max(...words.map((w:any) => w.value))
        const sortByRatioWords = words.map((w:any) => {
            return {
                text: w.text,
                count: w.value,
                ratio: w.value / maxWords,
                value: w.text.length * w.value / maxWords
            }
        })

        Canvas.registerFont(fontFile, {family: 'Impact'})
        cloud().size([w, h])
        .canvas(() => Canvas.createCanvas(1, 1))
        .words(sortByRatioWords)
        .padding(padding)
        .font("Impact")
        .fontSize((word:any) => fontMinSize + word.ratio * (fontSize - fontMinSize))
        .rotate((word:any) => Math.random() < 0.5 ? 0 : 90)
        .on("end", ((words:any) => {
            // console.log(JSON.stringify(words))
            const d3n = new D3Node({canvasModule: Canvas})
            d3n.options.canvasModule.registerFont(fontFile, {family: 'Impact'})

            d3n
            .createSVG(w, h)
            .append("svg")
                .attr("class", "ui fluid image") // style using semantic ui
                .attr("viewBox", "0 0 " + w + " " + h )  // ViewBox : x, y, width, height
                .attr("width", "100%")    // 表示サイズの設定
                .attr("height", "100%")   // 表示サイズの設定
            .append("g")
                .attr("transform", "translate(" + w / 2 + "," + h / 2 + ")")
            .selectAll("text")
                .data(words)
            .enter().append("text")
                .style("font-size", function(d:any) { return d.size + "px"; })
                .style("font-family", "Impact")
                .style("fill", function(d:any, i:number) { return d3.schemeCategory10[i % 10]; })
                .attr("text-anchor", "middle")
                .attr("transform", function(d:any) {
                return "translate(" + [d.x, d.y] + ")rotate(" + d.rotate + ")";
                })
            .text(function(d:any) { return d.text; })
            const fabricCanvas = new fabric.Canvas(null, {width: w, height: h})
            fabric.loadSVGFromString(d3n.svgString(), (objects:any, options:any) => {
                fabricCanvas.add(fabric.util.groupSVGElements(objects)).renderAll();
                const buffer = Buffer.from(fabricCanvas.toDataURL().slice("data:image/png;base64,".length), "base64");
                resolve(buffer);
            })
        }))
        .start()
    })
  })
}

//test
async function unfurlKibelaNoteFromUrl(url: string, event: LinkSharedEvent, client: WebClient) {
  console.log(`get kibela note from ${url}`);
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
      query: printGql(kibelaLinkDescriptionQuery),
      variables: {
        path: url
      }
    })
  }).then((res) => res.json()).then(async (json) => {
    if (json.data) {
      const note = json.data.note;
      if(!wordCloudResultCache.get(note.id)){
        await storeWordCloudImage(note.id);
      }
      const folderName = note.folder ? `<https://${kibelaTeam}.kibe.la${note.folder.path}|${note.folder.fullName}>` : "未設定";
      const groups = note.groups.map((g:any)=>`<https://${kibelaTeam}.kibe.la${g.path}|${g.name}>`).join(', ')
      let contributors = note.contributors.nodes.map((c:any) => `<${c.url}|${c.realName}>`).join('/');
      if (note.contributors.totalCount > 5) {
        contributors = `${contributors} +${note.contributors.totalCount-5}人`;
      }
      // const imageUrl = await getWordCloudDataURI(note.content)
      const attachment: MessageAttachment = {
        // color: "#327AC2",
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `Kibela記事 | <${note.url}|*${note.title}*>`,
            },
          },
          {
              type: "image",
              image_url: `https://${serverHostName}/wordcloud/${encodeURI(note.id)}.png`,
              alt_text: "Kibela"
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `*作成者:* <${note.author.url}|${note.author.realName}>`
              },
              {
                type: "mrkdwn",
                text: `*編集者:* ${contributors}`
              },
              {
                type: "mrkdwn",
                text: `*フォルダ:* ${folderName}`
              },
              {
                type: "mrkdwn",
                text: `*グループ:* ${groups}`
              },
              {
                type: "mrkdwn",
                text: `*公開日:* <!date^${Math.floor(Date.parse(note.publishedAt)/1000)}^{date} {time}|${note.publishedAt}>`
              },
              {
                type: "mrkdwn",
                text: `*更新日:* <!date^${Math.floor(Date.parse(note.contentUpdatedAt)/1000)}^{date} {time}|${note.contentUpdatedAt}>`
              },
              {
                type: "mrkdwn",
                text: `*コメント数:* ${note.commentsCount}`
              },
              {
                type: "mrkdwn",
                text: `*イイネ数:* ${note.likers.totalCount}`
              }
            ]
          }
        ]
      };
      console.log(url, JSON.stringify(attachment));
      const unfurls = {
        [url]: attachment
      };
      return unfurls;
    } else {
      console.error(`query error?: ${JSON.stringify(json)}`);
      return {};
    }
  });
}

app.event('link_shared', async({event, client}) => {
  Promise.all(event.links.map(async (link) => unfurlKibelaNoteFromUrl(link.url as string, event, client))).then((values) => {
    const unfurls = values.reduce((old, v) => (Object.assign(old, v)), {});
    values.forEach((v) => unfurls)
    const channel = event.channel;
    const messageTs = event.message_ts;
    const unfurlArgs: ChatUnfurlArguments = {
      channel: channel,
      ts: messageTs,
      unfurls: unfurls
    };
    console.log(JSON.stringify(unfurlArgs));
    client.chat.unfurl(unfurlArgs);
  });
});

async function storeWordCloudImage(noteId: string) {
  if (generatingWordClouds[noteId]) {
    return generatingWordClouds[noteId];
  } else {
    const promise = fetch(kibelaEndpoint, {
      method: "POST",
      redirect: "follow",
      headers: {
        Authorization: `Bearer ${kibelaToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": userAgent
      },
      body: JSON.stringify({
        query: printGql(kibelaContentQuery),
        variables: {
          id: noteId
        }
      })
    }).then((r) => r.json()).then(async (json) => {
      if (json.data) {
        const note = json.data.note;
        const textContent = htmlToText(note.content)
        const pngBuffer = await getWordCloudImage(textContent);
        console.log(`generated ${noteId}: length:${pngBuffer.length}`);
        wordCloudResultCache.set(noteId, pngBuffer);
        const optimized = pngOptimizer.bufferSync(pngBuffer);
        console.log(`optimized ${noteId}: length:${optimized.length}`);
        wordCloudResultCache.set(noteId, optimized);
        delete generatingWordClouds[noteId];
      } else {
        console.error(json);
      }
    });
    generatingWordClouds[noteId] = promise;
    return promise;
  }
}

receiver.router.get('/wordcloud/:noteId.png', (req, res) => {
  const noteId = req.params.noteId;
  console.log("wordcloud", noteId, "LRU:", wordCloudResultCache.length);
  const cached = wordCloudResultCache.get(noteId);
  if (cached) {
    wordCloudResultCache.peek(noteId);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public');
    res.send(cached);
    return;
  } else {
    storeWordCloudImage(noteId);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public');
    res.send(wordCloudResultCache.get(noteId));
  }
});

receiver.app.post('/kibela-webhook', (req, res) => {
  console.log(req.body);
  res.send("");
  const targetResources = ["blog", "wiki"];
  if (!targetResources.includes(req.body.resource_type)) {
    return;
  }
  const path = req.body[req.body.resource_type].url;
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
      query: printGql(kibelaGetIdFromPathQuery),
      variables: {
        path: path
      }
    })
  }).then((r) => r.json()).then(async (json) => {
    if (json.data) {
      const note = json.data.note;
      const noteId = note.id;
      if (req.body.action === "delete") {
        console.log(`Deleting cache for ${noteId}`)
        wordCloudResultCache.delete(noteId);
      } else {
        console.log(`Generating cache for ${noteId}`)
        storeWordCloudImage(noteId);
      }
    } else {
      console.error(json);
    }
  })
});

(async () => {
  // Start your app
  await app.start(process.env.PORT || 3000);
  console.log('⚡️ Bolt app is running!');
})();

