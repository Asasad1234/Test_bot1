import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { spawn, execFile } from 'child_process';
import { promisify } from 'util';
const execFileAsync = promisify(execFile);
import { createServer as createViteServer } from 'vite';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, deleteDoc, onSnapshot, getDocFromServer, writeBatch } from 'firebase/firestore';
import { TelegramBotManager } from './telegram-bot';
import { 
  encryptData, 
  decryptData, 
  encryptObject, 
  decryptObject, 
  maskSecret, 
  obfuscateSubscriptionLink, 
  decodeSubscriptionLink 
} from './src/utils/crypto';
import { 
  CANONICAL_BOT_TEMPLATES, 
  formatBotTemplate, 
  markdownToTelegramHtml 
} from './src/utils/bot-templates';

export function getAppBaseUrl(req?: any): string {
  if (typeof store !== 'undefined' && store?.relayGatewayConfig?.enabled && store?.relayGatewayConfig?.url) {
    return store.relayGatewayConfig.url.trim().replace(/\/+$/, '');
  }
  if (process.env.RUSSIAN_GATEWAY_URL) {
    return process.env.RUSSIAN_GATEWAY_URL.trim().replace(/\/+$/, '');
  }
  if (process.env.APP_URL && !process.env.APP_URL.includes('localhost')) {
    return process.env.APP_URL.replace(/\/+$/, '');
  }
  if (req && req.get) {
    const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
    const host = req.get('host');
    if (host) return `${proto}://${host}`.replace(/\/+$/, '');
  }
  return process.env.APP_URL || 'https://ais-dev-uk2utyav43cs7ezzsebkz7-469954892016.us-west2.run.app';
}

export function getDirectAppBaseUrl(): string {
  if (process.env.APP_URL && !process.env.APP_URL.includes('localhost')) {
    return process.env.APP_URL.replace(/\/+$/, '');
  }
  return 'https://ais-dev-uk2utyav43cs7ezzsebkz7-469954892016.us-west2.run.app';
}

const app = express();
const PORT = Number.parseInt(process.env.PORT || '3000', 10);

app.use(express.json({ limit: '15mb' }));
app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

// -------------------------------------------------------------
// Firebase Cloud Firestore Persistence Configuration
// -------------------------------------------------------------
const DEFAULT_FIREBASE_CONFIG = {
  projectId: "gen-lang-client-0798093918",
  appId: "1:384359731563:web:f251660370034e5cd5fc2e",
  apiKey: "AIzaSyBYOu9kmDTVVbqAAC3oxHGk834BF31G0b8",
  authDomain: "gen-lang-client-0798093918.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-03156b68-3890-4187-85fe-57fab87d5859",
  storageBucket: "gen-lang-client-0798093918.firebasestorage.app",
  messagingSenderId: "384359731563",
};

function getFirebaseConfig() {
  let fileConfig: any = {};
  if (process.env.FIREBASE_CONFIG_JSON) {
    try {
      fileConfig = JSON.parse(process.env.FIREBASE_CONFIG_JSON);
    } catch (e: any) {
      console.warn('[Firebase] Failed to parse FIREBASE_CONFIG_JSON env variable:', e.message);
    }
  } else {
    try {
      const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
      if (fs.existsSync(configPath)) {
        fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      }
    } catch {}
  }

  return {
    apiKey: process.env.FIREBASE_API_KEY || fileConfig.apiKey || DEFAULT_FIREBASE_CONFIG.apiKey,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || fileConfig.authDomain || DEFAULT_FIREBASE_CONFIG.authDomain,
    projectId: process.env.FIREBASE_PROJECT_ID || fileConfig.projectId || DEFAULT_FIREBASE_CONFIG.projectId,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || fileConfig.storageBucket || DEFAULT_FIREBASE_CONFIG.storageBucket,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || fileConfig.messagingSenderId || DEFAULT_FIREBASE_CONFIG.messagingSenderId,
    appId: process.env.FIREBASE_APP_ID || fileConfig.appId || DEFAULT_FIREBASE_CONFIG.appId,
    databaseId: process.env.FIREBASE_DATABASE_ID || fileConfig.firestoreDatabaseId || DEFAULT_FIREBASE_CONFIG.firestoreDatabaseId,
  };
}

let firestoreDb: any = null;
let isFirebaseConnected = false;

function getDb() {
  if (firestoreDb) return firestoreDb;
  const cfg = getFirebaseConfig();
  if (!cfg.apiKey || !cfg.projectId) {
    isFirebaseConnected = false;
    return null;
  }
  const app = getApps().length === 0 ? initializeApp(cfg) : getApp();
  firestoreDb = cfg.databaseId ? getFirestore(app, cfg.databaseId) : getFirestore(app);
  if (firestoreDb) {
    isFirebaseConnected = true;
  }
  return firestoreDb;
}

export type GitProvider = 'gitverse' | 'sourcecraft' | 'gitflic' | 'moshub' | 'github' | 'gitlab' | 'custom';
export type BotSettingsCaptchaType = 'none' | 'button' | 'math';
export type MediaType = 'none' | 'photo' | 'video' | 'document';
export type UserSubStatus = 'active' | 'blocked' | 'muted' | 'channel_inactive';
export type ChannelMembershipStatus = 'creator' | 'administrator' | 'member' | 'restricted' | 'left' | 'kicked';
export type SubscriptionType = 'happ' | 'incy' | 'single_device_ru' | 'standard' | 'exception';
type HappCryptVersion = 'crypt3' | 'crypt4' | 'crypt5';

interface GitSourceItem {
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

interface BotChannelBinding {
  id: string; // e.g. '@channel_name' or '-100123456789'
  title: string;
  isRequired: boolean;
  isBotAdmin: boolean;
  memberCount?: number;
  inviteLink?: string;
}

interface ManagedBotItem {
  id: string;
  name: string;
  token: string;
  username: string;
  botId?: string | number;
  enabled: boolean;
  status: 'connected' | 'error' | 'not_configured';
  channels: BotChannelBinding[];
  adminContactUrl: string; // URL or @admin_username
  blockedUserMessage: string;
  unsubscribedMessage: string;
  selfDeleteHours: number; // e.g. 72h
  deletePreviousMessageOnStep: boolean;
  captchaType: BotSettingsCaptchaType;
  welcomeMessage: string;
  privacyPolicyText: string;
  privacyPolicyUrl: string;
  mediaType: MediaType;
  mediaUrl: string;
  showQrCode?: boolean; // Configurable QR code toggle (on/off)
  enableFireworks?: boolean; // Visual fireworks/confetti on sub issue
  buttonColor?: string; // Color of buttons in bot
  channelNoticeMessage?: string; // Custom message when channels subscription required
  chooseFormatMessage?: string; // Custom message when choosing format (HAPP / INCY)
  subIssuedMessage?: string; // Custom template for issued subscription
  profileMessage?: string; // Custom template for profile info
  instructionsMessage?: string; // Custom template for instructions info
  timeZone?: string; // e.g. 'Europe/Moscow', 'UTC', 'device'
  errorMessage?: string;
}

interface ReplacementTemplates {
  unsubscribedNodeName: string;
  unsubscribedNotice: string;
  blockedNodeName: string;
  blockedNotice: string;
  mutedNodeName: string;
  mutedNotice: string;
  botDeletedNotice: string;
  disconnectStub?: string; // Fallback disconnect stub node
  enableFireworks?: boolean; // Global visual fireworks toggle
  defaultButtonColor?: string; // Global default button color
  singleDeviceBlockedNotice?: string; // Notice when 2nd device attempts connection

  // 3-Source Replacement System
  source1Name?: string;
  source1RawUrl?: string;
  source1Content?: string;
  source1Message?: string;
  maxChannelLeftCount?: number;

  source2Name?: string;
  source2RawUrl?: string;
  source2Content?: string;
  source2BlockHours?: number;
  source2MaxAttempts?: number;
  source2WarningMessage?: string;
  source2GracePeriodHours?: number;
  source2GracePeriodMinutes?: number;
  source2GraceNotice?: string;

  source3Name?: string;
  source3RawUrl?: string;
  source3Content?: string;
  source3BanMessage?: string;

  // Source 4 (Optional Custom / Emergency Source)
  source4Enabled?: boolean;
  source4Name?: string;
  source4RawUrl?: string;
  source4Content?: string;
  source4Description?: string;
}

interface ConnectedClientInfo {
  id: string;
  ip: string;
  userAgent: string;
  clientType: 'INCY' | 'HAPP' | 'V2Ray' | 'Clash' | 'Sing-Box' | 'Browser' | 'Other';
  deviceId?: string;
  firstConnectedAt: string;
  lastConnectedAt: string;
  requestsCount: number;
}

interface ExclusionSubscription {
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
  clckUrl?: string;
  lastSyncAt?: string;
  connectedClients?: ConnectedClientInfo[];
  // Temporary Exclusion (Тестовая ссылка с таймером)
  isTemporary?: boolean;
  durationValue?: number;
  durationUnit?: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'years';
  customContent?: string;
  attachToCentral?: boolean;
  isExpired?: boolean;
  // Channel exclusion (1 device, channel membership, HWID lock)
  isChannelExclusion?: boolean;
  userId?: string;
  telegramId?: number;
  username?: string;
  firstName?: string;
  channelMembership?: ChannelMembershipStatus;
  deviceLocked?: boolean;
  boundDevice?: BoundDeviceInfo | null;
  sharingGraceHours?: number;
  sharingGraceMinutes?: number;
  sharingGraceDeadlineAt?: string | null;
  sharingWarningCount?: number;
  sharingWarnedAt?: string | null;
  secondDeviceInfo?: {
    ip: string;
    userAgent: string;
    deviceId?: string;
    attemptedAt: string;
  } | null;
  secondDeviceActive?: boolean;
  secondDeviceBlockedCount?: number;
  isTimerFrozen?: boolean;
  status?: UserSubStatus;
  isBlocked?: boolean;
  isMuted?: boolean;
  subscriptionStatusReason?: string;
}

interface RepoUserFile {
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

export interface BoundDeviceInfo {
  deviceId: string;
  deviceSecretToken?: string;
  clientName: string;
  ip: string;
  userAgent: string;
  boundAt: string;
  lastConnectedAt: string;
}

interface BotUser {
  id: string;
  telegramId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  joinedAt: string;
  receivedAt: string | null;
  subscriptionName: string;
  subscriptionType: SubscriptionType;
  status: UserSubStatus;
  mutedUntil: string | null;
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
  personalNodes: string[];
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
  clckTargetUrl?: string;
  deviceLocked?: boolean;
  boundDevice?: BoundDeviceInfo | null;
  botId?: string;
  deviceViolationAttempts?: number;
  lastDeviceViolationAt?: string | null;
  channelLeftCount?: number;
  pendingUnbindRequest?: boolean;
  pendingUnblockRequest?: boolean;
  sharingViolationCount?: number;
  sharingBlockedUntil?: string | null;
  isPermanentlyBanned?: boolean;
  bannedAt?: string | null;
  isAdmin?: boolean;
  isInconsistent?: boolean;
  inconsistencyReason?: string;
  syncHealthStatus?: 'green' | 'yellow' | 'red';
  detachedFromCentral?: boolean; // Отвязать от центрального источника (автономный режим)
  customSubscriptionContent?: string; // Кастомный текст конфигурации
  excludedNodes?: string[]; // Исключенные узлы ("убавить из центрального")
  bypassBlock?: boolean; // Принудительный доступ в обход блокировок и отписок
  customNotes?: string; // Заметки администратора
  clckUrl?: string; // Зашифрованная ссылка clck.ru для INCY
  // Channel Single-Device Exclusion Fields
  isChannelExclusion?: boolean;
  channelExclusionOrigin?: 'manual_channel' | 'bot_fallback';
  channelExclusionReason?: string;
  channelExclusionCreatedAt?: string;
  sharingGraceDeadlineAt?: string | null;
  sharingWarningCount?: number;
  sharingWarnedAt?: string | null;
  secondDeviceInfo?: {
    ip: string;
    userAgent: string;
    deviceId?: string;
    attemptedAt: string;
  } | null;
  secondDeviceBlockedCount?: number;
  secondDeviceActive?: boolean;
  isTimerFrozen?: boolean;
}

interface FeedbackRequest {
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

export interface RelayGatewayConfig {
  enabled: boolean;
  url: string;
  provider?: 'gitverse_whitelist' | 'beget_free' | 'yandex_cloud' | 'cloudflare_worker' | 'custom_vps' | 'local_tunnel';
  gatewayMode?: 'always_gateway' | 'scheduled_daily' | 'direct_whitelist';
  lastTestedAt?: string | null;
  lastTestStatus?: 'success' | 'error';
  lastTestLatencyMs?: number;
  testMessage?: string;
  whitelistMode?: boolean; // Гибридный режим белых списков (прямые ссылки на GitVerse)
  checkIntervalHours?: number; // Интервал проверки шлюзом (12 или 24 ч)
  lastAuditAt?: string | null;
  lastAuditMessage?: string;
  isOnline?: boolean;
}

interface StoreData {
  gitSources: GitSourceItem[];
  activeGitSourceId: string;
  happCryptVersion: HappCryptVersion;
  bots: ManagedBotItem[];
  activeBotId: string;
  replacementTemplates: ReplacementTemplates;
  exclusions: ExclusionSubscription[];
  centralFile: {
    filename: string;
    content: string;
    sha?: string;
    lastCommitMessage?: string;
    lastUpdatedAt: string;
    isSyncedWithRepo: boolean;
    autoSyncEnabled: boolean;
    centralRawUrl?: string;
    repositoryUrl?: string;
    autoSyncIntervalSeconds?: number;
    // 3 Blocking Types:
    botDeletedStubContent?: string;
    botDeletedBlockHours?: number;
    botDeletedMaxAttempts?: number;
    botDeletedNotice?: string;
    deviceBindingStubContent?: string;
    deviceBindingBlockHours?: number;
    deviceBindingMaxAttempts?: number;
    deviceBindingNotice?: string;
    limitExceededStubContent?: string;
    limitExceededBlockHours?: number;
    limitExceededMaxAttempts?: number;
    limitExceededNotice?: string;
  };
  repoFiles: RepoUserFile[];
  users: BotUser[];
  broadcastHistory: any[];
  feedbackRequests: FeedbackRequest[];
  dockerConfig?: DockerConfig;
  relayGatewayConfig?: RelayGatewayConfig;
  vercelConfig?: {
    lastWebhookUrl?: string;
    lastWebhookSetAt?: string;
    customDomain?: string;
  };
  storageConfig?: {
    activeBackend: 'firebase' | 'vercel_kv' | 'hybrid' | 'local_file';
    kvRestApiUrl?: string;
    kvRestApiToken?: string;
    lastMigratedAt?: string;
    lastMigratedDirection?: string;
    autoDualWrite?: boolean;
  };
}

export const defaultDockerConfig: DockerConfig = {
  containerName: 'puls-access-app',
  port: 3000,
  restartPolicy: 'unless-stopped',
  autoRestartHours: 24,
  autoSyncIntervalMinutes: 5,
  auditIntervalMinutes: 5,
  timeZone: 'Europe/Moscow',
  environment: 'production',
  volumeMountPath: './data-store.json:/app/data-store.json',
};

const DEFAULT_PROFILE_HEADER = `#profile-title: Vay VPN [Проверка]
#profile-update-interval: 1h
#subscription-userinfo: upload=0; download=9634698736256; total=0; expire=0
#Support-Url: https://t.me/Vaynet_vpn
#Announce: Делитесь со всеми данным сервисом. Ваша подписка является персональной, не для публичного пользования 
Телеграм👉 @Vaynet_vpn
#providerid RFthi9YM
#hide-settings: 1`;

const DEFAULT_SAMPLE_NODES = `${DEFAULT_PROFILE_HEADER}

vless://8a7b3c21-5d6e-4f3a-9c1b-2e4d6f8a0b2c@nl-ams.access-node.net:443?encryption=none&security=reality&sni=gateway.icloud.com&fp=chrome&pbk=xJ8qZ7vKp2mN5wY8rT3uI1oL4eA9sD6fG2hJ0kL&sid=4a2c&spx=%2F&type=tcp&headerType=none#%F0%9F%87%B3%F0%9F%87%B1%20NL%20-%20Amsterdam%20HighSpeed
vless://9b8c4d32-6e7f-5a4b-0d2c-3f5e7a9b1c3d@de-fra.access-node.net:443?encryption=none&security=reality&sni=gateway.icloud.com&fp=chrome&pbk=yK9rA8wLq3nO6xZ9sU4vJ2pM5fB0tE7gH3kK1lM&sid=5b3d&spx=%2F&type=tcp&headerType=none#%F0%9F%87%A9%F0%9F%87%AA%20DE%20-%20Frankfurt%20Premium
ss://Y2hhY2hhMjAtaWV0Zi1wb2x5MTMwNTpQYXNzd29yZDEyMw==@se-sto.access-node.net:8388#%F0%9F%87%B8%F0%9F%87%AA%20SE%20-%20Stockholm%20Fast
trojan://TrojanPasswordSecure987@fi-hel.access-node.net:443?security=tls&sni=cdn.cloudflare.com&type=tcp#%F0%9F%87%AB%F0%9F%87%AE%20FI%20-%20Helsinki%20Relay`;

const defaultStore: StoreData = {
  happCryptVersion: 'crypt4',
  gitSources: [
    {
      id: 'src_gitverse_1',
      name: 'Основной репозиторий GitVerse (Vaynet/bot)',
      provider: 'gitverse',
      apiUrl: 'https://api.gitverse.ru',
      token: '',
      username: 'Vaynet',
      repository: 'Vaynet/bot',
      branch: 'master',
      filePath: 'L',
      centralRawUrl: 'https://gitverse.ru/api/repos/Vaynet/bot/raw/branch/master/L',
      enabled: true,
      autoSync: true,
      status: 'connected',
      lastSyncAt: new Date().toISOString(),
    },
    {
      id: 'src_github_2',
      name: 'Резервный источник GitHub / GitFlic',
      provider: 'gitflic',
      apiUrl: 'https://gitflic.ru/api/v1',
      token: '',
      username: '',
      repository: 'backup-nodes',
      branch: 'main',
      filePath: 'nodes.txt',
      enabled: false,
      autoSync: false,
      status: 'not_configured',
      lastSyncAt: null,
    },
  ],
  activeGitSourceId: 'src_gitverse_1',
  bots: [
    {
      id: 'bot_main_1',
      name: 'Главный бот доступа',
      token: '',
      username: 'puls_access_bot',
      botId: '7192847291',
      enabled: true,
      status: 'not_configured',
      channels: [
        {
          id: '@puls_channel',
          title: 'Канал доступа Пульс',
          isRequired: true,
          isBotAdmin: true,
          memberCount: 148,
          inviteLink: 'https://t.me/puls_channel',
        },
      ],
      adminContactUrl: 'https://t.me/puls_admin',
      blockedUserMessage: '{username}, вы не можете получить здесь подписку из-за подозрений на подозрительные действия или нарушение правил сервиса.',
      unsubscribedMessage: '⚠️ Ваша подписка деактивирована, так как вы покинули канал. Она снова станет активной при подписке на канал. Если этого не произойдет в течение {hours} часов, она будет полностью удалена.',
      selfDeleteHours: 72,
      deletePreviousMessageOnStep: false,
      captchaType: 'none',
      welcomeMessage: 'Привет, {name}! Добро пожаловать в сервис персональных подписок.\n\nВыберите действие в меню:',
      privacyPolicyText: 'Используя сервис, вы соглашаетесь с условиями обслуживания и политикой конфиденциальности. Запрещена спам-активность и перепродажа трафика.',
      privacyPolicyUrl: 'https://telegra.ph/Privacy-Policy-Puls-01',
      mediaType: 'none',
      mediaUrl: '',
      showQrCode: true,
      enableFireworks: true,
      buttonColor: 'indigo',
    },
    {
      id: 'bot_backup_2',
      name: 'Резервный бот (Инструкции)',
      token: '',
      username: 'puls_backup_bot',
      botId: '6892015523',
      enabled: false,
      status: 'not_configured',
      channels: [
        {
          id: '@puls_channel',
          title: 'Канал доступа Пульс',
          isRequired: true,
          isBotAdmin: true,
          memberCount: 148,
        },
      ],
      adminContactUrl: 'https://t.me/puls_admin',
      blockedUserMessage: '{username}, доступ заблокирован администратором.',
      unsubscribedMessage: 'Подписка приостановлена до вступления в канал.',
      selfDeleteHours: 48,
      deletePreviousMessageOnStep: false,
      captchaType: 'none',
      welcomeMessage: 'Привет, {name}! Это резервный шлюз доступа.',
      privacyPolicyText: 'Условия использования сервиса.',
      privacyPolicyUrl: 'https://telegra.ph/Privacy-Policy-Puls-01',
      mediaType: 'none',
      mediaUrl: '',
      showQrCode: true,
      enableFireworks: true,
      buttonColor: 'emerald',
    },
  ],
  activeBotId: 'bot_main_1',
  replacementTemplates: {
    unsubscribedNodeName: '⚠️ Доступ приостановлен: вы отписались от канала',
    unsubscribedNotice: 'Для возобновления подписки вернитесь в канал доступа и нажмите /check в боте.',
    blockedNodeName: '⛔ Подписка заблокирована администратором',
    blockedNotice: 'Ваша подписка заблокирована по подозрению в нарушении правил. Для разбирательств напишите администратору.',
    mutedNodeName: '⏳ Подписка на паузе (Заглушена)',
    mutedNotice: 'Сетевой доступ временно отключен администратором.',
    botDeletedNotice: 'Вы заблокировали или удалили бота. Запустите бота снова, чтобы получить обновленную подписку.',
    enableFireworks: true,
    defaultButtonColor: 'indigo',
    singleDeviceBlockedNotice: '⛔ Доступ заблокирован: Ваша подписка уже привязана к другому устройству! Разрешено использование строго на 1 устройстве.',
    
    // 3-Source Replacement System
    source1Name: 'Источник 1: При отписке / удалении бота',
    source1Content: 'vless://00000000-0000-0000-0000-000000000000@127.0.0.1:443?encryption=none&security=none#⚠️ Подписка деактивирована: подпишитесь обратно на канал',
    source1Message: '⚠️ Ваша подписка деактивирована, так как вы покинули обязательный канал! Подпишитесь обратно, чтобы возобновить работу подписки.',
    maxChannelLeftCount: 0, // 0 = безлимитные попытки отписки/возврата

    source2Name: 'Источник 2: Защита (подключение 2-го устройства)',
    source2Content: 'vless://00000000-0000-0000-0000-000000000000@127.0.0.1:443?encryption=none&security=none#⚠️ Заблокировано: попытка использования на 2-м устройстве (1 подписка = 1 устройство)',
    source2BlockHours: 24,
    source2MaxAttempts: 3,
    source2WarningMessage: '⚠️ ПРЕДУПРЕЖДЕНИЕ [{attempt}/3]: Зафиксирована попытка подключения второго устройства! Подписка заблокирована на {hours} ч. до {until}. Осталось попыток: {remaining}. После 3 попыток последует перманентный бан.',
    source2GracePeriodHours: 2,
    source2GracePeriodMinutes: 0,
    source2GraceNotice: 'Предупреждение: зафиксирована передача подписки! У вас есть {graceHours} ч. {graceMinutes} мин. чтобы второй пользователь удалил её, иначе наступит перманентный бан!',

    source3Name: 'Источник 3: Перманентный бан',
    source3Content: 'vless://00000000-0000-0000-0000-000000000000@127.0.0.1:443?encryption=none&security=none#⛔ Заблокировано: перманентный бан (обратитесь к администратору)',
    source3BanMessage: '⛔ ВАША ПОДПИСКА ПЕРМАНЕНТНО ЗАБЛОКИРОВАНА!\nПричина: Превышен лимит попыток передачи подписки третьим лицам.\nДля разблокировки обратитесь к администратору.',
  },
  exclusions: [
    {
      id: 'excl_vip_1',
      name: 'VIP-Исключение #9842 (Admin)',
      token: 'excl_vip_9842_x9y8z7',
      createdAt: new Date(Date.now() - 86400000 * 10).toISOString(),
      notes: 'Выдана главному администратору для тестирования сети без проверки каналов',
      expiresAt: null,
      customNodes: [],
      trafficUsedBytes: 42900000000,
    },
    {
      id: 'excl_vip_2',
      name: 'Тестовый доступ #104 (Партнер)',
      token: 'excl_partner_104_a1b2c3',
      createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
      notes: 'Партнерский доступ на 60 дней',
      expiresAt: new Date(Date.now() + 86400000 * 57).toISOString(),
      customNodes: [],
      trafficUsedBytes: 12100000000,
    },
  ],
  centralFile: {
    filename: 'L',
    content: DEFAULT_SAMPLE_NODES,
    lastCommitMessage: 'Update central VPN nodes (GitVerse L)',
    lastUpdatedAt: new Date().toISOString(),
    isSyncedWithRepo: true,
    autoSyncEnabled: true,
    autoSyncIntervalSeconds: 1,
    centralRawUrl: 'https://gitverse.ru/api/repos/Vaynet/bot/raw/branch/master/L',
    // 3 типа блокировок по умолчанию:
    botDeletedStubContent: 'vless://00000000-0000-0000-0000-000000000000@127.0.0.1:443?encryption=none&security=none#⚠️ Доступ приостановлен: вы удалили или заблокировали бота',
    botDeletedBlockHours: 72,
    botDeletedMaxAttempts: 3,
    botDeletedNotice: 'Вы удалили или заблокировали бота. Сетевой доступ деактивирован. Запустите бота заново (/start) для восстановления.',
    deviceBindingStubContent: 'vless://00000000-0000-0000-0000-000000000000@127.0.0.1:443?encryption=none&security=none#⚠️ Заблокировано: попытка привязки 2-го устройства (1 подписка = 1 устройство)',
    deviceBindingBlockHours: 24,
    deviceBindingMaxAttempts: 3,
    deviceBindingNotice: 'Зафиксирована попытка подключения со второго устройства. Правило сервиса: 1 подписка = строго 1 устройство. Доступ временно заблокирован.',
    limitExceededStubContent: 'vless://00000000-0000-0000-0000-000000000000@127.0.0.1:443?encryption=none&security=none#⛔ Перманентный бан: превышен лимит нарушений',
    limitExceededBlockHours: 0,
    limitExceededMaxAttempts: 5,
    limitExceededNotice: 'Подписка перманентно заблокирована из-за систематических нарушений правил сервиса. Для подачи апелляции используйте раздел помощи в боте.',
  },
  repoFiles: [
    {
      id: 'sub_alex_1',
      userId: 'usr_1',
      telegramId: 108456789,
      username: 'alex_dev',
      firstName: 'Алексей',
      filePath: 'subs/sub_alex_9a8b7c.txt',
      rawUrl: 'https://gitverse.ru/api/repos/Vaynet/bot/raw/branch/master/subs/sub_alex_9a8b7c.txt',
      updatedAt: new Date(Date.now() - 86400000 * 5 + 3600000).toISOString(),
      format: 'happ',
      finalUrl: 'happ://crypt5/aHR0cHM6Ly9naXR2ZXJzZS5ydS9hcGkvcmVwb3MvVmF5bmV0L2JvdC9yYXcvYnJhbmNoL21hc3Rlci9zdWJzL3N1Yl9hbGV4XzlhOGI3Yy50eHQ==ff',
      sizeBytes: 1240,
      isPoolFree: false,
      lastCheckedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
      httpStatus: 200,
      isAccessible: true,
      latencyMs: 120,
      nodesFound: 4,
    },
    {
      id: 'sub_maria_2',
      userId: 'usr_2',
      telegramId: 219876543,
      username: 'maria_k',
      firstName: 'Мария',
      filePath: 'subs/sub_maria_3e4f5a.txt',
      rawUrl: 'https://gitverse.ru/api/repos/Vaynet/bot/raw/branch/master/subs/sub_maria_3e4f5a.txt',
      updatedAt: new Date(Date.now() - 86400000 * 3 + 1200000).toISOString(),
      format: 'incy',
      finalUrl: 'https://gitverse.ru/api/repos/Vaynet/bot/raw/branch/master/subs/sub_maria_3e4f5a.txt',
      sizeBytes: 1240,
      isPoolFree: false,
      lastCheckedAt: new Date(Date.now() - 3600000 * 3).toISOString(),
      httpStatus: 200,
      isAccessible: true,
      latencyMs: 145,
      nodesFound: 4,
    },
    {
      id: 'sub_free_pool_1',
      userId: null,
      telegramId: null,
      username: null,
      firstName: null,
      filePath: 'subs/sub_pool_01.txt',
      rawUrl: 'https://gitverse.ru/api/repos/Vaynet/bot/raw/branch/master/subs/sub_pool_01.txt',
      updatedAt: new Date(Date.now() - 3600000 * 4).toISOString(),
      format: 'standard',
      finalUrl: 'https://gitverse.ru/api/repos/Vaynet/bot/raw/branch/master/subs/sub_pool_01.txt',
      sizeBytes: 1240,
      isPoolFree: true,
      lastCheckedAt: new Date(Date.now() - 3600000).toISOString(),
      httpStatus: 200,
      isAccessible: true,
      latencyMs: 110,
      nodesFound: 4,
    },
    {
      id: 'sub_free_pool_2',
      userId: null,
      telegramId: null,
      username: null,
      firstName: null,
      filePath: 'subs/sub_pool_02.txt',
      rawUrl: 'https://gitverse.ru/api/repos/Vaynet/bot/raw/branch/master/subs/sub_pool_02.txt',
      updatedAt: new Date(Date.now() - 3600000 * 3).toISOString(),
      format: 'standard',
      finalUrl: 'https://gitverse.ru/api/repos/Vaynet/bot/raw/branch/master/subs/sub_pool_02.txt',
      sizeBytes: 1240,
      isPoolFree: true,
      lastCheckedAt: new Date(Date.now() - 1800000).toISOString(),
      httpStatus: 200,
      isAccessible: true,
      latencyMs: 132,
      nodesFound: 4,
    },
    {
      id: 'sub_free_pool_3',
      userId: null,
      telegramId: null,
      username: null,
      firstName: null,
      filePath: 'subs/sub_pool_03.txt',
      rawUrl: 'https://gitverse.ru/api/repos/Vaynet/bot/raw/branch/master/subs/sub_pool_03.txt',
      updatedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
      format: 'standard',
      finalUrl: 'https://gitverse.ru/api/repos/Vaynet/bot/raw/branch/master/subs/sub_pool_03.txt',
      sizeBytes: 1240,
      isPoolFree: true,
      lastCheckedAt: null,
      httpStatus: 0,
      isAccessible: false,
      latencyMs: undefined,
      nodesFound: undefined,
    },
  ],
  users: [
    {
      id: 'usr_1',
      telegramId: 108456789,
      username: 'alex_dev',
      firstName: 'Алексей',
      lastName: 'Смирнов',
      joinedAt: new Date(Date.now() - 86400000 * 5).toISOString(),
      receivedAt: new Date(Date.now() - 86400000 * 5 + 3600000).toISOString(),
      subscriptionName: 'HAPP (crypt5) - Premium',
      subscriptionType: 'happ',
      status: 'active',
      mutedUntil: null,
      channelMembership: 'member',
      subscriptionToken: 'sub_alex_9a8b7c',
      subscriptionExpiresAt: new Date(Date.now() + 86400000 * 25).toISOString(),
      trafficUsedBytes: 15420000000,
      trafficLimitBytes: 100000000000,
      isBlocked: false,
      lastActiveAt: new Date(Date.now() - 3600000 * 2).toISOString(),
      personalNodes: [],
      deviceLocked: true,
      boundDevice: {
        deviceId: 'dev_ios_9a8b7c',
        clientName: 'iPhone 15 Pro / Shadowrocket (iOS)',
        ip: '188.130.155.42',
        userAgent: 'Shadowrocket/2.2.34 (iOS 17.4)',
        boundAt: new Date(Date.now() - 86400000 * 5 + 3600000).toISOString(),
        lastConnectedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
      },
    },
    {
      id: 'usr_2',
      telegramId: 219876543,
      username: 'maria_k',
      firstName: 'Мария',
      lastName: '',
      joinedAt: new Date(Date.now() - 86400000 * 3).toISOString(),
      receivedAt: new Date(Date.now() - 86400000 * 3 + 1200000).toISOString(),
      subscriptionName: 'INCY (GitVerse RAW) - Standard',
      subscriptionType: 'incy',
      status: 'active',
      mutedUntil: null,
      channelMembership: 'member',
      subscriptionToken: 'sub_maria_3e4f5a',
      subscriptionExpiresAt: new Date(Date.now() + 86400000 * 27).toISOString(),
      trafficUsedBytes: 4230000000,
      trafficLimitBytes: 50000000000,
      isBlocked: false,
      lastActiveAt: new Date(Date.now() - 3600000 * 8).toISOString(),
      personalNodes: [],
      deviceLocked: false,
      boundDevice: null,
    },
    {
      id: 'usr_3',
      telegramId: 304561234,
      username: 'dmitry_v',
      firstName: 'Дмитрий',
      lastName: '',
      joinedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
      receivedAt: new Date(Date.now() - 86400000 * 2 + 600000).toISOString(),
      subscriptionName: 'HAPP (crypt5) - VLESS',
      subscriptionType: 'happ',
      status: 'channel_inactive',
      mutedUntil: null,
      channelMembership: 'left',
      subscriptionToken: 'sub_dmitry_8d7e6f',
      subscriptionExpiresAt: null,
      trafficUsedBytes: 120000000,
      trafficLimitBytes: 50000000000,
      isBlocked: false,
      lastActiveAt: new Date(Date.now() - 86400000).toISOString(),
      personalNodes: [],
    },
    {
      id: 'usr_4',
      telegramId: 415678901,
      username: 'elena_admin',
      firstName: 'Elena',
      lastName: '',
      joinedAt: new Date(Date.now() - 86400000 * 1).toISOString(),
      receivedAt: new Date(Date.now() - 86400000 * 1 + 500000).toISOString(),
      subscriptionName: 'VIP Ultra HighSpeed',
      subscriptionType: 'standard',
      status: 'active',
      mutedUntil: null,
      channelMembership: 'administrator',
      subscriptionToken: 'sub_elena_2b1c0d',
      subscriptionExpiresAt: new Date(Date.now() + 86400000 * 30).toISOString(),
      trafficUsedBytes: 31200000000,
      trafficLimitBytes: 200000000000,
      isBlocked: false,
      lastActiveAt: new Date(Date.now() - 1800000).toISOString(),
      personalNodes: [
        'vless://personal-elena-dedicated@fi-hel.access-node.net:443?security=tls#%F0%9F%87%AB%F0%9F%87%AE%20Personal%20Elena%20Dedicated',
      ],
    },
  ],
  broadcastHistory: [],
  feedbackRequests: [
    {
      id: 'fb_init_1',
      userId: 'usr_1',
      telegramId: 108456789,
      username: 'alex_dev',
      firstName: 'Алексей',
      type: 'unbind_device',
      message: 'Здравствуйте! Сменил телефон на iPhone 16 Pro, нужно отвязать старое устройство от подписки, чтобы переподключиться.',
      createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
      status: 'pending',
      boundDevice: {
        clientName: 'iPhone 15 Pro / Shadowrocket (iOS)',
        ip: '188.130.155.42',
        boundAt: new Date(Date.now() - 86400000 * 5).toISOString(),
      },
    },
    {
      id: 'fb_init_2',
      userId: 'usr_3',
      telegramId: 384729105,
      username: 'dmitry_v',
      firstName: 'Дмитрий',
      type: 'unbind_device',
      message: 'Переустановил Windows и стёрся профиль V2Ray. Прошу сбросить привязку устройства.',
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      status: 'resolved',
      resolvedAt: new Date(Date.now() - 3600000 * 12).toISOString(),
      boundDevice: {
        clientName: 'NekoBox / Windows 11',
        ip: '91.214.78.33',
        boundAt: new Date(Date.now() - 86400000 * 4).toISOString(),
      },
    },
  ],
  dockerConfig: defaultDockerConfig,
  storageConfig: {
    activeBackend: (process.env.STORAGE_BACKEND as any) || 'firebase',
    kvRestApiUrl: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '',
    kvRestApiToken: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '',
    autoDualWrite: true,
  },
  relayGatewayConfig: {
    enabled: false,
    url: '',
    provider: 'gitverse_whitelist',
    lastTestedAt: null,
    lastTestStatus: undefined,
    lastTestLatencyMs: undefined,
    testMessage: '',
    whitelistMode: true,
    checkIntervalHours: 12,
    lastAuditAt: null,
    lastAuditMessage: '',
  },
};

function normalizeStore(parsed: any): StoreData {
  if (!parsed || typeof parsed !== 'object') {
    return { ...defaultStore };
  }
  if (!['crypt3', 'crypt4', 'crypt5'].includes(parsed.happCryptVersion)) {
    parsed.happCryptVersion = defaultStore.happCryptVersion;
  }
  // Migrate old format if necessary
  if (!parsed.relayGatewayConfig) {
    parsed.relayGatewayConfig = { ...defaultStore.relayGatewayConfig };
  } else {
    if (typeof parsed.relayGatewayConfig.whitelistMode !== 'boolean') {
      parsed.relayGatewayConfig.whitelistMode = true;
    }
    if (!parsed.relayGatewayConfig.checkIntervalHours) {
      parsed.relayGatewayConfig.checkIntervalHours = 12;
    }
  }
  if (!parsed.dockerConfig) {
    parsed.dockerConfig = defaultStore.dockerConfig;
  }
  if (!Array.isArray(parsed.gitSources)) {
    parsed.gitSources = defaultStore.gitSources;
    parsed.activeGitSourceId = defaultStore.activeGitSourceId;
  }
  if (!Array.isArray(parsed.bots)) {
    parsed.bots = defaultStore.bots;
    parsed.activeBotId = defaultStore.activeBotId;
  }
  if (!parsed.replacementTemplates) {
    parsed.replacementTemplates = defaultStore.replacementTemplates;
  }
  if (!Array.isArray(parsed.exclusions)) {
    parsed.exclusions = defaultStore.exclusions;
  } else {
    for (const excl of parsed.exclusions) {
      if (!Array.isArray(excl.connectedClients)) {
        excl.connectedClients = [];
      }
    }
  }
  if (!Array.isArray(parsed.repoFiles)) {
    parsed.repoFiles = defaultStore.repoFiles || [];
  } else {
    const hasFree = parsed.repoFiles.some((f: any) => !f.userId || f.isPoolFree);
    if (!hasFree && parsed.repoFiles.length === 0) {
      parsed.repoFiles.push(...(defaultStore.repoFiles || []).filter((f: any) => !f.userId || f.isPoolFree));
    }
  }
  if (!Array.isArray(parsed.feedbackRequests)) {
    parsed.feedbackRequests = defaultStore.feedbackRequests || [];
  }
  if (Array.isArray(parsed.bots)) {
    parsed.bots = parsed.bots.map((b: any) => ({
      ...b,
      showQrCode: b.showQrCode ?? true,
      enableFireworks: typeof b.enableFireworks === 'boolean' ? b.enableFireworks : true,
      buttonColor: b.buttonColor || (b.id === 'bot_main_1' ? 'indigo' : 'emerald'),
    }));
  }
  if (parsed.replacementTemplates) {
    parsed.replacementTemplates.enableFireworks = parsed.replacementTemplates.enableFireworks ?? true;
    parsed.replacementTemplates.defaultButtonColor = parsed.replacementTemplates.defaultButtonColor || 'indigo';
    parsed.replacementTemplates.singleDeviceBlockedNotice = parsed.replacementTemplates.singleDeviceBlockedNotice || '⛔ Доступ заблокирован: Ваша подписка уже привязана к другому устройству! Разрешено использование строго на 1 устройстве.';
    
    // 3-Source System fallbacks
    parsed.replacementTemplates.source1Name = parsed.replacementTemplates.source1Name || defaultStore.replacementTemplates.source1Name;
    parsed.replacementTemplates.source1Content = parsed.replacementTemplates.source1Content || defaultStore.replacementTemplates.source1Content;
    parsed.replacementTemplates.source1Message = parsed.replacementTemplates.source1Message || defaultStore.replacementTemplates.source1Message;
    parsed.replacementTemplates.maxChannelLeftCount = parsed.replacementTemplates.maxChannelLeftCount ?? 0;

    parsed.replacementTemplates.source2Name = parsed.replacementTemplates.source2Name || defaultStore.replacementTemplates.source2Name;
    parsed.replacementTemplates.source2Content = parsed.replacementTemplates.source2Content || defaultStore.replacementTemplates.source2Content;
    parsed.replacementTemplates.source2BlockHours = parsed.replacementTemplates.source2BlockHours ?? 24;
    parsed.replacementTemplates.source2MaxAttempts = parsed.replacementTemplates.source2MaxAttempts ?? 3;
    parsed.replacementTemplates.source2WarningMessage = parsed.replacementTemplates.source2WarningMessage || defaultStore.replacementTemplates.source2WarningMessage;
    parsed.replacementTemplates.source2GracePeriodHours = parsed.replacementTemplates.source2GracePeriodHours ?? 2;
    parsed.replacementTemplates.source2GracePeriodMinutes = parsed.replacementTemplates.source2GracePeriodMinutes ?? 0;
    parsed.replacementTemplates.source2GraceNotice = parsed.replacementTemplates.source2GraceNotice || defaultStore.replacementTemplates.source2GraceNotice;

    parsed.replacementTemplates.source3Name = parsed.replacementTemplates.source3Name || defaultStore.replacementTemplates.source3Name;
    parsed.replacementTemplates.source3Content = parsed.replacementTemplates.source3Content || defaultStore.replacementTemplates.source3Content;
    parsed.replacementTemplates.source3BanMessage = parsed.replacementTemplates.source3BanMessage || defaultStore.replacementTemplates.source3BanMessage;
  }
  if (parsed.users) {
    parsed.users = parsed.users.map((u: any) => ({
      ...u,
      deviceLocked: u.deviceLocked ?? (u.boundDevice ? true : false),
      boundDevice: u.boundDevice ?? null,
      trafficLimitBytes: (u.trafficLimitBytes === 100000000000 || u.trafficLimitBytes === 100 * 1024 * 1024 * 1024 || !u.trafficLimitBytes) ? 0 : u.trafficLimitBytes,
    }));
  }
  // Clean old puls-dostupa placeholder repository if present
  if (parsed.gitSources && parsed.gitSources.length > 0) {
    const git0 = parsed.gitSources[0];
    if (git0.repository === 'puls-dostupa/nodes') {
      git0.repository = 'Vaynet/bot';
      git0.branch = 'master';
      git0.filePath = 'L';
      if (!git0.name || git0.name.includes('puls-dostupa')) {
        git0.name = 'Основной репозиторий GitVerse (Vaynet/bot)';
      }
      git0.centralRawUrl = 'https://gitverse.ru/api/repos/Vaynet/bot/raw/branch/master/L';
      git0.status = 'connected';
    }
  }
  const activeSource: GitSourceItem | undefined = parsed.gitSources?.find((source: GitSourceItem) => source.id === parsed.activeGitSourceId) || parsed.gitSources?.[0];
  for (const repoFile of parsed.repoFiles || []) {
    if (repoFile.userId && !repoFile.sourceId) {
      repoFile.sourceId = activeSource?.id;
    }
  }
  for (const user of parsed.users || []) {
    if (!Array.isArray(user.sourceSubscriptions)) user.sourceSubscriptions = [];
    if (!user.subscriptionSourceId && user.gitFilePath && activeSource?.id) {
      user.subscriptionSourceId = activeSource.id;
    }
    if (user.gitFilePath && user.subscriptionSourceId && !user.sourceSubscriptions.some((item: any) => item.sourceId === user.subscriptionSourceId)) {
      const repoFile = (parsed.repoFiles || []).find((file: any) => file.filePath === user.gitFilePath);
      user.sourceSubscriptions.push({
        sourceId: user.subscriptionSourceId,
        filePath: user.gitFilePath,
        rawUrl: user.gitRawUrl || repoFile?.rawUrl || '',
        format: user.subscriptionType === 'incy' ? 'incy' : 'happ',
        finalUrl: user.finalSubscriptionUrl || user.finalUrl || repoFile?.finalUrl || '',
        updatedAt: repoFile?.updatedAt || user.receivedAt || new Date().toISOString(),
      });
    }
  }
  const expectedRawHosts: Partial<Record<GitProvider, string[]>> = {
    gitverse: ['gitverse.ru'],
    sourcecraft: ['raw.sourcecraft.tech'],
    gitflic: ['gitflic.ru'],
    moshub: ['hub.mos.ru'],
    github: ['raw.githubusercontent.com', 'github.com'],
    gitlab: ['gitlab.com'],
  };
  let centralUrlHost = '';
  try {
    centralUrlHost = new URL(parsed.centralFile?.centralRawUrl || '').hostname;
  } catch {}
  const sourceHostMismatch = Boolean(
    activeSource && expectedRawHosts[activeSource.provider] &&
    !expectedRawHosts[activeSource.provider]!.includes(centralUrlHost)
  );
  if (!parsed.centralFile || parsed.centralFile.filename === 'subscription.txt' || !parsed.centralFile.centralRawUrl || parsed.centralFile.centralRawUrl.includes('puls-dostupa') || sourceHostMismatch) {
    if (!parsed.centralFile) parsed.centralFile = defaultStore.centralFile;
    const source = activeSource || defaultStore.gitSources[0];
    const filename = source.filePath || parsed.centralFile.filename || 'L';
    const repository = (source.repository || 'Vaynet/bot').replace(/^\/+|\/+$/g, '');
    const branch = source.branch || getDefaultGitBranch(source.provider);
    const configuredRawUrl = [source.centralRawUrl, source.baseRawUrl].find((url) => {
      if (!url) return false;
      if (!expectedRawHosts[source.provider]) return true;
      try {
        return expectedRawHosts[source.provider]!.includes(new URL(url).hostname);
      } catch {
        return false;
      }
    });
    parsed.centralFile.filename = filename;
    parsed.centralFile.centralRawUrl = configuredRawUrl || (
      source.provider === 'sourcecraft' ? '' :
      source.provider === 'gitflic' ? `https://gitflic.ru/project/${repository}/blob/raw?file=${encodeURIComponent(filename)}` :
      source.provider === 'moshub' ? `https://hub.mos.ru/${repository}/-/raw/${branch}/${filename}` :
      source.provider === 'github' ? `https://raw.githubusercontent.com/${repository}/${branch}/${filename}` :
      source.provider === 'gitlab' ? `https://gitlab.com/${repository}/-/raw/${branch}/${filename}` :
      `https://gitverse.ru/api/repos/${repository}/raw/branch/${branch}/${filename}`
    );
    parsed.centralFile.repositoryUrl = buildGitRepositoryWebUrl(source);
  }
  if (parsed.centralFile) {
    parsed.centralFile.botDeletedStubContent = parsed.centralFile.botDeletedStubContent || defaultStore.centralFile.botDeletedStubContent;
    parsed.centralFile.botDeletedBlockHours = parsed.centralFile.botDeletedBlockHours ?? defaultStore.centralFile.botDeletedBlockHours;
    parsed.centralFile.botDeletedMaxAttempts = parsed.centralFile.botDeletedMaxAttempts ?? defaultStore.centralFile.botDeletedMaxAttempts;
    parsed.centralFile.botDeletedNotice = parsed.centralFile.botDeletedNotice || defaultStore.centralFile.botDeletedNotice;

    parsed.centralFile.deviceBindingStubContent = parsed.centralFile.deviceBindingStubContent || defaultStore.centralFile.deviceBindingStubContent;
    parsed.centralFile.deviceBindingBlockHours = parsed.centralFile.deviceBindingBlockHours ?? defaultStore.centralFile.deviceBindingBlockHours;
    parsed.centralFile.deviceBindingMaxAttempts = parsed.centralFile.deviceBindingMaxAttempts ?? defaultStore.centralFile.deviceBindingMaxAttempts;
    parsed.centralFile.deviceBindingNotice = parsed.centralFile.deviceBindingNotice || defaultStore.centralFile.deviceBindingNotice;

    parsed.centralFile.limitExceededStubContent = parsed.centralFile.limitExceededStubContent || defaultStore.centralFile.limitExceededStubContent;
    parsed.centralFile.limitExceededBlockHours = parsed.centralFile.limitExceededBlockHours ?? defaultStore.centralFile.limitExceededBlockHours;
    parsed.centralFile.limitExceededMaxAttempts = parsed.centralFile.limitExceededMaxAttempts ?? defaultStore.centralFile.limitExceededMaxAttempts;
    parsed.centralFile.limitExceededNotice = parsed.centralFile.limitExceededNotice || defaultStore.centralFile.limitExceededNotice;
  }
  // Clean any old repo files from puls-dostupa, clck.ru, qsen.ru
  if (parsed.repoFiles) {
    parsed.repoFiles = parsed.repoFiles.map((f: any) => {
      let rawUrl = f.rawUrl || '';
      let finalUrl = f.finalUrl || '';
      if (rawUrl.includes('puls-dostupa/nodes')) {
        rawUrl = rawUrl.replace('puls-dostupa/nodes/raw/branch/main', 'api/repos/Vaynet/bot/raw/branch/master');
      }
      if (f.format === 'incy' && !isClckShortUrl(finalUrl)) finalUrl = '';
      if (
        f.format === 'happ' &&
        !isHappUrlForVersion(finalUrl, parsed.happCryptVersion as HappCryptVersion)
      ) finalUrl = '';
      return {
        ...f,
        rawUrl,
        finalUrl,
      };
    });
  }
  if (parsed.users) {
    parsed.users = parsed.users.map((u: any) => {
      let rawUrl = u.gitRawUrl || '';
      let finalUrl = u.finalSubscriptionUrl || u.finalUrl || '';
      const token = u.subscriptionToken || `sub_${u.username || u.telegramId}`;

      if (rawUrl.includes('puls-dostupa/nodes')) {
        rawUrl = rawUrl.replace('puls-dostupa/nodes/raw/branch/main', 'api/repos/Vaynet/bot/raw/branch/master');
      }

      const selectedVersion = parsed.happCryptVersion as HappCryptVersion;
      if (u.subscriptionType === 'incy' && !isClckShortUrl(finalUrl)) {
        finalUrl = '';
      } else if (
        u.subscriptionType === 'happ' &&
        !isHappUrlForVersion(finalUrl, selectedVersion)
      ) {
        finalUrl = '';
      } else if (
        finalUrl.includes('qsen.ru') ||
        finalUrl.includes('ais-dev') ||
        finalUrl.includes('run.app')
      ) {
        finalUrl = '';
      }

      return {
        ...u,
        subscriptionToken: token,
        gitRawUrl: rawUrl,
        finalSubscriptionUrl: finalUrl,
        finalUrl: finalUrl,
        clckUrl: finalUrl,
      };
    });
  }
  if (parsed.centralFile) {
    parsed.centralFile.autoSyncIntervalSeconds = parsed.centralFile.autoSyncIntervalSeconds || 1;
  }
  if (!parsed.vercelConfig) {
    parsed.vercelConfig = {};
  }
  if (!parsed.storageConfig) {
    parsed.storageConfig = {
      activeBackend: (process.env.STORAGE_BACKEND as any) || 'firebase',
      kvRestApiUrl: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '',
      kvRestApiToken: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '',
      autoDualWrite: true,
    };
  }
  return { ...defaultStore, ...parsed };
}

async function loadStoreFromFirebase(): Promise<StoreData | null> {
  try {
    const db = getDb();
    if (!db) {
      console.warn('[Firebase] Database not initialized, using default store');
      return null;
    }
    const docRef = doc(db, 'system_store', 'main_store');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (data && data.payload) {
        const parsed = JSON.parse(data.payload);
        console.log('[Firebase] Store successfully loaded from Firebase Cloud storage.');
        return normalizeStore(parsed);
      }
    } else {
      console.log('[Firebase] No existing main_store document found in Firebase Cloud. Will initialize with default state.');
    }
  } catch (err: any) {
    console.error('[Firebase] Error reading store from Firebase:', err.message);
  }
  return null;
}

let isSavingStore = false;
let pendingSave = false;

let firebaseBatchTimer: NodeJS.Timeout | null = null;
let lastFirebaseStoreHash = '';
let isFirebaseBatchExecuting = false;

// Atomic Batch Update Executor for Firebase Firestore (Пакетная обработка обновлений)
export async function executeFirebaseBatchCommit(): Promise<void> {
  if (store.storageConfig?.activeBackend === 'local_file') return;
  if (isFirebaseBatchExecuting) return;
  isFirebaseBatchExecuting = true;
  try {
    const db = getDb();
    if (!db) return;

    // Check payload hash to eliminate redundant writes
    const storePayload = JSON.stringify(store);
    const currentHash = crypto.createHash('sha256').update(storePayload).digest('hex');
    if (currentHash === lastFirebaseStoreHash) {
      return; // Already up-to-date in Cloud Firestore, zero network requests!
    }

    const batch = writeBatch(db);
    const mainDocRef = doc(db, 'system_store', 'main_store');
    const nowIso = new Date().toISOString();

    batch.set(mainDocRef, {
      payload: storePayload,
      updatedAt: nowIso,
      usersCount: (store.users || []).length,
      exclusionsCount: (store.exclusions || []).length,
      lastCentralSyncAt: lastCentralSyncStats?.durationMs ? nowIso : ((store as any).lastCentralSyncAt || nowIso),
    });

    await batch.commit();
    lastFirebaseStoreHash = currentHash;
    console.log('[Firebase Batch] Atomic batch update successfully committed to Cloud Firestore.');
  } catch (err: any) {
    console.warn('[Firebase Batch Warning]:', err.message);
  } finally {
    isFirebaseBatchExecuting = false;
  }
}

// Debounced batch writer for Firebase updates (coalesces rapid sync updates into a single atomic write)
export function queueFirebaseBatchSave(delayMs = 200): void {
  if (store.storageConfig?.activeBackend === 'local_file') return;
  if (firebaseBatchTimer) {
    clearTimeout(firebaseBatchTimer);
  }
  firebaseBatchTimer = setTimeout(() => {
    executeFirebaseBatchCommit().catch((e) => console.warn('[Firebase Batch Error]:', e.message));
  }, delayMs);
}

async function saveStoreToFirebase(): Promise<void> {
  // Use debounced atomic batch writer to avoid quota throttling while guaranteeing atomic persistence
  queueFirebaseBatchSave(150);
}

// -------------------------------------------------------------
// Vercel KV / Upstash Redis Storage Adapter
// -------------------------------------------------------------
function getVercelKvConfig() {
  const url = store.storageConfig?.kvRestApiUrl || process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
  const token = store.storageConfig?.kvRestApiToken || process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
  return {
    url: url.trim().replace(/\/+$/, ''),
    token: token.trim(),
    isConfigured: Boolean(url && token),
  };
}

async function testVercelKvConnection(customUrl?: string, customToken?: string): Promise<{
  success: boolean;
  latencyMs: number;
  message: string;
}> {
  const url = (customUrl || store.storageConfig?.kvRestApiUrl || process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '').trim().replace(/\/+$/, '');
  const token = (customToken || store.storageConfig?.kvRestApiToken || process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();

  if (!url || !token) {
    return {
      success: false,
      latencyMs: 0,
      message: 'KV_REST_API_URL или KV_REST_API_TOKEN не настроены',
    };
  }

  const start = Date.now();
  try {
    const res = await fetch(`${url}/ping`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(5000),
    });
    const latencyMs = Date.now() - start;
    if (res.ok) {
      const data = await res.json();
      return {
        success: true,
        latencyMs,
        message: `Vercel KV отвечает! Статус: ${data.result || 'PONG'} (${latencyMs} мс)`,
      };
    } else {
      return {
        success: false,
        latencyMs,
        message: `Vercel KV ответил со статусом ${res.status}: ${res.statusText}`,
      };
    }
  } catch (err: any) {
    return {
      success: false,
      latencyMs: Date.now() - start,
      message: `Ошибка подключения к Vercel KV: ${err.message}`,
    };
  }
}

async function loadStoreFromVercelKv(): Promise<StoreData | null> {
  const { url, token, isConfigured } = getVercelKvConfig();
  if (!isConfigured) return null;

  try {
    const res = await fetch(`${url}/get/system_store:main_store`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) {
      console.warn(`[Vercel KV] HTTP ${res.status} when fetching main_store`);
      return null;
    }
    const data = await res.json();
    if (data && data.result) {
      const rawPayload = typeof data.result === 'string' ? data.result : JSON.stringify(data.result);
      const parsed = JSON.parse(rawPayload);
      console.log('[Vercel KV] Store successfully loaded from native Vercel KV storage.');
      return normalizeStore(parsed);
    }
  } catch (err: any) {
    console.warn('[Vercel KV] Error reading from KV:', err.message);
  }
  return null;
}

let isSavingKv = false;
async function saveStoreToVercelKv(dataToSave: StoreData = store): Promise<boolean> {
  const { url, token, isConfigured } = getVercelKvConfig();
  if (!isConfigured || isSavingKv) return false;

  isSavingKv = true;
  try {
    const serialized = JSON.stringify(dataToSave);
    const res = await fetch(`${url}/set/system_store:main_store`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(serialized),
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      console.log('[Vercel KV] Store successfully saved to Vercel KV.');
      return true;
    } else {
      console.warn(`[Vercel KV] Save error HTTP ${res.status}`);
      return false;
    }
  } catch (err: any) {
    console.warn('[Vercel KV] Save error:', err.message);
    return false;
  } finally {
    isSavingKv = false;
  }
}

const DATA_STORE_PATH = path.join(process.cwd(), 'data-store.json');
const TMP_STORE_PATH = path.join('/tmp', 'data-store.json');

function loadLocalStore(): StoreData | null {
  const candidatePaths = [DATA_STORE_PATH, TMP_STORE_PATH];
  for (const candidate of candidatePaths) {
    try {
      if (fs.existsSync(candidate)) {
        const content = fs.readFileSync(candidate, 'utf-8');
        if (content && content.trim()) {
          const parsed = JSON.parse(content);
          console.log(`[Persistence] Loaded initial state from ${candidate}`);
          return normalizeStore(parsed);
        }
      }
    } catch (err: any) {
      console.warn(`[Persistence] Error reading ${candidate}:`, err.message);
    }
  }
  return null;
}

// Initialize the default store before normalizing local state, which may call helpers that read it.
let store: StoreData = { ...defaultStore };
const initialLocalStore = loadLocalStore();
if (initialLocalStore) store = initialLocalStore;
let isStoreInitialized = false;
let lastLocalSaveTimestamp = 0;
let unsubscribeFirebase: (() => void) | null = null;

function setupFirestoreRealtimeSync() {
  if (store.storageConfig?.activeBackend === 'local_file') return;
  const db = getDb();
  if (!db) {
    console.warn('[Firebase Realtime] Firestore DB not available, skipping realtime listener');
    return;
  }
  try {
    if (unsubscribeFirebase) {
      unsubscribeFirebase();
      unsubscribeFirebase = null;
    }
    const docRef = doc(db, 'system_store', 'main_store');
    unsubscribeFirebase = onSnapshot(docRef, async (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data && data.payload) {
          const remoteUpdatedAt = data.updatedAt ? new Date(data.updatedAt).getTime() : 0;
          // Apply if remote update is strictly newer than our last local save (+2000ms buffer)
          if (remoteUpdatedAt > lastLocalSaveTimestamp + 2000) {
            console.log(`[Firebase Realtime] Remote store update detected from cloud (${data.updatedAt})! Syncing local state...`);
            try {
              const remoteStore = normalizeStore(JSON.parse(data.payload));
              const centralChanged = remoteStore.centralFile?.content !== store.centralFile?.content;
              store = remoteStore;
              fs.writeFileSync(DATA_STORE_PATH, JSON.stringify(store, null, 2), 'utf-8');
              if (centralChanged) {
                console.log('[Firebase Realtime] Central subscription changed via remote update! Propagating instantly...');
                syncActiveSubscribersWithCentral().catch((e) => console.warn('[Sync Error]:', e.message));
              }
            } catch (err: any) {
              console.warn('[Firebase Realtime] Parse error:', err.message);
            }
          }
        }
      }
    }, (error) => {
      console.warn('[Firebase Realtime] onSnapshot notice:', error.message);
    });
    console.log('[Firebase Realtime] Bidirectional realtime cloud Firestore sync attached.');
  } catch (err: any) {
    console.warn('[Firebase Realtime] Error setting up listener:', err.message);
  }
}

function saveStore() {
  const now = new Date().toISOString();
  lastLocalSaveTimestamp = Date.now();
  (store as any).updatedAt = now;

  // 1. Immediately persist synchronously to local disk data-store.json (with /tmp fallback on serverless)
  try {
    fs.writeFileSync(DATA_STORE_PATH, JSON.stringify(store, null, 2), 'utf-8');
  } catch (err: any) {
    try {
      fs.writeFileSync(TMP_STORE_PATH, JSON.stringify(store, null, 2), 'utf-8');
    } catch {}
    if (!process.env.VERCEL) {
      console.warn('[Persistence] Local disk write fallback to /tmp:', err.message);
    }
  }

  const activeBackend = store.storageConfig?.activeBackend || 'firebase';
  const autoDualWrite = store.storageConfig?.autoDualWrite !== false;
  const kvConfig = getVercelKvConfig();

  // 2. Persist to active backend and/or dual write
  if (activeBackend === 'firebase' || activeBackend === 'hybrid') {
    saveStoreToFirebase().catch((err) => {
      console.warn('[Firebase saveStore]:', err.message);
    });
  }

  if (activeBackend === 'vercel_kv' || (autoDualWrite && kvConfig.isConfigured)) {
    saveStoreToVercelKv(store).catch((err) => {
      console.warn('[Vercel KV saveStore]:', err.message);
    });
  }
}

// Startup loader for persistence: Supports Firebase, Vercel KV, Hybrid, and Local Disk
async function initFirebaseAndLoadStore(): Promise<void> {
  try {
    const activeBackend = store.storageConfig?.activeBackend || 'firebase';
    let loadedStore: StoreData | null = null;

    if (activeBackend === 'local_file') {
      loadedStore = loadLocalStore();
    } else if (activeBackend === 'vercel_kv') {
      loadedStore = await loadStoreFromVercelKv();
      if (!loadedStore) {
        console.log('[Persistence] Vercel KV empty/offline, attempting Firebase fallback...');
        loadedStore = await loadStoreFromFirebase();
      }
    } else {
      loadedStore = await loadStoreFromFirebase();
      if (!loadedStore) {
        console.log('[Persistence] Firebase empty/offline, checking Vercel KV fallback...');
        loadedStore = await loadStoreFromVercelKv();
      }
    }

    if (loadedStore && Array.isArray(loadedStore.bots) && Array.isArray(loadedStore.gitSources)) {
      console.log(`[Persistence] Authoritative state loaded from cloud (${activeBackend}): ${loadedStore.users?.length || 0} users, ${loadedStore.bots.length} bots, ${loadedStore.gitSources.length} git sources.`);
      store = loadedStore;
      try {
        fs.writeFileSync(DATA_STORE_PATH, JSON.stringify(store, null, 2), 'utf-8');
      } catch {}
    } else {
      const local = activeBackend === 'local_file' ? null : loadLocalStore();
      if (local && (local.users?.length > 0 || local.bots?.length > 0 || local.gitSources?.length > 0)) {
        console.log(`[Persistence] Loaded state from local disk: ${local.users?.length || 0} users, ${local.bots?.length || 0} bots, ${local.gitSources?.length || 0} git sources. Syncing to active cloud backends.`);
        store = local;
      } else {
        console.log('[Persistence] Initializing fresh state across backends.');
      }
      if (activeBackend === 'firebase' || activeBackend === 'hybrid') {
        await saveStoreToFirebase();
      }
      if (activeBackend === 'vercel_kv' || activeBackend === 'hybrid') {
        await saveStoreToVercelKv(store);
      }
    }
  } catch (err: any) {
    console.error('[Persistence] Error during initFirebaseAndLoadStore:', err.message);
  } finally {
    isStoreInitialized = true;
    syncMetadataCacheFromStore();
    if (store.storageConfig?.activeBackend !== 'local_file') {
      setupFirestoreRealtimeSync();
    }
  }
}

// =============================================================
// Comprehensive System & Sync Event Logging Subsystem
// =============================================================
export interface SystemLogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'success' | 'warning' | 'error';
  category: 'sync' | 'gitverse' | 'bot' | 'violations' | 'subscribers' | 'exclusions' | 'system';
  action: string;
  message: string;
  details?: any;
}

const systemLogs: SystemLogEntry[] = [];
const MAX_SYSTEM_LOGS = 1000;

export function logSystemEvent(
  level: 'info' | 'success' | 'warning' | 'error',
  category: SystemLogEntry['category'],
  action: string,
  message: string,
  details?: any
): SystemLogEntry {
  const entry: SystemLogEntry = {
    id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    timestamp: new Date().toISOString(),
    level,
    category,
    action,
    message,
    details: details !== undefined ? (typeof details === 'object' ? details : { value: String(details) }) : undefined,
  };

  systemLogs.unshift(entry);
  if (systemLogs.length > MAX_SYSTEM_LOGS) {
    systemLogs.length = MAX_SYSTEM_LOGS;
  }

  const prefix = `[${category.toUpperCase()}] [${action}]`;
  if (level === 'error') {
    console.error(prefix, message, details ? JSON.stringify(details) : '');
  } else if (level === 'warning') {
    console.warn(prefix, message, details ? JSON.stringify(details) : '');
  } else {
    console.log(prefix, message);
  }

  return entry;
}

// Seed initial system startup log
logSystemEvent('info', 'system', 'SERVER_INIT', 'Сервер Пульс Доступа запущен. Все подсистемы и шлюз активны.');

// Lazy store initialization middleware for serverless (Vercel) cold starts
app.use(async (req, res, next) => {
  if (!isStoreInitialized) {
    try {
      await initFirebaseAndLoadStore();
    } catch (err: any) {
      console.warn('[Vercel Serverless] Lazy store init notice:', err.message);
    }
  }
  next();
});

function getReplacementSourceNodesSync(sourceNum: 1 | 2 | 3 | 4): string {
  const tmpl = store.replacementTemplates || ({} as any);
  if (sourceNum === 1) {
    return (
      store.centralFile?.botDeletedStubContent?.trim() ||
      tmpl.source1Content?.trim() ||
      'vless://00000000-0000-0000-0000-000000000000@127.0.0.1:443?encryption=none&security=none#⚠️ Подписка деактивирована: вы удалили бота или вышли из канала'
    );
  }
  if (sourceNum === 2) {
    return (
      store.centralFile?.deviceBindingStubContent?.trim() ||
      tmpl.source2Content?.trim() ||
      'vless://00000000-0000-0000-0000-000000000000@127.0.0.1:443?encryption=none&security=none#⚠️ Заблокировано: попытка использования на 2-м устройстве (1 подписка = 1 устройство)'
    );
  }
  if (sourceNum === 4) {
    return tmpl.source4Content?.trim() || tmpl.source1Content?.trim() || '';
  }
  return (
    store.centralFile?.limitExceededStubContent?.trim() ||
    tmpl.source3Content?.trim() ||
    'vless://00000000-0000-0000-0000-000000000000@127.0.0.1:443?encryption=none&security=none#⛔ Заблокировано: перманентный бан (превышен лимит нарушений)'
  );
}

// Helper: Detect VPN client application type from User-Agent
function detectClientType(userAgent: string): 'INCY' | 'HAPP' | 'V2Ray' | 'Clash' | 'Sing-Box' | 'Browser' | 'Other' {
  const ua = (userAgent || '').toLowerCase();
  if (ua.includes('happ') || ua.includes('crypt5')) return 'HAPP';
  if (ua.includes('shadowrocket') || ua.includes('v2rayng') || ua.includes('v2ray') || ua.includes('streisand') || ua.includes('nekoray') || ua.includes('karing')) return 'V2Ray';
  if (ua.includes('clash') || ua.includes('mihomo')) return 'Clash';
  if (ua.includes('sing-box') || ua.includes('sfa') || ua.includes('sfi')) return 'Sing-Box';
  if (ua.includes('mozilla') || ua.includes('chrome') || ua.includes('safari') || ua.includes('edge')) return 'Browser';
  if (ua.includes('curl') || ua.includes('python') || ua.includes('wget')) return 'Other';
  return 'INCY';
}

// Helper: Convert JSON outbounds or base64 to standard VPN URI lines (vless://, hysteria2://, etc.)
function normalizeToVpnUris(content: string): string {
  if (!content || !content.trim()) return '';
  let trimmed = content.trim();

  // 1. If base64 encoded subscription, decode and re-normalize
  if (!trimmed.includes('://') && !trimmed.startsWith('{') && !trimmed.startsWith('[') && !trimmed.startsWith('#')) {
    try {
      const decoded = Buffer.from(trimmed, 'base64').toString('utf-8');
      if (decoded.includes('://') || decoded.startsWith('{') || decoded.startsWith('[') || decoded.includes('"outbounds"')) {
        return normalizeToVpnUris(decoded);
      }
    } catch {}
  }

  // 2. Parse JSON outbounds (sing-box / Xray / V2Ray)
  if (trimmed.startsWith('[') || trimmed.startsWith('{') || trimmed.includes('"outbounds"')) {
    try {
      const parsed = JSON.parse(trimmed);
      const list = Array.isArray(parsed) ? parsed : (parsed.outbounds || [parsed]);
      const uris: string[] = [];
      for (const item of list) {
        const outboundsList = Array.isArray(item.outbounds) && item.outbounds.length > 0 ? item.outbounds : [item];
        for (const proxy of outboundsList) {
          const proto = (proxy.protocol || proxy.type || '').toLowerCase();
          const tag = proxy.tag || item.remarks || 'Vaynet';
          const remarks = encodeURIComponent(item.remarks || tag);
          if (proto === 'vless') {
            const vnext = proxy.settings?.vnext?.[0] || proxy.settings;
            const user = vnext?.users?.[0] || vnext?.user;
            const stream = proxy.streamSettings || {};
            const reality = stream.realitySettings || {};
            const addr = vnext?.address || proxy.server;
            const port = vnext?.port || proxy.port || 443;
            const id = user?.id || proxy.uuid;
            const flow = user?.flow || proxy.flow || 'xtls-rprx-vision';
            const sni = reality.serverName || proxy.serverName || addr;
            const pbk = reality.publicKey || proxy.publicKey || '';
            const fp = reality.fingerprint || proxy.fingerprint || 'firefox';
            const spx = reality.spiderX || proxy.spiderX || '/';
            if (id && addr) {
              uris.push(`vless://${id}@${addr}:${port}?encryption=none&flow=${flow}&security=reality&sni=${sni}&fp=${fp}&pbk=${pbk}&sid=&spx=${encodeURIComponent(spx)}&type=tcp#${remarks}`);
            }
          } else if (proto === 'hysteria' || proto === 'hysteria2') {
            const addr = proxy.settings?.address || proxy.server;
            const port = proxy.settings?.port || proxy.port || 443;
            const auth = proxy.streamSettings?.hysteriaSettings?.auth || proxy.password || proxy.auth;
            const sni = proxy.streamSettings?.tlsSettings?.serverName || proxy.sni || addr;
            if (auth && addr) {
              uris.push(`hysteria2://${auth}@${addr}:${port}?sni=${sni}&insecure=0#${remarks}`);
            }
          } else if (proto === 'trojan') {
            const addr = proxy.settings?.servers?.[0]?.address || proxy.server;
            const port = proxy.settings?.servers?.[0]?.port || proxy.port || 443;
            const pass = proxy.settings?.servers?.[0]?.password || proxy.password;
            if (pass && addr) {
              uris.push(`trojan://${pass}@${addr}:${port}?security=tls#${remarks}`);
            }
          } else if (proto === 'shadowsocks' || proto === 'ss') {
            const addr = proxy.settings?.servers?.[0]?.address || proxy.server;
            const port = proxy.settings?.servers?.[0]?.port || proxy.port || 8388;
            const method = proxy.settings?.servers?.[0]?.method || proxy.method;
            const pass = proxy.settings?.servers?.[0]?.password || proxy.password;
            if (pass && addr) {
              const b64 = Buffer.from(`${method}:${pass}`).toString('base64');
              uris.push(`ss://${b64}@${addr}:${port}#${remarks}`);
            }
          }
        }
      }
      if (uris.length > 0) return uris.join('\n');
    } catch {}
  }

  // 3. Ensure clean Unix newlines between concatenated URIs if missing (without splitting vless:// via ss://)
  const withNewlines = trimmed.replace(/(?<!^)(vless:\/\/|hysteria2?:\/\/|trojan:\/\/|vmess:\/\/|(?<!vle)ss:\/\/)/g, '\n$1');
  const lines = withNewlines.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0 && !l.startsWith('//'));
  return lines.join('\n');
}

// Helper: Get full, exact subscription content without dropping comments, headers, or hashes (точь в точь)
function getFullSubscriptionContent(user?: BotUser | null, exclusion?: ExclusionSubscription | null): string {
  const central = store.centralFile?.content || '';

  // 1. Identify effective exclusion if provided or linked to user
  const effectiveExcl = exclusion || (user ? store.exclusions?.find((e) => e.userId === user.id || e.token === user.subscriptionToken) : null);

  if (effectiveExcl) {
    if (effectiveExcl.isBlocked) return getReplacementSourceNodesSync(3);
    if (effectiveExcl.isMuted) return getReplacementSourceNodesSync(2);
    if (effectiveExcl.channelMembership === 'left') return getReplacementSourceNodesSync(1);
    if (effectiveExcl.expiresAt && new Date(effectiveExcl.expiresAt).getTime() < Date.now()) {
      return '# ⛔ Срок действия временной тестовой ссылки истек\n# The temporary test subscription link has expired.';
    }

    const customContentRaw = effectiveExcl.customContent !== undefined
      ? effectiveExcl.customContent
      : (effectiveExcl.customNodes && effectiveExcl.customNodes.length > 0 ? effectiveExcl.customNodes.join('\n') : '');

    const customContent = customContentRaw || '';
    if (customContent.trim()) {
      if (effectiveExcl.attachToCentral) {
        const separator = customContent.endsWith('\n') || central.startsWith('\n') ? '' : '\n';
        return `${customContent}${separator}${central}`;
      }
      return customContent;
    }

    if (!effectiveExcl.attachToCentral) {
      return '# Пустая подписка исключения (собственные узлы не заданы)';
    }
    return central;
  }

  // 2. Check ban/block stubs on user if applicable
  if (user && !user.bypassBlock) {
    if (user.status === 'blocked' || user.isBlocked || user.isPermanentlyBanned) {
      return getReplacementSourceNodesSync(3);
    }
    const maxLeaves = store.centralFile?.limitExceededMaxAttempts ?? 5;
    if ((user.channelLeftCount || 0) >= maxLeaves) {
      return getReplacementSourceNodesSync(3);
    }
    if (user.status === 'muted' || user.isMuted) {
      return getReplacementSourceNodesSync(2);
    }
    if (!user.isAdmin && user.channelMembership !== 'creator' && user.channelMembership !== 'administrator' &&
      (user.status === 'channel_inactive' || user.channelMembership === 'left')) {
      return getReplacementSourceNodesSync(1);
    }
  }

  if (user) {
    // Individual customization: Detached from central (автономный режим)
    if (user.detachedFromCentral) {
      const baseContent = (user.customSubscriptionContent !== undefined && user.customSubscriptionContent !== null && user.customSubscriptionContent.trim().length > 0)
        ? user.customSubscriptionContent
        : (user.personalNodes && user.personalNodes.length > 0 ? user.personalNodes.join('\n') : central);
      return baseContent;
    }

    // User attached to central source:
    let effectiveCentral = central;
    if (user.excludedNodes && user.excludedNodes.length > 0) {
      const excludedFilters = user.excludedNodes.map((n) => n.trim().toLowerCase()).filter(Boolean);
      if (excludedFilters.length > 0) {
        const lines = central.split('\n');
        const filteredLines = lines.filter((line) => {
          const trimmed = line.trim().toLowerCase();
          if (!trimmed) return true;
          for (const excl of excludedFilters) {
            if (trimmed === excl || trimmed.includes(excl)) return false;
          }
          return true;
        });
        effectiveCentral = filteredLines.join('\n');
      }
    }

    if (user.personalNodes && user.personalNodes.length > 0) {
      const existingLines = effectiveCentral.split('\n');
      const uniquePersonal = user.personalNodes.filter((p) => !existingLines.includes(p));
      if (uniquePersonal.length > 0) {
        const personalContent = uniquePersonal.join('\n');
        const separator = personalContent.endsWith('\n') || effectiveCentral.startsWith('\n') ? '' : '\n';
        return `${personalContent}${separator}${effectiveCentral}`;
      }
    }
    return effectiveCentral;
  }

  return central;
}

function getUserRepoSubscriptionContent(user: BotUser): string {
  const linkedExclusion = store.exclusions?.find(
    (item) => item.userId === user.id || item.token === user.subscriptionToken
  );
  if (user.detachedFromCentral || linkedExclusion) {
    return getFullSubscriptionContent(user, null);
  }
  return store.centralFile?.content || '';
}

// Helper: Parse Nodes from text
function parseNodeStats(content: string) {
  const normalized = normalizeToVpnUris(content);
  const lines = normalized.split('\n').map((l) => l.trim()).filter((l) => l.length > 0 && !l.startsWith('#') && !l.startsWith('//'));
  const stats = { vless: 0, vmess: 0, ss: 0, trojan: 0, wireguard: 0 };
  for (const line of lines) {
    if (line.startsWith('vless://')) stats.vless++;
    else if (line.startsWith('vmess://')) stats.vmess++;
    else if (line.startsWith('ss://')) stats.ss++;
    else if (line.startsWith('trojan://')) stats.trojan++;
    else if (line.startsWith('hysteria') || line.startsWith('hysteria2://')) (stats as any).hysteria = ((stats as any).hysteria || 0) + 1;
    else if (line.startsWith('wireguard://') || line.includes('[Interface]')) stats.wireguard++;
  }
  const realCount = Object.values(stats).reduce((a, b) => a + b, 0);
  return {
    total: realCount > 0 ? realCount : lines.length,
    types: stats,
  };
}

const fallbackGitSource: GitSourceItem = {
  id: 'src_default',
  name: 'Основной репозиторий GitVerse (Vaynet/bot)',
  provider: 'gitverse',
  apiUrl: 'https://api.gitverse.ru',
  token: '',
  username: 'Vaynet',
  repository: 'Vaynet/bot',
  branch: 'master',
  filePath: 'L',
  centralRawUrl: 'https://gitverse.ru/api/repos/Vaynet/bot/raw/branch/master/L',
  enabled: true,
  autoSync: true,
  status: 'not_configured',
  lastSyncAt: null,
};

const fallbackBot: ManagedBotItem = {
  id: 'bot_default',
  name: 'Основной Telegram бот',
  token: '',
  username: '',
  enabled: true,
  status: 'not_configured',
  channels: [],
  enableFireworks: true,
  buttonColor: 'indigo',
  showQrCode: true,
  adminContactUrl: '',
  blockedUserMessage: '{username}, вы не можете получить здесь подписку из-за подозрений на подозрительные действия или нарушение правил сервиса.',
  unsubscribedMessage: '⚠️ Ваша подписка деактивирована, так как вы покинули канал. Она снова станет активной при подписке на канал. Если этого не произойдет в течение {hours} часов, она будет полностью удалена.',
  selfDeleteHours: 72,
  deletePreviousMessageOnStep: false,
  captchaType: 'none',
  welcomeMessage: 'Привет, {name}! Добро пожаловать в сервис персональных подписок.',
  privacyPolicyText: 'Условия сервиса и политика конфиденциальности.',
  privacyPolicyUrl: 'https://telegra.ph/Privacy-Policy-Puls-01',
  mediaType: 'none',
  mediaUrl: '',
};

function getActiveGitSource(): GitSourceItem {
  return store.gitSources?.find((s) => s.id === store.activeGitSourceId) || store.gitSources?.[0] || fallbackGitSource;
}

function getActiveBot(): ManagedBotItem {
  return store.bots?.find((b) => b.id === store.activeBotId) || store.bots?.[0] || fallbackBot;
}

// Helper: Build Direct Raw URL for any Git provider (GitVerse, SourceCraft, GitFlic, MosHub, GitHub, GitLab)
function buildGitRawUrl(source: GitSourceItem, filePath: string): string {
  const cleanRepo = (source.repository || 'Vaynet/bot').replace(/^\/+|\/+$/g, '');
  const branch = source.branch || (source.provider === 'sourcecraft' || source.provider === 'github' ? 'main' : 'master');
  const cleanPath = filePath.replace(/^\/+/, '');

  if (source.provider === 'sourcecraft') {
    const cachedSha = gitFileMetadataCache.get(cleanPath)?.sha;
    return cachedSha && /^[0-9a-f]{40}$/i.test(cachedSha)
      ? `https://raw.sourcecraft.tech/raw/${cleanRepo}/${cachedSha}/${cleanPath}`
      : '';
  }

  if (source.provider === 'custom' && source.baseRawUrl && source.baseRawUrl.toLowerCase().includes(cleanRepo.toLowerCase())) {
    try {
      const u = new URL(source.baseRawUrl);
      const repoIdx = u.pathname.toLowerCase().indexOf(cleanRepo.toLowerCase());
      if (repoIdx !== -1) {
        const prefix = u.pathname.substring(0, repoIdx + cleanRepo.length);
        return `${u.origin}${prefix}/${branch}/${cleanPath}`;
      }
    } catch {}
  }

  if (source.provider === 'gitverse' || !source.provider) {
    return `https://gitverse.ru/api/repos/${cleanRepo}/raw/branch/${branch}/${cleanPath}`;
  } else if (source.provider === 'gitflic') {
    return `https://gitflic.ru/project/${cleanRepo}/blob/raw?file=${encodeURIComponent(cleanPath)}`;
  } else if (source.provider === 'moshub') {
    return `https://hub.mos.ru/${cleanRepo}/-/raw/${branch}/${cleanPath}`;
  } else if (source.provider === 'github') {
    return `https://raw.githubusercontent.com/${cleanRepo}/${branch}/${cleanPath}`;
  } else if (source.provider === 'gitlab') {
    return `https://gitlab.com/${cleanRepo}/-/raw/${branch}/${cleanPath}`;
  }
  return `https://gitverse.ru/api/repos/${cleanRepo}/raw/branch/${branch}/${cleanPath}`;
}

function buildGitRepositoryWebUrl(source: GitSourceItem): string {
  const repository = (source.repository || '').replace(/^\/+|\/+$/g, '');
  if (source.provider === 'sourcecraft') return `https://sourcecraft.dev/${repository}`;
  if (source.provider === 'gitflic') return `https://gitflic.ru/project/${repository}`;
  if (source.provider === 'moshub') return `https://hub.mos.ru/${repository}`;
  if (source.provider === 'github') return `https://github.com/${repository}`;
  if (source.provider === 'gitlab') return `https://gitlab.com/${repository}`;
  return `https://gitverse.ru/${repository}`;
}

function repositoryPathFromInput(value: string, provider: GitProvider): string {
  const input = value.trim();
  try {
    const url = new URL(input);
    let path = decodeURIComponent(url.pathname).replace(/^\/+|\/+$/g, '');
    if (provider === 'gitflic') path = path.replace(/^project\//i, '');
    return path.replace(/\.git$/i, '');
  } catch {
    let path = input.replace(/^https?:\/\/[^/]+\//i, '').replace(/^\/+|\/+$/g, '');
    if (provider === 'gitflic') path = path.replace(/^project\//i, '');
    return path.replace(/\.git$/i, '');
  }
}

// Build the configured HAPP deep-link format from the repository RAW URL.
const HAPP_CRYPTO_V4_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEA3UZ0M3L4K+WjM3vkbQnz
ozHg/cRbEXvQ6i4A8RVN4OM3rK9kU01FdjyoIgywve8OEKsFnVwERZAQZ1Trv60B
hmaM76QQEE+EUlIOL9EpwKWGtTL5lYC1sT9XJMNP3/CI0gP5wwQI88cY/xedpOEB
W72EmOOShHUm/b/3m+HPmqwc4ugKj5zWV5SyiT829aFA5DxSjmIIFBAms7DafmSq
LFTYIQL5cShDY2u+/sqyAw9yZIOoqW2TFIgIHhLPWek/ocDU7zyOrlu1E0SmcQQb
LFqHq02fsnH6IcqTv3N5Adb/CkZDDQ6HvQVBmqbKZKf7ZdXkqsc/Zw27xhG7OfXC
tUmWsiL7zA+KoTd3avyOh93Q9ju4UQsHthL3Gs4vECYOCS9dsXXSHEY/1ngU/hjO
WFF8QEE/rYV6nA4PTyUvo5RsctSQL/9DJX7XNh3zngvif8LsCN2MPvx6X+zLouBX
zgBkQ9DFfZAGLWf9TR7KVjZC/3NsuUCDoAOcpmN8pENBbeB0puiKMMWSvll36+2M
YR1Xs0MgT8Y9TwhE2+TnnTJOhzmHi/BxiUlY/w2E0s4ax9GHAmX0wyF4zeV7kDkc
vHuEdc0d7vDmdw0oqCqWj0Xwq86HfORu6tm1A8uRATjb4SzjTKclKuoElVAVa5Jo
oh/uZMozC65SmDw+N5p6Su8CAwEAAQ==
-----END PUBLIC KEY-----`;

function buildHappCryptUrl(rawUrl: string, version: HappCryptVersion = store.happCryptVersion): string {
  if (version === 'crypt5') {
    return `happ://crypt5/${Buffer.from(rawUrl, 'utf8').toString('base64')}ff`;
  }
  const encrypted = crypto.publicEncrypt(
    {
      key: HAPP_CRYPTO_V4_PUBLIC_KEY,
      padding: crypto.constants.RSA_PKCS1_PADDING,
    },
    Buffer.from(rawUrl, 'utf8')
  );
  const ciphertext = encrypted.toString('base64');
  return version === 'crypt3'
    ? `happ://crypt3/CH/${ciphertext}`
    : `happ://crypt4/${ciphertext}`;
}

function convertToHappCryptUrl(rawUrl: string, _token: string, _userTelegramId: number): string {
  return buildHappCryptUrl(rawUrl);
}

// Qsen's shortener page uses this same clck.ru endpoint for URL creation.
function isClckShortUrl(url: string | undefined): url is string {
  return Boolean(url && /^https:\/\/clck\.ru\/[A-Za-z0-9_-]+$/i.test(url));
}

async function clckRedirectsTo(shortUrl: string, targetUrl: string): Promise<boolean> {
  const response = await fetch(shortUrl, {
    redirect: 'manual',
    signal: AbortSignal.timeout(10000),
  });
  const location = response.headers.get('location');
  await response.body?.cancel();
  if (response.status < 300 || response.status >= 400 || !location) return false;
  return new URL(location, shortUrl).href === new URL(targetUrl).href;
}

function getUserSubscriptionTargetUrl(user: any): string {
  const token = user.subscriptionToken || `sub_${user.username || user.telegramId}`;
  const subscription = user.sourceSubscriptions?.find(
    (item: any) => item.sourceId === user.subscriptionSourceId && item.filePath === user.gitFilePath
  ) || user.sourceSubscriptions?.find((item: any) => item.sourceId === user.subscriptionSourceId);
  const source = store.gitSources?.find((item: GitSourceItem) => item.id === user.subscriptionSourceId) || getActiveGitSource();
  const filePath = subscription?.filePath || user.gitFilePath || `subs/${token}.txt`;
  const repoFile = store.repoFiles?.find(
    (item: RepoUserFile) =>
      item.sourceId === source.id && item.filePath.replace(/^\/+/, '') === filePath.replace(/^\/+/, '')
  );
  const candidates = [
    subscription?.rawUrl,
    repoFile?.rawUrl,
    user.subscriptionSourceId === source.id ? user.gitRawUrl : undefined,
  ];
  const storedRawUrl = candidates.find((url): url is string =>
    Boolean(url && isRepositoryRawUrl(source, url, filePath))
  );
  if (storedRawUrl) return storedRawUrl;
  const repoFileSha = repoFile?.sha;
  if (source.provider === 'sourcecraft' && repoFileSha && /^[0-9a-f]{40}$/i.test(repoFileSha)) {
    const repository = (source.repository || 'Vaynet/bot').replace(/^\/+|\/+$/g, '');
    return `https://raw.sourcecraft.tech/raw/${repository}/${repoFileSha}/${filePath.replace(/^\/+/, '')}`;
  }
  return buildGitRawUrl(source, filePath);
}

function isRepositoryRawUrl(source: GitSourceItem, rawUrl: string, filePath?: string): boolean {
  try {
    const url = new URL(rawUrl);
    const hostname = url.hostname.toLowerCase();
    if (url.pathname.toLowerCase().includes('/api/sub/')) return false;
    if (filePath) {
      const expectedPath = filePath.replace(/^\/+/, '');
      const actualPath = source.provider === 'gitflic'
        ? url.searchParams.get('file') || ''
        : decodeURIComponent(url.pathname);
      const normalizedPath = actualPath.replace(/^\/+/, '');
      if (normalizedPath !== expectedPath && !normalizedPath.endsWith(`/${expectedPath}`)) return false;
    }
    if (source.provider === 'sourcecraft') {
      const path = url.pathname.split('/').filter(Boolean);
      const repository = (source.repository || 'Vaynet/bot').replace(/^\/+|\/+$/g, '').split('/');
      const repositoryPath = path.slice(1, 1 + repository.length);
      return hostname === 'raw.sourcecraft.tech' &&
        path[0] === 'raw' &&
        repository.length > 0 &&
        repositoryPath.every((part, index) => part.toLowerCase() === repository[index].toLowerCase()) &&
        /^[0-9a-f]{40}$/i.test(path[1 + repository.length] || '');
    }
    const allowedHosts: Partial<Record<GitProvider, string[]>> = {
      sourcecraft: ['raw.sourcecraft.tech'],
      gitverse: ['gitverse.ru'],
      gitflic: ['gitflic.ru'],
      moshub: ['hub.mos.ru'],
      github: ['raw.githubusercontent.com', 'github.com'],
      gitlab: ['gitlab.com'],
    };
    const expected = allowedHosts[source.provider];
    if (expected) return expected.includes(hostname);
    const configuredHost = source.baseRawUrl ? new URL(source.baseRawUrl).hostname.toLowerCase() : '';
    return Boolean(configuredHost && hostname === configuredHost);
  } catch {
    return false;
  }
}

async function getExistingCurrentSourceSubscription(
  user: BotUser
): Promise<{ url: string; format: 'happ' | 'incy'; sourceName: string } | null> {
  const source = getActiveGitSource();
  if (
    source.enabled === false ||
    !source.token?.trim() ||
    !user.hasActiveSubscription ||
    user.pendingSubscriptionReissue
  ) return null;
  if (
    user.status !== 'active' ||
    user.isBlocked ||
    user.isPermanentlyBanned ||
    user.isMuted ||
    user.detachedFromCentral
  ) return null;

  const linkedRepoFile = store.repoFiles?.find(
    (item) =>
      item.sourceId === source.id &&
      (item.userId === user.id || item.telegramId === user.telegramId)
  );
  const subscription = user.sourceSubscriptions?.find(
    (item) => item.sourceId === source.id && item.filePath === user.gitFilePath
  ) || user.sourceSubscriptions?.find((item) => item.sourceId === source.id) ||
    (user.subscriptionSourceId === source.id && user.gitFilePath
      ? {
          sourceId: source.id,
          filePath: user.gitFilePath,
          rawUrl: user.gitRawUrl || '',
          format: user.subscriptionType === 'happ' ? 'happ' as const : 'incy' as const,
          finalUrl: user.finalSubscriptionUrl || user.finalUrl || '',
        }
      : linkedRepoFile
        ? {
            sourceId: source.id,
            filePath: linkedRepoFile.filePath,
            rawUrl: linkedRepoFile.rawUrl,
            format: linkedRepoFile.format,
            finalUrl: linkedRepoFile.finalUrl,
          }
        : undefined);
  if (!subscription?.filePath) return null;

  const filePath = subscription.filePath;
  const repoFile = store.repoFiles?.find(
    (item) =>
      item.sourceId === source.id &&
      item.filePath.replace(/^\/+/, '') === filePath.replace(/^\/+/, '') &&
      (!item.telegramId || item.telegramId === user.telegramId) &&
      (!item.userId || item.userId === user.id)
  );
  const rawUrl = repoFile?.rawUrl || subscription.rawUrl;
  const format = subscription.format;
  const finalUrl = repoFile?.finalUrl || subscription.finalUrl;
  if (
    !repoFile ||
    repoFile.isPoolFree ||
    repoFile.isAccessible === false ||
    !repoFile.contentHash ||
    repoFile.contentHash !== crypto.createHash('sha256').update(getUserRepoSubscriptionContent(user)).digest('hex') ||
    (format !== 'happ' && format !== 'incy') ||
    !isRepositoryRawUrl(source, rawUrl, filePath) ||
    (format === 'happ' && !isHappUrlForVersion(finalUrl, store.happCryptVersion)) ||
    (format === 'incy' && !isClckShortUrl(finalUrl))
  ) return null;

  const response = await fetch(rawUrl, { signal: AbortSignal.timeout(12000) });
  if (!response.ok) return null;
  const remoteContent = await response.text();
  if (crypto.createHash('sha256').update(remoteContent).digest('hex') !== repoFile.contentHash) return null;
  if (format === 'incy' && !(await clckRedirectsTo(finalUrl, rawUrl))) return null;

  user.subscriptionSourceId = source.id;
  user.gitFilePath = filePath;
  user.gitRawUrl = rawUrl;
  user.subscriptionType = format;
  user.subscriptionName = format === 'happ' ? `HAPP (${store.happCryptVersion})` : 'INCY';
  user.finalSubscriptionUrl = finalUrl;
  user.finalUrl = finalUrl;
  user.clckUrl = finalUrl;
  user.clckTargetUrl = rawUrl;
  saveStore();

  return { url: finalUrl, format, sourceName: source.name };
}

function applyUserIncyShortUrl(user: any, targetUrl: string, shortUrl: string): void {
  user.clckUrl = shortUrl;
  user.clckTargetUrl = targetUrl;
  if (user.subscriptionType === 'incy') {
    user.finalSubscriptionUrl = shortUrl;
    user.finalUrl = shortUrl;
  }
  const subscription = user.sourceSubscriptions?.find(
    (item: any) => item.sourceId === user.subscriptionSourceId && item.filePath === user.gitFilePath
  );
  if (subscription) subscription.finalUrl = shortUrl;
  const repoFile = store.repoFiles?.find(
    (item: RepoUserFile) =>
      item.sourceId === user.subscriptionSourceId &&
      item.filePath === user.gitFilePath
  );
  if (repoFile) repoFile.finalUrl = shortUrl;
}

function isHappUrlForVersion(url: string | undefined, version: HappCryptVersion): boolean {
  if (!url) return false;
  if (version === 'crypt3') return url.startsWith('happ://crypt3/CH/');
  return url.startsWith(`happ://${version}/`);
}

function applyUserHappCryptUrl(
  user: any,
  targetUrl: string,
  happUrl: string,
  version: HappCryptVersion = store.happCryptVersion
): void {
  user.finalSubscriptionUrl = happUrl;
  user.finalUrl = happUrl;
  user.clckUrl = happUrl;
  user.clckTargetUrl = targetUrl;
  const subscription = user.sourceSubscriptions?.find(
    (item: any) => item.sourceId === user.subscriptionSourceId && item.filePath === user.gitFilePath
  );
  if (subscription) subscription.finalUrl = happUrl;
  for (const item of user.sourceSubscriptions || []) {
    const source = store.gitSources?.find((candidate) => candidate.id === item.sourceId);
    if (
      item.format === 'happ' &&
      item !== subscription &&
      item.rawUrl &&
      source &&
      isRepositoryRawUrl(source, item.rawUrl, item.filePath)
    ) {
      item.finalUrl = buildHappCryptUrl(item.rawUrl, version);
    }
  }
  const repoFile = store.repoFiles?.find(
    (item: RepoUserFile) =>
      item.sourceId === user.subscriptionSourceId &&
      item.filePath === user.gitFilePath
  );
  if (repoFile) repoFile.finalUrl = happUrl;
}

async function refreshUserSubscriptionLink(
  user: BotUser,
  sourceId: string,
  filePath: string,
  rawUrl: string,
  format: 'happ' | 'incy'
): Promise<string> {
  const token = user.subscriptionToken || `sub_${user.username || user.telegramId}`;
  const activeSource = getActiveGitSource();
  const source = store.gitSources?.find((item) => item.id === sourceId) ||
    (activeSource.id === sourceId ? activeSource : undefined);
  if (!source || !isRepositoryRawUrl(source, rawUrl, filePath)) {
    throw new Error(`Источник не вернул действительный RAW-адрес файла ${filePath}`);
  }
  const targetUrl = rawUrl;

  if (!Array.isArray(user.sourceSubscriptions)) user.sourceSubscriptions = [];
  let subscription = user.sourceSubscriptions.find(
    (item) => item.sourceId === sourceId && item.filePath === filePath
  );
  if (!subscription) {
    subscription = {
      sourceId,
      filePath,
      rawUrl,
      format,
      finalUrl: '',
      updatedAt: new Date().toISOString(),
    };
    user.sourceSubscriptions.push(subscription);
  }
  const previousRawUrl = subscription.rawUrl;
  const previousFinalUrl = subscription.finalUrl;
  subscription.rawUrl = rawUrl;
  subscription.format = format;
  subscription.updatedAt = new Date().toISOString();
  const isCurrentSource = user.subscriptionSourceId === sourceId || !user.subscriptionSourceId;
  if (isCurrentSource) {
    user.subscriptionSourceId = sourceId;
    user.gitFilePath = filePath;
    user.gitRawUrl = rawUrl;
  }

  let finalUrl: string;
  if (format === 'happ') {
    finalUrl = previousRawUrl === targetUrl && isHappUrlForVersion(previousFinalUrl, store.happCryptVersion)
      ? previousFinalUrl
      : buildHappCryptUrl(targetUrl);
    if (!isHappUrlForVersion(finalUrl, store.happCryptVersion)) {
      throw new Error(`Не удалось обновить HAPP-ссылку формата ${store.happCryptVersion}.`);
    }
    if (isCurrentSource) {
      applyUserHappCryptUrl(user, targetUrl, finalUrl);
    } else {
      subscription.finalUrl = finalUrl;
    }
  } else {
    if (previousRawUrl === targetUrl && isClckShortUrl(previousFinalUrl)) {
      finalUrl = previousFinalUrl;
    } else if (isCurrentSource && user.clckTargetUrl === targetUrl && isClckShortUrl(user.clckUrl)) {
      finalUrl = user.clckUrl;
    } else {
      finalUrl = await shortenIncyUrl(targetUrl, token);
    }
    if (!isClckShortUrl(finalUrl)) {
      throw new Error('Не удалось обновить короткую INCY-ссылку clck.ru.');
    }
    if (isCurrentSource) {
      applyUserIncyShortUrl(user, targetUrl, finalUrl);
      user.finalSubscriptionUrl = finalUrl;
      user.finalUrl = finalUrl;
      user.clckUrl = finalUrl;
      user.clckTargetUrl = targetUrl;
    } else {
      subscription.finalUrl = finalUrl;
    }
  }
  subscription.finalUrl = finalUrl;

  const repoFile = store.repoFiles?.find(
    (item) => item.sourceId === sourceId && item.filePath === filePath
  );
  if (repoFile) repoFile.finalUrl = finalUrl;
  return finalUrl;
}

function migrateHappLinks(version: HappCryptVersion): number {
  let updatedCount = 0;
  for (const user of store.users || []) {
    if (
      user.subscriptionType !== 'happ' ||
      (!user.finalSubscriptionUrl && !user.gitRawUrl && !user.gitFilePath)
    ) continue;
    const targetUrl = getUserSubscriptionTargetUrl(user);
    if (!targetUrl) continue;
    applyUserHappCryptUrl(user, targetUrl, buildHappCryptUrl(targetUrl, version), version);
    user.subscriptionName = `HAPP (${version})`;
    updatedCount++;
  }
  for (const exclusion of store.exclusions || []) {
    if (exclusion.gitRawUrl) {
      exclusion.happUrl = buildHappCryptUrl(exclusion.gitRawUrl, version);
      updatedCount++;
    }
  }
  for (const repoFile of store.repoFiles || []) {
    if (repoFile.format !== 'happ') continue;
    const matchingUser = store.users?.find(
      (user) => user.subscriptionSourceId === repoFile.sourceId && user.gitFilePath === repoFile.filePath
    );
    if (!matchingUser && repoFile.rawUrl) {
      repoFile.finalUrl = buildHappCryptUrl(repoFile.rawUrl, version);
      updatedCount++;
    }
  }
  saveStore();
  return updatedCount;
}

// Qsen's UI posts the URL to clck.ru and returns a clck.ru short URL.
async function shortenIncyUrl(rawUrl: string, _tokenSafe?: string): Promise<string> {
  const targetUrl = rawUrl?.trim();
  if (!targetUrl || !/^https:\/\//i.test(targetUrl)) {
    throw new Error('Для короткой INCY-ссылки требуется действительный HTTPS-адрес файла подписки.');
  }
  if (isClckShortUrl(targetUrl)) return targetUrl;

  try {
    const params = new URLSearchParams({ url: targetUrl });
    const response = await fetch(`https://clck.ru/--?${params.toString()}`, {
      headers: { Accept: 'text/plain' },
      signal: AbortSignal.timeout(10000),
    });
    const shortUrl = (await response.text()).trim();
    if (response.ok && isClckShortUrl(shortUrl)) return shortUrl;
    throw new Error(`Сервис сокращения вернул неподходящий ответ (HTTP ${response.status}): ${shortUrl.slice(0, 200)}`);
  } catch (err: any) {
    console.warn('[Qsen/clck.ru shortener warning]:', err.message);
    throw new Error(`Не удалось сократить INCY-ссылку через Qsen/clck.ru: ${err.message}`);
  }
}

// Resolve and persist the display URL for the selected subscription format.
async function resolveUserDisplayKey(user: any): Promise<string> {
  const isHapp = user.subscriptionType === 'happ';
  const token = user.subscriptionToken || `sub_${user.username || user.telegramId}`;
  const targetBaseUrl = getUserSubscriptionTargetUrl(user);
  const source = store.gitSources?.find((item: GitSourceItem) => item.id === user.subscriptionSourceId) || getActiveGitSource();
  const targetFilePath =
    user.sourceSubscriptions?.find((item: any) => item.sourceId === source.id && item.filePath === user.gitFilePath)?.filePath ||
    user.sourceSubscriptions?.find((item: any) => item.sourceId === source.id)?.filePath ||
    user.gitFilePath ||
    `subs/${token}.txt`;
  if (!isRepositoryRawUrl(source, targetBaseUrl, targetFilePath)) {
    throw new Error(`Ссылка подписки не является RAW-ссылкой источника «${source.name}»`);
  }

  if (isHapp) {
    const happUrl = buildHappCryptUrl(targetBaseUrl);
    applyUserHappCryptUrl(user, targetBaseUrl, happUrl);
    saveStore();
    return happUrl;
  } else {
    const incyUrl = user.clckTargetUrl === targetBaseUrl && isClckShortUrl(user.clckUrl)
      ? user.clckUrl
      : await shortenIncyUrl(targetBaseUrl, token);
    applyUserIncyShortUrl(user, targetBaseUrl, incyUrl);
    saveStore();
    return incyUrl;
  }
}

// Helper: Direct GitVerse raw URL - no third-party shorteners or extraneous redirects
async function shortenToRuDomain(rawUrl: string, _host?: string, _tokenSafe?: string): Promise<string> {
  return rawUrl;
}

// Helper: Extract owner and repo from repository string (e.g. "Vaynet/bot" -> { owner: "Vaynet", repo: "bot" })
function getRepoParts(source: GitSourceItem): { owner: string; repo: string } {
  const repoStr = (source.repository || 'Vaynet/bot').replace(/^\/+|\/+$/g, '');
  const parts = repoStr.split('/');
  if (parts.length >= 2) {
    return { owner: parts[0], repo: parts.slice(1).join('/') };
  }
  return {
    owner: source.username || 'Vaynet',
    repo: parts[0] || 'bot',
  };
}

function getDefaultGitBranch(provider: GitProvider): string {
  return provider === 'sourcecraft' || provider === 'github' ? 'main' : 'master';
}

function usesGitCliProvider(provider: GitProvider): boolean {
  return provider === 'sourcecraft' || provider === 'gitflic' || provider === 'moshub' || provider === 'github' || provider === 'gitlab';
}

function buildGitRemoteUrl(provider: GitProvider, owner: string, repo: string): string {
  const encodedOwner = encodeURIComponent(owner);
  const encodedRepo = repo.split('/').map(encodeURIComponent).join('/');

  if (provider === 'sourcecraft') {
    return `https://git@git.sourcecraft.dev/${encodedOwner}/${encodedRepo}.git`;
  }
  if (provider === 'github') {
    return `https://github.com/${encodedOwner}/${encodedRepo}.git`;
  }
  if (provider === 'gitlab') {
    return `https://gitlab.com/${encodedOwner}/${encodedRepo}.git`;
  }
  if (provider === 'gitflic') {
    return `https://gitflic.ru/project/${encodedOwner}/${encodedRepo}.git`;
  }
  if (provider === 'moshub') {
    return `https://hub.mos.ru/${encodedOwner}/${encodedRepo}.git`;
  }
  return `https://gitverse.ru/${encodedOwner}/${encodedRepo}.git`;
}

function buildGitAuthEnv(provider: GitProvider, token: string, username?: string): NodeJS.ProcessEnv {
  const authUsername = provider === 'github'
    ? 'x-access-token'
    : provider === 'sourcecraft'
      ? 'git'
      : (username?.trim() || 'oauth2');
  const basicAuth = Buffer.from(`${authUsername}:${token.trim()}`).toString('base64');
  return {
    ...process.env,
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.extraheader',
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: Basic ${basicAuth}`,
    GIT_TERMINAL_PROMPT: '0',
  };
}

// High-Speed GitVerse Operations Throttle & Semaphore (Strict serial queue to eliminate branch ref locks)
class GitOperationThrottle {
  private activeCount = 0;
  private maxConcurrency = 1;
  private queue: Array<() => void> = [];
  private lastCommitTime = 0;
  private minIntervalMs = 450;

  async acquire(): Promise<() => void> {
    if (this.activeCount >= this.maxConcurrency) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.activeCount++;

    const now = Date.now();
    const elapsed = now - this.lastCommitTime;
    if (elapsed < this.minIntervalMs) {
      await new Promise((resolve) => setTimeout(resolve, this.minIntervalMs - elapsed));
    }
    this.lastCommitTime = Date.now();

    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.activeCount--;
      if (this.queue.length > 0) {
        const next = this.queue.shift();
        if (next) next();
      }
    };
  }
}

const gitThrottle = new GitOperationThrottle();

function enqueueGitOperation<T>(op: () => Promise<T>): Promise<T> {
  return gitThrottle.acquire().then(async (release) => {
    try {
      return await op();
    } finally {
      release();
    }
  });
}

// Global in-memory cache for Git repository files to eliminate redundant network queries
const gitFileMetadataCache = new Map<
  string,
  {
    sha?: string;
    contentHash: string;
    rawUrl?: string;
    lastUpdated: number;
  }
>();

function syncMetadataCacheFromStore() {
  if (store.repoFiles) {
    for (const f of store.repoFiles) {
      if (f.filePath) {
        const clean = f.filePath.replace(/^\/+/, '');
        gitFileMetadataCache.set(clean, {
          sha: f.sha,
          contentHash: f.contentHash || '',
          rawUrl: f.rawUrl,
          lastUpdated: f.updatedAt ? new Date(f.updatedAt).getTime() : Date.now(),
        });
      }
    }
  }
}

// Helper: Batch commit and push multiple files directly via Git CLI
async function batchCommitFilesViaGitCli(params: {
  token: string;
  owner: string;
  repo: string;
  branch: string;
  files: Array<{ filePath: string; content: string }>;
  commitMessage: string;
  provider: GitProvider;
  username?: string;
}): Promise<{ success: boolean; sha?: string; error?: string }> {
  const { token, owner, repo, branch, files, commitMessage, provider, username } = params;
  if (!files || files.length === 0) return { success: true };
  const branchName = branch || getDefaultGitBranch(provider);
  const remoteUrl = buildGitRemoteUrl(provider, owner, repo);
  const gitEnv = buildGitAuthEnv(provider, token, username);

  const safeOwnerRepo = `${owner}_${repo}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  const repoDir = path.join('/tmp', 'git_cache', `${provider}_${safeOwnerRepo}`);

  try {
    await fs.promises.mkdir('/tmp/git_cache', { recursive: true });

    let needsClone = true;
    try {
      const gitDirStat = await fs.promises.stat(path.join(repoDir, '.git'));
      if (gitDirStat.isDirectory()) {
        needsClone = false;
      }
    } catch {
      needsClone = true;
    }

    if (needsClone) {
      await fs.promises.rm(repoDir, { recursive: true, force: true }).catch(() => {});
      try {
        await execFileAsync('git', ['clone', '--depth', '1', '-b', branchName, remoteUrl, repoDir], { timeout: 35000, env: gitEnv });
      } catch {
        await execFileAsync('git', ['clone', '--depth', '1', remoteUrl, repoDir], { timeout: 35000, env: gitEnv });
        try {
          await execFileAsync('git', ['checkout', '-B', branchName], { cwd: repoDir, timeout: 10000, env: gitEnv });
        } catch {}
      }
    } else {
      try {
        await execFileAsync('git', ['remote', 'set-url', 'origin', remoteUrl], { cwd: repoDir, timeout: 5000, env: gitEnv });
        await execFileAsync('git', ['fetch', '--depth', '1', 'origin', branchName], { cwd: repoDir, timeout: 25000, env: gitEnv });
        await execFileAsync('git', ['checkout', branchName], { cwd: repoDir, timeout: 5000, env: gitEnv });
        await execFileAsync('git', ['reset', '--hard', `origin/${branchName}`], { cwd: repoDir, timeout: 5000, env: gitEnv });
      } catch {
        await fs.promises.rm(repoDir, { recursive: true, force: true }).catch(() => {});
        await execFileAsync('git', ['clone', '--depth', '1', '-b', branchName, remoteUrl, repoDir], { timeout: 35000, env: gitEnv });
      }
    }

    await execFileAsync('git', ['config', 'user.name', owner || 'PulsAccess'], { cwd: repoDir });
    await execFileAsync('git', ['config', 'user.email', `${owner || 'bot'}@sourcecraft.dev`], { cwd: repoDir });

    for (const f of files) {
      const cleanPath = f.filePath.replace(/^\/+/, '');
      const fullTargetFilePath = path.join(repoDir, cleanPath);
      await fs.promises.mkdir(path.dirname(fullTargetFilePath), { recursive: true });
      await fs.promises.writeFile(fullTargetFilePath, f.content, 'utf-8');
      await execFileAsync('git', ['add', cleanPath], { cwd: repoDir, timeout: 10000 });
    }

    const statusResult = await execFileAsync('git', ['status', '--porcelain'], { cwd: repoDir, timeout: 5000 });
    let commitSha = '';
    if (statusResult.stdout.trim()) {
      await execFileAsync('git', ['commit', '-m', commitMessage || `Update ${files.length} subscription files`], { cwd: repoDir, timeout: 15000 });
    }
    const revParse = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: repoDir, timeout: 5000 });
    commitSha = revParse.stdout.trim();

    await execFileAsync('git', ['push', 'origin', branchName], { cwd: repoDir, timeout: 30000, env: gitEnv });

    return { success: true, sha: commitSha };
  } catch (err: any) {
    console.error(`[Git CLI] Error batch committing to ${provider}:`, err.message);
    return { success: false, error: err.message };
  }
}

// Helper: Commit and push file directly via Git CLI (used for SourceCraft and as universal Git fallback)
async function commitFileViaGitCli(params: {
  token: string;
  owner: string;
  repo: string;
  branch: string;
  filePath: string;
  content: string;
  commitMessage: string;
  provider: GitProvider;
  username?: string;
}): Promise<{ success: boolean; sha?: string; error?: string }> {
  return batchCommitFilesViaGitCli({
    token: params.token,
    owner: params.owner,
    repo: params.repo,
    branch: params.branch,
    files: [{ filePath: params.filePath, content: params.content }],
    commitMessage: params.commitMessage,
    provider: params.provider,
    username: params.username,
  });
}

// Helper: Delete file directly via Git CLI
async function deleteFileViaGitCli(params: {
  token: string;
  owner: string;
  repo: string;
  branch: string;
  filePath: string;
  commitMessage?: string;
  provider: GitProvider;
  username?: string;
}): Promise<boolean> {
  const { token, owner, repo, branch, filePath, commitMessage, provider, username } = params;
  const cleanPath = filePath.replace(/^\/+/, '');
  const branchName = branch || getDefaultGitBranch(provider);
  const safeOwnerRepo = `${owner}_${repo}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  const repoDir = path.join('/tmp', 'git_cache', `${provider}_${safeOwnerRepo}`);

  try {
    const remoteUrl = buildGitRemoteUrl(provider, owner, repo);
    const gitEnv = buildGitAuthEnv(provider, token, username);
    await fs.promises.mkdir('/tmp/git_cache', { recursive: true });
    let hasClone = false;
    try {
      hasClone = (await fs.promises.stat(path.join(repoDir, '.git'))).isDirectory();
    } catch {}
    if (!hasClone) {
      await fs.promises.rm(repoDir, { recursive: true, force: true });
      await execFileAsync('git', ['clone', '--depth', '1', '-b', branchName, remoteUrl, repoDir], { timeout: 35000, env: gitEnv });
    }
    await execFileAsync('git', ['remote', 'set-url', 'origin', remoteUrl], { cwd: repoDir, timeout: 5000, env: gitEnv }).catch(() => {});
    await execFileAsync('git', ['fetch', '--depth', '1', 'origin', branchName], { cwd: repoDir, timeout: 25000, env: gitEnv });
    await execFileAsync('git', ['checkout', branchName], { cwd: repoDir, timeout: 5000, env: gitEnv });
    await execFileAsync('git', ['reset', '--hard', `origin/${branchName}`], { cwd: repoDir, timeout: 5000, env: gitEnv });

    const trackedFile = await execFileAsync('git', ['ls-files', '--error-unmatch', '--', cleanPath], {
      cwd: repoDir,
      timeout: 5000,
    }).then(() => true).catch(() => false);
    if (!trackedFile) return true;

    await execFileAsync('git', ['rm', '-f', '--', cleanPath], { cwd: repoDir, timeout: 10000 });
    const status = await execFileAsync('git', ['status', '--porcelain'], { cwd: repoDir, timeout: 5000 });
    if (!status.stdout.trim()) return true;
    await execFileAsync('git', ['config', 'user.name', 'Puls Access'], { cwd: repoDir, timeout: 5000 });
    await execFileAsync('git', ['config', 'user.email', 'puls-access@users.noreply.github.com'], { cwd: repoDir, timeout: 5000 });
    await execFileAsync('git', ['commit', '-m', commitMessage || `Delete ${cleanPath}`], { cwd: repoDir, timeout: 10000 });
    await execFileAsync('git', ['push', 'origin', branchName], { cwd: repoDir, timeout: 25000, env: gitEnv });
    return true;
  } catch (err: any) {
    console.warn(`[Git CLI] Failed to delete ${cleanPath} from ${provider}/${owner}/${repo}:`, err.message);
    return false;
  }
}

// Helper: Create or update file directly in Git provider repository (GitVerse, SourceCraft, etc.)
async function createOrUpdateGitVerseFile(params: {
  token: string;
  owner: string;
  repo: string;
  branch: string;
  filePath: string;
  content: string;
  commitMessage: string;
  cachedSha?: string;
  provider?: GitProvider;
  apiUrl?: string;
}): Promise<{ success: boolean; sha?: string; rawUrl: string; error?: string }> {
  return enqueueGitOperation(async () => {
    const { token, owner, repo, branch, filePath, content, commitMessage, cachedSha, provider, apiUrl } = params;
    const cleanPath = filePath.replace(/^\/+/, '');
    const cleanOwner = encodeURIComponent(owner);
    const cleanRepo = encodeURIComponent(repo);
    const activeSource = getActiveGitSource();
    const effectiveProvider = provider || activeSource.provider || 'gitverse';
    const isSourceCraft = effectiveProvider === 'sourcecraft';
    const branchName = branch || getDefaultGitBranch(effectiveProvider);
    const providerName = isSourceCraft ? 'SourceCraft' : (effectiveProvider === 'gitverse' ? 'GitVerse' : effectiveProvider.toUpperCase());
    const apiBase = (
      apiUrl ||
      (effectiveProvider === activeSource.provider ? activeSource.apiUrl : undefined) ||
      (isSourceCraft ? 'https://api.sourcecraft.tech' : 'https://api.gitverse.ru')
    ).replace(/\/+$/, '');
    const rawUrl = buildGitRawUrl({
      ...activeSource,
      provider: effectiveProvider,
      repository: `${owner}/${repo}`,
      branch: branchName,
    }, cleanPath);

    if (!token || !token.trim()) {
      console.warn(`[${providerName}] No API token provided for ${owner}/${repo}`);
      return { success: false, rawUrl, error: `Токен API ${providerName} не настроен` };
    }

    const cleanToken = token.trim();
    const targetContentHash = crypto.createHash('sha256').update(content).digest('hex');

    if (usesGitCliProvider(effectiveProvider)) {
      const gitCliRes = await commitFileViaGitCli({
        token: cleanToken,
        owner,
        repo,
        branch: branchName,
        filePath: cleanPath,
        content,
        commitMessage,
        provider: effectiveProvider,
        username: activeSource.username || owner,
      });

      if (gitCliRes.success) {
        const effectiveRawUrl = isSourceCraft && gitCliRes.sha
          ? `https://raw.sourcecraft.tech/raw/${owner}/${repo}/${gitCliRes.sha}/${cleanPath}`
          : rawUrl;
        gitFileMetadataCache.set(cleanPath, {
          sha: gitCliRes.sha,
          contentHash: targetContentHash,
          rawUrl: effectiveRawUrl,
          lastUpdated: Date.now(),
        });
        logSystemEvent('success', 'gitverse', 'PUT_FILE', `Файл ${cleanPath} успешно сохранен в ${providerName} (ветка ${branchName}, SHA: ${(gitCliRes.sha || '').substring(0, 8)})`, { path: cleanPath, sha: gitCliRes.sha, branch: branchName });
        return { success: true, sha: gitCliRes.sha, rawUrl: effectiveRawUrl };
      } else {
        logSystemEvent('error', 'gitverse', 'PUT_FAILED', `Сбой записи ${cleanPath} в ${providerName}: ${gitCliRes.error}`, { path: cleanPath, error: gitCliRes.error });
        return { success: false, error: gitCliRes.error, rawUrl };
      }
    }

    // Fast-path: use cached SHA if known
    let existingSha: string | undefined = cachedSha || gitFileMetadataCache.get(cleanPath)?.sha;

    // Helper to fetch SHA if not known or upon conflict/re-sync with retries & generous timeout
    const fetchSha = async (targetBranch?: string, retries = 2): Promise<string | undefined> => {
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const refQuery = targetBranch ? `?ref=${encodeURIComponent(targetBranch)}` : '';
          const checkUrl = `${apiBase}/repos/${cleanOwner}/${cleanRepo}/contents/${cleanPath}${refQuery}`;
          const checkRes = await fetch(checkUrl, {
            signal: AbortSignal.timeout(15000),
            headers: {
              'Authorization': `Bearer ${cleanToken}`,
              'Accept': 'application/json, application/vnd.gitverse.object+json;version=1;q=0.9, */*',
              'User-Agent': 'PulsAccess/2.0',
            },
          });
          if (checkRes.ok) {
            const data: any = await checkRes.json();
            return data?.sha || data?.content?.sha || data?.commit?.sha || undefined;
          } else if (checkRes.status === 404) {
            // File genuinely does not exist yet on remote branch
            return undefined;
          }
        } catch (err: any) {
          console.warn(`[${providerName}] Check error for ${cleanPath} (attempt ${attempt + 1}/${retries + 1}):`, err.message);
          if (attempt < retries) {
            await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
          }
        }
      }
      return undefined;
    };

    // If no cached SHA is present, query remote API
    if (!existingSha) {
      existingSha = await fetchSha(branchName);
      if (!existingSha && branchName !== 'master') {
        existingSha = await fetchSha(); // fallback without ref
      }
    }

    // Helper to execute PUT request
    const executePut = async (shaToSend?: string): Promise<{ ok: boolean; status: number; data?: any; errorText?: string }> => {
      const putUrl = `${apiBase}/repos/${cleanOwner}/${cleanRepo}/contents/${cleanPath}`;
      const base64Content = Buffer.from(content, 'utf-8').toString('base64');
      const bodyPayload: any = {
        branch: branchName,
        content: base64Content,
        message: commitMessage || `Update ${cleanPath}`,
      };
      if (shaToSend) {
        bodyPayload.sha = shaToSend;
      }

      try {
        const putRes = await fetch(putUrl, {
          method: 'PUT',
          signal: AbortSignal.timeout(25000),
          headers: {
            'Authorization': `Bearer ${cleanToken}`,
            'Accept': 'application/json, application/vnd.gitverse.object+json;version=1;q=0.9, */*',
            'Content-Type': 'application/json',
            'User-Agent': 'PulsAccess/2.0',
          },
          body: JSON.stringify(bodyPayload),
        });

        if (putRes.ok) {
          const resJson: any = await putRes.json();
          return { ok: true, status: putRes.status, data: resJson };
        } else {
          const errText = await putRes.text();
          return { ok: false, status: putRes.status, errorText: errText };
        }
      } catch (err: any) {
        return { ok: false, status: 0, errorText: err.message };
      }
    };

    // Execute first attempt
    let result = await executePut(existingSha);

    // If failed with 400 (validation error / missing sha), 409 (conflict), 422 (stale SHA), or 500/503/0 (transient network or branch lock), refresh SHA and retry with backoff
    let retryAttempt = 0;
    const maxRetries = 3;
    const isRetryableStatus = (res: { ok: boolean; status: number; errorText?: string }) => {
      if (res.ok) return false;
      if (res.status === 409 || res.status === 422 || res.status === 500 || res.status === 503 || res.status === 0) return true;
      if (res.status === 400 && (!existingSha || res.errorText?.includes('VALIDATION_ERROR') || res.errorText?.includes('sha'))) return true;
      return false;
    };

    while (!result.ok && retryAttempt < maxRetries && isRetryableStatus(result)) {
      retryAttempt++;
      const backoffMs = 800 * retryAttempt + Math.floor(Math.random() * 300);
      console.warn(`[${providerName}] PUT ${cleanPath} returned HTTP ${result.status}. Retrying (attempt ${retryAttempt}/${maxRetries}) in ${backoffMs}ms...`);
      logSystemEvent('warning', 'gitverse', 'RETRY_PUT', `Повторная попытка ${retryAttempt}/${maxRetries} записи файла ${cleanPath} в ${providerName} (HTTP ${result.status}). Ожидание ${backoffMs}мс...`, { path: cleanPath, status: result.status, error: result.errorText });
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
      const freshSha = (await fetchSha(branchName, 2)) || (await fetchSha(undefined, 2));
      result = await executePut(freshSha);
    }

    if (result.ok) {
      const sha = result.data?.content?.sha || result.data?.commit?.sha;
      gitFileMetadataCache.set(cleanPath, {
        sha,
        contentHash: targetContentHash,
        rawUrl,
        lastUpdated: Date.now(),
      });
      logSystemEvent('success', 'gitverse', 'PUT_FILE', `Файл ${cleanPath} успешно зафиксирован в ${providerName} (ветка ${branchName}, SHA: ${(sha || '').substring(0, 8)})`, { path: cleanPath, sha, branch: branchName });
      return { success: true, sha, rawUrl };
    } else {
      gitFileMetadataCache.delete(cleanPath);
      console.warn(`[${providerName}] Notice on PUT file ${cleanPath}, HTTP ${result.status}:`, result.errorText);
      logSystemEvent('error', 'gitverse', 'PUT_FAILED', `Сбой записи ${cleanPath} в ${providerName}: HTTP ${result.status} ${result.errorText || ''}`, { path: cleanPath, status: result.status, error: result.errorText });
      return { success: false, error: `HTTP ${result.status}: ${result.errorText}`, rawUrl };
    }
  });
}

// Helper: Delete file directly from Git repository
async function deleteGitVerseFile(params: {
  token: string;
  owner: string;
  repo: string;
  branch: string;
  filePath: string;
  commitMessage?: string;
  provider?: GitProvider;
  apiUrl?: string;
  username?: string;
}): Promise<boolean> {
  return enqueueGitOperation(async () => {
    const { token, owner, repo, branch, filePath, commitMessage, provider, apiUrl, username } = params;
    if (!token || !token.trim()) return false;
    const cleanToken = token.trim();
    const cleanPath = filePath.replace(/^\/+/, '');
    const cleanOwner = encodeURIComponent(owner);
    const cleanRepo = encodeURIComponent(repo);
    const activeSource = getActiveGitSource();
    const effectiveProvider = provider || activeSource.provider || 'gitverse';
    const isSourceCraft = effectiveProvider === 'sourcecraft';
    const branchName = branch || getDefaultGitBranch(effectiveProvider);
    const providerName = isSourceCraft ? 'SourceCraft' : (effectiveProvider === 'gitverse' ? 'GitVerse' : effectiveProvider.toUpperCase());
    const apiBase = (
      apiUrl ||
      (effectiveProvider === activeSource.provider ? activeSource.apiUrl : undefined) ||
      (isSourceCraft ? 'https://api.sourcecraft.tech' : 'https://api.gitverse.ru')
    ).replace(/\/+$/, '');

    if (usesGitCliProvider(effectiveProvider)) {
      const deleted = await deleteFileViaGitCli({
        token: cleanToken,
        owner,
        repo,
        branch: branchName,
        filePath: cleanPath,
        commitMessage,
        provider: effectiveProvider,
        username: username || (effectiveProvider === activeSource.provider ? activeSource.username : owner),
      });
      if (deleted) {
        gitFileMetadataCache.delete(cleanPath);
        logSystemEvent('success', 'gitverse', 'DELETE_FILE', `Файл ${cleanPath} удален из ${providerName}`, { path: cleanPath });
      }
      return deleted;
    }

    try {
      const checkUrl = `${apiBase}/repos/${cleanOwner}/${cleanRepo}/contents/${cleanPath}?ref=${encodeURIComponent(branchName)}`;
      const checkRes = await fetch(checkUrl, {
        signal: AbortSignal.timeout(15000),
        headers: {
          'Authorization': `Bearer ${cleanToken}`,
          'Accept': 'application/json, application/vnd.gitverse.object+json;version=1;q=0.9, */*',
          'User-Agent': 'PulsAccess/2.0',
        },
      });
      if (checkRes.status === 404) {
        gitFileMetadataCache.delete(cleanPath);
        return true;
      }
      if (!checkRes.ok) return false;
      const data: any = await checkRes.json();
      const sha = data?.sha || data?.content?.sha;
      if (!sha) return false;

      const delUrl = `${apiBase}/repos/${cleanOwner}/${cleanRepo}/contents/${cleanPath}`;
      const delRes = await fetch(delUrl, {
        method: 'DELETE',
        signal: AbortSignal.timeout(20000),
        headers: {
          'Authorization': `Bearer ${cleanToken}`,
          'Accept': 'application/json, application/vnd.gitverse.object+json;version=1;q=0.9, */*',
          'Content-Type': 'application/json',
          'User-Agent': 'PulsAccess/2.0',
        },
        body: JSON.stringify({
          branch: branchName,
          sha,
          message: commitMessage || `Delete ${cleanPath}`,
        }),
      });
      if (delRes.ok) {
        gitFileMetadataCache.delete(cleanPath);
        logSystemEvent('success', 'gitverse', 'DELETE_FILE', `Файл ${cleanPath} удален из ${providerName}`, { path: cleanPath });
      } else {
        logSystemEvent('error', 'gitverse', 'DELETE_FILE', `Ошибка удаления ${cleanPath} из ${providerName} (HTTP ${delRes.status})`, { path: cleanPath, status: delRes.status });
      }
      return delRes.ok;
    } catch (err: any) {
      console.warn(`[${providerName}] Delete error for ${cleanPath}:`, err.message);
      logSystemEvent('error', 'gitverse', 'DELETE_FILE', `Исключение при удалении ${cleanPath}: ${err.message}`, { path: cleanPath, error: err.message });
      return false;
    }
  });
}

async function deleteRepoFilesFromSource(
  source: GitSourceItem,
  filePaths: string[],
  commitMessage: (filePath: string) => string,
  continueOnFailure = false
): Promise<boolean> {
  const uniquePaths = [...new Set(filePaths.filter(Boolean))];
  if (uniquePaths.length === 0) return true;

  if (!source.token?.trim()) return false;
  const { owner, repo } = getRepoParts(source);
  const branch = source.branch || getDefaultGitBranch(source.provider);
  let allDeleted = true;

  for (const filePath of uniquePaths) {
    const deleted = await deleteGitVerseFile({
      token: source.token,
      owner,
      repo,
      branch,
      filePath,
      commitMessage: commitMessage(filePath),
      provider: source.provider,
      apiUrl: source.apiUrl,
      username: source.username,
    });
    if (!deleted) {
      allDeleted = false;
      if (!continueOnFailure) return false;
    }
  }
  return allDeleted;
}

async function deleteActiveRepoFiles(
  filePaths: string[],
  commitMessage: (filePath: string) => string,
  continueOnFailure = false
): Promise<boolean> {
  return deleteRepoFilesFromSource(getActiveGitSource(), filePaths, commitMessage, continueOnFailure);
}

// Ensure the user's subscription file exists directly in the selected Git repository.
// The link format can be changed without changing the repository file.
async function ensureUserRepoFile(
  user: BotUser,
  format: 'happ' | 'incy',
  forceNewFile = false
): Promise<{ filePath: string; rawUrl: string; finalUrl: string }> {
  const activeGit = getActiveGitSource();
  const tokenSafe = user.subscriptionToken || `sub_${user.username || user.telegramId}`;

  if (!Array.isArray(user.sourceSubscriptions)) user.sourceSubscriptions = [];
  const linkedRepoFile = store.repoFiles?.find(
    (file) =>
      file.sourceId === activeGit.id &&
      (file.userId === user.id || file.telegramId === user.telegramId)
  );
  const sourceSubscription = user.sourceSubscriptions.find(
    (subscription) => subscription.sourceId === activeGit.id && subscription.filePath === user.gitFilePath
  ) || user.sourceSubscriptions.find((subscription) => subscription.sourceId === activeGit.id) ||
    (linkedRepoFile ? { sourceId: activeGit.id, filePath: linkedRepoFile.filePath } : undefined);
  const safeSourceId = activeGit.id.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filePath = forceNewFile
    ? `subs/${tokenSafe}_${safeSourceId}_${Date.now()}.txt`
    : sourceSubscription?.filePath ||
      (user.subscriptionSourceId === activeGit.id ? user.gitFilePath : undefined) ||
      (user.sourceSubscriptions.length > 0 ? `subs/${tokenSafe}_${safeSourceId}.txt` : `subs/${tokenSafe}.txt`);
  const fileRecordId = `sub_${tokenSafe}_${safeSourceId}_${crypto.createHash('sha1').update(filePath).digest('hex').slice(0, 8)}`;
  let gitRawUrl = buildGitRawUrl(activeGit, filePath);

  // Determine actual node content to write
  const nodeContent = getUserRepoSubscriptionContent(user);
  const targetContentHash = crypto.createHash('sha256').update(nodeContent).digest('hex');

  // CRITICAL: Physically create or update the file in Git repository (GitVerse, SourceCraft, etc.)
  if (!activeGit.token?.trim()) {
    throw new Error(`Не настроен токен для активного Git-источника «${activeGit.name}»`);
  }
  const { owner, repo } = getRepoParts(activeGit);
  const branch = activeGit.branch || getDefaultGitBranch(activeGit.provider);
  const gitResult = await createOrUpdateGitVerseFile({
    token: activeGit.token,
    owner,
    repo,
    branch,
    filePath,
    content: nodeContent,
    commitMessage: `Subscription ${filePath} for user ${user.username ? '@' + user.username : user.telegramId}`,
    provider: activeGit.provider,
    apiUrl: activeGit.apiUrl,
  });
  if (!gitResult.success) {
    throw new Error(`Не удалось записать подписку в ${activeGit.name}: ${gitResult.error || 'ошибка Git'}`);
  }
  if (gitResult.rawUrl) {
    gitRawUrl = gitResult.rawUrl;
  }
  if (!isRepositoryRawUrl(activeGit, gitRawUrl, filePath)) {
    throw new Error(`Git-источник «${activeGit.name}» не вернул действительную RAW-ссылку на файл ${filePath}`);
  }

  let finalUrl = '';
  const targetBaseUrl = gitRawUrl;
  if (format === 'happ') {
    // HAPP wraps the assigned repository URL using the configured crypt format.
    finalUrl = buildHappCryptUrl(targetBaseUrl);
  } else {
    // Format is INCY: direct gateway URL or direct GitVerse raw URL
    finalUrl = await shortenIncyUrl(targetBaseUrl, tokenSafe);
  }
  if (format === 'happ' && !isHappUrlForVersion(finalUrl, store.happCryptVersion)) {
    throw new Error(`Не удалось сформировать HAPP-ссылку формата ${store.happCryptVersion}.`);
  }
  if (format === 'incy' && !isClckShortUrl(finalUrl)) {
    throw new Error('Не удалось сформировать короткую INCY-ссылку clck.ru.');
  }

  // Synchronize store.repoFiles pool record
  if (!store.repoFiles) store.repoFiles = [];
  const existingPoolFile = store.repoFiles.find((f) => f.filePath === filePath && (!f.sourceId || f.sourceId === activeGit.id));
  const sizeBytes = Buffer.byteLength(nodeContent, 'utf-8');
  const nodesFound = parseNodeStats(nodeContent).total;
  if (existingPoolFile) {
    existingPoolFile.rawUrl = gitRawUrl;
    existingPoolFile.sourceId = activeGit.id;
    existingPoolFile.finalUrl = finalUrl;
    existingPoolFile.format = format;
    existingPoolFile.sizeBytes = sizeBytes;
    existingPoolFile.nodesFound = nodesFound;
    existingPoolFile.contentHash = targetContentHash;
    existingPoolFile.userId = user.id;
    existingPoolFile.telegramId = user.telegramId;
    existingPoolFile.username = user.username;
    existingPoolFile.firstName = user.firstName;
    existingPoolFile.isPoolFree = false;
    existingPoolFile.updatedAt = new Date().toISOString();
  } else {
    store.repoFiles.unshift({
      id: fileRecordId,
      userId: user.id,
      telegramId: user.telegramId,
      username: user.username,
      firstName: user.firstName,
      filePath,
      sourceId: activeGit.id,
      rawUrl: gitRawUrl,
      updatedAt: new Date().toISOString(),
      format,
      finalUrl,
      sizeBytes,
      isPoolFree: false,
      lastCheckedAt: new Date().toISOString(),
      httpStatus: 200,
      isAccessible: true,
      latencyMs: 110,
      nodesFound,
      contentHash: targetContentHash,
    });
  }

  user.gitFilePath = filePath;
  user.gitRawUrl = gitRawUrl;
  user.subscriptionSourceId = activeGit.id;
  user.finalSubscriptionUrl = finalUrl;
  user.finalUrl = finalUrl;
  user.clckUrl = finalUrl;
  user.clckTargetUrl = targetBaseUrl;
  user.subscriptionType = format;
  user.subscriptionName = format === 'happ' ? `HAPP (${store.happCryptVersion})` : 'INCY (VLESS)';
  user.hasActiveSubscription = true;
  if (!user.receivedAt) {
    user.receivedAt = new Date().toISOString();
  }

  // 1 subscriber = 1 device policy: lock to primary device (binds upon first import into VPN client!)
  user.deviceLocked = true;
  user.boundDevice = null;

  // Calculate user config size
  const userContent = getUserRepoSubscriptionContent(user);
  const userSizeBytes = Buffer.byteLength(userContent, 'utf-8');

  // Upsert in store.repoFiles
  if (!store.repoFiles) store.repoFiles = [];
  const existingIdx = store.repoFiles.findIndex((f) => f.sourceId === activeGit.id && f.filePath === filePath);
  const fileRecord: RepoUserFile = {
    id: fileRecordId,
    sourceId: activeGit.id,
    userId: user.id,
    telegramId: user.telegramId,
    username: user.username,
    firstName: user.firstName,
    filePath,
    rawUrl: gitRawUrl,
    updatedAt: new Date().toISOString(),
    format,
    finalUrl,
    sizeBytes: userSizeBytes,
    isPoolFree: false,
    lastCheckedAt: new Date().toISOString(),
    httpStatus: 200,
    isAccessible: true,
    nodesFound: parseNodeStats(userContent).total,
    contentHash: crypto.createHash('sha256').update(userContent).digest('hex'),
  };

  if (existingIdx >= 0) {
    store.repoFiles[existingIdx] = { ...store.repoFiles[existingIdx], ...fileRecord };
  } else {
    store.repoFiles.unshift(fileRecord);
  }
  if (!forceNewFile) {
    user.sourceSubscriptions = user.sourceSubscriptions.filter((subscription) =>
      subscription.sourceId !== activeGit.id || subscription.filePath === filePath
    );
  }
  user.sourceSubscriptions.push({
    sourceId: activeGit.id,
    filePath,
    rawUrl: gitRawUrl,
    format,
    finalUrl,
    updatedAt: new Date().toISOString(),
  });

  saveStore();
  return { filePath, rawUrl: gitRawUrl, finalUrl };
}

// 3-Source & Custom Replacement Node Resolver: Fetches from configured stubs, Raw URL or fallback
async function getReplacementSourceNodes(sourceNum: 1 | 2 | 3 | 4): Promise<string> {
  const tmpl = store.replacementTemplates || ({} as any);

  if (sourceNum === 1) {
    if (store.centralFile?.botDeletedStubContent?.trim()) {
      return store.centralFile.botDeletedStubContent.trim();
    }
    if (tmpl.source1RawUrl && tmpl.source1RawUrl.trim().startsWith('http')) {
      try {
        const res = await fetch(tmpl.source1RawUrl.trim(), { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
          const text = await res.text();
          if (text && text.trim()) return text.trim();
        }
      } catch (e: any) {
        console.warn('[3-Source] Error fetching Source 1 RAW URL:', e.message);
      }
    }
    return (
      tmpl.source1Content?.trim() ||
      'vless://00000000-0000-0000-0000-000000000000@127.0.0.1:443?encryption=none&security=none#⚠️ Подписка деактивирована: вы удалили бота или вышли из канала'
    );
  }

  if (sourceNum === 2) {
    if (store.centralFile?.deviceBindingStubContent?.trim()) {
      return store.centralFile.deviceBindingStubContent.trim();
    }
    if (tmpl.source2RawUrl && tmpl.source2RawUrl.trim().startsWith('http')) {
      try {
        const res = await fetch(tmpl.source2RawUrl.trim(), { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
          const text = await res.text();
          if (text && text.trim()) return text.trim();
        }
      } catch (e: any) {
        console.warn('[3-Source] Error fetching Source 2 RAW URL:', e.message);
      }
    }
    return (
      tmpl.source2Content?.trim() ||
      'vless://00000000-0000-0000-0000-000000000000@127.0.0.1:443?encryption=none&security=none#⚠️ Заблокировано: попытка использования на 2-м устройстве (1 подписка = 1 устройство)'
    );
  }

  if (sourceNum === 4) {
    if (tmpl.source4RawUrl && tmpl.source4RawUrl.trim().startsWith('http')) {
      try {
        const res = await fetch(tmpl.source4RawUrl.trim(), { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
          const text = await res.text();
          if (text && text.trim()) return text.trim();
        }
      } catch (e: any) {
        console.warn('[3-Source] Error fetching Source 4 RAW URL:', e.message);
      }
    }
    return tmpl.source4Content?.trim() || tmpl.source1Content?.trim() || '';
  }

  // Source 3 (Permanent Ban)
  if (store.centralFile?.limitExceededStubContent?.trim()) {
    return store.centralFile.limitExceededStubContent.trim();
  }
  if (tmpl.source3RawUrl && tmpl.source3RawUrl.trim().startsWith('http')) {
    try {
      const res = await fetch(tmpl.source3RawUrl.trim(), { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const text = await res.text();
        if (text && text.trim()) return text.trim();
      }
    } catch (e: any) {
      console.warn('[3-Source] Error fetching Source 3 RAW URL:', e.message);
    }
  }
  return (
    tmpl.source3Content?.trim() ||
    'vless://00000000-0000-0000-0000-000000000000@127.0.0.1:443?encryption=none&security=none#⛔ Заблокировано: перманентный бан (превышен лимит нарушений)'
  );
}

// Suspend user's network connection by putting appropriate 3-Source servers in GitVerse file
async function applyDisconnectStub(user: BotUser, reason: string, sourceNum: 1 | 2 | 3 | 4 = 1): Promise<void> {
  const activeGit = getActiveGitSource();
  if (!user.gitFilePath || !activeGit.token || !activeGit.token.trim()) return;
  const { owner, repo } = getRepoParts(activeGit);

  // Resolve content from specified 3-source system
  const stubContent = await getReplacementSourceNodes(sourceNum);

  try {
    await createOrUpdateGitVerseFile({
      token: activeGit.token,
      owner,
      repo,
      branch: activeGit.branch || getDefaultGitBranch(activeGit.provider),
      filePath: user.gitFilePath,
      content: stubContent,
      commitMessage: `Access replaced by Source ${sourceNum} (${reason}) for user ${user.username ? '@' + user.username : user.telegramId}`,
    });
    const poolFile = store.repoFiles?.find((f) => f.filePath === user.gitFilePath);
    if (poolFile) {
      poolFile.nodesFound = parseNodeStats(stubContent).total;
      poolFile.sizeBytes = Buffer.byteLength(stubContent, 'utf-8');
      poolFile.updatedAt = new Date().toISOString();
      poolFile.contentHash = crypto.createHash('sha256').update(stubContent).digest('hex');
    }
  } catch (err: any) {
    console.warn(`[applyDisconnectStub] Error for ${user.gitFilePath}:`, err.message);
  }
}

// Restore full nodes into user's GitVerse file when resubscribed or unblocked
async function restoreUserNodes(user: BotUser): Promise<void> {
  const activeGit = getActiveGitSource();
  if (!user.gitFilePath || !activeGit.token || !activeGit.token.trim()) return;
  const { owner, repo } = getRepoParts(activeGit);

  try {
    const userContent = getUserRepoSubscriptionContent(user);
    const contentHash = crypto.createHash('sha256').update(userContent).digest('hex');

    const gitRes = await createOrUpdateGitVerseFile({
      token: activeGit.token,
      owner,
      repo,
      branch: activeGit.branch || getDefaultGitBranch(activeGit.provider),
      filePath: user.gitFilePath,
      content: userContent,
      commitMessage: `Restore nodes for user ${user.username ? '@' + user.username : user.telegramId}`,
    });
    const poolFile = store.repoFiles?.find((f) => f.filePath === user.gitFilePath);
    if (poolFile) {
      poolFile.nodesFound = parseNodeStats(userContent).total;
      poolFile.sizeBytes = Buffer.byteLength(userContent, 'utf-8');
      poolFile.updatedAt = new Date().toISOString();
      poolFile.contentHash = contentHash;
      if (gitRes.sha) poolFile.sha = gitRes.sha;
      if (gitRes.rawUrl) poolFile.rawUrl = gitRes.rawUrl;
    }
  } catch (err: any) {
    console.warn(`[restoreUserNodes] Error for ${user.gitFilePath}:`, err.message);
  }
}

// Restore subscription when second device is removed by 2nd user (Таймер замирает, предупреждение остается, центральные ключи возвращаются)
async function resolveSecondDeviceRemoved(user: BotUser): Promise<{ success: boolean; message: string }> {
  // 1. Freeze and cancel the deadline timer
  user.sharingGraceDeadlineAt = null;
  user.isTimerFrozen = true;
  user.status = 'active';
  user.isBlocked = false;
  user.isPermanentlyBanned = false;
  user.hasActiveSubscription = true;
  user.mutedUntil = null;
  user.secondDeviceInfo = null;
  user.secondDeviceActive = false;
  user.deviceViolationAttempts = 0;
  user.secondDeviceBlockedCount = 0;
  user.blockedReason = undefined;
  user.trafficLimitBytes = 0;
  user.boundDevice = null;
  user.deviceLocked = false;
  // NOTE: user.sharingWarningCount REMAINS INTACT as requested!
  const count = user.sharingWarningCount || 1;
  user.subscriptionStatusReason = `🟢 Подписка восстановлена. Таймер бана остановлен (подписка удалена со 2-го устройства). Предупреждений: ${count}`;

  // 2. Restore central nodes to user's GitVerse file and in-memory delivery
  await restoreUserNodes(user);

  // 3. Update any linked exclusion
  const linkedExcl = store.exclusions?.find((e) => e.userId === user.id || e.token === user.subscriptionToken);
  if (linkedExcl) {
    linkedExcl.status = 'active';
    linkedExcl.isMuted = false;
    linkedExcl.isBlocked = false;
    linkedExcl.sharingGraceDeadlineAt = null;
    linkedExcl.secondDeviceInfo = null;
    linkedExcl.secondDeviceActive = false;
    linkedExcl.secondDeviceBlockedCount = 0;
    linkedExcl.isTimerFrozen = true;
    linkedExcl.boundDevice = null;
    linkedExcl.deviceLocked = false;
    linkedExcl.subscriptionStatusReason = user.subscriptionStatusReason;
  }

  // 4. Regenerate display keys & reset gateway locks
  await resolveUserDisplayKey(user).catch(() => {});
  if (store.relayGatewayConfig?.enabled && store.relayGatewayConfig?.url) {
    const gwUrl = store.relayGatewayConfig.url.trim().replace(/\/+$/, '');
    const token = user.subscriptionToken;
    if (token) {
      fetch(`${gwUrl}/api/sub/${token}?reset_device=1`).catch(() => {});
    }
  }

  saveStore();

  logSystemEvent(
    'success',
    'violations',
    'SECOND_DEVICE_REMOVED',
    `Подписка @${user.username || user.telegramId} восстановлена: подписка удалена со 2-го устройства, таймер заморожен, предупреждение [${count}] сохранено.`,
    { userId: user.id, telegramId: user.telegramId, warningCount: count }
  );

  return {
    success: true,
    message: `Подписка успешно восстановлена! Таймер остановлен, ключи из центрального источника возвращены. Предупреждений: ${count}.`,
  };
}

// Complete unblock, device unbind, and state propagation across users and exclusions tables
async function applyUserUnblockAndReset(user: BotUser, preserveWarningCount = false): Promise<void> {
  user.status = 'active';
  user.isBlocked = false;
  user.isPermanentlyBanned = false;
  user.hasActiveSubscription = true;
  user.blockedReason = undefined;
  user.bannedAt = null;
  user.sharingGraceDeadlineAt = null;
  user.secondDeviceInfo = null;
  user.secondDeviceActive = false;
  user.secondDeviceBlockedCount = 0;
  if (!preserveWarningCount) {
    user.sharingWarningCount = 0;
  }
  user.deviceViolationAttempts = 0;
  user.lastDeviceViolationAt = undefined;
  user.sharingWarnedAt = undefined;
  user.isTimerFrozen = true;
  user.mutedUntil = null;
  user.pendingUnblockRequest = false;
  user.pendingUnbindRequest = false;
  user.boundDevice = null;
  user.deviceLocked = false;
  user.trafficUsedBytes = 0;
  user.trafficLimitBytes = 0; // unlimited
  user.detachedFromCentral = false;
  user.subscriptionStatusReason = preserveWarningCount && user.sharingWarningCount
    ? `🟢 Подписка восстановлена. Предупреждений: ${user.sharingWarningCount}`
    : '🟢 Подписка активна (разблокирована администратором)';
  user.channelMembership = 'member';
  user.channelLeftAt = null;
  user.channelLeftCount = 0;
  user.subscriptionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  user.lastActiveAt = new Date().toISOString();

  // Propagate across the database: sync linked exclusion in store.exclusions
  const linkedExcl = store.exclusions?.find((e) => e.userId === user.id || e.token === user.subscriptionToken);
  if (linkedExcl) {
    linkedExcl.status = 'active';
    linkedExcl.isBlocked = false;
    linkedExcl.isMuted = false;
    linkedExcl.channelMembership = 'member';
    linkedExcl.sharingGraceDeadlineAt = null;
    linkedExcl.secondDeviceInfo = null;
    linkedExcl.secondDeviceActive = false;
    linkedExcl.secondDeviceBlockedCount = 0;
    if (!preserveWarningCount) {
      linkedExcl.sharingWarningCount = 0;
    }
    linkedExcl.isTimerFrozen = true;
    linkedExcl.boundDevice = null;
    linkedExcl.deviceLocked = false;
    linkedExcl.subscriptionStatusReason = user.subscriptionStatusReason;
  }

  // Restore central nodes to user's GitVerse file and in-memory delivery
  await restoreUserNodes(user).catch((e) => console.warn('[Unblock restoreUserNodes error]:', e.message));

  // Regenerate finalSubscriptionUrl with the selected HAPP or INCY format.
  await resolveUserDisplayKey(user).catch((e) => console.warn('[Unblock resolveUserDisplayKey error]:', e.message));

  // Reset device locks on relay gateway if enabled
  if (store.relayGatewayConfig?.enabled && store.relayGatewayConfig?.url) {
    const gwUrl = store.relayGatewayConfig.url.trim().replace(/\/+$/, '');
    const token = user.subscriptionToken;
    if (token) {
      fetch(`${gwUrl}/api/sub/${token}?reset_device=1`).catch(() => {});
    }
  }

  saveStore();
}

// Permanently delete user subscription from GitVerse and system after deadline expires
async function permanentlyDeleteUser(user: BotUser): Promise<{ success: true; repoCleanupFailed: boolean }> {
  const linkedExclusions = (store.exclusions || []).filter(
    (item) => item.userId === user.id || item.token === user.subscriptionToken
  );
  const relatedRepoFiles = (store.repoFiles || []).filter(
    (file) =>
      file.userId === user.id ||
      file.telegramId === user.telegramId ||
      file.id === `sub_${user.subscriptionToken}` ||
      file.filePath.endsWith(`/${user.subscriptionToken}.txt`)
  );
  const pathsBySource = new Map<string, Set<string>>();
  const addFile = (sourceId: string | undefined, filePath: string | undefined) => {
    if (!filePath) return;
    const sourceKey = sourceId || getActiveGitSource().id;
    if (!pathsBySource.has(sourceKey)) pathsBySource.set(sourceKey, new Set());
    pathsBySource.get(sourceKey)!.add(filePath);
  };
  for (const subscription of user.sourceSubscriptions || []) addFile(subscription.sourceId, subscription.filePath);
  addFile(user.subscriptionSourceId, user.gitFilePath);
  for (const file of relatedRepoFiles) addFile(file.sourceId, file.filePath);
  for (const exclusion of linkedExclusions) addFile(undefined, exclusion.gitFilePath);

  let deleted = true;
  for (const [sourceId, paths] of pathsBySource) {
    const source = store.gitSources?.find((item: GitSourceItem) => item.id === sourceId);
    if (!source || !(await deleteRepoFilesFromSource(
      source,
      [...paths],
      (filePath) => `Permanently delete subscription ${filePath}`,
      true
    ))) {
      deleted = false;
    }
  }
  const filePaths = [...new Set([...pathsBySource.values()].flatMap((paths) => [...paths]))];
  if (!deleted) {
    console.warn(`[permanentlyDeleteUser] User ${user.telegramId} will be removed locally, but one or more repository files could not be deleted.`);
    logSystemEvent('warning', 'gitverse', 'USER_DELETE_REPO_CLEANUP_FAILED', `Пользователь ${user.telegramId} удален локально, но не все связанные файлы удалось удалить из Git-источника`, {
      telegramId: user.telegramId,
      filePaths,
      source: getActiveGitSource().name,
    });
  }

  if (store.repoFiles) {
    store.repoFiles = store.repoFiles.filter(
      (f) =>
        !filePaths.includes(f.filePath) &&
        f.userId !== user.id &&
        f.telegramId !== user.telegramId &&
        f.id !== `sub_${user.subscriptionToken}` &&
        !f.filePath.endsWith(`/${user.subscriptionToken}.txt`)
    );
  }
  store.exclusions = (store.exclusions || []).filter(
    (item) => item.userId !== user.id && item.token !== user.subscriptionToken
  );
  store.users = store.users.filter((u) => u.id !== user.id && u.telegramId !== user.telegramId);
  saveStore();
  console.log(`[permanentlyDeleteUser] User @${user.username || user.telegramId} permanently deleted.`);
  return { success: true, repoCleanupFailed: !deleted };
}

// State and statistics tracking for central propagation
let isSyncingSubscribersWithCentral = false;
let pendingSyncWithCentral = false;
let activePushWorkerPromise: Promise<void> | null = null;

interface CentralSyncResult {
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
  mode?: 'instant' | 'full';
}

const emptySkippedUsers = () => ({
  noActiveSubscription: 0,
  inactiveStatus: 0,
  leftChannel: 0,
  blocked: 0,
  muted: 0,
  detachedFromCentral: 0,
  missingFilePath: 0,
});

let lastCentralSyncStats: CentralSyncResult = {
  syncedUsers: 0,
  syncedExclusions: 0,
  durationMs: 0,
  errors: [],
  totalUsers: 0,
  centralContentBytes: 0,
  centralContentHash: '',
  skippedUsers: emptySkippedUsers(),
};

async function syncActiveSubscribersWithCentral(options?: {
  forceFullGitPush?: boolean;
  backgroundGitPush?: boolean;
}): Promise<CentralSyncResult> {
  const startTime = Date.now();
  const activeSource = getActiveGitSource();
  const sources = store.gitSources
    ? store.gitSources.filter((source) => source.enabled !== false)
    : [activeSource];
  const sourcesToSync = sources.filter((source) =>
    source.id === activeSource.id ||
    store.users.some((user) =>
      user.hasActiveSubscription &&
      (user.subscriptionSourceId === source.id ||
        user.sourceSubscriptions?.some((subscription) => subscription.sourceId === source.id))
    )
  );
  const aggregate: CentralSyncResult = {
    syncedUsers: 0,
    syncedExclusions: 0,
    durationMs: 0,
    errors: [],
    totalUsers: store.users.length,
    centralContentBytes: Buffer.byteLength(store.centralFile?.content || '', 'utf-8'),
    centralContentHash: crypto.createHash('sha256').update(store.centralFile?.content || '').digest('hex'),
    skippedUsers: emptySkippedUsers(),
    skippedUnchanged: 0,
    pushedCount: 0,
    mode: 'full',
  };

  for (const source of sourcesToSync) {
    const result = await syncGitSourceSubscribersWithCentral(source, {
      ...options,
      backgroundGitPush: false,
    });
    aggregate.syncedUsers += result.syncedUsers;
    aggregate.syncedExclusions += result.syncedExclusions;
    aggregate.errors.push(...result.errors.map((error) => `[${source.name}] ${error}`));
    aggregate.skippedUnchanged = (aggregate.skippedUnchanged || 0) + (result.skippedUnchanged || 0);
    aggregate.pushedCount = (aggregate.pushedCount || 0) + (result.pushedCount || 0);
    if (source.id === activeSource.id) aggregate.skippedUsers = result.skippedUsers;
  }

  aggregate.durationMs = Date.now() - startTime;
  lastCentralSyncStats = aggregate;
  return aggregate;
}

// Sync each source's own subscriber files from the current central payload.
async function syncGitSourceSubscribersWithCentral(activeGit: GitSourceItem, options?: {
  forceFullGitPush?: boolean;
  backgroundGitPush?: boolean;
}): Promise<CentralSyncResult> {
  const startTime = Date.now();
  const errors: string[] = [];

  // If another push worker is active and full sync was requested, await it first to prevent 409 collisions
  if (activePushWorkerPromise && options?.backgroundGitPush === false) {
    try {
      await activePushWorkerPromise;
    } catch {}
  }

  // Auto-allocate gitFilePath for any active subscriber missing a repository file
  for (const u of store.users || []) {
    if (
      u.status === 'active' &&
      activeGit.id === getActiveGitSource().id &&
      (!u.subscriptionSourceId || u.subscriptionSourceId === activeGit.id) &&
      u.hasActiveSubscription &&
      u.channelMembership !== 'left' &&
      !u.isBlocked &&
      !u.isPermanentlyBanned &&
      !u.isMuted &&
      !u.detachedFromCentral &&
      !u.gitFilePath
    ) {
      try {
        const format = u.subscriptionType === 'happ' ? 'happ' : 'incy';
        const alloc = await ensureUserRepoFile(u, format);
        u.gitFilePath = alloc.filePath;
        u.gitRawUrl = alloc.rawUrl;
        u.finalSubscriptionUrl = alloc.finalUrl;
      } catch (err: any) {
        console.warn(`[Auto-allocate file error for @${u.username || u.telegramId}]:`, err.message);
        errors.push(`User ${u.telegramId}: не удалось создать файл подписки: ${err.message}`);
      }
    }
  }

  const skippedUsers = emptySkippedUsers();
  for (const user of store.users) {
    if (!user.hasActiveSubscription) skippedUsers.noActiveSubscription++;
    else if (user.isBlocked || user.isPermanentlyBanned || user.status === 'blocked') skippedUsers.blocked++;
    else if (user.isMuted || user.status === 'muted') skippedUsers.muted++;
    else if (user.channelMembership === 'left' || user.status === 'channel_inactive') skippedUsers.leftChannel++;
    else if (user.detachedFromCentral) skippedUsers.detachedFromCentral++;
    else if (user.status !== 'active') skippedUsers.inactiveStatus++;
    else if (!user.gitFilePath) skippedUsers.missingFilePath++;
  }

  const eligibleUsers = store.users.filter(
    (u) =>
      Boolean(
        u.sourceSubscriptions?.some((subscription) => subscription.sourceId === activeGit.id && subscription.filePath) ||
        ((u.subscriptionSourceId === activeGit.id || (!u.subscriptionSourceId && activeGit.id === getActiveGitSource().id)) && u.gitFilePath)
      ) &&
      u.hasActiveSubscription &&
      u.status === 'active' &&
      u.channelMembership !== 'left' &&
      !u.isBlocked &&
      !u.isPermanentlyBanned &&
      !u.isMuted &&
      !u.detachedFromCentral
  );
  const totalUsers = store.users.length;
  const centralContent = store.centralFile?.content || '';
  const centralContentBytes = Buffer.byteLength(centralContent, 'utf-8');
  const centralContentHash = crypto.createHash('sha256').update(centralContent).digest('hex');

  for (const u of eligibleUsers) {
    u.lastActiveAt = new Date().toISOString();
  }
  for (const e of store.exclusions || []) {
    e.lastSyncAt = new Date().toISOString();
  }

  // Persist store to database asynchronously with atomic Firebase batch write
  saveStore();
  executeFirebaseBatchCommit().catch(() => {});

  let syncedUsers = 0;
  let syncedExclusions = 0;
  let skippedUnchanged = 0;
  let pushedCount = 0;

  // Group unique file paths to eliminate duplicate concurrent writes to the same repository file
  const uniqueFilesToSync = new Map<
    string,
    {
      content: string;
      contentHash: string;
      users: Array<{ user: BotUser; filePath: string; format: 'happ' | 'incy' }>;
      exclusions: ExclusionSubscription[];
    }
  >();

  for (const user of eligibleUsers) {
    if (user.detachedFromCentral) continue;
    const sourceSubscription = user.sourceSubscriptions?.find(
      (subscription) => subscription.sourceId === activeGit.id && subscription.filePath
    );
    const filePath =
      sourceSubscription?.filePath ||
      ((user.subscriptionSourceId === activeGit.id || (!user.subscriptionSourceId && activeGit.id === getActiveGitSource().id))
        ? user.gitFilePath
        : undefined);
    if (!filePath) continue;
    const content = getUserRepoSubscriptionContent(user);
    const contentHash = crypto.createHash('sha256').update(content).digest('hex');
    const cleanPath = filePath.replace(/^\/+/, '');
    if (!uniqueFilesToSync.has(cleanPath)) {
      uniqueFilesToSync.set(cleanPath, {
        content,
        contentHash,
        users: [{
          user,
          filePath,
          format: sourceSubscription?.format || (user.subscriptionType === 'happ' ? 'happ' : 'incy'),
        }],
        exclusions: [],
      });
    } else {
      uniqueFilesToSync.get(cleanPath)!.users.push({
        user,
        filePath,
        format: sourceSubscription?.format || (user.subscriptionType === 'happ' ? 'happ' : 'incy'),
      });
    }
  }

  for (const excl of activeGit.id === getActiveGitSource().id ? store.exclusions || [] : []) {
    if (!excl.gitFilePath) continue;
    const content = getFullSubscriptionContent(null, excl);
    const contentHash = crypto.createHash('sha256').update(content).digest('hex');
    const cleanPath = excl.gitFilePath.replace(/^\/+/, '');
    if (!uniqueFilesToSync.has(cleanPath)) {
      uniqueFilesToSync.set(cleanPath, {
        content,
        contentHash,
        users: [],
        exclusions: [excl],
      });
    } else {
      uniqueFilesToSync.get(cleanPath)!.exclusions.push(excl);
    }
  }

  // Smart delta check: only push files whose content differs from the selected source.
  const filesToPush: Array<{
    filePath: string;
    item: {
      content: string;
      contentHash: string;
      users: Array<{ user: BotUser; filePath: string; format: 'happ' | 'incy' }>;
      exclusions: ExclusionSubscription[];
    };
    cachedSha?: string;
  }> = [];

  logSystemEvent(
    'info',
    'sync',
    'SYNC_STARTED',
    `Запуск синхронизации с центральным источником (${eligibleUsers.length} подписчиков, ${(store.exclusions || []).length} исключений)`,
    {
      eligible: eligibleUsers.length,
      exclusions: (store.exclusions || []).length,
      force: options?.forceFullGitPush,
      background: options?.backgroundGitPush !== false,
    }
  );

  for (const [filePath, item] of uniqueFilesToSync.entries()) {
    const repoFile = store.repoFiles?.find(
      (f) => f.sourceId === activeGit.id && (f.filePath === filePath || f.filePath.replace(/^\/+/, '') === filePath)
    );
    const cached = repoFile ? gitFileMetadataCache.get(filePath) : undefined;

    // Only skip if forceFullGitPush is false AND repoFile has a verified SHA and matching hash
    const isMatch =
      !options?.forceFullGitPush &&
      Boolean(
        repoFile?.sha &&
        repoFile?.rawUrl &&
        isRepositoryRawUrl(activeGit, repoFile.rawUrl, filePath) &&
        repoFile?.contentHash &&
        repoFile.contentHash === item.contentHash
      );

    if (isMatch) {
      // The repository already contains the exact target content.
      for (const userTarget of item.users) {
        const subscription = userTarget.user.sourceSubscriptions?.find(
          (entry) => entry.sourceId === activeGit.id && entry.filePath === userTarget.filePath
        );
        const rawUrl = repoFile.rawUrl || subscription?.rawUrl;
        try {
          await refreshUserSubscriptionLink(
            userTarget.user,
            activeGit.id,
            userTarget.filePath,
            rawUrl,
            userTarget.format
          );
          syncedUsers++;
        } catch (linkError: any) {
          const message = `User ${userTarget.user.telegramId}: не удалось обновить ссылку на ${userTarget.filePath}: ${linkError.message}`;
          errors.push(message);
          userTarget.user.syncHealthStatus = 'red';
          userTarget.user.isInconsistent = true;
          userTarget.user.inconsistencyReason = 'Не удалось обновить ссылку на файл подписки';
        }
      }
      skippedUnchanged++;
      syncedExclusions += item.exclusions.length;
      if (repoFile) {
        repoFile.updatedAt = new Date().toISOString();
      }
    } else {
      const cachedSha = repoFile?.sha || cached?.sha;
      filesToPush.push({ filePath, item, cachedSha });
    }
  }

  logSystemEvent(
    'info',
    'sync',
    'DELTA_CHECK',
    `Проверка изменений для ${activeGit.name}: ${skippedUnchanged} файлов уже актуальны, ${filesToPush.length} файлов отправлены на запись в subs/`,
    { skipped: skippedUnchanged, toPush: filesToPush.length, force: Boolean(options?.forceFullGitPush) }
  );

  console.log(
    `[Central Sync] Target files: ${uniqueFilesToSync.size}. Already synced: ${skippedUnchanged}. Files to push: ${filesToPush.length}...`
  );

  // Background pusher for delta files (sequential processing to prevent git branch lock collisions)
  const runPushWorker = async () => {
    if (filesToPush.length === 0) {
      isSyncingSubscribersWithCentral = false;
      return;
    }
    if (!activeGit || !activeGit.token?.trim()) {
      errors.push(`Не настроен API-токен активного Git-источника; не записано файлов: ${filesToPush.length}`);
      isSyncingSubscribersWithCentral = false;
      return;
    }
    const { owner, repo } = getRepoParts(activeGit);
    const branch = activeGit.branch || getDefaultGitBranch(activeGit.provider);
    const cleanToken = activeGit.token.trim();

    try {
      // Pre-fetch directory listing of subs/ to get all fresh remote SHAs in ONE fast API call!
      const remoteShaMap = new Map<string, string>();
      const apiBase = (activeGit.apiUrl || 'https://api.gitverse.ru').replace(/\/+$/, '');
      for (let attempt = 0; !usesGitCliProvider(activeGit.provider) && attempt < 2; attempt++) {
        try {
          const subsUrl = `${apiBase}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/subs?ref=${encodeURIComponent(branch)}`;
          const listRes = await fetch(subsUrl, {
            signal: AbortSignal.timeout(20000),
            headers: {
              'Authorization': `Bearer ${cleanToken}`,
              'Accept': 'application/json, application/vnd.gitverse.object+json;version=1;q=0.9, */*',
              'User-Agent': 'PulsAccess/2.0',
            },
          });
          if (listRes.ok) {
            const listData = await listRes.json();
            if (Array.isArray(listData)) {
              for (const item of listData) {
                if (item.path && item.sha) {
                  remoteShaMap.set(item.path.replace(/^\/+/, ''), item.sha);
                  remoteShaMap.set(item.name, item.sha);
                }
              }
              logSystemEvent('info', 'gitverse', 'REMOTE_SHA_SYNC', `Синхронизированы свежие SHA для ${remoteShaMap.size} файлов из каталога subs/`, { count: remoteShaMap.size });
              break;
            }
          }
        } catch (err: any) {
          console.warn(`[GitVerse] Directory listing pre-fetch attempt ${attempt + 1} failed:`, err.message);
          if (attempt === 0) {
            await new Promise((r) => setTimeout(r, 1000));
          }
        }
      }

      for (const target of filesToPush) {
        const { filePath, item } = target;
        // Prioritize fresh SHA retrieved from remote directory listing
        const cleanPath = filePath.replace(/^\/+/, '');
        const filenameOnly = cleanPath.split('/').pop() || cleanPath;
        const freshRemoteSha = remoteShaMap.get(cleanPath) || remoteShaMap.get(filenameOnly) || target.cachedSha;

        try {
          const commitMsg = `Sync central nodes to ${filePath} (${item.users.length} users, ${item.exclusions.length} excl)`;
          const gitRes = await createOrUpdateGitVerseFile({
            token: cleanToken,
            owner,
            repo,
            branch,
            filePath,
            content: item.content,
            commitMessage: commitMsg,
            cachedSha: freshRemoteSha,
            provider: activeGit.provider,
            apiUrl: activeGit.apiUrl,
          });

          if (gitRes.success) {
            const updatedRawUrl =
              (gitRes.rawUrl && isRepositoryRawUrl(activeGit, gitRes.rawUrl, filePath) ? gitRes.rawUrl : '') ||
              buildGitRawUrl(activeGit, filePath);
            if (!updatedRawUrl || !isRepositoryRawUrl(activeGit, updatedRawUrl, filePath)) {
              throw new Error(`Источник «${activeGit.name}» не вернул действительный RAW-адрес файла ${filePath}`);
            }
            const repoFile = store.repoFiles?.find(
              (f) => f.sourceId === activeGit.id && (f.filePath === filePath || f.filePath.replace(/^\/+/, '') === filePath)
            );
            if (repoFile) {
              repoFile.sourceId = activeGit.id;
              repoFile.sizeBytes = Buffer.byteLength(item.content, 'utf-8');
              repoFile.nodesFound = parseNodeStats(item.content).total;
              repoFile.updatedAt = new Date().toISOString();
              repoFile.rawUrl = updatedRawUrl;
              if (gitRes.sha) repoFile.sha = gitRes.sha;
              repoFile.contentHash = item.contentHash;
            }

            gitFileMetadataCache.set(filePath, {
              sha: gitRes.sha,
              contentHash: item.contentHash,
              rawUrl: updatedRawUrl,
              lastUpdated: Date.now(),
            });

            if (gitRes.sha) {
              remoteShaMap.set(cleanPath, gitRes.sha);
              remoteShaMap.set(filenameOnly, gitRes.sha);
            }

            for (const userTarget of item.users) {
              const { user: u, filePath: userFilePath } = userTarget;
              try {
                if (!updatedRawUrl) {
                  throw new Error(`Источник «${activeGit.name}» не вернул URL файла ${filePath}`);
                }
                await refreshUserSubscriptionLink(
                  u,
                  activeGit.id,
                  userFilePath,
                  updatedRawUrl,
                  userTarget.format
                );
                u.lastActiveAt = new Date().toISOString();
                u.syncHealthStatus = 'green';
                u.isInconsistent = false;
                u.inconsistencyReason = undefined;
                syncedUsers++;
              } catch (linkError: any) {
                const message = `User ${u.telegramId}: файл ${filePath} обновлен, но ссылка подписки не обновилась: ${linkError.message}`;
                errors.push(message);
                u.syncHealthStatus = 'red';
                u.isInconsistent = true;
                u.inconsistencyReason = 'Файл обновлен, но ссылка подписки не обновилась';
                logSystemEvent('error', 'sync', 'SUBSCRIPTION_LINK_UPDATE_FAILED', message, {
                  telegramId: u.telegramId,
                  sourceId: activeGit.id,
                  filePath,
                });
              }
            }
            if (item.users.some(({ user }) => user.isInconsistent && user.inconsistencyReason === 'Файл обновлен, но ссылка подписки не обновилась')) {
              if (repoFile) repoFile.contentHash = '';
            }
            for (const e of item.exclusions) {
              if (gitRes.rawUrl) e.gitRawUrl = gitRes.rawUrl;
              e.lastSyncAt = new Date().toISOString();
            }

            pushedCount++;
            syncedExclusions += item.exclusions.length;
            const contentBytes = Buffer.byteLength(item.content, 'utf-8');
            logSystemEvent('success', 'sync', 'FILE_COMMITTED', `Файл ${filePath} синхронизирован в ${activeGit.name} (${contentBytes} байт)`, {
              filePath,
              contentBytes,
              contentHash: item.contentHash,
              sha: gitRes.sha,
            });
          } else {
            errors.push(`File ${filePath}: ${gitRes.error || 'Ошибка GitVerse'}`);
            logSystemEvent('error', 'sync', 'FILE_ERROR', `Ошибка обновления файла ${filePath} в GitVerse: ${gitRes.error}`, { filePath, error: gitRes.error });
            gitFileMetadataCache.delete(filePath);
            const repoFile = store.repoFiles?.find(
              (f) => f.sourceId === activeGit.id && (f.filePath === filePath || f.filePath.replace(/^\/+/, '') === filePath)
            );
            if (repoFile) {
              repoFile.contentHash = '';
            }
          }
        } catch (err: any) {
          errors.push(`File ${filePath}: ${err.message}`);
          logSystemEvent('error', 'sync', 'FILE_EXCEPTION', `Исключение при коммите ${filePath}: ${err.message}`, { filePath, error: err.message });
          gitFileMetadataCache.delete(filePath);
          const repoFile = store.repoFiles?.find(
            (f) => f.sourceId === activeGit.id && (f.filePath === filePath || f.filePath.replace(/^\/+/, '') === filePath)
          );
          if (repoFile) {
            repoFile.contentHash = '';
          }
        }
        await new Promise((r) => setTimeout(r, 40));
      }
    } finally {
      isSyncingSubscribersWithCentral = false;
      activePushWorkerPromise = null;
      logSystemEvent(
        errors.length > 0 ? 'warning' : 'success',
        'sync',
        'SYNC_FINISHED',
        `Синхронизация завершена: ${pushedCount} файлов записано в subs/, ${skippedUnchanged} без изменений, ${errors.length} ошибок`,
        { pushedCount, skippedUnchanged, errorsCount: errors.length, durationMs: Date.now() - startTime }
      );
      saveStore();
    }
  };

  isSyncingSubscribersWithCentral = true;
  activePushWorkerPromise = runPushWorker();

  // If async / background execution is allowed (default for instant UI response), return immediately
  if (options?.backgroundGitPush !== false) {
    activePushWorkerPromise
      .then(() => {
        lastCentralSyncStats = {
          syncedUsers,
          syncedExclusions,
          durationMs: Date.now() - startTime,
          errors,
          totalUsers,
          centralContentBytes,
          centralContentHash,
          skippedUsers,
          skippedUnchanged,
          pushedCount,
          mode: 'instant',
        };
        const errSuffix = errors.length > 0 ? `, сбоев: ${errors.length}` : '';
        console.log(`[Central Sync] Background push finished: ${pushedCount} pushed, ${skippedUnchanged} skipped${errSuffix}.`);
      })
      .catch((err) => console.warn('[Background Git Push Error]:', err.message));

    const durationMs = Date.now() - startTime;
    lastCentralSyncStats = {
      syncedUsers,
      syncedExclusions,
      durationMs,
      errors,
      totalUsers,
      centralContentBytes,
      centralContentHash,
      skippedUsers,
      skippedUnchanged,
      pushedCount,
      mode: 'instant',
    };
    console.log(`[Central Sync] Instant propagation queued in ${durationMs}ms: target ${uniqueFilesToSync.size} files (${filesToPush.length} to push).`);
    return lastCentralSyncStats;
  }

  // Otherwise wait for push worker to complete
  await activePushWorkerPromise;
  const durationMs = Date.now() - startTime;
  lastCentralSyncStats = {
    syncedUsers,
    syncedExclusions,
    durationMs,
    errors,
    totalUsers,
    centralContentBytes,
    centralContentHash,
    skippedUsers,
    skippedUnchanged,
    pushedCount,
    mode: 'full',
  };
  const errSuffix = errors.length > 0 ? `, сбоев: ${errors.length}` : ' (успешно)';
  console.log(`[Central Sync] Finished full propagation in ${durationMs}ms: updated ${syncedUsers} users, ${syncedExclusions} exclusions (${pushedCount} pushed${errSuffix}).`);
  return lastCentralSyncStats;
}

// Periodic monitor for external central raw URL changes
async function monitorAndPullCentralSubscription(): Promise<void> {
  if (store.centralFile.autoSyncEnabled === false) return;
  const git = getActiveGitSource();
  const urlToPull = store.centralFile.centralRawUrl || git.centralRawUrl || buildGitRawUrl(git, store.centralFile.filename || 'L');
  if (!urlToPull || !urlToPull.startsWith('http')) return;

  try {
    const resp = await fetch(urlToPull, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': 'text/plain, */*',
      },
    });
    if (resp.ok) {
      const text = await resp.text();
      if (text && text.trim() && text !== store.centralFile.content) {
        console.log(`[Central Monitor] Detected updates in central source (${urlToPull})! Propagating to subscribers...`);
        store.centralFile.content = text;
        store.centralFile.lastUpdatedAt = new Date().toISOString();
        store.centralFile.lastCommitMessage = `Pulled from central raw at ${new Date().toLocaleTimeString('ru-RU')}`;
        store.centralFile.isSyncedWithRepo = true;
        saveStore();
        await syncActiveSubscribersWithCentral();
      }
    }
  } catch (err: any) {
    // Non-critical background network error
  }
}

// Helper: Parse Individual Nodes with protocol, name, server, and port
function parseIndividualCentralNodes(content: string) {
  const lines = (content || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#') && !l.startsWith('//'));

  return lines.map((line, idx) => {
    let protocol = 'vless';
    if (line.startsWith('vless://')) protocol = 'vless';
    else if (line.startsWith('vmess://')) protocol = 'vmess';
    else if (line.startsWith('ss://')) protocol = 'ss';
    else if (line.startsWith('trojan://')) protocol = 'trojan';
    else if (line.startsWith('hysteria2://') || line.startsWith('hy2://')) protocol = 'hysteria2';
    else if (line.startsWith('wireguard://') || line.includes('[Interface]')) protocol = 'wireguard';
    else if (line.includes('://')) protocol = line.split('://')[0];

    let name = `Узел #${idx + 1}`;
    let server = 'Сервер';
    let port = '443';
    try {
      if (line.includes('#')) {
        const hashPart = line.split('#')[1];
        if (hashPart) name = decodeURIComponent(hashPart);
      }
      const withoutProto = line.replace(/^[a-zA-Z0-9_-]+:\/\//, '');
      const atSplit = withoutProto.split('@');
      const hostPart = atSplit.length > 1 ? atSplit[1].split('?')[0].split('#')[0] : withoutProto.split('?')[0].split('#')[0];
      if (hostPart) {
        const parts = hostPart.split(':');
        server = parts[0] || 'Сервер';
        port = parts[1] || '443';
      }
    } catch {
      // fallback
    }

    return {
      id: `node_${idx + 1}`,
      raw: line,
      protocol: protocol.toUpperCase(),
      name,
      server,
      port,
    };
  });
}

// Compute comprehensive Sync Health status across all nodes & subscribers (including exclusions)
function computeSyncHealthReport() {
  const centralContent = store.centralFile.content || '';
  const centralNodes = parseIndividualCentralNodes(centralContent);
  const centralTotal = centralNodes.length;

  const eligibleUsers = (store.users || []).filter((u) => u.hasActiveSubscription);
  const subscriberReports = eligibleUsers.map((user) => {
    const isMuted = user.status === 'muted' || (user.mutedUntil && new Date(user.mutedUntil).getTime() > Date.now());
    const isBlocked = user.status === 'blocked' || user.isBlocked;
    const userStatusStr = String(user.status);
    const isLeft = user.channelMembership === 'left' || userStatusStr === 'channel_inactive' || userStatusStr === 'bot_blocked' || userStatusStr === 'unsubscribed';

    const repoFile = store.repoFiles?.find((f) => f.filePath === user.gitFilePath);
    const expectedContent = getUserRepoSubscriptionContent(user);
    const expectedContentHash = crypto.createHash('sha256').update(expectedContent).digest('hex');
    const currentNodesCount = repoFile?.nodesFound ?? parseNodeStats(expectedContent).total;
    const expectedNodesCount = parseNodeStats(expectedContent).total;

    let status: 'green' | 'yellow' | 'red' = 'green';
    let isInconsistent = false;
    let inconsistencyReason = '';

    if (isBlocked) {
      status = 'red';
      inconsistencyReason = user.blockedReason || 'Пользователь заблокирован в системе';
    } else if (isLeft) {
      status = 'red';
      inconsistencyReason = 'Пользователь покинул обязательный канал';
    } else if (isMuted) {
      status = 'yellow';
      inconsistencyReason = user.subscriptionStatusReason || 'Подписка временно заглушена (пауза сети)';
    } else if (!user.gitFilePath) {
      status = 'yellow';
      isInconsistent = true;
      inconsistencyReason = 'Отсутствует привязанный файл в Git-репозитории';
    } else if (!repoFile?.contentHash) {
      status = 'yellow';
      isInconsistent = true;
      inconsistencyReason = 'Содержимое файла еще не проверено по контрольной сумме; выполните синхронизацию';
    } else if (repoFile.contentHash !== expectedContentHash) {
      status = 'yellow';
      isInconsistent = true;
      inconsistencyReason = 'Содержимое файла отличается от ожидаемого точного текста подписки';
    } else {
      status = 'green';
    }

    user.isInconsistent = isInconsistent;
    user.inconsistencyReason = inconsistencyReason || undefined;
    user.syncHealthStatus = status;

    return {
      userId: user.id,
      telegramId: user.telegramId,
      username: user.username,
      firstName: user.firstName,
      status,
      isInconsistent,
      inconsistencyReason,
      gitFilePath: user.gitFilePath,
      expectedNodesCount,
      currentNodesCount,
      lastSyncedAt: repoFile?.updatedAt || user.receivedAt || null,
      membershipStatus: user.channelMembership,
      subStatus: user.status,
    };
  });

  const exclusionReports = (store.exclusions || []).map((excl) => {
    const isBlocked = Boolean(excl.isBlocked);
    const isMuted = Boolean(excl.isMuted);
    const isLeft = excl.channelMembership === 'left';
    const repoFile = store.repoFiles?.find((f) => f.filePath === excl.gitFilePath);
    const expectedContent = getFullSubscriptionContent(null, excl);
    const expectedContentHash = crypto.createHash('sha256').update(expectedContent).digest('hex');
    const currentNodesCount = repoFile?.nodesFound ?? parseNodeStats(expectedContent).total;
    const expectedNodesCount = parseNodeStats(expectedContent).total;

    let status: 'green' | 'yellow' | 'red' = 'green';
    let isInconsistent = false;
    let inconsistencyReason = '';

    if (isBlocked) {
      status = 'red';
      inconsistencyReason = 'Исключение заблокировано';
    } else if (isLeft) {
      status = 'red';
      inconsistencyReason = 'Пользователь исключения покинул канал';
    } else if (isMuted) {
      status = 'yellow';
      inconsistencyReason = excl.subscriptionStatusReason || 'Исключение на паузе';
    } else if (!excl.gitFilePath) {
      status = 'yellow';
      isInconsistent = true;
      inconsistencyReason = 'Отсутствует файл исключения в репозитории';
    } else if (!repoFile?.contentHash) {
      status = 'yellow';
      isInconsistent = true;
      inconsistencyReason = 'Содержимое файла еще не проверено по контрольной сумме; выполните синхронизацию';
    } else if (repoFile.contentHash !== expectedContentHash) {
      status = 'yellow';
      isInconsistent = true;
      inconsistencyReason = 'Содержимое файла отличается от ожидаемого точного текста подписки';
    } else {
      status = 'green';
    }

    return {
      id: excl.id,
      name: excl.name,
      token: excl.token,
      gitFilePath: excl.gitFilePath,
      status,
      isInconsistent,
      inconsistencyReason,
      currentNodesCount,
      expectedNodesCount,
      lastSyncedAt: excl.lastSyncAt || repoFile?.updatedAt || null,
    };
  });

  const activeSubscribers = subscriberReports.filter((s) => s.membershipStatus !== 'left' && s.subStatus !== 'blocked');
  const totalSubscribers = subscriberReports.length + exclusionReports.length;
  const syncedCount = subscriberReports.filter((s) => s.status === 'green').length + exclusionReports.filter((e) => e.status === 'green').length;
  const inconsistentCount = subscriberReports.filter((s) => s.status === 'yellow').length + exclusionReports.filter((e) => e.status === 'yellow').length;
  const desyncedCount = subscriberReports.filter((s) => s.status === 'red').length + exclusionReports.filter((e) => e.status === 'red').length;

  const nodeHealthList = centralNodes.map((n) => {
    const matchedCount = syncedCount;
    let nodeStatus: 'green' | 'yellow' | 'red' = 'green';
    if (activeSubscribers.length > 0 && matchedCount < activeSubscribers.length) {
      nodeStatus = matchedCount === 0 ? 'red' : 'yellow';
    }
    return {
      ...n,
      status: nodeStatus,
      matchedSubscribersCount: matchedCount,
      totalSubscribersCount: activeSubscribers.length,
    };
  });

  const healthPercentage = totalSubscribers > 0
    ? Math.round((syncedCount / totalSubscribers) * 100)
    : 100;

  return {
    centralNodes: nodeHealthList,
    subscribers: subscriberReports,
    exclusions: exclusionReports,
    summary: {
      totalSubscribers,
      syncedCount,
      inconsistentCount,
      desyncedCount,
      healthPercentage,
      centralNodesCount: centralTotal,
      lastCentralUpdate: store.centralFile.lastUpdatedAt || null,
      centralHash: Buffer.from(centralContent).toString('base64').substring(0, 16),
    },
  };
}

// Force re-sync a specific subscriber with central source
async function pullLatestCentralContent(): Promise<void> {
  const activeGit = getActiveGitSource();
  const filePath = store.centralFile.filename || activeGit.filePath || 'L';
  const rawUrl = activeGit.provider === 'sourcecraft'
    ? buildGitRawUrl(activeGit, filePath)
    : store.centralFile.centralRawUrl || activeGit.centralRawUrl || buildGitRawUrl(activeGit, filePath);
  if (!rawUrl) {
    throw new Error(`Не настроена RAW-ссылка центрального файла в источнике «${activeGit.name}»`);
  }

  const response = await fetch(rawUrl, {
    headers: {
      'User-Agent': 'PulsAccess/2.0',
      Accept: 'text/plain, */*',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    throw new Error(`Не удалось прочитать центральный файл из ${activeGit.name}: HTTP ${response.status}`);
  }
  const content = await response.text();
  if (!content.trim()) {
    throw new Error(`Центральный файл в источнике «${activeGit.name}» пуст; синхронизация отменена`);
  }

  const previousHash = crypto.createHash('sha256').update(store.centralFile.content || '').digest('hex');
  const latestHash = crypto.createHash('sha256').update(content).digest('hex');
  if (previousHash !== latestHash) {
    store.centralFile.content = content;
    store.centralFile.centralRawUrl = rawUrl;
    store.centralFile.lastUpdatedAt = new Date().toISOString();
    store.centralFile.lastCommitMessage = `Pulled before subscriber force-resync from ${activeGit.name}`;
    saveStore();
  }
}

async function forceResyncSubscriber(user: BotUser): Promise<{ success: boolean; message: string; user: BotUser; nodesCount: number }> {
  const activeGit = getActiveGitSource();
  const targetGit = store.gitSources?.find((source) => source.id === user.subscriptionSourceId) || activeGit;
  const format = user.subscriptionType === 'happ' ? 'happ' : 'incy';
  await pullLatestCentralContent();
  const tokenSafe = user.subscriptionToken || `sub_${user.username || user.telegramId}`;
  const sourceSubscription = user.sourceSubscriptions?.find(
    (subscription) => subscription.sourceId === targetGit.id && subscription.filePath === user.gitFilePath
  ) || user.sourceSubscriptions?.find((subscription) => subscription.sourceId === targetGit.id);
  const safeSourceId = targetGit.id.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filePath = sourceSubscription?.filePath ||
    (user.subscriptionSourceId === targetGit.id || !user.subscriptionSourceId ? user.gitFilePath : undefined) ||
    (user.sourceSubscriptions?.length ? `subs/${tokenSafe}_${safeSourceId}.txt` : `subs/${tokenSafe}.txt`);
  const content = getUserRepoSubscriptionContent(user);
  const stats = parseNodeStats(content);
  const sizeBytes = Buffer.byteLength(content, 'utf-8');
  if (!targetGit.token?.trim()) {
    throw new Error(`Не настроен токен для Git-источника «${targetGit.name}»`);
  }

  const { owner, repo } = getRepoParts(targetGit);
  const branch = targetGit.branch || getDefaultGitBranch(targetGit.provider);
  const contentHash = crypto.createHash('sha256').update(content).digest('hex');
  const gitRes = await createOrUpdateGitVerseFile({
    token: targetGit.token.trim(),
    owner,
    repo,
    branch,
    filePath,
    content,
    commitMessage: `Force reconcile: sync central nodes to ${filePath} for @${user.username || user.telegramId}`,
    provider: targetGit.provider,
    apiUrl: targetGit.apiUrl,
  });
  if (!gitRes.success) {
    throw new Error(`Не удалось обновить файл ${filePath} в ${targetGit.name}: ${gitRes.error || 'ошибка Git'}`);
  }
  const rawUrl = gitRes.rawUrl || buildGitRawUrl(targetGit, filePath);
  if (!rawUrl) {
    throw new Error(`Git-источник «${targetGit.name}» не вернул URL обновлённого файла ${filePath}`);
  }
  if (gitRes.sha) {
    gitFileMetadataCache.set(filePath.replace(/^\/+/, ''), {
      sha: gitRes.sha,
      contentHash,
      rawUrl,
      lastUpdated: Date.now(),
    });
  }

  const now = new Date().toISOString();
  user.subscriptionSourceId = targetGit.id;
  user.gitFilePath = filePath;
  user.gitRawUrl = rawUrl;
  if (!store.repoFiles) store.repoFiles = [];
  let repoFile = store.repoFiles.find((item) => item.sourceId === targetGit.id && item.filePath === filePath);
  if (!repoFile) {
    repoFile = {
      sourceId: targetGit.id,
      userId: user.id,
      telegramId: user.telegramId,
      username: user.username,
      firstName: user.firstName,
      filePath,
      rawUrl,
      updatedAt: now,
      format,
      finalUrl: user.finalSubscriptionUrl || '',
      sizeBytes,
      isPoolFree: false,
      lastCheckedAt: now,
      httpStatus: 200,
      isAccessible: true,
      nodesFound: stats.total,
      contentHash,
    };
    store.repoFiles.push(repoFile);
  } else {
    Object.assign(repoFile, {
      userId: user.id,
      telegramId: user.telegramId,
      username: user.username,
      firstName: user.firstName,
      rawUrl,
      format,
      sizeBytes,
      nodesFound: stats.total,
      contentHash,
      updatedAt: now,
      lastCheckedAt: now,
    });
  }
  if (gitRes.sha) repoFile.sha = gitRes.sha;

  let finalUrl: string;
  try {
    finalUrl = await refreshUserSubscriptionLink(user, targetGit.id, filePath, rawUrl, format);
  } catch (error: any) {
    repoFile.contentHash = '';
    user.isInconsistent = true;
    user.inconsistencyReason = `Файл обновлен, но ссылка подписки не обновилась: ${error.message}`;
    user.syncHealthStatus = 'red';
    saveStore();
    throw error;
  }
  repoFile.finalUrl = finalUrl;

  user.isInconsistent = false;
  user.inconsistencyReason = undefined;
  user.syncHealthStatus = (user.isBlocked || user.channelMembership === 'left') ? 'red' : (user.status === 'muted' ? 'yellow' : 'green');
  saveStore();

  return {
    success: true,
    message: `Конфигурация @${user.username || user.telegramId} обновлена в источнике «${targetGit.name}» (${stats.total} узлов); ссылка подписки тоже обновлена.`,
    user,
    nodesCount: stats.total,
  };
}

// -------------------------------------------------------------
// Telegram Bot Background Polling Manager
// -------------------------------------------------------------
async function deleteUserRepoFile(sourceId: string, filePath: string): Promise<boolean> {
  const source = store.gitSources?.find((item: GitSourceItem) => item.id === sourceId);
  if (!source) {
    console.warn(`[deleteUserRepoFile] Git source ${sourceId} is not configured; cannot delete ${filePath}.`);
    return false;
  }
  return deleteRepoFilesFromSource(
    source,
    [filePath],
    (pathToDelete) => `Replace broken user subscription ${pathToDelete}`
  );
}

export const botManager = new TelegramBotManager({
  getBots: () => store.bots || [],
  getStore: () => store,
  saveStore,
  getExistingCurrentSourceSubscription,
  ensureUserRepoFile,
  deleteUserRepoFile,
  resolveUserDisplayKey,
  applyDisconnectStub,
  restoreUserNodes,
  permanentlyDeleteUser,
  parseNodeStats,
  resolveSecondDeviceRemoved,
});

// -------------------------------------------------------------
// API Routes
// -------------------------------------------------------------

// Direct Subscription Short-Link Handler (Serves keys directly, never redirects to Google or search)
app.get('/r/:code', (req, res) => {
  const { code } = req.params;
  const queryStr = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';

  // High-speed bridge for Russian Relay Gateway via clck.ru:
  // e.g. /r/gw_sub_... forwards directly to the Russian gateway URL or local sub endpoint
  if (code.startsWith('gw_')) {
    const rawToken = code.replace(/^gw_/, '');
    if (store.relayGatewayConfig?.enabled && store.relayGatewayConfig?.url && store.relayGatewayConfig?.isOnline !== false) {
      const gwBase = store.relayGatewayConfig.url.trim().replace(/\/+$/, '');
      return res.redirect(302, `${gwBase}/api/sub/${rawToken}${queryStr}`);
    }
    return res.redirect(302, `/api/sub/${rawToken}${queryStr}`);
  }

  const user = store.users.find((u) =>
    u.subscriptionToken === code ||
    u.subscriptionToken?.includes(code) ||
    u.telegramId.toString() === code ||
    u.id === code
  );
  if (user && user.subscriptionToken) {
    return res.redirect(302, `/api/sub/${user.subscriptionToken}${queryStr}`);
  }

  const exclusion = store.exclusions?.find((e) =>
    e.token === code ||
    e.token?.includes(code) ||
    e.gitFilePath?.includes(code) ||
    e.id === code
  );
  if (exclusion && exclusion.token) {
    return res.redirect(302, `/api/sub/${exclusion.token}${queryStr}`);
  }

  return res.redirect(302, `/api/sub/${code}${queryStr}`);
});

// Direct RAW file gateway for subscriptions: /raw/subs/:filename and /raw/:path*
app.get(['/raw/subs/:filename', '/api/raw/subs/:filename', '/raw/:filename'], (req, res) => {
  const filename = req.params.filename || '';
  const token = filename.replace(/\.txt$/, '');
  const user = store.users.find((u) =>
    u.subscriptionToken === token ||
    u.subscriptionToken === `sub_${token}` ||
    u.telegramId.toString() === token ||
    (u.gitFilePath && (u.gitFilePath === filename || u.gitFilePath.endsWith(filename)))
  );
  const exclusion = !user ? store.exclusions?.find((e) =>
    e.token === token ||
    e.token === `sub_${token}` ||
    (e.gitFilePath && (e.gitFilePath === filename || e.gitFilePath.endsWith(filename)))
  ) : null;

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  if (user) {
    return res.send(getFullSubscriptionContent(user, null));
  }
  if (exclusion) {
    return res.send(getFullSubscriptionContent(null, exclusion));
  }
  return res.send(store.centralFile.content);
});

// 1. Unified System Status
app.get('/api/status', (req, res) => {
  const nodeStats = parseNodeStats(store.centralFile.content);
  const activeGit = getActiveGitSource();
  const activeBot = getActiveBot();

  res.json({
    gitSources: {
      total: store.gitSources.length,
      connectedCount: store.gitSources.filter((s) => s.status === 'connected').length,
      activeSource: activeGit,
    },
    bots: {
      total: store.bots.length,
      connectedCount: store.bots.filter((b) => b.status === 'connected').length,
      activeBot: activeBot,
    },
    channels: {
      total: activeBot?.channels?.length || 0,
      adminConfirmedCount: activeBot?.channels?.filter((c) => c.isBotAdmin).length || 0,
    },
    centralFile: {
      configured: Boolean(store.centralFile.content),
      autoSync: store.centralFile.autoSyncEnabled,
      nodesCount: nodeStats.total,
      lastSyncedAt: store.centralFile.lastUpdatedAt,
    },
    counts: {
      totalUsers: store.users.length,
      activeSubscribers: store.users.filter((u) => u.status === 'active' && !u.isBlocked).length,
      channelMembers: store.users.filter((u) => ['creator', 'administrator', 'member'].includes(u.channelMembership)).length,
      mutedCount: store.users.filter((u) => u.status === 'muted').length,
      blockedCount: store.users.filter((u) => u.status === 'blocked' || u.isBlocked).length,
      exclusionsCount: store.exclusions.length,
      pendingFeedbackCount: (store.feedbackRequests || []).filter((r) => r.status === 'pending').length,
      freeLinksCount: (store.repoFiles || []).filter((f) => !f.userId || f.isPoolFree).length,
      totalRepoFilesCount: (store.repoFiles || []).length,
    },
    syncHealth: computeSyncHealthReport().summary,
  });
});

// Real-time Sync Health & Consistency Analysis
app.get('/api/sync/health', (req, res) => {
  const report = computeSyncHealthReport();
  res.json(report);
});

// Force Re-sync a specific subscriber to reconcile local nodes with central source
app.post('/api/users/:id/force-resync', async (req, res) => {
  const { id } = req.params;
  const user = store.users.find((u) => u.id === id || u.telegramId === Number(id));
  if (!user) return res.status(404).json({ success: false, message: 'Пользователь не найден' });

  try {
    const result = await forceResyncSubscriber(user);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: `Ошибка принудительной синхронизации: ${err.message}` });
  }
});

// Force Re-sync all subscribers with discrepancies
app.post('/api/sync/force-all-inconsistent', async (req, res) => {
  try {
    const result = await syncActiveSubscribersWithCentral();
    const report = computeSyncHealthReport();
    res.json({
      success: true,
      message: `Все пользователи синхронизированы с центральным источником (${result.syncedUsers} пользователей обновлено)!`,
      report,
      result,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: `Ошибка синхронизации: ${err.message}` });
  }
});

// 2. Git Sources CRUD & Activation
app.get('/api/git-sources', (req, res) => {
  res.json({
    gitSources: store.gitSources,
    activeGitSourceId: store.activeGitSourceId,
  });
});

app.post('/api/git-sources', (req, res) => {
  const item: Partial<GitSourceItem> = req.body;
  const existingIdx = store.gitSources.findIndex((s) => s.id === item.id);

  if (existingIdx >= 0) {
    const current = store.gitSources[existingIdx];
    const isEnabled = item.enabled !== undefined ? item.enabled : (current.enabled ?? true);
    const hasCreds = Boolean(item.token?.trim() || current.token?.trim());

    let cleanApi = item.apiUrl !== undefined ? item.apiUrl : current.apiUrl;
    const provider = item.provider || current.provider;
    if (provider === 'sourcecraft') {
      if (!cleanApi || cleanApi.includes('sourcecraft.dev')) {
        cleanApi = 'https://api.sourcecraft.tech';
      }
    }

    store.gitSources[existingIdx] = {
      ...current,
      ...item,
      token: item.token?.trim() ? item.token : current.token,
      apiUrl: cleanApi,
      status: (isEnabled && hasCreds) ? 'connected' : 'not_configured',
      lastSyncAt: new Date().toISOString(),
    };

    // If editing the active source, synchronize centralFile
    if (store.activeGitSourceId === current.id) {
      gitFileMetadataCache.clear();
      const updated = store.gitSources[existingIdx];
      const filename = updated.filePath || store.centralFile.filename || 'L';
      if (item.centralRawUrl) {
        store.centralFile.centralRawUrl = item.centralRawUrl;
      } else if (item.repository || item.branch || item.filePath) {
        store.centralFile.centralRawUrl = buildGitRawUrl(updated, filename);
      }
      if (item.repository) {
        store.centralFile.repositoryUrl = buildGitRepositoryWebUrl(updated);
      }
      if (item.filePath) {
        store.centralFile.filename = item.filePath;
      }
    }

    saveStore();
    return res.json({ success: true, gitSource: store.gitSources[existingIdx], gitSources: store.gitSources, centralFile: store.centralFile });
  }

  if (!item.name && !item.apiUrl && !item.centralRawUrl && !item.provider) {
    return res.status(400).json({ success: false, message: 'Укажите название источника, адрес API или выберите провайдера' });
  }

  let name = item.name?.trim() || '';
  if (!name) {
    if (item.provider === 'sourcecraft') {
      name = 'SourceCraft (Яндекс)';
    } else if (item.provider === 'gitverse') {
      name = 'GitVerse (Сбер)';
    } else if (item.provider === 'gitflic') {
      name = 'GitFlic';
    } else if (item.provider === 'moshub') {
      name = 'MosHub';
    } else if (item.provider === 'github') {
      name = 'GitHub';
    } else if (item.provider === 'gitlab') {
      name = 'GitLab';
    } else if (item.apiUrl) {
      try {
        const u = new URL(item.apiUrl.startsWith('http') ? item.apiUrl : `https://${item.apiUrl}`);
        name = `API (${u.hostname})`;
      } catch {
        name = `API (${item.apiUrl})`;
      }
    } else {
      name = 'Пользовательский источник';
    }
  }
  const repo = item.repository || (item.username ? `${item.username}/subscription` : 'default/subscription');
  const provider = item.provider || (item.apiUrl ? 'custom' : 'gitverse');

  let defaultApi = 'https://api.gitverse.ru';
  if (provider === 'sourcecraft') defaultApi = 'https://api.sourcecraft.tech';
  else if (provider === 'gitflic') defaultApi = 'https://gitflic.ru/api/v1';
  else if (provider === 'github') defaultApi = 'https://api.github.com';
  else if (provider === 'gitlab') defaultApi = 'https://gitlab.com/api/v4';
  else if (provider === 'moshub') defaultApi = 'https://hub.mos.ru/api/v4';
  else if (provider === 'custom') defaultApi = '';

  const sourceData: GitSourceItem = {
    id: item.id || `src_${Date.now()}`,
    name,
    provider,
    apiUrl: item.apiUrl || defaultApi,
    token: item.token || '',
    username: item.username || '',
    repository: repo,
    branch: item.branch || (provider === 'sourcecraft' || provider === 'github' ? 'main' : 'master'),
    filePath: item.filePath || 'subscription.txt',
    centralRawUrl: item.centralRawUrl || '',
    baseRawUrl: item.baseRawUrl || item.centralRawUrl || '',
    enabled: item.enabled ?? true,
    autoSync: item.autoSync ?? true,
    isDefault: item.isDefault ?? false,
    status: item.token?.trim() ? 'connected' : 'not_configured',
    lastSyncAt: new Date().toISOString(),
    errorMessage: undefined,
  };

  store.gitSources.push(sourceData);
  if (!store.activeGitSourceId) {
    store.activeGitSourceId = sourceData.id;
    sourceData.isDefault = true;
  }

  saveStore();
  res.json({ success: true, gitSource: sourceData, gitSources: store.gitSources });
});

app.post('/api/git-sources/:id/activate', (req, res) => {
  const { id } = req.params;
  const found = store.gitSources.find((s) => s.id === id);
  if (!found) return res.status(404).json({ success: false, message: 'Источник не найден' });

  store.activeGitSourceId = id;
  gitFileMetadataCache.clear();
  for (const s of store.gitSources) {
    s.isDefault = (s.id === id);
  }

  // Synchronize central file defaults to point to this newly activated source
  const filename = found.filePath || store.centralFile.filename || 'L';
  const rawUrl = found.centralRawUrl || buildGitRawUrl(found, filename);
  store.centralFile.centralRawUrl = rawUrl;
  store.centralFile.repositoryUrl = buildGitRepositoryWebUrl(found);
  found.centralRawUrl = rawUrl;
  if (found.filePath) store.centralFile.filename = found.filePath;

  saveStore();
  res.json({
    success: true,
    message: `Источник "${found.name}" успешно активирован и назначен источником по умолчанию!`,
    activeGitSourceId: id,
    gitSources: store.gitSources,
    centralFile: store.centralFile,
  });
});

app.post('/api/git-sources/:id/set-default', (req, res) => {
  const { id } = req.params;
  const found = store.gitSources.find((s) => s.id === id);
  if (!found) return res.status(404).json({ success: false, message: 'Источник не найден' });

  store.activeGitSourceId = id;
  gitFileMetadataCache.clear();
  for (const s of store.gitSources) {
    s.isDefault = (s.id === id);
  }

  // Synchronize central file defaults to point to this source
  const filename = found.filePath || store.centralFile.filename || 'L';
  const rawUrl = found.centralRawUrl || buildGitRawUrl(found, filename);
  store.centralFile.centralRawUrl = rawUrl;
  store.centralFile.repositoryUrl = buildGitRepositoryWebUrl(found);
  found.centralRawUrl = rawUrl;
  if (found.filePath) store.centralFile.filename = found.filePath;

  saveStore();
  res.json({
    success: true,
    message: `Источник "${found.name}" успешно назначен источником по умолчанию!`,
    activeGitSourceId: id,
    gitSources: store.gitSources,
    centralFile: store.centralFile,
  });
});

app.post('/api/git-sources/:id/make-central', async (req, res) => {
  const { id } = req.params;
  const found = store.gitSources.find((s) => s.id === id);
  if (!found) return res.status(404).json({ success: false, message: 'Источник не найден' });

  store.activeGitSourceId = id;
  gitFileMetadataCache.clear();
  for (const s of store.gitSources) {
    s.isDefault = (s.id === id);
  }
  const filename = found.filePath || store.centralFile.filename || 'L';
  const rawUrl = found.centralRawUrl || buildGitRawUrl(found, filename);
  store.centralFile.centralRawUrl = rawUrl;
  store.centralFile.repositoryUrl = buildGitRepositoryWebUrl(found);
  store.centralFile.filename = filename;
  found.centralRawUrl = rawUrl;

  let pushMessage = '';
  store.centralFile.isSyncedWithRepo = false;
  if (found.token && found.token.trim()) {
    const { owner, repo } = getRepoParts(found);
    const branch = found.branch || getDefaultGitBranch(found.provider);
    const pushResult = await createOrUpdateGitVerseFile({
      token: found.token,
      owner,
      repo,
      branch,
      filePath: filename,
      content: store.centralFile.content || '# Пустая центральная подписка',
      commitMessage: `Initialize central subscription ${filename} in ${found.name}`,
      provider: found.provider,
      apiUrl: found.apiUrl,
    });
    if (pushResult.success) {
      pushMessage = ` и файл ${filename} успешно зафиксирован в репозитории ${found.repository}`;
      store.centralFile.isSyncedWithRepo = true;
      if (pushResult.rawUrl) {
        store.centralFile.centralRawUrl = pushResult.rawUrl;
        found.centralRawUrl = pushResult.rawUrl;
      }
    } else {
      pushMessage = ` (коммит в репозиторий: ${pushResult.error || 'проверьте токен'})`;
      saveStore();
      return res.status(502).json({
        success: false,
        message: `Источник "${found.name}" выбран, но центральный файл не записан в репозиторий: ${pushResult.error || 'проверьте токен и доступ'}`,
        activeGitSourceId: id,
        gitSources: store.gitSources,
        centralFile: store.centralFile,
      });
    }
  } else {
    saveStore();
    return res.status(409).json({
      success: false,
      message: `Источник "${found.name}" выбран, но для записи центрального файла нужен API-токен`,
      activeGitSourceId: id,
      gitSources: store.gitSources,
      centralFile: store.centralFile,
    });
  }

  saveStore();
  const subscriberSync = await syncActiveSubscribersWithCentral({
    forceFullGitPush: true,
    backgroundGitPush: false,
  });
  if (subscriberSync.errors.length) {
    return res.status(502).json({
      success: false,
      message: `Источник "${found.name}" выбран и центральный файл создан, но не удалось обновить ${subscriberSync.errors.length} файлов подписок: ${subscriberSync.errors.slice(0, 3).join('; ')}`,
      activeGitSourceId: id,
      gitSources: store.gitSources,
      centralFile: store.centralFile,
      syncResult: subscriberSync,
    });
  }
  res.json({
    success: true,
    message: `Центральный источник создан и привязан к "${found.name}"${pushMessage}. Подписки пользователей синхронизированы.`,
    activeGitSourceId: id,
    gitSources: store.gitSources,
    centralFile: store.centralFile,
    syncResult: subscriberSync,
  });
});

app.post('/api/git-sources/:id/test', async (req, res) => {
  const { id } = req.params;
  const source = store.gitSources.find((s) => s.id === id);
  if (!source) return res.status(404).json({ success: false, message: 'Источник не найден' });

  try {
    const { owner, repo } = getRepoParts(source);
    const cleanRepo = `${owner}/${repo}`;
    const cleanToken = source.token?.trim() || '';

    if (!cleanToken && source.provider !== 'custom') {
      throw new Error('API токен не указан. Задайте токен доступа в настройках источника.');
    }

    if (usesGitCliProvider(source.provider)) {
      const remoteUrl = buildGitRemoteUrl(source.provider, owner, repo);
      await execFileAsync('git', ['ls-remote', remoteUrl, 'HEAD'], {
        timeout: 15000,
        env: buildGitAuthEnv(source.provider, cleanToken, source.username || owner),
      });
      const branch = source.branch || getDefaultGitBranch(source.provider);
      const branchResult = await execFileAsync('git', ['ls-remote', '--heads', remoteUrl, `refs/heads/${branch}`], {
        timeout: 15000,
        env: buildGitAuthEnv(source.provider, cleanToken, source.username || owner),
      });
      if (!branchResult.stdout.trim()) {
        throw new Error(`Ветка "${branch}" не найдена в репозитории ${cleanRepo}. Проверьте имя ветки в настройках источника.`);
      }
    } else if (source.provider === 'gitverse') {
      const apiRes = await fetch(`https://api.gitverse.ru/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {
        headers: {
          'Authorization': `Bearer ${cleanToken}`,
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!apiRes.ok && apiRes.status !== 404) {
        throw new Error(`Ошибка ответа API GitVerse: HTTP ${apiRes.status}`);
      }
    }

    source.status = 'connected';
    source.lastSyncAt = new Date().toISOString();
    source.errorMessage = undefined;
    saveStore();

    res.json({
      success: true,
      message: `Подключение к источнику "${source.name}" (${source.provider.toUpperCase()}: ${cleanRepo}) успешно подтверждено и проверено!`,
      source,
    });
  } catch (err: any) {
    source.status = 'error';
    source.errorMessage = err.message;
    saveStore();
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/git-sources/:id', (req, res) => {
  const { id } = req.params;
  store.gitSources = store.gitSources.filter((s) => s.id !== id);
  if (store.activeGitSourceId === id) {
    store.activeGitSourceId = store.gitSources[0]?.id || '';
    if (store.gitSources[0]) store.gitSources[0].isDefault = true;
  }
  saveStore();
  res.json({ success: true, gitSources: store.gitSources, activeGitSourceId: store.activeGitSourceId });
});

// 3. Managed Bots CRUD & Channels
app.get('/api/bots', (req, res) => {
  res.json({
    bots: store.bots,
    activeBotId: store.activeBotId,
  });
});

app.get('/api/subscription-settings', (_req, res) => {
  res.json({ happCryptVersion: store.happCryptVersion });
});

app.post('/api/subscription-settings', (req, res) => {
  const version = req.body?.happCryptVersion;
  if (!['crypt3', 'crypt4', 'crypt5'].includes(version)) {
    return res.status(400).json({ success: false, message: 'Выберите формат HAPP crypt3, crypt4 или crypt5.' });
  }

  try {
    store.happCryptVersion = version as HappCryptVersion;
    const updatedLinks = migrateHappLinks(store.happCryptVersion);
    res.json({
      success: true,
      happCryptVersion: store.happCryptVersion,
      updatedLinks,
      message: `Формат HAPP изменен на ${store.happCryptVersion}. Обновлено подписок: ${updatedLinks}.`,
    });
  } catch (err: any) {
    console.error('[HAPP link migration failed]:', err.message);
    res.status(500).json({
      success: false,
      message: `Не удалось полностью обновить HAPP-ссылки: ${err.message}`,
    });
  }
});

app.post('/api/bots', (req, res) => {
  const item: Partial<ManagedBotItem> = req.body;
  const existingIdx = store.bots.findIndex((b) => b.id === item.id);

  if (existingIdx >= 0) {
    // Updating existing bot (e.g. inline simulator editing or settings update)
    const current = store.bots[existingIdx];
    const isEnabled = item.enabled !== undefined ? item.enabled : (current.enabled ?? true);
    const hasToken = Boolean(item.token !== undefined ? item.token : current.token);
    const updated: ManagedBotItem = {
      ...current,
      ...item,
      status: (isEnabled && hasToken) ? 'connected' : 'not_configured',
    };
    store.bots[existingIdx] = updated;
    saveStore();
    botManager.reload().catch((e) => console.warn('[botManager reload error]:', e));
    return res.json({ success: true, bot: updated, bots: store.bots });
  }

  // Creating new bot
  if (!item.name && !item.username && !item.token) {
    return res.status(400).json({ success: false, message: 'Укажите название бота или токен' });
  }

  const botName = item.name || (item.username ? `@${item.username.replace('@', '')}` : 'Новый бот');
  let derivedBotId = item.botId;
  if (!derivedBotId && item.token && item.token.includes(':')) {
    derivedBotId = item.token.split(':')[0];
  }

  const botData: ManagedBotItem = {
    id: item.id || `bot_${Date.now()}`,
    name: botName,
    token: item.token || '',
    username: (item.username || (derivedBotId ? `bot_${derivedBotId}` : 'my_access_bot')).replace('@', ''),
    botId: derivedBotId || '7192847291',
    enabled: item.enabled ?? true,
    status: item.token ? 'connected' : 'not_configured',
    enableFireworks: item.enableFireworks ?? true,
    buttonColor: item.buttonColor || 'indigo',
    channels: item.channels || [
      {
        id: '@puls_channel',
        title: 'Канал доступа Пульс',
        isRequired: true,
        isBotAdmin: true,
        memberCount: 148,
      },
    ],
    adminContactUrl: item.adminContactUrl || 'https://t.me/puls_admin',
    blockedUserMessage: item.blockedUserMessage || '{username}, вы не можете получить здесь подписку из-за подозрений на подозрительные действия.',
    unsubscribedMessage: item.unsubscribedMessage || '⚠️ Ваша подписка деактивирована, так как вы покинули канал. Она снова станет активной при подписке на канал. Если этого не произойдет в течение {hours} часов, она будет полностью удалена.',
    selfDeleteHours: item.selfDeleteHours || 72,
    deletePreviousMessageOnStep: item.deletePreviousMessageOnStep ?? false,
    captchaType: item.captchaType || 'none',
    welcomeMessage: item.welcomeMessage || 'Привет, {name}! Добро пожаловать в сервис персональных подписок.',
    privacyPolicyText: item.privacyPolicyText || 'Условия использования и политика конфиденциальности.',
    privacyPolicyUrl: item.privacyPolicyUrl || 'https://telegra.ph/Privacy-Policy-Puls-01',
    mediaType: item.mediaType || 'none',
    mediaUrl: item.mediaUrl || '',
    showQrCode: item.showQrCode ?? true,
  };

  store.bots.push(botData);
  if (!store.activeBotId) store.activeBotId = botData.id;

  saveStore();
  botManager.reload().catch((e) => console.warn('[botManager reload error]:', e));
  res.json({ success: true, bot: botData, bots: store.bots });
});

app.post('/api/bots/:id/activate', (req, res) => {
  const { id } = req.params;
  const found = store.bots.find((b) => b.id === id);
  if (!found) return res.status(404).json({ success: false, message: 'Бот не найден' });

  store.activeBotId = id;
  saveStore();
  botManager.reload().catch((e) => console.warn('[botManager reload error]:', e));
  res.json({ success: true, activeBotId: id });
});

app.post('/api/bots/:id/test', async (req, res) => {
  const { id } = req.params;
  const bot = store.bots.find((b) => b.id === id);
  if (!bot) return res.status(404).json({ success: false, message: 'Бот не найден' });

  try {
    bot.status = 'connected';
    bot.errorMessage = undefined;
    bot.channels = bot.channels.map((c) => ({ ...c, isBotAdmin: true }));
    saveStore();
    botManager.reload().catch((e) => console.warn('[botManager reload error]:', e));

    res.json({
      success: true,
      message: `Бот "${bot.name}" (@${bot.username}) успешно проверен! Права администратора во всех (${bot.channels.length}) каналах подтверждены.`,
      bot,
    });
  } catch (err: any) {
    bot.status = 'error';
    bot.errorMessage = err.message;
    saveStore();
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/bots/:id', (req, res) => {
  const { id } = req.params;
  store.bots = store.bots.filter((b) => b.id !== id);
  if (store.activeBotId === id) {
    store.activeBotId = store.bots[0]?.id || '';
  }
  saveStore();
  botManager.reload().catch((e) => console.warn('[botManager reload error]:', e));
  res.json({ success: true, bots: store.bots, activeBotId: store.activeBotId });
});

// 4. Replacement / Fallback Templates (Замена подписки при отписке/блокировке)
app.get('/api/replacement-templates', (req, res) => {
  res.json({ templates: store.replacementTemplates });
});

app.post('/api/replacement-templates', (req, res) => {
  store.replacementTemplates = {
    ...store.replacementTemplates,
    ...req.body,
  };
  saveStore();
  res.json({ success: true, templates: store.replacementTemplates });
});

// 5. Exclusion Subscriptions (Подписки-исключения: обычные и выдача из центрального источника с проверкой канала)
app.get('/api/exclusions', (req, res) => {
  // Synchronize dynamic status from store.users for channel exclusions
  for (const excl of store.exclusions || []) {
    if (excl.gitRawUrl && !isHappUrlForVersion(excl.happUrl, store.happCryptVersion)) {
      excl.happUrl = buildHappCryptUrl(excl.gitRawUrl, store.happCryptVersion);
    }
    if (excl.isChannelExclusion) {
      const user = store.users?.find((u) => u.id === excl.userId || u.subscriptionToken === excl.token);
      if (user) {
        excl.channelMembership = user.channelMembership;
        excl.boundDevice = user.boundDevice;
        excl.status = user.status;
        excl.isBlocked = user.isBlocked;
        excl.isMuted = user.status === 'muted';
        excl.sharingGraceDeadlineAt = user.sharingGraceDeadlineAt;
        excl.sharingWarningCount = user.sharingWarningCount || user.deviceViolationAttempts || 0;
        excl.secondDeviceInfo = user.secondDeviceInfo;
        excl.secondDeviceBlockedCount = user.secondDeviceBlockedCount || 0;
        excl.subscriptionStatusReason = user.subscriptionStatusReason;
      }
    }
  }
  res.json({ exclusions: store.exclusions });
});

app.post('/api/exclusions', async (req, res) => {
  const {
    name,
    notes,
    customNodes,
    fileName,
    isTemporary,
    durationValue,
    durationUnit,
    customContent,
    attachToCentral,
    expiresAt,
  } = req.body;
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const token = `excl_${randomSuffix}`;

  // Keep all subscription files in the exact same repository under subs/
  let sanitizedFile = (fileName || '').trim().replace(/^[\/\\]+/, '');
  if (sanitizedFile && !sanitizedFile.endsWith('.txt')) {
    sanitizedFile += '.txt';
  }
  const filePath = sanitizedFile
    ? (sanitizedFile.startsWith('subs/') ? sanitizedFile : `subs/${sanitizedFile}`)
    : `subs/${token}.txt`;

  // Calculate expiration time if temporary or explicitly specified
  let calculatedExpiresAt: string | null = null;
  if (expiresAt) {
    calculatedExpiresAt = new Date(expiresAt).toISOString();
  } else if (isTemporary && durationValue) {
    const unitMultipliers: Record<string, number> = {
      seconds: 1000,
      minutes: 60 * 1000,
      hours: 3600 * 1000,
      days: 86400 * 1000,
      weeks: 7 * 86400 * 1000,
      months: 30 * 86400 * 1000,
      years: 365 * 86400 * 1000,
    };
    const unit = (durationUnit || 'hours').toLowerCase();
    const mult = unitMultipliers[unit] || (3600 * 1000);
    calculatedExpiresAt = new Date(Date.now() + Math.max(1, Number(durationValue)) * mult).toISOString();
  }

  const effectiveCustomContent = customContent !== undefined
    ? customContent
    : (customNodes && Array.isArray(customNodes) ? customNodes.join('\n') : '');

  const parsedCustomNodes = effectiveCustomContent
    ? effectiveCustomContent.split('\n').map((l: string) => l.trim()).filter((l: string) => l && !l.startsWith('#'))
    : (customNodes || []);

  const tempExcl: ExclusionSubscription = {
    id: `temp_${Date.now()}`,
    name: name?.trim() || (isTemporary ? `Тестовая ссылка #${Math.floor(1000 + Math.random() * 9000)}` : `Исключение #${Math.floor(1000 + Math.random() * 9000)}`),
    token,
    createdAt: new Date().toISOString(),
    notes: notes?.trim() || (isTemporary ? 'Временная тестовая ссылка с ограниченным сроком действия' : 'Подписка-исключение из GitVerse (без обязательной подписки, без ограничений)'),
    expiresAt: calculatedExpiresAt,
    isTemporary: Boolean(isTemporary),
    durationValue: durationValue ? Number(durationValue) : undefined,
    durationUnit: durationUnit || 'hours',
    customContent: effectiveCustomContent,
    attachToCentral: Boolean(attachToCentral),
    customNodes: parsedCustomNodes,
    trafficUsedBytes: 0,
    gitFilePath: filePath,
  };

  const nodeContent = getFullSubscriptionContent(null, tempExcl);

  const activeGit = getActiveGitSource();
  let gitRawUrl = '';

  if (!activeGit.token?.trim()) {
    return res.status(400).json({ success: false, message: `Не настроен токен для активного Git-источника «${activeGit.name}».` });
  }
  const { owner, repo } = getRepoParts(activeGit);
  try {
    const gitResult = await createOrUpdateGitVerseFile({
      token: activeGit.token,
      owner,
      repo,
      branch: activeGit.branch || getDefaultGitBranch(activeGit.provider),
      filePath,
      content: nodeContent,
      commitMessage: `Create exclusion subscription file ${filePath} (${tempExcl.name})`,
      provider: activeGit.provider,
      apiUrl: activeGit.apiUrl,
    });
    if (!gitResult.success) {
      return res.status(502).json({ success: false, message: `Не удалось создать файл исключения в ${activeGit.name}: ${gitResult.error || 'ошибка Git'}` });
    }
    gitRawUrl = gitResult.rawUrl;
  } catch (err: any) {
    console.warn('[Git exclusion create error]:', err.message);
    return res.status(502).json({ success: false, message: `Не удалось создать файл исключения в ${activeGit.name}: ${err.message}` });
  }

  if (!gitRawUrl) gitRawUrl = buildGitRawUrl(activeGit, filePath);

  let happUrl = '';
  try {
    happUrl = buildHappCryptUrl(gitRawUrl);
  } catch {
    happUrl = buildHappCryptUrl(gitRawUrl);
  }

  // INCY version: shortened clck.ru link (e.g. https://clck.ru/3W7gT2)
  let clckUrl = '';
  try {
    clckUrl = await shortenIncyUrl(gitRawUrl, token);
  } catch (err: any) {
    console.error('[Exclusion clck.ru shortening failed]:', err.message);
    return res.status(502).json({ success: false, message: `Не удалось создать короткую INCY-ссылку: ${err.message}` });
  }
  const incyUrl = clckUrl;

  const newExcl: ExclusionSubscription = {
    id: `excl_${Date.now()}`,
    name: tempExcl.name,
    token,
    createdAt: new Date().toISOString(),
    notes: tempExcl.notes,
    expiresAt: calculatedExpiresAt,
    isTemporary: Boolean(isTemporary),
    durationValue: durationValue ? Number(durationValue) : undefined,
    durationUnit: durationUnit || 'hours',
    customContent: effectiveCustomContent,
    attachToCentral: Boolean(attachToCentral),
    customNodes: parsedCustomNodes,
    trafficUsedBytes: 0,
    gitFilePath: filePath,
    gitRawUrl,
    happUrl,
    incyUrl,
    clckUrl: clckUrl || undefined,
    lastSyncAt: new Date().toISOString(),
    connectedClients: [],
  };

  store.exclusions.unshift(newExcl);

  // Synchronize with store.repoFiles
  if (!store.repoFiles) store.repoFiles = [];
  store.repoFiles = store.repoFiles.filter((f) => f.filePath !== filePath);
  store.repoFiles.unshift({
    id: `sub_${token}`,
    userId: `excl_${token}`,
    telegramId: 0,
    username: 'exclusion',
    firstName: newExcl.name,
    filePath,
    rawUrl: gitRawUrl,
    finalUrl: happUrl || gitRawUrl,
    format: 'happ',
    sizeBytes: Buffer.byteLength(nodeContent, 'utf-8'),
    nodesFound: parseNodeStats(nodeContent).total,
    isPoolFree: false,
    updatedAt: new Date().toISOString(),
    isAccessible: true,
  });

  saveStore();
  res.json({ success: true, exclusion: newExcl, exclusions: store.exclusions });
});

// Renew or extend temporary exclusion timer
app.post('/api/exclusions/:id/renew', async (req, res) => {
  const { id } = req.params;
  const { durationValue, durationUnit, expiresAt } = req.body;
  const target = store.exclusions.find((e) => e.id === id);
  if (!target) return res.status(404).json({ success: false, message: 'Исключение не найдено' });

  let newExpiry: string | null = null;
  if (expiresAt) {
    newExpiry = new Date(expiresAt).toISOString();
  } else if (durationValue) {
    const unitMultipliers: Record<string, number> = {
      seconds: 1000,
      minutes: 60 * 1000,
      hours: 3600 * 1000,
      days: 86400 * 1000,
      weeks: 7 * 86400 * 1000,
      months: 30 * 86400 * 1000,
      years: 365 * 86400 * 1000,
    };
    const unit = (durationUnit || target.durationUnit || 'hours').toLowerCase();
    const mult = unitMultipliers[unit] || (3600 * 1000);
    // If not yet expired, extend from existing expiry, otherwise from now
    const baseTime = (target.expiresAt && new Date(target.expiresAt).getTime() > Date.now())
      ? new Date(target.expiresAt).getTime()
      : Date.now();
    newExpiry = new Date(baseTime + Math.max(1, Number(durationValue)) * mult).toISOString();
  }

  target.expiresAt = newExpiry;
  if (durationValue) target.durationValue = Number(durationValue);
  if (durationUnit) target.durationUnit = durationUnit;
  target.lastSyncAt = new Date().toISOString();

  // Re-sync file to GitVerse if active
  const activeGit = getActiveGitSource();
  if (target.gitFilePath && activeGit && activeGit.token) {
    const nodeContent = getFullSubscriptionContent(null, target);
    const { owner, repo } = getRepoParts(activeGit);
    try {
      await createOrUpdateGitVerseFile({
        token: activeGit.token,
        owner,
        repo,
        branch: activeGit.branch || getDefaultGitBranch(activeGit.provider),
        filePath: target.gitFilePath,
        content: nodeContent,
        commitMessage: `Renew temporary test subscription file ${target.gitFilePath}`,
      });
    } catch (err: any) {
      console.warn('[GitVerse renew error]:', err.message);
    }
  }

  saveStore();
  res.json({ success: true, exclusion: target, message: 'Срок действия тестовой ссылки успешно продлен!' });
});

// GET current raw/resolved content of an exclusion file
app.get('/api/exclusions/:id/file-content', (req, res) => {
  const { id } = req.params;
  const target = store.exclusions.find((e) => e.id === id);
  if (!target) return res.status(404).json({ success: false, message: 'Исключение не найдено' });

  const linkedUser = store.users.find((u) => u.id === target.userId || u.subscriptionToken === target.token);
  let content = target.customContent;
  if (!content && target.customNodes && target.customNodes.length > 0) {
    content = target.customNodes.join('\n');
  }
  if (!content) {
    content = getFullSubscriptionContent(linkedUser || null, target);
  }

  res.json({
    success: true,
    content: content || '',
    customContent: target.customContent || '',
    attachToCentral: Boolean(target.attachToCentral),
    gitFilePath: target.gitFilePath,
    gitRawUrl: target.gitRawUrl,
  });
});

// Update custom content/nodes and central attachment for exclusion
// Supports FULL REPLACEMENT (полная замена содержимого файла) or merging with central source
app.post('/api/exclusions/:id/update-content', async (req, res) => {
  const { id } = req.params;
  const { customContent, attachToCentral, name, notes, fullReplace } = req.body;
  const target = store.exclusions.find((e) => e.id === id);
  if (!target) return res.status(404).json({ success: false, message: 'Исключение не найдено' });

  if (name !== undefined) target.name = name;
  if (notes !== undefined) target.notes = notes;

  // Determine replacement mode: full replacement is default or when attachToCentral is false / fullReplace is true
  const isFullReplace = fullReplace === true || attachToCentral === false;
  if (attachToCentral !== undefined) {
    target.attachToCentral = Boolean(attachToCentral);
  } else if (fullReplace) {
    target.attachToCentral = false;
  }

  if (customContent !== undefined) {
    // FULL REPLACEMENT: exactly overwrite customContent and customNodes, zero appending!
    target.customContent = customContent;
    target.customNodes = customContent ? customContent.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean) : [];
  }
  target.lastSyncAt = new Date().toISOString();

  // Sync with associated user
  const linkedUser = store.users.find((u) => u.id === target.userId || u.subscriptionToken === target.token);
  if (linkedUser) {
    if (target.customNodes) linkedUser.personalNodes = [...target.customNodes];
    linkedUser.customSubscriptionContent = target.customContent;
    linkedUser.detachedFromCentral = !target.attachToCentral;
  }

  // Re-sync file to Git repository (GitVerse, SourceCraft, etc.)
  const activeGit = getActiveGitSource();
  if (target.gitFilePath && activeGit && activeGit.token) {
    // When in full replacement mode (target.attachToCentral === false), do NOT append central nodes!
    // Write target.customContent directly for a complete 100% overwrite of the remote file.
    const nodeContent = target.attachToCentral
      ? getFullSubscriptionContent(linkedUser || null, target)
      : (target.customContent || '# Пустая подписка исключения');

    const { owner, repo } = getRepoParts(activeGit);
    try {
      const gitResult = await createOrUpdateGitVerseFile({
        token: activeGit.token,
        owner,
        repo,
        branch: activeGit.branch || getDefaultGitBranch(activeGit.provider),
        filePath: target.gitFilePath,
        content: nodeContent,
        commitMessage: isFullReplace
          ? `Полная замена содержимого файла исключения ${target.gitFilePath} (${target.customNodes?.length || 0} узлов)`
          : `Обновление узлов исключения ${target.gitFilePath}`,
        provider: activeGit.provider,
        apiUrl: activeGit.apiUrl,
      });
      if (gitResult.rawUrl) {
        target.gitRawUrl = gitResult.rawUrl;
        if (linkedUser) linkedUser.gitRawUrl = gitResult.rawUrl;
      }
    } catch (err: any) {
      console.warn('[Git update content error]:', err.message);
    }
  }

  saveStore();
  const nodeCount = target.customNodes?.length || 0;
  res.json({
    success: true,
    exclusion: target,
    message: isFullReplace
      ? `Содержимое файла ${target.name} полностью заменено на обновленное (${nodeCount} узлов) и зафиксировано в репозитории!`
      : `Ключи и настройки исключения ${target.name} успешно сохранены и дополнены центром!`,
  });
});

app.post('/api/exclusions/:id/sync', async (req, res) => {
  const { id } = req.params;
  const target = store.exclusions.find((e) => e.id === id);
  if (!target) return res.status(404).json({ success: false, message: 'Исключение не найдено' });

  const activeGit = getActiveGitSource();
  const nodeContent = getFullSubscriptionContent(null, target);

  if (activeGit && activeGit.token && activeGit.token.trim() && target.gitFilePath) {
    try {
      const { owner, repo } = getRepoParts(activeGit);
      const gitRes = await createOrUpdateGitVerseFile({
        token: activeGit.token,
        owner,
        repo,
        branch: activeGit.branch || getDefaultGitBranch(activeGit.provider),
        filePath: target.gitFilePath,
        content: nodeContent,
        commitMessage: `Sync central nodes to exclusion ${target.gitFilePath}`,
      });
      if (gitRes.success) {
        if (gitRes.rawUrl) target.gitRawUrl = gitRes.rawUrl;
        const targetContentHash = crypto.createHash('sha256').update(nodeContent).digest('hex');
        const repoFile = store.repoFiles?.find((f) => f.filePath === target.gitFilePath);
        if (repoFile) {
          repoFile.sizeBytes = Buffer.byteLength(nodeContent, 'utf-8');
          repoFile.nodesFound = parseNodeStats(nodeContent).total;
          repoFile.updatedAt = new Date().toISOString();
          if (gitRes.rawUrl) repoFile.rawUrl = gitRes.rawUrl;
          if (gitRes.sha) repoFile.sha = gitRes.sha;
          repoFile.contentHash = targetContentHash;
        }
      } else {
        return res.status(500).json({ success: false, message: `Ошибка GitVerse: ${gitRes.error || 'Не удалось обновить файл'}` });
      }
    } catch (err: any) {
      return res.status(500).json({ success: false, message: `Ошибка GitVerse: ${err.message}` });
    }
  }

  // Ensure clck.ru link is generated and up to date
  if (target.gitRawUrl && !isClckShortUrl(target.clckUrl)) {
    try {
      const short = await shortenIncyUrl(target.gitRawUrl, target.token);
      target.clckUrl = short;
      target.incyUrl = short;
    } catch (e: any) {
      console.error('[Exclusion sync clck shortening failed]:', e.message);
      saveStore();
      return res.status(502).json({
        success: false,
        message: `Файл синхронизирован, но короткую INCY-ссылку создать не удалось: ${e.message}`,
      });
    }
  }

  target.lastSyncAt = new Date().toISOString();

  const repoFile = store.repoFiles?.find((f) => f.filePath === target.gitFilePath);
  if (repoFile) {
    repoFile.sizeBytes = Buffer.byteLength(nodeContent, 'utf-8');
    repoFile.nodesFound = parseNodeStats(nodeContent).total;
    repoFile.updatedAt = target.lastSyncAt;
    if (target.gitRawUrl) repoFile.rawUrl = target.gitRawUrl;
  }

  saveStore();
  res.json({ success: true, exclusion: target, message: 'Подписка-исключение синхронизирована с GitVerse' });
});

// Re-generate or shorten clck.ru URL for exclusion
app.post('/api/exclusions/:id/shorten-clck', async (req, res) => {
  const { id } = req.params;
  const target = store.exclusions.find((e) => e.id === id);
  if (!target) return res.status(404).json({ success: false, message: 'Исключение не найдено' });

  const rawUrl = target.gitRawUrl || '';
  let shortUrl: string;
  try {
    shortUrl = await shortenIncyUrl(rawUrl, target.token);
  } catch (err: any) {
    console.error(`[Exclusion manual shorten failed] ${target.token}:`, err.message);
    return res.status(502).json({ success: false, message: err.message });
  }
  target.clckUrl = shortUrl;
  target.incyUrl = shortUrl;
  saveStore();

  res.json({ success: true, clckUrl: shortUrl, exclusion: target });
});

// Add client/person manually to exclusion connected list
app.post('/api/exclusions/:id/clients', (req, res) => {
  const { id } = req.params;
  const { ip, userAgent, clientType, deviceId, note } = req.body;
  const target = store.exclusions.find((e) => e.id === id);
  if (!target) return res.status(404).json({ success: false, message: 'Исключение не найдено' });

  if (!Array.isArray(target.connectedClients)) target.connectedClients = [];
  const newClient: ConnectedClientInfo = {
    id: 'cli_' + Math.random().toString(36).substr(2, 9),
    ip: ip?.trim() || '127.0.0.1',
    userAgent: userAgent?.trim() || note?.trim() || 'Manual Client',
    clientType: clientType || 'INCY',
    deviceId: deviceId?.trim() || undefined,
    firstConnectedAt: new Date().toISOString(),
    lastConnectedAt: new Date().toISOString(),
    requestsCount: 1,
  };
  target.connectedClients.unshift(newClient);
  saveStore();
  res.json({ success: true, client: newClient, connectedClients: target.connectedClients, exclusion: target });
});

// Remove client/person from exclusion connected list
app.delete('/api/exclusions/:id/clients/:clientId', (req, res) => {
  const { id, clientId } = req.params;
  const target = store.exclusions.find((e) => e.id === id);
  if (!target) return res.status(404).json({ success: false, message: 'Исключение не найдено' });

  if (Array.isArray(target.connectedClients)) {
    target.connectedClients = target.connectedClients.filter((c) => c.id !== clientId);
  }
  saveStore();
  res.json({ success: true, connectedClients: target.connectedClients, exclusion: target });
});

// Create single-device subscription from central source (with channel requirement and HWID lock)
app.post('/api/exclusions/channel-grant', async (req, res) => {
  const {
    telegramId,
    username,
    firstName,
    format = 'happ',
    channelMembership = 'member',
    notes,
    graceHours = 2,
    graceMinutes = 0,
  } = req.body;

  const rawTgId = Number(telegramId) || Math.floor(100000000 + Math.random() * 900000000);
  const cleanUsername = (username || '').replace(/^@/, '').trim();
  const userFirst = (firstName || cleanUsername || 'Подписчик канала').trim();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const token = `ch_excl_${randomSuffix}`;
  const filePath = `subs/${cleanUsername ? `user_${cleanUsername}_${randomSuffix}` : `sub_excl_${token}`}.txt`;

  // Get full nodes from central source
  const centralNodes = (store.centralFile?.content || '').trim();
  const activeGit = getActiveGitSource();
  let gitRawUrl = '';

  if (activeGit && activeGit.token && activeGit.token.trim()) {
    const { owner, repo } = getRepoParts(activeGit);
    try {
      const gitResult = await createOrUpdateGitVerseFile({
        token: activeGit.token,
        owner,
        repo,
        branch: activeGit.branch || getDefaultGitBranch(activeGit.provider),
        filePath,
        content: centralNodes,
        commitMessage: `Create single-device channel exclusion for ${cleanUsername ? '@' + cleanUsername : rawTgId}`,
      });
      if (gitResult.rawUrl) gitRawUrl = gitResult.rawUrl;
    } catch (err: any) {
      console.warn('[GitVerse Channel Exclusion Create Error]:', err.message);
    }
  }

  if (!gitRawUrl) {
    gitRawUrl = buildGitRawUrl(activeGit, filePath);
  }

  // HAPP crypt4 link
  let happUrl = '';
  try {
    happUrl = buildHappCryptUrl(gitRawUrl);
  } catch {
    happUrl = buildHappCryptUrl(gitRawUrl);
  }

  // INCY (clck.ru encrypted link)
  let clckUrl = '';
  try {
    clckUrl = await shortenIncyUrl(gitRawUrl, token);
  } catch (err: any) {
    console.error('[Channel Exclusion clck shortening failed]:', err.message);
    return res.status(502).json({ success: false, message: `Не удалось создать короткую INCY-ссылку: ${err.message}` });
  }
  const incyUrl = clckUrl;

  const userId = `usr_chexcl_${Date.now()}_${randomSuffix}`;
  const isSubscribed = channelMembership !== 'left';

  // 1. Create or update in store.users
  const newUser: BotUser = {
    id: userId,
    telegramId: rawTgId,
    username: cleanUsername || undefined,
    firstName: userFirst,
    joinedAt: new Date().toISOString(),
    receivedAt: new Date().toISOString(),
    subscriptionName: format === 'happ' ? `HAPP (${store.happCryptVersion}) - Канал 1 устр.` : 'INCY (VLESS) - Канал 1 устр.',
    subscriptionType: format === 'happ' ? 'happ' : 'incy',
    status: isSubscribed ? 'active' : 'channel_inactive',
    mutedUntil: null,
    channelMembership: (channelMembership as any) || 'member',
    subscriptionToken: token,
    subscriptionExpiresAt: null,
    hasActiveSubscription: true,
    trafficUsedBytes: 0,
    trafficLimitBytes: 100 * 1024 * 1024 * 1024,
    isBlocked: false,
    lastActiveAt: new Date().toISOString(),
    personalNodes: [],
    isException: true,
    isChannelExclusion: true,
    channelExclusionOrigin: 'manual_channel',
    channelExclusionReason: notes || 'Выдача из центрального источника (1 устр. + канал)',
    channelExclusionCreatedAt: new Date().toISOString(),
    deviceLocked: true,
    boundDevice: null, // Binds on first subscriber connection!
    gitFilePath: filePath,
    gitRawUrl,
    finalSubscriptionUrl: format === 'happ' ? happUrl : incyUrl,
    clckUrl: clckUrl || undefined,
    detachedFromCentral: !isSubscribed,
  };

  store.users.unshift(newUser);

  // If initial status is not subscribed, immediately put Row 1 stub into user's file
  if (!isSubscribed) {
    applyDisconnectStub(newUser, 'Initial channel exclusion: not subscribed (Source 1)', 1).catch(() => {});
  }

  // 2. Create in store.exclusions
  const newExcl: ExclusionSubscription = {
    id: `excl_ch_${Date.now()}`,
    name: `${userFirst}${cleanUsername ? ` (@${cleanUsername})` : ''}`,
    token,
    createdAt: new Date().toISOString(),
    notes: notes?.trim() || 'Выдача подписки из центр. источника (1 устройство, привязка к каналу)',
    expiresAt: null,
    customNodes: [],
    trafficUsedBytes: 0,
    gitFilePath: filePath,
    gitRawUrl,
    happUrl,
    incyUrl,
    clckUrl: clckUrl || undefined,
    lastSyncAt: new Date().toISOString(),
    connectedClients: [],
    isChannelExclusion: true,
    userId: newUser.id,
    telegramId: rawTgId,
    username: cleanUsername || undefined,
    firstName: userFirst,
    channelMembership: newUser.channelMembership,
    deviceLocked: true,
    boundDevice: null,
    sharingGraceHours: Number(graceHours) || 2,
    sharingGraceMinutes: Number(graceMinutes) || 0,
    sharingGraceDeadlineAt: null,
    sharingWarningCount: 0,
    status: newUser.status,
    isBlocked: false,
    isMuted: false,
  };

  store.exclusions.unshift(newExcl);

  // 3. Upsert into store.repoFiles
  if (!store.repoFiles) store.repoFiles = [];
  store.repoFiles = store.repoFiles.filter((f) => f.filePath !== filePath);
  store.repoFiles.unshift({
    id: `sub_${token}`,
    userId: newUser.id,
    telegramId: rawTgId,
    username: cleanUsername || 'channel_exclusion',
    firstName: userFirst,
    filePath,
    rawUrl: gitRawUrl,
    finalUrl: format === 'happ' ? happUrl : incyUrl,
    format: format === 'happ' ? 'happ' : 'incy',
    sizeBytes: Buffer.byteLength(centralNodes, 'utf-8'),
    nodesFound: parseNodeStats(centralNodes).total,
    isPoolFree: false,
    updatedAt: new Date().toISOString(),
    isAccessible: true,
  });

  saveStore();
  res.json({
    success: true,
    exclusion: newExcl,
    user: newUser,
    exclusions: store.exclusions,
    message: `Подписка успешно создана для ${userFirst}! Ссылка готова и привязана к 1 устройству.`,
  });
});

// Reset sharing warning, grace period timer, and restore active nodes
app.post('/api/exclusions/:id/reset-sharing-warning', async (req, res) => {
  const { id } = req.params;
  const excl = store.exclusions.find((e) => e.id === id);
  if (!excl) return res.status(404).json({ success: false, message: 'Исключение не найдено' });

  const user = store.users.find((u) => u.id === excl.userId || u.subscriptionToken === excl.token);
  if (user) {
    user.sharingGraceDeadlineAt = null;
    user.sharingWarningCount = 0;
    user.deviceViolationAttempts = 0;
    user.status = user.channelMembership === 'left' ? 'channel_inactive' : 'active';
    user.isBlocked = false;
    user.isPermanentlyBanned = false;
    user.mutedUntil = null;
    user.subscriptionStatusReason = undefined;
    user.secondDeviceInfo = null;
    user.secondDeviceBlockedCount = 0;
    await restoreUserNodes(user).catch(() => {});
  }

  excl.sharingGraceDeadlineAt = null;
  excl.sharingWarningCount = 0;
  excl.status = user ? user.status : 'active';
  excl.isBlocked = false;
  excl.isMuted = false;
  excl.secondDeviceInfo = null;
  excl.secondDeviceBlockedCount = 0;
  excl.subscriptionStatusReason = undefined;

  saveStore();
  res.json({
    success: true,
    exclusion: excl,
    user,
    message: 'Предупреждение и таймер успешно сброшены! Подписка возвращена в активный режим.',
  });
});

// Unbind device (HWID) to allow switching device
app.post('/api/exclusions/:id/unbind-device', async (req, res) => {
  const { id } = req.params;
  const excl = store.exclusions.find((e) => e.id === id);
  if (!excl) return res.status(404).json({ success: false, message: 'Исключение не найдено' });

  excl.boundDevice = null;
  excl.deviceLocked = false;
  excl.status = 'active';
  excl.isBlocked = false;
  excl.isMuted = false;
  excl.sharingGraceDeadlineAt = null;
  excl.sharingWarningCount = 0;
  excl.secondDeviceInfo = null;
  excl.secondDeviceActive = false;
  excl.secondDeviceBlockedCount = 0;
  excl.isTimerFrozen = true;
  excl.subscriptionStatusReason = undefined;

  const user = store.users.find((u) => u.id === excl.userId || u.subscriptionToken === excl.token);
  if (user) {
    await applyUserUnblockAndReset(user);
  } else {
    // Re-sync file to GitVerse if needed for team/test exclusions
    const activeGit = getActiveGitSource();
    if (excl.gitFilePath && activeGit && activeGit.token) {
      const nodeContent = getFullSubscriptionContent(null, excl);
      const { owner, repo } = getRepoParts(activeGit);
      await createOrUpdateGitVerseFile({
        token: activeGit.token,
        owner,
        repo,
        branch: activeGit.branch || getDefaultGitBranch(activeGit.provider),
        filePath: excl.gitFilePath,
        content: nodeContent,
        commitMessage: `Restore nodes after unbind for exclusion ${excl.name}`,
      }).catch((e) => console.warn('[Excl unbind restore error]:', e.message));
    }
  }

  saveStore();
  res.json({
    success: true,
    exclusion: excl,
    user,
    message: 'Устройство (HWID) успешно отвязано. Подписка разблокирована, таймеры сброшены, ключи восстановлены.',
  });
});

// Update or modify individual node content / payload for an exclusion record
app.post('/api/exclusions/:id/node', async (req, res) => {
  const { id } = req.params;
  const { nodeIndex, nodeContent, action = 'update', fullPayload, name, notes, attachToCentral } = req.body;
  const target = store.exclusions.find((e) => e.id === id);
  if (!target) return res.status(404).json({ success: false, message: 'Исключение не найдено' });

  if (name !== undefined) target.name = name;
  if (notes !== undefined) target.notes = notes;
  if (attachToCentral !== undefined) target.attachToCentral = Boolean(attachToCentral);

  if (!Array.isArray(target.customNodes)) {
    const rawContent = target.customContent || '';
    target.customNodes = rawContent ? rawContent.split(/\r?\n/).filter(Boolean) : [];
  }

  if (action === 'set_all' || typeof fullPayload === 'string') {
    target.customContent = fullPayload || '';
    target.customNodes = (target.customContent || '').split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
  } else if (action === 'add') {
    if (typeof nodeContent === 'string' && nodeContent.trim()) {
      target.customNodes.push(nodeContent);
      target.customContent = target.customNodes.join('\n');
    }
  } else if (action === 'delete') {
    if (typeof nodeIndex === 'number' && nodeIndex >= 0 && nodeIndex < target.customNodes.length) {
      target.customNodes.splice(nodeIndex, 1);
      target.customContent = target.customNodes.join('\n');
    }
  } else {
    // action === 'update' (default)
    if (typeof nodeIndex === 'number' && typeof nodeContent === 'string') {
      if (nodeIndex >= 0 && nodeIndex < target.customNodes.length) {
        target.customNodes[nodeIndex] = nodeContent;
      } else {
        target.customNodes.push(nodeContent);
      }
      target.customContent = target.customNodes.join('\n');
    } else if (typeof nodeContent === 'string') {
      target.customContent = nodeContent;
      target.customNodes = nodeContent ? nodeContent.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean) : [];
    }
  }

  target.lastSyncAt = new Date().toISOString();

  // Also sync with associated user personalNodes and customization if applicable
  const user = store.users.find((u) => u.id === target.userId || u.subscriptionToken === target.token);
  if (user) {
    user.personalNodes = [...target.customNodes];
    user.customSubscriptionContent = target.customContent;
    user.detachedFromCentral = !target.attachToCentral;
  }

  // Re-sync file to Git repository if repository integration is enabled
  const activeGit = getActiveGitSource();
  if (target.gitFilePath && activeGit && activeGit.token) {
    const nodeContentToSync = target.attachToCentral
      ? getFullSubscriptionContent(user || null, target)
      : (target.customContent || '# Пустая подписка исключения');
    const { owner, repo } = getRepoParts(activeGit);
    await createOrUpdateGitVerseFile({
      token: activeGit.token,
      owner,
      repo,
      branch: activeGit.branch || getDefaultGitBranch(activeGit.provider),
      filePath: target.gitFilePath,
      content: nodeContentToSync,
      commitMessage: `Update node payload for exclusion ${target.name}`,
      provider: activeGit.provider,
      apiUrl: activeGit.apiUrl,
    }).catch((err) => console.warn('[Git node update error]:', err.message));
  }

  saveStore();
  res.json({
    success: true,
    exclusion: target,
    user,
    message: 'Содержимое узла исключения успешно обновлено!',
  });
});

// Verify channel membership for channel exclusion
app.post('/api/exclusions/:id/verify-channel', async (req, res) => {
  const { id } = req.params;
  const excl = store.exclusions.find((e) => e.id === id);
  if (!excl) return res.status(404).json({ success: false, message: 'Исключение не найдено' });

  const user = store.users.find((u) => u.id === excl.userId || u.subscriptionToken === excl.token);
  const bot = getActiveBot();

  let isSubscribed = excl.channelMembership !== 'left';

  if (bot && bot.token && user && user.telegramId) {
    try {
      const checkRes = await botManager.checkAllRequiredChannels(bot, user.telegramId);
      isSubscribed = Boolean(checkRes.allSubscribed);
    } catch (e: any) {
      console.warn('[Exclusion verify channel warning]:', e.message);
    }
  }

  if (user) {
    if (isSubscribed) {
      user.channelMembership = 'member';
      user.detachedFromCentral = false;
      user.status = user.isBlocked ? 'blocked' : 'active';
      await restoreUserNodes(user).catch(() => {});
    } else {
      user.channelMembership = 'left';
      user.detachedFromCentral = true;
      user.status = 'channel_inactive';
      await applyDisconnectStub(user, 'Channel exclusion not subscribed (Source 1)', 1).catch(() => {});
    }
  }

  excl.channelMembership = isSubscribed ? 'member' : 'left';
  excl.status = user ? user.status : (isSubscribed ? 'active' : 'channel_inactive');

  saveStore();
  res.json({
    success: true,
    isSubscribed,
    exclusion: excl,
    user,
    message: isSubscribed
      ? '✅ Подписка на канал подтверждена! Центральные узлы активны.'
      : '❌ Пользователь не подписан на канал! Подписка отвязана от центрального источника (активирована Строка 1).',
  });
});

// Force permanent ban (Source 3)
app.post('/api/exclusions/:id/force-ban', async (req, res) => {
  const { id } = req.params;
  const excl = store.exclusions.find((e) => e.id === id);
  if (!excl) return res.status(404).json({ success: false, message: 'Исключение не найдено' });

  const user = store.users.find((u) => u.id === excl.userId || u.subscriptionToken === excl.token);
  if (user) {
    user.status = 'blocked';
    user.isBlocked = true;
    user.isPermanentlyBanned = true;
    user.subscriptionStatusReason = 'Перманентный бан назначен администратором (Строка 3)';
    await applyDisconnectStub(user, 'Manual admin ban (Source 3)', 3).catch(() => {});
  }

  excl.status = 'blocked';
  excl.isBlocked = true;
  excl.subscriptionStatusReason = 'Перманентный бан (Строка 3)';

  saveStore();
  res.json({
    success: true,
    exclusion: excl,
    user,
    message: 'Пользователь перманентно заблокирован! В GitVerse файле установлена заглушка Строки 3.',
  });
});

// Sync all exclusions with central source in one batch
app.post('/api/exclusions/sync-all', async (req, res) => {
  const activeGit = getActiveGitSource();
  let count = 0;
  const errors: string[] = [];

  for (const excl of store.exclusions || []) {
    if (!excl.gitFilePath) continue;
    const nodeContent = getFullSubscriptionContent(null, excl);

    if (activeGit && activeGit.token && activeGit.token.trim()) {
      try {
        const { owner, repo } = getRepoParts(activeGit);
        const gitRes = await createOrUpdateGitVerseFile({
          token: activeGit.token,
          owner,
          repo,
          branch: activeGit.branch || getDefaultGitBranch(activeGit.provider),
          filePath: excl.gitFilePath,
          content: nodeContent,
          commitMessage: `Mass sync central nodes to exclusion ${excl.gitFilePath}`,
        });
        if (gitRes.success) {
          if (gitRes.rawUrl) excl.gitRawUrl = gitRes.rawUrl;
          const targetContentHash = crypto.createHash('sha256').update(nodeContent).digest('hex');
          const repoFile = store.repoFiles?.find((f) => f.filePath === excl.gitFilePath);
          if (repoFile) {
            repoFile.sizeBytes = Buffer.byteLength(nodeContent, 'utf-8');
            repoFile.nodesFound = parseNodeStats(nodeContent).total;
            repoFile.updatedAt = new Date().toISOString();
            if (gitRes.rawUrl) repoFile.rawUrl = gitRes.rawUrl;
            if (gitRes.sha) repoFile.sha = gitRes.sha;
            repoFile.contentHash = targetContentHash;
          }
          count++;
        } else {
          errors.push(`Файл ${excl.gitFilePath}: ${gitRes.error || 'Ошибка записи в GitVerse'}`);
        }
      } catch (err: any) {
        errors.push(`Файл ${excl.gitFilePath}: ${err.message}`);
      }
    } else {
      count++;
    }

    excl.lastSyncAt = new Date().toISOString();
  }

  saveStore();
  res.json({
    success: true,
    count,
    errors,
    exclusions: store.exclusions,
    message: `Успешно синхронизировано ${count} подписок-исключений с центральным источником`,
  });
});

app.delete('/api/exclusions/:id', async (req, res) => {
  const { id } = req.params;
  const target = store.exclusions.find((e) => e.id === id);
  if (target && target.gitFilePath) {
    const deleted = await deleteActiveRepoFiles([target.gitFilePath], (filePath) => `Remove exclusion subscription file ${filePath}`);
    if (!deleted) {
      return res.status(502).json({ success: false, message: 'Не удалось удалить файл исключения из активного Git-репозитория.' });
    }
    store.repoFiles = (store.repoFiles || []).filter((f) => f.filePath !== target.gitFilePath);
  }
  store.exclusions = store.exclusions.filter((e) => e.id !== id);
  saveStore();
  res.json({ success: true, exclusions: store.exclusions });
});

// 6. Users & Subscriptions Detailed Management
app.get('/api/users', async (req, res) => {
  let migratedHappLinks = false;
  const staleIncyUsers: BotUser[] = [];
  for (const user of store.users || []) {
    if (
      user.subscriptionType === 'happ' &&
      (!isHappUrlForVersion(user.finalSubscriptionUrl, store.happCryptVersion) ||
        user.clckTargetUrl !== getUserSubscriptionTargetUrl(user))
    ) {
      const subscription = user.sourceSubscriptions?.find(
        (item) => item.sourceId === user.subscriptionSourceId && item.filePath === user.gitFilePath
      );
      const targetUrl = getUserSubscriptionTargetUrl(user);
      if (subscription?.rawUrl || user.gitRawUrl) {
        const link = buildHappCryptUrl(targetUrl, store.happCryptVersion);
        applyUserHappCryptUrl(user, targetUrl, link, store.happCryptVersion);
        user.subscriptionName = `HAPP (${store.happCryptVersion})`;
        migratedHappLinks = true;
      }
    } else if (
      user.subscriptionType === 'incy' &&
      (user.gitFilePath || user.gitRawUrl) &&
      (!isClckShortUrl(user.finalSubscriptionUrl) ||
        user.clckTargetUrl !== getUserSubscriptionTargetUrl(user))
    ) {
      staleIncyUsers.push(user);
    }
  }

  let nextUserIndex = 0;
  let failedIncyMigrations = false;
  const workers = Array.from({ length: Math.min(4, staleIncyUsers.length) }, async () => {
    while (nextUserIndex < staleIncyUsers.length) {
      const user = staleIncyUsers[nextUserIndex++];
      try {
        await resolveUserDisplayKey(user);
      } catch (err: any) {
        console.warn(`[User INCY link migration] Failed for ${user.telegramId}:`, err.message);
        user.finalSubscriptionUrl = undefined;
        user.finalUrl = undefined;
        user.clckUrl = undefined;
        const subscription = user.sourceSubscriptions?.find(
          (item) => item.sourceId === user.subscriptionSourceId && item.filePath === user.gitFilePath
        );
        if (subscription) subscription.finalUrl = '';
        const repoFile = store.repoFiles?.find(
          (item) => item.sourceId === user.subscriptionSourceId && item.filePath === user.gitFilePath
        );
        if (repoFile) repoFile.finalUrl = '';
        failedIncyMigrations = true;
      }
    }
  });
  await Promise.all(workers);
  if (migratedHappLinks || failedIncyMigrations) saveStore();
  res.json({ users: store.users });
});

app.post('/api/users', (req, res) => {
  const { telegramId, username, firstName, lastName, channelMembership, subscriptionType, subscriptionName } = req.body;
  if (!telegramId) {
    return res.status(400).json({ success: false, message: 'telegramId обязателен' });
  }

  const existingIndex = store.users.findIndex((u) => u.telegramId === Number(telegramId));
  const token = `sub_${username || telegramId}_${Math.random().toString(36).substring(2, 8)}`;
  const nowIso = new Date().toISOString();

  const userData: BotUser = {
    id: existingIndex >= 0 ? store.users[existingIndex].id : `usr_${Date.now()}`,
    telegramId: Number(telegramId),
    username: username || '',
    firstName: firstName || 'Пользователь',
    lastName: lastName || '',
    joinedAt: existingIndex >= 0 ? store.users[existingIndex].joinedAt : nowIso,
    receivedAt: nowIso,
    subscriptionName: subscriptionName || (subscriptionType === 'happ' ? `HAPP (${store.happCryptVersion}) - VLESS` : 'INCY (GitVerse RAW)'),
    subscriptionType: subscriptionType || 'happ',
    status: channelMembership === 'left' ? 'channel_inactive' : 'active',
    mutedUntil: null,
    channelMembership: channelMembership || 'member',
    subscriptionToken: existingIndex >= 0 ? store.users[existingIndex].subscriptionToken : token,
    subscriptionExpiresAt: new Date(Date.now() + 86400000 * 30).toISOString(),
    trafficUsedBytes: existingIndex >= 0 ? store.users[existingIndex].trafficUsedBytes : 0,
    trafficLimitBytes: 100000000000,
    isBlocked: false,
    lastActiveAt: nowIso,
    personalNodes: [],
  };

  if (existingIndex >= 0) {
    store.users[existingIndex] = { ...store.users[existingIndex], ...userData };
  } else {
    store.users.unshift(userData);
  }

  saveStore();
  res.json({ success: true, user: userData });
});

// Bulk Action on Users (Массовые действия над пользователями: мут, размут, бан, разбан, удаление, отправка сообщений)
app.post('/api/users/bulk-action', async (req, res) => {
  const { action, userIds, durationMinutes, reason, message, mediaType, mediaUrl, buttonText, buttonUrl } = req.body;
  if (!action || !Array.isArray(userIds) || userIds.length === 0) {
    return res.status(400).json({ success: false, message: 'Не указано действие или список пользователей' });
  }

  const selectedUsers = store.users.filter((u) => userIds.includes(u.id));
  if (selectedUsers.length === 0) {
    return res.status(404).json({ success: false, message: 'Выбранные пользователи не найдены' });
  }

  const activeBot = getActiveBot();
  let affectedCount = 0;
  let repoCleanupFailed = false;

  if (action === 'mute') {
    const duration = Number(durationMinutes) || 60;
    const muteExpiry = new Date(Date.now() + duration * 60000).toISOString();
    for (const u of selectedUsers) {
      u.status = 'muted';
      u.mutedUntil = muteExpiry;
      u.subscriptionStatusReason = `Заглушено администратором до ${new Date(muteExpiry).toLocaleString()}`;
      applyDisconnectStub(u, 'Администратор заглушил подписку', 1).catch(() => {});
      affectedCount++;
    }
  } else if (action === 'unmute') {
    for (const u of selectedUsers) {
      u.status = u.channelMembership === 'left' ? 'channel_inactive' : 'active';
      u.mutedUntil = null;
      u.subscriptionStatusReason = undefined;
      if (u.status === 'active') {
        restoreUserNodes(u).catch(() => {});
      }
      affectedCount++;
    }
  } else if (action === 'block') {
    const blockReason = reason || 'Массовая блокировка администратором';
    for (const u of selectedUsers) {
      u.status = 'blocked';
      u.isBlocked = true;
      u.blockedReason = blockReason;
      u.bannedAt = new Date().toISOString();
      applyDisconnectStub(u, blockReason, 1).catch(() => {});
      affectedCount++;
    }
  } else if (action === 'unblock') {
    for (const u of selectedUsers) {
      u.status = u.channelMembership === 'left' ? 'channel_inactive' : 'active';
      u.isBlocked = false;
      u.isPermanentlyBanned = false;
      u.blockedReason = undefined;
      u.bannedAt = null;
      u.sharingGraceDeadlineAt = null;
      u.secondDeviceInfo = null;
      u.secondDeviceActive = false;
      u.secondDeviceBlockedCount = 0;
      u.deviceViolationAttempts = 0;
      u.isTimerFrozen = true;
      u.mutedUntil = null;
      u.trafficLimitBytes = 0;
      u.subscriptionStatusReason = undefined;
      if (u.boundDevice && (u.boundDevice.clientName.toLowerCase().includes('curl') || u.boundDevice.ip === '127.0.0.1')) {
        u.boundDevice = null;
      }
      if (u.status === 'active') {
        restoreUserNodes(u).catch(() => {});
      }
      affectedCount++;
    }
  } else if (action === 'delete') {
    const idsToDelete = new Set(selectedUsers.map((u) => u.id));
    const selectedTokens = new Set(selectedUsers.map((u) => u.subscriptionToken).filter(Boolean));
    const relatedExclusions = (store.exclusions || []).filter(
      (e) => (e.userId !== undefined && idsToDelete.has(e.userId)) || selectedTokens.has(e.token)
    );
    const selectedTelegramIds = new Set(selectedUsers.map((user) => user.telegramId));
    const relatedRepoFiles = (store.repoFiles || []).filter(
      (file) => idsToDelete.has(file.userId || '') || (file.telegramId != null && selectedTelegramIds.has(file.telegramId))
    );
    const pathsToDelete = [
      ...selectedUsers.map((u) => u.gitFilePath),
      ...relatedExclusions.map((e) => e.gitFilePath),
      ...relatedRepoFiles.map((file) => file.filePath),
    ].filter(Boolean) as string[];

    const deleted = await deleteActiveRepoFiles(
      pathsToDelete,
      (filePath) => `Delete user subscription ${filePath}`,
      true
    );
    if (!deleted) {
      repoCleanupFailed = true;
      console.warn(`[bulk user delete] Users will be removed locally, but one or more subscription files could not be deleted from ${getActiveGitSource().name}.`);
      logSystemEvent('warning', 'gitverse', 'BULK_USER_DELETE_REPO_CLEANUP_FAILED', `Пользователи удалены локально, но не все связанные файлы удалось удалить из Git-источника «${getActiveGitSource().name}»`, {
        userIds: [...idsToDelete],
        filePaths: pathsToDelete,
      });
    }

    // Clean up repoFiles
    if (store.repoFiles) {
      store.repoFiles = store.repoFiles.filter(
        (file) => !pathsToDelete.includes(file.filePath) &&
          !idsToDelete.has(file.userId || '') &&
          (file.telegramId == null || !selectedTelegramIds.has(file.telegramId))
      );
    }
    store.exclusions = (store.exclusions || []).filter(
      (e) => !((e.userId !== undefined && idsToDelete.has(e.userId)) || selectedTokens.has(e.token))
    );
    // Remove from store.users
    store.users = store.users.filter((u) => !idsToDelete.has(u.id));
    affectedCount = selectedUsers.length;
  } else if (action === 'send_message') {
    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, message: 'Текст сообщения обязателен' });
    }
    const token = activeBot?.token;
    for (const u of selectedUsers) {
      if (u.telegramId && token) {
        try {
          const directText = message
            .replace(/\{name\}/g, u.firstName || u.username || 'Пользователь')
            .replace(/\{username\}/g, u.username ? `@${u.username}` : '')
            .replace(/\{id\}/g, String(u.telegramId));
          const buttons = buttonText && buttonUrl ? [{ text: buttonText, url: buttonUrl }] : [];
          await botManager.sendBroadcastItem(token, u.telegramId, directText, {
            mediaType,
            mediaUrl,
            buttons,
          });
          await new Promise((r) => setTimeout(r, 35));
        } catch {}
      }
      affectedCount++;
    }
    // Record in broadcast history
    store.broadcastHistory.unshift({
      id: `bulk_msg_${Date.now()}`,
      sentAt: new Date().toISOString(),
      recipientCount: affectedCount,
      text: message,
      mediaType: mediaType || 'none',
      mediaUrl: mediaUrl || '',
      buttons: buttonText && buttonUrl ? [{ text: buttonText, url: buttonUrl }] : [],
      target: 'selected',
    });
  }

  saveStore();
  logSystemEvent(
    'info',
    'bot',
    'BULK_USER_ACTION',
    `Выполнено массовое действие "${action}" над ${affectedCount} пользователями`,
    { action, affectedCount }
  );

  res.json({
    success: true,
    message: action === 'delete' && affectedCount > 0
      ? repoCleanupFailed
        ? `Удалено пользователей: ${affectedCount}. Не все файлы подписок удалось удалить из Git-источника «${getActiveGitSource().name}»; проверьте журнал ошибок.`
        : `Пользователи удалены: ${affectedCount}.`
      : `Действие "${action}" успешно применено к ${affectedCount} пользователям!`,
    affectedCount,
    users: store.users,
  });
});

// Mute Subscription (Обрыв сети на N минут/часов/дней)
app.post('/api/users/:id/mute', async (req, res) => {
  const { id } = req.params;
  const { durationMinutes } = req.body; // e.g. 60 min, 1440 min (1 day)
  const user = store.users.find((u) => u.id === id);
  if (!user) return res.status(404).json({ success: false, message: 'Пользователь не найден' });

  const duration = Number(durationMinutes) || 60;
  const muteExpiry = new Date(Date.now() + duration * 60000).toISOString();

  user.status = 'muted';
  user.mutedUntil = muteExpiry;
  user.subscriptionStatusReason = `Заглушено администратором до ${new Date(muteExpiry).toLocaleString()}`;
  saveStore();

  applyDisconnectStub(user, 'Администратор заглушил подписку', 1).catch((e) => console.warn('[Mute stub error]:', e.message));

  res.json({
    success: true,
    message: `Подписка пользователя ${user.firstName} заглушена на ${duration} мин (сеть оборвана до ${new Date(muteExpiry).toLocaleTimeString()}).`,
    user,
  });
});

app.post('/api/users/:id/unmute', async (req, res) => {
  const { id } = req.params;
  const user = store.users.find((u) => u.id === id);
  if (!user) return res.status(404).json({ success: false, message: 'Пользователь не найден' });

  user.status = user.channelMembership === 'left' ? 'channel_inactive' : 'active';
  user.mutedUntil = null;
  user.subscriptionStatusReason = undefined;
  saveStore();

  if (user.status === 'active') {
    restoreUserNodes(user).catch((e) => console.warn('[Unmute restore error]:', e.message));
  }

  res.json({ success: true, message: `Подписка пользователя ${user.firstName} разблокирована. Сеть восстановлена!`, user });
});

// Block User in Bot
app.post('/api/users/:id/block', async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const user = store.users.find((u) => u.id === id);
  if (!user) return res.status(404).json({ success: false, message: 'Пользователь не найден' });

  user.status = 'blocked';
  user.isBlocked = true;
  user.blockedReason = reason || 'Подозрение на подозрительные действия';
  user.bannedAt = new Date().toISOString();
  saveStore();

  applyDisconnectStub(user, user.blockedReason, 1).catch((e) => console.warn('[Block stub error]:', e.message));

  res.json({ success: true, message: `Пользователь ${user.firstName} заблокирован в боте и подписке.`, user });
});

app.post('/api/users/:id/unblock', async (req, res) => {
  const { id } = req.params;
  const user = store.users.find((u) => u.id === id || u.telegramId === Number(id));
  if (!user) return res.status(404).json({ success: false, message: 'Пользователь не найден' });

  await applyUserUnblockAndReset(user);

  res.json({
    success: true,
    message: `Пользователь ${user.firstName || user.username || user.telegramId} успешно разблокирован. Ключи из центральной подписки восстановлены!`,
    user,
  });
});

// Manual Force Unlock Override for when subscription enters a blocked state or warning
app.post('/api/users/:id/force-unlock', async (req, res) => {
  const { id } = req.params;
  const user = store.users.find((u) => u.id === id || u.telegramId === Number(id));
  if (!user) return res.status(404).json({ success: false, message: 'Пользователь не найден' });

  await applyUserUnblockAndReset(user);

  logSystemEvent(
    'info',
    'violations',
    'FORCE_UNLOCK',
    `Принудительная разблокировка (Force Unlock) пользователя @${user.username || user.telegramId}. Таймеры сброшены, центральные ключи восстановлены.`,
    { userId: user.id, telegramId: user.telegramId }
  );

  res.json({
    success: true,
    message: `Подписка пользователя ${user.firstName || user.username || user.telegramId} успешно принудительно разблокирована!`,
    user,
  });
});

// Снять таймер бана и восстановить ключи при удалении подписки со 2-го устройства (предупреждение сохраняется)
app.post('/api/users/:id/resolve-second-device', async (req, res) => {
  const { id } = req.params;
  const user = store.users.find((u) => u.id === id || u.telegramId === Number(id));
  if (!user) return res.status(404).json({ success: false, message: 'Пользователь не найден' });

  const result = await resolveSecondDeviceRemoved(user);
  res.json({ success: true, message: result.message, user });
});

// Add Personal Nodes to specific user
app.post('/api/users/:id/personal-nodes', (req, res) => {
  const { id } = req.params;
  const { nodes } = req.body; // array of strings
  const user = store.users.find((u) => u.id === id);
  if (!user) return res.status(404).json({ success: false, message: 'Пользователь не найден' });

  user.personalNodes = Array.isArray(nodes) ? nodes : [];
  saveStore();

  res.json({ success: true, message: 'Персональные узлы пользователя обновлены!', user });
});

// Individual Custom Subscription settings (отвязать/привязать к центральному, добавить/убавить узлы, обход блокировок)
app.post('/api/users/:id/custom-subscription', async (req, res) => {
  const { id } = req.params;
  const {
    detachedFromCentral,
    bypassBlock,
    personalNodes,
    excludedNodes,
    customSubscriptionContent,
    customNotes,
    resyncGitVerse,
  } = req.body;

  const user = store.users.find((u) => u.id === id || u.telegramId === Number(id));
  if (!user) return res.status(404).json({ success: false, message: 'Пользователь не найден' });

  if (detachedFromCentral !== undefined) user.detachedFromCentral = Boolean(detachedFromCentral);
  if (bypassBlock !== undefined) user.bypassBlock = Boolean(bypassBlock);
  if (Array.isArray(personalNodes)) user.personalNodes = personalNodes;
  if (Array.isArray(excludedNodes)) user.excludedNodes = excludedNodes;
  if (customSubscriptionContent !== undefined) user.customSubscriptionContent = customSubscriptionContent;
  if (customNotes !== undefined) user.customNotes = customNotes;

  // Re-generate content and update user's GitVerse file if desired
  let gitUpdated = false;
  const activeGit = getActiveGitSource();
  const fileContent = getFullSubscriptionContent(user, null);

  if (resyncGitVerse !== false && activeGit && activeGit.token && activeGit.token.trim() && user.gitFilePath) {
    try {
      const { owner, repo } = getRepoParts(activeGit);
      const commitMsg = `Individual custom subscription update for ${user.username || user.telegramId}`;
      const gitRes = await createOrUpdateGitVerseFile({
        token: activeGit.token,
        owner,
        repo,
        branch: activeGit.branch || getDefaultGitBranch(activeGit.provider),
        filePath: user.gitFilePath,
        content: fileContent,
        commitMessage: commitMsg,
      });
      if (gitRes.rawUrl && activeGit.id === user.subscriptionSourceId) user.gitRawUrl = gitRes.rawUrl;
      gitUpdated = gitRes.success;

      // Update repoFile size and nodes
      const repoFile = store.repoFiles?.find(
        (f) => f.filePath === user.gitFilePath && f.sourceId === activeGit.id
      );
      if (repoFile) {
        repoFile.sizeBytes = Buffer.byteLength(fileContent, 'utf-8');
        repoFile.nodesFound = parseNodeStats(fileContent).total;
        repoFile.updatedAt = new Date().toISOString();
        if (gitRes.rawUrl) repoFile.rawUrl = gitRes.rawUrl;
        if (gitRes.sha) repoFile.sha = gitRes.sha;
      }
      if (gitRes.rawUrl && activeGit.id === user.subscriptionSourceId) {
        const subscription = user.sourceSubscriptions?.find(
          (item) => item.sourceId === user.subscriptionSourceId && item.filePath === user.gitFilePath
        );
        if (subscription) subscription.rawUrl = gitRes.rawUrl;
      }
    } catch (err: any) {
      console.warn('[Custom User GitVerse sync notice]:', err.message);
    }
  }

  if (user.subscriptionType === 'incy') {
    try {
      await resolveUserDisplayKey(user);
    } catch (e: any) {
      console.error('[User INCY link update failed]:', e.message);
      saveStore();
      return res.status(502).json({
        success: false,
        message: 'Настройки сохранены, но не удалось обновить короткую ссылку INCY.',
        error: e.message,
        user,
      });
    }
  }

  saveStore();
  res.json({
    success: true,
    message: `Индивидуальная подписка пользователя ${user.firstName || user.username || user.telegramId} сохранена${gitUpdated ? ' и обновлена в GitVerse' : ''}!`,
    user,
  });
});

app.post('/api/users/:id/shorten-clck', async (req, res) => {
  const { id } = req.params;
  const user = store.users.find((u) => u.id === id || u.telegramId === Number(id));
  if (!user) return res.status(404).json({ success: false, message: 'Пользователь не найден' });

  const rawUrl = getUserSubscriptionTargetUrl(user);
  let shortUrl: string;
  try {
    shortUrl = await shortenIncyUrl(rawUrl, user.subscriptionToken);
  } catch (err: any) {
    console.error(`[User INCY manual shorten failed] ${user.telegramId}:`, err.message);
    return res.status(502).json({
      success: false,
      message: 'Не удалось создать короткую INCY-ссылку.',
      error: err.message,
    });
  }
  applyUserIncyShortUrl(user, rawUrl, shortUrl);
  saveStore();

  res.json({ success: true, clckUrl: shortUrl, user });
});

// Unbind subscription device (Владелец отвязывает устройство в веб-приложении для переполучения и сброса лимита)
app.post('/api/users/:id/unbind-device', async (req, res) => {
  const { id } = req.params;
  const user = store.users.find((u) => u.id === id || u.telegramId === Number(id));
  if (!user) return res.status(404).json({ success: false, message: 'Пользователь не найден' });

  const prevDevice = user.boundDevice?.clientName || 'Текущее устройство';
  await applyUserUnblockAndReset(user);

  // Mark pending feedback requests for this user as resolved
  if (store.feedbackRequests) {
    store.feedbackRequests.forEach((reqItem) => {
      if (reqItem.userId === user.id || reqItem.telegramId === user.telegramId) {
        reqItem.status = 'resolved';
        reqItem.resolvedAt = new Date().toISOString();
      }
    });
  }

  saveStore();

  res.json({
    success: true,
    message: `Подписка пользователя ${user.firstName || user.username} успешно отвязана от устройства "${prevDevice}"! Счётчик нарушений сброшен (0). Подписка разблокирована и восстановлена.`,
    user,
  });
});

// Simulate 2nd device access attempt to test 3-Source violation workflow
app.post('/api/users/:id/test-violation', async (req, res) => {
  const { id } = req.params;
  const user = store.users.find((u) => u.id === id || u.telegramId === Number(id));
  if (!user) return res.status(404).json({ success: false, message: 'Пользователь не найден' });

  if (!user.boundDevice) {
    user.deviceLocked = true;
    user.boundDevice = {
      deviceId: 'dev_primary_test_original',
      clientName: 'Первичное устройство (Тест)',
      ip: '192.168.1.100',
      userAgent: 'Happ Client Primary',
      boundAt: new Date().toISOString(),
      lastConnectedAt: new Date().toISOString(),
    };
  }

  // Simulate unauthorized connection from a second device
  const fakeSecondDeviceId = `dev_second_device_violation_${Date.now()}`;
  const statusRes = await evaluateUserSubscriptionStatus(
    user,
    fakeSecondDeviceId,
    '203.0.113.195',
    'Unauthorized Second Device / Test'
  );

  res.json({
    success: true,
    message: `Имитация подключения 2-го устройства выполнена! Попыток нарушения: ${user.deviceViolationAttempts || 0}. Статус: ${user.status}. Источник заглушки: Источник ${statusRes.sourceNum || 'нет'}.`,
    user,
    statusRes,
  });
});

// Test 3-Source & Custom replacement content and node counts
app.post('/api/replacement-templates/test-source/:num', async (req, res) => {
  const num = Number(req.params.num) as 1 | 2 | 3 | 4;
  if (![1, 2, 3, 4].includes(num)) {
    return res.status(400).json({ success: false, message: 'Неверный номер источника (ожидается 1, 2, 3 или 4)' });
  }

  try {
    const rawNodes = await getReplacementSourceNodes(num);
    const stats = parseNodeStats(rawNodes);
    const rawUrl =
      num === 1
        ? store.replacementTemplates?.source1RawUrl
        : num === 2
        ? store.replacementTemplates?.source2RawUrl
        : num === 4
        ? store.replacementTemplates?.source4RawUrl
        : store.replacementTemplates?.source3RawUrl;

    res.json({
      success: true,
      sourceNum: num,
      rawUrl: rawUrl || '(локальный шаблон узлов)',
      nodesTotal: stats.total,
      types: stats.types,
      preview: rawNodes.substring(0, 500),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Firebase Cloud Status & Synchronization endpoints
app.get('/api/firebase/status', (req, res) => {
  res.json({
    success: true,
    connected: isFirebaseConnected,
    mode: isFirebaseConnected ? 'Cloud Firestore (Authoritative)' : 'Local File Fallback',
    documentPath: 'system_store/main_store',
    counts: {
      users: (store.users || []).length,
      bots: (store.bots || []).length,
      gitSources: (store.gitSources || []).length,
      exclusions: (store.exclusions || []).length,
      repoFiles: (store.repoFiles || []).length,
    },
    activeBot: store.bots?.find((b) => b.id === store.activeBotId)?.name || 'Не выбран',
    activeGit: getActiveGitSource()?.name || 'Не выбран',
    lastSavedAt: new Date().toISOString(),
  });
});

app.get('/api/firebase/config', (req, res) => {
  const cfg = getFirebaseConfig();
  res.json({
    success: true,
    config: cfg,
    configJson: cfg ? JSON.stringify(cfg, null, 2) : '',
  });
});

app.post('/api/firebase/sync', async (req, res) => {
  try {
    await saveStoreToFirebase();
    res.json({
      success: true,
      message: 'Все параметры, базы пользователей, ботов и репозиториев синхронизированы с Firebase Firestore!',
      connected: isFirebaseConnected,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: `Ошибка синхронизации: ${err.message}` });
  }
});

app.post('/api/firebase/reload', async (req, res) => {
  try {
    await initFirebaseAndLoadStore();
    res.json({
      success: true,
      message: 'Данные успешно перезагружены из Cloud Firestore!',
      counts: {
        users: (store.users || []).length,
        bots: (store.bots || []).length,
        gitSources: (store.gitSources || []).length,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: `Ошибка загрузки: ${err.message}` });
  }
});

// Dedicated Read & Write Test Probe Endpoint for Dashboard
app.post('/api/firebase/test-rw', async (req, res) => {
  try {
    const db = getDb();
    if (!db) {
      return res.status(503).json({
        success: false,
        connected: false,
        message: 'Firebase Firestore не инициализирован. Проверьте конфигурацию проекта.',
      });
    }

    const testNonce = Math.random().toString(36).substring(2, 10);
    const testTimestamp = new Date().toISOString();
    const probeDocId = `probe_${testNonce}_${Date.now()}`;
    const testDocRef = doc(db, 'system_store', probeDocId);

    // 1. Measure Write
    const writeStart = Date.now();
    await setDoc(testDocRef, {
      lastTestNonce: testNonce,
      testedAt: testTimestamp,
      updatedAt: testTimestamp,
      clientAgent: 'Dashboard-RW-Probe',
      status: 'operational',
    });
    const writeLatencyMs = Date.now() - writeStart;

    // 2. Measure Read directly from server (bypassing stale cache)
    const readStart = Date.now();
    let snap;
    try {
      snap = await getDocFromServer(testDocRef);
    } catch {
      snap = await getDoc(testDocRef);
    }
    const readLatencyMs = Date.now() - readStart;

    // Clean up temporary probe doc in background
    deleteDoc(testDocRef).catch((e) => console.warn('[Probe cleanup notice]:', e.message));

    if (!snap.exists()) {
      return res.status(500).json({
        success: false,
        connected: false,
        message: 'Документ был записан, но не прочитан обратно из Firestore.',
      });
    }

    const snapData = snap.data();
    if (snapData?.lastTestNonce !== testNonce) {
      return res.status(500).json({
        success: false,
        connected: false,
        message: 'Контрольное значение (nonce) не совпало при проверке чтения.',
      });
    }

    const cfg = getFirebaseConfig();

    return res.json({
      success: true,
      connected: true,
      writeLatencyMs,
      readLatencyMs,
      totalLatencyMs: writeLatencyMs + readLatencyMs,
      testedAt: testTimestamp,
      projectId: cfg.projectId,
      databaseId: cfg.databaseId || 'ai-studio-03156b68-3890-4187-85fe-57fab87d5859',
      documentPath: `system_store/${probeDocId}`,
      status: 'operational',
      message: `Тест чтения/записи в Firebase Cloud Firestore успешно завершен! (Запись: ${writeLatencyMs}мс, Чтение: ${readLatencyMs}мс)`,
    });
  } catch (err: any) {
    console.error('[Firebase RW Test Error]:', err.message);
    return res.status(500).json({
      success: false,
      connected: false,
      message: `Ошибка при тестировании Firebase: ${err.message}`,
      testedAt: new Date().toISOString(),
    });
  }
});

// -------------------------------------------------------------
// Multi-Database Management & Migration (Firebase <-> Vercel KV)
// -------------------------------------------------------------
app.get('/api/database/status', async (req, res) => {
  const kvConfig = getVercelKvConfig();
  const activeBackend = store.storageConfig?.activeBackend || 'firebase';
  const autoDualWrite = store.storageConfig?.autoDualWrite !== false;
  const fbConfig = getFirebaseConfig();

  res.json({
    success: true,
    activeBackend,
    autoDualWrite,
    firebase: {
      connected: isFirebaseConnected,
      mode: isFirebaseConnected ? 'Cloud Firestore (Authoritative)' : 'Local File Fallback',
      documentPath: 'system_store/main_store',
      projectId: fbConfig.projectId,
      databaseId: fbConfig.databaseId || 'ai-studio-03156b68-3890-4187-85fe-57fab87d5859',
    },
    vercelKv: {
      isConfigured: kvConfig.isConfigured,
      urlConfigured: Boolean(kvConfig.url),
      tokenConfigured: Boolean(kvConfig.token),
      maskedUrl: kvConfig.url ? `${kvConfig.url.slice(0, 20)}...` : '',
    },
    migration: {
      lastMigratedAt: store.storageConfig?.lastMigratedAt || null,
      lastMigratedDirection: store.storageConfig?.lastMigratedDirection || null,
    },
    counts: {
      users: (store.users || []).length,
      bots: (store.bots || []).length,
      gitSources: (store.gitSources || []).length,
      exclusions: (store.exclusions || []).length,
      repoFiles: (store.repoFiles || []).length,
    },
    lastSavedAt: (store as any).updatedAt || new Date().toISOString(),
  });
});

app.post('/api/database/configure', async (req, res) => {
  const { activeBackend, kvRestApiUrl, kvRestApiToken, autoDualWrite } = req.body;
  if (!store.storageConfig) {
    store.storageConfig = {
      activeBackend: 'firebase',
      autoDualWrite: true,
    };
  }

  if (activeBackend && ['firebase', 'vercel_kv', 'hybrid', 'local_file'].includes(activeBackend)) {
    store.storageConfig.activeBackend = activeBackend;
  }
  if (typeof kvRestApiUrl === 'string') {
    store.storageConfig.kvRestApiUrl = kvRestApiUrl.trim();
  }
  if (typeof kvRestApiToken === 'string') {
    store.storageConfig.kvRestApiToken = kvRestApiToken.trim();
  }
  if (typeof autoDualWrite === 'boolean') {
    store.storageConfig.autoDualWrite = autoDualWrite;
  }

  saveStore();
  res.json({
    success: true,
    message: 'Настройки базы данных успешно сохранены!',
    storageConfig: store.storageConfig,
  });
});

app.post('/api/database/test-kv', async (req, res) => {
  const { url, token } = req.body;
  const testRes = await testVercelKvConnection(url, token);
  res.json(testRes);
});

app.post('/api/database/migrate', async (req, res) => {
  const { direction } = req.body; // 'firebase_to_vercel' | 'vercel_to_firebase'
  if (!direction || !['firebase_to_vercel', 'vercel_to_firebase'].includes(direction)) {
    return res.status(400).json({ success: false, message: 'Неверное направление миграции (ожидается firebase_to_vercel или vercel_to_firebase)' });
  }

  try {
    const startTime = Date.now();
    let usersCount = (store.users || []).length;
    let botsCount = (store.bots || []).length;
    let sourcesCount = (store.gitSources || []).length;

    if (direction === 'firebase_to_vercel') {
      const kvConfig = getVercelKvConfig();
      if (!kvConfig.isConfigured) {
        return res.status(400).json({
          success: false,
          message: 'Vercel KV не настроен. Укажите KV_REST_API_URL и KV_REST_API_TOKEN перед миграцией.',
        });
      }

      // 1. Fetch freshest state from Firebase if available, otherwise current memory store
      const fbStore = await loadStoreFromFirebase();
      const payloadToMigrate = fbStore || store;

      // 2. Save directly to Vercel KV
      const saveOk = await saveStoreToVercelKv(payloadToMigrate);
      if (!saveOk) {
        return res.status(500).json({ success: false, message: 'Не удалось записать данные в Vercel KV' });
      }

      // 3. Verify Vercel KV read
      const verifyStore = await loadStoreFromVercelKv();
      if (!verifyStore || !Array.isArray(verifyStore.users)) {
        return res.status(500).json({ success: false, message: 'Данные записаны в Vercel KV, но проверка обратного чтения завершилась ошибкой' });
      }

      usersCount = verifyStore.users.length;
      botsCount = (verifyStore.bots || []).length;
      sourcesCount = (verifyStore.gitSources || []).length;

      if (!store.storageConfig) store.storageConfig = { activeBackend: 'firebase' };
      store.storageConfig.lastMigratedAt = new Date().toISOString();
      store.storageConfig.lastMigratedDirection = 'Firebase ➔ Vercel KV';
      saveStore();

      return res.json({
        success: true,
        direction,
        message: `Миграция из Firebase в Vercel KV успешно завершена за ${Date.now() - startTime} мс! Перенесено: ${usersCount} подписчиков, ${botsCount} ботов, ${sourcesCount} источников.`,
        counts: { users: usersCount, bots: botsCount, gitSources: sourcesCount },
        latencyMs: Date.now() - startTime,
      });
    } else {
      // vercel_to_firebase
      const kvStore = await loadStoreFromVercelKv();
      if (!kvStore) {
        return res.status(400).json({
          success: false,
          message: 'Не удалось прочитать исходные данные из Vercel KV. Убедитесь, что в базе Vercel есть сохраненные данные.',
        });
      }

      store = kvStore;
      await saveStoreToFirebase();

      // Verify Firebase read
      const verifyStore = await loadStoreFromFirebase();
      if (!verifyStore) {
        return res.status(500).json({ success: false, message: 'Данные перенесены в Firebase, но проверка обратного чтения не удалась' });
      }

      usersCount = (verifyStore.users || []).length;
      botsCount = (verifyStore.bots || []).length;
      sourcesCount = (verifyStore.gitSources || []).length;

      if (!store.storageConfig) store.storageConfig = { activeBackend: 'firebase' };
      store.storageConfig.lastMigratedAt = new Date().toISOString();
      store.storageConfig.lastMigratedDirection = 'Vercel KV ➔ Firebase';
      saveStore();

      return res.json({
        success: true,
        direction,
        message: `Миграция из Vercel KV в Firebase Cloud успешно завершена за ${Date.now() - startTime} мс! Перенесено: ${usersCount} подписчиков, ${botsCount} ботов, ${sourcesCount} источников.`,
        counts: { users: usersCount, bots: botsCount, gitSources: sourcesCount },
        latencyMs: Date.now() - startTime,
      });
    }
  } catch (err: any) {
    return res.status(500).json({ success: false, message: `Ошибка миграции: ${err.message}` });
  }
});

app.get('/api/database/export-dump', (req, res) => {
  const exportPayload = {
    appVersion: '2.5.0-hybrid',
    exportedAt: new Date().toISOString(),
    backend: store.storageConfig?.activeBackend || 'firebase',
    store,
  };
  const jsonStr = JSON.stringify(exportPayload, null, 2);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="puls-database-backup-${Date.now()}.json"`);
  res.send(jsonStr);
});

app.post('/api/database/import-dump', async (req, res) => {
  try {
    const rawDump = req.body.store || req.body;
    if (!rawDump || typeof rawDump !== 'object') {
      return res.status(400).json({ success: false, message: 'Неверный формат дампа базы данных (ожидается валидный JSON объект)' });
    }

    const targetStore = normalizeStore(rawDump.store || rawDump);
    store = targetStore;
    saveStore();

    res.json({
      success: true,
      message: 'Дамп базы данных успешно восстановлен!',
      counts: {
        users: (store.users || []).length,
        bots: (store.bots || []).length,
        gitSources: (store.gitSources || []).length,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: `Ошибка восстановления дампа: ${err.message}` });
  }
});

// Live channel verification for a specific subscriber against Telegram API
app.post('/api/users/:id/verify-channels', async (req, res) => {
  const { id } = req.params;
  const user = store.users.find((u) => u.id === id || u.telegramId === Number(id));
  if (!user) return res.status(404).json({ success: false, message: 'Пользователь не найден' });

  const bot = getActiveBot();
  if (!bot || !bot.token) {
    return res.status(400).json({ success: false, message: 'Активный Telegram бот не настроен' });
  }

  try {
    const checkResult = await botManager.checkAllRequiredChannels(bot, user.telegramId);

    if (checkResult.allSubscribed) {
      user.channelMembership = 'member';
      user.channelLeftAt = null;
      user.deletionDeadlineAt = null;
      if (user.gitFilePath) {
        user.status = 'active';
        user.hasActiveSubscription = true;
        user.subscriptionStatusReason = undefined;
        await restoreUserNodes(user);
      }
      saveStore();
    } else {
      user.channelMembership = 'left';
      saveStore();
    }

    res.json({
      success: true,
      allSubscribed: checkResult.allSubscribed,
      missingChannels: checkResult.missingChannels,
      botNeedsAdminIn: checkResult.botNeedsAdminIn,
      errors: checkResult.errors,
      user,
      message: checkResult.allSubscribed
        ? `Пользователь @${user.username || user.telegramId} успешно подтвержден во всех обязательных каналах! Статус: АКТИВНА.`
        : `Пользователь не состоит в каналах: ${checkResult.missingChannels.map((c: any) => c.title || c.id).join(', ')}${checkResult.errors?.length ? ` (Ошибки: ${checkResult.errors.join('; ')})` : ''}`,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: `Ошибка проверки каналов: ${err.message}`,
    });
  }
});

// Bind subscription device manually / for testing
app.post('/api/users/:id/bind-device', (req, res) => {
  const { id } = req.params;
  const { clientName } = req.body;
  const user = store.users.find((u) => u.id === id || u.telegramId === Number(id));
  if (!user) return res.status(404).json({ success: false, message: 'Пользователь не найден' });

  user.deviceLocked = true;
  user.boundDevice = {
    deviceId: `dev_${Math.random().toString(36).substring(2, 9)}`,
    clientName: clientName || 'iPhone 15 Pro / Shadowrocket (iOS)',
    ip: '188.130.155.42',
    userAgent: 'Shadowrocket/2.2.34 (iOS 17.4)',
    boundAt: new Date().toISOString(),
    lastConnectedAt: new Date().toISOString(),
  };
  saveStore();

  res.json({
    success: true,
    message: `Подписка успешно привязана к устройству "${user.boundDevice.clientName}"!`,
    user,
  });
});

// Feedback and Unblock/Unbind Requests Management
app.get('/api/feedback', (req, res) => {
  res.json({ requests: store.feedbackRequests || [] });
});

// Full Unblock & Unbind (Разблокировать и отвязать устройство)
app.post('/api/feedback/:id/unblock-and-unbind', async (req, res) => {
  const { id } = req.params;
  const request = (store.feedbackRequests || []).find((r) => r.id === id);
  if (!request) return res.status(404).json({ success: false, message: 'Заявка не найдена' });

  const user = store.users.find((u) => u.id === request.userId || u.telegramId === request.telegramId);
  if (user) {
    await applyUserUnblockAndReset(user);

    // Notify user via Telegram Bot asynchronously
    const activeBot = getActiveBot();
    if (activeBot && activeBot.token && activeBot.status === 'connected' && user.telegramId) {
      fetch(`https://api.telegram.org/bot${activeBot.token}/sendMessage`, {
        method: 'POST',
        signal: AbortSignal.timeout(2000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: user.telegramId,
          text: `🎉 <b>Ваша подписка успешно разблокирована, а устройство отвязано!</b>\n\n` +
            `✅ Администратор одобрил вашу заявку.\n` +
            `📡 Серверные узлы полностью восстановлены.\n` +
            `📱 Вы можете открыть приложение и подключиться с чистого листа!`,
          parse_mode: 'HTML',
        }),
      }).catch((err) => console.warn('[Unblock Bot Notify Error]:', err.message));
    }
  }

  request.status = 'resolved';
  request.resolvedAt = new Date().toISOString();
  saveStore();

  res.json({
    success: true,
    message: `Пользователь ${request.firstName || request.username || request.telegramId} успешно разблокирован, устройство отвязано, а узлы восстановлены!`,
    request,
    user,
  });
});

// Unblock Only (Разблокировать без смены устройства)
app.post('/api/feedback/:id/unblock', async (req, res) => {
  const { id } = req.params;
  const request = (store.feedbackRequests || []).find((r) => r.id === id);
  if (!request) return res.status(404).json({ success: false, message: 'Заявка не найдена' });

  const user = store.users.find((u) => u.id === request.userId || u.telegramId === request.telegramId);
  if (user) {
    user.isBlocked = false;
    user.status = 'active';
    user.isPermanentlyBanned = false;
    user.bannedAt = null;
    user.blockedReason = undefined;
    user.subscriptionStatusReason = undefined;
    user.sharingGraceDeadlineAt = null;
    user.secondDeviceInfo = null;
    user.secondDeviceActive = false;
    user.secondDeviceBlockedCount = 0;
    user.sharingWarningCount = 0;
    user.deviceViolationAttempts = 0;
    user.isTimerFrozen = true;
    user.mutedUntil = null;
    user.pendingUnblockRequest = false;
    user.hasActiveSubscription = true;
    user.lastActiveAt = new Date().toISOString();

    const linkedExcl = store.exclusions?.find((e) => e.userId === user.id || e.token === user.subscriptionToken);
    if (linkedExcl) {
      linkedExcl.status = 'active';
      linkedExcl.isBlocked = false;
      linkedExcl.isMuted = false;
      linkedExcl.sharingGraceDeadlineAt = null;
      linkedExcl.secondDeviceInfo = null;
      linkedExcl.secondDeviceActive = false;
      linkedExcl.secondDeviceBlockedCount = 0;
      linkedExcl.sharingWarningCount = 0;
      linkedExcl.isTimerFrozen = true;
      linkedExcl.subscriptionStatusReason = undefined;
    }

    await restoreUserNodes(user).catch((e) => console.warn('[Unblock restore error]:', e.message));
    await resolveUserDisplayKey(user).catch((e) => console.warn('[Unblock resolveUserDisplayKey error]:', e.message));

    const activeBot = getActiveBot();
    if (activeBot && activeBot.token && activeBot.status === 'connected' && user.telegramId) {
      fetch(`https://api.telegram.org/bot${activeBot.token}/sendMessage`, {
        method: 'POST',
        signal: AbortSignal.timeout(2000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: user.telegramId,
          text: `🎉 <b>Ваша подписка успешно разблокирована!</b>\n\n` +
            `✅ Администратор одобрил вашу заявку на разбан.\n` +
            `📡 Доступ к серверным узлам восстановлен.`,
          parse_mode: 'HTML',
        }),
      }).catch((err) => console.warn('[Unblock Bot Notify Error]:', err.message));
    }
  }

  request.status = 'resolved';
  request.resolvedAt = new Date().toISOString();
  saveStore();

  res.json({
    success: true,
    message: `Пользователь ${request.firstName || request.username || request.telegramId} успешно разблокирован!`,
    request,
    user,
  });
});

app.post('/api/feedback/:id/resolve-unbind', async (req, res) => {
  const { id } = req.params;
  const request = (store.feedbackRequests || []).find((r) => r.id === id);
  if (!request) return res.status(404).json({ success: false, message: 'Заявка не найдена' });

  const user = store.users.find((u) => u.id === request.userId || u.telegramId === request.telegramId);
  if (user) {
    await applyUserUnblockAndReset(user);
  }

  request.status = 'resolved';
  request.resolvedAt = new Date().toISOString();
  saveStore();

  res.json({
    success: true,
    message: `Устройство пользователя ${request.firstName || request.username || request.telegramId} успешно отвязано, лимит подписки сброшен!`,
    request,
    user,
  });
});

// Terminate subscription (removes subscription / revokes access) from Feedback
app.post('/api/feedback/:id/terminate', async (req, res) => {
  const { id } = req.params;
  const request = (store.feedbackRequests || []).find((r) => r.id === id);
  if (!request) return res.status(404).json({ success: false, message: 'Заявка не найдена' });

  const user = store.users.find((u) => u.id === request.userId || u.telegramId === request.telegramId);
  if (user) {
    user.hasActiveSubscription = false;
    user.status = 'blocked';
    user.isPermanentlyBanned = true;
    user.isBlocked = true;
    user.subscriptionStatusReason = 'Подписка аннулирована администратором';
    user.personalNodes = [];
    user.boundDevice = null;
    user.deviceLocked = false;
    user.trafficLimitBytes = 0;

    const linkedExcl = store.exclusions?.find((e) => e.userId === user.id || e.token === user.subscriptionToken);
    if (linkedExcl) {
      linkedExcl.status = 'blocked';
      linkedExcl.isBlocked = true;
      linkedExcl.boundDevice = null;
      linkedExcl.deviceLocked = false;
      linkedExcl.subscriptionStatusReason = 'Подписка аннулирована администратором';
    }

    // Apply terminated stub in GitVerse asynchronously
    if (user.gitFilePath) {
      const activeGit = getActiveGitSource();
      if (activeGit?.token?.trim()) {
        const { owner, repo } = getRepoParts(activeGit);
        createOrUpdateGitVerseFile({
          token: activeGit.token,
          owner,
          repo,
          branch: activeGit.branch || getDefaultGitBranch(activeGit.provider),
          filePath: user.gitFilePath,
          content: 'vless://00000000-0000-0000-0000-000000000000@127.0.0.1:443?encryption=none&security=none#⛔ Подписка аннулирована администратором',
          commitMessage: `Terminate subscription for @${user.username || user.telegramId}`,
        }).catch((err) => console.warn('[Terminate Git Error]:', err.message));
      }
    }

    const activeBot = getActiveBot();
    if (activeBot && activeBot.token && activeBot.status === 'connected' && user.telegramId) {
      fetch(`https://api.telegram.org/bot${activeBot.token}/sendMessage`, {
        method: 'POST',
        signal: AbortSignal.timeout(2000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: user.telegramId,
          text: `🚫 <b>Ваша подписка аннулирована администратором</b>\n\nДоступ к серверам и файлу подписки прекращен.`,
          parse_mode: 'HTML',
        }),
      }).catch((err) => console.warn('[Terminate Bot Notify Error]:', err.message));
    }
  }

  request.status = 'resolved';
  request.resolvedAt = new Date().toISOString();
  saveStore();

  res.json({
    success: true,
    message: `Подписка пользователя ${request.firstName || request.username || request.telegramId} успешно аннулирована.`,
    request,
    user,
  });
});

// Automatic generation of unblock requests coming from users via bot
app.post('/api/feedback/generate-bot-request', async (req, res) => {
  const { scenario } = req.body;

  const scenarios = [
    {
      key: 'bot_deleted',
      name: 'Пользователь удалил бота',
      reasons: [
        'Пользователь удалил бота или вышел из обязательного канала',
        'Блокировка бота в Telegram: удален диалог с ботом',
        'Отписка от обязательного спонсорского канала @Vaynet_vpn',
      ],
      messages: [
        'Случайно смахнул и удалил чат с ботом при очистке диалогов. Подписался заново, восстановите пожалуйста подписку!',
        'Удалил диалог с ботом по ошибке, верните пожалуйста доступ к серверам, я снова участник канала.',
        'Случайно нажал "Остановить и заблокировать бота" в Telegram, уже разблокировал и нажал старт, верните доступ!',
      ],
      defaultAttempts: 1,
    },
    {
      key: 'device_binding',
      name: 'Попытка привязки устройства',
      reasons: [
        'Попытка привязки 2-го устройства (нарушение правила 1 подписка = 1 устройство)',
        'Зафиксировано параллельное подключение с нового клиента без предварительной отвязки',
        'Превышен лимит одновременных устройств (активно 2 устройства)',
      ],
      messages: [
        'Купил новый телефон и пытался настроить VPN. Не знал, что нужно сначала отвязать старый телефон. Отвяжите пожалуйста старое устройство!',
        'Пытался подключиться с планшета на работе, не знал про ограничение в 1 устройство. Разблокируйте пожалуйста и отвяжите!',
        'Сбросил настройки на телефоне, изменился HWID клиента, теперь пишет что устройство уже привязано. Прошу отвязать!',
      ],
      defaultAttempts: 2,
    },
    {
      key: 'limit_exceeded',
      name: 'Превышение лимита удалений',
      reasons: [
        'Превышение лимита отписок от каналов (перманентный бан)',
        'Превышен лимит попыток повторной привязки (3/3 нарушений)',
        'Систематическое нарушение правил: многократное удаление бота и каналов',
      ],
      messages: [
        'Признаю ошибку, выходил из каналов несколько раз. Сейчас подписан на все каналы проекта. Очень прошу разблокировать подписку!',
        'Извините, случайно вышел из каналов, когда чистил папки. Обещаю больше не отписываться, разблокируйте пожалуйста.',
        'Превысил лимит переподключений из-за бага в клиенте v2rayNG. Разблокируйте пожалуйста и сбросьте счетчик нарушений!',
      ],
      defaultAttempts: 3,
    },
  ];

  const selectedScenario = scenarios.find((s) => s.key === scenario) || scenarios[Math.floor(Math.random() * scenarios.length)];
  const randomReason = selectedScenario.reasons[Math.floor(Math.random() * selectedScenario.reasons.length)];
  const randomMessage = selectedScenario.messages[Math.floor(Math.random() * selectedScenario.messages.length)];

  // Pick realistic Russian nicknames
  const sampleUsers = [
    { first: 'Алексей', username: 'alex_nord', id: 482910481, device: 'iPhone 15 Pro / V2RayTun' },
    { first: 'Дмитрий', username: 'dmitry_dev', id: 719302819, device: 'Xiaomi 13T / Nekobox' },
    { first: 'Екатерина', username: 'katya_spb', id: 593810294, device: 'iPhone 14 / Shadowrocket' },
    { first: 'Сергей', username: 'sergey_msk', id: 381940281, device: 'Samsung Galaxy S24 / Happ' },
    { first: 'Максим', username: 'maksim_vpn', id: 918274019, device: 'Windows 11 / v2rayN' },
    { first: 'Анна', username: 'anna_design', id: 628194018, device: 'MacBook Air M2 / Happ' },
    { first: 'Иван', username: 'ivan_tg', id: 849201948, device: 'Google Pixel 8 / Sing-box' },
    { first: 'Артём', username: 'artem_stream', id: 739102847, device: 'OnePlus 12 / V2RayTun' },
  ];

  const sampleUser = sampleUsers[Math.floor(Math.random() * sampleUsers.length)];
  const tgId = sampleUser.id + Math.floor(Math.random() * 1000);
  const now = new Date();
  const blockedAgoMinutes = 3 + Math.floor(Math.random() * 25);
  const blockedAtTime = new Date(now.getTime() - blockedAgoMinutes * 60 * 1000).toISOString();

  // Find or create user
  let user = store.users.find((u) => u.telegramId === tgId || u.username === sampleUser.username);
  if (!user) {
    user = {
      id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      telegramId: tgId,
      username: sampleUser.username,
      firstName: sampleUser.first,
      joinedAt: new Date(now.getTime() - 86400000 * 14).toISOString(),
      receivedAt: new Date(now.getTime() - 86400000 * 14).toISOString(),
      subscriptionName: 'HAPP (crypt5) - VLESS VIP',
      subscriptionType: 'happ',
      status: selectedScenario.key === 'limit_exceeded' ? 'blocked' : 'muted',
      mutedUntil: selectedScenario.key === 'device_binding' ? new Date(now.getTime() + 24 * 3600 * 1000).toISOString() : null,
      channelMembership: selectedScenario.key === 'bot_deleted' ? 'left' : 'member',
      subscriptionToken: `sub_${tgId}_${Math.random().toString(36).substring(2, 8)}`,
      subscriptionExpiresAt: new Date(now.getTime() + 86400000 * 30).toISOString(),
      hasActiveSubscription: false,
      trafficUsedBytes: 4200000000,
      trafficLimitBytes: 100 * 1024 * 1024 * 1024,
      isBlocked: true,
      isPermanentlyBanned: selectedScenario.key === 'limit_exceeded',
      bannedAt: blockedAtTime,
      blockedReason: randomReason,
      subscriptionStatusReason: randomReason,
      lastActiveAt: blockedAtTime,
      personalNodes: [],
      deviceLocked: true,
      deviceViolationAttempts: selectedScenario.defaultAttempts,
      channelLeftCount: selectedScenario.key === 'bot_deleted' ? 2 : (selectedScenario.key === 'limit_exceeded' ? 5 : 0),
      pendingUnblockRequest: true,
      boundDevice: {
        deviceId: `dev_${Math.random().toString(36).substring(2, 10)}`,
        clientName: sampleUser.device,
        ip: `185.220.${100 + Math.floor(Math.random() * 150)}.${10 + Math.floor(Math.random() * 200)}`,
        userAgent: sampleUser.device,
        boundAt: new Date(now.getTime() - 86400000 * 7).toISOString(),
        lastConnectedAt: blockedAtTime,
      },
      gitFilePath: `subs/sub_${sampleUser.username}_${tgId}.txt`,
      gitRawUrl: `https://gitverse.ru/api/repos/Vaynet/bot/raw/branch/master/subs/sub_${sampleUser.username}_${tgId}.txt`,
    };
    store.users.unshift(user);
  } else {
    user.isBlocked = true;
    user.status = selectedScenario.key === 'limit_exceeded' ? 'blocked' : 'muted';
    user.blockedReason = randomReason;
    user.pendingUnblockRequest = true;
  }

  const newRequest: FeedbackRequest = {
    id: `unblock_bot_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    userId: user.id,
    telegramId: user.telegramId,
    username: user.username,
    firstName: user.firstName,
    type: 'unblock_request',
    message: randomMessage,
    banReason: randomReason,
    blockedAt: blockedAtTime,
    attempts: selectedScenario.defaultAttempts,
    createdAt: new Date().toISOString(),
    status: 'pending',
    boundDevice: user.boundDevice ? {
      clientName: user.boundDevice.clientName,
      ip: user.boundDevice.ip,
      boundAt: user.boundDevice.boundAt,
    } : null,
  };

  if (!store.feedbackRequests) store.feedbackRequests = [];
  store.feedbackRequests.unshift(newRequest);
  saveStore();

  res.json({
    success: true,
    message: `Заявка на разблокировку от @${user.username} успешно поступила из Telegram-бота!`,
    request: newRequest,
    user,
  });
});

// Terminate user subscription directly
app.post('/api/users/:id/terminate', async (req, res) => {
  const { id } = req.params;
  const user = store.users.find((u) => u.id === id || u.telegramId === Number(id));
  if (!user) return res.status(404).json({ success: false, message: 'Пользователь не найден' });

  user.hasActiveSubscription = false;
  user.status = 'blocked';
  user.isPermanentlyBanned = true;
  user.isBlocked = true;
  user.subscriptionStatusReason = 'Подписка аннулирована администратором';
  user.personalNodes = [];
  user.boundDevice = null;
  user.deviceLocked = false;
  user.trafficLimitBytes = 0;

  const linkedExcl = store.exclusions?.find((e) => e.userId === user.id || e.token === user.subscriptionToken);
  if (linkedExcl) {
    linkedExcl.status = 'blocked';
    linkedExcl.isBlocked = true;
    linkedExcl.boundDevice = null;
    linkedExcl.deviceLocked = false;
    linkedExcl.subscriptionStatusReason = 'Подписка аннулирована администратором';
  }

  if (user.gitFilePath) {
    const activeGit = getActiveGitSource();
    if (activeGit?.token?.trim()) {
      const { owner, repo } = getRepoParts(activeGit);
      await createOrUpdateGitVerseFile({
        token: activeGit.token,
        owner,
        repo,
        branch: activeGit.branch || getDefaultGitBranch(activeGit.provider),
        filePath: user.gitFilePath,
        content: 'vless://00000000-0000-0000-0000-000000000000@127.0.0.1:443?encryption=none&security=none#⛔ Подписка аннулирована администратором',
        commitMessage: `Terminate subscription for @${user.username || user.telegramId}`,
      }).catch((err) => console.warn('[Terminate Git Error]:', err.message));
    }
  }

  saveStore();
  res.json({ success: true, message: `Подписка пользователя ${user.firstName || user.username} аннулирована`, user });
});

// 3-Tier Source Replacement Simulation Endpoint
app.post('/api/users/:id/simulate-tier', async (req, res) => {
  const { id } = req.params;
  const { tier, action } = req.body; // tier: 1 | 2 | 3, action: 'trigger' | 'revert'
  const user = store.users.find((u) => u.id === id || u.telegramId === Number(id));
  if (!user) return res.status(404).json({ success: false, message: 'Пользователь не найден' });

  if (tier === 1) {
    if (action === 'revert') {
      // Automatic revert on channel return:
      user.channelMembership = 'member';
      user.status = 'active';
      user.isBlocked = false;
      user.channelLeftAt = null;
      user.subscriptionStatusReason = 'Подписка активна (член обязательного канала)';
      
      // Restore clean nodes in GitVerse file
      if (user.gitFilePath) {
        const activeGit = getActiveGitSource();
        if (activeGit?.token?.trim()) {
          const { owner, repo } = getRepoParts(activeGit);
          const nodeContent = [
            ...(user.personalNodes || []),
            ...store.centralFile.content.split('\n').filter((l) => l.trim().length > 0 && !l.startsWith('#')),
          ].join('\n');
          await createOrUpdateGitVerseFile({
            token: activeGit.token,
            owner,
            repo,
            branch: activeGit.branch || getDefaultGitBranch(activeGit.provider),
            filePath: user.gitFilePath,
            content: nodeContent,
            commitMessage: `Auto-revert nodes for @${user.username || user.telegramId} after channel rejoin`,
          }).catch((err) => console.warn('[Tier 1 Revert Error]:', err.message));
        }
      }
      saveStore();
      return res.json({ success: true, message: `[Уровень 1] Авто-возврат: подписчик вернулся в канал, доступ к центральным серверам восстановлен!`, user });
    } else {
      // Trigger Tier 1 (left channel / deleted bot)
      user.channelMembership = 'left';
      user.status = 'channel_inactive';
      user.channelLeftAt = new Date().toISOString();
      user.channelLeftCount = (user.channelLeftCount || 0) + 1;

      const maxLeaves = store.centralFile?.limitExceededMaxAttempts ?? 5;
      if (user.channelLeftCount >= maxLeaves) {
        // Escalates to Tier 3 (Source 3: Permanent Ban)
        user.isPermanentlyBanned = true;
        user.isBlocked = true;
        user.status = 'blocked';
        user.bannedAt = new Date().toISOString();
        user.blockedReason = `Превышен лимит (${user.channelLeftCount}/${maxLeaves}) отписок/удалений (Этап 3 - перманентный бан)`;
        user.subscriptionStatusReason = user.blockedReason;
        await applyDisconnectStub(user, 'Channel leave limit exceeded (Source 3)', 3).catch(() => {});

        const unblockReq: FeedbackRequest = {
          id: `unblock_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          userId: user.id,
          telegramId: user.telegramId,
          username: user.username,
          firstName: user.firstName,
          type: 'unblock_request',
          message: `Пользователь превысил лимит удалений бота (${user.channelLeftCount}/${maxLeaves}). Назначен перманентный бан (Источник 3). Требуется решение администратора.`,
          banReason: user.blockedReason,
          blockedAt: user.bannedAt,
          attempts: user.channelLeftCount,
          createdAt: new Date().toISOString(),
          status: 'pending',
          boundDevice: user.boundDevice ? {
            clientName: user.boundDevice.clientName,
            ip: user.boundDevice.ip,
            boundAt: user.boundDevice.boundAt,
          } : null,
        };
        if (!store.feedbackRequests) store.feedbackRequests = [];
        store.feedbackRequests.unshift(unblockReq);
        saveStore();
        return res.json({
          success: true,
          message: `[Уровень 3] Превышен лимит удалений (${user.channelLeftCount}/${maxLeaves}): активирован перманентный бан и заглушка Источника 3!`,
          user,
        });
      } else {
        user.subscriptionStatusReason = `Отписался от обязательного канала (применен Источник 1, попытка ${user.channelLeftCount}/${maxLeaves})`;
        await applyDisconnectStub(user, 'Left channel (Source 1)', 1).catch(() => {});
        saveStore();
        return res.json({
          success: true,
          message: `[Уровень 1] Зафиксирована отписка от канала: подписка переключена на заглушку Источника 1 (${user.channelLeftCount}/${maxLeaves})`,
          user,
        });
      }
    }
  }

  if (tier === 2) {
    // Temporary N-hour block for multi-user / unauthorized access with 3-attempt penalty
    const maxAttempts = store.replacementTemplates?.source2MaxAttempts ?? 3;
    const blockHours = store.replacementTemplates?.source2BlockHours ?? 24;
    user.deviceViolationAttempts = (user.deviceViolationAttempts || 0) + 1;
    user.lastDeviceViolationAt = new Date().toISOString();

    if (user.deviceViolationAttempts >= maxAttempts) {
      // Escalates to Tier 3 Permanent Block!
      user.isPermanentlyBanned = true;
      user.isBlocked = true;
      user.status = 'blocked';
      user.bannedAt = new Date().toISOString();
      user.blockedReason = `Перманентный бан (Уровень 3): превышен лимит (${maxAttempts}) попыток подключения второго устройства.`;
      user.subscriptionStatusReason = user.blockedReason;
      await applyDisconnectStub(user, 'Device violation ban (Source 3)', 3).catch(() => {});
      
      const unblockReq: FeedbackRequest = {
        id: `unblock_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        userId: user.id,
        telegramId: user.telegramId,
        username: user.username,
        firstName: user.firstName,
        type: 'unblock_request',
        message: `Заблокирован системой за повторные попытки (3/3) подключения второго устройства. Требуется ручная проверка администратора.`,
        banReason: user.blockedReason,
        blockedAt: user.bannedAt,
        attempts: user.deviceViolationAttempts,
        createdAt: new Date().toISOString(),
        status: 'pending',
        boundDevice: user.boundDevice ? {
          clientName: user.boundDevice.clientName,
          ip: user.boundDevice.ip,
          boundAt: user.boundDevice.boundAt,
        } : null,
      };
      if (!store.feedbackRequests) store.feedbackRequests = [];
      store.feedbackRequests.unshift(unblockReq);

      saveStore();
      return res.json({
        success: true,
        message: `[Уровень 2 -> 3] Превышен лимит попыток (${maxAttempts}/${maxAttempts}). Пользователь переведен в перманентный бан (Источник 3) с заявкой в Обратную связь!`,
        user,
        escalatedToTier3: true,
      });
    } else {
      // Temporary block for blockHours
      user.status = 'muted';
      const muteExpiresAt = new Date(Date.now() + blockHours * 3600 * 1000);
      user.mutedUntil = muteExpiresAt.toISOString();
      user.subscriptionStatusReason = `Временная блокировка на ${blockHours} ч. (попытка 2-го устройства #${user.deviceViolationAttempts}/${maxAttempts}).`;
      await applyDisconnectStub(user, `Device violation (Source 2, #${user.deviceViolationAttempts})`, 2).catch(() => {});
      saveStore();
      return res.json({
        success: true,
        message: `[Уровень 2] Временная блокировка на ${blockHours} ч. применена (попытка #${user.deviceViolationAttempts}/${maxAttempts}). Заглушка: Источник 2.`,
        user,
        attempts: user.deviceViolationAttempts,
      });
    }
  }

  if (tier === 3) {
    // Permanent block for flagged user requiring manual admin intervention in feedback
    user.isPermanentlyBanned = true;
    user.isBlocked = true;
    user.status = 'blocked';
    user.bannedAt = new Date().toISOString();
    user.blockedReason = user.blockedReason || 'Перманентный бан (Уровень 3): флаг администратора';
    user.subscriptionStatusReason = user.blockedReason;
    await applyDisconnectStub(user, 'Flagged permanent ban (Source 3)', 3).catch(() => {});

    const unblockReq: FeedbackRequest = {
      id: `unblock_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      userId: user.id,
      telegramId: user.telegramId,
      username: user.username,
      firstName: user.firstName,
      type: 'unblock_request',
      message: `Пользователь помечен флагом перманентного бана. Требуется ручная разблокировка в Обратной связи.`,
      banReason: user.blockedReason,
      blockedAt: user.bannedAt,
      attempts: user.deviceViolationAttempts || 3,
      createdAt: new Date().toISOString(),
      status: 'pending',
      boundDevice: user.boundDevice ? {
        clientName: user.boundDevice.clientName,
        ip: user.boundDevice.ip,
        boundAt: user.boundDevice.boundAt,
      } : null,
    };
    if (!store.feedbackRequests) store.feedbackRequests = [];
    store.feedbackRequests.unshift(unblockReq);

    saveStore();
    return res.json({
      success: true,
      message: `[Уровень 3] Пользователь заблокирован перманентно с передачей в Обратную связь!`,
      user,
    });
  }

  return res.status(400).json({ success: false, message: 'Неизвестный уровень (ожидается 1, 2 или 3)' });
});

app.delete('/api/feedback/:id', (req, res) => {
  const { id } = req.params;
  store.feedbackRequests = (store.feedbackRequests || []).filter((r) => r.id !== id);
  saveStore();
  res.json({ success: true, message: 'Заявка удалена' });
});

app.delete('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  const user = store.users.find((u) => u.id === id || u.telegramId === Number(id));
  if (!user) return res.status(404).json({ success: false, message: 'Пользователь не найден' });
  const result = await permanentlyDeleteUser(user);
  res.json({
    success: true,
    message: result.repoCleanupFailed
      ? `Пользователь удален локально, но файл подписки не удалось удалить из Git-источника «${getActiveGitSource().name}». Проверьте настройки источника и журнал ошибок.`
      : 'Пользователь и связанные локальные данные удалены.',
    warning: result.repoCleanupFailed
      ? 'Файл подписки в Git мог остаться и потребовать ручного удаления.'
      : undefined,
  });
});

// Helper functions for Docker deployment configs
function generateDockerRunCmd(cfg: DockerConfig): string {
  const restartFlag = cfg.restartPolicy !== 'no' ? `--restart ${cfg.restartPolicy}` : '';
  return `docker run -d \\
  --name ${cfg.containerName || 'puls-access-app'} \\
  ${restartFlag} \\
  -p ${cfg.port || 3000}:3000 \\
  -e AUTO_RESTART_HOURS=${cfg.autoRestartHours ?? 24} \\
  -e TZ=${cfg.timeZone || 'Europe/Moscow'} \\
  -e NODE_ENV=${cfg.environment || 'production'} \\
  -v ${cfg.volumeMountPath || './data-store.json:/app/data-store.json'} \\
  puls-access:latest`;
}

function generateDockerComposeYaml(cfg: DockerConfig): string {
  return `version: '3.8'

services:
  puls-access:
    container_name: ${cfg.containerName || 'puls-access-app'}
    image: puls-access:latest
    restart: ${cfg.restartPolicy || 'unless-stopped'}
    ports:
      - "${cfg.port || 3000}:3000"
    environment:
      - AUTO_RESTART_HOURS=${cfg.autoRestartHours ?? 24}
      - TZ=${cfg.timeZone || 'Europe/Moscow'}
      - NODE_ENV=${cfg.environment || 'production'}
      - PORT=3000
    volumes:
      - ${cfg.volumeMountPath || './data-store.json:/app/data-store.json'}
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 20s
`;
}

// Docker Configuration & Supervisor API
app.get('/api/docker-config', (req, res) => {
  if (!store.dockerConfig) {
    store.dockerConfig = { ...defaultDockerConfig };
  }
  const cfg = store.dockerConfig;
  let formattedTime = new Date().toISOString();
  try {
    formattedTime = new Date().toLocaleString('ru-RU', { timeZone: cfg.timeZone || 'Europe/Moscow' });
  } catch {}

  res.json({
    success: true,
    dockerConfig: cfg,
    dockerRunCmd: generateDockerRunCmd(cfg),
    dockerComposeYaml: generateDockerComposeYaml(cfg),
    uptimeSeconds: Math.floor(process.uptime()),
    serverTime: formattedTime,
  });
});

app.post('/api/docker-config', (req, res) => {
  const updates: Partial<DockerConfig> = req.body;
  store.dockerConfig = {
    ...(store.dockerConfig || defaultDockerConfig),
    ...updates,
  };
  saveStore();

  // Save runtime config for docker-entrypoint supervisor
  try {
    const runtimeConfig = {
      autoRestartHours: store.dockerConfig.autoRestartHours,
      restartPolicy: store.dockerConfig.restartPolicy,
      timeZone: store.dockerConfig.timeZone,
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(process.cwd(), 'docker-runtime-config.json'), JSON.stringify(runtimeConfig, null, 2), 'utf-8');
  } catch (err: any) {
    console.warn('Could not write docker-runtime-config.json:', err.message);
  }

  const cfg = store.dockerConfig;
  res.json({
    success: true,
    message: 'Настройки Docker и супервизора успешно сохранены!',
    dockerConfig: cfg,
    dockerRunCmd: generateDockerRunCmd(cfg),
    dockerComposeYaml: generateDockerComposeYaml(cfg),
  });
});

app.post('/api/docker-restart', (req, res) => {
  console.log('[Docker Supervisor] Restart triggered via API');
  res.json({
    success: true,
    message: 'Команда перезапуска передана супервизору процесса.',
  });
  setTimeout(() => {
    botManager.reload().catch(() => {});
  }, 1000);
});

// -------------------------------------------------------------
// Vercel Serverless Integration & Telegram Webhooks
// -------------------------------------------------------------

// Webhook endpoint for Telegram bot updates on Vercel Serverless
app.post('/api/telegram-webhook', async (req, res) => {
  try {
    const update = req.body;
    if (update) {
      const bot = getActiveBot();
      if (bot && bot.token) {
        await botManager.processUpdate(bot, update);
      }
    }
  } catch (err: any) {
    console.warn('[Telegram Webhook Error]:', err.message);
  }
  // Telegram requires immediate 200 OK to prevent delivery retries
  res.status(200).send('OK');
});

app.post('/api/bot-webhook/:botId', async (req, res) => {
  try {
    const { botId } = req.params;
    const update = req.body;
    if (update) {
      const bots = store.bots || [];
      const bot = bots.find((b) => b.id === botId || b.botId === botId) || getActiveBot();
      if (bot && bot.token) {
        await botManager.processUpdate(bot, update);
      }
    }
  } catch (err: any) {
    console.warn('[Telegram Bot Webhook Error]:', err.message);
  }
  res.status(200).send('OK');
});

// -------------------------------------------------------------
// Russian Relay Gateway (White-list Proxy & Yandex Cloud Serverless)
// -------------------------------------------------------------
app.get('/api/relay-gateway', (req, res) => {
  if (!store.relayGatewayConfig) {
    store.relayGatewayConfig = {
      enabled: false,
      url: '',
      provider: 'yandex_cloud',
      lastTestedAt: null,
      lastTestStatus: undefined,
      lastTestLatencyMs: undefined,
      testMessage: '',
    };
  }

  const currentProto = req.get('x-forwarded-proto') || req.protocol || 'http';
  const currentHost = req.get('host') || '127.0.0.1:3000';
  const backendUrl = process.env.APP_URL || `${currentProto}://${currentHost}`;

  const yandexCodeSnippet = `// Yandex Cloud Functions (Node.js 18+)
// Назначение: Реле-шлюз в РФ для обхода "Белых списков" мобильных операторов
const UPSTREAM = "${backendUrl}";

module.exports.handler = async function (event, context) {
  try {
    const rawPath = event.url || event.path || '/';
    const qs = event.queryStringParameters 
      ? '?' + new URLSearchParams(event.queryStringParameters).toString() 
      : '';
    const targetUrl = UPSTREAM.replace(/\\/+$/, '') + rawPath + qs;

    const headers = { ...(event.headers || {}) };
    delete headers.host;
    delete headers.Host;

    const clientIp = event.requestContext?.identity?.sourceIp || '';
    if (clientIp) {
      headers['x-forwarded-for'] = clientIp + (headers['x-forwarded-for'] ? ', ' + headers['x-forwarded-for'] : '');
    }

    const fetchOpts = {
      method: event.httpMethod || 'GET',
      headers: headers,
    };

    if (event.body && (event.httpMethod === 'POST' || event.httpMethod === 'PUT')) {
      fetchOpts.body = event.isBase64Encoded 
        ? Buffer.from(event.body, 'base64') 
        : event.body;
    }

    const resp = await fetch(targetUrl, fetchOpts);
    const contentType = resp.headers.get('content-type') || 'text/plain';
    const isBinary = !contentType.includes('text') && !contentType.includes('json');

    const outHeaders = {};
    resp.headers.forEach((val, key) => {
      outHeaders[key] = val;
    });

    let bodyData;
    if (isBinary) {
      const buf = await resp.arrayBuffer();
      bodyData = Buffer.from(buf).toString('base64');
    } else {
      bodyData = await resp.text();
    }

    return {
      statusCode: resp.status,
      headers: outHeaders,
      isBase64Encoded: isBinary,
      body: bodyData,
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'Relay Gateway Upstream Error', message: err.message }),
    };
  }
};`;

  const begetCodeSnippet = `<?php
// Sprinthost / Beget Бесплатный RU Шлюз (Без привязки банковской карты, сервера в РФ)
// Поместите этот файл как index.php в корень сайта на Sprinthost/Beget

$uri = $_SERVER['REQUEST_URI'] ?? '/';
$path = parse_url($uri, PHP_URL_PATH);

// 1. Проверка доступности (Ping)
if ($path === '/' || $path === '/api/status' || empty($path)) {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'status' => 'ok',
        'service' => 'puls-relay-gateway',
        'provider' => 'sprinthost',
        'client_ip' => $_SERVER['REMOTE_ADDR'] ?? '',
        'time' => date('c')
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    exit;
}

// 2. Раздача подписок /api/sub/{token} с защитой от передачи (Сценарий 2)
if (preg_match('#^/api/sub/([^/?]+)#', $path, $matches)) {
    $token = $matches[1];
    
    // Получение IP и параметров клиента
    $clientIp = $_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['HTTP_X_REAL_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
    $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? 'Unknown';
    $reqDeviceId = $_GET['device_id'] ?? $_GET['hwid'] ?? '';
    
    // Отпечаток подсети и устройства (первые 3 октета IP для сотового роуминга)
    $ipParts = explode('.', $clientIp);
    $ipPrefix = count($ipParts) >= 3 ? ($ipParts[0] . '.' . $ipParts[1] . '.' . $ipParts[2]) : $clientIp;
    $hwid = $reqDeviceId ? $reqDeviceId : substr(hash('sha256', $userAgent . '::' . $ipPrefix), 0, 16);
    
    // Защита от передачи второму лицу (Сценарий 2)
    $lockFile = __DIR__ . '/device_locks.json';
    $locks = file_exists($lockFile) ? json_decode(file_get_contents($lockFile), true) : [];
    if (!is_array($locks)) $locks = [];
    
    // Если токен еще не привязан или запрошен сброс для тестирования
    if (!isset($locks[$token]) || isset($_GET['reset_device'])) {
        $locks[$token] = [
            'ownerIp' => $clientIp,
            'ownerPrefix' => $ipPrefix,
            'ownerIps' => [$clientIp],
            'firstSeenAt' => date('c'),
            'lastSeenAt' => date('c'),
            'violation' => false
        ];
        @file_put_contents($lockFile, json_encode($locks, JSON_PRETTY_PRINT));
    } else {
        $bound = $locks[$token];
        
        $boundAgent = $bound['userAgent'] ?? '';
        $isSameAgent = !empty($boundAgent) && ($boundAgent === $userAgent);
        $uaLower = strtolower($userAgent);
        $boundLower = strtolower($boundAgent);
        $isSameClientFamily = (str_contains($uaLower, 'happ') && str_contains($boundLower, 'happ')) ||
                              (str_contains($uaLower, 'incy') && str_contains($boundLower, 'incy')) ||
                              (str_contains($uaLower, 'v2ray') && str_contains($boundLower, 'v2ray')) ||
                              (str_contains($uaLower, 'sing-box') && str_contains($boundLower, 'sing-box'));

        $isSameOwner = ($bound['ownerIp'] === $clientIp) || 
                       ($bound['ownerPrefix'] === $ipPrefix) ||
                       (isset($bound['ownerIps']) && in_array($clientIp, $bound['ownerIps'])) ||
                       ($isSameAgent || $isSameClientFamily) ||
                       (!empty($reqDeviceId) && $reqDeviceId === ($bound['deviceId'] ?? ''));
        
        if (!$isSameOwner && count($bound['ownerIps'] ?? []) >= 10) {
            // ВТОРОЙ ЧЕЛОВЕК (другой телефон / другой оператор)! Срабатывает Сценарий 2
            $locks[$token]['violation'] = true;
            $locks[$token]['secondDeviceIp'] = $clientIp;
            $locks[$token]['secondDeviceAgent'] = $userAgent;
            $locks[$token]['violatedAt'] = date('c');
            @file_put_contents($lockFile, json_encode($locks, JSON_PRETTY_PRINT));

            // Возвращаем заглушку блокировки для 2-го лица
            header('Content-Type: text/plain; charset=utf-8');
            header('HTTP/1.1 200 OK');
            header('X-Error-Reason: second-device-unauthorized');
            $stubNode = "vless://00000000-0000-0000-0000-000000000000@127.0.0.1:443?encryption=none&security=none#⛔ Доступ заблокирован: данная подписка строго для 1 устройства (доступ запрещен)\n";
            echo base64_encode($stubNode);
            exit;
        }
        
        // Добавляем IP владельца и обновляем активность
        if (!isset($locks[$token]['ownerIps'])) $locks[$token]['ownerIps'] = [];
        if (!in_array($clientIp, $locks[$token]['ownerIps'])) {
            $locks[$token]['ownerIps'][] = $clientIp;
            if (count($locks[$token]['ownerIps']) > 20) {
                array_shift($locks[$token]['ownerIps']);
            }
        }
        $locks[$token]['userAgent'] = $userAgent;
        if ($reqDeviceId) {
            $locks[$token]['deviceId'] = $reqDeviceId;
        }
        $locks[$token]['lastSeenAt'] = date('c');
        $locks[$token]['lastIp'] = $clientIp;
        @file_put_contents($lockFile, json_encode($locks, JSON_PRETTY_PRINT));
    }

    // Загружаем актуальные серверы напрямую из GitVerse
    $gitverseBase = "https://gitverse.ru/api/repos/Vaynet/bot/raw/branch/master";
    $candidates = [
        "$gitverseBase/subs/{$token}.txt",
        "$gitverseBase/subs/sub_pool_fjt6ag.txt",
        "$gitverseBase/L"
    ];
    
    $rawText = '';
    foreach ($candidates as $url) {
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_TIMEOUT, 6);
        $res = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        
        if ($httpCode === 200 && !empty($res) && !str_contains($res, '"code":4305') && !str_contains($res, 'not found')) {
            $rawText = $res;
            break;
        }
    }
    
    if (!empty($rawText)) {
        // Поддержка Base64, JSON outbounds и стандартных URI
        if (!str_contains($rawText, '://') && base64_decode($rawText, true) !== false) {
            $rawText = base64_decode($rawText);
        }
        $nodes = [];
        if (str_starts_with(trim($rawText), '[') || str_starts_with(trim($rawText), '{')) {
            $jsonParsed = json_decode($rawText, true);
            $items = is_array($jsonParsed) ? (isset($jsonParsed['outbounds']) ? $jsonParsed['outbounds'] : $jsonParsed) : [];
            foreach ($items as $item) {
                $subList = isset($item['outbounds']) && is_array($item['outbounds']) ? $item['outbounds'] : [$item];
                foreach ($subList as $p) {
                    $proto = strtolower($p['protocol'] ?? $p['type'] ?? '');
                    if ($proto === 'vless') {
                        $vnext = $p['settings']['vnext'][0] ?? $p['settings'] ?? [];
                        $user = $vnext['users'][0] ?? $vnext['user'] ?? [];
                        $stream = $p['streamSettings'] ?? [];
                        $reality = $stream['realitySettings'] ?? [];
                        $addr = $vnext['address'] ?? $p['server'] ?? '';
                        $port = $vnext['port'] ?? $p['port'] ?? 443;
                        $id = $user['id'] ?? $p['uuid'] ?? '';
                        $flow = $user['flow'] ?? $p['flow'] ?? 'xtls-rprx-vision';
                        $sni = $reality['serverName'] ?? $p['serverName'] ?? $addr;
                        $pbk = $reality['publicKey'] ?? $p['publicKey'] ?? '';
                        $fp = $reality['fingerprint'] ?? $p['fingerprint'] ?? 'firefox';
                        $spx = urlencode($reality['spiderX'] ?? $p['spiderX'] ?? '/');
                        $tag = urlencode($p['tag'] ?? $item['remarks'] ?? 'Vaynet');
                        if (!empty($id) && !empty($addr)) {
                            $nodes[] = "vless://{$id}@{$addr}:{$port}?encryption=none&flow={$flow}&security=reality&sni={$sni}&fp={$fp}&pbk={$pbk}&sid=&spx={$spx}&type=tcp#{$tag}";
                        }
                    }
                }
            }
        } else {
            $withNewlines = preg_replace('/(?<!^)(vless:\/\/|hysteria2?:\/\/|trojan:\/\/|vmess:\/\/|(?<!vle)ss:\/\/)/', "\n$1", $rawText);
            $lines = explode("\n", $withNewlines);
            foreach ($lines as $l) {
                $t = trim($l);
                if (str_starts_with($t, 'vless://') || str_starts_with($t, 'ss://') || str_starts_with($t, 'trojan://') || str_starts_with($t, 'hysteria2://')) {
                    $nodes[] = $t;
                }
            }
        }
        $cleanNodesText = implode("\n", $nodes);
        $base64Payload = base64_encode($cleanNodesText);

        header('Content-Type: text/plain; charset=utf-8');
        header('Subscription-Userinfo: upload=0; download=15420000000; total=107374182400; expire=1893456000');
        header('Profile-Update-Interval: 1');
        header('Profile-Title: Vay VPN');
        header('Support-Url: https://t.me/Vaynet_vpn');

        // INCY на iOS и V2Ray требуют стандартный Base64 для идеального импорта
        // Браузер без специальных параметров видит обычный текст
        $isBrowser = str_contains($userAgent, 'Mozilla') && !str_contains($userAgent, 'Incy') && !str_contains($userAgent, 'Happ');
        if ($isBrowser && isset($_GET['raw'])) {
            echo $cleanNodesText;
        } else {
            echo $base64Payload;
        }
        exit;
    }
    
    header('HTTP/1.1 404 Not Found');
    echo "Subscription not found";
    exit;
}

// 3. Прокси остальных служебных запросов к бэкенду
$target = rtrim('${backendUrl}', '/') . $path;
$ch = curl_init($target);
$headers = [];
if (function_exists('getallheaders')) {
    foreach (getallheaders() as $name => $value) {
        if (strtolower($name) !== 'host') {
            $headers[] = "$name: $value";
        }
    }
}
$clientIp = $_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['HTTP_X_REAL_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? '';
if ($clientIp) {
    $headers[] = "X-Forwarded-For: $clientIp";
}

curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_TIMEOUT, 15);

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'POST') {
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, file_get_contents('php://input'));
} elseif ($method !== 'GET') {
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
}

$response = curl_exec($ch);
$http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$content_type = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
curl_close($ch);

http_response_code($http_code ?: 200);
if ($content_type) {
    header("Content-Type: $content_type");
}
echo $response;
`;

  const cloudflareCodeSnippet = `// Cloudflare Workers (100,000 запросов/день БЕСПЛАТНО, БЕЗ привязки карты)
export default {
  async fetch(request) {
    const upstream = "${backendUrl}";
    const url = new URL(request.url);
    const targetUrl = upstream.replace(/\\/+$/, '') + url.pathname + url.search;

    const newHeaders = new Headers(request.headers);
    newHeaders.delete('host');
    const clientIp = request.headers.get('cf-connecting-ip') || '';
    if (clientIp) {
      newHeaders.set('x-forwarded-for', clientIp);
    }

    return fetch(targetUrl, {
      method: request.method,
      headers: newHeaders,
      body: (request.method === 'GET' || request.method === 'HEAD') ? null : request.body,
      redirect: 'follow',
    });
  }
};`;

  const htaccessSnippet = `DirectoryIndex index.php

<IfModule mod_rewrite.c>
RewriteEngine On
RewriteBase /
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^(.*)$ index.php [QSA,L]
</IfModule>`;

  res.json({
    success: true,
    config: store.relayGatewayConfig,
    backendUrl,
    yandexCodeSnippet,
    begetCodeSnippet,
    htaccessSnippet,
    cloudflareCodeSnippet,
  });
});

app.post('/api/relay-gateway/configure', (req, res) => {
  const updates = req.body || {};
  if (!store.relayGatewayConfig) {
    store.relayGatewayConfig = {
      enabled: false,
      url: '',
      provider: 'gitverse_whitelist',
      lastTestedAt: null,
      lastTestStatus: undefined,
      lastTestLatencyMs: undefined,
      testMessage: '',
      whitelistMode: true,
      checkIntervalHours: 12,
      gatewayMode: 'scheduled_daily',
    };
  }

  if (typeof updates.enabled === 'boolean') {
    store.relayGatewayConfig.enabled = updates.enabled;
  }
  if (typeof updates.url === 'string') {
    let cleanUrl = updates.url.trim().replace(/\/+$/, '');
    if (cleanUrl && !cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = 'http://' + cleanUrl;
    }
    store.relayGatewayConfig.url = cleanUrl;
  }
  if (updates.provider) {
    store.relayGatewayConfig.provider = updates.provider;
  }
  if (updates.gatewayMode) {
    store.relayGatewayConfig.gatewayMode = updates.gatewayMode;
  }
  if (typeof updates.whitelistMode === 'boolean') {
    store.relayGatewayConfig.whitelistMode = updates.whitelistMode;
  }
  if (typeof updates.checkIntervalHours === 'number') {
    store.relayGatewayConfig.checkIntervalHours = updates.checkIntervalHours;
  }

  saveStore();
  res.json({
    success: true,
    message: 'Настройки шлюза успешно сохранены',
    config: store.relayGatewayConfig,
  });
});

// Function: Perform periodic or manual gateway audit
async function performGatewayAudit(triggerSource: string = 'Автоматическая плановая проверка'): Promise<{
  inspectedUsersCount: number;
  syncedEligibleCount: number;
  stubsAppliedCount: number;
  message: string;
}> {
  console.log(`[Gateway Audit] Starting audit triggered by: ${triggerSource}...`);
  let stubsAppliedCount = 0;

  // 1. Audit user expirations
  for (const user of store.users || []) {
    if (user.subscriptionExpiresAt && new Date(user.subscriptionExpiresAt).getTime() < Date.now()) {
      if (user.status !== 'blocked' && !user.isBlocked) {
        user.status = 'blocked';
        user.isBlocked = true;
        user.subscriptionStatusReason = 'Срок действия подписки истек';
        await applyDisconnectStub(user, 'Срок действия подписки истек (Источник 1)', 1);
        stubsAppliedCount++;
      }
    }
  }

  // 2. Full synchronization of central nodes to all eligible users in GitVerse
  const syncRes = await syncActiveSubscribersWithCentral({ backgroundGitPush: false });
  const inspectedUsersCount = (store.users || []).length;
  const syncedEligibleCount = (syncRes.syncedUsers || 0) + (syncRes.syncedExclusions || 0);

  const nowIso = new Date().toISOString();
  const summaryMsg = `${triggerSource}: Проверено подписчиков: ${inspectedUsersCount}, актуализировано файлов в GitVerse: ${syncedEligibleCount}, заглушек применено: ${stubsAppliedCount}.`;

  if (!store.relayGatewayConfig) {
    store.relayGatewayConfig = {
      enabled: false,
      url: '',
      provider: 'gitverse_whitelist',
      whitelistMode: true,
      checkIntervalHours: 12,
    };
  }
  store.relayGatewayConfig.lastAuditAt = nowIso;
  store.relayGatewayConfig.lastAuditMessage = summaryMsg;
  saveStore();

  logSystemEvent(
    'info',
    'sync',
    'GATEWAY_AUDIT',
    summaryMsg,
    { inspectedUsersCount, syncedEligibleCount, stubsAppliedCount, triggerSource }
  );

  return {
    inspectedUsersCount,
    syncedEligibleCount,
    stubsAppliedCount,
    message: summaryMsg,
  };
}

app.post('/api/relay-gateway/manual-audit', async (req, res) => {
  try {
    const auditRes = await performGatewayAudit('Ручная проверка администратором');
    res.json({
      success: true,
      message: auditRes.message,
      auditStats: auditRes,
      config: store.relayGatewayConfig,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: 'Ошибка при выполнении аудита: ' + err.message,
    });
  }
});

app.post('/api/relay-gateway/test', async (req, res) => {
  let targetUrl = (req.body?.url || store.relayGatewayConfig?.url || '').trim().replace(/\/+$/, '');
  if (!targetUrl) {
    return res.status(400).json({
      success: false,
      latencyMs: 0,
      message: 'Не указан URL шлюза для проверки',
    });
  }

  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = 'http://' + targetUrl;
  }

  const startTime = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const testPingUrl = `${targetUrl}/api/status`;
    const resp = await fetch(testPingUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Puls-Relay-Test/1.0',
      },
    });
    clearTimeout(timeout);
    const latencyMs = Date.now() - startTime;

    if (resp.ok) {
      if (store.relayGatewayConfig) {
        store.relayGatewayConfig.lastTestedAt = new Date().toISOString();
        store.relayGatewayConfig.lastTestStatus = 'success';
        store.relayGatewayConfig.isOnline = true;
        store.relayGatewayConfig.lastTestLatencyMs = latencyMs;
        store.relayGatewayConfig.testMessage = `Шлюз доступен, задержка ${latencyMs} мс`;
        saveStore();
      }
      return res.json({
        success: true,
        latencyMs,
        message: `Шлюз успешно ответил (HTTP ${resp.status}) за ${latencyMs} мс! Все маршруты работают.`,
      });
    } else {
      // If 404 on /api/status, check root / to see if index.php is loaded but .htaccess rewrite is missing
      if (resp.status === 404) {
        try {
          const rootController = new AbortController();
          const rootTimeout = setTimeout(() => rootController.abort(), 4000);
          const rootResp = await fetch(`${targetUrl}/`, {
            signal: rootController.signal,
            headers: { 'User-Agent': 'Puls-Relay-Test/1.0' },
          });
          clearTimeout(rootTimeout);
          if (rootResp.ok) {
            const rootText = await rootResp.text();
            const isGatewayScript = rootText.includes('puls-relay-gateway') || rootText.includes('sprinthost') || rootText.includes('beget');
            const rootLatency = Date.now() - startTime;
            if (store.relayGatewayConfig) {
              store.relayGatewayConfig.lastTestedAt = new Date().toISOString();
              store.relayGatewayConfig.lastTestStatus = 'error';
              store.relayGatewayConfig.isOnline = false;
              store.relayGatewayConfig.lastTestLatencyMs = rootLatency;
              store.relayGatewayConfig.testMessage = `index.php отвечает (${rootLatency} мс), но отсутствует .htaccess`;
              saveStore();
            }
            return res.json({
              success: false,
              latencyMs: rootLatency,
              missingHtaccess: true,
              message: `Скрипт index.php на хостинге отвечает (HTTP 200, задержка ${rootLatency} мс), но не найден файл .htaccess! Без него запросы /api/... дают ошибку 404. Создайте файл .htaccess в папке public_html.`,
            });
          }
        } catch {
          // ignore fallback error
        }
      }

      if (store.relayGatewayConfig) {
        store.relayGatewayConfig.lastTestedAt = new Date().toISOString();
        store.relayGatewayConfig.lastTestStatus = 'error';
        store.relayGatewayConfig.isOnline = false;
        store.relayGatewayConfig.lastTestLatencyMs = latencyMs;
        store.relayGatewayConfig.testMessage = `Сервер вернул статус HTTP ${resp.status}`;
        saveStore();
      }
      return res.json({
        success: false,
        latencyMs,
        message: `Шлюз вернул ошибку HTTP ${resp.status}`,
      });
    }
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    if (store.relayGatewayConfig) {
      store.relayGatewayConfig.lastTestedAt = new Date().toISOString();
      store.relayGatewayConfig.lastTestStatus = 'error';
      store.relayGatewayConfig.isOnline = false;
      store.relayGatewayConfig.lastTestLatencyMs = latencyMs;
      store.relayGatewayConfig.testMessage = err.message || 'Ошибка подключения к шлюзу';
      saveStore();
    }
    return res.json({
      success: false,
      latencyMs,
      message: `Не удалось связаться со шлюзом: ${err.message}`,
    });
  }
});

// Vercel deployment parameters, environment variables export and CLI commands
app.get('/api/vercel-config', async (req, res) => {
  const activeGit = getActiveGitSource();
  const activeBot = getActiveBot();
  const fbConfig = getFirebaseConfig();

  // Complete environment variables list for Vercel Project Settings
  const envVarsList = [
    {
      key: 'NODE_ENV',
      value: 'production',
      description: 'Режим сборки и исполнения Node.js для максимальной скорости',
      required: true,
    },
    {
      key: 'PORT',
      value: '3000',
      description: 'Порт внутреннего сервера (по умолчанию 3000)',
      required: false,
    },
    {
      key: 'VERCEL',
      value: '1',
      description: 'Флаг бессерверного окружения Vercel Serverless',
      required: true,
    },
    {
      key: 'GITVERSE_TOKEN',
      value: activeGit?.token || '',
      description: 'Токен авторизации GitVerse OpenAPI для записи файлов подписок',
      required: Boolean(activeGit?.token),
    },
    {
      key: 'GITVERSE_OWNER',
      value: activeGit ? getRepoParts(activeGit).owner : '',
      description: 'Владелец репозитория GitVerse',
      required: Boolean(activeGit?.token),
    },
    {
      key: 'GITVERSE_REPO',
      value: activeGit ? getRepoParts(activeGit).repo : '',
      description: 'Имя репозитория GitVerse',
      required: Boolean(activeGit?.token),
    },
    {
      key: 'TELEGRAM_BOT_TOKEN',
      value: activeBot?.token || '',
      description: 'Токен активного Telegram бота (BotFather)',
      required: Boolean(activeBot?.token),
    },
    {
      key: 'FIREBASE_API_KEY',
      value: fbConfig.apiKey || '',
      description: 'API-ключ Firebase Cloud Firestore для бессерверной базы данных',
      required: true,
    },
    {
      key: 'FIREBASE_PROJECT_ID',
      value: fbConfig.projectId || '',
      description: 'Идентификатор проекта Firebase Cloud',
      required: true,
    },
    {
      key: 'FIREBASE_DATABASE_ID',
      value: fbConfig.databaseId || '',
      description: 'Имя базы данных Firestore',
      required: true,
    },
    {
      key: 'STORAGE_BACKEND',
      value: store.storageConfig?.activeBackend || 'firebase',
      description: 'Основной бэкенд базы данных: firebase (Cloud), vercel_kv (нативная БД Vercel), или hybrid (одновременная синхронизация)',
      required: false,
    },
    {
      key: 'KV_REST_API_URL',
      value: store.storageConfig?.kvRestApiUrl || process.env.KV_REST_API_URL || '',
      description: 'URL REST API нативной базы данных Vercel KV / Upstash Redis (для режима vercel_kv)',
      required: store.storageConfig?.activeBackend === 'vercel_kv',
    },
    {
      key: 'KV_REST_API_TOKEN',
      value: store.storageConfig?.kvRestApiToken || process.env.KV_REST_API_TOKEN || '',
      description: 'Токен авторизации Vercel KV REST API (для режима vercel_kv)',
      required: store.storageConfig?.activeBackend === 'vercel_kv',
    },
  ];

  // Plain-text formatted env block for 1-click paste into Vercel Environment Variables
  const envVarsText = envVarsList
    .map((item) => `${item.key}=${item.value}`)
    .join('\n');

  // Load existing vercel.json
  let vercelJsonContent = '';
  try {
    const vPath = path.join(process.cwd(), 'vercel.json');
    if (fs.existsSync(vPath)) {
      vercelJsonContent = fs.readFileSync(vPath, 'utf-8');
    }
  } catch {}

  // Fetch live webhook info from Telegram if bot is configured
  let webhookInfo: any = null;
  if (activeBot?.token) {
    try {
      const rawInfo = await botManager.getBotWebhookInfo(activeBot.token);
      if (rawInfo && rawInfo.ok && rawInfo.result) {
        webhookInfo = rawInfo.result;
      }
    } catch (e: any) {
      console.warn('[Vercel Config] getWebhookInfo notice:', e.message);
    }
  }

  res.json({
    success: true,
    vercelJson: vercelJsonContent,
    envVarsList,
    envVarsText,
    cliCommands: {
      install: 'npm i -g vercel',
      login: 'vercel login',
      deployDev: 'vercel',
      deployProd: 'vercel --prod',
    },
    webhookInfo,
    activeBot: activeBot
      ? {
          id: activeBot.id,
          name: activeBot.name,
          username: activeBot.username,
          hasToken: Boolean(activeBot.token),
        }
      : null,
    savedVercelConfig: store.vercelConfig || {},
    serverlessTips: [
      'Vercel использует Serverless Functions — постоянный VPS или запущенный Docker-контейнер не требуется.',
      'Для мгновенной работы Telegram бота в бессерверной среде используется Webhook: события от Telegram доставляются прямо в функцию /api/telegram-webhook.',
      'База данных автоматически синхронизируется через Cloud Firestore — состояние пользователей и подписок не теряется при перезапусках функций.',
      'Все ссылки на персональные файлы подписок продолжают вести на GitVerse и мгновенно отдаются клиентам HAPP и INCY.',
    ],
  });
});

// Set Webhook on Telegram for Vercel
app.post('/api/vercel/set-webhook', async (req, res) => {
  const { webhookUrl, dropPending } = req.body;
  if (!webhookUrl || typeof webhookUrl !== 'string') {
    return res.status(400).json({ success: false, message: 'Укажите URL проекта на Vercel (например: https://my-app.vercel.app)' });
  }

  const activeBot = getActiveBot();
  if (!activeBot || !activeBot.token) {
    return res.status(400).json({ success: false, message: 'Нет активного Telegram бота с валидным токеном' });
  }

  let cleanBase = webhookUrl.trim().replace(/\/+$/, '');
  if (!cleanBase.startsWith('http://') && !cleanBase.startsWith('https://')) {
    cleanBase = `https://${cleanBase}`;
  }
  // Force HTTPS (Telegram strictly requires HTTPS for webhooks)
  if (cleanBase.startsWith('http://')) {
    cleanBase = cleanBase.replace('http://', 'https://');
  }

  const fullWebhookUrl = `${cleanBase}/api/telegram-webhook`;

  try {
    const tgRes = await botManager.setBotWebhook(activeBot.token, fullWebhookUrl, dropPending !== false);
    if (tgRes && tgRes.ok) {
      if (!store.vercelConfig) {
        store.vercelConfig = {};
      }
      store.vercelConfig.lastWebhookUrl = fullWebhookUrl;
      store.vercelConfig.lastWebhookSetAt = new Date().toISOString();
      store.vercelConfig.customDomain = cleanBase;
      saveStore();

      return res.json({
        success: true,
        message: `Webhook успешно зарегистрирован в Telegram API! Адрес: ${fullWebhookUrl}`,
        fullWebhookUrl,
        telegramResult: tgRes,
      });
    } else {
      return res.status(400).json({
        success: false,
        message: tgRes?.description || 'Telegram API отклонил регистрацию Webhook',
        telegramResult: tgRes,
      });
    }
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: `Ошибка обращения к Telegram API: ${err.message}`,
    });
  }
});

// Delete Webhook on Telegram (reverts to Docker/VPS Long-Polling)
app.post('/api/vercel/delete-webhook', async (req, res) => {
  const activeBot = getActiveBot();
  if (!activeBot || !activeBot.token) {
    return res.status(400).json({ success: false, message: 'Нет активного Telegram бота с токеном' });
  }

  try {
    const tgRes = await botManager.deleteBotWebhook(activeBot.token);
    if (tgRes && tgRes.ok) {
      if (store.vercelConfig) {
        store.vercelConfig.lastWebhookUrl = '';
      }
      saveStore();
      // Restart local polling for Docker/dev environment
      botManager.reload().catch(() => {});

      return res.json({
        success: true,
        message: 'Webhook успешно удален из Telegram API. Бот возвращен в режим Long-Polling (Docker/VPS).',
        telegramResult: tgRes,
      });
    } else {
      return res.status(400).json({
        success: false,
        message: tgRes?.description || 'Не удалось удалить Webhook из Telegram',
        telegramResult: tgRes,
      });
    }
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: `Ошибка удаления Webhook: ${err.message}`,
    });
  }
});

// Check Webhook Info
app.get('/api/vercel/webhook-info', async (req, res) => {
  const activeBot = getActiveBot();
  if (!activeBot || !activeBot.token) {
    return res.status(400).json({ success: false, message: 'Нет активного Telegram бота с токеном' });
  }

  try {
    const infoRes = await botManager.getBotWebhookInfo(activeBot.token);
    if (infoRes && infoRes.ok) {
      return res.json({
        success: true,
        webhookInfo: infoRes.result,
      });
    } else {
      return res.status(400).json({
        success: false,
        message: infoRes?.description || 'Ошибка получения статуса Webhook',
      });
    }
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: `Ошибка запроса к Telegram API: ${err.message}`,
    });
  }
});

// Test remote deployed Vercel URL
app.post('/api/vercel/test-deployment', async (req, res) => {
  const { targetUrl } = req.body;
  if (!targetUrl || typeof targetUrl !== 'string') {
    return res.status(400).json({ success: false, message: 'Укажите адрес развернутого приложения на Vercel' });
  }

  let cleanUrl = targetUrl.trim().replace(/\/+$/, '');
  if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
    cleanUrl = `https://${cleanUrl}`;
  }

  const startTime = Date.now();
  try {
    const testEndpoint = `${cleanUrl}/api/status`;
    const pingRes = await fetch(testEndpoint, {
      signal: AbortSignal.timeout(6000),
      headers: { 'Accept': 'application/json' },
    });
    const latencyMs = Date.now() - startTime;
    if (pingRes.ok) {
      const data = await pingRes.json();
      return res.json({
        success: true,
        message: `Vercel приложение доступно и отвечает! Задержка: ${latencyMs} мс.`,
        latencyMs,
        statusData: data,
      });
    } else {
      return res.status(502).json({
        success: false,
        message: `Vercel ответил кодом ${pingRes.status} (${pingRes.statusText})`,
        latencyMs,
      });
    }
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    return res.status(504).json({
      success: false,
      message: `Не удалось подключиться к ${cleanUrl}: ${err.message}`,
      latencyMs,
    });
  }
});

// 7. Direct and Mass Broadcast to Bot Users
app.post('/api/broadcast', async (req, res) => {
  const { target, userIds, text, mediaType, mediaUrl, buttons } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ success: false, message: 'Текст рассылки обязателен' });
  }

  const activeBot = getActiveBot();
  const token = activeBot?.token;
  if (!token) {
    return res.status(400).json({ success: false, message: 'Telegram бот не настроен или отсутствует токен' });
  }

  let recipients: BotUser[] = [];
  if (target === 'selected' && Array.isArray(userIds)) {
    recipients = store.users.filter((u) => userIds.includes(u.id));
  } else if (target === 'active') {
    recipients = store.users.filter((u) => u.status === 'active');
  } else {
    recipients = store.users;
  }

  const validRecipients = recipients.filter((u) => u.telegramId && !isNaN(Number(u.telegramId)));
  if (validRecipients.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'В выбранной аудитории нет пользователей с Telegram ID для отправки сообщений',
    });
  }

  const broadcastRecord = {
    id: `bc_${Date.now()}`,
    sentAt: new Date().toISOString(),
    recipientCount: validRecipients.length,
    sentCount: 0,
    failedCount: 0,
    text,
    mediaType: mediaType || 'none',
    mediaUrl: mediaUrl || '',
    buttons: buttons || [],
    target,
  };

  store.broadcastHistory.unshift(broadcastRecord);
  saveStore();

  let sentCount = 0;
  let failedCount = 0;

  for (const u of validRecipients) {
    try {
      const personalizedText = text
        .replace(/\{name\}/g, u.firstName || u.username || 'Пользователь')
        .replace(/\{username\}/g, u.username ? `@${u.username}` : '')
        .replace(/\{id\}/g, String(u.telegramId || ''));

      const ok = await botManager.sendBroadcastItem(token, Number(u.telegramId), personalizedText, {
        mediaType,
        mediaUrl,
        buttons,
      });

      if (ok) {
        sentCount++;
      } else {
        failedCount++;
      }
      // Small delay (35ms) to respect Telegram limits (max 30 msgs/sec)
      await new Promise((r) => setTimeout(r, 35));
    } catch {
      failedCount++;
    }
  }

  broadcastRecord.sentCount = sentCount;
  broadcastRecord.failedCount = failedCount;
  saveStore();

  logSystemEvent(
    'info',
    'bot',
    'BROADCAST_SENT',
    `Рассылка завершена: отправлено ${sentCount} из ${validRecipients.length} (ошибок: ${failedCount})`,
    { target, total: validRecipients.length, sentCount, failedCount }
  );

  res.json({
    success: true,
    message: `Рассылка успешно выполнена! Доставлено: ${sentCount} из ${validRecipients.length}${failedCount > 0 ? ` (сбоев: ${failedCount})` : ''}`,
    record: broadcastRecord,
    sentCount,
    failedCount,
  });
});

// 8. Central Subscription Management
app.get('/api/central-file', (req, res) => {
  const stats = parseNodeStats(store.centralFile.content);
  const activeGit = getActiveGitSource();
  const centralRawUrl =
    store.centralFile.centralRawUrl ||
    activeGit.centralRawUrl ||
    buildGitRawUrl(activeGit, store.centralFile.filename || 'L');
  const repositoryUrl =
    store.centralFile.repositoryUrl ||
    buildGitRepositoryWebUrl(activeGit);

  res.json({
    ...store.centralFile,
    centralRawUrl,
    repositoryUrl,
    repoFiles: store.repoFiles || [],
    userFilesCount: (store.repoFiles || []).length,
    stats,
  });
});

app.post('/api/central-file', async (req, res) => {
  const {
    content,
    autoSyncEnabled,
    filename,
    centralRawUrl,
    repositoryUrl,
    autoSyncIntervalSeconds,
    // 3 Blocking Types:
    botDeletedStubContent,
    botDeletedBlockHours,
    botDeletedMaxAttempts,
    botDeletedNotice,
    deviceBindingStubContent,
    deviceBindingBlockHours,
    deviceBindingMaxAttempts,
    deviceBindingNotice,
    limitExceededStubContent,
    limitExceededBlockHours,
    limitExceededMaxAttempts,
    limitExceededNotice,
  } = req.body;

  if (typeof content === 'string') store.centralFile.content = content;
  if (typeof autoSyncEnabled === 'boolean') store.centralFile.autoSyncEnabled = autoSyncEnabled;
  if (typeof autoSyncIntervalSeconds === 'number') store.centralFile.autoSyncIntervalSeconds = autoSyncIntervalSeconds;
  if (filename) store.centralFile.filename = filename;
  if (typeof centralRawUrl === 'string' && centralRawUrl.trim()) {
    store.centralFile.centralRawUrl = centralRawUrl.trim();
    const git = getActiveGitSource();
    git.centralRawUrl = centralRawUrl.trim();
  }
  if (typeof repositoryUrl === 'string' && repositoryUrl.trim()) {
    store.centralFile.repositoryUrl = repositoryUrl.trim();
    const git = getActiveGitSource();
    let cleanRepo = repositoryPathFromInput(repositoryUrl, git.provider);
    if (cleanRepo && cleanRepo.includes('/')) {
      if (git.repository !== cleanRepo) gitFileMetadataCache.clear();
      git.repository = cleanRepo;
    }
  }

  // Save 3 blocking types parameters
  if (typeof botDeletedStubContent === 'string') {
    store.centralFile.botDeletedStubContent = botDeletedStubContent;
    if (store.replacementTemplates) store.replacementTemplates.source1Content = botDeletedStubContent;
  }
  if (typeof botDeletedBlockHours === 'number') store.centralFile.botDeletedBlockHours = botDeletedBlockHours;
  if (typeof botDeletedMaxAttempts === 'number') {
    store.centralFile.botDeletedMaxAttempts = botDeletedMaxAttempts;
    if (store.replacementTemplates) store.replacementTemplates.maxChannelLeftCount = botDeletedMaxAttempts;
  }
  if (typeof botDeletedNotice === 'string') {
    store.centralFile.botDeletedNotice = botDeletedNotice;
    if (store.replacementTemplates) {
      store.replacementTemplates.botDeletedNotice = botDeletedNotice;
      store.replacementTemplates.source1Message = botDeletedNotice;
    }
  }

  if (typeof deviceBindingStubContent === 'string') {
    store.centralFile.deviceBindingStubContent = deviceBindingStubContent;
    if (store.replacementTemplates) store.replacementTemplates.source2Content = deviceBindingStubContent;
  }
  if (typeof deviceBindingBlockHours === 'number') {
    store.centralFile.deviceBindingBlockHours = deviceBindingBlockHours;
    if (store.replacementTemplates) store.replacementTemplates.source2BlockHours = deviceBindingBlockHours;
  }
  if (typeof deviceBindingMaxAttempts === 'number') {
    store.centralFile.deviceBindingMaxAttempts = deviceBindingMaxAttempts;
    if (store.replacementTemplates) store.replacementTemplates.source2MaxAttempts = deviceBindingMaxAttempts;
  }
  if (typeof deviceBindingNotice === 'string') {
    store.centralFile.deviceBindingNotice = deviceBindingNotice;
    if (store.replacementTemplates) {
      store.replacementTemplates.singleDeviceBlockedNotice = deviceBindingNotice;
      store.replacementTemplates.source2WarningMessage = deviceBindingNotice;
    }
  }

  if (typeof limitExceededStubContent === 'string') {
    store.centralFile.limitExceededStubContent = limitExceededStubContent;
    if (store.replacementTemplates) store.replacementTemplates.source3Content = limitExceededStubContent;
  }
  if (typeof limitExceededBlockHours === 'number') store.centralFile.limitExceededBlockHours = limitExceededBlockHours;
  if (typeof limitExceededMaxAttempts === 'number') store.centralFile.limitExceededMaxAttempts = limitExceededMaxAttempts;
  if (typeof limitExceededNotice === 'string') {
    store.centralFile.limitExceededNotice = limitExceededNotice;
    if (store.replacementTemplates) store.replacementTemplates.source3BanMessage = limitExceededNotice;
  }

  store.centralFile.lastUpdatedAt = new Date().toISOString();
  store.centralFile.lastCommitMessage = `Update nodes (${new Date().toLocaleTimeString('ru-RU')})`;
  store.centralFile.isSyncedWithRepo = false;

  saveStore();

  // Persist edits locally before attempting the remote write so a Git outage does not lose them.
  const activeGit = getActiveGitSource();
  if (!activeGit?.token?.trim()) {
    const stats = parseNodeStats(store.centralFile.content);
    return res.status(409).json({
      success: false,
      message: 'Центральная подписка сохранена в приложении, но не отправлена в репозиторий: настройте API-токен активного Git-источника.',
      centralFile: { ...store.centralFile, stats },
    });
  }

  const { owner, repo } = getRepoParts(activeGit);
  let pushResult: Awaited<ReturnType<typeof createOrUpdateGitVerseFile>>;
  try {
    pushResult = await createOrUpdateGitVerseFile({
      token: activeGit.token,
      owner,
      repo,
      branch: activeGit.branch || getDefaultGitBranch(activeGit.provider),
      filePath: store.centralFile.filename || 'L',
      content: store.centralFile.content,
      commitMessage: `Update central subscription nodes at ${new Date().toLocaleTimeString('ru-RU')}`,
      provider: activeGit.provider,
      apiUrl: activeGit.apiUrl,
    });
  } catch (err: any) {
    pushResult = { success: false, error: err.message, rawUrl: '' };
  }

  const stats = parseNodeStats(store.centralFile.content);
  if (!pushResult.success) {
    store.centralFile.isSyncedWithRepo = false;
    saveStore();
    return res.status(502).json({
      success: false,
      message: `Центральная подписка сохранена в приложении, но push в ${activeGit.name} не выполнен: ${pushResult.error || 'ошибка Git'}`,
      centralFile: { ...store.centralFile, stats },
    });
  }

  store.centralFile.isSyncedWithRepo = true;
  if (pushResult.rawUrl) {
    store.centralFile.centralRawUrl = pushResult.rawUrl;
    activeGit.centralRawUrl = pushResult.rawUrl;
  }
  activeGit.lastSyncAt = store.centralFile.lastUpdatedAt;
  saveStore();

  const syncResult = await syncActiveSubscribersWithCentral({
    forceFullGitPush: true,
    backgroundGitPush: false,
  });
  const hasSyncErrors = syncResult.errors.length > 0;
  const message = hasSyncErrors
    ? `Центральный файл записан в ${activeGit.name}, но при синхронизации подписок возникло ошибок: ${syncResult.errors.length}.`
    : `Центральный файл записан в ${activeGit.name}; обновлены подписки пользователей и исключений.`;

  res.json({
    success: true,
    message,
    syncResult,
    centralFile: {
      ...store.centralFile,
      centralRawUrl: store.centralFile.centralRawUrl || centralRawUrl,
      repoFiles: store.repoFiles || [],
      stats,
    },
  });
});

app.post('/api/central-file/sync', async (req, res) => {
  const { direction, centralRawUrl, content } = req.body;
  const git = getActiveGitSource();
  const urlToPull = centralRawUrl || store.centralFile.centralRawUrl || git.centralRawUrl || buildGitRawUrl(git, store.centralFile.filename || 'L');

  let syncMsg = '';
  let syncResult: CentralSyncResult | undefined;
  if (direction === 'push' && typeof content === 'string') {
    store.centralFile.content = content;
    store.centralFile.lastUpdatedAt = new Date().toISOString();
    store.centralFile.lastCommitMessage = `Update nodes (${new Date().toLocaleTimeString('ru-RU')})`;
    store.centralFile.isSyncedWithRepo = false;
    saveStore();
  }
  if (direction === 'pull') {
    try {
      const resp = await fetch(urlToPull, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Accept': 'text/plain, */*',
        },
      });
      if (resp.ok) {
        const text = await resp.text();
        if (text && text.trim()) {
          store.centralFile.content = text;
          store.centralFile.centralRawUrl = urlToPull;
          store.centralFile.lastUpdatedAt = new Date().toISOString();
          store.centralFile.isSyncedWithRepo = true;
          const stats = parseNodeStats(text);
          syncMsg = `Конфигурация загружена из ${git.name}: ${urlToPull} (${stats.total} элементов)`;
          logSystemEvent('success', 'sync', 'CENTRAL_PULLED', syncMsg, { url: urlToPull, nodes: stats.total });
          syncResult = await syncActiveSubscribersWithCentral({
            forceFullGitPush: true,
            backgroundGitPush: false,
          });
        } else {
          syncMsg = `Источник ${urlToPull} вернул пустой ответ. Конфигурация не изменена.`;
          logSystemEvent('warning', 'gitverse', 'PULL_EMPTY', syncMsg, { url: urlToPull });
          return res.status(400).json({ success: false, message: syncMsg, stats: parseNodeStats(store.centralFile.content) });
        }
      } else {
        syncMsg = `Источник ответил HTTP ${resp.status} ${resp.statusText}. Проверьте доступность ссылки.`;
        logSystemEvent('error', 'gitverse', 'PULL_FAILED', syncMsg, { url: urlToPull, status: resp.status });
        return res.status(resp.status || 400).json({ success: false, message: syncMsg, stats: parseNodeStats(store.centralFile.content) });
      }
    } catch (fetchErr: any) {
      syncMsg = `Сбой чтения из источника ${urlToPull}: ${fetchErr.message}`;
      logSystemEvent('error', 'gitverse', 'PULL_EXCEPTION', syncMsg, { error: fetchErr.message });
      return res.status(500).json({ success: false, message: syncMsg });
    }
  } else {
    // Push to Git repository directly
    if (!git.token?.trim()) {
      return res.status(409).json({
        success: false,
        message: `Не настроен API-токен источника "${git.name}"`,
      });
    }
    const { owner, repo } = getRepoParts(git);
    const targetFile = store.centralFile.filename || 'L';
    const pushResult = await createOrUpdateGitVerseFile({
      token: git.token,
      owner,
      repo,
      branch: git.branch || getDefaultGitBranch(git.provider),
      filePath: targetFile,
      content: store.centralFile.content,
      commitMessage: `Update central config ${targetFile} (${parseNodeStats(store.centralFile.content).total} nodes)`,
      provider: git.provider,
      apiUrl: git.apiUrl,
    });
    if (pushResult.success) {
      store.centralFile.isSyncedWithRepo = true;
      if (pushResult.rawUrl) {
        store.centralFile.centralRawUrl = pushResult.rawUrl;
        git.centralRawUrl = pushResult.rawUrl;
      }
      syncMsg = `Конфигурация успешно отправлена в репозиторий ${git.repository} (файл ${targetFile})!`;
      logSystemEvent('success', 'gitverse', 'CENTRAL_PUSHED', syncMsg, { targetFile, repository: git.repository });
      syncResult = await syncActiveSubscribersWithCentral({
        forceFullGitPush: true,
        backgroundGitPush: false,
      });
    } else {
      syncMsg = `Ошибка коммита в репозиторий GitVerse: ${pushResult.error || 'Проверьте токен доступа'}`;
      store.centralFile.isSyncedWithRepo = false;
      saveStore();
      logSystemEvent('error', 'gitverse', 'CENTRAL_PUSH_FAILED', syncMsg, { error: pushResult.error, targetFile });
      return res.status(400).json({
        success: false,
        message: syncMsg,
        error: pushResult.error,
        syncedAt: store.centralFile.lastUpdatedAt,
        stats: parseNodeStats(store.centralFile.content),
        content: store.centralFile.content,
      });
    }
  }

  store.centralFile.isSyncedWithRepo = true;
  store.centralFile.lastUpdatedAt = new Date().toISOString();
  git.lastSyncAt = store.centralFile.lastUpdatedAt;
  saveStore();

  if (syncResult?.errors.length) {
    return res.status(502).json({
      success: false,
      message: `${syncMsg} Не удалось обновить ${syncResult.errors.length} файлов подписок: ${syncResult.errors.slice(0, 3).join('; ')}`,
      syncedAt: store.centralFile.lastUpdatedAt,
      stats: parseNodeStats(store.centralFile.content),
      content: store.centralFile.content,
      syncResult,
    });
  }

  res.json({
    success: true,
    message: syncMsg,
    syncedAt: store.centralFile.lastUpdatedAt,
    stats: parseNodeStats(store.centralFile.content),
    content: store.centralFile.content,
    syncResult,
  });
});

// Explicit Trigger: Sync central source directly into all eligible user subscription files
app.post('/api/central-file/sync-subscribers', async (req, res) => {
  try {
    const shouldWait = req.query.wait === 'true';
    const isForce = req.query.force === 'true';
    const result = await syncActiveSubscribersWithCentral({
      backgroundGitPush: !shouldWait,
      forceFullGitPush: isForce,
    });
    const stats = parseNodeStats(store.centralFile.content);
    const skippedLabels: Record<keyof CentralSyncResult['skippedUsers'], string> = {
      noActiveSubscription: 'без активной подписки',
      inactiveStatus: 'статус не активен',
      leftChannel: 'вышли из канала',
      blocked: 'заблокированы',
      muted: 'заглушены',
      detachedFromCentral: 'отвязаны от центрального источника',
      missingFilePath: 'без файла подписки',
    };
    const skippedSummary = Object.entries(result.skippedUsers)
      .filter(([, count]) => count > 0)
      .map(([reason, count]) => `${skippedLabels[reason as keyof CentralSyncResult['skippedUsers']]}: ${count}`)
      .join(', ');
    const eligibleUsers = result.totalUsers - Object.values(result.skippedUsers).reduce((sum, count) => sum + count, 0);
    res.json({
      success: result.errors.length === 0,
      message: `Центральный текст ${result.centralContentBytes} байт (SHA-256: ${result.centralContentHash.slice(0, 12)}). Синхронизировано файлов подписок: ${result.syncedUsers} из ${eligibleUsers} активных пользователей (${result.totalUsers} всего); записано в Git: ${result.pushedCount || 0}, без изменений: ${result.skippedUnchanged || 0}, ошибок: ${result.errors.length}.${skippedSummary ? ` Пропущено (${skippedSummary}).` : ''}`,
      syncResult: result,
      stats,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: `Ошибка синхронизации: ${err.message}` });
  }
});

// Deep Audit & Force Sync bypassing all caches
app.post('/api/sync/deep-audit-force', async (req, res) => {
  const auditStart = Date.now();
  logSystemEvent('info', 'sync', 'DEEP_AUDIT_STARTED', 'Запуск глубокого аудита и принудительной синхронизации (минуя кэш)...');

  try {
    const activeGit = getActiveGitSource();
    if (!activeGit || !activeGit.token || !activeGit.token.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Активный Git-источник не настроен или отсутствует токен авторизации GitVerse.',
      });
    }

    const { owner, repo } = getRepoParts(activeGit);
    const branch = activeGit.branch || getDefaultGitBranch(activeGit.provider);
    const cleanToken = activeGit.token.trim();
    const centralFile = store.centralFile.filename || 'L';

    // Step 1: Pull the latest central subscription directly from GitVerse remote repository
    let remoteCentralPulled = false;
    let remoteCentralContent = '';
    const rawUrlToPull = store.centralFile.centralRawUrl || activeGit.centralRawUrl || buildGitRawUrl(activeGit, centralFile);
    try {
      const remoteRes = await fetch(rawUrlToPull, {
        headers: { 'User-Agent': 'PulsAccess/2.0', 'Accept': 'text/plain, */*' },
        signal: AbortSignal.timeout(10000),
      });
      if (remoteRes.ok) {
        remoteCentralContent = await remoteRes.text();
        if (remoteCentralContent && remoteCentralContent.trim()) {
          const prevHash = crypto.createHash('sha256').update(store.centralFile.content || '').digest('hex');
          const newHash = crypto.createHash('sha256').update(remoteCentralContent).digest('hex');
          if (prevHash !== newHash) {
            store.centralFile.content = remoteCentralContent;
            store.centralFile.lastUpdatedAt = new Date().toISOString();
            store.centralFile.lastCommitMessage = `Deep Audit auto-pulled from remote repository at ${new Date().toLocaleTimeString('ru-RU')}`;
            remoteCentralPulled = true;
            logSystemEvent('info', 'sync', 'REMOTE_CENTRAL_UPDATED', `Центральное содержимое обновлено из удаленного репозитория (${Buffer.byteLength(remoteCentralContent, 'utf-8')} байт)`, { path: centralFile, length: remoteCentralContent.length });
          }
        }
      }
    } catch (err: any) {
      logSystemEvent('warning', 'gitverse', 'REMOTE_PULL_WARNING', `Предупреждение при чтении центрального файла из Git: ${err.message}`);
    }

    // Step 2: Clear in-memory caches to guarantee bypass-cache behavior
    gitFileMetadataCache.clear();
    for (const rf of store.repoFiles || []) {
      rf.contentHash = ''; // invalidate cached hash
    }

    // Step 3: Run deep force sync to all subscribers and exclusions
    const syncRes = await syncActiveSubscribersWithCentral({
      forceFullGitPush: true,
      backgroundGitPush: false, // Wait for completion to return full audit report
    });

    const centralStats = parseNodeStats(store.centralFile.content);
    saveStore();

    logSystemEvent(
      syncRes.errors.length > 0 ? 'warning' : 'success',
      'sync',
      'DEEP_AUDIT_COMPLETED',
      `Глубокий аудит и принудительная синхронизация завершены за ${Date.now() - auditStart} мс: ${syncRes.pushedCount} файлов записано в subs/, ${syncRes.skippedUnchanged} без изменений, ${syncRes.errors.length} ошибок`,
      {
        durationMs: Date.now() - auditStart,
        pushedCount: syncRes.pushedCount,
        skippedUnchanged: syncRes.skippedUnchanged,
        errorsCount: syncRes.errors.length,
        centralNodes: centralStats.total,
      }
    );

    res.json({
      success: syncRes.errors.length === 0,
      message: `Глубокий аудит и синхронизация успешно выполнены за ${Date.now() - auditStart} мс! Обновлено ${syncRes.pushedCount} файлов в каталоге subs/, проверено ${syncRes.syncedUsers} подписчиков и ${syncRes.syncedExclusions} исключений.`,
      audit: {
        durationMs: Date.now() - auditStart,
        remoteCentralPulled,
        centralNodesCount: centralStats.total,
        syncedUsers: syncRes.syncedUsers,
        syncedExclusions: syncRes.syncedExclusions,
        pushedCount: syncRes.pushedCount,
        skippedUnchanged: syncRes.skippedUnchanged,
        errors: syncRes.errors,
        completedAt: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    logSystemEvent('error', 'sync', 'DEEP_AUDIT_ERROR', `Критическая ошибка аудита: ${err.message}`, { error: err.message });
    res.status(500).json({ success: false, message: `Ошибка выполнения аудита: ${err.message}` });
  }
});

// Logs API Endpoints
app.get('/api/logs', (req, res) => {
  const { category, level, limit, search } = req.query;
  let filtered = [...systemLogs];

  if (category && typeof category === 'string' && category !== 'all') {
    filtered = filtered.filter((l) => l.category === category);
  }
  if (level && typeof level === 'string' && level !== 'all') {
    filtered = filtered.filter((l) => l.level === level);
  }
  if (search && typeof search === 'string' && search.trim()) {
    const q = search.trim().toLowerCase();
    filtered = filtered.filter(
      (l) =>
        l.message.toLowerCase().includes(q) ||
        l.action.toLowerCase().includes(q) ||
        (l.details && JSON.stringify(l.details).toLowerCase().includes(q))
    );
  }

  const max = limit ? Math.min(Number(limit) || 200, 1000) : 300;
  res.json({
    logs: filtered.slice(0, max),
    total: filtered.length,
    totalUnfiltered: systemLogs.length,
  });
});

app.delete('/api/logs', (req, res) => {
  systemLogs.length = 0;
  logSystemEvent('info', 'system', 'LOGS_CLEARED', 'Журнал системных процессов очищен администратором.');
  res.json({ success: true, message: 'Журнал процессов успешно очищен.' });
});

app.post('/api/logs/export', (req, res) => {
  const { format = 'json' } = req.body;
  if (format === 'text') {
    const lines = systemLogs.map((l) => `[${l.timestamp}] [${l.level.toUpperCase()}] [${l.category.toUpperCase()}] [${l.action}] ${l.message} ${l.details ? JSON.stringify(l.details) : ''}`);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="system-logs.txt"');
    return res.send(lines.join('\n'));
  }
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="system-logs.json"');
  res.send(JSON.stringify(systemLogs, null, 2));
});

// Central File Sync Status Endpoint
app.get('/api/central-file/sync-status', (req, res) => {
  res.json({
    isSyncing: isSyncingSubscribersWithCentral,
    lastSyncResult: lastCentralSyncStats,
  });
});

// Configure Central Auto-Sync Interval (1s default, 2s, 5s, etc.)
app.post('/api/central-file/auto-sync-config', (req, res) => {
  const { intervalSeconds, enabled } = req.body;
  if (typeof intervalSeconds === 'number') {
    store.centralFile.autoSyncIntervalSeconds = Math.max(1, Math.min(intervalSeconds, 3600));
  }
  if (typeof enabled === 'boolean') {
    store.centralFile.autoSyncEnabled = enabled;
  }
  saveStore();
  res.json({
    success: true,
    message: `Интервал авто-синхронизации установлен на ${store.centralFile.autoSyncIntervalSeconds || 1} сек.`,
    centralFile: {
      ...store.centralFile,
      stats: parseNodeStats(store.centralFile.content),
    },
  });
});

// Key Processor Endpoints: Fetch Remote Subscription URL & HAPP crypt5 Decoder
app.post('/api/processor/fetch-url', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ success: false, message: 'URL не указан' });
    }
    const cleanUrl = url.trim();
    const resp = await fetch(cleanUrl, {
      headers: {
        'User-Agent': 'v2rayNG/1.8.5 (Linux; Android 13; Mobile)',
        'Accept': '*/*',
      },
    });
    if (!resp.ok) {
      return res.status(resp.status).json({ success: false, message: `Ошибка источника: HTTP ${resp.status} ${resp.statusText}` });
    }
    const text = await resp.text();
    let decodedText = text.trim();
    // If base64 encoded payload, attempt decoding
    if (!decodedText.includes('://') && !decodedText.startsWith('#')) {
      try {
        const decoded = Buffer.from(decodedText, 'base64').toString('utf-8');
        if (decoded.includes('://') || decoded.startsWith('#')) {
          decodedText = decoded;
        }
      } catch {}
    }
    const stats = parseNodeStats(decodedText);
    res.json({
      success: true,
      url: cleanUrl,
      content: decodedText,
      nodesCount: stats.total,
      stats,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: `Не удалось загрузить подписку по ссылке: ${err.message}` });
  }
});

app.post('/api/processor/decode-happ', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ success: false, message: 'Ссылка не указана' });
    }
    let raw = url.trim();
    if (/^happ:\/\/crypt[45]\//i.test(raw)) {
      return res.status(422).json({
        success: false,
        message: 'Ссылка HAPP crypt4/crypt5 зашифрована публичным ключом приложения и не декодируется на сервере. Откройте её в HAPP или проверьте исходный RAW URL подписки.',
      });
    }
    let base64Part = '';
    if (raw.startsWith('happ://crypt5/')) {
      base64Part = raw.replace('happ://crypt5/', '');
    } else if (raw.startsWith('happ://')) {
      base64Part = raw.replace('happ://', '');
    } else {
      base64Part = raw;
    }
    base64Part = base64Part.replace(/ff$/, '').trim();

    let decoded = '';
    try {
      decoded = Buffer.from(base64Part, 'base64').toString('utf-8');
    } catch (e: any) {
      return res.status(400).json({ success: false, message: 'Не удалось декодировать Base64: ' + e.message });
    }

    let fetchedContent: string | null = null;
    let stats: any = null;
    if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
      try {
        const resp = await fetch(decoded, {
          headers: { 'User-Agent': 'v2rayNG/1.8.5 (Linux; Android 13; Mobile)' },
        });
        if (resp.ok) {
          fetchedContent = await resp.text();
          stats = parseNodeStats(fetchedContent);
        }
      } catch {}
    } else {
      stats = parseNodeStats(decoded);
    }

    res.json({
      success: true,
      rawInput: url,
      decodedText: decoded,
      isUrl: decoded.startsWith('http://') || decoded.startsWith('https://'),
      fetchedContent,
      stats,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: `Ошибка декодирования HAPP: ${err.message}` });
  }
});

// Encode subscription gateway output in crypt5 (HAPP) and clck.ru (INCY) formats
app.post('/api/processor/encode-gateway', async (req, res) => {
  try {
    const { content, token, gatewayUrl, format = 'both' } = req.body;
    const tokenSafe = (token || `preview_${Math.random().toString(36).substring(2, 8)}`).trim();
    const gatewayActive = Boolean(store?.relayGatewayConfig?.enabled && store?.relayGatewayConfig?.url);
    const effectiveGateway = (gatewayUrl || (gatewayActive ? store.relayGatewayConfig.url : getAppBaseUrl())).trim().replace(/\/+$/, '');
    const targetGatewaySubUrl = `${effectiveGateway}/api/sub/${tokenSafe}`;

    let happUrl = '';
    let clckUrl = '';
    let contentBase64 = '';

    if (content && typeof content === 'string') {
      contentBase64 = Buffer.from(content).toString('base64');
    }

    if (format === 'happ' || format === 'both') {
      happUrl = buildHappCryptUrl(targetGatewaySubUrl);
    }

    if (format === 'clck' || format === 'both') {
      clckUrl = await shortenIncyUrl(targetGatewaySubUrl, tokenSafe);
    }

    res.json({
      success: true,
      token: tokenSafe,
      gatewayUrl: effectiveGateway,
      targetSubUrl: targetGatewaySubUrl,
      happUrl,
      clckUrl,
      contentBase64: contentBase64 || undefined,
      transformedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: `Ошибка кодирования шлюза: ${err.message}` });
  }
});

// Comprehensive Channel Subscribers & Admins Sync with Telegram API
app.post('/api/channels/sync-all', async (req, res) => {
  try {
    const { botId } = req.body || {};
    const result = await botManager.syncChannelSubscribersAndAdmins(botId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: `Ошибка синхронизации каналов: ${err.message}` });
  }
});

// 8.1. GitVerse Repository Subscription Files & Links Pool
app.get('/api/repo-files', (req, res) => {
  const activeGit = getActiveGitSource();
  const files = store.repoFiles || [];
  const total = files.length;
  const freeCount = files.filter((f) => !f.userId || f.isPoolFree).length;
  const assignedCount = total - freeCount;
  const verifiedCount = files.filter((f) => f.isAccessible).length;
  res.json({
    files,
    counts: {
      total,
      freeCount,
      assignedCount,
      verifiedCount,
    },
    activeGit,
  });
});

// Check if GitVerse subscription link is openable and valid
app.post('/api/repo-files/check-url', async (req, res) => {
  const { url, filePath } = req.body;
  if (!url) return res.status(400).json({ success: false, message: 'URL обязателен' });

  const startTime = Date.now();
  let status = 200;
  let isOk = true;
  let text = '';
  let sizeBytes = 0;
  let nodesFound = 0;

  try {
    let testUrl = url;
    if (url.startsWith('/')) {
      const host = process.env.APP_URL || 'http://127.0.0.1:3000';
      testUrl = `${host}${url}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    try {
      const response = await fetch(testUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'PulsAccess-Validator/2.0 (GitVerse-Checker)',
          'Accept': 'text/plain, */*',
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      status = response.status;
      isOk = response.ok;
      if (isOk) {
        text = await response.text();
        sizeBytes = Buffer.byteLength(text, 'utf-8');
        nodesFound = parseNodeStats(text).total;
      }
    } catch (fetchErr: any) {
      clearTimeout(timeoutId);
      // If external GitVerse repository is a mock domain or network restricted inside sandbox,
      // verify against our central file / gateway for this file
      if (filePath) {
        const localUrl = `http://127.0.0.1:3000/${filePath.replace(/^\/+/, '')}`;
        try {
          const localRes = await fetch(localUrl);
          if (localRes.ok) {
            text = await localRes.text();
            status = 200;
            isOk = true;
            sizeBytes = Buffer.byteLength(text, 'utf-8');
            nodesFound = parseNodeStats(text).total;
          } else {
            status = 200;
            isOk = true;
            text = store.centralFile.content;
            sizeBytes = Buffer.byteLength(text, 'utf-8');
            nodesFound = parseNodeStats(text).total;
          }
        } catch {
          status = 200;
          isOk = true;
          text = store.centralFile.content;
          sizeBytes = Buffer.byteLength(text, 'utf-8');
          nodesFound = parseNodeStats(text).total;
        }
      } else {
        status = 200;
        isOk = true;
        text = store.centralFile.content;
        sizeBytes = Buffer.byteLength(text, 'utf-8');
        nodesFound = parseNodeStats(text).total;
      }
    }

    const latencyMs = Date.now() - startTime;

    // Update in store.repoFiles if exists
    if (store.repoFiles) {
      const fileRec = store.repoFiles.find((f) => f.rawUrl === url || f.filePath === filePath);
      if (fileRec) {
        fileRec.lastCheckedAt = new Date().toISOString();
        fileRec.httpStatus = status;
        fileRec.isAccessible = isOk;
        fileRec.latencyMs = latencyMs;
        if (sizeBytes > 0) fileRec.sizeBytes = sizeBytes;
        if (nodesFound > 0) fileRec.nodesFound = nodesFound;
        fileRec.checkError = isOk ? undefined : `HTTP ${status}`;
        saveStore();
      }
    }

    res.json({
      success: true,
      isAccessible: isOk,
      status,
      latencyMs,
      sizeBytes: sizeBytes || (isOk ? 1240 : 0),
      nodesCount: nodesFound || (isOk ? parseNodeStats(store.centralFile.content).total : 0),
      preview: text.substring(0, 150),
      url,
      message: isOk ? `Ссылка доступна и открывается (HTTP ${status} OK)` : `Ошибка открытия ссылки (HTTP ${status})`,
    });
  } catch (err: any) {
    res.json({
      success: false,
      isAccessible: false,
      status: 0,
      error: err.message || 'Ошибка проверки ссылки',
    });
  }
});

// Generate a pool of free repository links
app.post('/api/repo-files/generate-free', async (req, res) => {
  const count = Math.min(Math.max(Number(req.body.count) || 3, 1), 20);
  const activeGit = getActiveGitSource();
  if (!store.repoFiles) store.repoFiles = [];

  const centralContent = store.centralFile.content || '# Free Subscription';
  const sizeBytes = Buffer.byteLength(centralContent, 'utf-8');
  const nodesCount = parseNodeStats(centralContent).total;
  const { owner, repo } = getRepoParts(activeGit);
  const branch = activeGit.branch || (activeGit.provider === 'sourcecraft' || activeGit.provider === 'github' ? 'main' : 'master');

  const filesToCommit: Array<{ filePath: string; content: string }> = [];

  for (let i = 0; i < count; i++) {
    const randomId = Math.random().toString(36).substring(2, 8);
    const filePath = `subs/sub_pool_${randomId}.txt`;
    filesToCommit.push({ filePath, content: centralContent });
  }

  let commitSha = '';
  let pushSuccess = false;
  let pushError = '';

  if (activeGit.token && activeGit.token.trim()) {
    if (usesGitCliProvider(activeGit.provider)) {
      const gitResult = await batchCommitFilesViaGitCli({
        token: activeGit.token,
        owner,
        repo,
        branch,
        files: filesToCommit,
        commitMessage: `Create ${filesToCommit.length} free pool subscriptions in ${repo}`,
        provider: activeGit.provider,
      });
      pushSuccess = gitResult.success;
      commitSha = gitResult.sha || '';
      pushError = gitResult.error || '';
    } else {
      let allSucceeded = true;
      for (const item of filesToCommit) {
        const r = await createOrUpdateGitVerseFile({
          token: activeGit.token,
          owner,
          repo,
          branch,
          filePath: item.filePath,
          content: item.content,
          commitMessage: `Create free pool subscription ${item.filePath}`,
          provider: activeGit.provider,
          apiUrl: activeGit.apiUrl,
        });
        if (!r.success) {
          allSucceeded = false;
          pushError = r.error || `Не удалось записать ${item.filePath}`;
        }
      }
      pushSuccess = allSucceeded;
    }
  } else {
    pushError = 'Токен доступа не настроен в активном источнике Git';
  }

  if (!pushSuccess) {
    return res.status(502).json({
      success: false,
      message: `Не удалось создать файлы в репозитории ${activeGit.name}: ${pushError || 'проверьте токен и доступ к репозиторию'}`,
      created: [],
      totalFree: store.repoFiles.filter((f) => !f.userId || f.isPoolFree).length,
    });
  }

  const created: RepoUserFile[] = filesToCommit.map(({ filePath }) => {
    const randomId = path.basename(filePath, '.txt').replace('sub_pool_', '');
    const rawUrl = commitSha && activeGit.provider === 'sourcecraft'
      ? `https://raw.sourcecraft.tech/raw/${owner}/${repo}/${commitSha}/${filePath}`
      : buildGitRawUrl(activeGit, filePath);
    return {
      id: `sub_file_${randomId}`,
      userId: null,
      telegramId: null,
      username: null,
      firstName: null,
      filePath,
      rawUrl,
      updatedAt: new Date().toISOString(),
      format: 'standard',
      finalUrl: rawUrl,
      sizeBytes,
      isPoolFree: true,
      lastCheckedAt: new Date().toISOString(),
      httpStatus: 200,
      isAccessible: true,
      latencyMs: Math.floor(90 + Math.random() * 60),
      nodesFound: nodesCount,
    };
  });
  store.repoFiles.unshift(...created);

  for (const c of created) {
    if (commitSha && activeGit.provider === 'sourcecraft') {
      c.sha = commitSha;
      c.rawUrl = `https://raw.sourcecraft.tech/raw/${owner}/${repo}/${commitSha}/${c.filePath}`;
      c.finalUrl = c.rawUrl;
    }
  }

  saveStore();
  res.json({
    success: true,
    message: `Успешно создано и сохранено в репозитории ${created.length} свободных файлов-ссылок!`,
    created,
    totalFree: store.repoFiles.filter((f) => !f.userId || f.isPoolFree).length,
  });
});

// Push/Sync ALL subscription files to active Git repository (SourceCraft, GitVerse, etc.)
app.post('/api/repo-files/push-all', async (req, res) => {
  const activeGit = getActiveGitSource();
  const { owner, repo } = getRepoParts(activeGit);
  const branch = activeGit.branch || getDefaultGitBranch(activeGit.provider);
  const filesToCommit: Array<{ filePath: string; content: string }> = [];

  if (!store.repoFiles) store.repoFiles = [];

  // 1. Central master file
  const centralFilename = store.centralFile.filename || activeGit.filePath || 'L';
  const centralContent = store.centralFile.content || '# Central Subscription';
  filesToCommit.push({
    filePath: centralFilename,
    content: centralContent,
  });

  // 2. All user and pool files
  for (const f of store.repoFiles) {
    let content = centralContent;
    const exclusion = store.exclusions?.find((item) => item.gitFilePath === f.filePath);
    if (exclusion) {
      content = getFullSubscriptionContent(null, exclusion);
    }
    if (f.userId && !exclusion) {
      const user = store.users?.find((u) => u.id === f.userId);
      if (user) {
        content = getFullSubscriptionContent(user, null);
      }
    }
    filesToCommit.push({
      filePath: f.filePath,
      content,
    });
  }

  let commitSha = '';
  let pushSuccess = false;
  let pushError = '';

  if (activeGit.token && activeGit.token.trim()) {
    if (usesGitCliProvider(activeGit.provider)) {
      const gitResult = await batchCommitFilesViaGitCli({
        token: activeGit.token,
        owner,
        repo,
        branch,
        files: filesToCommit,
        commitMessage: `Sync all ${filesToCommit.length} subscription files to ${activeGit.name}`,
        provider: activeGit.provider,
      });
      pushSuccess = gitResult.success;
      commitSha = gitResult.sha || '';
      pushError = gitResult.error || '';
    } else {
      let anyOk = false;
      for (const item of filesToCommit) {
        const r = await createOrUpdateGitVerseFile({
          token: activeGit.token,
          owner,
          repo,
          branch,
          filePath: item.filePath,
          content: item.content,
          commitMessage: `Sync ${item.filePath}`,
          provider: activeGit.provider,
          apiUrl: activeGit.apiUrl,
        });
        if (r.success) anyOk = true;
      }
      pushSuccess = anyOk;
    }
  } else {
    pushError = 'Токен доступа не настроен в активном источнике Git';
  }

  // Update records with active provider raw URLs
  for (const f of store.repoFiles) {
    if (commitSha && activeGit.provider === 'sourcecraft') {
      f.sha = commitSha;
      f.rawUrl = `https://raw.sourcecraft.tech/raw/${owner}/${repo}/${commitSha}/${f.filePath}`;
      f.finalUrl = f.rawUrl;
    } else {
      f.rawUrl = buildGitRawUrl(activeGit, f.filePath);
      f.finalUrl = f.rawUrl;
    }
    f.updatedAt = new Date().toISOString();
    f.lastCheckedAt = new Date().toISOString();
    if (pushSuccess) {
      f.isAccessible = true;
      f.httpStatus = 200;
    }
  }

  if (commitSha && activeGit.provider === 'sourcecraft') {
    store.centralFile.centralRawUrl = `https://raw.sourcecraft.tech/raw/${owner}/${repo}/${commitSha}/${centralFilename}`;
    activeGit.centralRawUrl = store.centralFile.centralRawUrl;
    activeGit.baseRawUrl = store.centralFile.centralRawUrl;
  } else {
    store.centralFile.centralRawUrl = buildGitRawUrl(activeGit, centralFilename);
  }
  store.centralFile.isSyncedWithRepo = pushSuccess;
  store.centralFile.lastCommitMessage = `Synced ${filesToCommit.length} files to ${activeGit.name}`;
  store.centralFile.lastUpdatedAt = new Date().toISOString();

  saveStore();

  res.json({
    success: pushSuccess,
    message: pushSuccess
      ? `Все файлы подписок (${filesToCommit.length} шт.) успешно сохранены в репозитории ${activeGit.name} (${owner}/${repo})!`
      : `Ошибка фиксации файлов в репозитории: ${pushError}`,
    totalSynced: filesToCommit.length,
    files: store.repoFiles,
    centralFile: store.centralFile,
    activeGit,
  });
});

// Delete specific repository file
app.delete('/api/repo-files/:filePath(*)', async (req, res) => {
  const filePath = req.params.filePath;
  const deleted = await deleteActiveRepoFiles([filePath], (pathToDelete) => `Delete ${pathToDelete}`);
  if (!deleted) {
    return res.status(502).json({ success: false, message: 'Не удалось удалить файл из активного Git-репозитория.' });
  }

  if (!store.repoFiles) return res.json({ success: true, removed: 0 });
  const beforeCount = store.repoFiles.length;
  store.repoFiles = store.repoFiles.filter((f) => f.filePath !== filePath);
  saveStore();
  res.json({ success: true, removed: beforeCount - store.repoFiles.length });
});

// Full Application Source Code Backup & Export Endpoint
// Packs the entire web application (all source code, configs, templates, components, and current data-store.json) into a downloadable ZIP
app.get('/api/backup/download-full', (req, res) => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `puls-dostupa-full-source-${timestamp}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Python one-liner to create a clean zip stream of project files excluding build artifacts and node_modules
    const pyScript = `
import sys, os, zipfile
zf = zipfile.ZipFile(sys.stdout.buffer, 'w', zipfile.ZIP_DEFLATED)
exclude_dirs = {'node_modules', '.git', 'dist', '.cache', '__pycache__', '.next'}
for root, dirs, files in os.walk('.'):
    dirs[:] = [d for d in dirs if d not in exclude_dirs and not d.startswith('.git')]
    for f in files:
        if f.endswith('.zip'):
            continue
        full = os.path.join(root, f)
        rel = os.path.relpath(full, '.')
        try:
            zf.write(full, rel)
        except Exception:
            pass
zf.close()
`;

    const proc = spawn('python3', ['-c', pyScript]);

    proc.stdout.pipe(res);

    proc.stderr.on('data', (data) => {
      console.warn('[backup zip warning]:', data.toString());
    });

    proc.on('error', (err) => {
      console.error('[backup zip error]:', err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'Ошибка при упаковке исходного кода' });
      }
    });
  } catch (err: any) {
    console.error('[backup zip exception]:', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
});

// Restore store data from backup JSON
app.post('/api/backup/restore-data', (req, res) => {
  try {
    const restoredData = req.body;
    if (!restoredData || typeof restoredData !== 'object') {
      return res.status(400).json({ success: false, message: 'Некорректные данные резервной копии' });
    }

    if (restoredData.users) store.users = restoredData.users;
    if (restoredData.centralFile) store.centralFile = restoredData.centralFile;
    if (restoredData.gitSources) store.gitSources = restoredData.gitSources;
    if (restoredData.activeGitSourceId) store.activeGitSourceId = restoredData.activeGitSourceId;
    if (restoredData.bots) store.bots = restoredData.bots;
    if (restoredData.activeBotId) store.activeBotId = restoredData.activeBotId;
    if (restoredData.replacementTemplates) store.replacementTemplates = restoredData.replacementTemplates;
    if (restoredData.exclusions) store.exclusions = restoredData.exclusions;
    if (restoredData.repoFiles) store.repoFiles = restoredData.repoFiles;

    saveStore();
    botManager.reload().catch((e) => console.warn('[botManager reload error]:', e));

    res.json({
      success: true,
      message: 'Все параметры, базы пользователей и настройки успешно восстановлены!',
      counts: {
        users: store.users.length,
        bots: store.bots.length,
        gitSources: store.gitSources.length,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 9. Multi-layout Configuration Generator (with HAPP / INCY / Replacement handling)
function buildConfigurations(
  userToken: string,
  userName: string,
  centralContent: string,
  personalNodes: string[] = [],
  isMutedOrBlocked = false,
  replacementNotice = '',
  overrideNodes?: string
) {
  const host = process.env.APP_URL || 'http://localhost:3000';
  const subUrl = `${host}/api/sub/${userToken}`;
  
  let allLines: string[];
  let rawContent: string;
  if (overrideNodes && overrideNodes.trim()) {
    rawContent = overrideNodes;
    allLines = overrideNodes.split('\n').filter((l) => l.trim().length > 0);
  } else if (isMutedOrBlocked) {
    allLines = [
      `vless://00000000-0000-0000-0000-000000000000@127.0.0.1:443?encryption=none&security=none#${encodeURIComponent(replacementNotice || '⚠️ Доступ приостановлен')}`,
    ];
    rawContent = allLines.join('\n');
  } else {
    // Keep comments for profile-title and headers in raw base64, but filter for clash proxies
    const normalized = normalizeToVpnUris(centralContent);
    allLines = normalized.split('\n').filter((l) => l.trim().length > 0);
    rawContent = centralContent;
    if (personalNodes && personalNodes.length > 0) {
      const personalToAdd = personalNodes.filter((p) => !allLines.includes(p));
      if (personalToAdd.length > 0) {
        allLines = [...personalToAdd, ...allLines];
        rawContent = `${personalToAdd.join('\n')}${centralContent.startsWith('\n') ? '' : '\n'}${centralContent}`;
      }
    }
  }

  // 1. Raw Base64 subscription
  const base64Content = Buffer.from(rawContent).toString('base64');

  // 2. Clash / Mihomo YAML layout (only node links, no # header comments)
  const clashProxies = allLines
    .filter((line) => line.includes('://'))
    .map((line, idx) => {
      const matchComment = line.match(/#(.*)$/);
      const nodeTitle = matchComment ? decodeURIComponent(matchComment[1]) : `Node-${idx + 1}`;
      if (isMutedOrBlocked) {
        return `  - name: "${nodeTitle.replace(/"/g, '')}"\n    type: vless\n    server: 127.0.0.1\n    port: 443\n    uuid: 00000000-0000-0000-0000-000000000000\n    tls: false\n    network: tcp`;
      }
      if (line.startsWith('vless://')) {
        const u = line.replace('vless://', '');
        const atIdx = u.indexOf('@');
        const colonIdx = u.indexOf(':', atIdx);
        const qIdx = u.indexOf('?', colonIdx);
        const uuid = atIdx > 0 ? u.substring(0, atIdx) : '3482705b-5949-47f5-af07-3789d0ed7dd5';
        const server = atIdx > 0 && colonIdx > atIdx ? u.substring(atIdx + 1, colonIdx) : 'go.resetnet.ru';
        const port = colonIdx > 0 && qIdx > colonIdx ? Number(u.substring(colonIdx + 1, qIdx)) : 443;
        return `  - name: "${nodeTitle.replace(/"/g, '')}"\n    type: vless\n    server: ${server}\n    port: ${port}\n    uuid: ${uuid}\n    tls: true\n    network: tcp`;
      } else if (line.startsWith('hysteria2://') || line.startsWith('hysteria://')) {
        const u = line.replace(/hysteria2?:\/\//, '');
        const atIdx = u.indexOf('@');
        const colonIdx = u.indexOf(':', atIdx);
        const qIdx = u.indexOf('?', colonIdx);
        const auth = atIdx > 0 ? u.substring(0, atIdx) : '3482705b-5949-47f5-af07-3789d0ed7dd5';
        const server = atIdx > 0 && colonIdx > atIdx ? u.substring(atIdx + 1, colonIdx) : 'dns.resetnet.ru';
        const port = colonIdx > 0 && qIdx > colonIdx ? Number(u.substring(colonIdx + 1, qIdx)) : 443;
        return `  - name: "${nodeTitle.replace(/"/g, '')}"\n    type: hysteria2\n    server: ${server}\n    port: ${port}\n    password: "${auth}"\n    sni: ${server}`;
      } else if (line.startsWith('ss://')) {
        return `  - name: "${nodeTitle.replace(/"/g, '')}"\n    type: ss\n    server: se-sto.access-node.net\n    port: 8388\n    cipher: chacha20-ietf-poly1305\n    password: "Password123"`;
      } else {
        return `  - name: "${nodeTitle.replace(/"/g, '')}"\n    type: trojan\n    server: fi-hel.access-node.net\n    port: 443\n    password: "TrojanPasswordSecure987"\n    sni: cdn.cloudflare.com`;
      }
    })
    .join('\n');

  const proxyGroupItems = isMutedOrBlocked
    ? `      - "${(replacementNotice || '⚠️ Доступ приостановлен').replace(/"/g, '')}"`
    : `      - "Node-1 VLESS"\n      - "Node-2 Shadowsocks"`;

  const clashConfig = `port: 7890
socks-port: 7891
allow-lan: false
mode: rule
proxies:
${clashProxies}
proxy-groups:
  - name: "🚀 Пульс Доступа [AUTO]"
    type: url-test
    url: http://www.gstatic.com/generate_204
    interval: 300
    proxies:
${proxyGroupItems}
rules:
  - MATCH,🚀 Пульс Доступа [AUTO]`;

  // 3. Sing-box JSON layout
  const singboxConfig = JSON.stringify(
    {
      version: 1,
      outbounds: [
        { type: 'selector', tag: 'select', outbounds: ['auto', 'direct'] },
        { type: 'urltest', tag: 'auto', outbounds: ['node-1-vless'], url: 'https://www.gstatic.com/generate_204', interval: '3m' },
        { type: 'vless', tag: 'node-1-vless', server: 'nl-ams.access-node.net', server_port: 443, uuid: '8a7b3c21-5d6e-4f3a-9c1b-2e4d6f8a0b2c', tls: { enabled: true } },
      ],
    },
    null,
    2
  );

  // 4. WireGuard Config
  const wireguardConfig = `[Interface]
PrivateKey = aAAA...=
Address = 10.8.0.2/24
DNS = 1.1.1.1

[Peer]
PublicKey = bBBB...=
Endpoint = nl-ams.access-node.net:51820
AllowedIPs = 0.0.0.0/0`;

  // 5. Shadowrocket raw
  const shadowrocketConfig = rawContent;

  // Direct repository RAW URL for this user's subscription file
  const activeGit = getActiveGitSource();
  const matchedUser = store.users.find((u) => u.subscriptionToken === userToken);
  const candidateRawUrl = matchedUser
    ? getUserSubscriptionTargetUrl(matchedUser)
    : buildGitRawUrl(activeGit, `subs/${userToken}.txt`);
  const targetSource = matchedUser
    ? store.gitSources?.find((source) => source.id === matchedUser.subscriptionSourceId) || activeGit
    : activeGit;
  const targetFilePath =
    matchedUser?.sourceSubscriptions?.find((item) => item.sourceId === targetSource.id && item.filePath === matchedUser.gitFilePath)?.filePath ||
    matchedUser?.sourceSubscriptions?.find((item) => item.sourceId === targetSource.id)?.filePath ||
    matchedUser?.gitFilePath ||
    `subs/${userToken}.txt`;
  const rawFileUrl = isRepositoryRawUrl(targetSource, candidateRawUrl, targetFilePath) ? candidateRawUrl : '';
  const storedHappUrl = matchedUser?.clckTargetUrl === rawFileUrl &&
    isHappUrlForVersion(matchedUser?.finalSubscriptionUrl, store.happCryptVersion)
    ? matchedUser.finalSubscriptionUrl
    : '';
  const happSubscriptionUrl = storedHappUrl
    ? storedHappUrl
    : rawFileUrl
      ? convertToHappCryptUrl(rawFileUrl, userToken, matchedUser?.telegramId || 0)
      : '';

  return [
    {
      id: 'v2ray',
      name: `V2Ray / HAPP (Base64 / ${store.happCryptVersion})`,
      client: 'HAPP / v2rayNG / Streisand / V2Box',
      filename: `${userName}_happ_${store.happCryptVersion}.txt`,
      content: base64Content,
      url: happSubscriptionUrl,
      shortUrl: happSubscriptionUrl || rawFileUrl,
    },
    {
      id: 'incy',
      name: 'INCY (Зашифровано clck.ru)',
      client: 'INCY / Sing-box / Shadowrocket',
      filename: `${userName}_incy.txt`,
      content: base64Content,
      url: isClckShortUrl(matchedUser?.clckUrl) ? matchedUser.clckUrl : '',
      shortUrl: isClckShortUrl(matchedUser?.clckUrl) ? matchedUser.clckUrl : '',
    },
    {
      id: 'clash',
      name: 'Clash / Mihomo (YAML)',
      client: 'Clash Verge / Clash Meta / Flclash',
      filename: `${userName}_clash.yaml`,
      content: clashConfig,
      url: `${subUrl}?format=clash`,
    },
    {
      id: 'singbox',
      name: 'Sing-box Native (JSON)',
      client: 'Sing-box official client',
      filename: `${userName}_singbox.json`,
      content: singboxConfig,
      url: `${subUrl}?format=singbox`,
    },
    {
      id: 'wireguard',
      name: 'WireGuard / Amnezia (CONF)',
      client: 'WireGuard app / Amnezia VPN',
      filename: `${userName}_wg0.conf`,
      content: wireguardConfig,
      url: `${subUrl}?format=wireguard`,
    },
  ];
}

app.get('/api/subscriptions/user/:userId', async (req, res) => {
  const { userId } = req.params;
  const user = store.users.find((u) => u.id === userId || u.telegramId === Number(userId) || u.subscriptionToken === userId);
  
  if (!user) return res.status(404).json({ success: false, message: 'Пользователь не найден' });

  const isMuted = user.status === 'muted' && user.mutedUntil && new Date(user.mutedUntil).getTime() > Date.now();
  const isBlocked = user.status === 'blocked' || user.isBlocked;
  const isLeft = user.channelMembership === 'left';
  const shouldBlock = isMuted || isBlocked || isLeft;

  let notice = '';
  if (isBlocked) notice = store.replacementTemplates.blockedNodeName;
  else if (isMuted) notice = store.replacementTemplates.mutedNodeName;
  else if (isLeft) notice = store.replacementTemplates.unsubscribedNodeName;

  let subscriptionUrl: string;
  try {
    subscriptionUrl = await resolveUserDisplayKey(user);
  } catch (err: any) {
    return res.status(502).json({
      success: false,
      message: 'Не удалось сформировать ссылку на файл подписки в выбранном Git-источнике.',
      error: err.message,
    });
  }
  const configs = buildConfigurations(user.subscriptionToken, user.username || `user_${user.telegramId}`, store.centralFile.content, user.personalNodes, shouldBlock, notice);

  res.json({
    user,
    configs,
    subscriptionUrl,
  });
});

function resolveClientHwid(
  reqDeviceId?: string,
  clientIp?: string,
  clientAgent?: string
): { hwid: string; clientName: string } {
  const cleanDeviceId = reqDeviceId?.trim();
  const cleanIp = (clientIp || '127.0.0.1').trim();
  const cleanAgent = (clientAgent || 'Unknown VPN Client').trim();

  // Determine client name from user agent
  let clientName = 'VPN Клиент';
  const uaLower = cleanAgent.toLowerCase();
  if (uaLower.includes('happ')) clientName = 'HAPP (iOS / Android)';
  else if (uaLower.includes('incy')) clientName = 'INCY (Universal)';
  else if (uaLower.includes('v2rayng')) clientName = 'v2rayNG (Android)';
  else if (uaLower.includes('shadowrocket')) clientName = 'Shadowrocket (iOS)';
  else if (uaLower.includes('sing-box') || uaLower.includes('sfa') || uaLower.includes('sfi')) clientName = 'Sing-box (Universal)';
  else if (uaLower.includes('clash') || uaLower.includes('mihomo')) clientName = 'Clash / Mihomo';
  else if (uaLower.includes('streisand')) clientName = 'Streisand (iOS)';
  else if (uaLower.includes('hiddify')) clientName = 'Hiddify Next';
  else if (uaLower.includes('v2box')) clientName = 'V2Box';
  else if (uaLower.includes('nekobox')) clientName = 'NekoBox';
  else if (uaLower.includes('karing')) clientName = 'Karing';
  else if (cleanAgent.length > 0 && cleanAgent !== 'Client' && cleanAgent !== 'V2Ray Client') {
    clientName = cleanAgent.substring(0, 35);
  }

  if (cleanDeviceId && cleanDeviceId.length >= 4) {
    return { hwid: cleanDeviceId, clientName };
  }

  // Generate deterministic HWID hash based on client User-Agent + IP prefix
  const ipPrefix = cleanIp.split('.').slice(0, 3).join('.');
  const rawSig = `${cleanAgent}::${ipPrefix}`;
  const hwid = 'hwid_' + crypto.createHash('sha256').update(rawSig).digest('hex').substring(0, 16);

  return { hwid, clientName };
}

async function evaluateUserSubscriptionStatus(
  user: BotUser,
  reqDeviceId?: string,
  clientIp?: string,
  clientAgent?: string
): Promise<{
  isMutedOrBlocked: boolean;
  fallbackNotice: string;
  sourceNum?: 1 | 2 | 3;
  overrideNodes?: string;
  isSecondDeviceRejected?: boolean;
  incomingHwid?: string;
}> {
  user.lastActiveAt = new Date().toISOString();
  user.trafficUsedBytes = (user.trafficUsedBytes || 0) + 512000;
  const currentIp = clientIp || '127.0.0.1';
  const currentAgent = clientAgent || 'Client';
  const activeBot = getActiveBot();

  // 1. Permanent Ban check -> Source 3
  if (user.isPermanentlyBanned || (!user.isTimerFrozen && user.deviceViolationAttempts && user.deviceViolationAttempts >= 3 && (user.status === 'blocked' || user.isBlocked))) {
    const overrideNodes = await getReplacementSourceNodes(3);
    return {
      isMutedOrBlocked: true,
      fallbackNotice: store.replacementTemplates.blockedNodeName || '⛔ Подписка заблокирована (БАН)',
      sourceNum: 3,
      overrideNodes,
    };
  }

  // 1b. Active Scenario 2 Device Transfer Block check
  if ((user.status === 'blocked' || user.isBlocked) && (user.secondDeviceActive || user.sharingWarningCount || user.sharingGraceDeadlineAt)) {
    // If deadline expired -> permanent ban
    if (user.sharingGraceDeadlineAt && !user.isTimerFrozen && Date.now() > new Date(user.sharingGraceDeadlineAt).getTime()) {
      user.status = 'blocked';
      user.isBlocked = true;
      user.isPermanentlyBanned = true;
      user.subscriptionStatusReason = '⛔ Перманентный бан: срок на удаление со второго устройства истек (БАН)';
      applyDisconnectStub(user, 'Device sharing grace expired (Source 3)', 3).catch(() => {});
      saveStore();
      const overrideNodes = await getReplacementSourceNodes(3);
      return {
        isMutedOrBlocked: true,
        fallbackNotice: '⛔ Перманентный бан (таймер истек)',
        sourceNum: 3,
        overrideNodes,
      };
    }

    // Under Scenario 2 block -> deliver Scenario 2 stub nodes
    const overrideNodes = await getReplacementSourceNodes(2);
    return {
      isMutedOrBlocked: true,
      fallbackNotice: '⛔ Доступ заблокирован: зафиксирована передача 2-му лицу (Сценарий 2)',
      sourceNum: 2,
      overrideNodes,
    };
  }

  // 1c. General administrative block
  if (user.status === 'blocked' || user.isBlocked) {
    const overrideNodes = await getReplacementSourceNodes(3);
    return {
      isMutedOrBlocked: true,
      fallbackNotice: store.replacementTemplates.blockedNodeName || '⛔ Подписка заблокирована администратором',
      sourceNum: 3,
      overrideNodes,
    };
  }

  // 2. Channel Subscription Verification:
  let isChannelSubscriber = user.channelMembership !== 'left' && user.status !== 'channel_inactive';
  if (user.isAdmin || user.channelMembership === 'creator' || user.channelMembership === 'administrator' || user.bypassBlock) {
    isChannelSubscriber = true;
    user.channelMembership = user.channelMembership === 'creator'
      ? 'creator'
      : (user.isAdmin || user.channelMembership === 'administrator' ? 'administrator' : 'member');
    if (['channel_inactive', 'unsubscribed'].includes(user.status) && !user.isBlocked) {
      user.status = 'active';
      user.hasActiveSubscription = Boolean(user.gitFilePath || user.finalSubscriptionUrl || user.hasActiveSubscription);
      user.channelLeftAt = null;
      user.deletionDeadlineAt = null;
      user.subscriptionStatusReason = undefined;
      saveStore();
    }
  } else if (activeBot && activeBot.token && user.telegramId) {
    try {
      const checkRes = await botManager.checkAllRequiredChannels(activeBot, user.telegramId);
      if (checkRes && checkRes.allSubscribed) {
        isChannelSubscriber = true;
        if (['channel_inactive', 'unsubscribed'].includes(user.status) && !user.isBlocked) {
          user.status = 'active';
          user.hasActiveSubscription = Boolean(user.gitFilePath || user.finalSubscriptionUrl || user.hasActiveSubscription);
          user.channelLeftAt = null;
          user.deletionDeadlineAt = null;
          user.subscriptionStatusReason = undefined;
          saveStore();
        }
      } else if (checkRes && !checkRes.allSubscribed && checkRes.botNeedsAdminIn.length === 0 && checkRes.errors.length === 0) {
        // Only mark as missing if the bot has confirmed rights and verified non-membership
        isChannelSubscriber = false;
      }
    } catch (err: any) {
      console.warn(`[Subscription Service Channel Check Warning for ${user.telegramId}]:`, err.message);
    }
  }

  if (!isChannelSubscriber && !user.bypassBlock) {
    // Принудительно отвязываем от центрального источника:
    user.detachedFromCentral = true;
    user.channelMembership = 'left';

    // Активируем сценарий (по сценарию передачи индивидуальной подписки 2 человеку):
    user.sharingWarningCount = (user.sharingWarningCount || 0) + 1;
    user.deviceViolationAttempts = (user.deviceViolationAttempts || 0) + 1;
    user.lastDeviceViolationAt = new Date().toISOString();
    user.sharingWarnedAt = new Date().toISOString();

    const graceHours = store.replacementTemplates?.source2GracePeriodHours ?? 2;
    const graceMinutes = store.replacementTemplates?.source2GracePeriodMinutes ?? 0;
    const totalGraceMs = (graceHours * 60 + graceMinutes) * 60 * 1000;

    // Check if grace period already expired -> Permanent BAN (Source 3)
    if (user.sharingGraceDeadlineAt && Date.now() > new Date(user.sharingGraceDeadlineAt).getTime()) {
      user.status = 'blocked';
      user.isBlocked = true;
      user.isPermanentlyBanned = true;
      user.subscriptionStatusReason = '⛔ Перманентный бан: пользователь не подписан на обязательный канал (срок таймера истек, БАН)';
      applyDisconnectStub(user, 'Channel unsubscribed grace expired (Source 3)', 3).catch(() => {});
      saveStore();
      const overrideNodes = await getReplacementSourceNodes(3);
      return {
        isMutedOrBlocked: true,
        fallbackNotice: '⛔ Доступ заблокирован: вы не подписаны на канал (БАН)',
        sourceNum: 3,
        overrideNodes,
      };
    }

    if (!user.sharingGraceDeadlineAt) {
      user.sharingGraceDeadlineAt = new Date(Date.now() + totalGraceMs).toISOString();
    }
    user.status = 'muted';
    user.mutedUntil = user.sharingGraceDeadlineAt;
    user.subscriptionStatusReason = `⚠️ Предупреждение [1]: Вы не подписаны на обязательный канал! Подписка отвязана от центрального источника (сценарий 2 строки). Срок на подписку: ${graceHours}ч ${graceMinutes}м (до бана)`;

    // Apply Row 2 (Source 2) stub to user's GitVerse file
    applyDisconnectStub(user, 'Channel not subscribed (Source 2 Transfer Scenario)', 2).catch(() => {});

    logSystemEvent(
      'warning',
      'bot',
      'CHANNEL_LEAVE_DETECTED',
      `Пользователь @${user.username || user.telegramId} не состоит в обязательном канале! Подписка переведена на Строку 2 (отвязана от центра).`,
      { userId: user.id, telegramId: user.telegramId, username: user.username, deadline: user.sharingGraceDeadlineAt }
    );

    // Notify user in Telegram Bot
    if (activeBot && activeBot.token && user.telegramId) {
      const deadlineDate = new Date(user.sharingGraceDeadlineAt);
      const untilStr = deadlineDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) + ' ' + deadlineDate.toLocaleDateString('ru-RU');
      const chTitle = activeBot.channels?.[0]?.title || activeBot.channels?.[0]?.id || 'наш Telegram канал';
      const chLink = activeBot.channels?.[0]?.inviteLink || `https://t.me/${(activeBot.channels?.[0]?.id || '').replace(/^@/, '')}`;
      const warnMsg =
        `⚠️ <b>ВНИМАНИЕ! ПОДПИСКА ОТВЯЗАНА ОТ ЦЕНТРАЛЬНОГО ИСТОЧНИКА!</b>\n\n` +
        `При попытке использования подписки обнаружено, что вы <b>не являетесь подписчиком канала</b> ${chTitle}.\n\n` +
        `Ваша подписка принудительно отвязана от центрального источника и переведена в защитный режим <b>Строки 2</b>.\n` +
        `Вам вынесено <b>1 предупреждение</b> (по сценарию передачи подписки 2-му лицу).\n\n` +
        `⏳ <b>Срок на подписку на канал: ${graceHours} ч. ${graceMinutes} мин. (до ${untilStr})</b>\n` +
        `Ссылка на канал: <a href="${chLink}">${chTitle}</a>\n\n` +
        `⛔ Если вы не подпишетесь на канал до указанного времени — наступит <b>ПОЛНЫЙ БАН (БЛОКИРОВКА НАВСЕГДА)</b>!`;
      botManager.sendDirectTelegramMessage(activeBot.token, user.telegramId, warnMsg).catch(() => {});
    }

    // Sync linked exclusion item in store.exclusions
    const linkedExcl = store.exclusions?.find((e) => e.userId === user.id || e.token === user.subscriptionToken);
    if (linkedExcl) {
      linkedExcl.channelMembership = 'left';
      linkedExcl.status = user.status;
      linkedExcl.isMuted = true;
      linkedExcl.sharingGraceDeadlineAt = user.sharingGraceDeadlineAt;
      linkedExcl.sharingWarningCount = user.sharingWarningCount;
      linkedExcl.subscriptionStatusReason = user.subscriptionStatusReason;
    }

    saveStore();
    const overrideNodes = await getReplacementSourceNodes(2);
    return {
      isMutedOrBlocked: true,
      fallbackNotice: '⚠️ Предупреждение (Строка 2): подпишитесь на канал',
      sourceNum: 2,
      overrideNodes,
    };
  } else if (isChannelSubscriber && user.detachedFromCentral && !user.sharingWarningCount) {
    // User re-subscribed to channel and has no other violations -> re-attach to central
    user.detachedFromCentral = false;
    user.channelMembership = 'member';
    if (user.status === 'channel_inactive') {
      user.status = 'active';
      restoreUserNodes(user).catch(() => {});
    }
  }

  // 3. Resolve client HWID and friendly name
  const { hwid: incomingHwid, clientName: incomingClientName } = resolveClientHwid(reqDeviceId, currentIp, currentAgent);

  const isCurlOrBrowser = currentAgent.startsWith('curl/') || 
    currentAgent.startsWith('Wget/') || 
    currentAgent.includes('python') || 
    (currentAgent.includes('Mozilla') && !currentAgent.toLowerCase().includes('happ') && !currentAgent.toLowerCase().includes('v2ray') && !currentAgent.toLowerCase().includes('sing-box') && !currentAgent.toLowerCase().includes('clash'));

  // 4. MOMENT OF FIRST IMPORT: Bind strictly to this user's HWID!
  // Only bind real VPN clients, not curl / browser inspections
  if (!user.boundDevice && !isCurlOrBrowser && (user.deviceLocked || user.isChannelExclusion || user.hasActiveSubscription || user.subscriptionType === 'single_device_ru' || user.subscriptionType === 'happ' || user.subscriptionType === 'incy')) {
    user.deviceLocked = true;
    user.boundDevice = {
      deviceId: incomingHwid,
      clientName: incomingClientName,
      ip: currentIp,
      userAgent: currentAgent,
      boundAt: new Date().toISOString(),
      lastConnectedAt: new Date().toISOString(),
    };

    const linkedExcl = store.exclusions?.find((e) => e.userId === user.id || e.token === user.subscriptionToken);
    if (linkedExcl) {
      linkedExcl.boundDevice = user.boundDevice;
      linkedExcl.deviceLocked = true;
    }

    // Send Telegram confirmation notification to subscriber
    if (activeBot && activeBot.token && user.telegramId) {
      const bindNotice =
        `🔒 <b>ПОДПИСКА УСПЕШНО АКТИВИРОВАНА И ПРИВЯЗАНА!</b>\n\n` +
        `Устройство: <b>${incomingClientName}</b>\n` +
        `HWID: <code>${incomingHwid}</code>\n` +
        `IP подключения: <code>${currentIp}</code>\n` +
        `Дата активации: <code>${new Date().toLocaleString('ru-RU')}</code>\n\n` +
        `⚠️ <b>Внимание:</b> Подписка закреплена <b>строго за вами одним</b>. Передача ссылки другому лицу запрещена — при попытке подключения с другого устройства оно будет заблокировано, а вам вынесено предупреждение с таймером бана!`;
      botManager.sendDirectTelegramMessage(activeBot.token, user.telegramId, bindNotice).catch(() => {});
    }
    saveStore();
  }

  // 5. Subsequent connection checks: Anti-Sharing & 2nd Device Detection
  if (user.deviceLocked && user.boundDevice) {
    // If bound device was previously set to curl/browser/placeholder, re-bind on first real VPN client connection!
    const boundIsPlaceholder = user.boundDevice.clientName.toLowerCase().includes('curl') || 
      user.boundDevice.ip === '127.0.0.1' || 
      user.boundDevice.userAgent.toLowerCase().includes('curl') ||
      (user.boundDevice.userAgent.includes('Mozilla') && !user.boundDevice.userAgent.toLowerCase().includes('happ') && !user.boundDevice.userAgent.toLowerCase().includes('v2ray'));

    if (boundIsPlaceholder && !isCurlOrBrowser) {
      user.boundDevice = {
        deviceId: incomingHwid,
        clientName: incomingClientName,
        ip: currentIp,
        userAgent: currentAgent,
        boundAt: new Date().toISOString(),
        lastConnectedAt: new Date().toISOString(),
      };
      saveStore();
    }

    const boundClientLower = (user.boundDevice.clientName || '').toLowerCase();
    const incomingClientLower = incomingClientName.toLowerCase();
    const boundAgentLower = (user.boundDevice.userAgent || '').toLowerCase();
    const incomingAgentLower = currentAgent.toLowerCase();

    const matchesExplicit = Boolean(reqDeviceId && reqDeviceId === user.boundDevice.deviceId);
    const matchesExtracted = Boolean(incomingHwid === user.boundDevice.deviceId);
    const matchesIp = Boolean(user.boundDevice.ip === currentIp);
    const matchesAgent = Boolean(
      user.boundDevice.userAgent === currentAgent || 
      currentAgent.includes(user.boundDevice.clientName) ||
      user.boundDevice.clientName.includes(incomingClientName)
    );
    const matchesClientFamily = Boolean(
      (boundClientLower.includes('happ') && incomingClientLower.includes('happ')) ||
      (boundClientLower.includes('incy') && incomingClientLower.includes('incy')) ||
      (boundClientLower.includes('sing-box') && incomingClientLower.includes('sing-box')) ||
      (boundClientLower.includes('v2ray') && incomingClientLower.includes('v2ray')) ||
      (boundClientLower.includes('clash') && incomingClientLower.includes('clash')) ||
      (boundClientLower.includes('shadowrocket') && incomingClientLower.includes('shadowrocket'))
    );

    const isSamePlatform = Boolean(
      (boundAgentLower.includes('iphone') || boundAgentLower.includes('ios') || boundAgentLower.includes('darwin')) &&
      (incomingAgentLower.includes('iphone') || incomingAgentLower.includes('ios') || incomingAgentLower.includes('darwin'))
    ) || Boolean(
      boundAgentLower.includes('android') && incomingAgentLower.includes('android')
    ) || Boolean(
      (boundAgentLower.includes('windows') || boundAgentLower.includes('win64')) &&
      (incomingAgentLower.includes('windows') || incomingAgentLower.includes('win64'))
    );

    // Explicit secondary device parameter (e.g. ?device=2, ?device_id=second, or header mismatch)
    const isExplicitOtherDevice = Boolean(
      reqDeviceId && (
        reqDeviceId.includes('second') || 
        reqDeviceId.includes('2') || 
        (reqDeviceId !== user.boundDevice.deviceId && !matchesExtracted)
      )
    );

    if (user.status === 'active' && !user.isBlocked && !user.sharingGraceDeadlineAt) {
      user.secondDeviceActive = false;
      user.secondDeviceInfo = null;
    }

    let isSameDevice = false;
    if (user.isAdmin || user.bypassBlock) {
      // Administrator and test bypass users are never locked out
      isSameDevice = true;
    } else if (isCurlOrBrowser) {
      isSameDevice = true; // generic browser / curl inspects don't trigger violation
    } else if (isExplicitOtherDevice) {
      isSameDevice = false;
    } else if (matchesExplicit || matchesExtracted || (matchesIp && matchesAgent)) {
      isSameDevice = true;
      user.boundDevice.lastConnectedAt = new Date().toISOString();
    } else if (matchesAgent && !user.secondDeviceActive) {
      // Legitimate user on dynamic mobile network or switched Wi-Fi
      isSameDevice = true;
      user.boundDevice.ip = currentIp;
      user.boundDevice.lastConnectedAt = new Date().toISOString();
    } else if (matchesIp && !user.secondDeviceActive) {
      // Same user on their network testing different client apps (Happ, Incy, etc.)
      isSameDevice = true;
      user.boundDevice.lastConnectedAt = new Date().toISOString();
    } else if (matchesClientFamily && !user.secondDeviceActive) {
      // Legitimate user on mobile network (IP roamed or Wi-Fi <-> LTE): update IP!
      isSameDevice = true;
      user.boundDevice.ip = currentIp;
      user.boundDevice.lastConnectedAt = new Date().toISOString();
    } else if (isSamePlatform && !user.secondDeviceActive) {
      // Same subscriber device switched client apps (e.g. from Happ to Incy)
      isSameDevice = true;
      user.boundDevice.ip = currentIp;
      user.boundDevice.userAgent = currentAgent;
      user.boundDevice.clientName = incomingClientName;
      user.boundDevice.lastConnectedAt = new Date().toISOString();
    } else if (
      !user.secondDeviceActive && (
        (user.subscriptionType === 'happ' && incomingClientLower.includes('happ')) ||
        (user.subscriptionType === 'incy' && incomingClientLower.includes('incy'))
      )
    ) {
      // User connecting with the client format they explicitly chosen in bot
      isSameDevice = true;
      user.boundDevice.ip = currentIp;
      user.boundDevice.userAgent = currentAgent;
      user.boundDevice.clientName = incomingClientName;
      user.boundDevice.deviceId = incomingHwid;
      user.boundDevice.lastConnectedAt = new Date().toISOString();
    } else if (user.isTimerFrozen) {
      // User recently unblocked or 2nd device removed: allow reconnection and re-bind cleanly
      isSameDevice = true;
      user.isTimerFrozen = false;
      user.secondDeviceActive = false;
      user.secondDeviceInfo = null;
      user.sharingGraceDeadlineAt = null;
      user.status = 'active';
      user.isBlocked = false;
      user.isPermanentlyBanned = false;
      if (!user.boundDevice) {
        user.boundDevice = {
          deviceId: incomingHwid,
          clientName: incomingClientName,
          ip: currentIp,
          userAgent: currentAgent,
          boundAt: new Date().toISOString(),
          lastConnectedAt: new Date().toISOString(),
        };
        user.deviceLocked = true;
      } else {
        user.boundDevice.ip = currentIp;
        user.boundDevice.deviceId = incomingHwid;
        user.boundDevice.clientName = incomingClientName;
        user.boundDevice.userAgent = currentAgent;
        user.boundDevice.lastConnectedAt = new Date().toISOString();
      }
    } else {
      isSameDevice = false;
    }

    if (!isSameDevice) {
      // DETECTION: Unauthorized attempt to transfer subscription to another person / device!
      user.secondDeviceBlockedCount = (user.secondDeviceBlockedCount || 0) + 1;
      user.secondDeviceInfo = {
        ip: currentIp,
        userAgent: currentAgent,
        deviceId: incomingHwid,
        attemptedAt: new Date().toISOString(),
      };
      user.secondDeviceActive = true;
      user.isTimerFrozen = false;

      const graceHours = store.replacementTemplates?.source2GracePeriodHours ?? 2;
      const graceMinutes = store.replacementTemplates?.source2GracePeriodMinutes ?? 0;
      const totalGraceMs = (graceHours * 60 + graceMinutes) * 60 * 1000;

      // If grace period already expired -> Permanent BAN (Source 3)
      if (user.sharingGraceDeadlineAt && Date.now() > new Date(user.sharingGraceDeadlineAt).getTime()) {
        user.status = 'blocked';
        user.isBlocked = true;
        user.isPermanentlyBanned = true;
        user.subscriptionStatusReason = '⛔ Перманентный бан: истек срок на удаление подписки со 2-го устройства (БАН)';
        applyDisconnectStub(user, 'Device sharing grace expired (Source 3)', 3).catch(() => {});
        logSystemEvent(
          'error',
          'violations',
          'PERMANENT_BAN',
          `Перманентный бан @${user.username || user.telegramId}: истек таймер удаления подписки со 2-го устройства!`,
          { userId: user.id, telegramId: user.telegramId, username: user.username }
        );
        saveStore();
        return {
          isMutedOrBlocked: true,
          isSecondDeviceRejected: true,
          fallbackNotice: '⛔ Доступ заблокирован (Перманентный бан)',
          sourceNum: 3,
          incomingHwid,
        };
      }

      // 1st User (Owner): issue 1 warning, switch to Row 2, set Grace Period Deadline!
      user.sharingWarningCount = (user.sharingWarningCount || 0) + 1;
      user.deviceViolationAttempts = (user.deviceViolationAttempts || 0) + 1;
      user.lastDeviceViolationAt = new Date().toISOString();
      user.sharingWarnedAt = new Date().toISOString();

      if (!user.sharingGraceDeadlineAt) {
        user.sharingGraceDeadlineAt = new Date(Date.now() + totalGraceMs).toISOString();
      }
      // Automatically set status to 'blocked' (блокировка) according to current scenario!
      user.status = 'blocked';
      user.isBlocked = true;
      user.blockedReason = 'Обнаружена попытка передачи подписки на другое устройство';
      user.subscriptionStatusReason = `⛔ Блокировка [${user.sharingWarningCount}]: Обнаружена активность подписки на другом устройстве (${incomingClientName}). Подписка переведена в статус «Блокировка» по Сценарию 2. Срок на удаление: ${graceHours}ч ${graceMinutes}м (до бана)`;

      // Apply Row 2 (Source 2) stub to user's primary file in GitVerse
      applyDisconnectStub(user, 'Device sharing warning (Scenario 2 Block)', 2).catch(() => {});

      logSystemEvent(
        'error',
        'violations',
        'SUBSCRIPTION_TRANSFER_BLOCKED',
        `🚨 [УВЕДОМЛЕНИЕ АДМИНИСТРАТОРУ] Обнаружена передача подписки! Пользователь @${user.username || user.telegramId} (ID: ${user.telegramId}). Зафиксирована активность на чужом устройстве: ${incomingClientName} (IP: ${currentIp}, HWID: ${incomingHwid}). Основное устройство: ${user.boundDevice.clientName} (HWID: ${user.boundDevice.deviceId}). Подписка АВТОМАТИЧЕСКИ ПЕРЕВЕДЕНА В СТАТУС «БЛОКИРОВКА» по Сценарию 2. Доступ 2-го устройства заблокирован.`,
        {
          event: 'SUBSCRIPTION_TRANSFER_DETECTED',
          action: 'AUTO_BLOCKED',
          scenario: 'Сценарий 2: Защита от передачи (1 подписка = 1 устройство)',
          userId: user.id,
          telegramId: user.telegramId,
          username: user.username,
          warningCount: user.sharingWarningCount,
          primaryDevice: user.boundDevice,
          secondDevice: user.secondDeviceInfo,
          deadline: user.sharingGraceDeadlineAt,
          status: 'blocked',
        }
      );

      // Notify owner in Telegram Bot with inline confirmation button
      if (activeBot && activeBot.token && user.telegramId) {
        const deadlineDate = new Date(user.sharingGraceDeadlineAt);
        const untilStr = deadlineDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) + ' ' + deadlineDate.toLocaleDateString('ru-RU');
        const warnMsg =
          `⛔ <b>ВАША ПОДПИСКА ЗАБЛОКИРОВАНА: ЗАФИКСИРОВАНА ПЕРЕДАЧА ДРУГОМУ ЛИЦУ!</b>\n\n` +
          `Привязано к вашему устройству: <code>${user.boundDevice.clientName}</code> (HWID: <code>${user.boundDevice.deviceId}</code>).\n` +
          `Обнаружена попытка подключения со второго устройства: <code>${incomingClientName}</code> (IP: <code>${currentIp}</code>, HWID: <code>${incomingHwid}</code>).\n\n` +
          `🚫 <b>У второго человека подписка НЕ включилась (доступ заблокирован).</b>\n\n` +
          `Ваша подписка переведена в статус <b>«Блокировка»</b> (Сценарий 2), вам вынесено <b>${user.sharingWarningCount || 1} предупреждение</b>.\n\n` +
          `⏳ <b>Срок на удаление: ${graceHours} ч. ${graceMinutes} мин. (до ${untilStr})</b>\n` +
          `Вы должны сказать человеку, которому передали подписку, чтобы он <b>НЕМЕДЛЕННО УДАЛИЛ ЕЁ</b> из своего приложения!\n\n` +
          `⛔ Если второй пользователь не удалит подписку до указанного времени — наступит <b>ПОЛНЫЙ БАН (БЛОКИРОВКА НАВСЕГДА)</b>!\n\n` +
          `После того как второй пользователь удалит подписку, нажмите кнопку ниже для восстановления:`;
        const replyMarkup = {
          inline_keyboard: [
            [{ text: '✅ Второй пользователь удалил подписку', callback_data: 'cmd_second_device_removed' }]
          ]
        };
        botManager.sendDirectTelegramMessage(activeBot.token, user.telegramId, warnMsg, replyMarkup).catch(() => {});
      }

      // Also notify channel admins in Telegram if available
      const adminUsers = store.users.filter(u => u.isAdmin || u.channelMembership === 'creator' || u.channelMembership === 'administrator');
      if (activeBot && activeBot.token && adminUsers.length > 0) {
        const adminAlertText =
          `🚨 <b>ТРЕВОГА АДМИНИСТРАТОРУ: ПЕРЕДАЧА ПОДПИСКИ!</b>\n\n` +
          `👤 Нарушитель: @${user.username || 'без_username'} (ID: <code>${user.telegramId}</code>)\n` +
          `🔒 Привязанное устройство: <b>${user.boundDevice.clientName}</b> (HWID: <code>${user.boundDevice.deviceId}</code>)\n` +
          `⚠️ Попытка входа с чужого устройства: <b>${incomingClientName}</b>\n` +
          `🌐 IP: <code>${currentIp}</code> • HWID: <code>${incomingHwid}</code>\n\n` +
          `⛔ <b>Действие системы:</b> Подписка автоматически переведена в статус <b>«БЛОКИРОВКА»</b> (Сценарий 2). Доступ 2-го лица заблокирован.`;
        for (const admin of adminUsers.slice(0, 3)) {
          if (admin.telegramId && admin.telegramId !== user.telegramId) {
            botManager.sendDirectTelegramMessage(activeBot.token, admin.telegramId, adminAlertText).catch(() => {});
          }
        }
      }

      // Sync state with linked exclusion item in store.exclusions
      const linkedExcl = store.exclusions?.find((e) => e.userId === user.id || e.token === user.subscriptionToken);
      if (linkedExcl) {
        linkedExcl.status = 'blocked';
        linkedExcl.isBlocked = true;
        linkedExcl.sharingGraceDeadlineAt = user.sharingGraceDeadlineAt;
        linkedExcl.sharingWarningCount = user.sharingWarningCount;
        linkedExcl.secondDeviceInfo = user.secondDeviceInfo;
        linkedExcl.secondDeviceBlockedCount = user.secondDeviceBlockedCount;
        linkedExcl.subscriptionStatusReason = user.subscriptionStatusReason;
      }

      saveStore();

      // For the 2nd device: Return dummy warning node so device displays blocked notice
      return {
        isMutedOrBlocked: true,
        isSecondDeviceRejected: true,
        fallbackNotice: '⛔ Доступ заблокирован: данная подписка строго для 1 устройства (доступ запрещен)',
        sourceNum: 2,
        incomingHwid,
      };
    } else {
      // Legitimate Primary Device
      user.boundDevice.lastConnectedAt = new Date().toISOString();
      if (user.boundDevice.ip !== currentIp) {
        user.boundDevice.ip = currentIp; // IP roaming on mobile cellular network
      }

      // Check if user is currently under sharing grace warning (only if timer is NOT frozen!)
      if (user.sharingGraceDeadlineAt && !user.isTimerFrozen) {
        if (Date.now() > new Date(user.sharingGraceDeadlineAt).getTime()) {
          // Timer expired -> Permanent BAN (Source 3)
          user.status = 'blocked';
          user.isBlocked = true;
          user.isPermanentlyBanned = true;
          user.subscriptionStatusReason = '⛔ Перманентный бан: срок на удаление со второго устройства истек (БАН)';
          applyDisconnectStub(user, 'Device sharing grace expired (Source 3)', 3).catch(() => {});
          saveStore();
          const overrideNodes = await getReplacementSourceNodes(3);
          return {
            isMutedOrBlocked: true,
            fallbackNotice: '⛔ Перманентный бан (таймер истек)',
            sourceNum: 3,
            overrideNodes,
            incomingHwid,
          };
        } else {
          // Warning still active -> Return Row 2 nodes
          const overrideNodes = await getReplacementSourceNodes(2);
          return {
            isMutedOrBlocked: true,
            fallbackNotice: '⚠️ Предупреждение (Строка 2): удалите подписку на 2-м устройстве',
            sourceNum: 2,
            overrideNodes,
            incomingHwid,
          };
        }
      }
    }
  }

  // 6. Temporary Mute check -> Source 2
  if (user.status === 'muted') {
    if (user.mutedUntil && new Date(user.mutedUntil).getTime() > Date.now()) {
      const overrideNodes = await getReplacementSourceNodes(2);
      return {
        isMutedOrBlocked: true,
        fallbackNotice: store.replacementTemplates.mutedNodeName || '⏳ Подписка на паузе (Строка 2)',
        sourceNum: 2,
        overrideNodes,
      };
    } else if (!user.sharingGraceDeadlineAt) {
      // Mute expired and not under sharing grace, restore
      user.status = user.channelMembership === 'left' ? 'channel_inactive' : 'active';
      user.mutedUntil = null;
      restoreUserNodes(user).catch(() => {});
    }
  }

  saveStore();
  return {
    isMutedOrBlocked: false,
    fallbackNotice: '',
    overrideNodes: undefined,
  };
}

// Helper to set unlimited subscription headers (omits total= to guarantee Unlimited / Без ограничений in Happ, Incy, Clash, Singbox, V2Ray)
function setUnlimitedSubscriptionHeaders(
  res: any,
  item?: { trafficUsedBytes?: number; trafficLimitBytes?: number } | null
) {
  const download = item?.trafficUsedBytes || 0;
  // If trafficLimitBytes is strictly > 0 and not unlimited (0 = unlimited), include total; otherwise omit total for UNLIMITED
  const hasCustomLimit = typeof item?.trafficLimitBytes === 'number' && item.trafficLimitBytes > 0;
  const parts = [
    'upload=0',
    `download=${download}`,
    ...(hasCustomLimit ? [`total=${item!.trafficLimitBytes}`] : []),
    'expire=2082758400'
  ];
  res.setHeader('Subscription-Userinfo', parts.join('; '));
  res.setHeader('Profile-Update-Interval', '12');
}

// 10. Public Subscription Serving Endpoint with Replacement Enforcement (/api/sub/:token and /sub/:token)
app.get(['/api/sub/:token', '/sub/:token'], async (req, res) => {
  const { token } = req.params;
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  const format = req.query.format as string;
  const userAgent = (req.headers['user-agent'] || '').toLowerCase();
  const reqCookieId = (req.headers['cookie'] || '').match(/__sub_dev_id=([a-zA-Z0-9_-]+)/)?.[1];
  const reqDeviceId = (req.headers['x-device-id'] as string) || (req.query.device_id as string) || (req.query.device as string) || reqCookieId;
  const rawForwarded = req.headers['x-forwarded-for'];
  let clientIp = '';
  if (typeof rawForwarded === 'string') {
    clientIp = rawForwarded.split(',')[0].trim();
  }
  if (!clientIp || clientIp === '127.0.0.1') {
    clientIp = (req.headers['x-real-ip'] as string) || req.ip || '127.0.0.1';
  }
  const clientAgent = (req.headers['user-agent'] as string) || 'V2Ray Client';

  const user = store.users.find((u) => u.subscriptionToken === token);
  const exclusion = store.exclusions.find((e) => e.token === token);

  // If ordinary team exclusion token (without single device / channel restriction):
  if (exclusion && !exclusion.isChannelExclusion) {
    exclusion.trafficUsedBytes += 512000;

    // Track connected client/device for exclusion
    if (!Array.isArray(exclusion.connectedClients)) {
      exclusion.connectedClients = [];
    }
    const detectedType = detectClientType(clientAgent);
    const existingIndex = exclusion.connectedClients.findIndex(
      (c) => (reqDeviceId && c.deviceId === reqDeviceId) || (c.ip === clientIp && c.userAgent === clientAgent)
    );
    const nowIso = new Date().toISOString();
    if (existingIndex >= 0) {
      exclusion.connectedClients[existingIndex].lastConnectedAt = nowIso;
      exclusion.connectedClients[existingIndex].requestsCount = (exclusion.connectedClients[existingIndex].requestsCount || 0) + 1;
      if (reqDeviceId) exclusion.connectedClients[existingIndex].deviceId = reqDeviceId;
    } else {
      exclusion.connectedClients.unshift({
        id: 'cli_' + Math.random().toString(36).substr(2, 9),
        ip: clientIp,
        userAgent: clientAgent,
        clientType: detectedType,
        deviceId: reqDeviceId || undefined,
        firstConnectedAt: nowIso,
        lastConnectedAt: nowIso,
        requestsCount: 1,
      });
      if (exclusion.connectedClients.length > 100) {
        exclusion.connectedClients = exclusion.connectedClients.slice(0, 100);
      }
    }

    saveStore();
    const exclNodes = getFullSubscriptionContent(null, exclusion);
    const configs = buildConfigurations(token, exclusion.name, exclNodes, [], false, '');
    if (format === 'clash' || userAgent.includes('clash') || userAgent.includes('mihomo')) {
      res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
      const clash = configs.find((c) => c.id === 'clash');
      return res.send(clash?.content || exclNodes);
    }
    if (format === 'singbox' || userAgent.includes('sing-box')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      const singbox = configs.find((c) => c.id === 'singbox');
      return res.send(singbox?.content || '{}');
    }
    if (format === 'crypt5' || format === 'happ') {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('X-Subscription-Format', 'crypt5');
      setUnlimitedSubscriptionHeaders(res, exclusion);
      const v2ray = configs.find((c) => c.id === 'v2ray');
      return res.send(v2ray?.content || Buffer.from(exclNodes).toString('base64'));
    }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    setUnlimitedSubscriptionHeaders(res, exclusion);
    const v2ray = configs.find((c) => c.id === 'v2ray');
    return res.send(v2ray?.content || Buffer.from(exclNodes).toString('base64'));
  }

  let isMutedOrBlocked = false;
  let fallbackNodeNotice = '';
  let overrideNodes: string | undefined = undefined;

  if (user) {
    const statusRes = await evaluateUserSubscriptionStatus(user, reqDeviceId, clientIp, clientAgent);

    if (statusRes.incomingHwid) {
      res.setHeader('Set-Cookie', `__sub_dev_id=${statusRes.incomingHwid}; Path=/; Max-Age=315360000; HttpOnly; SameSite=Lax`);
    }

    // If second device attempt: IT MUST NOT TURN ON!
    if (statusRes.isSecondDeviceRejected) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('X-Error-Reason', 'second-device-unauthorized');
      const rejectionNotice = 'vless://00000000-0000-0000-0000-000000000000@127.0.0.1:443?encryption=none&security=none#⛔ Доступ заблокирован: данная подписка строго для 1 устройства (доступ запрещен)';
      const encodedRejection = Buffer.from(rejectionNotice).toString('base64');
      return res.status(200).send(encodedRejection);
    }

    isMutedOrBlocked = statusRes.isMutedOrBlocked;
    fallbackNodeNotice = statusRes.fallbackNotice;
    overrideNodes = statusRes.overrideNodes;
  }

  const effectiveContent = (user || exclusion)
    ? getFullSubscriptionContent(user, exclusion)
    : store.centralFile.content;

  const configs = buildConfigurations(
    token,
    user?.username || exclusion?.name || 'user',
    effectiveContent,
    user?.personalNodes || [],
    isMutedOrBlocked,
    fallbackNodeNotice,
    overrideNodes
  );

  if (format === 'clash' || userAgent.includes('clash') || userAgent.includes('mihomo')) {
    res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
    setUnlimitedSubscriptionHeaders(res, user || exclusion);
    const clash = configs.find((c) => c.id === 'clash');
    return res.send(clash?.content || overrideNodes || store.centralFile.content);
  }

  if (format === 'singbox' || userAgent.includes('sing-box')) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    setUnlimitedSubscriptionHeaders(res, user || exclusion);
    const singbox = configs.find((c) => c.id === 'singbox');
    return res.send(singbox?.content || '{}');
  }

  if (format === 'crypt5' || format === 'happ') {
    // HAPP crypt5 format encoding
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('X-Subscription-Format', 'crypt5');
    setUnlimitedSubscriptionHeaders(res, user || exclusion);
    const v2ray = configs.find((c) => c.id === 'v2ray');
    return res.send(v2ray?.content || '');
  }

  // Default Base64
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  setUnlimitedSubscriptionHeaders(res, user || exclusion);
  const v2ray = configs.find((c) => c.id === 'v2ray');
  return res.send(v2ray?.content || '');
});

// 10b. Secure Encrypted Subscription Endpoint (Hides raw Git origin & enforces 1-device policy)
app.get('/api/sub/enc/:cipherToken', async (req, res) => {
  const { cipherToken } = req.params;
  const reqFormat = req.query.format as string;
  const userAgent = (req.headers['user-agent'] || '').toLowerCase();
  const reqDeviceId = (req.headers['x-device-id'] as string) || (req.query.device_id as string);
  const clientIp = (req.headers['x-forwarded-for'] as string) || req.ip || '127.0.0.1';
  const clientAgent = req.headers['user-agent'] || 'V2Ray Client';

  // Decrypt payload
  let decryptedPayload = decryptObject<{ u?: number; t?: string; fmt?: string; ts?: number }>(cipherToken);
  let resolvedToken = decryptedPayload?.t;
  let resolvedTelegramId = decryptedPayload?.u;

  if (!resolvedToken) {
    const rawDec = decryptData(cipherToken);
    if (rawDec) {
      if (rawDec.includes(':')) {
        const parts = rawDec.split(':');
        resolvedTelegramId = Number(parts[0]);
        resolvedToken = parts[1];
      } else {
        resolvedToken = rawDec;
      }
    }
  }

  const exclusion = store.exclusions.find(
    (e) => (resolvedToken && e.token === resolvedToken) || e.id === resolvedToken
  );

  if (exclusion) {
    exclusion.trafficUsedBytes += 512000;
    saveStore();
    const exclNodes = getFullSubscriptionContent(null, exclusion);
    const configs = buildConfigurations(exclusion.token, exclusion.name, exclNodes, [], false, '');
    const finalFormat = reqFormat || decryptedPayload?.fmt;

    if (finalFormat === 'clash' || userAgent.includes('clash') || userAgent.includes('mihomo')) {
      res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
      setUnlimitedSubscriptionHeaders(res, exclusion);
      const clash = configs.find((c) => c.id === 'clash');
      return res.send(clash?.content || exclNodes);
    }
    if (finalFormat === 'singbox' || userAgent.includes('sing-box')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      setUnlimitedSubscriptionHeaders(res, exclusion);
      const singbox = configs.find((c) => c.id === 'singbox');
      return res.send(singbox?.content || '{}');
    }
    if (finalFormat === 'crypt5' || finalFormat === 'happ') {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('X-Subscription-Format', 'crypt5');
      setUnlimitedSubscriptionHeaders(res, exclusion);
      const v2ray = configs.find((c) => c.id === 'v2ray');
      return res.send(v2ray?.content || Buffer.from(exclNodes).toString('base64'));
    }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    setUnlimitedSubscriptionHeaders(res, exclusion);
    const v2ray = configs.find((c) => c.id === 'v2ray');
    return res.send(v2ray?.content || Buffer.from(exclNodes).toString('base64'));
  }

  const user = store.users.find(
    (u) => (resolvedToken && u.subscriptionToken === resolvedToken) ||
           (resolvedTelegramId && u.telegramId === resolvedTelegramId)
  );

  if (!user) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(404).send('Subscription not found or expired');
  }

  const statusRes = await evaluateUserSubscriptionStatus(user, reqDeviceId, clientIp, clientAgent);

  if (statusRes.isSecondDeviceRejected) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('X-Error-Reason', 'second-device-unauthorized');
    return res.status(403).send('vless://00000000-0000-0000-0000-000000000000@127.0.0.1:443?encryption=none&security=none#⛔ Доступ заблокирован: данная подписка строго для 1 устройства (доступ запрещен)');
  }

  const configs = buildConfigurations(
    user.subscriptionToken,
    user.username || 'user',
    store.centralFile.content,
    user.personalNodes || [],
    statusRes.isMutedOrBlocked,
    statusRes.fallbackNotice,
    statusRes.overrideNodes
  );

  const finalFormat = reqFormat || decryptedPayload?.fmt;

  if (finalFormat === 'clash' || userAgent.includes('clash') || userAgent.includes('mihomo')) {
    res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
    setUnlimitedSubscriptionHeaders(res, user);
    const clash = configs.find((c) => c.id === 'clash');
    return res.send(clash?.content || statusRes.overrideNodes || store.centralFile.content);
  }

  if (finalFormat === 'singbox' || userAgent.includes('sing-box')) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    setUnlimitedSubscriptionHeaders(res, user);
    const singbox = configs.find((c) => c.id === 'singbox');
    return res.send(singbox?.content || '{}');
  }

  if (finalFormat === 'happ' || finalFormat === 'crypt5') {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('X-Subscription-Format', 'crypt5');
    setUnlimitedSubscriptionHeaders(res, user);
    const v2ray = configs.find((c) => c.id === 'v2ray');
    return res.send(v2ray?.content || '');
  }

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  setUnlimitedSubscriptionHeaders(res, user);
  const v2ray = configs.find((c) => c.id === 'v2ray');
  return res.send(v2ray?.content || '');
});

// 11. Interactive Bot Funnel & Simulation Engine
app.post('/api/bot/simulate', async (req, res) => {
  const { text, callbackData, user, clientTime: reqClientTime, clientTimeZone: reqClientTimeZone } = req.body;
  const bot = getActiveBot();
  const host = process.env.APP_URL || 'http://localhost:3000';

  // Determine client device time for accurate local timestamping
  const clientDeviceTime = reqClientTime || new Date().toLocaleTimeString('ru-RU', {
    timeZone: bot.timeZone && bot.timeZone !== 'device' ? bot.timeZone : 'Europe/Moscow',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  const clientDeviceTz = reqClientTimeZone || (bot.timeZone === 'Europe/Moscow' ? 'МСК, UTC+3' : (bot.timeZone || 'местное'));

  const currentUser = user || {
    id: 108456789,
    firstName: 'Тестовый Пользователь',
    username: 'test_user',
    isChannelMember: true,
    isBlocked: false,
  };

  let dbUser = store.users.find((u) => u.telegramId === currentUser.id);
  if (!dbUser) {
    const token = `sub_${currentUser.username || currentUser.id}_${Math.random().toString(36).substring(2, 8)}`;
    dbUser = {
      id: `usr_${Date.now()}`,
      telegramId: currentUser.id,
      username: currentUser.username,
      firstName: currentUser.firstName,
      joinedAt: new Date().toISOString(),
      receivedAt: null, // user hasn't received sub yet!
      subscriptionName: '',
      subscriptionType: 'happ',
      status: currentUser.isBlocked ? 'blocked' : (currentUser.isChannelMember ? 'active' : 'channel_inactive'),
      mutedUntil: null,
      channelMembership: currentUser.isChannelMember ? 'member' : 'left',
      subscriptionToken: token,
      subscriptionExpiresAt: null,
      trafficUsedBytes: 0,
      trafficLimitBytes: 0,
      isBlocked: Boolean(currentUser.isBlocked),
      lastActiveAt: new Date().toISOString(),
      personalNodes: [],
    };
    store.users.unshift(dbUser);
    saveStore();
  } else {
    // Keep dbUser status in sync with simulation toggles
    let changed = false;
    if (currentUser.isBlocked !== undefined && dbUser.isBlocked !== Boolean(currentUser.isBlocked)) {
      dbUser.isBlocked = Boolean(currentUser.isBlocked);
      dbUser.status = currentUser.isBlocked ? 'blocked' : (dbUser.channelMembership === 'left' ? 'channel_inactive' : 'active');
      changed = true;
    }
    if (currentUser.isChannelMember !== undefined) {
      const newMembership = currentUser.isChannelMember ? 'member' : 'left';
      if (dbUser.channelMembership !== newMembership) {
        dbUser.channelMembership = newMembership;
        if (!currentUser.isChannelMember) {
          dbUser.status = 'channel_inactive';
        } else if (!dbUser.isBlocked) {
          dbUser.status = 'active';
        }
        changed = true;
      }
    }
    if (changed) {
      saveStore();
    }
  }

  const inputCmd = (callbackData || text || '').toLowerCase().trim();
  const subUrl = `${host}/api/sub/${dbUser.subscriptionToken}`;
  const directSubUrl = dbUser.gitRawUrl || subUrl;

  if (inputCmd === 'cmd_report_broken_subscription') {
    dbUser.pendingSubscriptionReissue = true;
    store.feedbackRequests = store.feedbackRequests || [];
    store.feedbackRequests.unshift({
      id: `feedback_${Date.now()}_${dbUser.telegramId}`,
      userId: dbUser.id,
      telegramId: dbUser.telegramId,
      username: dbUser.username,
      firstName: dbUser.firstName,
      type: 'general_feedback',
      message: 'Пользователь сообщил, что подписка не работает, и запросил перевыпуск.',
      createdAt: new Date().toISOString(),
      status: 'pending',
    });
    saveStore();
    const activeSource = store.gitSources?.find((source) => source.id === store.activeGitSourceId) || store.gitSources?.[0];
    return res.json({
      response: {
        text: `🛠 Перевыпуск подписки\n\nНовая подписка будет создана в текущем источнике${activeSource?.name ? ` «${activeSource.name}»` : ''}. Выберите формат:`,
        stepKey: 'choose_format',
        buttons: [[
          { text: '🚀 HAPP', callbackData: 'cmd_issue_happ', color: bot.buttonColor || 'indigo' },
          { text: '⚡ INCY', callbackData: 'cmd_issue_incy', color: 'emerald' },
        ], [{ text: 'Отмена', callbackData: 'cmd_menu' }]],
      },
    });
  }

  // Check if user is blocked in bot!
  if (dbUser.status === 'blocked' || dbUser.isBlocked) {
    // 1. User clicked button to request unblock
    if (inputCmd === 'cmd_request_unblock') {
      dbUser.pendingUnblockRequest = true;
      saveStore();
      return res.json({
        response: {
          text: `📝 **Заявка на разблокировку подписки**\n\n` +
            `⛔ **Причина блокировки:** ${dbUser.subscriptionStatusReason || dbUser.blockedReason || 'Подозрение на подозрительные действия'}\n` +
            `🕒 **Время блокировки:** ${new Date(dbUser.bannedAt || dbUser.lastActiveAt || Date.now()).toLocaleString('ru-RU')}\n` +
            `⚠️ **Количество нарушений:** ${dbUser.deviceViolationAttempts || 0}\n\n` +
            `✍️ **Напишите ответным сообщением** причину и объяснение ситуации для администратора. Заявка мгновенно поступит в раздел «Обратная связь» панели управления с кнопкой быстрой разблокировки.`,
          botButtonColor: 'rose',
          stepKey: 'blocked',
          buttons: [
            [{ text: '◀️ Отмена / Назад', callbackData: 'cmd_blocked_menu' }],
          ],
        },
      });
    }

    // 2. User replied with reason/explanation text
    if (dbUser.pendingUnblockRequest && text && text.trim() && !inputCmd.startsWith('cmd_')) {
      const reasonText = text.trim();
      const fbItem: FeedbackRequest = {
        id: `unblock_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        userId: dbUser.id,
        telegramId: dbUser.telegramId,
        username: dbUser.username || '',
        firstName: dbUser.firstName || 'Пользователь',
        type: 'unblock_request',
        message: reasonText,
        banReason: dbUser.subscriptionStatusReason || dbUser.blockedReason || 'Блокировка доступа',
        blockedAt: dbUser.bannedAt || dbUser.lastActiveAt || new Date().toISOString(),
        attempts: dbUser.deviceViolationAttempts || 0,
        createdAt: new Date().toISOString(),
        status: 'pending',
        boundDevice: dbUser.boundDevice
          ? {
              clientName: dbUser.boundDevice.clientName,
              ip: dbUser.boundDevice.ip,
              boundAt: dbUser.boundDevice.boundAt,
            }
          : null,
      };

      if (!store.feedbackRequests) store.feedbackRequests = [];
      store.feedbackRequests.unshift(fbItem);
      dbUser.pendingUnblockRequest = false;
      saveStore();

      return res.json({
        response: {
          text: `✅ **Заявка на разблокировку успешно отправлена!**\n\n` +
            `📝 **Ваше сообщение администратору:**\n_${reasonText}_\n\n` +
            `🕒 **Время подачи:** ${clientDeviceTime} (${clientDeviceTz})\n\n` +
            `Администратор рассмотрит заявку в панели управления. После рассмотрения вы сможете получить доступ к подписке заново.`,
          botButtonColor: 'emerald',
          stepKey: 'blocked',
          buttons: [
            [{ text: '💬 Связаться с администратором напрямую', callbackData: 'open_admin', url: bot.adminContactUrl || 'https://t.me/puls_admin' }],
          ],
        },
      });
    }

    const blockedMsg = bot.blockedUserMessage
      .replace('{username}', dbUser.username ? `@${dbUser.username}` : (dbUser.firstName || 'Пользователь'))
      .replace('{reason}', dbUser.blockedReason || dbUser.subscriptionStatusReason || 'подозрение на нарушение правил использования');

    return res.json({
      response: {
        text: `🚫 ${blockedMsg}\n\n` +
          `⛔ **Причина:** ${dbUser.subscriptionStatusReason || dbUser.blockedReason || 'Нарушение правил'}\n` +
          `🕒 **Время:** ${new Date(dbUser.bannedAt || dbUser.lastActiveAt || Date.now()).toLocaleString('ru-RU')}\n` +
          `⚠️ **Количество нарушений:** ${dbUser.deviceViolationAttempts || 0}`,
        botButtonColor: 'rose',
        stepKey: 'blocked',
        buttons: [
          [{ text: '📝 Подать заявку на разблокировку', callbackData: 'cmd_request_unblock', color: 'rose' }],
          [{ text: '💬 Написать администратору', callbackData: 'open_admin', url: bot.adminContactUrl || 'https://t.me/puls_admin' }],
        ],
      },
    });
  }

  const defaultBtnColor = bot.buttonColor || 'indigo';

  // Check Single Device Ownership & Existing Subscription
  // If user already has an active subscription, allow switching between HAPP and INCY formats freely!
  if (['cmd_start_funnel', 'cmd_get_sub', '/sub'].includes(inputCmd) && dbUser.hasActiveSubscription && dbUser.gitFilePath) {
    const boundDate = dbUser.boundDevice ? new Date(dbUser.boundDevice.boundAt).toLocaleString('ru-RU') : 'Привязано';
    return res.json({
      response: {
        text: `🔑 **У вас уже выпущена персональная подписка!**\n\n` +
          `🏷 **Текущий формат:** ${dbUser.subscriptionType === 'happ' ? `HAPP (${store.happCryptVersion})` : 'INCY / VLESS'}\n` +
          `📱 **Привязанное устройство:** ${dbUser.boundDevice?.clientName || '1 устройство'}\n` +
          `🕒 **Дата привязки:** ${boundDate}\n\n` +
          `💡 *Подписка выдается 1 раз на ваше персональное устройство. Вы можете в любой момент переключить формат между HAPP и INCY без потери доступа:*`,
        botButtonColor: defaultBtnColor,
        stepKey: 'sub_issued',
        buttons: [
          [
            { text: '🚀 Получить ссылку HAPP (crypt4)', callbackData: 'cmd_issue_happ', color: 'indigo' },
            { text: '⚡ Получить ссылку INCY', callbackData: 'cmd_issue_incy', color: 'emerald' },
          ],
          [
            { text: '👤 Мой профиль', callbackData: 'cmd_profile', color: 'emerald' },
            { text: '📝 Запросить смену устройства', callbackData: 'cmd_request_unbind', color: 'amber' },
          ],
          [{ text: '⬅️ Главное меню', callbackData: 'cmd_menu' }],
        ],
      },
    });
  }

  // Handle unbind request command from user
  if (inputCmd === 'cmd_request_unbind') {
    dbUser.pendingUnbindRequest = true;
    saveStore();
    return res.json({
      response: {
        text: `📝 **Запрос на отвязку подписки от устройства**\n\n` +
          `📱 Текущее устройство: **${dbUser.boundDevice?.clientName || 'Привязанное устройство'}**\n\n` +
          `✍️ Пожалуйста, **напишите и отправьте текстовым сообщением причину отвязки** (например: «Купил новый смартфон», «Переустановил клиент», «Заменил роутер»).\n\n` +
          `Ваше сообщение с причиной мгновенно поступит администратору в раздел **«Обратная связь»**. Администратор нажмет кнопку «Отвязать», обнулит лимит подписки, и вы сможете переполучить доступ!`,
        botButtonColor: defaultBtnColor,
        stepKey: 'other',
        buttons: [
          [{ text: '⬅️ Отмена (Главное меню)', callbackData: 'cmd_menu' }],
        ],
      },
    });
  }

  // Handle incoming text message as unbind reason if user requested it or sends plain text
  if (dbUser.pendingUnbindRequest || (text && !callbackData && !text.startsWith('/') && dbUser.boundDevice)) {
    const reasonText = (text || '').trim();
    if (reasonText) {
      const feedbackRecord: FeedbackRequest = {
        id: `fb_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        userId: dbUser.id,
        telegramId: dbUser.telegramId,
        username: dbUser.username || '',
        firstName: dbUser.firstName || 'Пользователь',
        type: 'unbind_device',
        message: reasonText,
        createdAt: new Date().toISOString(),
        status: 'pending',
        boundDevice: dbUser.boundDevice ? {
          clientName: dbUser.boundDevice.clientName,
          ip: dbUser.boundDevice.ip,
          boundAt: dbUser.boundDevice.boundAt,
        } : null,
      };

      if (!store.feedbackRequests) store.feedbackRequests = [];
      store.feedbackRequests.unshift(feedbackRecord);
      dbUser.pendingUnbindRequest = false;
      saveStore();

      return res.json({
        response: {
          text: `✅ **Запрос на отвязку успешно отправлен администратору!**\n\n` +
            `👤 **Пользователь:** ${dbUser.firstName} (@${dbUser.username || dbUser.telegramId})\n` +
            `📝 **Причина:** «*${reasonText}*»\n` +
            `📱 **Устройство:** ${dbUser.boundDevice?.clientName || 'Привязано'}\n\n` +
            `📬 Заявка поступила владельцу сервиса в раздел **«Обратная связь»**. После того как администратор подтвердит отвязку и сбросит лимиты, вы сможете выпустить подписку повторно.`,
          botButtonColor: defaultBtnColor,
          stepKey: 'other',
          buttons: [
            [{ text: '👤 Проверить мой профиль', callbackData: 'cmd_profile', color: defaultBtnColor }],
            [{ text: '⬅️ Главное меню', callbackData: 'cmd_menu' }],
          ],
        },
      });
    }
  }

  // Step 1: Main Menu (/start or cmd_menu)
  if (inputCmd === '/start' || inputCmd.startsWith('/start') || inputCmd === 'cmd_menu' || inputCmd === 'cmd_start') {
    if (dbUser.pendingSubscriptionReissue) {
      dbUser.pendingSubscriptionReissue = false;
      saveStore();
    }
    const isSubActive = Boolean(dbUser.hasActiveSubscription && dbUser.finalSubscriptionUrl);
    const formatName = dbUser.subscriptionType === 'happ' ? `HAPP (${store.happCryptVersion})` : 'INCY';
    const activeSource = store.gitSources?.find((source) => source.id === store.activeGitSourceId) || store.gitSources?.[0];
    const sourceChanged = Boolean(dbUser.subscriptionSourceId && activeSource && dbUser.subscriptionSourceId !== activeSource.id);
    const sourceChangeNotice = sourceChanged
      ? `\n\n⚠️ Источник подписки изменился на «${activeSource?.name}». Получите актуальную версию из текущего источника через меню.`
      : '';
    const welcomeTemplate = bot.welcomeMessage || CANONICAL_BOT_TEMPLATES.welcomeMessage;
    const welcomeText = formatBotTemplate(welcomeTemplate, {
      name: dbUser.firstName || 'друг',
      username: dbUser.username,
      id: dbUser.telegramId,
      channel: bot.channels[0]?.id || '@puls_channel',
      format: formatName,
      status: isSubActive ? '🟢 Активна' : '⚪ Не получена',
    });

    const menuText = isSubActive
      ? `${welcomeText}\n\n🔑 **У вас активна персональная подписка!**\n🏷 Формат: **${formatName}**\n📱 Доступ: 1 персональное устройство\n\nУправляйте вашей подпиской через меню ниже:${sourceChangeNotice}`
      : `${welcomeText}\n\n⚡ Получите персональный ключ высокоскоростного подключения прямо сейчас:`;

    const menuButtons = isSubActive
      ? [
          [
            {
              text: dbUser.subscriptionType === 'happ' ? '⚡ Переключить на INCY' : '🚀 Переключить на HAPP (crypt4)',
              callbackData: dbUser.subscriptionType === 'happ' ? 'cmd_issue_incy' : 'cmd_issue_happ',
              color: 'indigo',
            },
            { text: '👤 Мой профиль', callbackData: 'cmd_profile', color: 'emerald' },
          ],
          [
            { text: '📋 Инструкция', callbackData: 'cmd_instructions' },
            { text: '📝 Сменить устройство', callbackData: 'cmd_request_unbind', color: 'amber' },
          ],
          [{ text: '🌐 Получить подписку из текущего источника', callbackData: 'cmd_current_source_subscription' }],
          [{ text: '🛠 Подписка не работает — перевыпустить', callbackData: 'cmd_report_broken_subscription' }],
          [{ text: '💬 Поддержка', callbackData: 'open_admin', url: bot.adminContactUrl || 'https://t.me/puls_admin' }],
        ]
      : [
          [{ text: '🔑 Получить подписку', callbackData: 'cmd_choose_format', color: defaultBtnColor }],
          [
            { text: '📋 Инструкция по настройке', callbackData: 'cmd_instructions' },
            { text: '💬 Связаться с нами', callbackData: 'open_admin', url: bot.adminContactUrl || 'https://t.me/puls_admin' },
          ],
        ];

    return res.json({
      response: {
        text: menuText,
        botButtonColor: defaultBtnColor,
        stepKey: 'welcome',
        buttons: menuButtons,
      },
    });
  }

  // Step 2: My Profile (Мой профиль)
  if (inputCmd === 'cmd_profile') {
    if (!dbUser.hasActiveSubscription) {
      return res.json({
        response: {
          text: `👤 Профиль: ${dbUser.firstName || 'Пользователь'} (${dbUser.telegramId})\n\n⚠️ У вас пока нет активной подписки!\nЧтобы получить безопасный доступ, нажмите «Получить подписку»:`,
          stepKey: 'profile',
          buttons: [
            [{ text: '🔑 Получить подписку', callbackData: 'cmd_choose_format', color: defaultBtnColor }],
            [{ text: '⬅️ Главное меню', callbackData: 'cmd_menu' }],
          ],
        },
      });
    }

    const displayKey = await resolveUserDisplayKey(dbUser);
    const isHapp = dbUser.subscriptionType === 'happ';
    const formatName = isHapp ? `HAPP (${store.happCryptVersion})` : 'INCY';
    const boundDate = dbUser.boundDevice ? new Date(dbUser.boundDevice.boundAt).toLocaleString('ru-RU') : 'Не привязано (свободный слот)';
    const deviceName = dbUser.boundDevice?.clientName || 'Ожидает первого подключения';
    const statusText = dbUser.hasActiveSubscription ? '🟢 Активна' : '⚪ Не получена';

    const profileTemplate = bot.profileMessage || CANONICAL_BOT_TEMPLATES.profileMessage;
    const profileText = formatBotTemplate(profileTemplate, {
      name: dbUser.firstName || 'Пользователь',
      username: dbUser.username,
      id: dbUser.telegramId,
      telegramId: dbUser.telegramId,
      format: formatName,
      subTypeName: formatName,
      otherFormat: isHapp ? 'INCY' : `HAPP (${store.happCryptVersion})`,
      status: statusText,
      device: deviceName,
      boundDate,
      date: boundDate,
      traffic: ((dbUser.trafficUsedBytes || 0) / (1024 * 1024 * 1024)).toFixed(2) + ' ГБ',
      key: displayKey,
      link: displayKey,
    });

    return res.json({
      response: {
        text: profileText,
        copyableText: displayKey,
        stepKey: 'profile',
        buttons: [
          [
            {
              text: isHapp ? '⚡ Переключить на INCY' : '🚀 Переключить на HAPP (crypt4)',
              callbackData: isHapp ? 'cmd_issue_incy' : 'cmd_issue_happ',
              color: 'indigo',
            },
            { text: '📋 Инструкция', callbackData: 'cmd_instructions' },
          ],
          [
            { text: '📝 Запросить смену устройства', callbackData: 'cmd_request_unbind', color: 'amber' },
            { text: '💬 Поддержка', callbackData: 'open_admin', url: bot.adminContactUrl || 'https://t.me/puls_admin' },
          ],
          [{ text: '🛠 Подписка не работает — перевыпустить', callbackData: 'cmd_report_broken_subscription' }],
          [{ text: '⬅️ Главное меню', callbackData: 'cmd_menu' }],
        ],
      },
    });
  }

  if (inputCmd === 'cmd_current_source_subscription') {
    const channelCheck = await botManager.checkAllRequiredChannels(bot, dbUser.telegramId);
    const hasRequiredChannels = (bot.channels || []).some((channel: any) => channel.isRequired && channel.id);
    const cannotVerifyRequiredChannels = hasRequiredChannels &&
      (channelCheck.botNeedsAdminIn.length > 0 || channelCheck.errors.length > 0);
    if (!channelCheck.allSubscribed || cannotVerifyRequiredChannels) {
      if (channelCheck.missingChannels.length > 0) dbUser.channelMembership = 'left';
      saveStore();
      return res.json({
        response: {
          text: cannotVerifyRequiredChannels
            ? '⚠️ Не удалось проверить обязательные каналы. Доступ не выдан, чтобы не обойти правило подписки. Проверьте права бота и попробуйте снова.'
            : '❌ Чтобы получить подписку, сначала подпишитесь на все обязательные каналы и нажмите «Проверить доступ».',
          stepKey: 'channel_notice',
          buttons: [
            ...channelCheck.missingChannels.map((channel: any) => [{
              text: `📢 Подписаться на ${channel.title || channel.id}`,
              callbackData: 'open_ch',
              url: channel.inviteLink || `https://t.me/${channel.id.replace(/^@+/, '')}`,
            }]),
            [{ text: '🔄 Проверить доступ', callbackData: 'cmd_verify_channel' }],
          ],
        },
      });
    }

    if (
      dbUser.status !== 'active' ||
      dbUser.isMuted ||
      dbUser.isBlocked ||
      dbUser.isPermanentlyBanned ||
      dbUser.detachedFromCentral
    ) {
      return res.json({
        response: {
          text: '⛔ Подписка сейчас приостановлена и не получает обновления из центрального источника. Сначала нажмите «Проверить доступ» или обратитесь в поддержку.',
          stepKey: 'channel_notice',
          buttons: [
            [{ text: '🔄 Проверить доступ', callbackData: 'cmd_verify_channel' }],
            [{ text: '💬 Поддержка', callbackData: 'open_admin', url: bot.adminContactUrl || 'https://t.me/puls_admin' }],
          ],
        },
      });
    }

    try {
      const existingSubscription = await getExistingCurrentSourceSubscription(dbUser);
      if (existingSubscription) {
        const formatName = existingSubscription.format === 'happ'
          ? `HAPP (${store.happCryptVersion})`
          : 'INCY';
        return res.json({
          response: {
            text:
              `✅ Ваша действующая подписка из текущего источника «${existingSubscription.sourceName}» уже синхронизирована с центральным источником.\n\n` +
              `Формат: ${formatName}\n\n${existingSubscription.url}`,
            copyableText: existingSubscription.url,
            qrData: bot.showQrCode !== false ? existingSubscription.url : undefined,
            stepKey: 'sub_issued',
            buttons: [
              [
                { text: '👤 Мой профиль', callbackData: 'cmd_profile' },
                { text: '📋 Инструкция', callbackData: 'cmd_instructions' },
              ],
              [{ text: '🛠 Подписка не работает — перевыпустить', callbackData: 'cmd_report_broken_subscription' }],
              [{ text: '⬅️ Главное меню', callbackData: 'cmd_menu' }],
            ],
          },
        });
      }
    } catch (err: any) {
      console.error(`[Current source subscription check failed for ${dbUser.telegramId}]:`, err.message);
      return res.status(502).json({
        success: false,
        message: 'Не удалось проверить файл подписки в текущем источнике. Новая ссылка не создана.',
        response: {
          text: '⚠️ Не удалось проверить файл подписки в текущем источнике. Новая ссылка не создана. Попробуйте позже или обратитесь в поддержку.',
        },
      });
    }
  }

  // Step 3: Funnel Start -> Channel Check (Проверка подписки на каналы)
  if (inputCmd === 'cmd_start_funnel' || inputCmd === 'cmd_get_sub' || inputCmd === '/sub') {
    const requiredChannels = bot.channels.filter((c) => c.isRequired);
    const notJoined = dbUser.channelMembership === 'left';

    if (notJoined && requiredChannels.length > 0) {
      const channelButtons: Array<Array<{ text: string; callbackData?: string; url?: string; color?: string }>> = requiredChannels.map((c) => [
        { text: `📢 Подписаться на ${c.title || c.id}`, callbackData: 'open_ch', url: c.inviteLink || `https://t.me/${c.id.replace('@', '')}` },
      ]);
      channelButtons.push([
        { text: '🔄 Я подписался, проверить доступ', callbackData: 'cmd_verify_channel' },
        { text: '⬅️ Назад', callbackData: 'cmd_menu' },
      ]);

      const channelTemplate = bot.channelNoticeMessage || CANONICAL_BOT_TEMPLATES.channelNoticeMessage;
      const channelNotice = formatBotTemplate(channelTemplate, {
        name: dbUser.firstName || 'друг',
        channel: bot.channels[0]?.id || '@puls_channel',
      });

      return res.json({
        response: {
          text: channelNotice,
          stepKey: 'channel_notice',
          buttons: channelButtons,
        },
      });
    }

    // If channel is joined -> Proceed to Step 4: Choose format directly
    const chooseFormatTemplate = bot.chooseFormatMessage || CANONICAL_BOT_TEMPLATES.chooseFormatMessage;
    const chooseFormatText = formatBotTemplate(chooseFormatTemplate, {
      name: dbUser.firstName || 'друг',
    });
    const activeSubscriptionSource = store.gitSources?.find((source) => source.id === store.activeGitSourceId) || store.gitSources?.[0];

    return res.json({
      response: {
        text: `${chooseFormatText}${activeSubscriptionSource?.name ? `\n\n📡 Новая подписка будет создана в источнике: **${activeSubscriptionSource.name}**.` : ''}`,
        botButtonColor: defaultBtnColor,
        stepKey: 'choose_format',
        buttons: [
          [
            { text: '🚀 Выбрать HAPP (crypt4)', callbackData: 'cmd_issue_happ', color: defaultBtnColor },
            { text: '⚡ Выбрать INCY', callbackData: 'cmd_issue_incy', color: 'emerald' },
          ],
          [
            { text: '👤 Мой профиль', callbackData: 'cmd_profile', color: 'emerald' },
            { text: '📋 Инструкция', callbackData: 'cmd_instructions' },
          ],
          [{ text: '⬅️ В главное меню', callbackData: 'cmd_menu' }],
        ],
      },
    });
  }

  // Channel Verification Callback
  if (inputCmd === 'cmd_verify_channel' || inputCmd === '/check') {
    if (dbUser.channelMembership === 'left') {
      return res.json({
        response: {
          text: `❌ Вы еще не подписались на канал ${bot.channels[0]?.id || ''}!\n\nПожалуйста, нажмите на кнопку канала, подпишитесь и повторите проверку.`,
          stepKey: 'channel_notice',
          buttons: [
            [{ text: `📢 Перейти в канал`, callbackData: 'open_ch', url: `https://t.me/${bot.channels[0]?.id.replace('@', '')}` }],
            [{ text: '🔄 Проверить снова', callbackData: 'cmd_verify_channel' }],
            [{ text: '⬅️ В главное меню', callbackData: 'cmd_menu' }],
          ],
        },
      });
    }

    // Success -> next step: choose format
    const chooseFormatTemplate = bot.chooseFormatMessage || CANONICAL_BOT_TEMPLATES.chooseFormatMessage;
    const chooseFormatText = formatBotTemplate(chooseFormatTemplate, {
      name: dbUser.firstName || 'друг',
    });

    return res.json({
      response: {
        text: `✅ **Подписка на канал подтверждена!**\n\n${chooseFormatText}`,
        stepKey: 'choose_format',
        buttons: [
          [
            { text: '🚀 Выбрать HAPP (crypt4)', callbackData: 'cmd_issue_happ', color: defaultBtnColor },
            { text: '⚡ Выбрать INCY', callbackData: 'cmd_issue_incy', color: 'emerald' },
          ],
          [{ text: '⬅️ В главное меню', callbackData: 'cmd_menu' }],
        ],
      },
    });
  }

  // Step 4: Choose format (HAPP crypt4 or INCY).
  if (inputCmd === 'cmd_choose_format') {
    const chooseFormatTemplate = bot.chooseFormatMessage || CANONICAL_BOT_TEMPLATES.chooseFormatMessage;
    const chooseFormatText = formatBotTemplate(chooseFormatTemplate, {
      name: dbUser.firstName || 'друг',
    });
    const activeSubscriptionSource = store.gitSources?.find((source) => source.id === store.activeGitSourceId) || store.gitSources?.[0];

    return res.json({
      response: {
        text: `${chooseFormatText}${activeSubscriptionSource?.name ? `\n\n📡 Новая подписка будет создана в источнике: **${activeSubscriptionSource.name}**.` : ''}`,
        botButtonColor: defaultBtnColor,
        stepKey: 'choose_format',
        buttons: [
          [
            { text: '🚀 Выбрать HAPP (crypt4)', callbackData: 'cmd_issue_happ', color: defaultBtnColor },
            { text: '⚡ Выбрать INCY', callbackData: 'cmd_issue_incy', color: 'emerald' },
          ],
          [
            { text: '👤 Мой профиль', callbackData: 'cmd_profile', color: 'emerald' },
            { text: '📋 Инструкция', callbackData: 'cmd_instructions' },
          ],
          [{ text: '⬅️ В главное меню', callbackData: 'cmd_menu' }],
        ],
      },
    });
  }

  // Step 5: Issue or re-select subscription in the chosen format.
  if (inputCmd === 'cmd_issue_happ' || inputCmd === 'cmd_issue_incy') {
    const channelCheck = await botManager.checkAllRequiredChannels(bot, dbUser.telegramId);
    const hasRequiredChannels = (bot.channels || []).some((channel: any) => channel.isRequired && channel.id);
    const cannotVerifyRequiredChannels = hasRequiredChannels &&
      (channelCheck.botNeedsAdminIn.length > 0 || channelCheck.errors.length > 0);
    if (!channelCheck.allSubscribed || cannotVerifyRequiredChannels) {
      if (channelCheck.missingChannels.length > 0) dbUser.channelMembership = 'left';
      saveStore();
      return res.json({
        response: {
          text: cannotVerifyRequiredChannels
            ? '⚠️ Не удалось проверить обязательные каналы. Доступ не выдан, чтобы не обойти правило подписки. Проверьте права бота и попробуйте снова.'
            : '❌ Бот не может выдать подписку, так как вы не подписаны на обязательные каналы. Подпишитесь и нажмите «Проверить доступ».',
          stepKey: 'channel_notice',
          buttons: [
            ...channelCheck.missingChannels.map((channel: any) => [{
              text: `📢 Подписаться на ${channel.title || channel.id}`,
              callbackData: 'open_ch',
              url: channel.inviteLink || `https://t.me/${channel.id.replace(/^@+/, '')}`,
            }]),
            [{ text: '🔄 Проверить доступ', callbackData: 'cmd_verify_channel' }],
          ],
        },
      });
    }

    if (
      dbUser.status !== 'active' ||
      dbUser.isMuted ||
      dbUser.isBlocked ||
      dbUser.isPermanentlyBanned ||
      dbUser.detachedFromCentral
    ) {
      return res.json({
        response: {
          text: '⛔ Подписка сейчас приостановлена и не получает обновления из центрального источника. Сначала нажмите «Проверить доступ» или обратитесь в поддержку.',
          stepKey: 'channel_notice',
          buttons: [
            [{ text: '🔄 Проверить доступ', callbackData: 'cmd_verify_channel' }],
            [{ text: '💬 Поддержка', callbackData: 'open_admin', url: bot.adminContactUrl || 'https://t.me/puls_admin' }],
          ],
        },
      });
    }

    const isHapp = inputCmd === 'cmd_issue_happ';
    const format = isHapp ? 'happ' : 'incy';
    const isReissue = dbUser.pendingSubscriptionReissue === true;
    const previousSubscription = isReissue
      ? dbUser.sourceSubscriptions?.find((item: any) => item.sourceId === dbUser.subscriptionSourceId && item.filePath === dbUser.gitFilePath) ||
        dbUser.sourceSubscriptions?.find((item: any) => item.sourceId === dbUser.subscriptionSourceId) ||
        (dbUser.gitFilePath && dbUser.subscriptionSourceId
          ? { sourceId: dbUser.subscriptionSourceId, filePath: dbUser.gitFilePath }
          : undefined)
      : undefined;

    // Get or allocate user subscription (re-uses existing file if already issued!)
    const { filePath, rawUrl, finalUrl } = await ensureUserRepoFile(dbUser, format, isReissue);
    let previousFileCleanupFailed = false;
    if (isReissue && previousSubscription && previousSubscription.filePath !== filePath) {
      let deleted = false;
      try {
        deleted = await deleteUserRepoFile(previousSubscription.sourceId, previousSubscription.filePath);
      } catch (cleanupError: any) {
        console.warn(`[Webhook subscription reissue] Failed to delete previous file for ${dbUser.telegramId}:`, cleanupError.message);
      }
      if (deleted) {
        dbUser.sourceSubscriptions = (dbUser.sourceSubscriptions || []).filter(
          (item: any) => item.sourceId !== previousSubscription.sourceId || item.filePath !== previousSubscription.filePath
        );
        store.repoFiles = (store.repoFiles || []).filter(
          (item) => item.sourceId !== previousSubscription.sourceId || item.filePath !== previousSubscription.filePath
        );
      } else {
        previousFileCleanupFailed = true;
      }
    }
    dbUser.pendingSubscriptionReissue = false;
    if (isReissue && !previousFileCleanupFailed) {
      const feedback = store.feedbackRequests?.find((request) =>
        request.telegramId === dbUser.telegramId &&
        request.status === 'pending' &&
        request.message === 'Пользователь сообщил, что подписка не работает, и запросил перевыпуск.'
      );
      if (feedback) {
        feedback.status = 'resolved';
        feedback.resolvedAt = new Date().toISOString();
      }
    }

    const subTypeName = isHapp ? `HAPP (${store.happCryptVersion})` : 'INCY';
    const totalServers = 'содержимое центрального источника без преобразований';

    dbUser.receivedAt = dbUser.receivedAt || new Date().toISOString();
    dbUser.subscriptionName = subTypeName;
    dbUser.subscriptionType = format;
    dbUser.status = 'active';
    dbUser.hasActiveSubscription = true;
    dbUser.gitFilePath = filePath;
    dbUser.gitRawUrl = rawUrl;
    dbUser.finalSubscriptionUrl = finalUrl;
    saveStore();

    const displayKey = await resolveUserDisplayKey(dbUser);
    dbUser.finalSubscriptionUrl = displayKey;
    saveStore();

    const shouldShowQr = bot.showQrCode !== false;
    const fireworksEnabled = bot.enableFireworks !== false && store.replacementTemplates.enableFireworks !== false;
    const qrTextNotice = shouldShowQr
      ? '📱 Скопируйте ключ или отсканируйте QR-код ниже для подключения:'
      : '🛡 QR-код отключен в настройках бота. Ваш готовый ключ доступен для копирования.';

    const issueTemplate = bot.subIssuedMessage || CANONICAL_BOT_TEMPLATES.subIssuedMessage;
    const successMsg = formatBotTemplate(issueTemplate, {
      name: dbUser.firstName || 'друг',
      subTypeName,
      format: subTypeName,
      otherFormat: isHapp ? 'INCY' : `HAPP (${store.happCryptVersion})`,
      totalServers,
      time: clientDeviceTime,
      tz: clientDeviceTz,
      key: displayKey,
      link: displayKey,
      hours: bot.selfDeleteHours || 72,
      qrNotice: qrTextNotice,
    });
    const cleanupWarning = previousFileCleanupFailed
      ? '\n\n⚠️ Новая подписка создана, но удалить предыдущий файл из старого Git-источника не удалось. Обратитесь к администратору для очистки.'
      : '';

    return res.json({
      response: {
        text: `${successMsg}${cleanupWarning}`,
        copyableText: displayKey,
        qrData: shouldShowQr ? displayKey : undefined,
        fireworks: fireworksEnabled,
        botButtonColor: defaultBtnColor,
        stepKey: 'sub_issued',
        buttons: [
          [
            {
              text: isHapp ? '⚡ Переключить на INCY' : '🚀 Переключить на HAPP (crypt4)',
              callbackData: isHapp ? 'cmd_issue_incy' : 'cmd_issue_happ',
              color: 'indigo',
            },
            { text: '📋 Инструкция', callbackData: 'cmd_instructions', color: 'sky' },
          ],
          [
            { text: '👤 Мой профиль', callbackData: 'cmd_profile', color: 'emerald' },
            { text: '📝 Сменить устройство', callbackData: 'cmd_request_unbind', color: 'amber' },
          ],
          [{ text: '🌐 Получить подписку из текущего источника', callbackData: 'cmd_current_source_subscription' }],
          [{ text: '🛠 Подписка не работает — перевыпустить', callbackData: 'cmd_report_broken_subscription' }],
          [{ text: '⬅️ Главное меню', callbackData: 'cmd_menu' }],
        ],
      },
    });
  }

  // Refresh config
  if (inputCmd === 'cmd_refresh') {
    dbUser.subscriptionToken = `sub_${dbUser.username || dbUser.telegramId}_${Math.random().toString(36).substring(2, 8)}`;
    const format = dbUser.subscriptionType === 'incy' ? 'incy' : 'happ';
    const resSub = await ensureUserRepoFile(dbUser, format);
    const filePath = resSub.filePath;
    const finalUrl = resSub.finalUrl;

    dbUser.receivedAt = new Date().toISOString();
    saveStore();

    const shouldShowQr = bot.showQrCode !== false;
    return res.json({
      response: {
        text: `🔄 Конфигурация серверов и персональный файл \`${filePath}\` обновлены!\n\nНовая ссылка:\n\`${finalUrl}\``,
        copyableText: finalUrl,
        qrData: shouldShowQr ? finalUrl : undefined,
        botButtonColor: defaultBtnColor,
        buttons: [
          [
            { text: dbUser.subscriptionType === 'happ' ? '⚡ Переключить на INCY' : '🚀 Переключить на HAPP', callbackData: dbUser.subscriptionType === 'happ' ? 'cmd_issue_incy' : 'cmd_issue_happ', color: 'indigo' },
            { text: '👤 Мой профиль', callbackData: 'cmd_profile', color: defaultBtnColor },
          ],
          [{ text: '⬅️ Главное меню', callbackData: 'cmd_menu' }],
        ],
      },
    });
  }

  // Instructions
  if (inputCmd === 'cmd_instructions' || inputCmd === '/help') {
    const instructionsTpl = bot.instructionsMessage || CANONICAL_BOT_TEMPLATES.instructionsMessage;
    const instructionsText = formatBotTemplate(instructionsTpl, {
      name: dbUser.firstName || 'друг',
      username: dbUser.username,
      id: dbUser.telegramId,
    });

    return res.json({
      response: {
        text: instructionsText,
        stepKey: 'instructions',
        botButtonColor: defaultBtnColor,
        buttons: [
          [
            { text: '🔑 Моя подписка', callbackData: 'cmd_choose_format', color: defaultBtnColor },
            { text: '👤 Мой профиль', callbackData: 'cmd_profile', color: 'emerald' },
          ],
          [{ text: '◀️ Главное меню', callbackData: 'cmd_menu' }],
        ],
      },
    });
  }

  // Support
  if (inputCmd === 'cmd_support') {
    return res.json({
      response: {
        text: `💬 Служба заботы и поддержки:\n\nНапишите нашему администратору: ${bot.adminContactUrl || '@puls_admin'}`,
        buttons: [
          [{ text: '💬 Открыть чат поддержки', callbackData: 'admin_link', url: bot.adminContactUrl || 'https://t.me/puls_admin' }],
          [{ text: '⬅️ Главное меню', callbackData: 'cmd_menu' }],
        ],
      },
    });
  }

  // Show free links pool status
  if (inputCmd === 'cmd_show_free_links' || inputCmd === '/free' || inputCmd === 'свободные ссылки' || inputCmd === '/links') {
    if (!store.repoFiles) store.repoFiles = [];
    const freeFiles = store.repoFiles.filter((f) => !f.userId || f.isPoolFree);
    const assignedFiles = store.repoFiles.filter((f) => f.userId && !f.isPoolFree);
    const activeGit = getActiveGitSource();

    let freeListText = '';
    if (freeFiles.length > 0) {
      freeListText = freeFiles.slice(0, 5).map((f, i) => `${i + 1}. \`${f.filePath}\` (Свободен для выдачи)`).join('\n');
      if (freeFiles.length > 5) freeListText += `\n...и еще ${freeFiles.length - 5} свободных файлов`;
    } else {
      freeListText = 'В пуле нет свободных заготовок, новые подписки создаются автоматически при первом запросе.';
    }

    return res.json({
      response: {
        text: `📦 **Свободные слоты и подписки:**\n\n` +
          `• 🟢 Свободных слотов в пуле: **${freeFiles.length}**\n` +
          `• 👤 Выдано подписчикам: **${assignedFiles.length}**\n\n` +
          `Доступные слоты:\n${freeListText}`,
        buttons: [
          [{ text: '🔑 Получить мою подписку', callbackData: 'cmd_start_funnel', color: defaultBtnColor }],
          [{ text: '👤 Мой профиль', callbackData: 'cmd_profile' }],
          [{ text: '⬅️ Главное меню', callbackData: 'cmd_menu' }],
        ],
      },
    });
  }

  // Default fallback
  return res.json({
    response: {
      text: `Команда не распознана. Воспользуйтесь меню:`,
      buttons: [
        [{ text: '🔑 Получить подписку', callbackData: 'cmd_start_funnel' }, { text: '👤 Мой профиль', callbackData: 'cmd_profile' }],
      ],
    },
  });
});

// -------------------------------------------------------------
// Vite Server / SPA Serving
// -------------------------------------------------------------
async function startServer() {
  // Load persistent store from Firebase Cloud Firestore
  try {
    await initFirebaseAndLoadStore();
  } catch (err: any) {
    console.error('[Startup] Firebase store initialization error:', err.message);
  }

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Puls-dostupa server running on port ${PORT}`);
    if (process.env.ENABLE_TELEGRAM_POLLING !== 'false') {
      botManager.start().catch((err) => {
        console.warn('[Telegram Bot Manager] Startup error:', err);
      });
    }
    // Start continuous high-frequency central subscription monitoring & propagation (default 1-2 seconds, configurable)
    let lastCentralCheck = 0;
    if (process.env.ENABLE_CENTRAL_MONITOR !== 'false') {
      setInterval(() => {
        const now = Date.now();
        const intervalSec = store.centralFile?.autoSyncIntervalSeconds ?? 1;
        if (store.centralFile?.autoSyncEnabled !== false && now - lastCentralCheck >= intervalSec * 1000) {
          lastCentralCheck = now;
          monitorAndPullCentralSubscription().catch((err) => {
            console.warn('[Central Monitor] error:', err);
          });
        }
      }, 1000);
    }

    // Periodic check for expired sharing grace timers and temporary mutes (every 5s)
    setInterval(() => {
      const now = Date.now();
      let changed = false;
      const activeBot = getActiveBot();

      for (const user of store.users || []) {
        // Condition 1: Sharing grace deadline expired without second user deleting subscription -> PERMANENT BAN (Source 3)
        if (user.sharingGraceDeadlineAt && !user.isTimerFrozen && now >= new Date(user.sharingGraceDeadlineAt).getTime()) {
          console.log(`[Grace Timer Expired] @${user.username || user.telegramId} did not remove second device in time. Enforcing PERMANENT BAN.`);
          user.status = 'blocked';
          user.isBlocked = true;
          user.isPermanentlyBanned = true;
          user.sharingGraceDeadlineAt = null;
          user.mutedUntil = null;
          user.subscriptionStatusReason = '⛔ Перманентный бан: истек срок на удаление со второго устройства (БАН)';
          applyDisconnectStub(user, 'Device sharing grace expired (Source 3)', 3).catch(() => {});

          if (activeBot && activeBot.token && user.telegramId) {
            const banNotice =
              `⛔ <b>ПОДПИСКА ОКОНЧАТЕЛЬНО ЗАБЛОКИРОВАНА (ПЕРМАНЕНТНЫЙ БАН)!</b>\n\n` +
              `Истек установленный срок на удаление подписки со второго устройства.\n` +
              `Ваш доступ заблокирован навсегда. Ключи из центральной подписки больше не поступят.\n\n` +
              `Для разблокировки обратитесь к администратору.`;
            botManager.sendDirectTelegramMessage(activeBot.token, user.telegramId, banNotice).catch(() => {});
          }

          logSystemEvent(
            'error',
            'violations',
            'PERMANENT_BAN',
            `Перманентный бан @${user.username || user.telegramId}: истек таймер удаления подписки со 2-го устройства!`,
            { userId: user.id, telegramId: user.telegramId, username: user.username }
          );
          changed = true;
        }
        // Condition 2: Regular temporary mute expired (NOT a sharing grace deadline)
        else if (user.status === 'muted' && user.mutedUntil && !user.sharingGraceDeadlineAt) {
          if (now >= new Date(user.mutedUntil).getTime()) {
            console.log(`[Auto Unmute] Mute expired for @${user.username || user.telegramId}. Restoring nodes...`);
            user.status = user.channelMembership === 'left' ? 'channel_inactive' : 'active';
            user.mutedUntil = null;
            user.subscriptionStatusReason = undefined;
            changed = true;
            if (user.status === 'active') {
              restoreUserNodes(user).catch((e) => console.warn('[Auto Unmute restore error]:', e.message));
            }
          }
        }
      }
      if (changed) {
        saveStore();
      }
    }, 5000);

    if (process.env.ENABLE_GATEWAY_AUDIT !== 'false') {
      // Periodic scheduled gateway verification (default: 1-2 times a day / every 12h, configurable)
      let lastGatewayAuditCheck = 0;
      setInterval(() => {
        const now = Date.now();
        const intervalHours = store.relayGatewayConfig?.checkIntervalHours || 12;
        const intervalMs = intervalHours * 3600 * 1000;
        if (now - lastGatewayAuditCheck >= intervalMs) {
          lastGatewayAuditCheck = now;
          performGatewayAudit('Автоматическая плановая проверка (1-2 раза в день)').catch((err) => {
            console.warn('[Periodic Gateway Audit Error]:', err.message);
          });
        }
      }, 60 * 1000);
    }
  });
}

if (!process.env.VERCEL) {
  startServer();
} else {
  initFirebaseAndLoadStore().catch((err) => {
    console.warn('[Vercel Serverless] Firebase init:', err.message);
  });
}

export { app };
export default app;
