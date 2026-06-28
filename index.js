const { Client, GatewayIntentBits, Partials, EmbedBuilder, PermissionsBitField } = require('discord.js');
require('dotenv').config();

const { readStore, withStore, getGuild } = require('./store');

const TOKEN = process.env.DISCORD_TOKEN;
const GLOBAL_PREFIX = (process.env.BOT_PREFIX || '!').trim();
const STATUS_URL = process.env.STATUS_URL || 'https://example.com/status';

if (!TOKEN) {
  console.error('Missing DISCORD_TOKEN in .env');
  process.exit(1);
}

const definitions = [
  { name: 'help', usage: 'help [command]', description: 'Show commands or detailed help.', perms: 'none' },
  { name: 'ping', usage: 'ping', description: 'Check bot latency.', perms: 'none' },
  { name: 'status', usage: 'status', description: 'Show your status page link.', perms: 'none' },
  { name: 'prefix', usage: 'prefix [set|reset] [newPrefix]', description: 'View or change the server prefix.', perms: 'Manage Guild' },
  { name: 'avatar', usage: 'avatar [@user]', description: 'Show a user avatar.', perms: 'none' },
  { name: 'userinfo', usage: 'userinfo [@user]', description: 'Show user details.', perms: 'none' },
  { name: 'serverinfo', usage: 'serverinfo', description: 'Show server details.', perms: 'none' },
  { name: 'roleinfo', usage: 'roleinfo <role>', description: 'Show role details.', perms: 'none' },
  { name: 'channelinfo', usage: 'channelinfo [#channel]', description: 'Show channel details.', perms: 'none' },
  { name: 'membercount', usage: 'membercount', description: 'Show the server member count.', perms: 'none' },
  { name: 'randomhex', usage: 'randomhex', description: 'Generate a random hex color.', perms: 'none' },
  { name: 'color', usage: 'color <hex>', description: 'Preview a color in an embed.', perms: 'none' },
  { name: 'choose', usage: 'choose option1 | option2 | option3', description: 'Pick one choice randomly.', perms: 'none' },
  { name: 'rps', usage: 'rps <rock|paper|scissors>', description: 'Play rock-paper-scissors.', perms: 'none' },
  { name: 'poll', usage: 'poll <question>', description: 'Create a yes/no poll.', perms: 'none' },
  { name: 'say', usage: 'say <text>', description: 'Repeat your message.', perms: 'Manage Messages' },
  { name: 'embed', usage: 'embed <title> | <description> | <hex>', description: 'Send a custom embed.', perms: 'Manage Messages' },
  { name: 'purge', usage: 'purge <1-100>', description: 'Delete recent messages.', perms: 'Manage Messages' },
  { name: 'kick', usage: 'kick <@user> [reason]', description: 'Kick a member.', perms: 'Kick Members' },
  { name: 'ban', usage: 'ban <@user> [reason]', description: 'Ban a member.', perms: 'Ban Members' },
  { name: 'unban', usage: 'unban <userId> [reason]', description: 'Unban a user.', perms: 'Ban Members' },
  { name: 'timeout', usage: 'timeout <@user> <minutes> [reason]', description: 'Timeout a member.', perms: 'Moderate Members' },
  { name: 'untimeout', usage: 'untimeout <@user> [reason]', description: 'Remove a timeout.', perms: 'Moderate Members' },
  { name: 'nick', usage: 'nick <@user> <new nickname>', description: 'Change a nickname.', perms: 'Manage Nicknames' },
  { name: 'lock', usage: 'lock [#channel]', description: 'Lock a channel.', perms: 'Manage Channels' },
  { name: 'unlock', usage: 'unlock [#channel]', description: 'Unlock a channel.', perms: 'Manage Channels' },
  { name: 'slowmode', usage: 'slowmode <seconds> [#channel]', description: 'Set slowmode.', perms: 'Manage Channels' },
  { name: 'roleadd', usage: 'roleadd <@user> <@role>', description: 'Add a role to a member.', perms: 'Manage Roles' },
  { name: 'roleremove', usage: 'roleremove <@user> <@role>', description: 'Remove a role from a member.', perms: 'Manage Roles' },
  { name: 'welcome', usage: 'welcome <set|remove|view|list> ...', description: 'Configure welcome messages.', perms: 'Manage Guild' },
  { name: 'goodbye', usage: 'goodbye <set|remove|view|list> ...', description: 'Configure goodbye messages.', perms: 'Manage Guild' },
  { name: 'autoresponder', usage: 'autoresponder <add|remove|list|clear> ...', description: 'Configure auto replies.', perms: 'Manage Channels' },
  { name: 'sticky', usage: 'sticky <set|remove|view|list> ...', description: 'Configure sticky messages.', perms: 'Manage Guild' },
];

