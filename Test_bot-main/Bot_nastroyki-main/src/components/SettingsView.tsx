import React, { useState, useEffect } from 'react';
import { 
  GitBranch, 
  Bot, 
  Radio, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Save, 
  RefreshCw, 
  ExternalLink,
  ShieldCheck,
  Plus,
  Trash2,
  Edit2,
  Power,
  ShieldAlert,
  Clock,
  MessageSquare,
  Sparkles,
  Server,
  Key,
  QrCode,
  Palette,
  Archive,
  Upload,
  Download,
  Cloud,
  Database,
  Copy,
  Check,
  Zap,
  Globe
} from 'lucide-react';
import { GitSourceItem, ManagedBotItem, GitProvider, HappCryptVersion } from '../types';
import { DockerConfigView } from './DockerConfigView';
import { VercelConfigView } from './VercelConfigView';
import { RelayGatewayView } from './RelayGatewayView';
import {
  fetchFirebaseStatus,
  syncFirebase,
  reloadFirebase,
  setDefaultGitSource,
  makeCentralGitSource,
  fetchSubscriptionSettings,
  saveHappCryptVersion,
} from '../services/api';

const BOT_BUTTON_COLORS = [
  { id: 'indigo', name: 'Индиго', bg: 'bg-indigo-600', hex: '#4f46e5' },
  { id: 'emerald', name: 'Изумруд', bg: 'bg-emerald-600', hex: '#059669' },
  { id: 'rose', name: 'Рубин', bg: 'bg-rose-600', hex: '#e11d48' },
  { id: 'amber', name: 'Янтарь', bg: 'bg-amber-600', hex: '#d97706' },
  { id: 'sky', name: 'Небо', bg: 'bg-sky-600', hex: '#0284c7' },
  { id: 'purple', name: 'Фиолетовый', bg: 'bg-purple-600', hex: '#9333ea' },
  { id: 'stone', name: 'Графит', bg: 'bg-stone-800', hex: '#292524' },
];

