import { 
  SystemStatus, 
  GitSourceItem, 
  ManagedBotItem, 
  ReplacementTemplates, 
  ExclusionSubscription, 
  BotUser, 
  BroadcastPayload, 
  CentralSubscriptionFile, 
  CentralSubscriptionSavePayload,
  SubFormatConfig,
  FeedbackRequest,
  RepoUserFile,
  DockerConfig,
  SyncHealthReport,
  SystemLogEntry,
  DeepAuditResult,
  HappCryptVersion
} from '../types';

const API_BASE = '/api';

export async function fetchStatus(): Promise<SystemStatus> {
  const res = await fetch(`${API_BASE}/status`);
  if (!res.ok) throw new Error('Ошибка получения статуса системы');
  return res.json();
}

// Git Sources
export async function fetchGitSources(): Promise<{ gitSources: GitSourceItem[]; activeGitSourceId: string }> {
  const res = await fetch(`${API_BASE}/git-sources`);
  if (!res.ok) throw new Error('Ошибка загрузки источников Git');
  return res.json();
}

export async function saveGitSource(source: Partial<GitSourceItem>): Promise<{ success: boolean; gitSource: GitSourceItem; gitSources: GitSourceItem[] }> {
  const res = await fetch(`${API_BASE}/git-sources`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(source),
  });
  const data = await res.json();
  if (!res.ok || data.success === false) {
    throw new Error(data.message || 'Ошибка сохранения источника Git');
  }
  return data;
}

