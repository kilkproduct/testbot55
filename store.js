const fs = require('fs');
const path = require('path');

const storePath = path.join(__dirname, '..', 'data', 'store.json');

const defaultStore = { guilds: {} };

function ensureFile() {
  if (!fs.existsSync(storePath)) {
    fs.writeFileSync(storePath, JSON.stringify(defaultStore, null, 2));
  }
}

function readStore() {
  ensureFile();
  try {
    const raw = fs.readFileSync(storePath, 'utf8');
    const data = JSON.parse(raw);
    if (!data.guilds) data.guilds = {};
    return data;
  } catch {
    return JSON.parse(JSON.stringify(defaultStore));
  }
}

function writeStore(data) {
  fs.writeFileSync(storePath, JSON.stringify(data, null, 2));
}

function withStore(mutator) {
  const data = readStore();
  const result = mutator(data);
  writeStore(data);
  return result;
}

function getGuild(data, guildId) {
  if (!data.guilds[guildId]) {
    data.guilds[guildId] = {
      prefix: null,
      welcome: null,
      goodbye: null,
      autoresponders: [],
      sticky: {}
    };
  }
  const g = data.guilds[guildId];
  if (!Array.isArray(g.autoresponders)) g.autoresponders = [];
  if (!g.sticky || typeof g.sticky !== 'object') g.sticky = {};
  return g;
}

module.exports = { storePath, readStore, writeStore, withStore, getGuild, defaultStore };
