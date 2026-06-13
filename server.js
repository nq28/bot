const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mineflayer = require('mineflayer');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ─── Bot State ────────────────────────────────────────────────────────────────
let bot = null;
let reconnectTimer = null;
let afkTimer = null;
let statInterval = null;
let isConnecting = false;

let config = {
  host: 'localhost',
  port: 25565,
  username: 'AFKBot',
  version: '1.20.1',
  reconnect: true,
  reconnectDelay: 5,
  antiAfk: true,
  afkActions: {
    walk: true,
    jump: true,
    rotate: true,
    sneak: true,
    swing: false,
    chat: false,
  },
  chatMessage: 'AFK Bot đang hoạt động!',
  chatInterval: 60,
};

let stats = {
  status: 'offline',
  health: 0,
  food: 0,
  position: { x: 0, y: 0, z: 0 },
  ping: 0,
  uptime: 0,
  totalReconnects: 0,
  connectedAt: null,
  logs: [],
};

// ─── Logging ──────────────────────────────────────────────────────────────────
function log(msg, type = 'info') {
  const timestamp = new Date().toLocaleTimeString('vi-VN');
  const entry = { timestamp, msg, type };
  stats.logs.unshift(entry);
  if (stats.logs.length > 200) stats.logs.pop();
  io.emit('log', entry);
  console.log(`[${timestamp}] [${type.toUpperCase()}] ${msg}`);
}

// ─── Anti-AFK Logic ───────────────────────────────────────────────────────────
const afkActions = [
  // Walk forward/back/left/right randomly
  () => {
    if (!config.antiAfk || !config.afkActions.walk) return;
    if (!bot || stats.status !== 'online') return;
    const dirs = ['forward', 'back', 'left', 'right'];
    const dir = dirs[Math.floor(Math.random() * dirs.length)];
    bot.setControlState(dir, true);
    setTimeout(() => bot && bot.setControlState(dir, false), 600 + Math.random() * 800);
    log(`🚶 Anti-AFK: Di chuyển ${dir}`, 'afk');
  },
  // Jump
  () => {
    if (!config.antiAfk || !config.afkActions.jump) return;
    if (!bot || stats.status !== 'online') return;
    bot.setControlState('jump', true);
    setTimeout(() => bot && bot.setControlState('jump', false), 200);
    log('⬆️ Anti-AFK: Nhảy', 'afk');
  },
  // Rotate head
  () => {
    if (!config.antiAfk || !config.afkActions.rotate) return;
    if (!bot || stats.status !== 'online') return;
    const yaw = (Math.random() - 0.5) * Math.PI * 2;
    const pitch = (Math.random() - 0.5) * Math.PI * 0.5;
    bot.look(yaw, pitch, false);
    log('👀 Anti-AFK: Xoay đầu', 'afk');
  },
  // Sneak toggle
  () => {
    if (!config.antiAfk || !config.afkActions.sneak) return;
    if (!bot || stats.status !== 'online') return;
    bot.setControlState('sneak', true);
    setTimeout(() => bot && bot.setControlState('sneak', false), 500);
    log('🦆 Anti-AFK: Núp', 'afk');
  },
  // Swing arm
  () => {
    if (!config.antiAfk || !config.afkActions.swing) return;
    if (!bot || stats.status !== 'online') return;
    bot.swingArm();
    log('👊 Anti-AFK: Vung tay', 'afk');
  },
];

function startAntiAfk() {
  stopAntiAfk();
  if (!config.antiAfk) return;

  const interval = 8000 + Math.random() * 7000; // 8–15s
  afkTimer = setTimeout(() => {
    if (bot && stats.status === 'online') {
      const available = afkActions.filter((_, i) => {
        const keys = ['walk', 'jump', 'rotate', 'sneak', 'swing'];
        return config.afkActions[keys[i]];
      });
      if (available.length > 0) {
        available[Math.floor(Math.random() * available.length)]();
      }
    }
    startAntiAfk();
  }, interval);
}

function stopAntiAfk() {
  if (afkTimer) { clearTimeout(afkTimer); afkTimer = null; }
}

// ─── Stat broadcaster ────────────────────────────────────────────────────────
function startStatBroadcast() {
  if (statInterval) clearInterval(statInterval);
  statInterval = setInterval(() => {
    if (bot && stats.status === 'online') {
      try {
        stats.health = Math.round(bot.health || 0);
        stats.food = Math.round(bot.food || 0);
        if (bot.entity && bot.entity.position) {
          stats.position = {
            x: Math.round(bot.entity.position.x),
            y: Math.round(bot.entity.position.y),
            z: Math.round(bot.entity.position.z),
          };
        }
        stats.ping = bot._client ? (bot._client.latency || 0) : 0;
        stats.uptime = stats.connectedAt
          ? Math.floor((Date.now() - stats.connectedAt) / 1000)
          : 0;
      } catch (_) {}
    }
    io.emit('stats', {
      status: stats.status,
      health: stats.health,
      food: stats.food,
      position: stats.position,
      ping: stats.ping,
      uptime: stats.uptime,
      totalReconnects: stats.totalReconnects,
    });
  }, 1000);
}

