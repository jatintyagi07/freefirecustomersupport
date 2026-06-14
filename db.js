const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_FILE = path.join(__dirname, 'data.json');

function load() {
  if (!fs.existsSync(DATA_FILE)) return { users: {}, messages: [] };
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return { users: {}, messages: [] }; }
}

function save(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function getOrCreateUser(userId, name) {
  const data = load();
  if (!userId) userId = uuidv4();
  if (!data.users[userId]) {
    data.users[userId] = { id: userId, name: name || 'Guest', created_at: Date.now() };
    save(data);
  } else if (name && name !== data.users[userId].name) {
    data.users[userId].name = name;
    save(data);
  }
  return data.users[userId];
}

function getRoomList() {
  const data = load();
  return Object.values(data.users).map(u => {
    const msgs = data.messages.filter(m => m.room_id === u.id);
    const last = msgs[msgs.length - 1] || null;
    return {
      id: u.id,
      name: u.name,
      lastMessage: last ? (last.type === 'text' ? last.content : `[${last.type}]`) : 'No messages yet',
      lastTime: last ? last.created_at : u.created_at,
      lastSender: last ? last.sender : null
    };
  }).sort((a, b) => b.lastTime - a.lastTime);
}

function getHistory(roomId) {
  const data = load();
  return data.messages.filter(m => m.room_id === roomId);
}

function insertMessage(roomId, sender, type, content) {
  const data = load();
  const msg = { id: Date.now() + Math.random(), room_id: roomId, sender, type, content, created_at: Date.now() };
  data.messages.push(msg);
  save(data);
  return msg;
}

function deleteRoom(roomId) {
  const data = load();
  delete data.users[roomId];
  data.messages = data.messages.filter(m => m.room_id !== roomId);
  save(data);
}

module.exports = { getOrCreateUser, getRoomList, getHistory, insertMessage, deleteRoom };
