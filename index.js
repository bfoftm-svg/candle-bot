// ============================================
// 🕯️ CANDLE VERIFICATION BOT - Render Deploy
// ============================================
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const http = require('http');

// ========== CONFIGURATION ==========
const CONFIG = {
  DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN,
  SIM_WORKFLOW_URL: 'https://api.simstudio.ai/api/workflows/ac90911a-946f-40f3-a737-6a2b8c7e1753/run',
  SIM_API_KEY: process.env.SIM_API_KEY,
  SERVER_ID: '1483182660980314124',
  VERIFICATION_CHANNEL_ID: '1483733393660317697',
  VERIFIED_ROLE_ID: '1483330390918959216',
};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // This requires the toggle in the Developer Portal!
  ],
  partials: [Partials.Message, Partials.Channel],
});

const sessions = new Map();

client.on('ready', () => {
  console.log(`🕯️ Candle Guardian relay online as ${client.user.tag}`);
});

// ========== NEW MEMBER JOINS ==========
client.on('guildMemberAdd', async (member) => {
  if (member.guild.id !== CONFIG.SERVER_ID) return;
  sessions.set(member.id, { messageIds: [], phase: 'waiting' });
  try {
    const channel = await client.channels.fetch(CONFIG.VERIFICATION_CHANNEL_ID);
    const welcomeMsg = await channel.send(
      `🕯️ <@${member.id}> A new soul approaches the flame... **Tag me or say something here to begin your verification!** ✨`
    );
    sessions.get(member.id).messageIds.push(welcomeMsg.id);
  } catch (e) {
    console.error('❌ Failed to send welcome:', e.message);
  }
});

// ========== MESSAGES IN VERIFICATION CHANNEL ==========
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (message.channel.id !== CONFIG.VERIFICATION_CHANNEL_ID) return;

  const userId = message.author.id;
  const username = message.author.username;

  if (!sessions.has(userId)) {
    sessions.set(userId, { messageIds: [], phase: 'waiting' });
  }

  const session = sessions.get(userId);
  if (session.phase === 'done') return;
  session.messageIds.push(message.id);

  const isFirst = session.phase === 'waiting';
  session.phase = 'verifying';

  const content = isFirst
    ? `[NEW_MEMBER_JOINED] User ${username} just joined and wants to be verified. Start verification.`
    : message.content;

  console.log(`💬 ${message.author.tag}: ${message.content}`);

  try {
    const response = await fetch(CONFIG.SIM_WORKFLOW_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.SIM_API_KEY}`,
      },
      body: JSON.stringify({
        userId,
        content,
        serverId: CONFIG.SERVER_ID,
        username,
        event: isFirst ? 'member_join' : 'message',
      }),
    });

    const data = await response.json();
    const botResponse = data?.result?.content || '';
    console.log(`✅ Workflow response: ${botResponse.substring(0, 150)}`);

    // 🔥 THE FIX: Actually send the AI's response back to Discord!
    if (botResponse && !botResponse.includes('DECISION:')) {
      const replyMsg = await message.reply(botResponse);
      session.messageIds.push(replyMsg.id); // Save ID so it can clean it up later
    }

    const toolCalls = data?.result?.toolCalls || [];
    for (const call of toolCalls) {
      if (call?.result?.data?.id) {
        session.messageIds.push(call.result.data.id);
      }
    }

    if (botResponse.includes('DECISION: VERIFY') ||
        botResponse.includes('DECISION: KICK') ||
        botResponse.includes('DECISION: REJECT')) {
      session.phase = 'done';
      console.log(`🏁 Verification complete for ${userId}`);

      setTimeout(async () => {
        try {
          const channel = await client.channels.fetch(CONFIG.VERIFICATION_CHANNEL_ID);
          const msgIds = session.messageIds.filter(id => id);
          if (msgIds.length > 0) {
            await channel.bulkDelete(msgIds).catch(() => {});
          }
        } catch (e) {
          console.error('⚠️ Cleanup error:', e.message);
        }
        sessions.delete(userId);
      }, 10000);
    }
  } catch (error) {
    console.error('❌ Error calling workflow:', error.message);
  }
});

// ========== WEB SERVER ==========
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200);
  res.end('🕯️ Candle Guardian is alive');
}).listen(PORT);

setInterval(async () => {
  try {
    const host = process.env.RENDER_EXTERNAL_HOSTNAME || 'localhost';
    await fetch(`http://${host}:${PORT}`).catch(() => {});
  } catch (e) {}
}, 14 * 60 * 1000);

client.login(CONFIG.DISCORD_BOT_TOKEN);