// ─── Bot Creation ─────────────────────────────────────────────────────────────
function createBot() {
  if (isConnecting) return;
  isConnecting = true;
  stats.status = 'connecting';
  io.emit('statusChange', 'connecting');
  log(`🔌 Đang kết nối tới ${config.host}:${config.port} với tên ${config.username}...`, 'info');

  try {
    bot = mineflayer.createBot({
      host: config.host,
      port: parseInt(config.port),
      username: config.username,
      version: config.version || false,
      auth: 'offline',
    });
  } catch (err) {
    log(`❌ Không thể tạo bot: ${err.message}`, 'error');
    isConnecting = false;
    scheduleReconnect();
    return;
  }

  bot.on('login', () => {
    isConnecting = false;
    stats.status = 'online';
    stats.connectedAt = Date.now();
    io.emit('statusChange', 'online');
    log(`✅ Bot đã đăng nhập thành công!`, 'success');
    startAntiAfk();
    startStatBroadcast();
  });

  bot.on('spawn', () => {
    log(`🌍 Bot đã spawn vào thế giới`, 'success');
  });

  bot.on('health', () => {
    stats.health = Math.round(bot.health || 0);
    stats.food = Math.round(bot.food || 0);
    if (stats.health <= 0) {
      log('💀 Bot đã chết! Đang chờ respawn...', 'warn');
    }
  });

  bot.on('death', () => {
    log('💀 Bot đã chết, đang respawn...', 'warn');
    setTimeout(() => {
      if (bot) bot.respawn().catch(() => {});
    }, 1000);
  });

  bot.on('kicked', (reason) => {
    isConnecting = false;
    stats.status = 'offline';
    io.emit('statusChange', 'offline');
    let reasonText = reason;
    try { reasonText = JSON.parse(reason)?.text || reason; } catch (_) {}
    log(`⚠️ Bot bị kick: ${reasonText}`, 'error');
    stopAntiAfk();
    scheduleReconnect();
  });

  bot.on('error', (err) => {
    isConnecting = false;
    if (err.code !== 'ECONNREFUSED' && err.code !== 'ETIMEDOUT') {
      log(`❌ Lỗi bot: ${err.message}`, 'error');
    } else {
      log(`❌ Không thể kết nối: ${err.code}`, 'error');
    }
    stats.status = 'offline';
    io.emit('statusChange', 'offline');
    stopAntiAfk();
  });

  bot.on('end', (reason) => {
    isConnecting = false;
    stats.status = 'offline';
    io.emit('statusChange', 'offline');
    log(`🔴 Kết nối bị đóng: ${reason || 'unknown'}`, 'warn');
    stopAntiAfk();
    scheduleReconnect();
  });

  bot.on('chat', (username, message) => {
    if (username === bot.username) return;
    log(`💬 [Chat] ${username}: ${message}`, 'chat');
    io.emit('chat', { username, message });
  });

  bot.on('message', (msg) => {
    const text = msg.toString().trim();
    if (text) {
      log(`📢 [Server] ${text}`, 'server');
    }
  });
}

function scheduleReconnect() {
  if (!config.reconnect) return;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  stats.totalReconnects++;
  const delay = (parseInt(config.reconnectDelay) || 5) * 1000;
  log(`🔄 Tự động kết nối lại sau ${config.reconnectDelay}s... (lần ${stats.totalReconnects})`, 'warn');
  reconnectTimer = setTimeout(() => {
    if (stats.status === 'offline' && !isConnecting) createBot();
  }, delay);
}

function destroyBot() {
  stopAntiAfk();
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (bot) {
    config.reconnect = false; // temporarily disable
    try { bot.quit(); } catch (_) {}
    bot = null;
  }
  isConnecting = false;
  stats.status = 'offline';
  io.emit('statusChange', 'offline');
  log('🛑 Bot đã được dừng lại.', 'info');
}

// ─── REST API ─────────────────────────────────────────────────────────────────
app.get('/api/config', (_, res) => res.json(config));
app.get('/api/stats', (_, res) => res.json({ ...stats, logs: stats.logs.slice(0, 50) }));

app.post('/api/start', (req, res) => {
  if (req.body) Object.assign(config, req.body);
  config.reconnect = true;
  if (stats.status === 'online' || isConnecting) {
    return res.json({ ok: false, message: 'Bot đã đang chạy' });
  }
  createBot();
  res.json({ ok: true, message: 'Đang khởi động bot...' });
});

app.post('/api/stop', (_, res) => {
  config.reconnect = false;
  destroyBot();
  res.json({ ok: true, message: 'Bot đã dừng' });
});

app.post('/api/config', (req, res) => {
  Object.assign(config, req.body);
  log('⚙️ Cấu hình đã được cập nhật', 'info');
  res.json({ ok: true });
});

app.post('/api/chat', (req, res) => {
  const { message } = req.body;
  if (!bot || stats.status !== 'online') {
    return res.json({ ok: false, message: 'Bot chưa kết nối' });
  }
  bot.chat(message);
  log(`📤 [Gửi Chat] ${message}`, 'info');
  res.json({ ok: true });
});

// ─── Socket.IO ────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  socket.emit('statusChange', stats.status);
  socket.emit('stats', {
    status: stats.status,
    health: stats.health,
    food: stats.food,
    position: stats.position,
    ping: stats.ping,
    uptime: stats.uptime,
    totalReconnects: stats.totalReconnects,
  });
  socket.emit('logs', stats.logs.slice(0, 100));
});

// ─── Start Server ─────────────────────────────────────────────────────────────
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════╗`);
  console.log(`║   🎮 Minecraft AFK Bot Dashboard     ║`);
  console.log(`║   http://localhost:${PORT}              ║`);
  console.log(`╚══════════════════════════════════════╝\n`);
});