const definitionMap = new Map(definitions.map(d => [d.name, d]));
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember, Partials.User],
});

function parseArgs(input) {
  const out = [];
  const re = /"([^"]+)"|'([^']+)'|`([^`]+)`|(\S+)/g;
  let m;
  while ((m = re.exec(input)) !== null) out.push(m[1] || m[2] || m[3] || m[4]);
  return out;
}

function pickPrefix(guildId) {
  return readStore().guilds?.[guildId]?.prefix || GLOBAL_PREFIX;
}

function makeEmbed(title, description, color = 0x5865F2) {
  return new EmbedBuilder().setTitle(title).setDescription(description).setColor(color);
}

function commandPrefixForMessage(message) {
  return message.guild ? pickPrefix(message.guild.id) : GLOBAL_PREFIX;
}

async function resolveMember(message, token) {
  if (!message.guild || !token) return null;
  const id = token.match(/^<@!?(\d+)>$/)?.[1] || token.match(/^(\d+)$/)?.[1];
  if (!id) return null;
  return message.guild.members.cache.get(id) || await message.guild.members.fetch(id).catch(() => null);
}

function resolveRole(message, token) {
  if (!message.guild || !token) return null;
  const id = token.match(/^<@&(\d+)>$/)?.[1] || token.match(/^(\d+)$/)?.[1];
  if (id) return message.guild.roles.cache.get(id) || null;
  return message.guild.roles.cache.find(r => r.name.toLowerCase() === token.toLowerCase()) || null;
}

