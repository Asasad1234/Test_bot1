export type GitProvider = 'gitverse' | 'sourcecraft' | 'gitflic' | 'moshub' | 'github' | 'gitlab' | 'custom';
export type BotSettingsCaptchaType = 'none' | 'button' | 'math';
export type MediaType = 'none' | 'photo' | 'video' | 'document';
export type UserSubStatus = 'active' | 'blocked' | 'muted' | 'channel_inactive' | 'unsubscribed' | 'bot_blocked';
export type ChannelMembershipStatus = 'creator' | 'administrator' | 'member' | 'restricted' | 'left' | 'kicked';
export type SubscriptionType = 'happ' | 'incy' | 'single_device_ru' | 'standard' | 'exception';
export type HappCryptVersion = 'crypt3' | 'crypt4' | 'crypt5';

export interface GitSourceItem {
  id: string;
  name: string;
  provider: GitProvider;
  apiUrl: string;
  token: string;
  username: string;
  repository: string;
  branch: string;
  filePath: string;
  centralRawUrl?: string;
  baseRawUrl?: string;
  enabled: boolean;
  autoSync: boolean;
  isDefault?: boolean;
  status: 'connected' | 'error' | 'not_configured';
  lastSyncAt: string | null;
  errorMessage?: string;
}

export interface BotChannelBinding {
  id: string; // e.g. '@channel_name' or '-100123456789'
  title: string;
  isRequired: boolean;
  isBotAdmin: boolean;
  memberCount?: number;
  inviteLink?: string;
}

export interface ManagedBotItem {
  id: string;
  name: string;
  token: string;
  username: string;
  botId?: string | number;
  enabled: boolean;
  status: 'connected' | 'error' | 'not_configured';
  channels: BotChannelBinding[];
  adminContactUrl: string; // url or @username for dispute
  blockedUserMessage: string;
  unsubscribedMessage: string;
  selfDeleteHours: number; // e.g. 72h before subscription is wiped if not rejoined
  deletePreviousMessageOnStep: boolean;
  captchaType: BotSettingsCaptchaType;
  welcomeMessage: string;
  privacyPolicyText: string;
  privacyPolicyUrl: string;
  mediaType: MediaType;
  mediaUrl: string;
  showQrCode?: boolean; // Toggle QR code display in bot messages
  enableFireworks?: boolean; // Toggle visual fireworks / confetti on sub issue
  buttonColor?: string; // e.g. 'indigo' | 'emerald' | 'amber' | 'rose' | 'sky' | 'violet' | 'stone'
  channelNoticeMessage?: string; // Custom message when channels subscription required
  chooseFormatMessage?: string; // Custom message when choosing format (HAPP / INCY)
  subIssuedMessage?: string; // Custom template for issued subscription
  profileMessage?: string; // Custom template for profile info
  instructionsMessage?: string; // Custom template for instructions
  timeZone?: string; // e.g. 'Europe/Moscow', 'UTC', 'device'
  errorMessage?: string;
}

export interface ReplacementTemplates {
  unsubscribedNodeName: string;
  unsubscribedNotice: string;
  blockedNodeName: string;
  blockedNotice: string;
  mutedNodeName: string;
  mutedNotice: string;
  botDeletedNotice: string;
  enableFireworks?: boolean; // Global toggle for celebratory visual effects
  defaultButtonColor?: string; // Global default button color
  singleDeviceBlockedNotice?: string; // Message displayed when attempt to use on second device
  
  // 3-Source Replacement System (Система 3 источников замены)
  source1Name?: string; // Название: Источник 1 (При отписке / удалении бота)
  source1RawUrl?: string; // Ссылка на сырой файл (RAW URL) серверов для источника 1
  source1Content?: string; // Список узлов/заглушка для GitVerse файла при отписке
  source1Message?: string; // Сообщение в боте при выходе из обязательного канала
  maxChannelLeftCount?: number; // Лимит отписок до перманентного бана (0 = без лимита)

