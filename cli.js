#!/usr/bin/env node
/**
 * Minecraft AFK Bot — Linux CLI Tool
 * Usage: ./minecraft-bot-linux [options]
 *        node cli.js
 */

'use strict';

const mineflayer = require('mineflayer');
const readline   = require('readline');

// ── ANSI colors (no deps) ────────────────────────────────────────────────────
const C = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  cyan:    '\x1b[36m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  red:     '\x1b[31m',
  magenta: '\x1b[35m',
  blue:    '\x1b[34m',
  white:   '\x1b[37m',
  bgDark:  '\x1b[40m',
};

const c = (color, text) => `${C[color]}${text}${C.reset}`;
const bold = (t) => `${C.bold}${t}${C.reset}`;

// ── CLI Args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const argMap = {};
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    argMap[args[i].slice(2)] = args[i + 1] || true;
    i++;
  }
}

// ── State ─────────────────────────────────────────────────────────────────────
let bot = null;
let reconnectTimer = null;
let afkTimer = null;
let isRunning = false;
let totalReconnects = 0;
let connectedAt = null;
let config = {
  host:           argMap.host     || null,
  port:           parseInt(argMap.port || '25565'),
  username:       argMap.username || null,
  version:        argMap.version  || '1.20.1',
  reconnect:      argMap['no-reconnect'] ? false : true,
  reconnectDelay: parseInt(argMap['reconnect-delay'] || '5'),
  antiAfk:        argMap['no-afk'] ? false : true,
};

// ── Print helpers ─────────────────────────────────────────────────────────────
function ts() {
  return c('dim', new Date().toLocaleTimeString('vi-VN'));
}

function log(msg, type = 'info') {
  const prefix = {
    info:    c('cyan',    '[INFO]   '),
    success: c('green',   '[OK]     '),
    error:   c('red',     '[ERROR]  '),
    warn:    c('yellow',  '[WARN]   '),
    afk:     c('magenta', '[AFk]    '),
    chat:    c('blue',    '[CHAT]   '),
    server:  c('white',   '[SERVER] '),
  }[type] || c('white', '[LOG]    ');
  console.log(`${ts()} ${prefix} ${msg}`);
}

function printBanner() {
  console.clear();
  console.log(c('cyan', bold(`
╔══════════════════════════════════════════════════╗
║          ⛏️  Minecraft AFK Bot  v1.0.0           ║
║        Công cụ chống AFK tự động cho Linux       ║
╚══════════════════════════════════════════════════╝`)));
  console.log();
}

function printHelp() {
  console.log(`
${bold('Cách dùng:')}
  ./minecraft-bot-linux --host <server> --username <tên> [options]

${bold('Options:')}
  ${c('cyan','--host')}            <địa chỉ>   IP hoặc domain server (bắt buộc)
  ${c('cyan','--port')}            <port>      Port server (mặc định: 25565)
  ${c('cyan','--username')}        <tên>       Tên bot (bắt buộc)
  ${c('cyan','--version')}         <version>   Phiên bản MC (mặc định: 1.20.1)
  ${c('cyan','--reconnect-delay')} <giây>      Thời gian chờ kết nối lại (mặc định: 5)
  ${c('cyan','--no-reconnect')}                Tắt tự động kết nối lại
  ${c('cyan','--no-afk')}                      Tắt Anti-AFK
  ${c('cyan','--help')}                        Hiện hướng dẫn này

${bold('Ví dụ:')}
  ./minecraft-bot-linux --host play.mineplex.com --username MyBot --version 1.20.1
  ./minecraft-bot-linux --host 192.168.1.10 --port 19132 --username AFKer

${bold('Lệnh trong khi chạy:')}
  ${c('yellow','chat <tin nhắn>')}   Gửi chat vào game
  ${c('yellow','status')}            Xem trạng thái bot
  ${c('yellow','stop')}              Dừng bot
  ${c('yellow','help')}              Xem lệnh
`);
}

