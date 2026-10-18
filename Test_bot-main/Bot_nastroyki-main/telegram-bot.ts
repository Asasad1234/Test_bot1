// Using Node.js native global fetch for reliability across container environments (Render/Docker/Node 18+)
const tgFetch = globalThis.fetch;

import {
  CANONICAL_BOT_TEMPLATES,
  formatBotTemplate,
  markdownToTelegramHtml,
} from './src/utils/bot-templates';

export interface TelegramBotManagerOptions {
  getBots: () => any[];
  getStore: () => any;
  saveStore: () => void;
  ensureUserRepoFile: (user: any, format: 'happ' | 'incy') => Promise<{ filePath: string; rawUrl: string; finalUrl: string }>;
  resolveUserDisplayKey: (user: any) => Promise<string>;
  applyDisconnectStub: (user: any, reason: string, sourceNum?: 1 | 2 | 3) => Promise<void>;
  restoreUserNodes: (user: any) => Promise<void>;
  permanentlyDeleteUser: (user: any) => Promise<void>;
  parseNodeStats: (content: string) => { total: number; types?: any };
  resolveSecondDeviceRemoved?: (user: any) => Promise<{ success: boolean; message: string }>;
}

interface ActivePollingBot {
  id: string;
  token: string;
  abortController: AbortController;
  pollingPromise?: Promise<void>;
}