  source2Name?: string; // Название: Источник 2 (Защита: попытка 2-го устройства)
  source2RawUrl?: string; // Ссылка на сырой файл (RAW URL) серверов для источника 2
  source2Content?: string; // Список узлов/заглушка для GitVerse файла при нарушении 1 подписка = 1 устройство
  source2BlockHours?: number; // Срок блокировки в часах (по умолчанию 24)
  source2MaxAttempts?: number; // Максимум попыток до перманентного бана (по умолчанию 3)
  source2WarningMessage?: string; // Текст предупреждения в боте с количеством оставшихся попыток
  source2GracePeriodHours?: number; // Срок на удаление вторым пользователем в часах (по умолчанию 2 ч.)
  source2GracePeriodMinutes?: number; // Срок на удаление вторым пользователем в минутах (по умолчанию 0 мин.)
  source2GraceNotice?: string; // Уведомление о таймере до бана при передаче подписки

  source3Name?: string; // Название: Источник 3 (Перманентный бан)
  source3RawUrl?: string; // Ссылка на сырой файл (RAW URL) серверов для источника 3
  source3Content?: string; // Список узлов/заглушка для GitVerse файла при перманентном бане
  source3BanMessage?: string; // Текст уведомления о перманентном бане в боте

  // Source 4 (Дополнительный / Пользовательский источник)
  source4Enabled?: boolean;
  source4Name?: string;
  source4RawUrl?: string;
  source4Content?: string;
  source4Description?: string;
}

export interface CentralSubscriptionFile {
  filename: string;
  content: string;
  sha?: string;
  lastCommitMessage?: string;
  lastUpdatedAt: string;
  isSyncedWithRepo: boolean;
  autoSyncEnabled: boolean;
  autoSyncIntervalSeconds?: number; // Configurable frequency: 1s default, 2s, 5s
  centralRawUrl?: string; // Direct RAW link to central file in GitVerse / SourceCraft
  repositoryUrl?: string; // Target Git repository URL
  nodesCount: number;
  userFilesCount?: number;
  nodeTypes: {
    vless: number;
    vmess: number;
    ss: number;
    trojan: number;
    wireguard: number;
  };

  // 3 типа блокировок в центральной модели:
  // 1. Сценарий: Пользователь удалил бота (bot deleted / channel unsubscribed)
  botDeletedStubContent?: string;
  botDeletedBlockHours?: number;
  botDeletedMaxAttempts?: number;
  botDeletedNotice?: string;

  // 2. Сценарий: Попытка привязки устройства (2nd device violation)
  deviceBindingStubContent?: string;
  deviceBindingBlockHours?: number;
  deviceBindingMaxAttempts?: number;
  deviceBindingNotice?: string;
  deviceBindingGraceHours?: number;
  deviceBindingGraceMinutes?: number;

  // 3. Сценарий: Превышение лимита удалений (delete/leave limit exceeded - permanent ban)
  limitExceededStubContent?: string;
  limitExceededBlockHours?: number;
  limitExceededMaxAttempts?: number;
  limitExceededNotice?: string;
}

export interface CentralSubscriptionSavePayload {
  content: string;
  autoSyncEnabled: boolean;
  filename: string;
  centralRawUrl?: string;
  repositoryUrl?: string;
  autoSyncIntervalSeconds?: number;
  // 3 Blocking Types
  botDeletedStubContent?: string;
  botDeletedBlockHours?: number;
  botDeletedMaxAttempts?: number;
  botDeletedNotice?: string;
  deviceBindingStubContent?: string;
  deviceBindingBlockHours?: number;
  deviceBindingMaxAttempts?: number;
  deviceBindingNotice?: string;
  deviceBindingGraceHours?: number;
  deviceBindingGraceMinutes?: number;
  limitExceededStubContent?: string;
  limitExceededBlockHours?: number;
  limitExceededMaxAttempts?: number;
  limitExceededNotice?: string;
}

export interface RepoUserFile {
  id?: string;
  sourceId?: string;
  userId?: string | null;
  telegramId?: number | null;
  username?: string | null;
  firstName?: string | null;
  filePath: string;
  rawUrl: string;
  updatedAt: string;
  format: 'happ' | 'incy' | 'standard';
  finalUrl: string;
  sizeBytes: number;
  isPoolFree?: boolean;
  lastCheckedAt?: string | null;
  httpStatus?: number;
  isAccessible?: boolean;
  latencyMs?: number;
  nodesFound?: number;
  checkError?: string;
  sha?: string;
  contentHash?: string;
}