function resolveChannel(message, token) {
  if (!message.guild || !token) return null;
  const id = token.match(/^<#(\d+)>$/)?.[1] || token.match(/^(\d+)$/)?.[1];
  if (id) return message.guild.channels.cache.get(id) || null;
  return null;
}

function hasPerm(member, permName) {
  if (!permName || permName === 'none') return true;
  const p = member?.permissions;
  if (!p) return false;
  const map = {
    'Manage Guild': PermissionsBitField.Flags.ManageGuild,
    'Manage Channels': PermissionsBitField.Flags.ManageChannels,
    'Manage Messages': PermissionsBitField.Flags.ManageMessages,
    'Kick Members': PermissionsBitField.Flags.KickMembers,
    'Ban Members': PermissionsBitField.Flags.BanMembers,
    'Moderate Members': PermissionsBitField.Flags.ModerateMembers,
    'Manage Nicknames': PermissionsBitField.Flags.ManageNicknames,
    'Manage Roles': PermissionsBitField.Flags.ManageRoles,
  };
  return p.has(map[permName] || 0);
}

function formatTemplate(text, member, guild) {
  return String(text)
    .replaceAll('{user}', member ? `<@${member.id}>` : 'user')
    .replaceAll('{server}', guild ? guild.name : 'server')
    .replaceAll('{membercount}', guild ? String(guild.memberCount) : '0');
}

async function postSticky(channel, guildId) {
  const sticky = readStore().guilds?.[guildId]?.sticky;
  if (!sticky?.channelId || !sticky?.message) return;
  if (sticky.channelId !== channel.id) return;

  if (sticky.lastMessageId) {
    const old = await channel.messages.fetch(sticky.lastMessageId).catch(() => null);
    if (old) await old.delete().catch(() => {});
  }

  const sent = await channel.send(sticky.message).catch(() => null);
  if (sent) {
    withStore(data => {
      const g = getGuild(data, guildId);
      g.sticky = { ...g.sticky, lastMessageId: sent.id };
    });
  }
}

client.once('ready', () => console.log(`Logged in as ${client.user.tag}`));

client.on('messageCreate', async (message) => {
  try {
    if (!message.guild || message.author.bot) return;

    const guildCfg = readStore().guilds?.[message.guild.id] || { autoresponders: [], sticky: {} };

    const responder = (guildCfg.autoresponders || []).find(a => a.trigger.toLowerCase() === message.content.toLowerCase());
    if (responder) {
      await message.reply(formatTemplate(responder.response, message.member, message.guild)).catch(() => {});
    }

    if (guildCfg.sticky?.channelId === message.channel.id) {
      await postSticky(message.channel, message.guild.id);
    }

    const prefix = commandPrefixForMessage(message);
    if (!message.content.startsWith(prefix)) return;

    const raw = message.content.slice(prefix.length).trim();
    if (!raw) return;

    const [commandName, ...restParts] = parseArgs(raw);
    const command = commandName?.toLowerCase();
    if (!command) return;

    const args = restParts;
    const rest = args.join(' ');
    const meta = definitionMap.get(command);
    if (!meta) return;

    if (!hasPerm(message.member, meta.perms)) {
      return message.reply(`You need **${meta.perms}** to use this command.`);
    }

    switch (command) {
      case 'ping':
        return message.reply(`Pong: **${client.ws.ping}ms**`);

      case 'help': {
        const target = (args.join(' ') || '').toLowerCase();
        if (!target) {
          const lines = definitions.map(d => `• \`${prefix}${d.usage}\` — ${d.description}`).join('\n');
          return message.reply({ embeds: [makeEmbed('Help', lines)] });
        }
        const found = definitionMap.get(target);
        if (!found) return message.reply('Command not found.');
        return message.reply({ embeds: [makeEmbed(found.name, [`Usage: \`${prefix}${found.usage}\``, `Permissions: ${found.perms}`, '', found.description].join('\n'))] });
      }

      case 'status':
        return message.reply(`Status: ${STATUS_URL}`);

      case 'prefix': {
        const sub = (args[0] || '').toLowerCase();
        if (!sub) return message.reply(`Current prefix: \`${prefix}\``);
        if (sub === 'reset') {
          withStore(data => { getGuild(data, message.guild.id).prefix = null; });
          return message.reply(`Prefix reset to \`${GLOBAL_PREFIX}\``);
        }
        if (sub === 'set') {
          const newPrefix = args[1];
          if (!newPrefix) return message.reply(`Usage: \`${prefix}prefix set <newPrefix>\``);
          withStore(data => { getGuild(data, message.guild.id).prefix = newPrefix; });
          return message.reply(`Prefix set to \`${newPrefix}\``);
        }
        return message.reply(`Usage: \`${prefix}prefix [set|reset] [newPrefix]\``);
      }

      case 'avatar': {
        const member = await resolveMember(message, args[0]) || message.member;
        return message.reply(member.user.displayAvatarURL({ size: 1024 }));
      }

      case 'userinfo': {
        const member = await resolveMember(message, args[0]) || message.member;
        const user = member.user;
        const embed = makeEmbed(user.tag, [
          `ID: ${user.id}`,
          `Bot: ${user.bot ? 'yes' : 'no'}`,
          `Created: ${user.createdAt.toDateString()}`,
          `Joined: ${member.joinedAt ? member.joinedAt.toDateString() : 'unknown'}`,
        ].join('\n')).setThumbnail(user.displayAvatarURL({ size: 256 }));
        return message.reply({ embeds: [embed] });
      }

      case 'serverinfo': {
        const g = message.guild;
        const embed = makeEmbed(g.name, [
          `ID: ${g.id}`,
          `Members: ${g.memberCount}`,
          `Owner: <@${g.ownerId}>`,
          `Created: ${g.createdAt.toDateString()}`,
        ].join('\n')).setThumbnail(g.iconURL({ size: 256 }) || null);
        return message.reply({ embeds: [embed] });
      }

      case 'roleinfo': {
        const role = resolveRole(message, args[0]);
        if (!role) return message.reply('Role not found.');
        const embed = makeEmbed(role.name, [
          `ID: ${role.id}`,
          `Members: ${role.members.size}`,
          `Color: ${role.hexColor}`,
          `Hoisted: ${role.hoist}`,
          `Mentionable: ${role.mentionable}`,
        ].join('\n'));
        return message.reply({ embeds: [embed] });
      }

      case 'channelinfo': {
        const channel = resolveChannel(message, args[0]) || message.channel;
        const embed = makeEmbed(`#${channel.name || 'channel'}`, [
          `ID: ${channel.id}`,
          `Type: ${channel.type}`,
          `Created: ${channel.createdAt ? channel.createdAt.toDateString() : 'unknown'}`,
        ].join('\n'));
        return message.reply({ embeds: [embed] });
      }

      case 'membercount':
        return message.reply(`Member count: **${message.guild.memberCount}**`);

      case 'randomhex': {
        const hex = Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0');
        return message.reply({ embeds: [makeEmbed(`Random Hex #${hex}`, 'Here you go.', `#${hex}`)] });
      }

      case 'color': {
        const hex = (args[0] || '').replace('#', '');
        if (!/^[0-9a-fA-F]{6}$/.test(hex)) return message.reply(`Usage: \`${prefix}color <hex>\``);
        return message.reply({ embeds: [makeEmbed(`Color #${hex.toUpperCase()}`, 'Preview', `#${hex}`)] });
      }

      case 'choose': {
        const options = rest.split('|').map(s => s.trim()).filter(Boolean);
        if (options.length < 2) return message.reply(`Usage: \`${prefix}choose option1 | option2 | option3\``);
        return message.reply(`I choose: **${options[Math.floor(Math.random() * options.length)]}**`);
      }

      case 'rps': {
        const choice = (args[0] || '').toLowerCase();
        const valid = ['rock', 'paper', 'scissors'];
        if (!valid.includes(choice)) return message.reply(`Use \`${prefix}rps rock\`, \`${prefix}rps paper\`, or \`${prefix}rps scissors\`.`);
        const bot = valid[Math.floor(Math.random() * 3)];
        const tie = choice === bot;
        const win = (choice === 'rock' && bot === 'scissors') || (choice === 'paper' && bot === 'rock') || (choice === 'scissors' && bot === 'paper');
        return message.reply(`You chose **${choice}**, I chose **${bot}**. ${tie ? 'Tie.' : win ? 'You win.' : 'I win.'}`);
      }

      case 'poll': {
        const question = rest;
        if (!question) return message.reply(`Usage: \`${prefix}poll <question>\``);
        const sent = await message.channel.send({ embeds: [makeEmbed('Poll', question)] });
        await sent.react('👍').catch(() => {});
        await sent.react('👎').catch(() => {});
        return;
      }

      case 'say': {
        const text = rest;
        if (!text) return message.reply(`Usage: \`${prefix}say <text>\``);
        await message.delete().catch(() => {});
        return message.channel.send(text);
      }

      case 'embed': {
        const [title, description, hex] = rest.split('|').map(s => s.trim());
        if (!title || !description) return message.reply(`Usage: \`${prefix}embed <title> | <description> | <hex>\``);
        const color = /^[0-9a-fA-F]{6}$/.test((hex || '').replace('#', '')) ? `#${hex.replace('#', '')}` : 0x5865F2;
        return message.channel.send({ embeds: [makeEmbed(title, description, color)] });
      }

      case 'purge': {
        const count = Number(args[0]);
        if (!Number.isInteger(count) || count < 1 || count > 100) return message.reply(`Usage: \`${prefix}purge <1-100>\``);
        const deleted = await message.channel.bulkDelete(count, true).catch(() => null);
        return message.channel.send(`Deleted **${deleted?.size || 0}** messages.`).then(m => setTimeout(() => m.delete().catch(() => {}), 4000));
      }

      case 'kick': {
        const member = await resolveMember(message, args[0]);
        if (!member) return message.reply(`Usage: \`${prefix}kick <@user> [reason]\``);
        await member.kick(args.slice(1).join(' ') || 'No reason provided');
        return message.reply(`Kicked **${member.user.tag}**.`);
      }

      case 'ban': {
        const member = await resolveMember(message, args[0]);
        if (!member) return message.reply(`Usage: \`${prefix}ban <@user> [reason]\``);
        await member.ban({ reason: args.slice(1).join(' ') || 'No reason provided' });
        return message.reply(`Banned **${member.user.tag}**.`);
      }

      case 'unban': {
        const userId = args[0]?.match(/^(\d+)$/)?.[1];
        if (!userId) return message.reply(`Usage: \`${prefix}unban <userId> [reason]\``);
        await message.guild.members.unban(userId, args.slice(1).join(' ') || 'No reason provided');
        return message.reply(`Unbanned **${userId}**.`);
      }

      case 'timeout': {
        const member = await resolveMember(message, args[0]);
        const minutes = Number(args[1]);
        if (!member || !Number.isFinite(minutes) || minutes <= 0) return message.reply(`Usage: \`${prefix}timeout <@user> <minutes> [reason]\``);
        await member.timeout(minutes * 60_000, args.slice(2).join(' ') || 'No reason provided');
        return message.reply(`Timed out **${member.user.tag}** for ${minutes} minute(s).`);
      }

      case 'untimeout': {
        const member = await resolveMember(message, args[0]);
        if (!member) return message.reply(`Usage: \`${prefix}untimeout <@user> [reason]\``);
        await member.timeout(null, args.slice(1).join(' ') || 'No reason provided');
        return message.reply(`Removed timeout from **${member.user.tag}**.`);
      }

      case 'nick': {
        const member = await resolveMember(message, args[0]);
        const nick = args.slice(1).join(' ');
        if (!member || !nick) return message.reply(`Usage: \`${prefix}nick <@user> <new nickname>\``);
        await member.setNickname(nick);
        return message.reply(`Changed nickname for **${member.user.tag}**.`);
      }

      case 'lock':
      case 'unlock': {
        const channel = resolveChannel(message, args[0]) || message.channel;
        const allow = command === 'unlock';
        await channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: allow });
        return message.reply(`${allow ? 'Unlocked' : 'Locked'} ${channel}.`);
      }

      case 'slowmode': {
        const seconds = Number(args[0]);
        const channel = resolveChannel(message, args[1]) || message.channel;
        if (!Number.isInteger(seconds) || seconds < 0 || seconds > 21600) return message.reply(`Usage: \`${prefix}slowmode <0-21600> [#channel]\``);
        await channel.setRateLimitPerUser(seconds);
        return message.reply(`Set slowmode in ${channel} to **${seconds}s**.`);
      }

      case 'roleadd':
      case 'roleremove': {
        const member = await resolveMember(message, args[0]);
        const role = resolveRole(message, args[1]);
        if (!member || !role) return message.reply(`Usage: \`${prefix}${command} <@user> <@role>\``);
        if (command === 'roleadd') await member.roles.add(role);
        else await member.roles.remove(role);
        return message.reply(`${command === 'roleadd' ? 'Added' : 'Removed'} **${role.name}** ${command === 'roleadd' ? 'to' : 'from'} **${member.user.tag}**.`);
      }

      case 'welcome':
      case 'goodbye': {
        const sub = (args[0] || '').toLowerCase();
        if (!sub || sub === 'view') {
          const value = readStore().guilds?.[message.guild.id]?.[command];
          if (!value) return message.reply(`No ${command} message set.`);
          return message.reply(value.channelId ? `<#${value.channelId}>: ${value.message}` : value.message);
        }
        if (sub === 'list') {
          const value = readStore().guilds?.[message.guild.id]?.[command];
          return message.reply(value ? `Set in <#${value.channelId}>` : `No ${command} message set.`);
        }
        if (sub === 'remove') {
          withStore(data => { getGuild(data, message.guild.id)[command] = null; });
          return message.reply(`${command} message removed.`);
        }
        if (sub === 'set') {
          const channel = resolveChannel(message, args[1]);
          const msgText = args.slice(2).join(' ');
          if (!channel || !msgText) return message.reply(`Usage: \`${prefix}${command} set #channel message\``);
          withStore(data => { getGuild(data, message.guild.id)[command] = { channelId: channel.id, message: msgText }; });
          return message.reply(`${command} message saved.`);
        }
        return message.reply(`Usage: \`${prefix}${command} <set|remove|view|list>\``);
      }

      case 'autoresponder': {
        const sub = (args[0] || '').toLowerCase();
        if (sub === 'list') {
          const list = readStore().guilds?.[message.guild.id]?.autoresponders || [];
          if (!list.length) return message.reply('No autoresponders set.');
          return message.reply(list.map(x => `• **${x.trigger}** → ${x.response}`).join('\n'));
        }
        if (sub === 'clear') {
          withStore(data => { getGuild(data, message.guild.id).autoresponders = []; });
          return message.reply('Cleared all autoresponders.');
        }
        if (sub === 'remove') {
          const trigger = args.slice(1).join(' ').trim();
          if (!trigger) return message.reply(`Usage: \`${prefix}autoresponder remove <trigger>\``);
          withStore(data => {
            const g = getGuild(data, message.guild.id);
            g.autoresponders = g.autoresponders.filter(a => a.trigger.toLowerCase() !== trigger.toLowerCase());
          });
          return message.reply('Removed autoresponder if it existed.');
        }
        if (sub === 'add') {
          const joined = args.slice(1).join(' ');
          const split = joined.split('=>');
          if (split.length < 2) return message.reply(`Usage: \`${prefix}autoresponder add trigger => response\``);
          const trigger = split[0].trim();
          const response = split.slice(1).join('=>').trim();
          if (!trigger || !response) return message.reply(`Usage: \`${prefix}autoresponder add trigger => response\``);
          withStore(data => {
            const g = getGuild(data, message.guild.id);
            g.autoresponders = g.autoresponders.filter(a => a.trigger.toLowerCase() !== trigger.toLowerCase());
            g.autoresponders.push({ trigger, response });
          });
          return message.reply('Autoresponder saved.');
        }
        return message.reply(`Usage: \`${prefix}autoresponder <add|remove|list|clear>\``);
      }

      case 'sticky': {
        const sub = (args[0] || '').toLowerCase();
        if (sub === 'list') {
          const sticky = readStore().guilds?.[message.guild.id]?.sticky;
          if (!sticky?.channelId) return message.reply('No sticky message set.');
          return message.reply(`Sticky set in <#${sticky.channelId}>`);
        }
        if (sub === 'view') {
          const channel = resolveChannel(message, args[1]) || message.channel;
          const sticky = readStore().guilds?.[message.guild.id]?.sticky;
          if (!sticky?.channelId || sticky.channelId !== channel.id) return message.reply('No sticky message for that channel.');
          return message.reply(sticky.message);
        }
        if (sub === 'remove') {
          const channel = resolveChannel(message, args[1]) || message.channel;
          withStore(data => {
            const g = getGuild(data, message.guild.id);
            if (g.sticky?.channelId === channel.id) g.sticky = {};
          });
          return message.reply(`Sticky message removed for ${channel}.`);
        }
        if (sub === 'set') {
          const channel = resolveChannel(message, args[1]);
          const stickyText = args.slice(2).join(' ');
          if (!channel || !stickyText) return message.reply(`Usage: \`${prefix}sticky set #channel message\``);
          withStore(data => { getGuild(data, message.guild.id).sticky = { channelId: channel.id, message: stickyText, lastMessageId: null }; });
          return message.reply(`Sticky message saved for ${channel}.`);
        }
        return message.reply(`Usage: \`${prefix}sticky <set|remove|view|list>\``);
      }
    }
  } catch (err) {
    console.error(err);
    if (message?.channel) message.reply('That command failed. Check my permissions and the command syntax.').catch(() => {});
  }
});

client.on('guildMemberAdd', async (member) => {
  const g = readStore().guilds?.[member.guild.id];
  if (!g?.welcome?.channelId || !g?.welcome?.message) return;
  const channel = member.guild.channels.cache.get(g.welcome.channelId);
  if (!channel) return;
  channel.send(formatTemplate(g.welcome.message, member, member.guild)).catch(() => {});
});

client.on('guildMemberRemove', async (member) => {
  const g = readStore().guilds?.[member.guild.id];
  if (!g?.goodbye?.channelId || !g?.goodbye?.message) return;
  const channel = member.guild.channels.cache.get(g.goodbye.channelId);
  if (!channel) return;
  channel.send(formatTemplate(g.goodbye.message, member, member.guild)).catch(() => {});
});

client.login(TOKEN);
