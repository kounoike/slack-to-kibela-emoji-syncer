import { App } from '@slack/bolt';

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

app.message(/emoji/, async ({ message, context, say }) => {
  const result = await app.client.emoji.list({token: context.botToken}) as any;
  if (result.ok) {
    for (const k in result.emoji) {
      say(`emojis: ${k}:${result.emoji[k]}`);
    }
  } else {
    console.log(result.error);
  }
});

(async () => {
  // Start your app
  await app.start(process.env.PORT || 3000);
  console.log('⚡️ Bolt app is running!');
})();