export interface BotUser {
  id: string;
  telegramId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  joinedAt: string;
  receivedAt: string | null; // exact timestamp when subscription was claimed
  subscriptionName: string; // e.g. "HAPP (crypt4) - VLESS VIP"
  subscriptionType: SubscriptionType;
  status: UserSubStatus;
  mutedUntil: string | null; // ISO timestamp if muted
  blockedReason?: string;
  channelMembership: ChannelMembershipStatus;
  subscriptionToken: string;
  subscriptionExpiresAt: string | null;
  hasActiveSubscription?: boolean;
  trafficUsedBytes: number;
  trafficLimitBytes: number;
  isBlocked: boolean;
  isMuted?: boolean;
  channelLeftAt?: string | null;
  botBlockedAt?: string | null;
  deletionDeadlineAt?: string | null;
  subscriptionStatusReason?: string;
  lastActiveAt: string;
  personalNodes: string[]; // custom nodes injected only for this user
  isException?: boolean;
  subscriptionSourceId?: string;
  sourceSubscriptions?: Array<{
    sourceId: string;
    filePath: string;
    rawUrl: string;
    format: 'happ' | 'incy';
    finalUrl: string;
    updatedAt: string;
  }>;
  pendingSubscriptionReissue?: boolean;
  gitFilePath?: string;
  gitRawUrl?: string;
  finalSubscriptionUrl?: string;
  finalUrl?: string;
  deviceLocked?: boolean; // If true, sub is exclusive to 1 device and locked
  boundDevice?: {
    deviceId: string;
    deviceSecretToken?: string;
    clientName: string; // e.g. "iPhone 15 Pro / Shadowrocket"
    ip: string;
    userAgent: string;
    boundAt: string;
    lastConnectedAt: string;
  } | null;
  isTimerFrozen?: boolean; // Таймер заморожен (подписка удалена со 2-го устр., бан предотвращен)
  botId?: string; // ID of the bot that served this user
  deviceViolationAttempts?: number; // 0, 1, 2, 3 attempts before permanent ban
  lastDeviceViolationAt?: string | null;
  channelLeftCount?: number; // count of channel unsubscriptions
  pendingUnbindRequest?: boolean;
  pendingUnblockRequest?: boolean;
  sharingViolationCount?: number; // count of attempts to connect 2nd device (1..3)
  sharingBlockedUntil?: string | null; // ISO timestamp if temporarily blocked by Source 2
  isPermanentlyBanned?: boolean; // true if permanently banned (Source 3)
  bannedAt?: string | null; // ISO timestamp
  isAdmin?: boolean; // true if administrator or creator of the channel
  isInconsistent?: boolean;
  inconsistencyReason?: string;
  syncHealthStatus?: 'green' | 'yellow' | 'red';
  detachedFromCentral?: boolean; // Отвязать от центрального источника (автономный режим)
  customSubscriptionContent?: string; // Кастомный текст конфигурации
  excludedNodes?: string[]; // Исключенные узлы ("убавить из центрального")
  bypassBlock?: boolean; // Принудительный доступ в обход блокировок и отписок
  customNotes?: string; // Заметки администратора
  clckUrl?: string; // Зашифрованная ссылка clck.ru для INCY
  // Поля исключения из центр. источника (1 устройство, привязка к каналу)
  isChannelExclusion?: boolean; // Выдано вручную через подраздел "Исключения: Выдача из центр. источника (1 устройство)"
  channelExclusionOrigin?: 'manual_channel';
  channelExclusionReason?: string; // Заметка/причина выдачи (например: "Бот недоступен")
  sharingGraceDeadlineAt?: string | null; // Срок на удаление 2-м пользователем до автоматического бана (ISO)
  sharingWarningCount?: number; // Количество предупреждений о передаче (1 warning)
  sharingWarnedAt?: string | null;
  secondDeviceInfo?: {
    ip: string;
    userAgent: string;
    deviceId?: string;
    attemptedAt: string;
  } | null; // Данные второго несанкционированного устройства
  secondDeviceBlockedCount?: number; // Число заблокированных попыток со 2-го устройства
  secondDeviceActive?: boolean; // Признак активности попыток второго устройства
}

