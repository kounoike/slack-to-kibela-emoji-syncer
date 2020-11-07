import { App } from '@slack/bolt';
import { LinkUnfurls, MessageAttachment } from '@slack/types';
import fetch from "node-fetch";
import gql from "graphql-tag";
import { print as printGql } from "graphql/language/printer"
import { ChatUnfurlArguments } from '@slack/web-api';
const imageDataURI = require("image-data-uri");

const emojiChannel = process.env.EMOJI_CHANNEL || "#emoji";
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
          as_user: false,
          icon_url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAgAElEQVR4Xu1dBZRV1ff+pudNvxnABgUJERVQkBKVlJCWDkFaSpQUJAQFARFBQkFK6Q4JSUVQVFRKf3YSE2+667++c71vbry4782bcea/Zq/lcjHv3nNP7HPOjm/v7ZWfn58PByT97AUvL0dPGfuNTUn/5cPLywve3sbe8/RT7MOFb7Nx5ESmaLp1swDUre3nkTF6uq/p6fnYtT8Dv/6eiyAT0LdHEG6p4LmJ83LEANnZwO9/5iA2Lh+1avogNMT9D2dm5uOHH3Nw+rMspKbl4647fNDiCX+UL+cNHx8PcJcLM3/+62y07BSHpGSJ98NCvfDxnijUf9jPhVaK/lEy6lvLUzFpZjKys6W+Nn7UD/u2RCLS7P5aKHtulwHy8oCtu9IxeHQi0tLz0bNLIFYvjUBwsOuLlZEBvLsuDS+/moSU1IIDp1oVH6xZFoGG9f2KjQk4kb2fi8eOfdLul+mZjoHYtMYMX9+iX1ijX0hKykONejG4fjPP+kpgALBvsxktmwUabcbhc3YZICY2Dy06xuHilRzRQFSkN47tjUTtB1zbJbm5wOYd6XhuVCKy/uViZY+q3+uLfVvMqHZv8cw8d/2T7eNw4bts1cTUfcgPJ/dHIizMMzvLE6tz5fts1GoYq2tq+cIwjBgc7IlPwC4DnP86C091jUd8gsR9/n7A/q2RaNUswKUP//FXLtp3j8fl79UTLjdCOeCl0SGYMy0Efn6uny4udQZAQmKeYIBvL0mMLVPtB3xx8kAUIsJLDgNcvJyDh5rE6Ia4ZF4YxgwvYgZYuioV46YkgVcBKTjIC4d2mPFYI+MMkJubj7dXpmHSzCRQnrBH5ghvfLTdjEcf8S9yQey/YgBefRkZ+UIINkqXr+agWYc43eOvvhyKYQODjDYjnuPVRllHK2/ZPAFycoCnusbh+Oks60furuiDE/ujcE8lH0Mf5kC/vZiDTn0s+PPvXKfvdGgTgHUrIkBmKEoqbgbgPFz5PgfHT2ciJtY1Bvjnei7Wb07TTccTTfzRqL7xjcgGTKZ8NKgXAL6rlHNsMsBPv+Tg4cdjkZxSwK5UlXZ9YIbJBCQlQ5wMEeH21cPEpHwMHZOAbXsyVAPw9/cSnBgbVyDY8AH+bcWb4ejVzVSkp4DEABZ8e0l9JFG2OXkg0uNXQJwlD0PGJGL3AfU8FCWT22u7yj0+2LQ6AvUf9rc+YmUA7vqff80R6sWWnekYOzlJ1c7CV8MwflQwfvw5B9v3ZCArKx9dO5rwUC298Eaup+A3akKSVYaQG6tZ3Rddng7EgrdTkFlwwIifH6njhw/ejUD1qs4FQurFFJK0bTib2JSUPMyanyrUWyVVussHMyeHIMRFVTfAH7j/Pl9Uvtt2n0+fyUSHXglISlYzvLN+FtXvg/sHiY0mnwJWBuDiz3g9Rejn585n4ZOzBasTHuaNL45HodJdvnj+pURs2JImToCuHQKxYWUEAgPVwtt3l3MwcGQCvrmo3mW+vl5C2Bv2bBB6DkrA0ZOZujtx+KAgzJ8VJk4Ee/Tr7zmYPT8Vn57LRFqaC5cqpJMrLj4P1E6U5OMDRJm9XTZOBQV5oUkDf8ycEmrzelyzIR1Dxia4dPcX1eKz3fp1/XF8fyRC/lXnrQyw8v1UjJ6YBD9faeLTMwomtm3LAOzdbMa589l4qqtF2AVIgQFeuHi2HKpWKeB+Hu0UHj/clq4bR/26ftizKRK33eqNA4cz0W9YgpDKlUQZ4K3XQ9GvZ5DNq4CC5ZwFKZg5L6Uo58nltnl6TJsQohOy3l6ZqjtNXW7cgy9otR3BANwVT/e04KOjauMIv+vnB6xYFI7+vYIwZlIiVr6vFkp4Msh3Cq+RN99JEQuklB/YDq2IyxaEoX8vkxgOF37A8ETsO6S/Gx+o6YtVb0WgQT29eTY1NR9tulnw6TnN/eHBSXKnqcca+uPQjkidoaxUMEBCQj6q1ImGJV5/T91+qw8+3hMpjuRWnS34/seCu5PGoYuflcftt3mLI5WWw8kzk/DXP/p2WjfzxwfvmVEuSpLyKSecPpONbgMsoKCkpXatArB8UTgq3qXWOmjIeaJdLL65qL7D3Vk0T75T50FfnDpYTnd12WKAgAAv1K7lW6TCLsf282+5OmHb5gnwx5+5uOehaJv3FKX/HRvNOH4qE70HJ1iPf36gXw8T1i6PAO/PM+eyMPLFRFy6ql8YMs+O9Wa0eDJANWjaBl5+NVmcGto7mddL726BePO1MIQrjDP0KXR/NsHmyeHJBXW1rQ5tArFtXQS4uEqyxQCUsz58T5q3oiJusPlvpWL/YfUJa5MB/v4nF/c8GI0cG+r6e0vCMbCvCX0GSyqdbMigYWjL+xFo/1QgbkbnosfABJz5PMumcDVuRDDmTg/VTQ4HT62icx8Lrv5P/3EKKpPGhWDyCyFWqZXf338oE72ei1cxY1FNpJF2g0xeQr3q0DZQt6ttMQC1nCufly9yBhj+QqLwwSjJJgPQ5Xhf/Wj88Zf6KC4f5Y3vPiuHhMR8NGwZC+r2Mt1fw1d40CjQ0WM14ZUkUAbQ0gM1/bBjQ4RdW39OTr4QGIeOTbLpK6hRzReHd5qFBiITvYnbdqUL3dpVNdDIgvIZykVfXshSjZl/p1v8oVp+qFBeusqoBnZuH4juXUzCWqqlUsEA3FWjJyRh+Zo04auXiWrR1fPlQbPwnIVqqXvMsGAsmhsqdnzHXhYcOaEXyniMr10ehm4dTaAKaI8oMI6fmoT3P5DUSyWZAr1wYJsZzZqqLV9U/25E5+qeN7rAzp5LSQX6DI7H1f+puTo0xAvrV0TggfslhqQv49YKPqA6aIscMQCfd8U07KzPyt95vRg+Afjip2cz0bF3gspww0ZGDAoSNgHZKyhxvRfOHSsHCj72vGvcKaOGBGHOtDC7k6Ps8NUfctCxtwW//6m+CtgOJ7xfT0l7KC5iP+g00van8t0+wmlU8U5jF7g9Blg6P0zYXZTucU+OrXVzf1y7kYtN2w3IAPxwSko+OveJx7HTalWQx1pWNqyABD5LwfDAtkhxL9PCRdOq1r3K56jT01xshHiS3IjOExZGJRE5tG451VDjDPDPtVyc+TxbnE5tWgbAHGGsD8rvfvJZFto+YxHgFSXR6HN4lxnBQcZ8Fus3pWPg82pD0J23+yAkGPjxl6I7wbhu3DxaBmvwiB+O7Y2yqqsqX8DHJ7PQpmsccp1YLSve4QM/fy8M6GXCi6OC0WdIAvYcLBpbNwUsegofb2LM+cGTpGs/C/65Lg2iSUN/IaC56uZdsIRInCTdEf3CSF59YYZVuK+/ldBH8QkSI3FRKpTzQUxc0S2+ow334qgQvDE7BN7e0qZQMQB3TLvuFhw5rjcIqXel9C9eEbMmh8LPH5j4SrL4m4zz097lRk4B+Rl/P5460oRRZeKRS0eGEXrx5SQsXp5qXTgKabs/jBQngVHivfzYU7H47Au9D5uCL6FsRolq65hJSVZpvFoVX7RqHoBl76YabcLt5yiA85r+YFu6kJUevJ+7P1LA8GTSeQNPnclC++76o09+gcc/wR3yDqNasWm1GU+0syDWkodRQ0w4/3UOPv/KPUudny+wbkU4Fi5Nx7eXskCo1oZVev3a1qxw4eo8FgP6IpQ08rlgvLMozPBE/vlXLqo9HINMzXVEofjXixUc+insfYSOK85ZkwYB+PRchgDbFDU1rOePTw9H4etvs5CcnI/GDfx1fhsdA1CoIwPYMrXyXjm+LxIjxidaLXEUhrhDeaf99EsuGtTzF+7PtR/q/dhGBsyjmpZH7vhLV3JEp10xmDRsEadjvop3euP78xUMCaPs44o1acKopaVnOpqwbX2EkWE4fIYYySat4/Dt5SyPaAH2Ttvn+pkEjtMR2cQD0JXbd2iCSsXi3dW7m0mANnoMtGDXfumaCAuVsIL16hZgBc9+kYVOveMRn5jn0gB5fTz5WAC2rjUbFh61g5s2JxmvLUrRfffwjki0buH8GuCR3a1/PA4cUV+DZEIKo4Rle4IIEqEVVEYmu9MmVXY636iqapmAajf726e7Y+HZJgNEx+SiRr1YlUpI/Xfv5kg8+Zi/6DgnmcQPbX0/Al06qFGqZKJ1m9J0lkFHA6Xbed7MMFStYuy+t9XWsVNZ6NDTovJm8rnn+gVh1VvhTk8Tqn3NO1hAl7OSeG8e3xuJB+53DRTrzsIafYcOtflvpWDB26m6eebJfHR3pFNshY4B6G7dtD0T/Yer7ygCOTatiRDWrr0HM/HS9ALACDFqdIWWBCIItdnTcSKQQkm0KJ7cH4Vbb3Gsvu37KEOYtTMy1eofT7gjuyKLHLJmdA65+EtWpGHmPEn4VpK/P/D84GDMnxXqFGhrZQDi5f/3Uy7+vpYr3LmffaEW4ugVfKSOL27G5OHX33IRo4B0desYiO3rzUb7XqTPZWYCPQbGY+9HarWUjLtzoxmtm9u/Bsj8g54n4EWPZXhptDShsvpUpINw0jhN8ms/SAOvO62dgraZ5k0DxGY1EjxiZYAvvsrG6AmJ+PIbB/BdOx2rWd0P330W5dDcW5wTtn5TGgaNStTdi86ugV9+y0GD5nFCm1ESzdEn9kcKAfe/JGo5XPD3N6Zh0oxk3SnFvtV50A8bV0UImJoREgxA6xuPPXeNORQEf75QHuX/dZAY+XBRPhMdk4dHnojFX/+orwFiEc4cjrJ5L9IGMm9xithVWmr8qL9gAAJa/wtKTMoDBevEJOD6jRzMXZSqw1BQSK9yty/mzQwV8pjRWE7BAHQHV38kplDu1VMHIsV9ExfvGkbP3oRyqu+8wwe17vNx62QZMzEJy94rMAjJ35k6PgSzpobqQsBuRuehbTcLLuhwjMDi18IwaqhnAjFcZSDGEry3Pg2vv5miChHTtnPbLd5iXEMGuKalCAZg0GbNR2NcUtm0HejZNRB//5NnKAbAyCRQJbyvui/GDA0W6ptRjpbbPnUmE516J4C7R0k1qvoK6NbdmviG7XvSMXBkou5Ovf1WbyFN33/ffyP9Uy5r0TEWf1+zb5+nr2PS2FCMHh4Ems5dIcEAhGTVrB+D6NiSAV1WDqDVkwHYvsHssvWN8Lane1hw9rxapqEn8/UZoRg3MtjKVHRHd+tnwdGTeutl5/YB2LjK7FZQrCsLYe/Zj45moFOfBJUzTvksDWejhgZh8rhgBAcbc1Ap37eCQsdPTcQ7q9NsgjqULzBC6OHa/ggIyBfqoFYK9cSglW3Qc3bqoHFfgPxuXl4+lq5KwwtT9Q6d6lV9cGiHFOVEweqDrWkCkKJV/Wj82b7OjM5Pux+JS+2KjiBqGO7Qjr0Zwpdgjxi1PW1CKCLNxnY+wbkhIQXPWrUASsCbd2SAdyETEHBi3lmdKv6tJOL2Rw8NFgYVmoSv/JADIof4/6Ig9oX6O68DV+nadSkQ9Mdf9H2jV48wNaKdnhkQr1N7+a1G9f1xaCdPH9d3Ft+ncP3W8jRcvJLtNnDll99zwUBde0T3NB1mRokGrfHPh6BSRWlMKkMQfcd0GoSHeSE5JU9YxLQLS1144tgQMSBKprQL+Hh7oe/Q+CI5DWiAoqn5tluND1I5GfMp2c9N1p1sFcp544P3IoS/YdqcJKRrvNmMw2cEzbN9XBOqlN/evT8Dw15IBEPtSwoRtDp2WDDmzw7VMwD/wp1PgYs2Zu6ey9+rd4/MAMTy0ejChBFZWQDdsCvXpjq9QlyZCELKZk+V7mvGJ7hDjHhq0y1ehL0piWNkTgBLfD5++0N/QjA24fDOKAF5d4d49Pcbmoitu/VGJXfa8+Q7vFYJSg0L8yo4AQjo3LglXYRrTXspGLdU8LHLAONGhOClaUn44accTH4hWOD1qHN/812OFdHD+5TRO7xalESU0CsTQ8BOOCMy18O1fVGhvPNn7bXFhZi3OBUzXkuG0VuYWIk3XwvFqKGM9HHWS9u/E7PYoqMF5750zy3u3leNvUUN6/eLFXDXnT4FDEDvVNd+8fj1j1y0fCIAq5eGiUAQWyfAvZV98eyIRHFNtG8dgM3vm0WsGa8FCl8k3q3NOxRkGJG7Jh3pUShfzrnQwlh2V9U/W1NAOabdMxZ8rckKYm+6Hm/sL8zGDHxxl0TwbL8EHDhSNEgpd/vF92gipuHObPYuYIBtuzPQe3C88Crxnjh9MAqDRyfoGICWpus38rBkpYRooZPl1IEoXeaq3/6QQJV0ziiJcYYMM9cGUBCTSPhUuSgv1KjGnEGFGaL+3V37MjBgRCJSUh3fx/RIbl4T4RKCyFZPeZUSkPnsiATkuKkBeHYGpNa4oYYwQnhxuEBvWYVALQiCkvfoiYk2T4A//8oTGgKJqhQBIQyvVpI2E5f8G9PBvDE7VLWzGWzasVc8rv6QLRiD3kVnfmxXJ4cxhcQ4ODN3E/Pw3tvhhsEjjvrBa2DuwmSs/TDdJbe4sk3OjS3kME9cV40+bJfu7JWLw3FvZWm9rAzwBkGQMwr0zfMnymHQ8/oTgEIgbe2LlkkMcNstZAC935nBHoz+1eLet6+LQLdOapACA07JbHJgyd0VGZDiHvTK3oIwDG3YuASxGI5oxqQQTJ8Y6rETiHYSnm7uEjWJETbQScsWhINeWFeJwjSNRzJ208oAXHwyAYlC0KVz5YSDyJYMwN00+w0JEEIHC7Nr1aqpFtPHTU6yXhNyJ9nuT99UALH1MtFA0m9YokgoIROPqYPbXANyOpoIaimTZyaLU0sLO9e+R/Vv0rhQvPwSk1a5Or2ef54RUD0GJegapsevbw/jUHl7PbMyANO4MTKHRPDj+RNR6Nib2b30aqAPM3tNl7xmtBmcPCAFicjEXV/vyVhxpyuJSJ+rX1RQOWLIAIw73LpbLSyNHR6Mt+YZB3LaG+A/1/JE6DtTwhiNwiED0gO4Y4PZo1k53WGP7bsz0H2gHkDqcQZg4gcZDs4dSrepPS3gztt80GeoxJW8h47ujkLjBgXbhVL33Q/cRIYGXU6OZce19OobKXjlNbUbtlF9PxF7aC/kytFkEitH4CWTXBEcIie0cHUBCIPbssaMZo/r0bSutuXu88XGAHWbMuZe2rE0kBD+ZM8QVOs+X7TrLnElfeR7N5nxlAJwefBIBtr3UHMtd9WKRREYNkh/bH3+ZRYat7ZYVUi2SyakD8AVMyffo/uUmTWnz0nCph0F0cy2FsBIDAP7TXv73FfCQM+gVntxd2GNvlcsDEBjyX31Y/DLb5LK1rypP7asNdtlANqfG7cuyF+35X0zenSRBBIesy++nIjFy9WwcEKyDu+MFJE6MtFuQIvijZt5IiEibQcy0f5OeLjR/L1E8167kQcy39TZzFDiWN1j4ku6eHnPf3cpRxcDoF0gSt2vzwhD21b+uOM2n2JjhGJhAGLMKtW6aQ2FHtTXJBI12TsB2rYMxAONCjJYvvtWGIY8KwEmGGrevocFJz5RW8A4aTxV7rjdB5b4XAGHTksDbtzMFcke1m9WS+fceWuWRojcBI6IO55h7Ty9KMgayUnIa4vRPUxDExAAjByfKGDgRgI177zdG/NnhQsLJVVfbYIsozvb6HPFwgBM6VLx/pvWPk17KRRjRwTZZYAenU24+8Fo6/OL5kgp5GgFZFs0gWpt7zzKp08MAT10B46k46tvnHsPB/UNwppl4Tbnijv++x9zcelKFl5dkArmNjRCtIIxm8eKN8Osi0cVkeHptNsbddxQj6ZJm9rP/TX8QCRuUdDWXRnoOaiIhUC6Gx9tXnCkv7MwDN07m+wyABfm9hrRVpACYVbtnwoQOYYYHTR9brKh3eRswmhlZA4irTrGa+bA4QyMfzkJP//qPAspv8P7nmigLh1MmDo+GCYNcobq4cKlqSJHIgMttClr7PWV+Ii354eL8XvCbK39ztoP0jFoVBGrgXsOZKBzX4nLOFGUfJ9s6m+XAYg5r1I7WriChczweIDwqGmx+M4W2NnvvKevfFHBarWSn2dKmoYt40BzsxEiqpcpUplgWSms2nqXuRDeXJqCY6elugZGiNbQcx/THO6e/ZqnDgNRpege9TcPfZyJ1Rv0YXYeVQOXrJASQ5M4WQe3mYXJ0J4MwBBjOlfkihtGJsndZ9avMKN/L7XFi/g9JopyRmRmpqNv8USAyDNk1LVrseSJjChHT2SKrGhGIp0ZF+GOZY7mYvpVqAbbSrFjb4wMyO3VzXVLoLY9YQh65900jJooBUPSA8YQKAprjvAAtBksX50mcuQwPUxhU6Hy+OR/2skeMiAYKxeHqTJ4rlqbJtKf2CO2Q5RSu9YBYsd37WBy2bTLfuw9mCGEw4NHMhEdm+vQkESZYvgg15HDBORSZmJiaFdo18bCQdXkbwkG+P5/OWjTNR5/XcsBEx6SmzmJthjgjVlhmDCWAh+svn7mFODd7wpxd9Ljx4V6rJE/7q7oi59/ycHO/WqLIFXOQzsLUpvyG0QiNXkqzuaC0DLZqZ0JdR/yFWgeRylnjfSXjL1hsyS00pGkRRmzDc7VmcPl0OhR123Hp89kicSXysysRvr18e5IkXavsGQ1BRMMQhWKkSVMpkCdnAkZlbmB+DFmDR3+XAFMivfkM/3jceiY/aQSYrHFgnuhZg1fME0JIV4MY2K2LQackgG+/iYL9ZurF5b4ARqElEkNqEK26hSHL76WDFdcALpxuz4diAdr+Yqj+Pbb3LuP7U0oXeAEaNKkvHNfhjjxZNPyow/74eieKLeYjczcuovFJaGZ4710trzh6B9HTGK3Ykh6OtD2mTgwYYT1uPACPt4dheaKDBmcBN6VI19MAgNMhI/ZS3ITU46g5M1dycXmb1WrSFkrlAsqt08nU4160SoMPNPQHt1tFguspMPHMjFlVjKu38hF/55BqFbVB081DxDBJEVJ9C0cOpaBH3/KFTGETJP32iuhbuMHiKRq1t6CnzXIKUdjeLi2n9gUcsLnwozXLgPwiF/2bgpemJpsvZfJ6Qe3R+qQMnyW9yRj6uS7/NYK3qCKROiXK4Wmps5OxhtLpMyhZBhiAinAaQEitF5+cjZbqJ7UQozCogszWcp3+V36GhiUQQSRu+VuqH5SlmKKnewcx1oH56NyJV+Rno9JKT1BdhmAjdPvz0oXElDUC5Xu8kajR4vI4vHvaHgN8VgkUzESt0lDP0P4QU9Mxn/VBpnp45OZyMvzUuVp1PaHm6tclA+aNvLzmCnaIQP8VxNS9t3im4EyBii+uS6RXypjgBK5LMXXqTIGKL65LpFfKmOAErksxdepMgYovrkukV8qY4AiXhZaEJl0Wk47z0weH22PFBZRR0Q7yNTZSXhrheQJpCX1jdnMVOJ+sKqt75UxQBEzwKKlUjENJSLZEdBF7g6TXjO0jhnUZaLlj0Gd2jpKhRlCGQMUZvYMvNu0TZwu7e4dt3njl29vEXA0e8RQNsLBtcCUVYvDMdTFusGOulnGAAYWsTCPsASvtpaClHS6vMPEE+s+TMPA5/Uub08n5SxjgMKsroF3WX/h8HE1QJYgFdZicgQxZ2HNLv3iVbmBaAr+4N1w9H7Gc3JAGQMYWMTCPMKMnqzIKsPLGEfBqCcGyDoiwuuYtZ05GOSkHYyVYNQ2wTqeojIG8NRM2mknJjYXU2al4LvLxPzlCyj5glfDnRbAoDOMyKdN29NFZBOh7CMHB4nq6p6kMgbw5GzaaYsuX3o5CT9nFm+j7nHufAJGma6HmVWY6NrTyOMyBigGBijJnyhjgJK8OsXQtzIGKIZJLsmfKGOAkrw6xdA3QwzACF7G2xOHR2IcnMlUkGbEk/1koATj/liKJjhYgoXZI2b+SEujqdQLgYFMbiVB1wpD/DbHSomdTXGcHG8hmy1Ml4r0XYcMQGj4yU8ywfh9QrHlMmqMHmJqmDYtAwXC12jMPKOQmTWEa8ocBExUKBN/YyDkxcvZSEvPA2sHElQ6oHeQQN4qiRE0n57NwkcfZ4pIYzJAcBBQ+wE/EftntFqp3CbNrawRROMLs5oxSjg3N0/A2BnWXvFOXxH7V+UeX12aeWerw2QVMbH5Ak6enQOw6DZVQSMMRWZkmlmG4DF+gpB9T9cssMkA5P4z53JEypivvskSMXjsvJwDkOhUU6A3mE2T8f40bGgXSTsxZKZZ85JFiXkOnkhaRgszDwBj/WbPT8HBo1m4dkMKxRJY/1BvdGwXiDnTQq3t84RY9l4adu5Nx6Wr2aKsLYmoYZa1ITSc+X2MwsPjE/Lw3ro0AX+nyZb9ZOVUuYg2T6LwUC/UechP9Jm1lCMijOcPJIycYV9kADIay+ER6eysogdVRhaXZIV0BqNwnp7tYwJD9wt7yinXRscA7CQjZBkv+N2Vgsyf9jideP02Lf2x+LVwhwWZGDvAdC1yEgjCuHdsiBQnyOQZyaK6pa1gTBpAWJBqynjmJ87HO++xeEIqrt9kOLj+uOfzz/Y2Ycn8cKe7lWjcKTOTRX4C7jJHOYTkcLNO7QMxc3IBQzo7AQj5njA9yZqmhvERwweasHSB43p+DHdnlpUff5bC3vn9ypV8RNqcexRJtpx939nvOgb47PMsUfhRNkE6a4C/M0nCgJ6BWDQ33K6R45W5ySLgUp5kDmj21BCUL+cj6t/YCrmSvy2Vj40URa2YodxZEoiIMC/s2RSJx5vYh7DzmJ84PQkbt6a7FJXDK4EpY5YtjBByhzN6qos+iJa5BRjZ4yi5BKuXdRtAX0DBFzhnUiHtIvIFMIsmK4gzu4eRiFjl4Jl4galiWj5pe9KHjUu01s+V32OMwbXrOfj9T8fpXDhwXjMMUzv5qRSn4IyGDQzCOwvt1wncsiMdI19KUtVGdNam/Dv98ryWRg8LVgWt2nrfXW8gq44/O1IfAc1NwzyGniLrCcBJ5bE/eVaykMK1FGX2EUIb70Zm2NZGA3OR2rQIwL4tkTYjcQePTsSajeo4d0rtlOSNLKg53FsEUGqLOtibCIZPMccQTcmTVKkAAAwcSURBVKhaomn18bZxIvTb1rd5jTBfIFPI2wvavK+aDw5ul4pOOCJl8i35ucgIb/x2yXEiTHuJIaZPCMHsl4uAATgpjPk/f0Gd24/ZORiiPXSASSQX5oQxqdOE6Yk487k69x61g1MHmdhJfwrYYgB5QpiOjUUMWJzx+OkMvLvOtjwgP898Q1NflOL9t+zIwK4DGbqSKnyG10bVKmroFfvPapvT5jD8TM3oDHXv2z0IA/sGITTUCykpeSIQlJlMtanmeJczNQ6TTvy/YACGYzFMWVvLtlO7QKxeGi5i4GSdnNfD5avZ6Njboju+J40LFtm0tGqOPQZg+PaapeFo2ypQqDjccVNmJonyNbaIsYZM5lyvrlRUmhU0+w9L0EUns93j+8qJYpdKouDHUPjzF9Q+eqqy82aE4bn+JgSZJPuDVKePWkI6Jr6SJLQDJbE8+5cnoxyqwaXmBGBljSmzk1VHIku5X/iknC4NLCeBTMDESnLWcOu9Xp/RvJE6YdAeA7DM2dI3wlSTSDwcs5DZkkPenCvtOmWwKEPb+w9X35dML7Nvs75g9LeXJKwdGUFJzAy6f6vZ5pXBa6r7s/pqpLRnMFF208b2hc1SwwBMBqEMBefksG7Akd2Rdo0WrDbaoEWsaiLtJXi0xQC+PsDFs+V19YBYiaRK7Zv457p6kehKvfJ5OYSEqO91ln15sHFB2jqpQ/ki11GPrmr/OYWrgc/rk1ivWhyBoQPt+9qZEYUV0bUyCMvnMIG2PSoVDJCUlIcqdaIRG6e+Exe/xnIt9otCp6YBlR+8qSo3R6GLqeYfekB99NpiADLLD18yC5hen6/bNAbfXFSnfmvdLBCHd+lrFNPSdnv1G8jRJClhnsFB/dSLOmxcEt5dJyXFlolC308XyjtMKsGq4twk/L+Smj/uLxJb27OGlgoGYJ7++xuodzLr6/FIbOkgDQnvyDqPxeC7ywULxTo/H21nljE15NUWA1Sv6itgzraKQzzRzoLTn6mzjrDYBPMTaIl1/yo/GINYi3px3p4fJlQ1mdjfh5kS95Ja0KVZ+qtT5RyaZ/kN5vLRVvCqdZ+fEDZpGrdFpYIBWJxQzv0rD4IWPqpRzLXjiFhZ7PRn6iwim1fz6FVbSVxlAJZx1aadsccAvDIqPxSNazfUDLBknlpKpxm5Su0Y3IhWPzeglwnrVji2zNEh1nNQgtAKlES7PuUAe+pgqWAAqjm0sCmJDEDhrHIlx3bvF6clW3P1yO/zPW2tXVcZgCopnT1Kss8A0sJqM21pGYBROnfVvKmT5mnanTHZ/lUnJIp8YMzEROGHUJJULyEKtWra3iilggFmz0/GjNelAhAyUY1jZQkKao6IahgdRUqiOjXpBbV+XBIYgNnQWCNZS8z0OXqYc/MqzdmvLlDPE/MfndgfJbybpfYKYF4eVqf2FNFMSo+ckkoCA3x1IRv1mqllHfZx9dvheK6/cwZgeXkmplISzcJ00DSoV4oZgPr84uVqydhdZqCreMm8cF0QY0lggDPnsvBYm4KcyPIY31/mPCs5n2XyKjqulETrJ7OgM9dhqT0BWARSLgLl7sLL7zH6lYkmGzdQT0hJYIBz57PQqJWeAWiJHNTP+QlgiwGkiimRuvHK81EqZIDpcyRXrZJo676vmp9LJVuIymnW1B9jR4ToctiVBAagFZBqq5ZYRo3eQ2c0Z0GKyISuJPoxju+LEn6MUnsCvPlOCl58WT+wRXPDVBW+nE0QUSvM7Gkr8KEkMAArolStG63zAL4xKxQTxjrWAjh2Hv88BZREw9eJ/ZECjlZqGYBVQ4nWUZLkTInCI3Vcz39rayJKAgPEWfJQqVa0Dnk0/vlgkNkdEdXAIWMSsGajurIJE2LSDsDaBqWWAb74MgsNW1lUSQrpmdu1MQLtWhuAvTg7GgCUBAYgzoG1kbR1Btq2ChDmXEfEd1ndVJsin3WUyQAsJVNqGYAZQXk0Kl3BtAPMmhIqgJueoJLAANzFbbrF4YgmXJtWvMvnyjuUd4iXaPZ0HC5dVRs9Hqnjj2N79bmMS5UQSDNng+ZxuuraDR7xF3ZuTxRGKgkMwEVhGXm56qm8SHQdM/lyw/r23bqsLNayc5yuplDPLiZsfDfCLgC1VGgBnAgmK164tAC0yb9Rx92wMgJdOwYawrE7OilKCgN8dDQTXfvF69y6Y4YFYeGcMLtJnxe+nYops5N0VT2WLwrHCEX6fO0clBoGIGy7S994nYDUsJ4f1q+IQNV7HTuFnF0TJYUBmHiBDqzf/1Qf5bwGdm6UYOpaIt6gSz9WQlM7kWgGvvBJeYeaUqlhAObdb9nJgis/qCeGwiCrdrAyGM2dLOUqw714dVBu4PFItC6zX91tByRZUhiAdQZZ1ZzFH5REl3Sj+v4C3CFH4DAUjkjkyTOTBFhGi1Dq3S0Q61fy+LcfjlZqGIABIfQHMIpFi5QlYOOW8l4CuXNrBdYA8EZcPNHBefjr71xR4IH+ctbn2bwm3GY8X0lhAC76idOZYK1krROLxi9iDlkHMDQESEsHLn+fDRZ1UOLz2QZtHjs3mkUBSkdUahiAgyAiqEXHWBXAQzk4ThDj5Zi0MC9fwgWScWR0Lb2Hv10sL7yIWipJDMCMHewPo5G0zM7TjTvayysf+fleorStLeg4Q9BYXpfXwP8bBhC745NM9ByYgJg4x8EatgbNcK/fLhLvrmeA4S8kYNVatRGlRjVi/CrYDK6gPMK4OCU90ykQ29bpIWFc0Kp1Y3QRQyyAOXKwbdg2XcNP97Dgl99dK3bF/tDfQQcQq4Y6C/J09wRgoaoBI2icUzPY6zOkCiqeIhuxgfn4cBtrACUYLpwod+aJxv44cSDK5qS8vVKqTajcTV2eDhTHqC2S7O6sZShNACf69VdCMcnO4Ft1jsPHJwuQSYS07dFUNdd+5/CxDPQenID4BAOhRv++XC7SGxtWmUU8pBFylwFYTYwpZpXxCDyVjuwqZzf6ykh/tM/YDQ+nVkA38U+/8v6zfQzKC8PFoVOEcWud2ttG1rI+Xttucfjjbymen0cn8f2tm9tOl/ndpWwRHCnDvBgfeGCr2SZEnf1gjT9CwymLENNPQW7/FrPDgFW+d+pMJkZPSBKxkLzObB334lrwASpV9BFBsLQcyqXnnU26uwwQZ8lH5z4WnD0vZRfj1ftkE38c2Bbp0TrFDvMDXLuei6270rF5Rzqu38wXQZRyiDhDlP398hEe7o3bbvEB8f3dOwfaRcdSXmBdHOrTDLagxtC/l8luvDsXY/+hDCxZmQYf73yMGxksgkfsTTxxgas3pIIxAiwZ98qkUNTWIJPtLRbHuXpDOnbtzxDVzDMypfBwjpHha9z1jApmaLjRsHP5W3UeixWh4UoyEhrG57lpZs5LFupntXt98erUEFSpXDh13PAJoHyQWTioP7Pytyw5c5eZIySpmTUAbSF7ne2OkvY7Q9d//DlbCMPySRAV6YXq9/rBbHY98wiZ+P5HY/C/f0O85fEaSRVbXHNjKEVMcXXm/9t3aHOgj4VqspIYt/jzN47Dw4trLsoYoAhnmk42Vlnn1akkR/EQRdgdm02XMUARzjjzGDVtq4eg0el09mhUEX7ZeNNlDGB8rlx6ksc/4WMLl+rBtn17mLBxleNAFJc+VoiHyxigEJOnfZXqck6OlwhRY6qdaXOSQRiakqhSLng1FC+O8pwxpzBDKGOAwsye4l0mczr/dbYot/vTrzmioDaRR1q7gikQIn9Rq2aFL/3uia6XMYAHZpEhZ/QYss4yDTiO0tjQ7UyspbPUMh7olqEmyhjA0DTZf4g7nHn9x05OAn0SjoiGpf49A7HizXCYTK7bFQrZ1TItoCgmkMaevkPisWWX2nGl/RbvfiaJXLc8wm4QSVH0z1mbZSeAsxly8rsRBqD5msmqprwQgt7PBNqFnRWyK269XsYAbk1bwUu8ApavTsXYycm6rGNEU5nDvdCsaYAo9cKoKaPVQgrZLcOvlzGA4amy/yCdSQwbT0wskAF45Fe8yxuNHw1A9ao+IvG1rVQ4Hvh8oZooY4BCTZ/0Mk8BJqfQpnVl4GhUpHeJdpSVMYAHGKA0N1HGAKV59TzQ9zIG8MAkluYmyhigNK+eB/pexgAemMTS3MT/AZ6jRNoI6KJgAAAAAElFTkSuQmCC",
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
    console.log(JSON.stringify(error));
  }
});

