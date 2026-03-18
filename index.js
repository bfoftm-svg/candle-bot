// ============================================
// 🕯️ CANDLE VERIFICATION BOT - Render Deploy
// ============================================
// Ready to paste into your GitHub repo as index.js
// Deploy on Render as a Background Worker (free)
// ============================================

const { Client, GatewayIntentBits, Partials } = require('discord.js');

// ========== CONFIGURATION ==========
const CONFIG = {
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

// Track verification sessions
// { userId: { messageIds: [], phase: 'waiting'|'verifying'|'done' } }
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

  // Post a nudge in verification channel
  try {
    const channel = await client.channels.fetch(CONFIG.VERIFICATION_CHANNEL_ID);
    const welcomeMsg = await channel.send(
      `🕯️ <@${member.id}> A new soul approaches the flame... ` +
      `**Tag me or say something here to begin your verification!** ✨`
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

  // Initialize session if not tracked
  if (!sessions.has(userId)) {
    sessions.set(userId, { messageIds: [], phase: 'waiting' });
  }

  const session = sessions.get(userId);
  if (session.phase === 'done') return;

  // Track message for cleanup
  session.messageIds.push(message.id);

  // First interaction or follow-up?
  const isFirst = session.phase === 'waiting';
  session.phase = 'verifying';

  const content = isFirst
    ? `[NEW_MEMBER_JOINED] User ${username} just joined and wants to be verified. Start verification.`
    : message.content;

  console.log(`💬 ${message.author.tag}: ${message.content}`);

  // Call the Sim workflow
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

    // Track bot messages from tool calls for cleanup
    const toolCalls = data?.result?.toolCalls || [];
    for (const call of toolCalls) {
      if (call?.result?.data?.id) {
        session.messageIds.push(call.result.data.id);
      }
    }

    // Check if verification is complete
    if (botResponse.includes('DECISION: VERIFY') ||
        botResponse.includes('DECISION: KICK') ||
        botResponse.includes('DECISION: REJECT')) {

      session.phase = 'done';
      const decision = botResponse.match(/DECISION: (\w+)/)?.[1];
      console.log(`🏁 Verification complete for ${userId}: ${decision}`);

      // Clean up messages after 10 seconds
      setTimeout(async () => {
        try {
          const channel = await client.channels.fetch(CONFIG.VERIFICATION_CHANNEL_ID);
          const msgIds = session.messageIds.filter(id => id);
          if (msgIds.length > 0) {
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

// ========== KEEP-ALIVE (for Render free tier) ==========
// Render free web services sleep after 15min of no HTTP traffic.
// If you deploy as a "Background Worker" this isn't needed.
// If you deploy as a "Web Service", uncomment below:
//
// const http = require('http');
// http.createServer((req, res) => {
//   res.writeHead(200);
//   res.end('🕯️ Candle Guardian is alive');
// }).listen(process.env.PORT || 3000);

client.login(CONFIG.DISCORD_BOT_TOKEN);