export interface FeedbackRequest {
  id: string;
  userId: string;
  telegramId: number;
  username?: string;
  firstName?: string;
  type: 'unbind_device' | 'general_feedback' | 'unblock_request';
  message: string;
  createdAt: string;
  status: 'pending' | 'resolved';
  resolvedAt?: string | null;
  banReason?: string;
  blockedAt?: string;
  attempts?: number;
  boundDevice?: {
    clientName: string;
    ip: string;
    boundAt: string;
  } | null;
}

export type GitSourceConfig = GitSourceItem;


export interface ConnectedClientInfo {
  id: string;
  ip: string;
  userAgent: string;
  clientType: 'INCY' | 'HAPP' | 'V2Ray' | 'Clash' | 'Sing-Box' | 'Browser' | 'Other';
  deviceId?: string;
  firstConnectedAt: string;
  lastConnectedAt: string;
  requestsCount: number;
}

export interface ExclusionSubscription {
  id: string;
  name: string;
  token: string;
  createdAt: string;
  notes: string;
  expiresAt: string | null;
  customNodes: string[];
  trafficUsedBytes: number;
  gitFilePath?: string;
  gitRawUrl?: string;
  happUrl?: string;
  incyUrl?: string;
  clckUrl?: string; // clck.ru зашифрованная ссылка
  lastSyncAt?: string;
  connectedClients?: ConnectedClientInfo[];
  // Temporary Exclusion (Тестовая ссылка с таймером)
  isTemporary?: boolean;
  durationValue?: number;
  durationUnit?: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'years';
  customContent?: string; // Своя строка для ключей отдельная от центр подписки
  attachToCentral?: boolean; // Подключать ли к центральной подписке (по дефолту false)
  isExpired?: boolean;
  
  // Channel Single-Device Exclusion Fields
  isChannelExclusion?: boolean; // Создано в подразделе "Выдача из центр. источника (1 устройство)"
  userId?: string;
  telegramId?: number;
  username?: string;
  firstName?: string;
  channelMembership?: ChannelMembershipStatus;
  deviceLocked?: boolean;
  boundDevice?: {
    deviceId: string;
    deviceSecretToken?: string;
    clientName: string;
    ip: string;
    userAgent: string;
    boundAt: string;
    lastConnectedAt: string;
  } | null;
  isTimerFrozen?: boolean;
  sharingGraceDeadlineAt?: string | null;
  sharingWarningCount?: number;
  sharingGraceHours?: number;
  sharingGraceMinutes?: number;
  secondDeviceInfo?: {
    ip: string;
    userAgent: string;
    deviceId?: string;
    attemptedAt: string;
  } | null;
  secondDeviceActive?: boolean;
  secondDeviceBlockedCount?: number;
  isBlocked?: boolean;
  isMuted?: boolean;
  status?: UserSubStatus;
  subscriptionStatusReason?: string;
}

export interface BroadcastPayload {
  target: 'all' | 'active' | 'selected';
  userIds?: string[];
  text: string;
  mediaType?: MediaType;
  mediaUrl?: string;
  buttons?: Array<{ text: string; url?: string; callbackData?: string }>;
}

export interface FunnelStepConfig {
  stepId: 'menu' | 'channel_check' | 'privacy' | 'sub_choice' | 'delivery';
  title: string;
  enabled: boolean;
  text: string;
  mediaType: MediaType;
  mediaUrl?: string;
  buttons: Array<{ text: string; action: string; url?: string }>;
}

export interface SubFormatConfig {
  id: string;
  name: string;
  client: string;
  filename: string;
  content: string;
  url: string;
  shortUrl?: string;
}