//test
async function getKibelaNoteUnfurlFromUrl(url: string): Promise<[string, MessageAttachment]|[]> {
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
      const folderName = note.folder ? `<https://${kibelaTeam}.kibe.la${note.folder.path}|${note.folder.fullName}>` : "未設定";
      const groups = note.groups.map((g:any)=>`<https://${kibelaTeam}.kibe.la${g.path}|${g.name}>`).join(', ')
      let contributors = note.contributors.nodes.map((c:any) => `<${c.url}|${c.realName}>`).join('/');
      if (note.contributors.totalCount > 5) {
        contributors = `${contributors} +${note.contributors.totalCount-5}人`;
      }
      const attachment: MessageAttachment = {
        color: "#327AC2",
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `<${note.url}|*${note.title}*>\n\n${note.summary}`,
            },
            accessory: {
              type: "image",
              image_url: "https://kibe.la/favicon.ico",
              alt_text: "Kibela"
            }
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
      console.log(url, attachment);
      return [url, attachment];
    } else {
      console.log(`query error?: ${JSON.stringify(json)}`);
      return [];
    }
  });
}

app.event('link_shared', async({event, client}) => {
  const channel = event.channel;
  const messageTs = event.message_ts;
  Promise.all(event.links.map(async (link) => getKibelaNoteUnfurlFromUrl(link.url as string))).then(values => {
    console.log(values);
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