function escapeHtml(text: string): string {
  return (text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatIssueTime(bot: any): { time: string; tz: string } {
  const tz = bot.timeZone && bot.timeZone !== 'device' ? bot.timeZone : 'Europe/Moscow';
  try {
    const time = new Date().toLocaleTimeString('ru-RU', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const tzLabel = tz === 'Europe/Moscow' ? 'МСК, UTC+3' : tz;
    return { time, tz: tzLabel };
  } catch {
    return { time: new Date().toLocaleTimeString('ru-RU'), tz: 'местное' };
  }
}

export class TelegramBotManager {
  private activeBots: Map<string, ActivePollingBot> = new Map();
  private options: TelegramBotManagerOptions;
  private isShuttingDown = false;
  private periodicInterval: any = null;

  constructor(options: TelegramBotManagerOptions) {
    this.options = options;
  }

  public async start() {
    this.isShuttingDown = false;
    const bots = this.options.getBots();
    for (const bot of bots) {
      if (bot.enabled && bot.token && bot.token.trim()) {
        this.startBotPolling(bot);
      }
    }

    // Start background subscriber audit interval (every 60s)
    if (!this.periodicInterval) {
      this.periodicInterval = setInterval(() => {
        this.runPeriodicAudit();
      }, 60000);
    }
  }

  public async reload() {
    // Stop all running pollings
    for (const [id, active] of this.activeBots.entries()) {
      try {
        active.abortController.abort();
      } catch {}
    }
    this.activeBots.clear();
    await this.start();
  }

  public stop() {
    this.isShuttingDown = true;
    if (this.periodicInterval) {
      clearInterval(this.periodicInterval);
      this.periodicInterval = null;
    }
    for (const [id, active] of this.activeBots.entries()) {
      try {
        active.abortController.abort();
      } catch {}
    }
    this.activeBots.clear();
  }

  public async sendDirectTelegramMessage(botToken: string, chatId: number, text: string, replyMarkup?: any): Promise<boolean> {
    try {
      let formattedText = markdownToTelegramHtml(text);
      const payload: any = {
        chat_id: chatId,
        text: formattedText,
        parse_mode: 'HTML',
      };
      if (replyMarkup) {
        payload.reply_markup = replyMarkup;
      }
      let res = await this.tgApi(botToken, 'sendMessage', payload);
      // Fallback to plain text if HTML entity parsing failed
      if (!res?.ok && res?.description?.toLowerCase().includes('entity')) {
        payload.text = text;
        delete payload.parse_mode;
        res = await this.tgApi(botToken, 'sendMessage', payload);
      }
      return Boolean(res?.ok);
    } catch (err: any) {
      console.warn(`[sendDirectTelegramMessage] Failed to send to ${chatId}:`, err.message);
      return false;
    }
  }

  public async sendBroadcastItem(
    botToken: string,
    chatId: number,
    text: string,
    options?: {
      mediaType?: 'none' | 'photo' | 'video';
      mediaUrl?: string;
      buttons?: Array<{ text: string; url?: string; callback_data?: string }>;
    }
  ): Promise<boolean> {
    try {
      const mediaType = options?.mediaType || 'none';
      const mediaUrl = options?.mediaUrl?.trim();
      let replyMarkup: any = undefined;

      if (options?.buttons && options.buttons.length > 0) {
        const validButtons = options.buttons.filter((b) => b.text && b.text.trim());
        if (validButtons.length > 0) {
          replyMarkup = {
            inline_keyboard: validButtons.map((b) => [{ text: b.text, url: b.url || 'https://t.me/' }]),
          };
        }
      }

      let formattedText = markdownToTelegramHtml(text);

      if (mediaType === 'photo' && mediaUrl) {
        const payload: any = {
          chat_id: chatId,
          photo: mediaUrl,
          caption: formattedText,
          parse_mode: 'HTML',
        };
        if (replyMarkup) payload.reply_markup = replyMarkup;
        let res = await this.tgApi(botToken, 'sendPhoto', payload);
        if (!res?.ok && res?.description?.toLowerCase().includes('entity')) {
          payload.caption = text;
          delete payload.parse_mode;
          res = await this.tgApi(botToken, 'sendPhoto', payload);
        }
        if (res?.ok) return true;
        // If image sending fails, fall back to text message
      } else if (mediaType === 'video' && mediaUrl) {
        const payload: any = {
          chat_id: chatId,
          video: mediaUrl,
          caption: formattedText,
          parse_mode: 'HTML',
        };
        if (replyMarkup) payload.reply_markup = replyMarkup;
        let res = await this.tgApi(botToken, 'sendVideo', payload);
        if (!res?.ok && res?.description?.toLowerCase().includes('entity')) {
          payload.caption = text;
          delete payload.parse_mode;
          res = await this.tgApi(botToken, 'sendVideo', payload);
        }
        if (res?.ok) return true;
        // If video sending fails, fall back to text message
      }

      return await this.sendDirectTelegramMessage(botToken, chatId, text, replyMarkup);
    } catch (err: any) {
      console.warn(`[sendBroadcastItem] Failed to send to ${chatId}:`, err.message);
      return false;
    }
  }

  // Comprehensive tracking of all subscribers and administrators for channels where bot is admin
  public async syncChannelSubscribersAndAdmins(botId?: string): Promise<{
    success: boolean;
    message: string;
    channels: any[];
    totalUsersCount: number;
    newUsersAdded: number;
  }> {
    const store = this.options.getStore();
    const bots = this.options.getBots();
    const targetBots = botId ? bots.filter((b: any) => b.id === botId) : bots.filter((b: any) => b.token && b.token.trim());
    let newUsersAdded = 0;
    const channelSummaries: any[] = [];

    for (const bot of targetBots) {
      if (!bot.token) continue;
      for (const ch of (bot.channels || [])) {
        if (!ch.id) continue;
        let cleanChannel = ch.id.trim();
        if (!cleanChannel.startsWith('@') && !cleanChannel.startsWith('-')) {
          cleanChannel = /^\d+$/.test(cleanChannel) ? `-${cleanChannel}` : `@${cleanChannel}`;
        }

        // 1. Get exact real member count from Telegram API
        try {
          const countRes = await this.tgApi(bot.token, 'getChatMemberCount', { chat_id: cleanChannel });
          if (countRes && countRes.ok && typeof countRes.result === 'number') {
            ch.memberCount = countRes.result;
            console.log(`[Telegram Bot] Channel ${cleanChannel} real subscriber count = ${ch.memberCount}`);
          }
        } catch (e: any) {
          console.warn(`[Telegram Bot] Failed to fetch member count for ${cleanChannel}:`, e.message);
        }

        // 2. Fetch Chat Details (title, photo, etc.)
        try {
          const chatInfo = await this.tgApi(bot.token, 'getChat', { chat_id: cleanChannel });
          if (chatInfo && chatInfo.ok && chatInfo.result) {
            if (chatInfo.result.title) ch.title = chatInfo.result.title;
            ch.isBotAdmin = true;
          }
        } catch {}

        // 3. Fetch all administrators & creator of the channel and record them in the store
        try {
          const adminsRes = await this.tgApi(bot.token, 'getChatAdministrators', { chat_id: cleanChannel });
          if (adminsRes && adminsRes.ok && Array.isArray(adminsRes.result)) {
            ch.isBotAdmin = true;
            for (const adm of adminsRes.result) {
              if (adm.user && !adm.user.is_bot) {
                const existing = store.users.find((u: any) => u.telegramId === adm.user.id);
                if (!existing) {
                  const newUser = this.findOrCreateUser(adm.user);
                  newUser.channelMembership = adm.status === 'creator' ? 'creator' : 'administrator';
                  newUser.isAdmin = true;
                  newUsersAdded++;
                } else {
                  existing.channelMembership = adm.status === 'creator' ? 'creator' : 'administrator';
                  existing.isAdmin = true;
                }
              }
            }
          }
        } catch (e: any) {
          console.warn(`[Telegram Bot] getChatAdministrators notice for ${cleanChannel}:`, e.message);
        }

        // 4. Verify all registered store users against this channel
        for (const user of store.users) {
          if (user.isException || user.isAdmin || user.channelMembership === 'creator') continue;
          try {
            const check = await this.checkChatMember(bot.token, cleanChannel, user.telegramId);
            if (check.ok) {
              user.channelMembership = check.isMember ? 'member' : 'left';
            }
          } catch {}
        }

        channelSummaries.push({
          id: ch.id,
          title: ch.title || ch.id,
          memberCount: ch.memberCount || 0,
          isBotAdmin: ch.isBotAdmin ?? true,
        });
      }
    }

    this.options.saveStore();
    return {
      success: true,
      message: `Подписчики и администраторы каналов успешно синхронизированы с Telegram API! В базе: ${store.users.length} пользователей.`,
      channels: channelSummaries,
      totalUsersCount: store.users.length,
      newUsersAdded,
    };
  }

  public async tgApi(token: string, method: string, body?: any, signal?: AbortSignal): Promise<any> {
    try {
      const res = await tgFetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal,
      });
      const data: any = await res.json();

      // Check if user blocked the bot
      if (data && !data.ok && data.error_code === 403 && data.description?.includes('bot was blocked')) {
        const targetChatId = body?.chat_id;
        if (targetChatId) {
          this.handleBlockedByChatId(targetChatId);
        }
      }

      return data;
    } catch (err: any) {
      if (err.name === 'AbortError') return null;
      console.warn(`[TG Bot API Error] ${method}:`, err.message);
      return null;
    }
  }

  private async handleBlockedByChatId(chatId: number | string) {
    const store = this.options.getStore();
    const user = store.users.find((u: any) => u.telegramId === Number(chatId));
    if (user && user.status !== 'bot_blocked') {
      const bot = this.options.getBots().find((b: any) => b.enabled) || this.options.getBots()[0];
      await this.handleUserBlockedBot(bot, { id: user.telegramId, username: user.username, first_name: user.firstName });
    }
  }

  public async checkChatMember(
    token: string, 
    channelId: string, 
    userId: number
  ): Promise<{ ok: boolean; isMember: boolean; botNeedsAdmin?: boolean; errorDescription?: string }> {
    try {
      let cleanChannel = channelId.trim();
      // Remove any https://t.me/ or t.me/ prefixes
      cleanChannel = cleanChannel.replace(/^(?:https?:\/\/)?(?:www\.)?t\.me\//i, '').replace(/^\/+/, '');
      // Auto-normalize channel identifier:
      // If it doesn't start with @, -, and is not purely numbers, add @
      if (!cleanChannel.startsWith('@') && !cleanChannel.startsWith('-')) {
        if (/^\d+$/.test(cleanChannel)) {
          // If pure number starting with 100..., prepend -
          cleanChannel = cleanChannel.startsWith('100') ? `-${cleanChannel}` : `-100${cleanChannel}`;
        } else {
          cleanChannel = `@${cleanChannel}`;
        }
      }

      console.log(`[checkChatMember] Verifying user ${userId} in channel ${cleanChannel}...`);
      const res = await this.tgApi(token, 'getChatMember', {
        chat_id: cleanChannel,
        user_id: userId,
      });

      if (res && res.ok && res.result) {
        const st = res.result.status;
        const isMember = ['creator', 'administrator', 'member', 'restricted'].includes(st);
        console.log(`[checkChatMember] User ${userId} in ${cleanChannel}: status="${st}" -> isMember=${isMember}`);
        return { ok: true, isMember };
      }

      // Check if Telegram returned 400 because user is not a participant or bot lacks rights
      const desc = res?.description || (res ? JSON.stringify(res) : 'No response from Telegram API');
      const errCode = res?.error_code;

      // When a user has never joined or left the channel, Telegram getChatMember returns PARTICIPANT_ID_INVALID or user not found.
      // This is a normal, valid verification response confirming the user is NOT a member.
      if (
        desc.includes('PARTICIPANT_ID_INVALID') || 
        desc.includes('USER_NOT_PARTICIPANT') || 
        desc.includes('user not found') ||
        desc.includes('invalid user_id specified')
      ) {
        console.log(`[checkChatMember] User ${userId} is confirmed not in ${cleanChannel} (Telegram status: non-member)`);
        return { ok: true, isMember: false };
      }

      console.warn(`[checkChatMember warning] Telegram API error (${errCode}) for ${cleanChannel} user ${userId}: ${desc}`);

      if (
        desc.includes('member list is inaccessible') || 
        desc.includes('chat not found') || 
        desc.includes('not enough rights') || 
        desc.includes('bot is not a member') ||
        desc.includes('CHAT_ADMIN_REQUIRED')
      ) {
        const adminMsg = `Бот должен быть назначен администратором канала ${cleanChannel}: ${desc}`;
        return { ok: false, isMember: false, botNeedsAdmin: true, errorDescription: adminMsg };
      }

      return { ok: false, isMember: false, errorDescription: desc };
    } catch (err: any) {
      console.error(`[checkChatMember exception] Failed to check user ${userId} in ${channelId}:`, err.message);
      return { ok: false, isMember: false, errorDescription: err.message };
    }
  }

  public async checkAllRequiredChannels(
    bot: any,
    userId: number
  ): Promise<{ allSubscribed: boolean; missingChannels: any[]; botNeedsAdminIn: any[]; errors: string[] }> {
    const store = this.options.getStore();
    const user = store.users?.find((u: any) => u.telegramId === userId);
    if (user?.isAdmin || user?.isException || user?.channelMembership === 'creator' || user?.channelMembership === 'administrator' || user?.bypassBlock) {
      return { allSubscribed: true, missingChannels: [], botNeedsAdminIn: [], errors: [] };
    }

    const requiredChannels = (bot.channels || []).filter((c: any) => c.isRequired && c.id && c.id.trim());
    if (requiredChannels.length === 0) {
      return { allSubscribed: true, missingChannels: [], botNeedsAdminIn: [], errors: [] };
    }

    const missingChannels: any[] = [];
    const botNeedsAdminIn: any[] = [];
    const errors: string[] = [];

    for (const ch of requiredChannels) {
      const check = await this.checkChatMember(bot.token, ch.id, userId);
      if (check.botNeedsAdmin) {
        botNeedsAdminIn.push(ch);
      }
      if (check.errorDescription) {
        errors.push(`[${ch.title || ch.id}]: ${check.errorDescription}`);
      }
      // Only mark missing if check succeeded and user was confirmed NOT a member
      // If bot lacks admin rights or chat was not found, DO NOT falsely penalize subscribed users!
      if (!check.isMember && check.ok && !check.botNeedsAdmin) {
        missingChannels.push(ch);
      }
    }

    return {
      allSubscribed: missingChannels.length === 0,
      missingChannels,
      botNeedsAdminIn,
      errors,
    };
  }

  private async startBotPolling(bot: any) {
    if (this.activeBots.has(bot.id)) return;

    const abortController = new AbortController();
    this.activeBots.set(bot.id, {
      id: bot.id,
      token: bot.token,
      abortController,
    });

    // Test bot token & retrieve username
    try {
      const me = await this.tgApi(bot.token, 'getMe', undefined, abortController.signal);
      if (me && me.ok && me.result) {
        bot.status = 'connected';
        bot.username = me.result.username || bot.username;
        bot.botId = String(me.result.id);
        bot.errorMessage = undefined;
        this.options.saveStore();
        console.log(`[Telegram Bot] Successfully connected @${bot.username} (ID: ${bot.botId})`);
      } else {
        bot.status = 'error';
        bot.errorMessage = me?.description || 'Неверный токен Telegram бота';
        this.options.saveStore();
        console.warn(`[Telegram Bot] Failed to connect bot ${bot.name}:`, bot.errorMessage);
        return;
      }
    } catch (err: any) {
      bot.status = 'error';
      bot.errorMessage = err.message || 'Ошибка подключения к Telegram API';
      this.options.saveStore();
      return;
    }

    // Long-polling loop
    (async () => {
      let offset = 0;
      console.log(`[Telegram Bot] Polling started for @${bot.username}...`);

      while (!abortController.signal.aborted && !this.isShuttingDown) {
        try {
          const updates = await this.tgApi(
            bot.token,
            'getUpdates',
            {
              offset,
              timeout: 25,
              allowed_updates: ['message', 'callback_query', 'chat_member', 'my_chat_member'],
            },
            abortController.signal
          );

          if (updates && updates.ok && Array.isArray(updates.result)) {
            for (const update of updates.result) {
              offset = update.update_id + 1;
              await this.processUpdate(bot, update);
            }
          } else if (updates && updates.error_code === 409) {
            // Another instance (e.g. Render production container) is running getUpdates
            console.log(`[Telegram Bot] ℹ️ 409 Conflict: Another instance is actively polling @${bot.username}. Backing off for 25s so primary instance has uninterrupted priority.`);
            await new Promise((r) => setTimeout(r, 25000));
          } else {
            await new Promise((r) => setTimeout(r, 1500));
          }
        } catch (err: any) {
          if (abortController.signal.aborted || this.isShuttingDown) break;
          console.warn(`[Telegram Bot] Polling tick error for @${bot.username}:`, err.message);
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
      console.log(`[Telegram Bot] Polling stopped for @${bot.username}`);
    })();
  }

  // Unified update processor supporting both Long-Polling (Docker/VPS) and Webhook (Vercel Serverless)
  public async processUpdate(bot: any, update: any): Promise<void> {
    if (!bot || !update) return;
    try {
      if (update.my_chat_member) {
        await this.handleMyChatMemberUpdate(bot, update.my_chat_member);
      } else if (update.chat_member) {
        await this.handleChatMemberUpdate(bot, update.chat_member);
      } else if (update.message) {
        await this.handleMessage(bot, update.message);
      } else if (update.callback_query) {
        await this.handleCallbackQuery(bot, update.callback_query);
      }
    } catch (err: any) {
      console.warn(`[TelegramBotManager] processUpdate error for @${bot.username || bot.name}:`, err.message);
    }
  }

  // Set Webhook for serverless execution on Vercel
  public async setBotWebhook(token: string, webhookUrl: string, dropPendingUpdates = true): Promise<any> {
    return this.tgApi(token, 'setWebhook', {
      url: webhookUrl,
      drop_pending_updates: dropPendingUpdates,
      allowed_updates: ['message', 'callback_query', 'chat_member', 'my_chat_member'],
    });
  }

  // Remove Webhook to restore Docker Long-Polling
  public async deleteBotWebhook(token: string, dropPendingUpdates = false): Promise<any> {
    return this.tgApi(token, 'deleteWebhook', {
      drop_pending_updates: dropPendingUpdates,
    });
  }

  // Query Webhook status from Telegram
  public async getBotWebhookInfo(token: string): Promise<any> {
    return this.tgApi(token, 'getWebhookInfo');
  }

  private findOrCreateUser(from: any): any {
    const store = this.options.getStore();
    let dbUser = store.users.find((u: any) => u.telegramId === from.id);
    if (!dbUser) {
      const token = `sub_${from.username || from.id}_${Math.random().toString(36).substring(2, 8)}`;
      dbUser = {
        id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        telegramId: from.id,
        username: from.username || null,
        firstName: from.first_name || 'Пользователь',
        lastName: from.last_name || null,
        joinedAt: new Date().toISOString(),
        receivedAt: null,
        subscriptionName: '',
        subscriptionType: 'happ',
        status: 'active',
        mutedUntil: null,
        isMuted: false,
        isBlocked: false,
        deviceLocked: true,
        boundDevice: null,
        trafficUsedBytes: 0,
        trafficLimitBytes: 0,
        subscriptionToken: token,
        channelMembership: 'member',
        hasActiveSubscription: false,
        lastActiveAt: new Date().toISOString(),
        personalNodes: [],
      };
      store.users.unshift(dbUser);
      this.options.saveStore();
    } else {
      let updated = false;
      if (from.username && dbUser.username !== from.username) {
        dbUser.username = from.username;
        updated = true;
      }
      if (from.first_name && dbUser.firstName !== from.first_name) {
        dbUser.firstName = from.first_name;
        updated = true;
      }
      dbUser.lastActiveAt = new Date().toISOString();
      if (updated) this.options.saveStore();
    }
    return dbUser;
  }

  // Handle user blocking / unblocking the bot
  private async handleMyChatMemberUpdate(bot: any, mcm: any) {
    if (!mcm || !mcm.from) return;
    const newStatus = mcm.new_chat_member?.status;
    const tgUser = mcm.from;

    if (newStatus === 'kicked') {
      console.log(`[Telegram Bot] User ${tgUser.id} (@${tgUser.username}) blocked the bot!`);
      await this.handleUserBlockedBot(bot, tgUser);
    } else if (newStatus === 'member') {
      console.log(`[Telegram Bot] User ${tgUser.id} (@${tgUser.username}) unblocked the bot.`);
      await this.handleUserUnblockedBot(bot, tgUser);
    }
  }

  // Handle channel membership events from Telegram
  private async handleChatMemberUpdate(bot: any, cmu: any) {
    if (!cmu) return;
    const chat = cmu.chat;
    const channelId = chat.id;
    const channelUsername = chat.username ? `@${chat.username}` : '';
    const newStatus = cmu.new_chat_member?.status;
    const tgUser = cmu.new_chat_member?.user || cmu.from;

    // Check if this channel is one of bot's required channels
    const isOurChannel = (bot.channels || []).some((c: any) => {
      const matchId = String(c.id).toLowerCase();
      return (
        matchId === String(channelId).toLowerCase() ||
        (channelUsername && matchId === channelUsername.toLowerCase())
      );
    });

    if (!isOurChannel) return;

    const isLeft = ['left', 'kicked'].includes(newStatus);
    const store = this.options.getStore();
    // Comprehensive Subscriber Tracking: Always find or register any channel member!
    let user = store.users.find((u: any) => u.telegramId === tgUser.id);
    if (!user) {
      user = this.findOrCreateUser(tgUser);
    }

    user.channelMembership = isLeft
      ? 'left'
      : (newStatus === 'creator' ? 'creator' : (newStatus === 'administrator' ? 'administrator' : 'member'));
    if (newStatus === 'creator' || newStatus === 'administrator') {
      user.isAdmin = true;
    }

    if (user.isException) {
      console.log(`[Telegram Bot] User ${user.telegramId} is an exception subscription, bypassing channel check.`);
      return;
    }

    if (isLeft) {
      console.log(`[Telegram Bot] User ${user.telegramId} left required channel ${channelUsername || channelId}`);
      await this.handleUserLeftChannel(bot, user, { id: channelUsername || channelId, title: chat.title });
    } else {
      console.log(`[Telegram Bot] User ${user.telegramId} joined required channel ${channelUsername || channelId}`);
      await this.handleUserJoinedChannel(bot, user, { id: channelUsername || channelId, title: chat.title });
    }
  }

  // User left an obligatory channel
  public async handleUserLeftChannel(bot: any, user: any, channel?: any) {
    const hours = bot.selfDeleteHours || 72;
    const deadline = new Date(Date.now() + hours * 3600 * 1000).toISOString();

    user.channelMembership = 'left';
    user.status = 'unsubscribed';
    user.hasActiveSubscription = false;
    user.channelLeftAt = new Date().toISOString();
    user.channelLeftCount = (user.channelLeftCount || 0) + 1;
    user.deletionDeadlineAt = deadline;
    user.subscriptionStatusReason = `Покинул обязательный канал ${channel?.title || channel?.id || ''}. Обновления центральной подписки приостановлены. До удаления: ${hours} ч.`;

    // Immediately replace user's file with Source 1 nodes so VPN switches to disconnect stub
    await this.options.applyDisconnectStub(user, 'Left required channel', 1);
    this.options.saveStore();

    // Send warning notification in Telegram
    try {
      const chName = channel?.title || channel?.id || 'канал доступа';
      const deadlineDateFormatted = new Date(deadline).toLocaleString('ru-RU');
      const requiredChannels = (bot.channels || []).filter((c: any) => c.isRequired);
      const chButtons: any[] = requiredChannels.map((c: any) => [
        {
          text: `📢 Подписаться на ${c.title || c.id}`,
          url: c.inviteLink || `https://t.me/${c.id.replace(/^@+/, '')}`,
        },
      ]);
      chButtons.push([
        { text: '🔄 Я подписался (Восстановить)', callback_data: 'cmd_verify_channel' },
      ]);

      const warningText =
        `⚠️ <b>ВНИМАНИЕ: ВАША ПОДПИСКА ДЕАКТИВИРОВАНА!</b> ⚠️\n\n` +
        `Вы покинули обязательный канал: <b>${escapeHtml(chName)}</b>.\n\n` +
        `❌ Доступ к VPN временно приостановлен.\n` +
        `🚫 Обновления узлов из центральной подписки не поступают.\n\n` +
        `⏳ <b>Срок восстановления:</b> у вас есть <b>${hours} ч.</b> (до ${deadlineDateFormatted}), чтобы подписаться обратно.\n\n` +
        `⚠️ <i>Если вы не вернетесь в канал в течение этого времени, ваш персональный ключ и файл подписки будут <b>полностью и безвозвратно удалены</b> из системы.</i>`;

      await this.tgApi(bot.token, 'sendMessage', {
        chat_id: user.telegramId,
        text: warningText,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: chButtons,
        },
      });
    } catch (sendErr: any) {
      console.warn(`[Warning Send Error to ${user.telegramId}]:`, sendErr.message);
    }
  }

  // User rejoined obligatory channel
  public async handleUserJoinedChannel(bot: any, user: any, channel?: any) {
    const { allSubscribed } = await this.checkAllRequiredChannels(bot, user.telegramId);
    if (allSubscribed) {
      user.channelMembership = 'member';
      user.channelLeftAt = null;
      user.deletionDeadlineAt = null;

      if (user.gitFilePath) {
        user.status = 'active';
        user.hasActiveSubscription = true;
        user.subscriptionStatusReason = undefined;
        await this.options.restoreUserNodes(user);
      }
      this.options.saveStore();
    }
  }

  // User blocked the bot
  public async handleUserBlockedBot(bot: any, tgUser: any) {
    const store = this.options.getStore();
    const user = store.users.find((u: any) => u.telegramId === tgUser.id);
    if (!user) return;

    const hours = bot.selfDeleteHours || 72;
    const deadline = new Date(Date.now() + hours * 3600 * 1000).toISOString();

    user.status = 'bot_blocked';
    user.hasActiveSubscription = false;
    user.botBlockedAt = new Date().toISOString();
    user.deletionDeadlineAt = deadline;
    user.subscriptionStatusReason = `Пользователь заблокировал бота. Доступ отключен. Запланировано удаление через ${hours} ч.`;

    // Apply disconnect stub to user's Git file
    await this.options.applyDisconnectStub(user, 'Bot blocked by user');
    this.options.saveStore();
  }

  // User unblocked the bot
  public async handleUserUnblockedBot(bot: any, tgUser: any) {
    const store = this.options.getStore();
    const user = store.users.find((u: any) => u.telegramId === tgUser.id);
    if (!user) return;

    user.botBlockedAt = null;
    const { allSubscribed } = await this.checkAllRequiredChannels(bot, user.telegramId);

    if (allSubscribed && user.gitFilePath) {
      user.channelMembership = 'member';
      user.status = 'active';
      user.hasActiveSubscription = true;
      user.deletionDeadlineAt = null;
      user.subscriptionStatusReason = undefined;
      await this.options.restoreUserNodes(user);
    }
    this.options.saveStore();
  }

  // Background audit running every 60s
  private async runPeriodicAudit() {
    if (this.isShuttingDown) return;
    const store = this.options.getStore();
    const bots = this.options.getBots();
    const activeBot = bots.find((b: any) => b.enabled) || bots[0];
    if (!activeBot || !activeBot.token) return;

    const now = Date.now();

    // 1. Check expiration of deletion deadlines
    for (const user of store.users) {
      if (
        user.deletionDeadlineAt &&
        (user.status === 'unsubscribed' || user.status === 'bot_blocked' || user.channelMembership === 'left')
      ) {
        const deadlineTime = new Date(user.deletionDeadlineAt).getTime();
        if (now >= deadlineTime) {
          console.log(`[Audit] Deletion deadline reached for user ${user.telegramId}. Permanently deleting...`);
          await this.options.permanentlyDeleteUser(user);
        }
      }
    }

    // 2. Check expiration of temporary device violation mutes (Source 2)
    for (const user of store.users) {
      if (user.status === 'muted' && user.mutedUntil) {
        const muteEndTime = new Date(user.mutedUntil).getTime();
        if (now >= muteEndTime) {
          console.log(`[Audit] Temporary mute expired for user ${user.telegramId}. Restoring nodes...`);
          user.mutedUntil = null;
          if (user.channelMembership === 'left') {
            user.status = 'channel_inactive';
          } else {
            user.status = 'active';
            user.hasActiveSubscription = true;
            user.subscriptionStatusReason = undefined;
            try {
              await this.options.restoreUserNodes(user);
            } catch (err: any) {
              console.warn(`[Audit] Failed to restore nodes for ${user.telegramId}:`, err.message);
            }
            // Notify user on Telegram
            const bot = bots.find((b: any) => b.id === user.botId) || activeBot;
            if (bot && bot.token) {
              await this.sendDirectTelegramMessage(
                bot.token,
                user.telegramId,
                '✅ <b>Временная блокировка подписки завершена!</b>\n\nСерверные узлы восстановлены. Напоминаем: разрешено подключение строго на 1 персональном устройстве.'
              );
            }
          }
          this.options.saveStore();
        }
      }
    }

    // 3. Audit active subscribers against required channels
    const requiredChannels = (activeBot.channels || []).filter((c: any) => c.isRequired && c.id);
    if (requiredChannels.length > 0) {
      const activeSubscribers = store.users.filter((u: any) => u.hasActiveSubscription && u.status === 'active' && !u.isException);
      for (const subUser of activeSubscribers) {
        const { allSubscribed, missingChannels, botNeedsAdminIn, errors } = await this.checkAllRequiredChannels(activeBot, subUser.telegramId);
        if (!allSubscribed) {
          // If the verification encountered an error or bot needs admin permissions, DO NOT demote legitimate users!
          if (errors.length > 0 || botNeedsAdminIn.length > 0) {
            console.warn(`[Audit] Skipping demotion for user ${subUser.telegramId} because of check error:`, errors.join(', '));
            continue;
          }
          console.log(`[Audit] Confirmed user ${subUser.telegramId} left required channels!`, missingChannels.map((c) => c.id));
          await this.handleUserLeftChannel(activeBot, subUser, missingChannels[0]);
        }
      }
    }
  }

  private async handleMessage(bot: any, msg: any) {
    if (!msg || !msg.from) return;
    const chatId = msg.chat.id;
    const text = (msg.text || '').trim();
    const user = this.findOrCreateUser(msg.from);
    const store = this.options.getStore();

    // Check block status
    if (user.status === 'blocked' || user.isBlocked) {
      // If user had clicked to submit an unblock application and sent a text explanation
      if (user.pendingUnblockRequest) {
        const reasonText = text || 'Прошу разблокировать подписку';
        const fb = {
          id: `unblock_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          userId: user.id,
          telegramId: user.telegramId,
          username: user.username || '',
          firstName: user.firstName || 'Пользователь',
          type: 'unblock_request' as const,
          message: reasonText,
          banReason: user.subscriptionStatusReason || user.blockedReason || 'Блокировка доступа',
          blockedAt: user.bannedAt || user.lastActiveAt || new Date().toISOString(),
          attempts: user.deviceViolationAttempts || 0,
          createdAt: new Date().toISOString(),
          status: 'pending' as const,
          boundDevice: user.boundDevice
            ? {
                clientName: user.boundDevice.clientName,
                ip: user.boundDevice.ip,
                boundAt: user.boundDevice.boundAt,
              }
            : null,
        };

        if (!store.feedbackRequests) store.feedbackRequests = [];
        store.feedbackRequests.unshift(fb);
        user.pendingUnblockRequest = false;
        this.options.saveStore();

        await this.tgApi(bot.token, 'sendMessage', {
          chat_id: chatId,
          text: `✅ <b>Заявка на разблокировку успешно отправлена!</b>\n\n` +
            `📝 <b>Ваше объяснение:</b> <i>${escapeHtml(reasonText)}</i>\n\n` +
            `Администратор рассмотрит её в панели управления в разделе «Обратная связь». Как только подписка будет разблокирована и устройство отвязано, вам придёт уведомление.`,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '💬 Связаться с администратором напрямую', url: bot.adminContactUrl || 'https://t.me/puls_admin' }],
            ],
          },
        });
        return;
      }

      const reason = user.subscriptionStatusReason || user.blockedReason || 'Нарушение правил использования';
      await this.tgApi(bot.token, 'sendMessage', {
        chat_id: chatId,
        text: `🚫 <b>Доступ заблокирован</b>\n\n` +
          `⛔ <b>Причина:</b> ${escapeHtml(reason)}\n` +
          `🕒 <b>Время блокировки:</b> ${new Date(user.bannedAt || user.lastActiveAt || Date.now()).toLocaleString('ru-RU')}\n` +
          `⚠️ <b>Количество нарушений:</b> ${user.deviceViolationAttempts || 0}\n\n` +
          `Вы можете направить заявку на разблокировку администратору проекта:`,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📝 Подать заявку на разблокировку', callback_data: 'cmd_request_unblock' }],
            [{ text: '💬 Связаться с администратором', url: bot.adminContactUrl || 'https://t.me/puls_admin' }],
          ],
        },
      });
      return;
    }

    // Handle pending unbind request if user replied with reason
    if (user.pendingUnbindRequest) {
      const reasonText = text || 'Без описания';
      const fb = {
        id: `fb_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        userId: user.id,
        telegramId: user.telegramId,
        username: user.username || '',
        firstName: user.firstName || 'Пользователь',
        type: 'unbind_device',
        message: reasonText,
        createdAt: new Date().toISOString(),
        status: 'pending',
        boundDevice: user.boundDevice
          ? {
              clientName: user.boundDevice.clientName,
              ip: user.boundDevice.ip,
              boundAt: user.boundDevice.boundAt,
            }
          : null,
      };
      if (!store.feedbackRequests) store.feedbackRequests = [];
      store.feedbackRequests.unshift(fb);
      user.pendingUnbindRequest = false;
      this.options.saveStore();

      await this.tgApi(bot.token, 'sendMessage', {
        chat_id: chatId,
        text: `✅ <b>Запрос на смену устройства отправлен администратору!</b>\n\n📝 Причина: <i>${escapeHtml(reasonText)}</i>\n\nАдминистратор проверит заявку в панели управления и обновит привязку.`,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '👤 Мой профиль', callback_data: 'cmd_profile' }],
            [{ text: '◀️ Главное меню', callback_data: 'cmd_menu' }],
          ],
        },
      });
      return;
    }

    // Check required channels
    const channelCheck = await this.checkAllRequiredChannels(bot, msg.from.id);
    if (!channelCheck.allSubscribed) {
      user.channelMembership = 'left';
      this.options.saveStore();

      const buttons: any[] = channelCheck.missingChannels.map((c: any) => [
        {
          text: `📢 Подписаться на ${c.title || c.id}`,
          url: c.inviteLink || `https://t.me/${c.id.replace(/^@+/, '')}`,
        },
      ]);
      buttons.push([{ text: '🔄 Проверить доступ', callback_data: 'cmd_verify_channel' }]);

      const channelTemplate = bot.channelNoticeMessage || CANONICAL_BOT_TEMPLATES.channelNoticeMessage;
      const formatted = formatBotTemplate(channelTemplate, {
        name: user.firstName || 'друг',
        channel: bot.channels[0]?.id || '@puls_channel',
      });
      const channelNoticeHtml = markdownToTelegramHtml(formatted);

      await this.tgApi(bot.token, 'sendMessage', {
        chat_id: chatId,
        text: channelNoticeHtml,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: buttons,
        },
      });
      return;
    } else {
      user.channelMembership = user.channelMembership === 'creator' ? 'creator' : 'member';
      if (user.status === 'channel_inactive' || (user.isBlocked && user.subscriptionStatusReason?.includes('канал'))) {
        user.status = 'active';
        user.isBlocked = false;
        user.detachedFromCentral = false;
        user.subscriptionStatusReason = undefined;
        await this.options.restoreUserNodes(user).catch(() => {});
        await this.options.resolveUserDisplayKey(user).catch(() => '');
      }
      this.options.saveStore();
    }

    // Default start menu
    await this.sendMainMenu(bot, chatId, user);
  }

  private async handleCallbackQuery(bot: any, cq: any) {
    if (!cq || !cq.from) return;
    const queryId = cq.id;
    const chatId = cq.message?.chat?.id;
    const messageId = cq.message?.message_id;
    const data = cq.data || '';
    const user = this.findOrCreateUser(cq.from);
    const store = this.options.getStore();

    // Acknowledge callback immediately
    await this.tgApi(bot.token, 'answerCallbackQuery', { callback_query_id: queryId });

    if (!chatId) return;

    // 1. Unblock request submission
    if (data === 'cmd_request_unblock') {
      user.pendingUnblockRequest = true;
      this.options.saveStore();

      const reason = user.subscriptionStatusReason || user.blockedReason || 'Нарушение правил использования';
      await this.tgApi(bot.token, 'sendMessage', {
        chat_id: chatId,
        text: `📝 <b>Заявка на разблокировку подписки</b>\n\n` +
          `⛔ <b>Причина:</b> ${escapeHtml(reason)}\n` +
          `🕒 <b>Время блокировки:</b> ${new Date(user.bannedAt || user.lastActiveAt || Date.now()).toLocaleString('ru-RU')}\n` +
          `⚠️ <b>Количество нарушений:</b> ${user.deviceViolationAttempts || 0}\n\n` +
          `✍️ <b>Напишите и отправьте прямо сюда в чат</b> ответным сообщением подробное объяснение ситуации.\n\nЗаявка мгновенно поступит в раздел «Обратная связь» панели управления администратора.`,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '💬 Связаться с администратором напрямую', url: bot.adminContactUrl || 'https://t.me/puls_admin' }],
          ],
        },
      });
      return;
    }

    // 2. If blocked, only permit verify channel, unbind request, profile, or second device removal; otherwise send blocked message
    const isPermittedBlockedAction = [
      'cmd_verify_channel',
      'cmd_check_channels',
      'cmd_second_device_removed',
      'cmd_request_unblock',
      'cmd_request_unbind',
      'cmd_profile',
    ].includes(data);
    if (!isPermittedBlockedAction && (user.status === 'blocked' || user.isBlocked)) {
      const blockedTemplate = bot.blockedUserMessage || CANONICAL_BOT_TEMPLATES.blockedUserMessage;
      const formattedBlocked = formatBotTemplate(blockedTemplate, {
        username: user.username ? `@${user.username}` : (user.firstName || 'Пользователь'),
        name: user.firstName || 'Пользователь',
        reason: user.subscriptionStatusReason || user.blockedReason || 'Нарушение правил использования',
      });
      const blockedHtml = markdownToTelegramHtml(formattedBlocked);

      const blockedButtons: any[] = [];
      if (
        user.secondDeviceActive ||
        user.sharingGraceDeadlineAt ||
        user.sharingWarningCount ||
        user.subscriptionStatusReason?.includes('устройств') ||
        user.subscriptionStatusReason?.includes('лицу') ||
        user.subscriptionStatusReason?.includes('передач')
      ) {
        blockedButtons.push([{ text: '✅ Второй пользователь удалил подписку', callback_data: 'cmd_second_device_removed' }]);
      }
      blockedButtons.push([{ text: '🔄 Проверить подписку на каналы', callback_data: 'cmd_verify_channel' }]);
      blockedButtons.push([{ text: '👤 Мой профиль', callback_data: 'cmd_profile' }]);
      blockedButtons.push([{ text: '📝 Подать заявку на разблокировку', callback_data: 'cmd_request_unblock' }]);
      blockedButtons.push([{ text: '💬 Связаться с администратором', url: bot.adminContactUrl || 'https://t.me/puls_admin' }]);

      await this.tgApi(bot.token, 'sendMessage', {
        chat_id: chatId,
        text: `${blockedHtml}\n\n` +
          `⛔ <b>Причина:</b> ${escapeHtml(user.subscriptionStatusReason || user.blockedReason || 'Блокировка')}\n\n` +
          `Вы можете подать заявку на разблокировку подписки или повторить проверку:`,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: blockedButtons,
        },
      });
      return;
    }

    // Verify channel
    if (data === 'cmd_verify_channel') {
      const channelCheck = await this.checkAllRequiredChannels(bot, cq.from.id);
      if (!channelCheck.allSubscribed) {
        user.channelMembership = 'left';
        this.options.saveStore();

        const buttons: any[] = channelCheck.missingChannels.map((c: any) => [
          {
            text: `📢 Подписаться на ${c.title || c.id}`,
            url: c.inviteLink || `https://t.me/${c.id.replace(/^@+/, '')}`,
          },
        ]);
        buttons.push([{ text: '🔄 Проверить снова', callback_data: 'cmd_verify_channel' }]);

        let adminNotice = '';
        if (channelCheck.botNeedsAdminIn && channelCheck.botNeedsAdminIn.length > 0) {
          const names = channelCheck.botNeedsAdminIn.map((c: any) => c.title || c.id).join(', ');
          adminNotice = `\n\n⚠️ <b>Внимание владельцу бота:</b> Бот не назначен администратором в канале (<b>${names}</b>)! В Telegram бот может проверить участников канала только при наличии прав Администратора в этом канале. Добавьте @${bot.username || 'бота'} в администраторы канала, после чего проверка сработает мгновенно!`;
        }

        await this.tgApi(bot.token, 'sendMessage', {
          chat_id: chatId,
          text: `❌ <b>Вы еще не подписались на обязательные каналы!</b>\n\nПожалуйста, оформите подписку и повторите проверку:${adminNotice}`,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: buttons,
          },
        });
        return;
      }

      // User verified in all channels!
      user.channelMembership = 'member';
      user.channelLeftAt = null;
      user.deletionDeadlineAt = null;

      // If user already has a subscription, restore it!
      if (user.gitFilePath || user.hasActiveSubscription || user.subscriptionToken) {
        user.status = 'active';
        user.hasActiveSubscription = true;
        user.isBlocked = false;
        user.isPermanentlyBanned = false;
        user.sharingGraceDeadlineAt = null;
        user.isTimerFrozen = true;
        user.secondDeviceActive = false;
        user.secondDeviceInfo = null;
        user.sharingWarningCount = 0;
        user.deviceViolationAttempts = 0;
        user.boundDevice = null;
        user.deviceLocked = false;
        user.subscriptionStatusReason = undefined;
        await this.options.restoreUserNodes(user);
        const displayKey = await this.options.resolveUserDisplayKey(user).catch(() => '');
        if (displayKey) {
          user.finalSubscriptionUrl = displayKey;
          user.finalUrl = displayKey;
          user.clckUrl = displayKey;
        }
        this.options.saveStore();

        await this.tgApi(bot.token, 'sendMessage', {
          chat_id: chatId,
          text: `✅ <b>Подписка на каналы подтверждена! Доступ полностью восстановлен.</b>\n\nВсе серверные узлы снова активны и обновляются из центральной базы.`,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '👤 Мой профиль и ключ', callback_data: 'cmd_profile' }],
              [{ text: '◀️ Главное меню', callback_data: 'cmd_menu' }],
            ],
          },
        });
        return;
      }

      this.options.saveStore();
      await this.sendFormatSelection(bot, chatId);
      return;
    }

    // Main menu
    if (data === 'cmd_menu' || data === 'cmd_start') {
      await this.sendMainMenu(bot, chatId, user);
      return;
    }

    // Format selection screen
    if (data === 'cmd_choose_format' || data === 'cmd_get_sub') {
      const channelCheck = await this.checkAllRequiredChannels(bot, cq.from.id);
      if (!channelCheck.allSubscribed) {
        const buttons: any[] = channelCheck.missingChannels.map((c: any) => [
          {
            text: `📢 Подписаться на ${c.title || c.id}`,
            url: c.inviteLink || `https://t.me/${c.id.replace(/^@+/, '')}`,
          },
        ]);
        buttons.push([{ text: '🔄 Проверить доступ', callback_data: 'cmd_verify_channel' }]);

        let adminNotice = '';
        if (channelCheck.botNeedsAdminIn && channelCheck.botNeedsAdminIn.length > 0) {
          const names = channelCheck.botNeedsAdminIn.map((c: any) => c.title || c.id).join(', ');
          adminNotice = `\n\n⚠️ <i>(Для администратора: добавьте бота @${bot.username || 'бота'} в администраторы канала ${names}, чтобы бот мог видеть список подписчиков)</i>`;
        }

        await this.tgApi(bot.token, 'sendMessage', {
          chat_id: chatId,
          text:
            `📢 <b>Перед получением подписки необходимо подписаться на наши обязательные каналы!</b>\n\n` +
            `Подпишитесь по ссылкам ниже и нажмите «Проверить доступ»:${adminNotice}`,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: buttons,
          },
        });
        return;
      }

      await this.sendFormatSelection(bot, chatId);
      return;
    }

    // Issue subscription (HAPP or INCY)
    if (data === 'cmd_issue_happ' || data === 'cmd_issue_incy') {
      const isHapp = data === 'cmd_issue_happ';
      const format: 'happ' | 'incy' = isHapp ? 'happ' : 'incy';

      // Reissue / format switch is now an approval request, not an instant re-issue.
      if (user.hasActiveSubscription) {
        const pendingReissue = (store.feedbackRequests || []).find(
          (req: any) => req.userId === user.id && req.type === 'reissue_request' && req.status === 'pending' && req.targetFormat === format
        );

        if (pendingReissue) {
          await this.tgApi(bot.token, 'sendMessage', {
            chat_id: chatId,
            text: `⏳ <b>Заявка на перевыпуск уже отправлена</b>\n\n` +
              `Формат: <b>${isHapp ? 'HAPP (crypt5)' : 'INCY'}</b>\n` +
              `Ожидаем подтверждения администратора. После согласия новая подписка будет создана автоматически.`,
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [[{ text: '👤 Мой профиль', callback_data: 'cmd_profile' }], [{ text: '◀️ Главное меню', callback_data: 'cmd_menu' }]],
            },
          });
          return;
        }

        const newRequest = {
          id: `reissue_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
          userId: user.id,
          telegramId: user.telegramId,
          username: user.username,
          firstName: user.firstName,
          type: 'reissue_request',
          targetFormat: format,
          message: `Пользователь ${user.firstName || user.username || user.telegramId} запросил перевыпуск подписки в формате ${isHapp ? 'HAPP (crypt5)' : 'INCY'}.
Требуется подтверждение администратора до выдачи новой подписки.`,
          createdAt: new Date().toISOString(),
          status: 'pending',
        } as any;

        if (!store.feedbackRequests) store.feedbackRequests = [];
        store.feedbackRequests.unshift(newRequest);
        this.options.saveStore();

        await this.tgApi(bot.token, 'sendMessage', {
          chat_id: chatId,
          text: `📝 <b>Заявка на перевыпуск отправлена администратору</b>\n\n` +
            `Запрошен формат: <b>${isHapp ? 'HAPP (crypt5)' : 'INCY'}</b>\n` +
            `Подписка будет выдана только после подтверждения администратора.`,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[{ text: '👤 Мой профиль', callback_data: 'cmd_profile' }], [{ text: '◀️ Главное меню', callback_data: 'cmd_menu' }]],
          },
        });
        return;
      }

      // 1. Strict channel verification before issuing!
      const channelCheck = await this.checkAllRequiredChannels(bot, cq.from.id);
      if (!channelCheck.allSubscribed) {
        const buttons: any[] = channelCheck.missingChannels.map((c: any) => [
          {
            text: `📢 Подписаться на ${c.title || c.id}`,
            url: c.inviteLink || `https://t.me/${c.id.replace(/^@+/, '')}`,
          },
        ]);
        buttons.push([{ text: '🔄 Проверить доступ', callback_data: 'cmd_verify_channel' }]);

        await this.tgApi(bot.token, 'sendMessage', {
          chat_id: chatId,
          text:
            `❌ <b>Бот не может выдать подписку, так как вы не подписаны на обязательные каналы!</b>\n\n` +
            `Пожалуйста, подпишитесь на указанные каналы и нажмите «Проверить доступ»:`,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: buttons,
          },
        });
        return;
      }

      // Send a temporary "loading subscription" notification (no mention of repository)
      const loadingMsg = await this.tgApi(bot.token, 'sendMessage', {
        chat_id: chatId,
        text: `⏳ <b>Загрузка подписки...</b>\n\nФормируем ваш персональный ключ доступа, пожалуйста подождите...`,
        parse_mode: 'HTML',
      });

      try {
        // Physical allocation / creation of subscription
        const subResult = await this.options.ensureUserRepoFile(user, format);
        const subTypeName = isHapp ? 'HAPP (crypt5)' : 'INCY';
        const totalServers = this.options.parseNodeStats(store.centralFile.content).total;
        const hours = bot.selfDeleteHours || 72;

        user.receivedAt = user.receivedAt || new Date().toISOString();
        user.subscriptionName = subTypeName;
        user.subscriptionType = format;
        user.status = 'active';
        user.hasActiveSubscription = true;
        user.isBlocked = false;
        user.isPermanentlyBanned = false;
        user.sharingGraceDeadlineAt = null;
        user.isTimerFrozen = true;
        user.secondDeviceActive = false;
        user.secondDeviceInfo = null;
        user.sharingWarningCount = 0;
        user.deviceViolationAttempts = 0;
        user.boundDevice = null;
        user.deviceLocked = false;
        user.gitFilePath = subResult.filePath;
        user.gitRawUrl = subResult.rawUrl;
        user.finalSubscriptionUrl = subResult.finalUrl;
        user.deletionDeadlineAt = null;
        user.subscriptionStatusReason = undefined;
        this.options.saveStore();

        // Resolve display key (HAPP crypt5 or clean shortened INCY)
        const displayKey = await this.options.resolveUserDisplayKey(user);
        user.finalSubscriptionUrl = displayKey;
        user.finalUrl = displayKey;
        user.clckUrl = displayKey;
        this.options.saveStore();

        // Delete loading message if exists
        if (loadingMsg && loadingMsg.result?.message_id) {
          await this.tgApi(bot.token, 'deleteMessage', {
            chat_id: chatId,
            message_id: loadingMsg.result.message_id,
          });
        }

        const { time: issuedTime, tz: issuedTz } = formatIssueTime(bot);
        const issueTemplate = bot.subIssuedMessage || CANONICAL_BOT_TEMPLATES.subIssuedMessage;
        const formattedSuccess = formatBotTemplate(issueTemplate, {
          name: user.firstName || 'друг',
          subTypeName,
          format: subTypeName,
          otherFormat: isHapp ? 'INCY' : 'HAPP (crypt5)',
          totalServers,
          time: issuedTime,
          tz: issuedTz,
          key: displayKey,
          link: displayKey,
          hours,
          qrNotice: '📱 Скопируйте ключ выше для подключения в приложении:',
        });
        const successHtml = markdownToTelegramHtml(formattedSuccess);

        await this.tgApi(bot.token, 'sendMessage', {
          chat_id: chatId,
          text: successHtml,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: isHapp ? '📝 Запросить перевыпуск на INCY' : '📝 Запросить перевыпуск на HAPP (crypt5)',
                  callback_data: isHapp ? 'cmd_issue_incy' : 'cmd_issue_happ',
                },
                { text: '📋 Инструкция', callback_data: 'cmd_instructions' },
              ],
              [
                { text: '👤 Мой профиль', callback_data: 'cmd_profile' },
                { text: '📝 Сменить устройство', callback_data: 'cmd_request_unbind' },
              ],
              [{ text: '◀️ Главное меню', callback_data: 'cmd_menu' }],
            ],
          },
        });
      } catch (err: any) {
        console.error('[Telegram Bot] Failed to create subscription:', err);
        await this.tgApi(bot.token, 'sendMessage', {
          chat_id: chatId,
          text: `⚠️ <b>Произошла ошибка при получении подписки</b>\n\n${escapeHtml(err.message || 'Пожалуйста, повторите попытку через несколько секунд.')}`,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔄 Попробовать снова', callback_data: data }],
              [{ text: '💬 Написать в поддержку', url: bot.adminContactUrl || 'https://t.me/puls_admin' }],
            ],
          },
        });
      }
      return;
    }

    // Profile screen
    if (data === 'cmd_profile') {
      const isSubActive = Boolean(user.hasActiveSubscription);
      const isHapp = user.subscriptionType === 'happ';
      const displayKey = isSubActive ? await this.options.resolveUserDisplayKey(user) : '';
      if (isSubActive && displayKey) {
        user.finalSubscriptionUrl = displayKey;
        this.options.saveStore();
      }

      const boundDate = user.boundDevice ? new Date(user.boundDevice.boundAt).toLocaleString('ru-RU') : 'Не привязано (свободный слот)';
      const deviceName = user.boundDevice?.clientName || 'Ожидает первого подключения';
      const formatName = isHapp ? 'HAPP (crypt5)' : 'INCY';
      let statusText = isSubActive ? '🟢 Активна' : '⚪ Не получена';
      if (user.isBlocked || user.status === 'blocked') {
        statusText = `⛔ Заблокирована (Предупреждение [${user.sharingWarningCount || 1}])`;
      }

      const profileTemplate = bot.profileMessage || CANONICAL_BOT_TEMPLATES.profileMessage;
      const formattedMarkdown = formatBotTemplate(profileTemplate, {
        name: user.firstName || 'Пользователь',
        username: user.username,
        id: user.telegramId,
        telegramId: user.telegramId,
        format: formatName,
        subTypeName: formatName,
        otherFormat: isHapp ? 'INCY' : 'HAPP (crypt5)',
        status: statusText,
        device: deviceName,
        boundDate,
        date: boundDate,
        traffic: ((user.trafficUsedBytes || 0) / (1024 * 1024 * 1024)).toFixed(2) + ' ГБ (Без ограничений)',
        key: displayKey,
        link: displayKey,
      });

      let profileHtml = markdownToTelegramHtml(formattedMarkdown);

      if (user.sharingGraceDeadlineAt) {
        const deadlineDate = new Date(user.sharingGraceDeadlineAt);
        const untilStr = deadlineDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) + ' ' + deadlineDate.toLocaleDateString('ru-RU');
        profileHtml +=
          `\n\n⚠️ <b>ВНИМАНИЕ: ЗАФИКСИРОВАНА ПОПЫТКА ПЕРЕДАЧИ ПОДПИСКИ!</b>\n` +
          `Статус: <b>Блокировка (Сценарий 2)</b>\n` +
          `⏳ <b>Срок на удаление со 2-го устройства:</b> до ${untilStr}\n` +
          `<i>После того как второй человек удалит подписку, нажмите кнопку ниже:</i>`;
      }

      const actionButtons: any[] = [];
      if (user.secondDeviceActive || user.sharingGraceDeadlineAt || (user.isBlocked && user.sharingWarningCount)) {
        actionButtons.push([{ text: '✅ Второй пользователь удалил подписку', callback_data: 'cmd_second_device_removed' }]);
      }

      const buttons: any[] = isSubActive
        ? [
            ...actionButtons,
            [
              {
                text: isHapp ? '📝 Запросить перевыпуск на INCY' : '📝 Запросить перевыпуск на HAPP (crypt5)',
                callback_data: isHapp ? 'cmd_issue_incy' : 'cmd_issue_happ',
              },
              { text: '📋 Инструкция', callback_data: 'cmd_instructions' },
            ],
            [
              { text: '📝 Запросить смену устройства', callback_data: 'cmd_request_unbind' },
              { text: '💬 Поддержка', url: bot.adminContactUrl || 'https://t.me/puls_admin' },
            ],
            [{ text: '◀️ Главное меню', callback_data: 'cmd_menu' }],
          ]
        : [
            ...actionButtons,
            [{ text: '🔑 Получить подписку', callback_data: 'cmd_choose_format' }],
            [{ text: '◀️ Главное меню', callback_data: 'cmd_menu' }],
          ];

      await this.tgApi(bot.token, 'sendMessage', {
        chat_id: chatId,
        text: profileHtml,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: buttons,
        },
      });
      return;
    }

    // Instructions screen
    if (data === 'cmd_instructions') {
      const instructionsTpl = bot.instructionsMessage || CANONICAL_BOT_TEMPLATES.instructionsMessage;
      const formatted = formatBotTemplate(instructionsTpl, {
        name: user.firstName || 'друг',
        username: user.username,
        id: user.telegramId,
      });
      const instructionsText = markdownToTelegramHtml(formatted);

      await this.tgApi(bot.token, 'sendMessage', {
        chat_id: chatId,
        text: instructionsText,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🔑 Моя подписка', callback_data: 'cmd_choose_format' },
              { text: '👤 Мой профиль', callback_data: 'cmd_profile' },
            ],
            [{ text: '◀️ Главное меню', callback_data: 'cmd_menu' }],
          ],
        },
      });
      return;
    }

    // Request unbind screen
    if (data === 'cmd_request_unbind') {
      user.pendingUnbindRequest = true;
      this.options.saveStore();

      await this.tgApi(bot.token, 'sendMessage', {
        chat_id: chatId,
        text:
          `📝 <b>Смена привязанного устройства</b>\n\n` +
          `Текущее устройство: <b>${escapeHtml(user.boundDevice?.clientName || 'Привязано')}</b>\n\n` +
          `✍️ Пожалуйста, <b>напишите текстовым сообщением в ответ причину смены устройства</b> (например: «Купил новый телефон», «Переустановил систему»).\n\n` +
          `Сообщение сразу поступит администратору в панель управления. После сброса лимита вы сможете подключить новое устройство.`,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[{ text: '◀️ Отмена (Главное меню)', callback_data: 'cmd_menu' }]],
        },
      });
      return;
    }

    // Second device removed confirmation (Второй пользователь удалил подписку)
    if (data === 'cmd_second_device_removed') {
      if (this.options.resolveSecondDeviceRemoved) {
        const res = await this.options.resolveSecondDeviceRemoved(user);
        await this.tgApi(bot.token, 'sendMessage', {
          chat_id: chatId,
          text:
            `✅ <b>ПОДПИСКА УСПЕШНО ВОССТАНОВЛЕНА!</b>\n\n` +
            `Таймер бана остановлен, ключи из центральной подписки возвращены.\n` +
            `Предупреждение <b>[${user.sharingWarningCount || 1}]</b> сохранено в вашем профиле.\n\n` +
            `⚠️ Напоминаем: передача ссылки 2-му лицу строго запрещена. Повторная попытка приведет к немедленной блокировке.`,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '👤 Мой профиль', callback_data: 'cmd_profile' }],
              [{ text: '◀️ Главное меню', callback_data: 'cmd_menu' }],
            ],
          },
        });
      }
      return;
    }
  }

  private async sendFormatSelection(bot: any, chatId: number | string) {
    const chooseTemplate = bot.chooseFormatMessage || CANONICAL_BOT_TEMPLATES.chooseFormatMessage;
    const formattedMarkdown = formatBotTemplate(chooseTemplate, {});
    const htmlText = markdownToTelegramHtml(formattedMarkdown);

    await this.tgApi(bot.token, 'sendMessage', {
      chat_id: chatId,
      text: htmlText,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🚀 Выбрать HAPP (crypt5)', callback_data: 'cmd_issue_happ' },
            { text: '⚡ Выбрать INCY', callback_data: 'cmd_issue_incy' },
          ],
          [
            { text: '👤 Мой профиль', callback_data: 'cmd_profile' },
            { text: '📋 Инструкция', callback_data: 'cmd_instructions' },
          ],
          [{ text: '◀️ Главное меню', callback_data: 'cmd_menu' }],
        ],
      },
    });
  }

  private async sendMainMenu(bot: any, chatId: number | string, user: any) {
    const isSubActive = Boolean(user.hasActiveSubscription && user.finalSubscriptionUrl);
    const isHapp = user.subscriptionType === 'happ';
    const formatName = isHapp ? 'HAPP (crypt5)' : 'INCY';
    const welcomeTemplate = bot.welcomeMessage || CANONICAL_BOT_TEMPLATES.welcomeMessage;
    const welcomeFormatted = formatBotTemplate(welcomeTemplate, {
      name: user.firstName || 'друг',
      username: user.username,
      id: user.telegramId,
      channel: bot.channels[0]?.id || '@puls_channel',
      format: formatName,
      status: isSubActive ? '🟢 Активна' : '⚪ Не получена',
    });
    const welcomeHtml = markdownToTelegramHtml(welcomeFormatted);

    if (user.status === 'blocked' || user.isBlocked) {
      const blockedTemplate = bot.blockedUserMessage || CANONICAL_BOT_TEMPLATES.blockedUserMessage;
      const formattedBlocked = formatBotTemplate(blockedTemplate, {
        username: user.username ? `@${user.username}` : (user.firstName || 'Пользователь'),
        name: user.firstName || 'Пользователь',
        reason: user.subscriptionStatusReason || user.blockedReason || 'Нарушение правил использования',
      });
      const blockedHtml = markdownToTelegramHtml(formattedBlocked);

      const blockedButtons: any[] = [];
      if (
        user.secondDeviceActive ||
        user.sharingGraceDeadlineAt ||
        user.sharingWarningCount ||
        user.subscriptionStatusReason?.includes('устройств') ||
        user.subscriptionStatusReason?.includes('лицу') ||
        user.subscriptionStatusReason?.includes('передач')
      ) {
        blockedButtons.push([{ text: '✅ Второй пользователь удалил подписку', callback_data: 'cmd_second_device_removed' }]);
      }
      blockedButtons.push([{ text: '🔄 Проверить подписку на каналы', callback_data: 'cmd_verify_channel' }]);
      blockedButtons.push([{ text: '👤 Мой профиль', callback_data: 'cmd_profile' }]);
      blockedButtons.push([{ text: '📝 Подать заявку на разблокировку', callback_data: 'cmd_request_unblock' }]);
      blockedButtons.push([{ text: '💬 Связаться с администратором', url: bot.adminContactUrl || 'https://t.me/puls_admin' }]);

      await this.tgApi(bot.token, 'sendMessage', {
        chat_id: chatId,
        text: `${blockedHtml}\n\n` +
          `⛔ <b>Причина:</b> ${escapeHtml(user.subscriptionStatusReason || user.blockedReason || 'Блокировка')}`,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: blockedButtons,
        },
      });
      return;
    }

    if (isSubActive) {
      const text =
        `${welcomeHtml}\n\n` +
        `🔑 <b>У вас активна персональная подписка!</b>\n` +
        `🏷 Формат: <b>${formatName}</b>\n` +
        `📱 Доступ: 1 персональное устройство\n\n` +
        `Управляйте вашей подпиской через меню ниже:`;

      await this.tgApi(bot.token, 'sendMessage', {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: isHapp ? '📝 Запросить перевыпуск на INCY' : '📝 Запросить перевыпуск на HAPP (crypt5)',
                callback_data: isHapp ? 'cmd_issue_incy' : 'cmd_issue_happ',
              },
              { text: '👤 Мой профиль', callback_data: 'cmd_profile' },
            ],
            [
              { text: '📋 Инструкция', callback_data: 'cmd_instructions' },
              { text: '📝 Сменить устройство', callback_data: 'cmd_request_unbind' },
            ],
            [{ text: '💬 Поддержка', url: bot.adminContactUrl || 'https://t.me/puls_admin' }],
          ],
        },
      });
      return;
    }

    const text =
      `${welcomeHtml}\n\n` +
      `⚡ Получите персональный ключ высокоскоростного подключения прямо сейчас:`;

    await this.tgApi(bot.token, 'sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔑 Получить подписку', callback_data: 'cmd_choose_format' }],
          [
            { text: '📋 Инструкция по настройке', callback_data: 'cmd_instructions' },
            { text: '💬 Связаться с нами', url: bot.adminContactUrl || 'https://t.me/puls_admin' },
          ],
        ],
      },
    });
  }
}