export interface SystemStatus {
  gitSources: {
    total: number;
    connectedCount: number;
    activeSource?: GitSourceItem;
  };
  bots: {
    total: number;
    connectedCount: number;
    activeBot?: ManagedBotItem;
  };
  channels: {
    total: number;
    adminConfirmedCount: number;
  };
  centralFile: {
    configured: boolean;
    autoSync: boolean;
    nodesCount: number;
    lastSyncedAt?: string | null;
  };
  counts: {
    totalUsers: number;
    activeSubscribers: number;
    channelMembers: number;
    mutedCount: number;
    blockedCount: number;
    exclusionsCount: number;
    pendingFeedbackCount?: number;
    freeLinksCount?: number;
    totalRepoFilesCount?: number;
  };
  syncHealth?: SyncHealthReport['summary'];
}

export interface BotSimulatedMessage {
  id: string;
  sender: 'bot' | 'user' | 'system';
  text: string;
  date: string;
  mediaType?: MediaType;
  mediaUrl?: string;
  buttons?: {
    text: string;
    callbackData: string;
    url?: string;
    color?: string;
  }[][];
  qrData?: string;
  copyableText?: string;
  fireworks?: boolean;
  stepKey?: 'welcome' | 'channel_notice' | 'privacy_policy' | 'choose_format' | 'sub_issued' | 'profile' | 'instructions' | 'blocked' | 'unsubscribed' | 'other';
}

export interface DockerConfig {
  containerName: string;
  port: number;
  restartPolicy: 'always' | 'unless-stopped' | 'on-failure' | 'no';
  autoRestartHours: number; // 0 = off, 1, 3, 6, 12, 24, 48
  autoSyncIntervalMinutes: number; // interval for central repo monitoring (e.g. 1, 5, 15, 30, 60)
  auditIntervalMinutes: number; // channel membership verification interval (e.g. 1, 5, 15)
  timeZone: string;
  environment: 'production' | 'development';
  volumeMountPath: string; // e.g. './data-store.json:/app/data-store.json'
}

export interface NodeSyncHealth {
  id: string;
  raw: string;
  protocol: string;
  name: string;
  server: string;
  port: string;
  status: 'green' | 'yellow' | 'red';
  matchedSubscribersCount: number;
  totalSubscribersCount: number;
}

export interface SubscriberSyncHealth {
  userId: string;
  telegramId: number;
  username?: string;
  firstName?: string;
  status: 'green' | 'yellow' | 'red';
  isInconsistent: boolean;
  inconsistencyReason?: string;
  gitFilePath?: string;
  expectedNodesCount: number;
  currentNodesCount: number;
  lastSyncedAt?: string | null;
  membershipStatus: string;
  subStatus: string;
}

export interface SyncHealthReport {
  centralNodes: NodeSyncHealth[];
  subscribers: SubscriberSyncHealth[];
  summary: {
    totalSubscribers: number;
    syncedCount: number;
    inconsistentCount: number;
    desyncedCount: number;
    healthPercentage: number;
    centralNodesCount: number;
    lastCentralUpdate: string | null;
    centralHash?: string;
  };
}

export interface SystemLogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'success' | 'warning' | 'error';
  category: 'sync' | 'gitverse' | 'bot' | 'violations' | 'subscribers' | 'exclusions' | 'system';
  action: string;
  message: string;
  details?: any;
}

export interface DeepAuditResult {
  durationMs: number;
  remoteCentralPulled: boolean;
  centralNodesCount: number;
  syncedUsers: number;
  syncedExclusions: number;
  pushedCount: number;
  skippedUnchanged: number;
  errors: string[];
  completedAt: string;
}

export interface RelayGatewayConfig {
  enabled: boolean;
  url: string;
  provider: 'gitverse_whitelist' | 'beget_free' | 'yandex_cloud' | 'cloudflare_worker' | 'custom_vps' | 'local_tunnel';
  gatewayMode?: 'always_gateway' | 'scheduled_daily' | 'direct_whitelist';
  lastTestedAt?: string | null;
  lastTestStatus?: 'success' | 'error';
  lastTestLatencyMs?: number;
  testMessage?: string;
  whitelistMode?: boolean; // Гибридный режим белых списков (прямые ссылки на GitVerse)
  checkIntervalHours?: number; // Интервал проверки шлюзом (например, 12 или 24 ч)
  lastAuditAt?: string | null;
  lastAuditMessage?: string;
  isOnline?: boolean;
}