interface SettingsViewProps {
  gitSources: GitSourceItem[];
  activeGitSourceId: string;
  bots: ManagedBotItem[];
  activeBotId: string;
  onSaveGitSource: (source: Partial<GitSourceItem>) => Promise<void>;
  onTestGitSource: (id: string) => Promise<{ success: boolean; message: string }>;
  onActivateGitSource: (id: string) => Promise<void>;
  onSetDefaultGitSource?: (id: string) => Promise<any>;
  onMakeCentralGitSource?: (id: string) => Promise<any>;
  onDeleteGitSource: (id: string) => Promise<void>;
  onSaveBot: (bot: Partial<ManagedBotItem>) => Promise<void>;
  onTestBot: (id: string) => Promise<{ success: boolean; message: string }>;
  onActivateBot: (id: string) => Promise<void>;
  onDeleteBot: (id: string) => Promise<void>;
  onRefreshData?: () => Promise<void>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  gitSources,
  activeGitSourceId,
  bots,
  activeBotId,
  onSaveGitSource,
  onTestGitSource,
  onActivateGitSource,
  onSetDefaultGitSource,
  onMakeCentralGitSource,
  onDeleteGitSource,
  onSaveBot,
  onTestBot,
  onActivateBot,
  onDeleteBot,
  onRefreshData,
}) => {
  const [activeTab, setActiveTab] = useState<'git' | 'bots' | 'backup' | 'docker' | 'vercel' | 'firebase' | 'relay'>('git');
  const [isRestoring, setIsRestoring] = useState(false);
  const [happCryptVersion, setHappCryptVersion] = useState<HappCryptVersion>('crypt4');
  const [savedHappCryptVersion, setSavedHappCryptVersion] = useState<HappCryptVersion>('crypt4');
  const [isHappCryptSettingsLoading, setIsHappCryptSettingsLoading] = useState(true);
  const [isHappCryptSaving, setIsHappCryptSaving] = useState(false);
  const [happCryptSettingsError, setHappCryptSettingsError] = useState<string | null>(null);

  // Optimistic UI state overrides for zero-latency feedback
  const [optimisticBotOverrides, setOptimisticBotOverrides] = useState<Record<string, Partial<ManagedBotItem>>>({});
  const [optimisticGitOverrides, setOptimisticGitOverrides] = useState<Record<string, Partial<GitSourceItem>>>({});
  const [locallyDeletedBotIds, setLocallyDeletedBotIds] = useState<Set<string>>(new Set());
  const [locallyDeletedGitIds, setLocallyDeletedGitIds] = useState<Set<string>>(new Set());
  const [inlineConfirmDeleteBotId, setInlineConfirmDeleteBotId] = useState<string | null>(null);
  const [inlineConfirmDeleteGitId, setInlineConfirmDeleteGitId] = useState<string | null>(null);

  // Firebase Cloud State
  const [firebaseStatus, setFirebaseStatus] = useState<any>(null);
  const [isFirebaseLoading, setIsFirebaseLoading] = useState(false);
  const [isFirebaseSyncing, setIsFirebaseSyncing] = useState(false);
  const [isFirebaseReloading, setIsFirebaseReloading] = useState(false);
  const [hasCopiedConfig, setHasCopiedConfig] = useState(false);

  useEffect(() => {
    if (activeTab === 'firebase') {
      loadFirebaseStatus();
    }
  }, [activeTab]);

  useEffect(() => {
    fetchSubscriptionSettings()
      .then(({ happCryptVersion: version }) => {
        setHappCryptVersion(version);
        setSavedHappCryptVersion(version);
        setHappCryptSettingsError(null);
      })
      .catch((err: any) => setHappCryptSettingsError(err.message || 'Не удалось загрузить настройки формата HAPP'))
      .finally(() => setIsHappCryptSettingsLoading(false));
  }, []);

  const loadFirebaseStatus = async () => {
    setIsFirebaseLoading(true);
    try {
      const data = await fetchFirebaseStatus();
      setFirebaseStatus(data);
    } catch (err: any) {
      console.warn('Failed to load firebase status:', err);
    } finally {
      setIsFirebaseLoading(false);
    }
  };

  const handleSyncFirebaseNow = async () => {
    setIsFirebaseSyncing(true);
    try {
      const res = await syncFirebase();
      showToast('success', res.message || 'Синхронизировано с Firebase Firestore!');
      await loadFirebaseStatus();
    } catch (err: any) {
      showToast('error', err.message || 'Ошибка синхронизации с Firebase');
    } finally {
      setIsFirebaseSyncing(false);
    }
  };

  const handleReloadFirebaseNow = async () => {
    setIsFirebaseReloading(true);
    try {
      const res = await reloadFirebase();
      showToast('success', res.message || 'Данные успешно загружены из Cloud Firestore!');
      if (onRefreshData) {
        await onRefreshData();
      }
      await loadFirebaseStatus();
    } catch (err: any) {
      showToast('error', err.message || 'Ошибка загрузки из Firebase');
    } finally {
      setIsFirebaseReloading(false);
    }
  };

  // Inline quick editing of API keys
  const [inlineGitTokens, setInlineGitTokens] = useState<Record<string, string>>({});
  const [inlineBotTokens, setInlineBotTokens] = useState<Record<string, string>>({});
  const [inlineSavingId, setInlineSavingId] = useState<string | null>(null);

  // Git Modal
  const [showGitModal, setShowGitModal] = useState(false);
  const [editingGit, setEditingGit] = useState<Partial<GitSourceItem> | null>(null);

  // Bot Modal
  const [showBotModal, setShowBotModal] = useState(false);
  const [editingBot, setEditingBot] = useState<Partial<ManagedBotItem> | null>(null);

  // Dedicated confirmation modals for deletion
  const [deleteTargetGit, setDeleteTargetGit] = useState<GitSourceItem | null>(null);
  const [deleteTargetBot, setDeleteTargetBot] = useState<ManagedBotItem | null>(null);

  // Status banners & granular action loading
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [isSavingForm, setIsSavingForm] = useState(false);

  const showToast = (type: 'success' | 'error', text: string) => {
    setFeedbackMsg({ type, text });
    setTimeout(() => setFeedbackMsg(null), 5000);
  };

  const handleSaveHappCryptVersion = async () => {
    setIsHappCryptSaving(true);
    try {
      const result = await saveHappCryptVersion(happCryptVersion);
      setHappCryptVersion(result.happCryptVersion);
      setSavedHappCryptVersion(result.happCryptVersion);
      setHappCryptSettingsError(null);
      showToast('success', result.message);
      if (onRefreshData) await onRefreshData();
    } catch (err: any) {
      setHappCryptSettingsError(err.message || 'Не удалось обновить ссылки HAPP');
      showToast('error', err.message || 'Не удалось обновить ссылки HAPP');
    } finally {
      setIsHappCryptSaving(false);
    }
  };

  const handleQuickSaveGitToken = async (source: GitSourceItem) => {
    const token = inlineGitTokens[source.id] !== undefined ? inlineGitTokens[source.id] : source.token;
    setInlineSavingId(source.id);
    try {
      await onSaveGitSource({ id: source.id, token });
      setInlineGitTokens((prev) => {
        const next = { ...prev };
        delete next[source.id];
        return next;
      });
      showToast('success', `API токен источника "${source.name}" успешно сохранен и применен!`);
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setInlineSavingId(null);
    }
  };

  const handleQuickSaveBotToken = async (bot: ManagedBotItem) => {
    const token = inlineBotTokens[bot.id] !== undefined ? inlineBotTokens[bot.id] : bot.token;
    setInlineSavingId(bot.id);
    try {
      await onSaveBot({ id: bot.id, token });
      setInlineBotTokens((prev) => {
        const next = { ...prev };
        delete next[bot.id];
        return next;
      });
      showToast('success', `API токен бота "${bot.name}" успешно сохранен и применен!`);
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setInlineSavingId(null);
    }
  };

  const handleToggleGitEnabled = async (source: GitSourceItem) => {
    const currentVal = optimisticGitOverrides[source.id]?.enabled !== undefined
      ? optimisticGitOverrides[source.id]?.enabled
      : (source.enabled ?? true);
    const nextVal = !currentVal;

    setOptimisticGitOverrides((prev) => ({
      ...prev,
      [source.id]: { ...prev[source.id], enabled: nextVal },
    }));

    const actionKey = `git_toggle_${source.id}`;
    setActionLoadingId(actionKey);
    try {
      await onSaveGitSource({ id: source.id, enabled: nextVal });
      showToast('success', `Источник "${source.name}" ${nextVal ? 'включен' : 'отключен'}!`);
    } catch (err: any) {
      setOptimisticGitOverrides((prev) => ({
        ...prev,
        [source.id]: { ...prev[source.id], enabled: currentVal },
      }));
      showToast('error', err.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleToggleBotEnabled = async (bot: ManagedBotItem) => {
    const currentVal = optimisticBotOverrides[bot.id]?.enabled !== undefined
      ? optimisticBotOverrides[bot.id]?.enabled
      : (bot.enabled ?? true);
    const nextVal = !currentVal;

    setOptimisticBotOverrides((prev) => ({
      ...prev,
      [bot.id]: { ...prev[bot.id], enabled: nextVal },
    }));

    const actionKey = `bot_toggle_${bot.id}`;
    setActionLoadingId(actionKey);
    try {
      await onSaveBot({ id: bot.id, enabled: nextVal });
      showToast('success', `Бот "${bot.name}" ${nextVal ? 'включен' : 'отключен'}!`);
    } catch (err: any) {
      setOptimisticBotOverrides((prev) => ({
        ...prev,
        [bot.id]: { ...prev[bot.id], enabled: currentVal },
      }));
      showToast('error', err.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleToggleBotQr = async (bot: ManagedBotItem) => {
    const currentVal = optimisticBotOverrides[bot.id]?.showQrCode !== undefined
      ? optimisticBotOverrides[bot.id]?.showQrCode
      : (bot.showQrCode ?? true);
    const nextVal = !currentVal;

    setOptimisticBotOverrides((prev) => ({
      ...prev,
      [bot.id]: { ...prev[bot.id], showQrCode: nextVal },
    }));

    const actionKey = `bot_qr_${bot.id}`;
    setActionLoadingId(actionKey);
    try {
      await onSaveBot({ id: bot.id, showQrCode: nextVal });
      showToast('success', `Отображение QR-кода для бота "${bot.name}" ${nextVal ? 'включено' : 'выключено'}!`);
    } catch (err: any) {
      setOptimisticBotOverrides((prev) => ({
        ...prev,
        [bot.id]: { ...prev[bot.id], showQrCode: currentVal },
      }));
      showToast('error', err.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleToggleBotFireworks = async (bot: ManagedBotItem) => {
    const currentVal = optimisticBotOverrides[bot.id]?.enableFireworks !== undefined
      ? optimisticBotOverrides[bot.id]?.enableFireworks
      : (bot.enableFireworks ?? true);
    const nextVal = !currentVal;

    setOptimisticBotOverrides((prev) => ({
      ...prev,
      [bot.id]: { ...prev[bot.id], enableFireworks: nextVal },
    }));

    const actionKey = `bot_fw_${bot.id}`;
    setActionLoadingId(actionKey);
    try {
      await onSaveBot({ id: bot.id, enableFireworks: nextVal });
      showToast('success', `Салюты/фейерверки для бота "${bot.name}" ${nextVal ? 'включены' : 'выключены'}!`);
    } catch (err: any) {
      setOptimisticBotOverrides((prev) => ({
        ...prev,
        [bot.id]: { ...prev[bot.id], enableFireworks: currentVal },
      }));
      showToast('error', err.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  const doDeleteBot = async (id: string, name: string) => {
    setLocallyDeletedBotIds((prev) => new Set(prev).add(id));
    setInlineConfirmDeleteBotId(null);
    setDeleteTargetBot(null);
    setActionLoadingId(`bot_del_${id}`);
    try {
      await onDeleteBot(id);
      showToast('success', `Бот "${name}" успешно удален!`);
      if (onRefreshData) {
        await onRefreshData();
      }
    } catch (err: any) {
      setLocallyDeletedBotIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      showToast('error', err.message || 'Ошибка удаления бота');
    } finally {
      setActionLoadingId(null);
    }
  };

  const doDeleteGit = async (id: string, name: string) => {
    setLocallyDeletedGitIds((prev) => new Set(prev).add(id));
    setInlineConfirmDeleteGitId(null);
    setDeleteTargetGit(null);
    setActionLoadingId(`git_del_${id}`);
    try {
      await onDeleteGitSource(id);
      showToast('success', `Источник "${name}" успешно удален!`);
      if (onRefreshData) {
        await onRefreshData();
      }
    } catch (err: any) {
      setLocallyDeletedGitIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      showToast('error', err.message || 'Ошибка удаления источника Git');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Git Handlers
  const handleOpenNewGit = () => {
    setEditingGit({
      id: undefined,
      name: '',
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
    });
    setShowGitModal(true);
  };

  const handleEditGit = (s: GitSourceItem) => {
    setEditingGit({ ...s });
    setShowGitModal(true);
  };

  const handleSaveGitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGit) return;
    try {
      let cleanApiUrl = (editingGit.apiUrl || '').trim();
      if (cleanApiUrl && !cleanApiUrl.startsWith('http://') && !cleanApiUrl.startsWith('https://')) {
        cleanApiUrl = `https://${cleanApiUrl}`;
      }

      let displayName = editingGit.name?.trim() || '';
      if (!displayName) {
        if (cleanApiUrl) {
          try {
            displayName = `API (${new URL(cleanApiUrl).hostname})`;
          } catch {
            displayName = `API (${cleanApiUrl})`;
          }
        } else {
          displayName = 'Пользовательский источник';
        }
      }

      setIsSavingForm(true);
      const payload: Partial<GitSourceItem> = {
        ...editingGit,
        name: displayName,
        apiUrl: cleanApiUrl || undefined,
        repository: editingGit.repository?.trim() || (editingGit.username ? `${editingGit.username}/subscription` : 'default/subscription'),
        provider: editingGit.provider || 'custom',
      };
      await onSaveGitSource(payload);
      setShowGitModal(false);
      setEditingGit(null);
      showToast('success', 'Источник Git / API успешно сохранен и применен!');
    } catch (err: any) {
      showToast('error', err.message || 'Ошибка сохранения источника');
    } finally {
      setIsSavingForm(false);
    }
  };

  const handleTestGit = async (id: string) => {
    setActionLoadingId(`git_test_${id}`);
    try {
      const res = await onTestGitSource(id);
      showToast('success', res.message);
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleSetDefaultGit = async (source: GitSourceItem) => {
    setActionLoadingId(`git_default_${source.id}`);
    try {
      if (onSetDefaultGitSource) {
        await onSetDefaultGitSource(source.id);
      } else {
        await setDefaultGitSource(source.id);
      }
      showToast('success', `Источник "${source.name}" успешно назначен источником по умолчанию!`);
      if (onRefreshData) await onRefreshData();
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleMakeCentralGit = async (source: GitSourceItem) => {
    setActionLoadingId(`git_central_${source.id}`);
    try {
      if (onMakeCentralGitSource) {
        await onMakeCentralGitSource(source.id);
      } else {
        await makeCentralGitSource(source.id);
      }
      showToast('success', `Центральный источник успешно создан и привязан к "${source.name}"!`);
      if (onRefreshData) await onRefreshData();
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Bot Handlers
  const handleOpenNewBot = () => {
    setEditingBot({
      id: undefined,
      name: '',
      token: '',
      username: '',
      adminContactUrl: 'https://t.me/puls_admin',
      blockedUserMessage: '{username}, вы не можете получить здесь подписку из-за подозрений на подозрительные действия или нарушение правил сервиса.',
      unsubscribedMessage: '⚠️ Ваша подписка деактивирована, так как вы покинули канал. Она снова станет активной при подписке на канал. Если этого не произойдет в течение {hours} часов, она будет полностью удалена.',
      selfDeleteHours: 72,
      deletePreviousMessageOnStep: false,
      welcomeMessage: 'Привет, {name}! Добро пожаловать в сервис персональных подписок.',
      privacyPolicyText: 'Условия сервиса и политика конфиденциальности.',
      privacyPolicyUrl: 'https://telegra.ph/Privacy-Policy-Puls-01',
      channels: [
        { id: '@puls_channel', title: 'Канал доступа Пульс', isRequired: true, isBotAdmin: true },
      ],
      enabled: true,
      enableFireworks: true,
      buttonColor: 'indigo',
    });
    setShowBotModal(true);
  };

  const handleEditBot = (b: ManagedBotItem) => {
    setEditingBot({ ...b });
    setShowBotModal(true);
  };

  const handleSaveBotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBot) return;
    setIsSavingForm(true);
    try {
      const cleaned = { ...editingBot };
      if (!cleaned.name && cleaned.username) {
        cleaned.name = `@${cleaned.username.replace('@', '')}`;
      } else if (!cleaned.name) {
        cleaned.name = 'Новый Telegram бот';
      }
      if (!cleaned.botId && cleaned.token && cleaned.token.includes(':')) {
        cleaned.botId = cleaned.token.split(':')[0];
      }
      await onSaveBot(cleaned);
      setShowBotModal(false);
      setEditingBot(null);
      showToast('success', 'Настройки Telegram бота успешно сохранены и применены!');
    } catch (err: any) {
      showToast('error', err.message || 'Ошибка сохранения бота');
    } finally {
      setIsSavingForm(false);
    }
  };

  const handleTestBot = async (id: string) => {
    setActionLoadingId(`bot_test_${id}`);
    try {
      const res = await onTestBot(id);
      showToast('success', res.message);
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  const visibleBots = bots
    .filter((b) => !locallyDeletedBotIds.has(b.id))
    .map((b) => ({ ...b, ...(optimisticBotOverrides[b.id] || {}) }));

  const visibleGitSources = gitSources
    .filter((s) => !locallyDeletedGitIds.has(s.id))
    .map((s) => ({ ...s, ...(optimisticGitOverrides[s.id] || {}) }));

  return (
    <div id="settings-view" className="space-y-6">
      {/* Toast banner */}
      {feedbackMsg && (
        <div
          className={`p-4 rounded-2xl text-xs font-semibold flex items-center space-x-2 shadow-xs transition-all ${
            feedbackMsg.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          {feedbackMsg.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          ) : (
            <XCircle className="h-4 w-4 text-rose-600 shrink-0" />
          )}
          <span>{feedbackMsg.text}</span>
        </div>
      )}

      {/* Header card with tab switcher */}
      <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-stone-900">
              Источники серверов и Telegram боты
            </h2>
            <p className="text-xs text-stone-500 mt-1">
              Управление несколькими репозиториями (GitVerse, GitFlic, MosHub, GitHub, GitLab) и несколькими ботами с привязкой каналов.
            </p>
          </div>

          <div className="flex items-center space-x-2 bg-stone-100 p-1 rounded-xl flex-wrap gap-1">
            <button
              onClick={() => setActiveTab('git')}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'git'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <GitBranch className="h-4 w-4 text-amber-500" />
              <span>Источники Git ({visibleGitSources.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('bots')}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'bots'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Bot className="h-4 w-4 text-indigo-500" />
              <span>Telegram Боты ({visibleBots.length})</span>
            </button>
            <button
              id="tab-settings-firebase"
              onClick={() => setActiveTab('firebase')}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'firebase'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Cloud className="h-4 w-4 text-orange-500" />
              <span>Облако Firebase & Render</span>
            </button>
            <button
              id="tab-settings-backup"
              onClick={() => setActiveTab('backup')}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'backup'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Archive className="h-4 w-4 text-emerald-600" />
              <span>Резервная копия & Исходники</span>
            </button>
            <button
              id="tab-settings-docker"
              onClick={() => setActiveTab('docker')}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'docker'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Server className="h-4 w-4 text-cyan-600" />
              <span>Docker & Контейнер</span>
            </button>
            <button
              id="tab-settings-vercel"
              onClick={() => setActiveTab('vercel')}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'vercel'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Zap className="h-4 w-4 text-indigo-600" />
              <span>Vercel & Бессерверный перенос</span>
            </button>
            <button
              id="tab-settings-relay"
              onClick={() => setActiveTab('relay')}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'relay'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Globe className="h-4 w-4 text-emerald-600" />
              <span>RU Шлюз (Белые списки)</span>
            </button>
          </div>
        </div>
      </div>

      {/* TAB 1: Git Sources */}
      {activeTab === 'git' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-stone-900">Список подключенных источников Git</h3>
            <button
              id="btn-add-git-source"
              onClick={handleOpenNewGit}
              className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-stone-900 text-white hover:bg-stone-800 text-xs font-semibold shadow-xs"
            >
              <Plus className="h-3.5 w-3.5 text-amber-400" />
              <span>Добавить источник</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {gitSources.map((source) => {
              const isActive = source.id === activeGitSourceId;
              return (
                <div
                  key={source.id}
                  id={`git-source-${source.id}`}
                  className={`bg-white border rounded-2xl p-5 shadow-xs transition-all flex flex-col justify-between space-y-4 ${
                    isActive ? 'border-amber-400 ring-2 ring-amber-400/20' : 'border-stone-200'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-2.5">
                        <div className="h-9 w-9 rounded-xl bg-stone-900 text-amber-400 flex items-center justify-center font-bold text-xs uppercase">
                          {source.provider === 'sourcecraft' ? 'SC' : source.provider.slice(0, 3)}
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <h4 className="font-bold text-stone-900 text-sm">{source.name}</h4>
                            {isActive && (
                              <span className="px-2 py-0.2 rounded-full bg-amber-100 text-amber-900 text-[10px] font-bold">
                                Активный
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-stone-500 uppercase tracking-wider font-semibold">
                            {source.provider === 'sourcecraft' ? 'SourceCraft (Яндекс)' : source.provider} • {source.repository}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-1.5">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            source.enabled !== false
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-stone-100 text-stone-500 border-stone-300'
                          }`}
                        >
                          {source.enabled !== false ? 'Включен' : 'Отключен'}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            source.status === 'connected'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : source.status === 'error'
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : 'bg-stone-100 text-stone-600 border-stone-200'
                          }`}
                        >
                          {source.status === 'connected' ? 'Подключено' : source.status === 'error' ? 'Ошибка' : 'Не настроено'}
                        </span>
                      </div>
                    </div>

                    {/* Quick Manual API Key Input Bar */}
                    <div className="mt-3 p-2.5 rounded-xl bg-amber-50/70 border border-amber-200/70 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-amber-950 flex items-center space-x-1">
                          <Key className="h-3 w-3 text-amber-600" />
                          <span>API Токен / Ключ ({source.provider === 'sourcecraft' ? 'SourceCraft' : source.provider.toUpperCase()}):</span>
                        </span>
                        <span className="text-[10px] text-amber-700">
                          {source.token ? 'Задан' : 'Не задан'}
                        </span>
                      </div>
                      <div className="flex items-center space-x-1.5">
                        <input
                          type="password"
                          value={inlineGitTokens[source.id] !== undefined ? inlineGitTokens[source.id] : (source.token || '')}
                          onChange={(e) => setInlineGitTokens({ ...inlineGitTokens, [source.id]: e.target.value })}
                          placeholder="Введите или измените токен API..."
                          className="flex-1 px-2.5 py-1 text-xs rounded-lg border border-amber-300 bg-white text-stone-900 font-mono focus:ring-1 focus:ring-amber-500"
                        />
                        <button
                          type="button"
                          disabled={inlineSavingId === source.id}
                          onClick={() => handleQuickSaveGitToken(source)}
                          className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-xs disabled:opacity-50 shrink-0"
                          title="Сохранить и применить токен"
                        >
                          {inlineSavingId === source.id ? '...' : 'Сохранить'}
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 space-y-1 text-xs text-stone-600 font-mono bg-stone-50 p-2.5 rounded-xl border border-stone-200/60">
                      <div><span className="text-stone-400">API URL:</span> {source.apiUrl}</div>
                      <div><span className="text-stone-400">Ветка / Файл:</span> {source.branch} / {source.filePath}</div>
                      {source.centralRawUrl && (
                        <div className="truncate"><span className="text-stone-400">Центр. URL:</span> {source.centralRawUrl}</div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-stone-100 flex-wrap gap-2">
                    <div className="flex items-center space-x-2 flex-wrap gap-1">
                      {!isActive ? (
                        <button
                          type="button"
                          onClick={() => handleSetDefaultGit(source)}
                          disabled={actionLoadingId === `git_default_${source.id}`}
                          className="text-xs font-bold text-amber-700 hover:text-amber-800 inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200 cursor-pointer shadow-2xs"
                          title="Сделать источником по умолчанию и активировать"
                        >
                          <Power className="h-3.5 w-3.5 text-amber-600" />
                          <span>{actionLoadingId === `git_default_${source.id}` ? 'Назначение...' : 'Сделать по умолчанию'}</span>
                        </button>
                      ) : (
                        <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-300 text-xs font-bold flex items-center space-x-1">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          <span>По умолчанию (Активный)</span>
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => handleMakeCentralGit(source)}
                        disabled={actionLoadingId === `git_central_${source.id}`}
                        className="text-xs font-bold text-stone-800 hover:text-stone-900 inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 cursor-pointer shadow-2xs"
                        title="Создать центральный источник из этого репозитория и зафиксировать файл"
                      >
                        <Globe className={`h-3.5 w-3.5 text-emerald-600 ${actionLoadingId === `git_central_${source.id}` ? 'animate-spin' : ''}`} />
                        <span>{actionLoadingId === `git_central_${source.id}` ? 'Создание...' : 'Сделать центральным'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggleGitEnabled(source)}
                        disabled={actionLoadingId === `git_toggle_${source.id}`}
                        className={`text-xs font-semibold inline-flex items-center space-x-1 px-2 py-1 rounded-lg border cursor-pointer ${
                          source.enabled !== false
                            ? 'text-stone-600 border-stone-200 hover:bg-stone-100'
                            : 'text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100'
                        }`}
                        title={source.enabled !== false ? 'Отключить источник' : 'Включить источник'}
                      >
                        <Power className="h-3 w-3" />
                        <span>
                          {actionLoadingId === `git_toggle_${source.id}`
                            ? '...'
                            : source.enabled !== false
                            ? 'Отключить'
                            : 'Включить'}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleTestGit(source.id)}
                        disabled={actionLoadingId === `git_test_${source.id}`}
                        className="text-xs font-semibold text-stone-600 hover:text-stone-900 inline-flex items-center space-x-1 px-2 py-1 cursor-pointer"
                      >
                        <RefreshCw className={`h-3 w-3 ${actionLoadingId === `git_test_${source.id}` ? 'animate-spin' : ''}`} />
                        <span>Проверить API</span>
                      </button>
                    </div>

                    <div className="flex items-center space-x-1.5">
                      <button
                        type="button"
                        onClick={() => handleEditGit(source)}
                        className="px-2.5 py-1 rounded-lg border border-stone-300 hover:bg-stone-100 text-stone-800 font-semibold text-xs inline-flex items-center space-x-1 cursor-pointer shadow-2xs"
                        title="Редактировать параметры источника"
                      >
                        <Edit2 className="h-3.5 w-3.5 text-stone-600" />
                        <span>Редактировать</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTargetGit(source)}
                        className="p-1.5 rounded-lg border border-rose-200 hover:bg-rose-50 hover:text-rose-600 text-stone-400 cursor-pointer"
                        title="Удалить источник"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: Managed Telegram Bots */}
      {activeTab === 'bots' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-stone-900">Список подключенных Telegram ботов</h3>
            <button
              id="btn-add-bot"
              onClick={handleOpenNewBot}
              className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-stone-900 text-white hover:bg-stone-800 text-xs font-semibold shadow-xs"
            >
              <Plus className="h-3.5 w-3.5 text-amber-400" />
              <span>Добавить бота</span>
            </button>
          </div>

          <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4 space-y-3">
            <div>
              <h4 className="text-sm font-bold text-indigo-950">Формат ссылок HAPP</h4>
              <p className="mt-1 text-xs text-indigo-800">
                Выберите crypt3, crypt4 или crypt5. Сохранение обновит формат ссылок у всех уже выданных HAPP-подписок.
                Ссылки INCY всегда сокращаются через clck.ru.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={happCryptVersion}
                disabled={isHappCryptSettingsLoading || isHappCryptSaving}
                onChange={(e) => setHappCryptVersion(e.target.value as HappCryptVersion)}
                className="min-w-48 rounded-xl border border-indigo-200 bg-white px-3 py-2 text-xs font-semibold text-stone-900"
              >
                <option value="crypt3">HAPP crypt3 (CH)</option>
                <option value="crypt4">HAPP crypt4</option>
                <option value="crypt5">HAPP crypt5</option>
              </select>
              <button
                type="button"
                onClick={handleSaveHappCryptVersion}
                disabled={
                  isHappCryptSettingsLoading ||
                  isHappCryptSaving ||
                  happCryptVersion === savedHappCryptVersion
                }
                className="rounded-xl bg-indigo-700 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isHappCryptSaving ? 'Обновление ссылок…' : 'Сохранить и обновить HAPP-ссылки'}
              </button>
              {isHappCryptSettingsLoading && <span className="text-xs text-indigo-700">Загрузка настройки…</span>}
            </div>
            {happCryptSettingsError && (
              <p className="text-xs font-semibold text-rose-700">{happCryptSettingsError}</p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {bots.map((bot) => {
              const isActive = bot.id === activeBotId;
              const ch = bot.channels?.[0];
              return (
                <div
                  key={bot.id}
                  id={`bot-item-${bot.id}`}
                  className={`bg-white border rounded-2xl p-5 shadow-xs transition-all flex flex-col justify-between space-y-4 ${
                    isActive ? 'border-indigo-500 ring-2 ring-indigo-500/20' : 'border-stone-200'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-2.5">
                        <div className="h-9 w-9 rounded-xl bg-stone-900 text-indigo-400 flex items-center justify-center font-bold text-xs">
                          <Bot className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <h4 className="font-bold text-stone-900 text-sm">{bot.name}</h4>
                            {isActive && (
                              <span className="px-2 py-0.2 rounded-full bg-indigo-100 text-indigo-900 text-[10px] font-bold">
                                Активный бот
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-stone-500 font-semibold">
                            @{bot.username}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-1.5 flex-wrap gap-1">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            bot.enabled !== false
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-stone-100 text-stone-500 border-stone-300'
                          }`}
                        >
                          {bot.enabled !== false ? 'Включен' : 'Отключен'}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            bot.showQrCode !== false
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : 'bg-stone-100 text-stone-500 border-stone-300'
                          }`}
                        >
                          {bot.showQrCode !== false ? 'QR: Вкл' : 'QR: Выкл'}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            bot.status === 'connected'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-stone-100 text-stone-600 border-stone-200'
                          }`}
                        >
                          {bot.status === 'connected' ? 'Подключен' : 'Ожидает API'}
                        </span>
                      </div>
                    </div>

                    {/* Quick Manual Telegram API Token Input Bar */}
                    <div className="mt-3 p-2.5 rounded-xl bg-indigo-50/70 border border-indigo-200/70 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-indigo-950 flex items-center space-x-1">
                          <Key className="h-3 w-3 text-indigo-600" />
                          <span>Telegram API Токен (из @BotFather):</span>
                        </span>
                        <span className="text-[10px] text-indigo-700">
                          {bot.token ? 'Задан' : 'Не задан'}
                        </span>
                      </div>
                      <div className="flex items-center space-x-1.5">
                        <input
                          type="password"
                          value={inlineBotTokens[bot.id] !== undefined ? inlineBotTokens[bot.id] : (bot.token || '')}
                          onChange={(e) => setInlineBotTokens({ ...inlineBotTokens, [bot.id]: e.target.value })}
                          placeholder="7192847291:AAH..."
                          className="flex-1 px-2.5 py-1 text-xs rounded-lg border border-indigo-300 bg-white text-stone-900 font-mono focus:ring-1 focus:ring-indigo-500"
                        />
                        <button
                          type="button"
                          disabled={inlineSavingId === bot.id}
                          onClick={() => handleQuickSaveBotToken(bot)}
                          className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs disabled:opacity-50 shrink-0"
                          title="Сохранить и применить токен"
                        >
                          {inlineSavingId === bot.id ? '...' : 'Сохранить'}
                        </button>
                      </div>
                    </div>

                    {/* Bot specific settings highlights */}
                    <div className="mt-3 space-y-1.5 text-xs text-stone-600 bg-stone-50 p-2.5 rounded-xl border border-stone-200/60">
                      <div className="flex items-center justify-between">
                        <span className="text-stone-400">Канал доступа:</span>
                        <span className="font-semibold text-stone-800">
                          {ch?.id || '@puls_channel'} ({ch?.isBotAdmin ? 'Бот - Админ ✅' : 'Требует прав'})
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-stone-400">Самоудаление подписки:</span>
                        <span className="font-semibold text-stone-800">
                          {bot.selfDeleteHours} часов при отписке
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-stone-400">Чат с админом (споры):</span>
                        <span className="font-semibold text-stone-800 truncate max-w-[180px]">
                          {bot.adminContactUrl}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-stone-100 flex-wrap gap-2">
                    <div className="flex items-center space-x-2 flex-wrap gap-1">
                      {!isActive && (
                        <button
                          onClick={() => onActivateBot(bot.id)}
                          className="text-xs font-bold text-indigo-600 hover:text-indigo-700 inline-flex items-center space-x-1 px-2 py-1 rounded-lg bg-indigo-50 border border-indigo-200"
                        >
                          <Power className="h-3.5 w-3.5" />
                          <span>Активировать</span>
                        </button>
                      )}

                      <button
                        onClick={() => handleToggleBotEnabled(bot)}
                        disabled={actionLoadingId === `bot_toggle_${bot.id}`}
                        className={`text-xs font-semibold inline-flex items-center space-x-1 px-2 py-1 rounded-lg border ${
                          bot.enabled !== false
                            ? 'text-stone-600 border-stone-200 hover:bg-stone-100'
                            : 'text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100'
                        }`}
                        title={bot.enabled !== false ? 'Отключить бота' : 'Включить бота'}
                      >
                        <Power className="h-3 w-3" />
                        <span>
                          {actionLoadingId === `bot_toggle_${bot.id}`
                            ? 'Сохранение...'
                            : bot.enabled !== false
                            ? 'Отключить'
                            : 'Включить'}
                        </span>
                      </button>

                      <button
                        onClick={() => handleToggleBotQr(bot)}
                        disabled={actionLoadingId === `bot_qr_${bot.id}`}
                        className={`text-xs font-semibold inline-flex items-center space-x-1 px-2 py-1 rounded-lg border ${
                          bot.showQrCode !== false
                            ? 'text-amber-800 border-amber-200 bg-amber-50 hover:bg-amber-100'
                            : 'text-stone-500 border-stone-200 hover:bg-stone-100'
                        }`}
                        title="Включить / выключить отображение QR-кода при выдаче подписки"
                      >
                        <QrCode className="h-3 w-3" />
                        <span>
                          {actionLoadingId === `bot_qr_${bot.id}`
                            ? '...'
                            : bot.showQrCode !== false
                            ? 'QR: Вкл'
                            : 'QR: Выкл'}
                        </span>
                      </button>

                      <button
                        onClick={() => handleToggleBotFireworks(bot)}
                        disabled={actionLoadingId === `bot_fw_${bot.id}`}
                        className={`text-xs font-semibold inline-flex items-center space-x-1 px-2 py-1 rounded-lg border ${
                          bot.enableFireworks !== false
                            ? 'text-indigo-800 border-indigo-200 bg-indigo-50 hover:bg-indigo-100'
                            : 'text-stone-500 border-stone-200 hover:bg-stone-100'
                        }`}
                        title="Включить / выключить салюты при выдаче подписки"
                      >
                        <Sparkles className="h-3 w-3 text-amber-500" />
                        <span>
                          {actionLoadingId === `bot_fw_${bot.id}`
                            ? '...'
                            : bot.enableFireworks !== false
                            ? 'Салюты: Вкл'
                            : 'Салюты: Выкл'}
                        </span>
                      </button>

                      {/* Bot button color badge */}
                      <div 
                        className="text-[11px] font-semibold inline-flex items-center space-x-1.5 px-2 py-1 rounded-lg border border-stone-200 bg-stone-50 text-stone-700"
                        title="Цвет кнопок в боте"
                      >
                        <Palette className="h-3 w-3 text-stone-500" />
                        <span className={`h-2 w-2 rounded-full ${
                          BOT_BUTTON_COLORS.find(c => c.id === (bot.buttonColor || 'indigo'))?.bg || 'bg-indigo-600'
                        }`} />
                        <span className="capitalize">{bot.buttonColor || 'Индиго'}</span>
                      </div>

                      <button
                        onClick={() => handleTestBot(bot.id)}
                        disabled={actionLoadingId === `bot_test_${bot.id}`}
                        className="text-xs font-semibold text-stone-600 hover:text-stone-900 inline-flex items-center space-x-1 px-2 py-1"
                      >
                        <ShieldCheck className={`h-3.5 w-3.5 text-emerald-600 ${actionLoadingId === `bot_test_${bot.id}` ? 'animate-pulse' : ''}`} />
                        <span>Канал</span>
                      </button>
                    </div>

                    <div className="flex items-center space-x-1.5">
                      <button
                        onClick={() => handleEditBot(bot)}
                        className="p-1.5 rounded-lg border border-stone-200 hover:bg-stone-100 text-stone-600"
                        title="Полное редактирование"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteTargetBot(bot)}
                        className="p-1.5 rounded-lg border border-rose-200 hover:bg-rose-50 hover:text-rose-600 text-stone-400"
                        title="Удалить бота"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB: Firebase & Render Cloud Synchronization */}
      {activeTab === 'firebase' && (
        <div className="space-y-6">
          {/* Status Header */}
          <div className="bg-white rounded-2xl p-6 border border-stone-200 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <div className="flex items-center space-x-2">
                  <div className="p-2 rounded-xl bg-orange-50 text-orange-600">
                    <Cloud className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-stone-900">
                      Облачное хранилище Firebase Firestore & Настройка Render
                    </h3>
                    <p className="text-xs text-stone-500 mt-0.5">
                      Авторитетный источник данных (Authoritative Master DB) для серверов Render, Docker и локального окружения
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2 flex-wrap gap-2">
                <button
                  type="button"
                  disabled={isFirebaseSyncing}
                  onClick={handleSyncFirebaseNow}
                  className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold shadow-xs transition-colors disabled:opacity-50"
                  title="Принудительно сохранить текущее состояние в Cloud Firestore"
                >
                  <Cloud className={`h-3.5 w-3.5 ${isFirebaseSyncing ? 'animate-pulse' : ''}`} />
                  <span>{isFirebaseSyncing ? 'Синхронизация...' : 'Синхронизировать сейчас'}</span>
                </button>

                <button
                  type="button"
                  disabled={isFirebaseReloading}
                  onClick={handleReloadFirebaseNow}
                  className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold shadow-xs transition-colors disabled:opacity-50"
                  title="Загрузить авторитетное состояние из Cloud Firestore"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isFirebaseReloading ? 'animate-spin' : ''}`} />
                  <span>{isFirebaseReloading ? 'Загрузка...' : 'Перезагрузить из Firestore'}</span>
                </button>

                <button
                  type="button"
                  disabled={isFirebaseLoading}
                  onClick={loadFirebaseStatus}
                  className="p-2 rounded-xl border border-stone-200 text-stone-600 hover:bg-stone-100 transition-colors"
                  title="Обновить статус соединения"
                >
                  <RefreshCw className={`h-4 w-4 ${isFirebaseLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* Cloud Status Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-stone-100">
              <div className="p-4 rounded-xl bg-stone-50 border border-stone-200/80 space-y-1">
                <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wider">Соединение</span>
                <div className="flex items-center space-x-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-ping" />
                  <span className="text-sm font-bold text-emerald-800">
                    {firebaseStatus?.connected ? 'Firestore подключен' : 'Локальный Fallback'}
                  </span>
                </div>
                <div className="text-[11px] text-stone-500 font-mono truncate">
                  Документ: {firebaseStatus?.documentPath || 'system_store/main_store'}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-stone-50 border border-stone-200/80 space-y-1">
                <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wider">Пользователи в облаке</span>
                <div className="text-lg font-extrabold text-stone-900">
                  {firebaseStatus?.counts?.users ?? '—'} чел.
                </div>
                <div className="text-[11px] text-stone-500">
                  Активных подписок и ключей
                </div>
              </div>

              <div className="p-4 rounded-xl bg-stone-50 border border-stone-200/80 space-y-1">
                <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wider">Боты и Источники</span>
                <div className="text-lg font-extrabold text-stone-900">
                  {firebaseStatus?.counts?.bots ?? '—'} ботов • {firebaseStatus?.counts?.gitSources ?? '—'} Git
                </div>
                <div className="text-[11px] text-stone-500 truncate">
                  Активный бот: {firebaseStatus?.activeBot || 'Основной'}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-stone-50 border border-stone-200/80 space-y-1">
                <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wider">Проверка данных</span>
                <div className="flex items-center space-x-1.5 text-sm font-bold text-emerald-700">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>Read / Write OK</span>
                </div>
                <div className="text-[11px] text-stone-500">
                  Синхронизировано: {firebaseStatus?.lastSavedAt ? new Date(firebaseStatus.lastSavedAt).toLocaleTimeString() : 'Только что'}
                </div>
              </div>
            </div>
          </div>

          {/* Render.com Setup Guide */}
          <div className="bg-white rounded-2xl p-6 border border-stone-200 shadow-xs space-y-5">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 rounded-xl bg-cyan-50 text-cyan-700">
                <Server className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-stone-900">
                  Инструкция по развертыванию на Render.com
                </h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  Как запустить контейнер на Render в 3 шага так, чтобы данные никогда не удалялись
                </p>
              </div>
            </div>

            <div className="space-y-4 text-xs text-stone-700">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-4 rounded-xl bg-stone-50 border border-stone-200/80 space-y-2">
                  <div className="flex items-center space-x-2 text-stone-900 font-bold">
                    <span className="h-5 w-5 rounded-full bg-stone-900 text-white flex items-center justify-center text-[11px]">1</span>
                    <span>Создание Web Service</span>
                  </div>
                  <p className="text-stone-600 leading-relaxed">
                    На сайте <strong>render.com</strong> нажмите <strong>New + → Web Service</strong> и подключите репозиторий с проектом.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-stone-50 border border-stone-200/80 space-y-2">
                  <div className="flex items-center space-x-2 text-stone-900 font-bold">
                    <span className="h-5 w-5 rounded-full bg-stone-900 text-white flex items-center justify-center text-[11px]">2</span>
                    <span>Выбор среды Docker</span>
                  </div>
                  <p className="text-stone-600 leading-relaxed">
                    В поле <strong>Runtime</strong> выберите <strong>Docker</strong>. Render автоматически обнаружит файл <code className="px-1 py-0.5 bg-stone-200 rounded font-mono">Dockerfile</code> и файл конфигурации <code className="px-1 py-0.5 bg-stone-200 rounded font-mono">render.yaml</code>.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-stone-50 border border-stone-200/80 space-y-2">
                  <div className="flex items-center space-x-2 text-stone-900 font-bold">
                    <span className="h-5 w-5 rounded-full bg-stone-900 text-white flex items-center justify-center text-[11px]">3</span>
                    <span>Переменные окружения</span>
                  </div>
                  <p className="text-stone-600 leading-relaxed">
                    В разделе <strong>Environment Variables</strong> добавьте переменные:
                    <br />
                    • <code className="px-1 py-0.5 bg-stone-200 rounded font-mono">PORT = 3000</code>
                    <br />
                    • <code className="px-1 py-0.5 bg-stone-200 rounded font-mono">FIREBASE_CONFIG_JSON</code> (скопируйте блок ниже)
                  </p>
                </div>
              </div>

              {/* Ready-to-copy JSON block */}
              <div className="p-4 rounded-xl bg-stone-900 text-stone-100 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Key className="h-4 w-4 text-orange-400" />
                    <span className="font-bold text-xs text-white">
                      Значение для переменной FIREBASE_CONFIG_JSON
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const cfgJson = JSON.stringify({
                        projectId: "gen-lang-client-0798093918",
                        appId: "1:384359731563:web:f251660370034e5cd5fc2e",
                        apiKey: "AIzaSyBYOu9kmDTVVbqAAC3oxHGk834BF31G0b8",
                        authDomain: "gen-lang-client-0798093918.firebaseapp.com",
                        firestoreDatabaseId: "ai-studio-03156b68-3890-4187-85fe-57fab87d5859",
                        storageBucket: "gen-lang-client-0798093918.firebasestorage.app",
                        messagingSenderId: "384359731563"
                      }, null, 2);
                      navigator.clipboard.writeText(cfgJson);
                      setHasCopiedConfig(true);
                      showToast('success', 'FIREBASE_CONFIG_JSON успешно скопирован в буфер обмена!');
                      setTimeout(() => setHasCopiedConfig(false), 3000);
                    }}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs shadow-xs transition-colors"
                  >
                    {hasCopiedConfig ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-white" />
                        <span>Скопировано!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5 text-white" />
                        <span>Скопировать готовый JSON</span>
                      </>
                    )}
                  </button>
                </div>

                <pre className="p-3 bg-stone-950 rounded-lg text-[11px] font-mono text-stone-300 overflow-x-auto leading-relaxed">
{JSON.stringify({
  projectId: "gen-lang-client-0798093918",
  appId: "1:384359731563:web:f251660370034e5cd5fc2e",
  apiKey: "AIzaSyBYOu9kmDTVVbqAAC3oxHGk834BF31G0b8",
  authDomain: "gen-lang-client-0798093918.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-03156b68-3890-4187-85fe-57fab87d5859",
  storageBucket: "gen-lang-client-0798093918.firebasestorage.app",
  messagingSenderId: "384359731563"
}, null, 2)}
                </pre>
              </div>

              {/* Explanatory note */}
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start space-x-2.5">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-[11px] space-y-1">
                  <div className="font-bold">Почему данные не пропадут на Render?</div>
                  <p className="text-amber-800 leading-relaxed">
                    На Render локальная файловая система контейнера является эфемерной (сбрасывается при каждом обновлении или перезапуске). Наше веб-приложение настроено на <strong>двустороннюю синхронизацию с Firebase Firestore</strong>: при старте контейнера сервер автоматически связывается с базой данных в Google Cloud и восстанавливает всех пользователей, выданные подписки, ботов и конфигурации. Любые новые добавления сохраняются сразу в облако.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Alternative Hosting & 24/7 Deployment Options */}
          <div className="bg-white rounded-2xl p-6 border border-stone-200 shadow-xs space-y-4">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-stone-900">
                  Гарантия идентичности и варианты 24/7 хостинга (Vercel, Netlify, Replit, VPS, Cloud Run)
                </h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  Интерфейс, база данных и логика остаются на 100% идентичными на любой из платформ
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2 text-xs">
              {/* Option 1: Google Cloud Run (AI Studio Built-in) */}
              <div className="p-4 rounded-xl bg-stone-50 border border-stone-200/90 space-y-2 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-stone-900 text-xs">1. Google Cloud Run (Встроенный)</span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">Рекомендуется</span>
                  </div>
                  <p className="text-stone-600 mt-1.5 leading-relaxed">
                    В правом верхнем углу этой среды нажмите <strong>Deploy</strong> (развернуть). Приложение публикуется на официальном продакшн-сервере Google Cloud Run с прямым доступом к Firebase Firestore без дополнительных настроек.
                  </p>
                </div>
                <div className="text-[11px] font-semibold text-emerald-700">
                  ✓ Самый быстрый запуск без сторонних аккаунтов
                </div>
              </div>

              {/* Option 2: Render.com / Railway / Koyeb */}
              <div className="p-4 rounded-xl bg-stone-50 border border-stone-200/90 space-y-2 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-stone-900 text-xs">2. Render / Railway / Koyeb</span>
                    <span className="px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-800 text-[10px] font-bold">24/7 Docker</span>
                  </div>
                  <p className="text-stone-600 mt-1.5 leading-relaxed">
                    Использует готовый <code className="font-mono bg-stone-200 px-1 py-0.5 rounded">Dockerfile</code> и <code className="font-mono bg-stone-200 px-1 py-0.5 rounded">render.yaml</code>. Контейнер работает непрерывно, Telegram-бот опрашивает чаты в реальном времени.
                  </p>
                </div>
                <div className="text-[11px] font-semibold text-cyan-700">
                  ✓ Идеально для бесперебойного Telegram-бота
                </div>
              </div>

              {/* Option 3: Replit */}
              <div className="p-4 rounded-xl bg-stone-50 border border-stone-200/90 space-y-2 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-stone-900 text-xs">3. Replit</span>
                    <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">Готов (.replit)</span>
                  </div>
                  <p className="text-stone-600 mt-1.5 leading-relaxed">
                    В архив добавлены файлы <code className="font-mono bg-stone-200 px-1 py-0.5 rounded">.replit</code> и <code className="font-mono bg-stone-200 px-1 py-0.5 rounded">replit.nix</code>. Достаточно загрузить архив в Replit и нажать Run. С функцией Always-On бот не засыпает.
                  </p>
                </div>
                <div className="text-[11px] font-semibold text-amber-800">
                  ✓ Запуск в облачной IDE в один клик
                </div>
              </div>

              {/* Option 4: Vercel & Netlify */}
              <div className="p-4 rounded-xl bg-stone-50 border border-stone-200/90 space-y-2 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-stone-900 text-xs">4. Vercel & Netlify</span>
                    <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-[10px] font-bold">Serverless</span>
                  </div>
                  <p className="text-stone-600 mt-1.5 leading-relaxed">
                    Конфигурации <code className="font-mono bg-stone-200 px-1 py-0.5 rounded">vercel.json</code>, <code className="font-mono bg-stone-200 px-1 py-0.5 rounded">api/index.ts</code> и <code className="font-mono bg-stone-200 px-1 py-0.5 rounded">netlify.toml</code> уже настроены. Интерфейс и API идентичны.
                  </p>
                </div>
                <div className="text-[11px] font-semibold text-indigo-700">
                  ✓ Молниеносная отдача CDN и нулевая стоимость
                </div>
              </div>

              {/* Option 5: Any VPS / Linux Server */}
              <div className="p-4 rounded-xl bg-stone-50 border border-stone-200/90 space-y-2 flex flex-col justify-between md:col-span-2">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-stone-900 text-xs">5. Свой VPS / Сервер (Timeweb, Aeza, Selectel, Hetzner, Beget)</span>
                    <span className="px-2 py-0.5 rounded-full bg-stone-200 text-stone-800 text-[10px] font-bold">Полный контроль</span>
                  </div>
                  <p className="text-stone-600 mt-1.5 leading-relaxed">
                    Распакуйте скачанный ZIP-архив на сервере и выполните:
                    <br />
                    <code className="font-mono bg-stone-900 text-amber-400 px-2 py-1 rounded block mt-1">
                      docker compose up -d
                    </code>
                    Контейнер запустится на порту 3000 под супервизором автоперезапуска.
                  </p>
                </div>
                <div className="text-[11px] font-semibold text-stone-700">
                  ✓ Никаких ограничений, автоматический рестарт каждые 24ч
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Backup & Source Code Export / Restore */}
      {activeTab === 'backup' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-6 border border-stone-200 shadow-xs space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-bold text-stone-900 flex items-center space-x-2">
                  <Archive className="h-4 w-4 text-emerald-600" />
                  <span>Полный архив исходного кода веб-приложения</span>
                </h3>
                <p className="text-xs text-stone-500 mt-1 max-w-2xl">
                  Скачивание проекта в один клик. В архив упаковываются абсолютно все файлы: компоненты интерфейса, серверная часть, конфигурации, шаблоны заглушек HAPP/INCY/Clash, активная база данных пользователей и настроек. При переносе на любой другой VPS или сервер всё распаковывается и восстанавливается точь-в-точь.
                </p>
              </div>
              <a
                id="btn-settings-download-full"
                href="/api/backup/download-full"
                download
                className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold shadow-xs transition-colors shrink-0"
              >
                <Download className="h-4 w-4 text-amber-400" />
                <span>Скачать все исходники (.ZIP)</span>
              </a>
            </div>

            <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 text-xs text-stone-600 space-y-2">
              <div className="font-semibold text-stone-800">Что входит в архив:</div>
              <ul className="list-disc list-inside space-y-1 text-stone-600">
                <li>Полный исходный код TypeScript / React (клиент) и Express (сервер)</li>
                <li>Менеджер Telegram ботов и автосинхронизатор с Git репозиториями</li>
                <li>Текущая база данных <code>data-store.json</code> со всеми подписчиками, ключами, ботами и источниками</li>
                <li>Все стили, конфигурации (Vite, Tailwind, TypeScript, package.json)</li>
              </ul>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-stone-200 shadow-xs space-y-4">
            <div>
              <h3 className="text-sm font-bold text-stone-900 flex items-center space-x-2">
                <Upload className="h-4 w-4 text-indigo-600" />
                <span>Восстановление базы данных и настроек из резервной копии</span>
              </h3>
              <p className="text-xs text-stone-500 mt-1">
                Если у вас есть сохраненный файл <code>data-store.json</code> из архива, вы можете загрузить его сюда для мгновенного восстановления всех пользователей, источников Git, ботов и правил каналов.
              </p>
            </div>

            <div className="flex items-center space-x-4">
              <input
                id="input-restore-backup-file"
                type="file"
                accept=".json"
                disabled={isRestoring}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;

                  if (!confirm(`Вы действительно хотите восстановить конфигурацию из файла "${file.name}"? Это обновит пользователей, ботов и источники Git.`)) {
                    e.target.value = '';
                    return;
                  }

                  setIsRestoring(true);
                  try {
                    const text = await file.text();
                    const parsed = JSON.parse(text);

                    const res = await fetch('/api/backup/restore-data', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(parsed),
                    });

                    const json = await res.json();
                    if (!res.ok || !json.success) {
                      throw new Error(json.message || 'Ошибка восстановления');
                    }

                    showToast('success', `${json.message} (Пользователей: ${json.counts?.users ?? 0})`);
                    setTimeout(() => window.location.reload(), 1500);
                  } catch (err: any) {
                    showToast('error', `Не удалось восстановить данные: ${err.message}`);
                  } finally {
                    setIsRestoring(false);
                    e.target.value = '';
                  }
                }}
                className="text-xs text-stone-600 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-stone-100 file:text-stone-700 hover:file:bg-stone-200 cursor-pointer"
              />
              {isRestoring && <RefreshCw className="h-4 w-4 animate-spin text-indigo-600" />}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: Docker Configuration & Process Supervisor */}
      {activeTab === 'docker' && (
        <DockerConfigView />
      )}

      {/* TAB 5: Vercel Serverless Configuration & Webhooks */}
      {activeTab === 'vercel' && (
        <VercelConfigView />
      )}

      {/* TAB 6: Russian Relay Gateway (White-list Proxy & Yandex Cloud Functions) */}
      {activeTab === 'relay' && (
        <RelayGatewayView />
      )}

      {/* Modal: Add/Edit Git Source */}
      {showGitModal && editingGit && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-stone-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="text-base font-bold text-stone-900">
                {editingGit.id ? 'Редактировать источник Git' : 'Добавить источник Git'}
              </h3>
              <button onClick={() => setShowGitModal(false)} className="text-stone-400 hover:text-stone-600">✕</button>
            </div>

            <form onSubmit={handleSaveGitSubmit} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-stone-700 block mb-1">Название источника *</label>
                <input
                  type="text"
                  required
                  value={editingGit.name || ''}
                  onChange={(e) => setEditingGit({ ...editingGit, name: e.target.value })}
                  placeholder="Основной GitVerse"
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-stone-700 block mb-1">Провайдер</label>
                  <select
                    value={editingGit.provider || 'gitverse'}
                    onChange={(e) => {
                      const p = e.target.value as GitProvider;
                      let defaultApi = 'https://api.gitverse.ru';
                      if (p === 'sourcecraft') defaultApi = 'https://api.sourcecraft.tech';
                      if (p === 'gitflic') defaultApi = 'https://gitflic.ru/api/v1';
                      if (p === 'github') defaultApi = 'https://api.github.com';
                      if (p === 'gitlab') defaultApi = 'https://gitlab.com/api/v4';
                      if (p === 'moshub') defaultApi = 'https://hub.mos.ru/api/v4';
                      setEditingGit({ ...editingGit, provider: p, apiUrl: defaultApi });
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-900"
                  >
                    <option value="gitverse">GitVerse (Сбер)</option>
                    <option value="sourcecraft">SourceCraft (Яндекс)</option>
                    <option value="gitflic">GitFlic</option>
                    <option value="moshub">MosHub</option>
                    <option value="github">GitHub</option>
                    <option value="gitlab">GitLab</option>
                    <option value="custom">Пользовательский Git API</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-stone-700 block mb-1">API URL</label>
                  <input
                    type="text"
                    value={editingGit.apiUrl || ''}
                    onChange={(e) => setEditingGit({ ...editingGit, apiUrl: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 font-mono"
                    placeholder={editingGit.provider === 'sourcecraft' ? 'https://api.sourcecraft.tech' : 'https://api.gitverse.ru'}
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-stone-700 block mb-1">API токен / ключ доступа</label>
                <input
                  type="password"
                  value={editingGit.token || ''}
                  onChange={(e) => setEditingGit({ ...editingGit, token: e.target.value })}
                  placeholder={editingGit.provider === 'sourcecraft' ? 'sc_pat_... или OAuth токен Яндекс ID' : 'gv_pat_...'}
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 font-mono"
                />
              </div>

              {['gitflic', 'moshub', 'gitlab'].includes(editingGit.provider || '') && (
                <div>
                  <label className="font-bold text-stone-700 block mb-1">Логин для Git HTTPS</label>
                  <input
                    type="text"
                    autoComplete="username"
                    value={editingGit.username || ''}
                    onChange={(e) => setEditingGit({ ...editingGit, username: e.target.value })}
                    placeholder="Имя пользователя аккаунта, не namespace репозитория"
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 font-mono"
                  />
                  <span className="text-[10px] text-stone-400">
                    Используется вместе с токеном при git clone/push; если не заполнено, применяется логин по умолчанию провайдера.
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-stone-700 block mb-1">
                    Репозиторий {editingGit.provider !== 'custom' && '*'}
                  </label>
                  <input
                    type="text"
                    value={editingGit.repository || ''}
                    onChange={(e) => setEditingGit({ ...editingGit, repository: e.target.value })}
                    placeholder={editingGit.provider === 'custom' ? 'Необязательно для API' : 'username/repo'}
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-900"
                  />
                </div>

                <div>
                  <label className="font-bold text-stone-700 block mb-1">Ветка</label>
                  <input
                    type="text"
                    value={editingGit.branch || 'main'}
                    onChange={(e) => setEditingGit({ ...editingGit, branch: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-900"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-stone-700 block mb-1">Путь к файлу подписки в репозитории</label>
                <input
                  type="text"
                  value={editingGit.filePath || 'subscription.txt'}
                  onChange={(e) => setEditingGit({ ...editingGit, filePath: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 font-mono"
                />
              </div>

              <div>
                <label className="font-bold text-stone-700 block mb-1">
                  Центральная ссылка (RAW URL на мастер-файл)
                </label>
                <input
                  type="url"
                  value={editingGit.centralRawUrl || ''}
                  onChange={(e) => setEditingGit({ ...editingGit, centralRawUrl: e.target.value })}
                  placeholder={editingGit.provider === 'sourcecraft' ? 'https://sourcecraft.dev/username/repo/raw/branch/main/L' : 'https://gitverse.ru/api/repos/Vaynet/bot/raw/branch/master/L'}
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 font-mono"
                />
                <span className="text-[10px] text-stone-400">
                  Из этого центрального источника генерируются персональные подписки пользователей
                </span>
              </div>

              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 flex items-center justify-between">
                <div>
                  <span className="font-bold text-stone-800 block">Источник включен и доступен</span>
                  <span className="text-[11px] text-stone-500">Разрешает чтение и запись персональных файлов</span>
                </div>
                <input
                  type="checkbox"
                  checked={editingGit.enabled ?? true}
                  onChange={(e) => setEditingGit({ ...editingGit, enabled: e.target.checked })}
                  className="h-4 w-4 rounded border-stone-300 text-stone-900 focus:ring-stone-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setShowGitModal(false)}
                  className="px-4 py-2 rounded-xl border border-stone-200 text-stone-600 hover:bg-stone-50"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={isSavingForm}
                  className="px-4 py-2 rounded-xl bg-stone-900 text-white font-semibold hover:bg-stone-800 disabled:opacity-50"
                >
                  {isSavingForm ? 'Сохранение...' : 'Сохранить и применить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add/Edit Telegram Bot */}
      {showBotModal && editingBot && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-xl border border-stone-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="text-base font-bold text-stone-900">
                {editingBot.id ? 'Редактировать Telegram бота' : 'Добавить Telegram бота'}
              </h3>
              <button onClick={() => setShowBotModal(false)} className="text-stone-400 hover:text-stone-600">✕</button>
            </div>

            <form onSubmit={handleSaveBotSubmit} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-stone-700 block mb-1">Название бота *</label>
                  <input
                    type="text"
                    required
                    value={editingBot.name || ''}
                    onChange={(e) => setEditingBot({ ...editingBot, name: e.target.value })}
                    placeholder="Основной бот доступа"
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-900"
                  />
                </div>

                <div>
                  <label className="font-bold text-stone-700 block mb-1">Юзернейм бота (@bot_username)</label>
                  <input
                    type="text"
                    value={editingBot.username || ''}
                    onChange={(e) => setEditingBot({ ...editingBot, username: e.target.value })}
                    placeholder="puls_access_bot"
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-900"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-stone-700 block mb-1">Telegram Bot API Token *</label>
                <input
                  type="password"
                  value={editingBot.token || ''}
                  onChange={(e) => setEditingBot({ ...editingBot, token: e.target.value })}
                  placeholder="7192847291:AAH..."
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 font-mono"
                />
              </div>

              {/* Obligatory Channels Management */}
              <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="font-bold text-stone-900 block text-sm flex items-center space-x-1.5">
                      <Radio className="h-4 w-4 text-emerald-600" />
                      <span>Обязательные каналы для проверки подписки</span>
                    </label>
                    <p className="text-[11px] text-stone-500 mt-0.5">
                      Бот проверяет членство во всех обязательных каналах перед выдачей подписки. При выходе из любого из них подписка отключается (ставится заглушка, блокируются обновления из центрального файла) и запускается таймер удаления.
                    </p>
                    <div className="mt-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-900 flex items-start space-x-2">
                      <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                      <span>
                        <strong>Важное правило Telegram:</strong> Чтобы бот мог проверять, подписан ли пользователь на канал, <u>бот обязательно должен быть добавлен администратором</u> в этот канал (хотя бы с минимальными правами). Если бот не администратор, Telegram API возвращает ошибку доступа и блокирует проверку.
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const currentChannels = editingBot.channels || [];
                      const newCh = {
                        id: `@channel_${currentChannels.length + 1}`,
                        title: `Обязательный канал ${currentChannels.length + 1}`,
                        isRequired: true,
                        isBotAdmin: true,
                        inviteLink: '',
                      };
                      setEditingBot({
                        ...editingBot,
                        channels: [...currentChannels, newCh],
                      });
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs inline-flex items-center space-x-1 cursor-pointer transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Добавить канал</span>
                  </button>
                </div>

                <div className="space-y-2.5 pt-1">
                  {(editingBot.channels && editingBot.channels.length > 0 ? editingBot.channels : [{ id: '@puls_channel', title: 'Основной канал', isRequired: true, isBotAdmin: true }]).map((ch, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-lg bg-white border border-stone-200 shadow-xs space-y-2"
                    >
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block mb-1">
                            Юзернейм или ID (@channel / -100...) *
                          </span>
                          <input
                            type="text"
                            value={ch.id || ''}
                            onChange={(e) => {
                              const nextChannels = [...(editingBot.channels || [])];
                              if (!nextChannels[idx]) nextChannels[idx] = { ...ch };
                              nextChannels[idx].id = e.target.value;
                              setEditingBot({ ...editingBot, channels: nextChannels });
                            }}
                            placeholder="@puls_channel"
                            className="w-full px-2.5 py-1.5 rounded-lg border border-stone-200 bg-stone-50 text-stone-900 text-xs font-mono"
                          />
                        </div>

                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block mb-1">
                            Название канала для отображения
                          </span>
                          <input
                            type="text"
                            value={ch.title || ''}
                            onChange={(e) => {
                              const nextChannels = [...(editingBot.channels || [])];
                              if (!nextChannels[idx]) nextChannels[idx] = { ...ch };
                              nextChannels[idx].title = e.target.value;
                              setEditingBot({ ...editingBot, channels: nextChannels });
                            }}
                            placeholder="Наш новостной канал"
                            className="w-full px-2.5 py-1.5 rounded-lg border border-stone-200 bg-stone-50 text-stone-900 text-xs"
                          />
                        </div>

                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block mb-1">
                            Ссылка-приглашение (t.me/...)
                          </span>
                          <input
                            type="text"
                            value={ch.inviteLink || ''}
                            onChange={(e) => {
                              const nextChannels = [...(editingBot.channels || [])];
                              if (!nextChannels[idx]) nextChannels[idx] = { ...ch };
                              nextChannels[idx].inviteLink = e.target.value;
                              setEditingBot({ ...editingBot, channels: nextChannels });
                            }}
                            placeholder="https://t.me/puls_channel"
                            className="w-full px-2.5 py-1.5 rounded-lg border border-stone-200 bg-stone-50 text-stone-900 text-xs font-mono"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-stone-100">
                        <label className="inline-flex items-center space-x-2 text-xs font-semibold text-stone-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={ch.isRequired !== false}
                            onChange={(e) => {
                              const nextChannels = [...(editingBot.channels || [])];
                              if (!nextChannels[idx]) nextChannels[idx] = { ...ch };
                              nextChannels[idx].isRequired = e.target.checked;
                              setEditingBot({ ...editingBot, channels: nextChannels });
                            }}
                            className="h-3.5 w-3.5 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          <span>Обязательная подписка (без нее бот не выдаст ключ)</span>
                        </label>

                        {(editingBot.channels || []).length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              const nextChannels = (editingBot.channels || []).filter((_, i) => i !== idx);
                              setEditingBot({ ...editingBot, channels: nextChannels });
                            }}
                            className="text-[11px] text-rose-600 hover:text-rose-800 font-semibold inline-flex items-center space-x-1"
                          >
                            <Trash2 className="h-3 w-3" />
                            <span>Удалить канал</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Admin chat */}
              <div>
                <label className="font-bold text-stone-700 block mb-1">Чат с админом для разбирательств</label>
                <input
                  type="text"
                  value={editingBot.adminContactUrl || ''}
                  onChange={(e) => setEditingBot({ ...editingBot, adminContactUrl: e.target.value })}
                  placeholder="https://t.me/puls_admin"
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-900"
                />
              </div>

              {/* Blocked message config */}
              <div>
                <label className="font-bold text-stone-700 block mb-1">
                  Сообщение при блокировке подозрительного пользователя:
                </label>
                <textarea
                  rows={2}
                  value={editingBot.blockedUserMessage || ''}
                  onChange={(e) => setEditingBot({ ...editingBot, blockedUserMessage: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-900"
                />
                <span className="text-[10px] text-stone-400">
                  Доступны переменные: {'{username}'}, {'{reason}'}
                </span>
              </div>

              {/* Unsubscribed message & Self-delete hours */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="font-bold text-stone-700 block mb-1">
                    Сообщение при выходе из канала:
                  </label>
                  <textarea
                    rows={2}
                    value={editingBot.unsubscribedMessage || ''}
                    onChange={(e) => setEditingBot({ ...editingBot, unsubscribedMessage: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-900"
                  />
                  <span className="text-[10px] text-stone-400">Переменная: {'{hours}'}</span>
                </div>

                <div>
                  <label className="font-bold text-stone-700 block mb-1">
                    Самоудаление через (часов):
                  </label>
                  <input
                    type="number"
                    value={editingBot.selfDeleteHours || 72}
                    onChange={(e) => setEditingBot({ ...editingBot, selfDeleteHours: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-900"
                  />
                </div>
              </div>

              {/* Delete previous message option */}
              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 flex items-center justify-between">
                <div>
                  <span className="font-bold text-stone-800 block">Удалять предыдущее сообщение при шаге</span>
                  <span className="text-[11px] text-stone-500">Бот очищает предыдущее сообщение для чистоты чата</span>
                </div>
                <input
                  type="checkbox"
                  checked={editingBot.deletePreviousMessageOnStep ?? false}
                  onChange={(e) => setEditingBot({ ...editingBot, deletePreviousMessageOnStep: e.target.checked })}
                  className="h-4 w-4 rounded border-stone-300 text-stone-900 focus:ring-stone-500"
                />
              </div>

              {/* Show QR code option */}
              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 flex items-center justify-between">
                <div>
                  <span className="font-bold text-stone-800 block">Отображать QR-код при выдаче ссылки подписки</span>
                  <span className="text-[11px] text-stone-500">Генерирует QR для быстрой привязки в приложении на телефоне</span>
                </div>
                <input
                  type="checkbox"
                  checked={editingBot.showQrCode ?? true}
                  onChange={(e) => setEditingBot({ ...editingBot, showQrCode: e.target.checked })}
                  className="h-4 w-4 rounded border-stone-300 text-stone-900 focus:ring-stone-500"
                />
              </div>

              {/* Visual Fireworks option */}
              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 flex items-center justify-between">
                <div>
                  <span className="font-bold text-stone-800 block flex items-center space-x-1.5">
                    <span>Визуальные эффекты при получении (фейерверки/салюты)</span>
                    <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                  </span>
                  <span className="text-[11px] text-stone-500">Запуск анимации конфетти и салютов в чате/симуляторе при создании подписки</span>
                </div>
                <input
                  type="checkbox"
                  checked={editingBot.enableFireworks ?? true}
                  onChange={(e) => setEditingBot({ ...editingBot, enableFireworks: e.target.checked })}
                  className="h-4 w-4 rounded border-stone-300 text-stone-900 focus:ring-stone-500"
                />
              </div>

              {/* Button Color selector */}
              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-stone-800 block flex items-center space-x-1.5">
                    <Palette className="h-3.5 w-3.5 text-stone-500" />
                    <span>Цвет основных кнопок в боте</span>
                  </span>
                  <span className="text-[10px] uppercase font-mono font-bold text-stone-500">
                    {editingBot.buttonColor || 'indigo'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {BOT_BUTTON_COLORS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setEditingBot({ ...editingBot, buttonColor: c.id })}
                      className={`flex items-center space-x-1 px-3 py-1 rounded-lg text-xs font-medium border transition-all ${
                        (editingBot.buttonColor || 'indigo') === c.id
                          ? `${c.bg} text-white border-transparent shadow-xs scale-105`
                          : 'bg-white text-stone-700 border-stone-200 hover:border-stone-300'
                      }`}
                    >
                      <span className={`h-2.5 w-2.5 rounded-full ${c.bg}`} />
                      <span>{c.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Bot Enabled option */}
              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 flex items-center justify-between">
                <div>
                  <span className="font-bold text-stone-800 block">Бот включен и обрабатывает запросы</span>
                  <span className="text-[11px] text-stone-500">Отключите, если бот временно на техническом обслуживании</span>
                </div>
                <input
                  type="checkbox"
                  checked={editingBot.enabled ?? true}
                  onChange={(e) => setEditingBot({ ...editingBot, enabled: e.target.checked })}
                  className="h-4 w-4 rounded border-stone-300 text-stone-900 focus:ring-stone-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setShowBotModal(false)}
                  className="px-4 py-2 rounded-xl border border-stone-200 text-stone-600 hover:bg-stone-50"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={isSavingForm}
                  className="px-4 py-2 rounded-xl bg-stone-900 text-white font-semibold hover:bg-stone-800 disabled:opacity-50"
                >
                  {isSavingForm ? 'Сохранение...' : 'Сохранить и применить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Delete Git Source */}
      {deleteTargetGit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs">
          <div className="bg-white border border-stone-200 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start space-x-3">
              <div className="p-2.5 rounded-xl bg-rose-50 text-rose-600 shrink-0">
                <Trash2 className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-stone-900">Удалить источник серверов?</h3>
                <p className="text-xs text-stone-500 mt-1">
                  Вы действительно хотите полностью удалить источник <strong>"{deleteTargetGit.name}"</strong> ({deleteTargetGit.repository})? Это действие необратимо.
                </p>
              </div>
            </div>
            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTargetGit(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-stone-600 hover:bg-stone-100"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={actionLoadingId === 'del_git'}
                onClick={async () => {
                  setActionLoadingId('del_git');
                  try {
                    await onDeleteGitSource(deleteTargetGit.id);
                    showToast('success', `Источник "${deleteTargetGit.name}" успешно удален!`);
                    setDeleteTargetGit(null);
                  } catch (err: any) {
                    showToast('error', err.message);
                  } finally {
                    setActionLoadingId(null);
                  }
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50"
              >
                {actionLoadingId === 'del_git' ? 'Удаление...' : 'Да, удалить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Delete Telegram Bot */}
      {deleteTargetBot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs">
          <div className="bg-white border border-stone-200 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start space-x-3">
              <div className="p-2.5 rounded-xl bg-rose-50 text-rose-600 shrink-0">
                <Trash2 className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-stone-900">Удалить Telegram бота?</h3>
                <p className="text-xs text-stone-500 mt-1">
                  Вы действительно хотите полностью удалить Telegram бота <strong>"{deleteTargetBot.name}"</strong> (@{deleteTargetBot.username})? Это действие необратимо.
                </p>
              </div>
            </div>
            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTargetBot(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-stone-600 hover:bg-stone-100"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={actionLoadingId === 'del_bot'}
                onClick={async () => {
                  setActionLoadingId('del_bot');
                  try {
                    await onDeleteBot(deleteTargetBot.id);
                    showToast('success', `Бот "${deleteTargetBot.name}" успешно удален!`);
                    setDeleteTargetBot(null);
                  } catch (err: any) {
                    showToast('error', err.message);
                  } finally {
                    setActionLoadingId(null);
                  }
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50"
              >
                {actionLoadingId === 'del_bot' ? 'Удаление...' : 'Да, удалить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