function printStatus() {
  const uptime = connectedAt
    ? Math.floor((Date.now() - connectedAt) / 1000)
    : 0;
  const h = Math.floor(uptime/3600), m = Math.floor((uptime%3600)/60), s = uptime%60;
  const up = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;

  console.log(`
${c('cyan','┌─── Trạng thái Bot ───────────────────────────┐')}
│ ${bold('Server   ')} ${config.host}:${config.port}
│ ${bold('Username ')} ${config.username}
│ ${bold('Version  ')} ${config.version}
│ ${bold('Trạng thái')} ${isRunning ? c('green','🟢 Online') : c('red','🔴 Offline')}
│ ${bold('Uptime   ')} ${isRunning ? c('cyan', up) : '—'}
│ ${bold('Kết nối lại')} ${totalReconnects} lần
│ ${bold('Anti-AFK ')} ${config.antiAfk ? c('green','Bật') : c('red','Tắt')}
${c('cyan','└──────────────────────────────────────────────┘')}
`);
}

// ── Anti-AFK ──────────────────────────────────────────────────────────────────
const afkActions = [
  () => {
    const dirs = ['forward', 'back', 'left', 'right'];
    const dir = dirs[Math.floor(Math.random() * dirs.length)];
    bot.setControlState(dir, true);
    setTimeout(() => bot?.setControlState(dir, false), 700);
    log(`Di chuyển ${dir}`, 'afk');
  },
  () => {
    bot.setControlState('jump', true);
    setTimeout(() => bot?.setControlState('jump', false), 200);
    log('Nhảy', 'afk');
  },
  () => {
    const yaw   = (Math.random() - 0.5) * Math.PI * 2;
    const pitch = (Math.random() - 0.5) * Math.PI * 0.5;
    bot.look(yaw, pitch, false);
    log('Xoay đầu', 'afk');
  },
  () => {
    bot.setControlState('sneak', true);
    setTimeout(() => bot?.setControlState('sneak', false), 500);
    log('Cúi người', 'afk');
  },
];

function startAntiAfk() {
  stopAntiAfk();
  if (!config.antiAfk) return;
  const delay = 8000 + Math.random() * 7000;
  afkTimer = setTimeout(() => {
    if (bot && isRunning) {
      afkActions[Math.floor(Math.random() * afkActions.length)]();
    }
    startAntiAfk();
  }, delay);
}

function stopAntiAfk() {
  if (afkTimer) { clearTimeout(afkTimer); afkTimer = null; }
}

// ── Bot ───────────────────────────────────────────────────────────────────────
function createBot() {
  log(`Đang kết nối ${c('cyan', config.host + ':' + config.port)} với tên ${c('green', config.username)}...`);

  try {
    bot = mineflayer.createBot({
      host: config.host,
      port: config.port,
      username: config.username,
      version: config.version,
      auth: 'offline',
    });
  } catch (err) {
    log(`Không thể tạo bot: ${err.message}`, 'error');
    scheduleReconnect();
    return;
  }

  bot.on('login', () => {
    isRunning = true;
    connectedAt = Date.now();
    log(`Đăng nhập thành công! Chào mừng ${c('green', config.username)}`, 'success');
    startAntiAfk();
  });

  bot.on('spawn', () => log('Đã spawn vào thế giới', 'success'));

  bot.on('death', () => {
    log('Bot đã chết, đang respawn...', 'warn');
    setTimeout(() => bot?.respawn().catch(() => {}), 1000);
  });

  bot.on('kicked', (reason) => {
    isRunning = false;
    let r = reason;
    try { r = JSON.parse(reason)?.text || reason; } catch(_) {}
    log(`Bot bị kick: ${r}`, 'error');
    stopAntiAfk();
    scheduleReconnect();
  });

  bot.on('error', (err) => {
    isRunning = false;
    log(`Lỗi: ${err.message} (${err.code || ''})`, 'error');
    stopAntiAfk();
  });

  bot.on('end', (reason) => {
    isRunning = false;
    log(`Kết nối bị đóng: ${reason || 'unknown'}`, 'warn');
    stopAntiAfk();
    scheduleReconnect();
  });

  bot.on('chat', (username, message) => {
    if (username === bot.username) return;
    log(`${c('blue', username)}: ${message}`, 'chat');
  });

  bot.on('message', (msg) => {
    const text = msg.toString().trim();
    if (text) log(text, 'server');
  });
}