export async function testGitSource(id: string): Promise<{ success: boolean; message: string; source: GitSourceItem }> {
  const res = await fetch(`${API_BASE}/git-sources/${id}/test`, { method: 'POST' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка проверки источника Git');
  return data;
}

export async function activateGitSource(id: string): Promise<{ success: boolean; activeGitSourceId?: string; gitSources?: GitSourceItem[] }> {
  const res = await fetch(`${API_BASE}/git-sources/${id}/activate`, { method: 'POST' });
  if (!res.ok) throw new Error('Ошибка активации источника Git');
  return res.json();
}

export async function setDefaultGitSource(id: string): Promise<{ success: boolean; activeGitSourceId: string; gitSources: GitSourceItem[]; message: string }> {
  const res = await fetch(`${API_BASE}/git-sources/${id}/set-default`, { method: 'POST' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка назначения источника по умолчанию');
  return data;
}

export async function makeCentralGitSource(id: string): Promise<{ success: boolean; activeGitSourceId: string; gitSources: GitSourceItem[]; centralFile: any; message: string }> {
  const res = await fetch(`${API_BASE}/git-sources/${id}/make-central`, { method: 'POST' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка создания центрального источника');
  return data;
}

export async function deleteGitSource(id: string): Promise<{ success: boolean; gitSources: GitSourceItem[]; activeGitSourceId?: string }> {
  const res = await fetch(`${API_BASE}/git-sources/${id}`, { method: 'DELETE' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка удаления источника Git');
  return data;
}

// Managed Telegram Bots
export async function fetchBots(): Promise<{ bots: ManagedBotItem[]; activeBotId: string }> {
  const res = await fetch(`${API_BASE}/bots`);
  if (!res.ok) throw new Error('Ошибка загрузки Telegram ботов');
  return res.json();
}

export async function fetchSubscriptionSettings(): Promise<{ happCryptVersion: HappCryptVersion }> {
  const res = await fetch(`${API_BASE}/subscription-settings`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка загрузки формата HAPP');
  return data;
}

export async function saveHappCryptVersion(happCryptVersion: HappCryptVersion): Promise<{
  success: boolean;
  happCryptVersion: HappCryptVersion;
  updatedLinks: number;
  message: string;
}> {
  const res = await fetch(`${API_BASE}/subscription-settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ happCryptVersion }),
  });
  const data = await res.json();
  if (!res.ok || data.success === false) {
    throw new Error(data.message || 'Ошибка обновления формата HAPP');
  }
  return data;
}

export async function saveBot(bot: Partial<ManagedBotItem>): Promise<{ success: boolean; bot: ManagedBotItem; bots: ManagedBotItem[] }> {
  const res = await fetch(`${API_BASE}/bots`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bot),
  });
  if (!res.ok) throw new Error('Ошибка сохранения настроек бота');
  return res.json();
}

export async function testBot(id: string): Promise<{ success: boolean; message: string; bot: ManagedBotItem }> {
  const res = await fetch(`${API_BASE}/bots/${id}/test`, { method: 'POST' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка проверки бота');
  return data;
}

export async function activateBot(id: string): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/bots/${id}/activate`, { method: 'POST' });
  if (!res.ok) throw new Error('Ошибка активации бота');
  return res.json();
}

export async function deleteBot(id: string): Promise<{ success: boolean; bots: ManagedBotItem[]; activeBotId?: string }> {
  const res = await fetch(`${API_BASE}/bots/${id}`, { method: 'DELETE' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка удаления бота');
  return data;
}

// Replacement / Fallback Templates
export async function fetchReplacementTemplates(): Promise<{ templates: ReplacementTemplates }> {
  const res = await fetch(`${API_BASE}/replacement-templates`);
  if (!res.ok) throw new Error('Ошибка загрузки шаблонов заглушек');
  return res.json();
}

export async function saveReplacementTemplates(templates: Partial<ReplacementTemplates>): Promise<{ success: boolean; templates: ReplacementTemplates }> {
  const res = await fetch(`${API_BASE}/replacement-templates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(templates),
  });
  if (!res.ok) throw new Error('Ошибка сохранения шаблонов');
  return res.json();
}

// Exclusion Subscriptions
export async function fetchExclusions(): Promise<{ exclusions: ExclusionSubscription[] }> {
  const res = await fetch(`${API_BASE}/exclusions`);
  if (!res.ok) throw new Error('Ошибка загрузки подписок-исключений');
  return res.json();
}

export async function createExclusion(payload: { 
  name?: string; 
  notes?: string; 
  fileName?: string; 
  expiresAt?: string | null; 
  customNodes?: string[] 
}): Promise<{ success: boolean; exclusion: ExclusionSubscription; exclusions: ExclusionSubscription[] }> {
  const res = await fetch(`${API_BASE}/exclusions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Ошибка создания исключения');
  return res.json();
}

export async function deleteExclusion(id: string): Promise<{ success: boolean; exclusions: ExclusionSubscription[] }> {
  const res = await fetch(`${API_BASE}/exclusions/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Ошибка удаления исключения');
  return res.json();
}

export async function syncExclusion(id: string): Promise<{ success: boolean; exclusion: ExclusionSubscription; message: string }> {
  const res = await fetch(`${API_BASE}/exclusions/${id}/sync`, { method: 'POST' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка синхронизации исключения с GitVerse');
  return data;
}

export async function syncAllExclusions(): Promise<{ success: boolean; count: number; exclusions: ExclusionSubscription[]; message: string }> {
  const res = await fetch(`${API_BASE}/exclusions/sync-all`, { method: 'POST' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка синхронизации всех исключений');
  return data;
}

export async function shortenExclusionClck(id: string): Promise<{ success: boolean; clckUrl: string; exclusion: ExclusionSubscription }> {
  const res = await fetch(`${API_BASE}/exclusions/${id}/shorten-clck`, { method: 'POST' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка генерации ссылки clck.ru');
  return data;
}

export async function addExclusionClient(id: string, payload: { ip?: string; userAgent?: string; clientType?: string; deviceId?: string; note?: string }): Promise<{ success: boolean; client: any; connectedClients: any[]; exclusion: ExclusionSubscription }> {
  const res = await fetch(`${API_BASE}/exclusions/${id}/clients`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка добавления клиента');
  return data;
}

export async function deleteExclusionClient(id: string, clientId: string): Promise<{ success: boolean; connectedClients: any[]; exclusion: ExclusionSubscription }> {
  const res = await fetch(`${API_BASE}/exclusions/${id}/clients/${clientId}`, { method: 'DELETE' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка отключения клиента');
  return data;
}

export async function createChannelExclusion(payload: {
  telegramId?: number;
  username?: string;
  firstName?: string;
  format?: 'happ' | 'incy';
  channelMembership?: string;
  notes?: string;
  graceHours?: number;
  graceMinutes?: number;
}): Promise<{ success: boolean; exclusion: ExclusionSubscription; user: any; exclusions: ExclusionSubscription[]; message: string }> {
  const res = await fetch(`${API_BASE}/exclusions/channel-grant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка создания исключения из центр. источника');
  return data;
}

export async function resetExclusionSharingWarning(id: string): Promise<{ success: boolean; exclusion: ExclusionSubscription; user: any; message: string }> {
  const res = await fetch(`${API_BASE}/exclusions/${id}/reset-sharing-warning`, { method: 'POST' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка сброса предупреждения');
  return data;
}

export async function unbindExclusionDevice(id: string): Promise<{ success: boolean; exclusion: ExclusionSubscription; user: any; message: string }> {
  const res = await fetch(`${API_BASE}/exclusions/${id}/unbind-device`, { method: 'POST' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка отвязки устройства');
  return data;
}

export async function verifyExclusionChannel(id: string): Promise<{ success: boolean; isSubscribed: boolean; exclusion: ExclusionSubscription; user: any; message: string }> {
  const res = await fetch(`${API_BASE}/exclusions/${id}/verify-channel`, { method: 'POST' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка проверки подписки на канал');
  return data;
}

export async function forceBanExclusion(id: string): Promise<{ success: boolean; exclusion: ExclusionSubscription; user: any; message: string }> {
  const res = await fetch(`${API_BASE}/exclusions/${id}/force-ban`, { method: 'POST' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка блокировки пользователя');
  return data;
}

export async function saveUserCustomSubscription(
  userId: string,
  payload: {
    detachedFromCentral?: boolean;
    bypassBlock?: boolean;
    personalNodes?: string[];
    excludedNodes?: string[];
    customSubscriptionContent?: string;
    customNotes?: string;
    resyncGitVerse?: boolean;
  }
): Promise<{ success: boolean; message: string; user: BotUser }> {
  const res = await fetch(`${API_BASE}/users/${userId}/custom-subscription`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка сохранения индивидуальной подписки');
  return data;
}

export async function shortenUserClck(userId: string): Promise<{ success: boolean; clckUrl: string; user: BotUser }> {
  const res = await fetch(`${API_BASE}/users/${userId}/shorten-clck`, { method: 'POST' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка создания ссылки clck.ru для пользователя');
  return data;
}

// Users & Granular Actions
export async function fetchUsers(): Promise<{ users: BotUser[] }> {
  const res = await fetch(`${API_BASE}/users`);
  if (!res.ok) throw new Error('Ошибка загрузки списка пользователей');
  return res.json();
}

export async function addUser(user: { 
  telegramId: number; 
  username?: string; 
  firstName?: string; 
  lastName?: string; 
  channelMembership?: string;
  subscriptionType?: string;
  subscriptionName?: string;
}): Promise<{ success: boolean; user: BotUser }> {
  const res = await fetch(`${API_BASE}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(user),
  });
  if (!res.ok) throw new Error('Ошибка добавления пользователя');
  return res.json();
}

export async function muteUser(id: string, durationMinutes: number): Promise<{ success: boolean; message: string; user: BotUser }> {
  const res = await fetch(`${API_BASE}/users/${id}/mute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ durationMinutes }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка заглушения пользователя');
  return data;
}

export async function unmuteUser(id: string): Promise<{ success: boolean; message: string; user: BotUser }> {
  const res = await fetch(`${API_BASE}/users/${id}/unmute`, { method: 'POST' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка разблокировки');
  return data;
}

export async function blockUser(id: string, reason?: string): Promise<{ success: boolean; message: string; user: BotUser }> {
  const res = await fetch(`${API_BASE}/users/${id}/block`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка блокировки пользователя');
  return data;
}

export async function unblockUser(id: string): Promise<{ success: boolean; message: string; user: BotUser }> {
  const res = await fetch(`${API_BASE}/users/${id}/unblock`, { method: 'POST' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка снятия блокировки');
  return data;
}

export async function forceUnlockUser(id: string): Promise<{ success: boolean; message: string; user: BotUser }> {
  const res = await fetch(`${API_BASE}/users/${id}/force-unlock`, { method: 'POST' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка принудительной разблокировки (Force Unlock)');
  return data;
}

export async function savePersonalNodes(id: string, nodes: string[]): Promise<{ success: boolean; message: string; user: BotUser }> {
  const res = await fetch(`${API_BASE}/users/${id}/personal-nodes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nodes }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка сохранения персональных узлов');
  return data;
}

export async function unbindUserDevice(id: string, resetLimits: boolean = true): Promise<{ success: boolean; message: string; user: BotUser }> {
  const res = await fetch(`${API_BASE}/users/${id}/unbind-device`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resetLimits }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка отвязки устройства');
  return data;
}

export async function bindUserDevice(id: string, clientName?: string): Promise<{ success: boolean; message: string; user: BotUser }> {
  const res = await fetch(`${API_BASE}/users/${id}/bind-device`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientName }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка привязки устройства');
  return data;
}

export async function deleteUser(id: string): Promise<{ success: boolean; message?: string; warning?: string }> {
  const res = await fetch(`${API_BASE}/users/${id}`, { method: 'DELETE' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка удаления пользователя');
  return data;
}

// Broadcasting
export async function sendBroadcast(payload: BroadcastPayload): Promise<{ success: boolean; message: string; record: any }> {
  const res = await fetch(`${API_BASE}/broadcast`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка выполнения рассылки');
  return data;
}

// Central Subscription File
export async function fetchCentralFile(): Promise<CentralSubscriptionFile & { stats: any }> {
  const res = await fetch(`${API_BASE}/central-file`);
  if (!res.ok) throw new Error('Ошибка загрузки центральной подписки');
  return res.json();
}

export async function saveCentralFile(payload: Partial<CentralSubscriptionSavePayload> & { content: string }): Promise<{
  success: boolean;
  message: string;
  centralFile: CentralSubscriptionFile & { stats: any };
  syncResult?: { syncedUsers: number; syncedExclusions: number; durationMs: number; errors: string[] };
}> {
  const res = await fetch(`${API_BASE}/central-file`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok || data.success === false) {
    throw new Error(data.message || 'Ошибка сохранения подписки');
  }
  return data;
}

export async function syncCentralFileWithGit(direction: 'push' | 'pull', centralRawUrl?: string, content?: string): Promise<{ success: boolean; message: string; syncedAt: string; stats?: any; content?: string }> {
  const res = await fetch(`${API_BASE}/central-file/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ direction, centralRawUrl, content }),
  });
  const data = await res.json();
  if (!res.ok || data.success === false) {
    throw new Error(data.message || data.error || 'Ошибка синхронизации с Git-репозиторием');
  }
  return data;
}

// Explicit button trigger: Propagate central source into all eligible subscriber files
export async function syncCentralToSubscribers(): Promise<{
  success: boolean;
  message: string;
  syncResult: {
    syncedUsers: number;
    syncedExclusions: number;
    durationMs: number;
    errors: string[];
    totalUsers: number;
    centralContentBytes: number;
    centralContentHash: string;
    skippedUsers: {
      noActiveSubscription: number;
      inactiveStatus: number;
      leftChannel: number;
      blocked: number;
      muted: number;
      detachedFromCentral: number;
      missingFilePath: number;
    };
    skippedUnchanged?: number;
    pushedCount?: number;
  };
  stats: any;
}> {
  const res = await fetch(`${API_BASE}/central-file/sync-subscribers?force=true&wait=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка синхронизации с подписками пользователей');
  return data;
}

// Configurable auto-sync frequency (1s default, 2s, 5s, etc.)
export async function updateCentralAutoSyncConfig(intervalSeconds: number, enabled?: boolean): Promise<{
  success: boolean;
  message: string;
  centralFile: CentralSubscriptionFile;
}> {
  const res = await fetch(`${API_BASE}/central-file/auto-sync-config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ intervalSeconds, enabled }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка обновления интервала синхронизации');
  return data;
}

// Comprehensive sync of all channel subscribers & administrators via Telegram API
export async function syncAllChannelSubscribers(botId?: string): Promise<{
  success: boolean;
  message: string;
  channels: any[];
  totalUsersCount: number;
  newUsersAdded: number;
}> {
  const res = await fetch(`${API_BASE}/channels/sync-all`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ botId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка синхронизации подписчиков каналов');
  return data;
}

// User Multi-Layout Subscriptions
export async function fetchUserSubConfigs(userId: string): Promise<{ user: BotUser; configs: SubFormatConfig[]; subscriptionUrl: string }> {
  const res = await fetch(`${API_BASE}/subscriptions/user/${userId}`);
  if (!res.ok) throw new Error('Ошибка генерации макетов подписки');
  return res.json();
}

// Interactive Bot Simulation
export async function simulateBotMessage(payload: {
  text?: string;
  callbackData?: string;
  user?: any;
  clientTime?: string;
  clientTimeZone?: string;
}): Promise<{ response: any }> {
  const localTime = new Date().toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'местное время';

  const res = await fetch(`${API_BASE}/bot/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientTime: localTime,
      clientTimeZone: localTz,
      ...payload,
    }),
  });
  if (!res.ok) throw new Error('Ошибка симуляции бота');
  return res.json();
}

export async function verifyUserChannelsLive(userId: string): Promise<{
  success: boolean;
  allSubscribed: boolean;
  missingChannels: any[];
  botNeedsAdminIn?: any[];
  user?: BotUser;
  message: string;
}> {
  const res = await fetch(`${API_BASE}/users/${userId}/verify-channels`, {
    method: 'POST',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка проверки каналов');
  return data;
}

// Feedback & Unblock/Unbind Requests
export async function fetchFeedbackRequests(): Promise<{ requests: FeedbackRequest[] }> {
  const res = await fetch(`${API_BASE}/feedback`);
  if (!res.ok) throw new Error('Ошибка загрузки заявок обратной связи');
  return res.json();
}

export async function resolveFeedbackUnblockAndUnbind(requestId: string): Promise<{ success: boolean; message: string; user?: BotUser; request: FeedbackRequest }> {
  const res = await fetch(`${API_BASE}/feedback/${requestId}/unblock-and-unbind`, {
    method: 'POST',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка разблокировки и отвязки устройства');
  return data;
}

export async function resolveFeedbackUnblock(requestId: string): Promise<{ success: boolean; message: string; user?: BotUser; request: FeedbackRequest }> {
  const res = await fetch(`${API_BASE}/feedback/${requestId}/unblock`, {
    method: 'POST',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка разблокировки подписки');
  return data;
}

export async function resolveFeedbackUnbind(requestId: string): Promise<{ success: boolean; message: string; user?: BotUser; request: FeedbackRequest }> {
  const res = await fetch(`${API_BASE}/feedback/${requestId}/resolve-unbind`, {
    method: 'POST',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка обработки заявки на отвязку');
  return data;
}

export async function deleteFeedbackRequest(requestId: string): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/feedback/${requestId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Ошибка удаления заявки');
  return res.json();
}

export async function terminateFeedbackUser(requestId: string): Promise<{ success: boolean; message: string; user?: BotUser; request: FeedbackRequest }> {
  const res = await fetch(`${API_BASE}/feedback/${requestId}/terminate`, {
    method: 'POST',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка аннулирования подписки');
  return data;
}

// Generate an automatic unblock request coming from a bot user
export async function generateBotUnblockRequest(scenario?: 'bot_deleted' | 'device_binding' | 'limit_exceeded'): Promise<{
  success: boolean;
  message: string;
  request: FeedbackRequest;
  user?: BotUser;
}> {
  const res = await fetch(`${API_BASE}/feedback/generate-bot-request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenario }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка генерации заявки из бота');
  return data;
}

export async function terminateUserSubscription(userId: string): Promise<{ success: boolean; message: string; user?: BotUser }> {
  const res = await fetch(`${API_BASE}/users/${userId}/terminate`, {
    method: 'POST',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка аннулирования подписки пользователя');
  return data;
}

export async function simulateTier(
  userId: string, 
  tier: 1 | 2 | 3, 
  action?: 'trigger' | 'revert'
): Promise<{ success: boolean; message: string; user?: BotUser; attempts?: number; escalatedToTier3?: boolean }> {
  const res = await fetch(`${API_BASE}/users/${userId}/simulate-tier`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tier, action }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка имитации уровня');
  return data;
}

// Subscription Files Pool & Link Verification
export async function fetchRepoFiles(): Promise<{
  files: RepoUserFile[];
  counts: {
    total: number;
    freeCount: number;
    assignedCount: number;
    verifiedCount: number;
  };
  activeGit: GitSourceItem;
}> {
  const res = await fetch(`${API_BASE}/repo-files`);
  if (!res.ok) throw new Error('Ошибка загрузки файлов подписок из репозитория');
  return res.json();
}

export async function checkRepoFileUrl(url: string, filePath?: string): Promise<{
  success: boolean;
  isAccessible: boolean;
  status: number;
  latencyMs: number;
  sizeBytes: number;
  nodesCount: number;
  preview: string;
  url: string;
  message?: string;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/repo-files/check-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, filePath }),
  });
  return res.json();
}

export async function generateFreeRepoFiles(count: number = 3): Promise<{
  success: boolean;
  message: string;
  created: RepoUserFile[];
  totalFree: number;
}> {
  const res = await fetch(`${API_BASE}/repo-files/generate-free`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ count }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка генерации свободных ссылок');
  return data;
}

export async function deleteRepoFile(filePath: string): Promise<{ success: boolean; removed: number }> {
  const res = await fetch(`${API_BASE}/repo-files/${encodeURIComponent(filePath)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Ошибка удаления файла подписки');
  return res.json();
}

export async function pushAllRepoFiles(): Promise<{
  success: boolean;
  message: string;
  totalSynced: number;
  files: RepoUserFile[];
  activeGit?: GitSourceItem;
}> {
  const res = await fetch(`${API_BASE}/repo-files/push-all`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка фиксации файлов в репозитории');
  return data;
}

// Docker Configuration & Service Supervisor
export async function fetchDockerConfig(): Promise<{
  success: boolean;
  dockerConfig: DockerConfig;
  dockerRunCmd: string;
  dockerComposeYaml: string;
  uptimeSeconds: number;
  serverTime: string;
}> {
  const res = await fetch(`${API_BASE}/docker-config`);
  if (!res.ok) throw new Error('Ошибка получения настроек Docker');
  return res.json();
}

export async function saveDockerConfig(config: Partial<DockerConfig>): Promise<{
  success: boolean;
  message: string;
  dockerConfig: DockerConfig;
  dockerRunCmd: string;
  dockerComposeYaml: string;
}> {
  const res = await fetch(`${API_BASE}/docker-config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка сохранения настроек Docker');
  return data;
}

export async function triggerDockerRestart(): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/docker-restart`, { method: 'POST' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка запроса перезапуска');
  return data;
}

// Vercel Serverless Configuration & Deployment
export interface VercelEnvVar {
  key: string;
  value: string;
  description: string;
  required: boolean;
}

export interface VercelConfigResponse {
  success: boolean;
  vercelJson: string;
  envVarsList: VercelEnvVar[];
  envVarsText: string;
  cliCommands: {
    install: string;
    login: string;
    deployDev: string;
    deployProd: string;
  };
  webhookInfo: any;
  activeBot: {
    id: string;
    name: string;
    username: string;
    hasToken: boolean;
  } | null;
  savedVercelConfig?: {
    lastWebhookUrl?: string;
    lastWebhookSetAt?: string;
    customDomain?: string;
  };
  serverlessTips: string[];
}

export async function fetchVercelConfig(): Promise<VercelConfigResponse> {
  const res = await fetch(`${API_BASE}/vercel-config`);
  if (!res.ok) throw new Error('Ошибка получения параметров Vercel');
  return res.json();
}

export async function setVercelWebhook(webhookUrl: string, dropPending = true): Promise<{
  success: boolean;
  message: string;
  fullWebhookUrl?: string;
  telegramResult?: any;
}> {
  const res = await fetch(`${API_BASE}/vercel/set-webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ webhookUrl, dropPending }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка установки Webhook на Vercel');
  return data;
}

export async function deleteVercelWebhook(): Promise<{
  success: boolean;
  message: string;
  telegramResult?: any;
}> {
  const res = await fetch(`${API_BASE}/vercel/delete-webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка сброса Webhook');
  return data;
}

export async function fetchVercelWebhookInfo(): Promise<{
  success: boolean;
  webhookInfo: any;
}> {
  const res = await fetch(`${API_BASE}/vercel/webhook-info`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка запроса статуса Webhook');
  return data;
}

export async function testVercelDeployment(targetUrl: string): Promise<{
  success: boolean;
  message: string;
  latencyMs?: number;
  statusData?: any;
}> {
  const res = await fetch(`${API_BASE}/vercel/test-deployment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetUrl }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка тестирования адреса Vercel');
  return data;
}

// 3-Source System & Device Violation Testing
export async function testDeviceViolation(userId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/users/${userId}/test-violation`, { method: 'POST' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка тестирования нарушения устройства');
  return data;
}

export async function testReplacementSource(sourceNum: 1 | 2 | 3 | 4): Promise<any> {
  const res = await fetch(`${API_BASE}/replacement-templates/test-source/${sourceNum}`, { method: 'POST' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка проверки источника');
  return data;
}

// Firebase Cloud Synchronization
export async function fetchFirebaseStatus(): Promise<any> {
  const res = await fetch(`${API_BASE}/firebase/status`);
  if (!res.ok) throw new Error('Ошибка получения статуса Firebase');
  return res.json();
}

export async function syncFirebase(): Promise<any> {
  const res = await fetch(`${API_BASE}/firebase/sync`, { method: 'POST' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка синхронизации с Firebase');
  return data;
}

export async function reloadFirebase(): Promise<any> {
  const res = await fetch(`${API_BASE}/firebase/reload`, { method: 'POST' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка перезагрузки из Firebase');
  return data;
}

// Sync Health & Consistency Reconciliation
export async function fetchSyncHealth(): Promise<SyncHealthReport> {
  const res = await fetch(`${API_BASE}/sync/health`);
  if (!res.ok) throw new Error('Ошибка получения отчета о здоровье синхронизации');
  return res.json();
}

export async function forceResyncUser(userId: string): Promise<{
  success: boolean;
  message: string;
  user: BotUser;
  nodesCount?: number;
}> {
  const res = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}/force-resync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка принудительной синхронизации');
  return data;
}

export async function forceResyncAllInconsistent(): Promise<{
  success: boolean;
  message: string;
  report: SyncHealthReport;
  result: any;
}> {
  const res = await fetch(`${API_BASE}/sync/force-all-inconsistent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка синхронизации всех пользователей');
  return data;
}

// Processor Remote Fetch & HAPP Crypt5 Decoder
export async function fetchRemoteSubscriptionUrl(url: string): Promise<{
  success: boolean;
  url: string;
  content: string;
  nodesCount: number;
  stats: any;
}> {
  const res = await fetch(`${API_BASE}/processor/fetch-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка загрузки подписки по ссылке');
  return data;
}

export async function decodeHappLink(url: string): Promise<{
  success: boolean;
  rawInput: string;
  decodedText: string;
  isUrl: boolean;
  fetchedContent: string | null;
  stats: any;
}> {
  const res = await fetch(`${API_BASE}/processor/decode-happ`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка декодирования HAPP ссылки');
  return data;
}

export async function encodeGatewayOutput(payload: {
  content?: string;
  token?: string;
  gatewayUrl?: string;
  format?: 'happ' | 'clck' | 'both';
}): Promise<{
  success: boolean;
  token: string;
  gatewayUrl: string;
  targetSubUrl: string;
  happUrl: string;
  clckUrl: string;
  contentBase64?: string;
  transformedAt: string;
}> {
  const res = await fetch(`${API_BASE}/processor/encode-gateway`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка кодирования шлюза');
  return data;
}

// -------------------------------------------------------------
// Multi-Database Management & Migration API (Firebase <-> Vercel KV)
// -------------------------------------------------------------
export interface DatabaseStatusResponse {
  success: boolean;
  activeBackend: 'firebase' | 'vercel_kv' | 'hybrid' | 'local_file';
  autoDualWrite: boolean;
  firebase: {
    connected: boolean;
    mode: string;
    documentPath: string;
    projectId?: string;
    databaseId?: string;
  };
  vercelKv: {
    isConfigured: boolean;
    urlConfigured: boolean;
    tokenConfigured: boolean;
    maskedUrl?: string;
  };
  migration: {
    lastMigratedAt: string | null;
    lastMigratedDirection: string | null;
  };
  counts: {
    users: number;
    bots: number;
    gitSources: number;
    exclusions: number;
    repoFiles: number;
  };
  lastSavedAt: string;
}

export async function fetchDatabaseStatus(): Promise<DatabaseStatusResponse> {
  const res = await fetch(`${API_BASE}/database/status`);
  if (!res.ok) throw new Error('Ошибка получения статуса базы данных');
  return res.json();
}

export async function configureDatabase(params: {
  activeBackend?: 'firebase' | 'vercel_kv' | 'hybrid' | 'local_file';
  kvRestApiUrl?: string;
  kvRestApiToken?: string;
  autoDualWrite?: boolean;
}): Promise<{ success: boolean; message: string; storageConfig: any }> {
  const res = await fetch(`${API_BASE}/database/configure`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка сохранения конфигурации базы данных');
  return data;
}

export async function testVercelKvConnection(url?: string, token?: string): Promise<{
  success: boolean;
  latencyMs: number;
  message: string;
}> {
  const res = await fetch(`${API_BASE}/database/test-kv`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, token }),
  });
  const data = await res.json();
  return data;
}

export async function migrateDatabase(direction: 'firebase_to_vercel' | 'vercel_to_firebase'): Promise<{
  success: boolean;
  message: string;
  direction: string;
  counts: { users: number; bots: number; gitSources: number };
  latencyMs: number;
}> {
  const res = await fetch(`${API_BASE}/database/migrate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ direction }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка миграции базы данных');
  return data;
}

export async function importDatabaseDump(storeDump: any): Promise<{
  success: boolean;
  message: string;
  counts: { users: number; bots: number; gitSources: number };
}> {
  const res = await fetch(`${API_BASE}/database/import-dump`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store: storeDump }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка восстановления дампа');
  return data;
}

// Deep Audit and Force Sync bypassing all caches
export async function deepAuditAndForceSync(): Promise<{
  success: boolean;
  message: string;
  audit: DeepAuditResult;
}> {
  const res = await fetch(`${API_BASE}/sync/deep-audit-force`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка выполнения глубокого аудита');
  return data;
}

// Realtime System Logs
export async function fetchSystemLogs(params?: {
  category?: string;
  level?: string;
  limit?: number;
  search?: string;
}): Promise<{
  logs: SystemLogEntry[];
  total: number;
  totalUnfiltered: number;
}> {
  const query = new URLSearchParams();
  if (params?.category) query.set('category', params.category);
  if (params?.level) query.set('level', params.level);
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.search) query.set('search', params.search);

  const res = await fetch(`${API_BASE}/logs?${query.toString()}`);
  if (!res.ok) throw new Error('Ошибка загрузки журнала системы');
  return res.json();
}

export async function clearSystemLogs(): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/logs`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Ошибка очистки журнала');
  return res.json();
}

export async function exportSystemLogs(format: 'json' | 'text' = 'json'): Promise<Blob> {
  const res = await fetch(`${API_BASE}/logs/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format }),
  });
  if (!res.ok) throw new Error('Ошибка экспорта журнала');
  return res.blob();
}

// Temporary Exclusion (Тестовые ссылки со своим сроком действия и отдельной строкой ключей)
export async function createTemporaryExclusion(payload: {
  name: string;
  durationValue: number;
  durationUnit: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'years';
  customContent: string;
  attachToCentral?: boolean;
  notes?: string;
  fileName?: string;
  expiresAt?: string;
}): Promise<{ success: boolean; exclusion: ExclusionSubscription; exclusions: ExclusionSubscription[] }> {
  const res = await fetch(`${API_BASE}/exclusions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...payload,
      isTemporary: true,
      attachToCentral: Boolean(payload.attachToCentral),
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка создания временного исключения');
  return data;
}

export async function renewTemporaryExclusion(
  id: string,
  payload: {
    durationValue?: number;
    durationUnit?: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'years';
    expiresAt?: string;
  }
): Promise<{ success: boolean; exclusion: ExclusionSubscription; message: string }> {
  const res = await fetch(`${API_BASE}/exclusions/${id}/renew`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка продления временной ссылки');
  return data;
}

export async function updateExclusionContent(
  id: string,
  payload: {
    customContent?: string;
    attachToCentral?: boolean;
    name?: string;
    notes?: string;
    fullReplace?: boolean;
  }
): Promise<{ success: boolean; exclusion: ExclusionSubscription; message: string }> {
  const res = await fetch(`${API_BASE}/exclusions/${id}/update-content`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка обновления содержимого исключения');
  return data;
}

export async function fetchExclusionFileContent(id: string): Promise<{
  success: boolean;
  content: string;
  customContent: string;
  attachToCentral: boolean;
  gitFilePath?: string;
  gitRawUrl?: string;
}> {
  const res = await fetch(`${API_BASE}/exclusions/${id}/file-content`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка чтения файла исключения');
  return data;
}

export async function updateExceptionNode(
  id: string,
  payload: {
    nodeIndex?: number;
    nodeContent?: string;
    action?: 'update' | 'add' | 'delete' | 'set_all';
    fullPayload?: string;
    attachToCentral?: boolean;
    name?: string;
    notes?: string;
  }
): Promise<{ success: boolean; exclusion: ExclusionSubscription; user?: any; message: string }> {
  const res = await fetch(`${API_BASE}/exclusions/${id}/node`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка обновления узла исключения');
  return data;
}

// Bulk Actions on Users (Массовые действия над пользователями)
export async function bulkUserAction(payload: {
  action: 'mute' | 'unmute' | 'block' | 'unblock' | 'delete' | 'send_message';
  userIds: string[];
  durationMinutes?: number;
  reason?: string;
  message?: string;
  mediaType?: string;
  mediaUrl?: string;
  buttonText?: string;
  buttonUrl?: string;
}): Promise<{
  success: boolean;
  message: string;
  affectedCount: number;
  users?: BotUser[];
}> {
  const res = await fetch(`${API_BASE}/users/bulk-action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка выполнения массового действия');
  return data;
}

// Снять таймер бана и восстановить ключи при удалении подписки со 2-го устройства
export async function resolveSecondDevice(userId: string): Promise<{
  success: boolean;
  message: string;
  user: BotUser;
}> {
  const res = await fetch(`${API_BASE}/users/${userId}/resolve-second-device`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Ошибка снятия таймера и восстановления подписки');
  return data;
}

export const resolveSecondDeviceRemoved = resolveSecondDevice;

// -------------------------------------------------------------
// Russian Relay Gateway (Yandex Cloud Functions / Russian Serverless)
// -------------------------------------------------------------
export async function fetchRelayGatewayConfig(): Promise<{
  success: boolean;
  config: import('../types').RelayGatewayConfig;
  backendUrl: string;
  yandexCodeSnippet: string;
  begetCodeSnippet?: string;
  htaccessSnippet?: string;
  cloudflareCodeSnippet?: string;
}> {
  const res = await fetch(`${API_BASE}/relay-gateway`);
  return res.json();
}

export async function saveRelayGatewayConfig(config: Partial<import('../types').RelayGatewayConfig>): Promise<{
  success: boolean;
  message: string;
  config: import('../types').RelayGatewayConfig;
}> {
  const res = await fetch(`${API_BASE}/relay-gateway/configure`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  return res.json();
}

export async function testRelayGateway(customUrl?: string): Promise<{
  success: boolean;
  latencyMs: number;
  message: string;
  missingHtaccess?: boolean;
}> {
  const res = await fetch(`${API_BASE}/relay-gateway/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: customUrl }),
  });
  return res.json();
}

export async function triggerManualGatewayAudit(): Promise<{
  success: boolean;
  message: string;
  auditStats: {
    inspectedUsersCount: number;
    syncedEligibleCount: number;
    stubsAppliedCount: number;
    message: string;
  };
  config: import('../types').RelayGatewayConfig;
}> {
  const res = await fetch(`${API_BASE}/relay-gateway/manual-audit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  return res.json();
}

// Alias for manual gateway sync pass
export const runGatewayPass = triggerManualGatewayAudit;
