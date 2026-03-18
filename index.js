// ============================================
// 🕯️ CANDLE VERIFICATION BOT - Render Deploy
// ============================================
// Deploy on Render as a FREE Web Service
// ============================================

const { Client, GatewayIntentBits, Partials } = require('discord.js');
const http = require('http');

// ========== CONFIGURATION ==========
const CONFIG = {
  // Use Environment Variables on Render! Hardcoding tokens is a security risk.
  DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN || 'MTQ0NTA4MDQyOTI4NjkyMDI5Ng.GnxhwP.jllPBIwHtDjgamnycQyX_T_Ak2dEO0kHtRELRM',
  SIM_WORKFLOW_URL: 'https://api.simstudio.ai/api/workflows/ac90911a-946f-40f3-a737-6a2b8c7e1753/run',
  SIM_API_KEY: process.env.SIM_API_KEY || 'khz7X8xzGvcdQUXd6r8VL',
  SERVER_ID: '1483182660980314124',
  VERIFICATION_CHANNEL_ID: '1483733393660317697',
  VERIFIED_ROLE_ID: '1483330390918959216',
};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel],
});

const sessions = new Map();

client.on('ready', () => {
  console.log(`🕯️ Candle Guardian relay online as ${client.user.tag}`);
  console.log(`📡 Forwarding to: ${CONFIG.SIM_WORKFLOW_URL}`);
  console.log(`🔥 Verification channel: ${CONFIG.VERIFICATION_CHANNEL_ID}`);
});

// ========== NEW MEMBER JOINS ==========
client.on('guildMemberAdd', async (member) => {
  if (member.guild.id !== CONFIG.SERVER_ID) return;
  console.log(`🆕 New member: ${member.user.tag} (${member.id})`);
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
      const decision = botResponse.match(/DECISION: (\w+)/)?.[1];
      console.log(`🏁 Verification complete for ${userId}: ${decision}`);

      setTimeout(async () => {
        try {
          const channel = await client.channels.fetch(CONFIG.VERIFICATION_CHANNEL_ID);
          const msgIds = session.messageIds.filter(id => id);
          if (msgIds.length > 0) {
            // Bulk delete only works for messages under 14 days old
            await channel.bulkDelete(msgIds).catch(() => {
              msgIds.forEach(async (id) => {
                try { await channel.messages.delete(id); } catch(e) {}
              });
            });
            console.log(`🧹 Cleaned up ${msgIds.length} messages for ${userId}`);
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

// ========== WEB SERVER (keeps Render free tier alive) ==========
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200);
  res.end('🕯️ Candle Guardian is alive');
}).listen(PORT, () => {
  console.log(`🌐 Health server running on port ${PORT}`);
});

// FIXED: Added 'async' to the interval callback to allow 'fetch' usage
setInterval(async () => {
  try {
    const host = process.env.RENDER_EXTERNAL_HOSTNAME || 'localhost';
    // If on Render, we just want to hit our own health endpoint
    await fetch(`http://${host}:${PORT}`).catch(() => {});
  } catch (e) {
    // Ignore errors for the self-ping
  }
}, 14 * 60 * 1000);

client.login(CONFIG.DISCORD_BOT_TOKEN);