function scheduleReconnect() {
  if (!config.reconnect) return;
  totalReconnects++;
  log(`Kết nối lại sau ${config.reconnectDelay}s... (lần ${totalReconnects})`, 'warn');
  reconnectTimer = setTimeout(() => {
    if (!isRunning) createBot();
  }, config.reconnectDelay * 1000);
}

function destroyBot() {
  stopAntiAfk();
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  config.reconnect = false;
  if (bot) { try { bot.quit(); } catch(_) {} bot = null; }
  isRunning = false;
  log('Bot đã dừng.', 'warn');
}

// ── Interactive CLI ───────────────────────────────────────────────────────────
function startREPL() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: '' });

  rl.on('line', (line) => {
    const input = line.trim();
    if (!input) return;

    if (input === 'stop' || input === 'quit' || input === 'exit') {
      destroyBot();
      process.exit(0);
    } else if (input === 'status') {
      printStatus();
    } else if (input === 'help') {
      console.log(`\n  ${c('yellow','chat <msg>')} - Gửi chat | ${c('yellow','status')} - Trạng thái | ${c('yellow','stop')} - Dừng\n`);
    } else if (input.startsWith('chat ')) {
      const msg = input.slice(5).trim();
      if (bot && isRunning) {
        bot.chat(msg);
        log(`Đã gửi: "${msg}"`, 'success');
      } else {
        log('Bot chưa kết nối!', 'error');
      }
    } else {
      log(`Lệnh không hợp lệ. Gõ "help" để xem danh sách lệnh.`, 'warn');
    }
  });

  rl.on('close', () => { destroyBot(); process.exit(0); });
}

// ── Interactive Setup ─────────────────────────────────────────────────────────
async function promptSetup() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise(res => rl.question(q, res));

  console.log(c('cyan', bold('  Thiết lập nhanh (nhấn Enter để dùng giá trị mặc định)\n')));

  config.host     = (await ask(`  ${bold('Server Host')} (vd: play.server.vn): `)).trim() || 'localhost';
  config.port     = parseInt((await ask(`  ${bold('Port')} [25565]: `)).trim() || '25565');
  config.username = (await ask(`  ${bold('Tên Bot')} [AFKBot]: `)).trim() || 'AFKBot';
  config.version  = (await ask(`  ${bold('Phiên bản MC')} [1.20.1]: `)).trim() || '1.20.1';

  const afkInput  = (await ask(`  ${bold('Bật Anti-AFK?')} [Y/n]: `)).trim().toLowerCase();
  config.antiAfk  = afkInput !== 'n' && afkInput !== 'no';

  rl.close();
  console.log();
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  printBanner();

  if (argMap.help || argMap.h) {
    printHelp();
    process.exit(0);
  }

  // If not all required args provided, run interactive setup
  if (!config.host || !config.username) {
    await promptSetup();
  }

  if (!config.host) { log('Cần nhập địa chỉ server!', 'error'); process.exit(1); }
  if (!config.username) { log('Cần nhập tên bot!', 'error'); process.exit(1); }

  log(`Anti-AFK: ${config.antiAfk ? c('green','Bật') : c('red','Tắt')}`, 'info');
  log(`Tự kết nối lại: ${config.reconnect ? c('green','Bật') : c('red','Tắt')}`, 'info');
  console.log();

  createBot();
  startREPL();

  process.on('SIGINT', () => {
    console.log('\n');
    log('Đang thoát...', 'warn');
    destroyBot();
    process.exit(0);
  });

  process.on('SIGTERM', () => { destroyBot(); process.exit(0); });
}

main().catch(err => {
  console.error(c('red', `Lỗi: ${err.message}`));
  process.exit(1);
});
