import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import { Client, GatewayIntentBits, ChannelType } from "discord.js";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer } from "ws";
import { WebhookClient } from 'discord.js';
import fetch from 'node-fetch';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(bodyParser.json());

app.use(express.static(path.join(__dirname, "index.html")));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const CATEGORY_ID = process.env.CATEGORY_ID;

// ✅ หน้าแรก
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ✅ API ping ใช้เช็คการเชื่อมต่อ server
app.get("/ping", (req, res) => {
  res.json({ message: "เชื่อมต่อ server สำเร็จ!" });
});

// Store active WebSocket connections and their associated emails
const activeConnections = new Map();
const emailToChannelMap = new Map();

// ✅ API สร้างห้องใหม่จาก email
app.post("/create-channel", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email required" });

    // Check if channel already exists for this email
    if (emailToChannelMap.has(email)) {
      const channelId = emailToChannelMap.get(email);
      const channel = await client.channels.fetch(channelId);
      if (channel) {
        return res.json({
          success: true,
          channelId: channel.id,
          channelName: channel.name,
          exists: true
        });
      }
    }

    // fetch guild
    const guild = await client.guilds.fetch(GUILD_ID);
    if (!guild) return res.status(404).json({ error: "Guild not found" });

    // Find category
    const category = guild.channels.cache.get(CATEGORY_ID);
    if (!category) {
      return res.status(404).json({ error: "Category not found" });
    }

    // Convert email to channel name
    const channelName = email.toLowerCase().replace(/[@.]/g, "-");

    // Create new channel
    const newChannel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: CATEGORY_ID,
      topic: `Chat with ${email}`,
    });

    // Store the mapping
    emailToChannelMap.set(email, newChannel.id);

    // Send welcome message
    const webhook = await newChannel.createWebhook({
      name: 'Horwong School Bot',
      avatar: 'https://hwp.ac.th/wp-content/uploads/2021/08/logo_hwp_y-300x300.png',
    });

    const webhookClient = new WebhookClient({ url: webhook.url });
    await webhookClient.send({
      content: `**${email}** ได้เริ่มแชทใหม่`,
      username: 'Horwong School Bot',
      avatarURL: 'https://hwp.ac.th/wp-content/uploads/2021/08/logo_hwp_y-300x300.png',
    });

    // Delete the webhook after sending the message
    await webhook.delete('Cleanup after welcome message');

    return res.json({
      success: true,
      channelId: newChannel.id,
      channelName: newChannel.name,
      exists: false
    });
  } catch (err) {
    console.error("❌ Error creating channel:", err);
    return res.status(500).json({ error: "Failed to create channel" });
  }
});

// Discord bot login and message handling
client.once("ready", () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
  
  // Set up message handler for Discord messages
  client.on('messageCreate', async (message) => {
    // Ignore messages from bots and messages not in a guild
    if (message.author.bot || !message.guild) return;
    
    // Check if message is in a channel we're managing
    const channelId = message.channelId;
    let email = null;
    
    // Find which email this channel belongs to
    for (const [eml, chId] of emailToChannelMap.entries()) {
      if (chId === channelId) {
        email = eml;
        break;
      }
    }
    
    if (!email) return; // Not one of our managed channels
    
    // Forward message to web client if user is connected
    const connection = Array.from(activeConnections.entries())
      .find(([_, connData]) => connData.email === email);
    
    if (connection) {
      const [ws] = connection;
      try {
        ws.send(JSON.stringify({
          type: 'message',
          sender: message.author.username,
          message: message.content,
          timestamp: new Date().toISOString()
        }));
      } catch (err) {
        console.error('Error sending message to client:', err);
      }
    }
  });
});

client.login(TOKEN);

// Start server
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () =>
  console.log(`🚀 Server running on http://localhost:${PORT}`)
);

// WebSocket server for real-time communication with clients
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  let userEmail = null;
  
  ws.on("message", async (data) => {
    try {
      const msg = JSON.parse(data);
      
      if (msg.type === 'register') {
        // Register the connection with the user's email
        userEmail = msg.email;
        activeConnections.set(ws, { email: userEmail });
        
        // Create or get the channel for this email
        const response = await fetch(`http://localhost:${PORT}/create-channel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: userEmail })
        });
        
        const result = await response.json();
        if (!result.success) {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Failed to create Discord channel'
          }));
        }
        
        return;
      }
      
      if (msg.type === 'message' && userEmail) {
        // Forward message to Discord
        const channelId = emailToChannelMap.get(userEmail);
        if (channelId) {
          const channel = await client.channels.fetch(channelId);
          if (channel) {
            // Create a webhook for this message
            const webhook = await channel.createWebhook({
              name: msg.sender || 'ผู้ใช้งาน',
              avatar: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
            });
            
            const webhookClient = new WebhookClient({ url: webhook.url });
            await webhookClient.send({
              content: msg.message,
              username: msg.sender || 'ผู้ใช้งาน',
              avatarURL: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
            });
            
            // Clean up the webhook
            await webhook.delete('Cleanup after message');
          }
        }
      }
    } catch (err) {
      console.error('Error processing WebSocket message:', err);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Error processing your message'
      }));
    }
  });
  
  ws.on('close', () => {
    if (userEmail) {
      activeConnections.delete(ws);
    }
  });
  
  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
    if (userEmail) {
      activeConnections.delete(ws);
    }
  });
});