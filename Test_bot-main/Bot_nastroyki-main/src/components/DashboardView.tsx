import React, { useState } from 'react';
import { 
  Users, 
  GitBranch, 
  Send, 
  Layers, 
  ShieldCheck, 
  ArrowUpRight, 
  CheckCircle2, 
  AlertTriangle,
  Play,
  Terminal,
  Activity,
  HardDrive,
  KeyRound,
  Megaphone,
  ShieldAlert,
  Sparkles,
  MessageSquare,
  Unlink,
  Ban,
  Clock,
  ExternalLink,
  Copy,
  Check,
  XCircle,
  FileText,
  RefreshCw,
  Zap
} from 'lucide-react';
import { SystemStatus, BotUser, DeepAuditResult } from '../types';
import { DatabaseStatus } from './DatabaseStatus';
import { SyncHealthWidget } from './SyncHealthWidget';
import { deepAuditAndForceSync, runGatewayPass } from '../services/api';

interface DashboardViewProps {
  status: SystemStatus | null;
  users?: BotUser[];
  onNavigate: (tab: string) => void;
  onSyncChannel: () => void;
  onSyncGit: () => void;
  onUnblockUser?: (id: string) => Promise<void>;
  onTerminateUser?: (id: string) => Promise<any>;
  onSyncAllChannelSubscribers?: () => Promise<any>;
  onSyncCentralToSubscribers?: () => Promise<any>;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  status,
  users = [],
  onNavigate,
  onSyncChannel,
  onSyncGit,
  onUnblockUser,
  onTerminateUser,
  onSyncAllChannelSubscribers,
  onSyncCentralToSubscribers,
}) => {
  const activeGit = status?.gitSources?.activeSource;
  const activeBot = status?.bots?.activeBot;
  const isGitConnected = activeGit?.status === 'connected';
  const isBotConnected = activeBot?.status === 'connected';
  const nodesCount = status?.centralFile?.nodesCount ?? 4;
  const pendingFeedbackCount = status?.counts?.pendingFeedbackCount ?? 0;

  const [copiedSubId, setCopiedSubId] = useState<string | null>(null);
  const [actionProcessingId, setActionProcessingId] = useState<string | null>(null);
  const [dashboardActionNotice, setDashboardActionNotice] = useState<string | null>(null);
  const [isChannelSyncing, setIsChannelSyncing] = useState(false);
  const [isCentralSyncing, setIsCentralSyncing] = useState(false);
  const [isDeepAuditing, setIsDeepAuditing] = useState(false);
  const [isRunningGatewayPass, setIsRunningGatewayPass] = useState(false);
  const [deepAuditReport, setDeepAuditReport] = useState<DeepAuditResult | null>(null);

  const handleCopyLink = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSubId(id);
    setTimeout(() => setCopiedSubId(null), 2500);
  };

  const handleRunGatewayPass = async () => {
    setIsRunningGatewayPass(true);
    setDashboardActionNotice(null);
    try {
      const res = await runGatewayPass();
      setDashboardActionNotice(res.message || 'Проход шлюза успешно выполнен!');
      onSyncChannel();
    } catch (err: any) {
      alert(err.message || 'Ошибка прохода шлюза');
    } finally {
      setIsRunningGatewayPass(false);
    }
  };

  const handleDeepAuditForceSync = async () => {
    setIsDeepAuditing(true);
    setDashboardActionNotice(null);
    try {
      const res = await deepAuditAndForceSync();
      setDeepAuditReport(res.audit);
      setDashboardActionNotice(res.message);
      onSyncChannel(); // refresh parent state
    } catch (err: any) {
      alert(err.message || 'Ошибка глубокого аудита');
    } finally {
      setIsDeepAuditing(false);
    }
  };

  const handleQuickUnblock = async (userId: string) => {
    if (!onUnblockUser) return;
    setActionProcessingId(userId);
    try {
      await onUnblockUser(userId);
      setDashboardActionNotice('Пользователь успешно разблокирован, доступ к центральным узлам восстановлен!');
      setTimeout(() => setDashboardActionNotice(null), 5000);
    } catch (e: any) {
      alert(e.message || 'Ошибка разблокировки пользователя');
    } finally {
      setActionProcessingId(null);
    }
  };

  const handleQuickTerminate = async (userId: string) => {
    if (!onTerminateUser) return;
    if (!confirm('Вы действительно хотите полностью аннулировать подписку пользователя? Доступ к узлам будет удален.')) {
      return;
    }
    setActionProcessingId(userId);
    try {
      await onTerminateUser(userId);
      setDashboardActionNotice('Подписка пользователя аннулирована!');
      setTimeout(() => setDashboardActionNotice(null), 5000);
    } catch (e: any) {
      alert(e.message || 'Ошибка аннулирования');
    } finally {
      setActionProcessingId(null);
    }
  };

  const handleSyncChannelMembers = async () => {
    if (!onSyncAllChannelSubscribers) return;
    setIsChannelSyncing(true);
    try {
      const res = await onSyncAllChannelSubscribers();
      setDashboardActionNotice(res?.message || 'Все подписчики и администраторы Telegram канала успешно синхронизированы!');
      setTimeout(() => setDashboardActionNotice(null), 6000);
    } catch (e: any) {
      alert(e.message || 'Ошибка синхронизации подписчиков канала');
    } finally {
      setIsChannelSyncing(false);
    }
  };

  const handleSyncCentral = async () => {
    if (!onSyncCentralToSubscribers) return;
    setIsCentralSyncing(true);
    try {
      const res = await onSyncCentralToSubscribers();
      setDashboardActionNotice(res?.message || 'Центральная подписка перенесена по всем активным файлам подписчиков!');
      setTimeout(() => setDashboardActionNotice(null), 6000);
    } catch (e: any) {
      alert(e.message || 'Ошибка переноса из центрального источника');
    } finally {
      setIsCentralSyncing(false);
    }
  };

  // 3-Tier Categorization of users
  const allUsers = users;

  // Tier 1: Channel membership left / bot inactive (auto-revert upon join)
  const tier1Users = allUsers.filter(
    (u) => u.channelMembership === 'left' || u.status === 'channel_inactive' || u.status === 'bot_blocked' || u.status === 'unsubscribed'
  );

  // Tier 2: Multi-device temporary block (mutedUntil in future or muted)
  const tier2Users = allUsers.filter(
    (u) => (u.status === 'muted' || (u.mutedUntil && new Date(u.mutedUntil) > new Date())) && !u.isBlocked
  );

  // Tier 3: Permanent block (isBlocked or deviceViolationAttempts >= 3)
  const tier3Users = allUsers.filter(
    (u) => u.isBlocked || u.status === 'blocked' || (u.deviceViolationAttempts && u.deviceViolationAttempts >= 3)
  );

  // Filter restricted or pending users for the table
  const restrictedUsers = allUsers.filter(
    (u) =>
      u.isBlocked ||
      u.status === 'blocked' ||
      u.status === 'muted' ||
      (u.mutedUntil && new Date(u.mutedUntil) > new Date()) ||
      u.channelMembership === 'left' ||
      u.status === 'channel_inactive' ||
      u.status === 'bot_blocked' ||
      u.status === 'unsubscribed' ||
      u.pendingUnblockRequest
  );

  const getRemainingTimeText = (u: BotUser) => {
    if (u.isBlocked || u.status === 'blocked' || (u.deviceViolationAttempts && u.deviceViolationAttempts >= 3)) {
      return 'Перманентно (требуется ручная разблокировка в Обратной связи)';
    }
    if (u.mutedUntil) {
      const remainingMs = new Date(u.mutedUntil).getTime() - Date.now();
      if (remainingMs > 0) {
        const hours = Math.floor(remainingMs / (1000 * 60 * 60));
        const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
        return `Осталось ~${hours} ч. ${minutes} мин. (до ${new Date(u.mutedUntil).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })})`;
      }
      return 'Срок временного бана истек';
    }
    if (u.channelMembership === 'left' || u.status === 'channel_inactive' || u.status === 'bot_blocked') {
      return 'До возврата в канал (авто-восстановление узлов)';
    }
    return 'Активен';
  };

  const getBlockReasonText = (u: BotUser) => {
    if (u.blockedReason) return u.blockedReason;
    if (u.subscriptionStatusReason) return u.subscriptionStatusReason;
    if (u.deviceViolationAttempts && u.deviceViolationAttempts >= 3) {
      return 'Превышен лимит (3/3 попыток подключения 2-го устройства)';
    }
    if (u.status === 'muted' || u.mutedUntil) {
      return `Временный блок: попытка подключения 2-го устройства (Штраф ${u.deviceViolationAttempts || 1}/3)`;
    }
    if (u.channelMembership === 'left' || u.status === 'channel_inactive') {
      return 'Отписка от обязательного Telegram канала';
    }
    if (u.status === 'bot_blocked') {
      return 'Блокировка или удаление Telegram бота';
    }
    return 'Нарушение правил доступа';
  };

  return (
    <div id="dashboard-container" className="space-y-6">
      {/* Top Banner */}
      <div id="status-resolution-banner" className="bg-emerald-50 border border-emerald-200/80 rounded-2xl p-5 text-emerald-900 shadow-xs">
        <div className="flex items-start space-x-3.5">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h3 className="text-base font-bold text-emerald-900">
              Система полностью активна: Multi-Bot, Multi-Git & Управление доступом
            </h3>
            <p className="text-xs text-emerald-800 leading-relaxed">
              API ботов и источников Git сохраняются устойчиво. Бот привязан к каналу <strong>{activeBot?.channels?.[0]?.id || '@puls_channel'}</strong> с правами администратора. Реализованы подписки-исключения, обрыв сети (Mute/Пауза), воронка с выбором HAPP (crypt5) и INCY (прямой VLESS RAW), а также шаблоны узлов-заглушек при отписке.
            </p>
          </div>
        </div>
      </div>

      {/* Database Connectivity & Real-Time Read/Write Status Card */}
      <DatabaseStatus onNavigateToSettings={() => onNavigate('settings')} />

      {/* Pending Unbind Alert Banner if any */}
      {pendingFeedbackCount > 0 && (
        <div
          onClick={() => onNavigate('feedback')}
          className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex items-center justify-between cursor-pointer hover:bg-amber-100/70 transition-colors shadow-xs"
        >
          <div className="flex items-center space-x-3">
            <div className="h-9 w-9 rounded-xl bg-amber-500 text-stone-950 flex items-center justify-center font-bold">
              <Unlink className="h-5 w-5" />
            </div>
            <div>
              <span className="font-bold text-amber-950 text-sm block">
                {pendingFeedbackCount} {pendingFeedbackCount === 1 ? 'запрос' : 'запроса'} на отвязку устройства от пользователей!
              </span>
              <span className="text-xs text-amber-800">
                Пользователи отправили причину через бота и ожидают сброса привязки и лимитов. Нажмите для перехода в «Обратную связь».
              </span>
            </div>
          </div>
          <span className="text-xs font-bold text-amber-900 px-3 py-1.5 rounded-lg bg-amber-200 hover:bg-amber-300 transition-colors shrink-0">
            Перейти к заявкам →
          </span>
        </div>
      )}

      {/* Visual Sync Health & Consistency Widget */}
      <SyncHealthWidget 
        onNavigateToUsers={() => onNavigate('users')} 
        onRefreshParent={onSyncChannel} 
      />

      {/* Quick Synchronization Toolbar */}
      <div id="quick-sync-toolbar" className="bg-white border border-stone-200 rounded-2xl p-4 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="h-9 w-9 rounded-xl bg-stone-900 text-amber-400 flex items-center justify-center shrink-0">
            <RefreshCw className="h-4 w-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-stone-900">
              Быстрая синхронизация системы
            </h4>
            <p className="text-xs text-stone-500">
              Мгновенный перенос центральной конфигурации и актуализация подписчиков из Telegram канала
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            id="dashboard-audit-force-sync-btn"
            onClick={handleDeepAuditForceSync}
            disabled={isDeepAuditing || isCentralSyncing || isChannelSyncing || isRunningGatewayPass}
            className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-amber-400 text-xs font-bold transition-all shadow-xs disabled:opacity-50 cursor-pointer active:scale-95"
            title="Запустить полную проверку глубокой синхронизации между центральным репозиторием и всеми подписчиками (минуя кэш)"
          >
            <Zap className={`h-4 w-4 text-amber-400 ${isDeepAuditing ? 'animate-bounce' : ''}`} />
            <span>{isDeepAuditing ? 'Аудит и запись...' : 'Аудит и принудительная синхронизация'}</span>
          </button>

          <button
            id="dashboard-run-gateway-pass-btn"
            onClick={handleRunGatewayPass}
            disabled={isRunningGatewayPass || isDeepAuditing}
            className="inline-flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-xs disabled:opacity-50 cursor-pointer active:scale-95"
            title="Запустить немедленный проход шлюза через белые списки (обход планового расписания)"
          >
            <ShieldCheck className={`h-3.5 w-3.5 text-indigo-200 ${isRunningGatewayPass ? 'animate-spin' : ''}`} />
            <span>{isRunningGatewayPass ? 'Проход шлюза...' : 'Run Gateway Pass'}</span>
          </button>

          <button
            id="dashboard-sync-central-btn"
            onClick={handleSyncCentral}
            disabled={isCentralSyncing || isDeepAuditing}
            className="inline-flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
            title="Перенести текущую центральную конфигурацию по всем активным файлам подписок пользователей"
          >
            <Sparkles className={`h-3.5 w-3.5 ${isCentralSyncing ? 'animate-spin text-amber-300' : ''}`} />
            <span>{isCentralSyncing ? 'Перенос узлов...' : 'Синхронизировать в подписки'}</span>
          </button>

          <button
            id="dashboard-sync-channel-btn"
            onClick={handleSyncChannelMembers}
            disabled={isChannelSyncing || isDeepAuditing}
            className="inline-flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
            title="Опросить абсолютно всех участников и администраторов Telegram канала"
          >
            <Users className={`h-3.5 w-3.5 ${isChannelSyncing ? 'animate-spin' : ''}`} />
            <span>{isChannelSyncing ? 'Опрос канала...' : 'Синхронизировать подписчиков'}</span>
          </button>

          <button
            id="dashboard-sync-git-btn"
            onClick={onSyncGit}
            disabled={isDeepAuditing}
            className="inline-flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-semibold transition-colors shadow-xs cursor-pointer disabled:opacity-50"
            title="Стянуть изменения из подключенного Git репозитория"
          >
            <GitBranch className="h-3.5 w-3.5 text-stone-600" />
            <span>Обновить из Git</span>
          </button>

          <button
            id="dashboard-view-logs-btn"
            onClick={() => onNavigate('logs')}
            className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl border border-stone-200 hover:bg-stone-100 text-stone-700 text-xs font-semibold transition-colors cursor-pointer"
            title="Открыть подробный журнал процессов"
          >
            <Terminal className="h-3.5 w-3.5 text-stone-600" />
            <span>Журнал логов</span>
          </button>
        </div>
      </div>

      {/* Deep Audit Report Summary Card if performed */}
      {deepAuditReport && (
        <div className="p-4 rounded-2xl bg-indigo-50/80 border border-indigo-200 text-indigo-950 text-xs shadow-xs animate-fade-in flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-start space-x-3">
            <CheckCircle2 className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-sm text-indigo-900 block">
                Глубокий аудит и синхронизация завершены ({new Date(deepAuditReport.completedAt).toLocaleTimeString('ru-RU')}):
              </span>
              <p className="text-indigo-800 mt-0.5">
                Проверено и актуализировано {deepAuditReport.syncedUsers} подписчиков и {deepAuditReport.syncedExclusions} исключений.
                Записано {deepAuditReport.pushedCount} файлов в каталог subs/ (минуя кэш).
              </p>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                <span className="px-2 py-0.5 rounded-md bg-indigo-200/70 font-semibold text-indigo-900">
                  Узлов в центральном источнике: {deepAuditReport.centralNodesCount}
                </span>
                <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-semibold">
                  Записано в subs/: {deepAuditReport.pushedCount}
                </span>
                <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 font-bold">
                  Время: {deepAuditReport.durationMs} мс
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={() => onNavigate('logs')}
              className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition-colors cursor-pointer"
            >
              Подробные логи →
            </button>
            <button
              onClick={() => setDeepAuditReport(null)}
              className="px-2.5 py-1.5 rounded-xl border border-indigo-200 bg-white text-indigo-800 font-bold cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* KPI Metrics Grid */}
      <div id="kpi-grid" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Users & Channel Metric */}
        <div id="metric-users" className="bg-white border border-stone-200 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">
              Подписчики и Доступ
            </span>
            <div className="h-8 w-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline space-x-2">
            <span className="text-3xl font-bold text-stone-900">
              {status?.counts?.totalUsers ?? 4}
            </span>
            <span className="text-xs text-stone-500">
              в базе / {status?.counts?.channelMembers ?? 3} в канале
            </span>
          </div>
          <p className="mt-2 text-xs text-emerald-600 font-medium flex items-center space-x-1">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>{status?.counts?.activeSubscribers ?? 3} активных подписок</span>
          </p>
        </div>

        {/* 2. Central Subscription Nodes */}
        <div id="metric-nodes" className="bg-white border border-stone-200 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">
              Центральная подписка
            </span>
            <div className="h-8 w-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Layers className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline space-x-2">
            <span className="text-3xl font-bold text-stone-900">{nodesCount}</span>
            <span className="text-xs text-stone-500">активных серверов</span>
          </div>
          <p className="mt-2 text-xs text-stone-600 font-medium flex items-center space-x-1">
            <Activity className="h-3.5 w-3.5 text-stone-400" />
            <span>HAPP (crypt5) + INCY (qsen.ru)</span>
          </p>
        </div>

        {/* 3. Git Sources Metric */}
        <div id="metric-gitverse" className="bg-white border border-stone-200 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">
              Источники Git ({status?.gitSources?.total || 2})
            </span>
            <div className="h-8 w-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <GitBranch className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-base font-bold text-stone-900 block truncate">
              {activeGit?.name || 'Основной репозиторий'}
            </span>
            <div className="flex items-center space-x-1 mt-1 text-xs text-emerald-600 font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>{activeGit?.provider.toUpperCase()}: {activeGit?.repository}</span>
            </div>
          </div>
          <p className="mt-2 text-xs text-stone-500">
            {status?.gitSources?.connectedCount || 1} из {status?.gitSources?.total || 2} подключено
          </p>
        </div>

        {/* 4. Telegram Bots Metric */}
        <div id="metric-bot" className="bg-white border border-stone-200 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">
              Telegram Боты ({status?.bots?.total || 2})
            </span>
            <div className="h-8 w-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
              <Send className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-base font-bold text-stone-900 block">
              @{activeBot?.username || 'puls_access_bot'}
            </span>
            <div className="flex items-center space-x-1 mt-1 text-xs text-emerald-600 font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Админ в канале {activeBot?.channels?.[0]?.id || '@puls_channel'}</span>
            </div>
          </div>
          <p className="mt-2 text-xs text-stone-500">
            Воронка и авто-проверка активны
          </p>
        </div>
      </div>

      {/* Action Notification */}
      {dashboardActionNotice && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center justify-between shadow-xs">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span className="font-semibold">{dashboardActionNotice}</span>
          </div>
          <button onClick={() => setDashboardActionNotice(null)} className="text-emerald-700 font-bold cursor-pointer">✕</button>
        </div>
      )}

      {/* DEDICATED SECTION: Analytics on Blocked Users & Request Unblock Management Table */}
      <div id="blocked-users-analytics-section" className="bg-white border border-stone-200 rounded-2xl p-6 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 pb-4">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center">
              <Ban className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-stone-900">
                Аналитика заблокированных пользователей и управление разблокировкой
              </h3>
              <p className="text-xs text-stone-500">
                3-уровневая система ограничений: авто-возврат при вступлении в канал, временный блок 2-го устройства и перманентный бан
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => onNavigate('feedback')}
              className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer"
            >
              <MessageSquare className="h-3.5 w-3.5 text-amber-700" />
              <span>Заявки в Feedback ({pendingFeedbackCount})</span>
            </button>
            <button
              onClick={() => onNavigate('users')}
              className="px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold transition-colors cursor-pointer"
            >
              Все пользователи →
            </button>
          </div>
        </div>

        {/* 3-Tier Analytics Breakdown Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Tier 1 Card */}
          <div className="p-4 rounded-xl bg-stone-50 border border-stone-200/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-stone-700 uppercase tracking-wider">
                Уровень 1: Отписка / Бот
              </span>
              <span className="px-2 py-0.5 rounded-full bg-stone-200 text-stone-800 text-[11px] font-bold">
                {tier1Users.length} польз.
              </span>
            </div>
            <p className="text-xs text-stone-600">
              Выход из канала или удаление бота. Узлы заменяются заглушкой Источника 1.
            </p>
            <div className="pt-2 border-t border-stone-200/60 flex items-center justify-between text-[11px] text-stone-500 font-medium">
              <span>Срок: Авто-возврат при входе</span>
              <span className="text-emerald-700 font-bold">0% потерь</span>
            </div>
          </div>

          {/* Tier 2 Card */}
          <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                Уровень 2: Временный блок (N ч.)
              </span>
              <span className="px-2 py-0.5 rounded-full bg-amber-200 text-amber-950 text-[11px] font-bold">
                {tier2Users.length} польз.
              </span>
            </div>
            <p className="text-xs text-amber-800">
              Попытка подключения со 2-го устройства. Блокировка на 24ч с начислением штрафа (до 3-х попыток).
            </p>
            <div className="pt-2 border-t border-amber-200/60 flex items-center justify-between text-[11px] text-amber-700 font-medium">
              <span>Лимит: 3 попытки до бана</span>
              <span className="text-amber-900 font-bold">Штрафной пул</span>
            </div>
          </div>

          {/* Tier 3 Card */}
          <div className="p-4 rounded-xl bg-rose-50/80 border border-rose-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-rose-900 uppercase tracking-wider">
                Уровень 3: Перманентный бан
              </span>
              <span className="px-2 py-0.5 rounded-full bg-rose-200 text-rose-950 text-[11px] font-bold">
                {tier3Users.length} польз.
              </span>
            </div>
            <p className="text-xs text-rose-800">
              Превышение 3-х попыток мульти-доступа или ручной флаг. Требуется вмешательство администратора в Feedback.
            </p>
            <div className="pt-2 border-t border-rose-200/60 flex items-center justify-between text-[11px] text-rose-700 font-medium">
              <span>Срок: Бессрочно</span>
              <span className="text-rose-900 font-bold">Ручной разбан</span>
            </div>
          </div>
        </div>

        {/* 'Request Unblock' Management Table */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-stone-700 flex items-center space-x-1.5">
              <span>Таблица управления разблокировкой и ссылки на файлы подписок ({restrictedUsers.length})</span>
            </h4>
            <span className="text-[11px] text-stone-400">Прямые ссылки на sub-файлы GitVerse</span>
          </div>

          {restrictedUsers.length === 0 ? (
            <div className="p-6 rounded-xl border border-dashed border-stone-200 text-center bg-stone-50/50">
              <CheckCircle2 className="h-6 w-6 text-emerald-600 mx-auto mb-2" />
              <p className="text-xs text-stone-600 font-medium">
                В данный момент нет заблокированных пользователей. Все подписчики активны и синхронизированы с центральным источником.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-stone-200 rounded-xl">
              <table className="w-full text-left text-xs text-stone-700">
                <thead className="bg-stone-50 text-stone-500 font-semibold border-b border-stone-200">
                  <tr>
                    <th className="px-4 py-3">Пользователь</th>
                    <th className="px-4 py-3">Уровень / Штраф</th>
                    <th className="px-4 py-3">Причина блокировки</th>
                    <th className="px-4 py-3">Остаток бана</th>
                    <th className="px-4 py-3">Файл подписки (Sub-File)</th>
                    <th className="px-4 py-3 text-right">Действия</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {restrictedUsers.map((u) => {
                    const isProc = actionProcessingId === u.id;
                    const tierLabel = (u.isBlocked || (u.deviceViolationAttempts && u.deviceViolationAttempts >= 3))
                      ? 'Уровень 3 (Перманентный)'
                      : (u.status === 'muted' || u.mutedUntil)
                      ? 'Уровень 2 (Временный)'
                      : 'Уровень 1 (Отписка/Бот)';
                    
                    const tierColor = tierLabel.includes('3')
                      ? 'bg-rose-100 text-rose-800 border-rose-200'
                      : tierLabel.includes('2')
                      ? 'bg-amber-100 text-amber-900 border-amber-200'
                      : 'bg-stone-100 text-stone-800 border-stone-200';

                    const hasPendingReq = u.pendingUnblockRequest;

                    return (
                      <tr key={u.id} className="hover:bg-stone-50/60 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-bold text-stone-900 flex items-center space-x-1.5">
                            <span>{u.firstName} {u.lastName || ''}</span>
                            {hasPendingReq && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">
                                Заявка
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-stone-400">
                            {u.username ? `@${u.username}` : `ID: ${u.telegramId}`}
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <div className="space-y-1">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${tierColor}`}>
                              {tierLabel}
                            </span>
                            {u.deviceViolationAttempts !== undefined && (
                              <div className="text-[10px] text-stone-500 font-mono">
                                Попытки: <strong>{u.deviceViolationAttempts}/3</strong>
                              </div>
                            )}
                          </div>
                        </td>

                        <td className="px-4 py-3 max-w-xs">
                          <p className="text-stone-800 font-medium line-clamp-2">
                            {getBlockReasonText(u)}
                          </p>
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center space-x-1 text-stone-600 font-medium">
                            <Clock className="h-3.5 w-3.5 text-stone-400 shrink-0" />
                            <span className="text-[11px]">{getRemainingTimeText(u)}</span>
                          </div>
                        </td>

                        {/* Direct link to specific sub-file */}
                        <td className="px-4 py-3">
                          <div className="space-y-1">
                            <div className="flex items-center space-x-1.5">
                              <FileText className="h-3 w-3 text-stone-400 shrink-0" />
                              <span className="font-mono text-[11px] text-stone-700 truncate max-w-[140px]" title={u.gitFilePath || 'sub-file'}>
                                {u.gitFilePath || `subs/user_${u.telegramId}.txt`}
                              </span>
                            </div>
                            <div className="flex items-center space-x-1.5 pt-0.5">
                              {u.gitRawUrl ? (
                                <a
                                  href={u.gitRawUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[10px] text-sky-600 hover:text-sky-800 flex items-center space-x-0.5 font-semibold"
                                  title="Открыть сырой файл подписки в GitVerse"
                                >
                                  <span>Raw файл</span>
                                  <ExternalLink className="h-2.5 w-2.5" />
                                </a>
                              ) : (
                                <span className="text-[10px] text-stone-400">URL формируется</span>
                              )}
                              {u.gitRawUrl && (
                                <button
                                  onClick={() => handleCopyLink(u.gitRawUrl!, u.id)}
                                  className="text-[10px] text-stone-500 hover:text-stone-800 p-0.5 rounded cursor-pointer"
                                  title="Скопировать ссылку на подписку"
                                >
                                  {copiedSubId === u.id ? (
                                    <Check className="h-3 w-3 text-emerald-600" />
                                  ) : (
                                    <Copy className="h-3 w-3" />
                                  )}
                                </button>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Management Actions */}
                        <td className="px-4 py-3 text-right whitespace-nowrap space-x-1.5">
                          {hasPendingReq ? (
                            <button
                              onClick={() => onNavigate('feedback')}
                              className="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-xs shadow-xs cursor-pointer inline-flex items-center space-x-1"
                              title="Перейти к заявке на разблокировку в разделе Обратной связи"
                            >
                              <span>В Feedback →</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => handleQuickUnblock(u.id)}
                              disabled={isProc}
                              className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs cursor-pointer inline-flex items-center space-x-1 disabled:opacity-50"
                              title="Разблокировать пользователя и вернуть на центральные узлы"
                            >
                              <ShieldCheck className="h-3 w-3" />
                              <span>{isProc ? '...' : 'Разблокировать'}</span>
                            </button>
                          )}

                          <button
                            onClick={() => handleQuickTerminate(u.id)}
                            disabled={isProc}
                            className="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 hover:text-rose-900 border border-rose-200 font-bold text-xs cursor-pointer inline-flex items-center space-x-1 disabled:opacity-50"
                            title="Полностью аннулировать подписку пользователя"
                          >
                            <XCircle className="h-3 w-3" />
                            <span>Terminate</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Quick Action Navigation Panels */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Panel 1: Feedback & Device Unbind Requests */}
        <div
          onClick={() => onNavigate('feedback')}
          className="bg-white border border-stone-200 rounded-2xl p-5 shadow-xs hover:border-amber-400 cursor-pointer transition-all flex flex-col justify-between group"
        >
          <div>
            <div className="flex items-center justify-between">
              <div className="h-9 w-9 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center border border-amber-200/40">
                <MessageSquare className="h-5 w-5" />
              </div>
              <ArrowUpRight className="h-4 w-4 text-stone-400 group-hover:text-stone-900 transition-colors" />
            </div>
            <h4 className="font-bold text-stone-900 text-sm mt-3">Обратная связь и отвязка</h4>
            <p className="text-xs text-stone-500 mt-1">
              Заявки пользователей на отвязку устройств с указанием причины, отправленные через бота.
            </p>
          </div>
          <span className="text-xs font-semibold text-amber-700 mt-4 block">
            Заявки ({status?.counts?.pendingFeedbackCount ?? 0} новых) →
          </span>
        </div>

        {/* Panel 2: Exclusions */}
        <div
          onClick={() => onNavigate('exclusions')}
          className="bg-white border border-stone-200 rounded-2xl p-5 shadow-xs hover:border-amber-400 cursor-pointer transition-all flex flex-col justify-between group"
        >
          <div>
            <div className="flex items-center justify-between">
              <div className="h-9 w-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
                <KeyRound className="h-5 w-5" />
              </div>
              <ArrowUpRight className="h-4 w-4 text-stone-400 group-hover:text-stone-900 transition-colors" />
            </div>
            <h4 className="font-bold text-stone-900 text-sm mt-3">Подписки-Исключения</h4>
            <p className="text-xs text-stone-500 mt-1">
              Бессрочные подписки без надобности членства в канале. Синхронизируются с центральным файлом.
            </p>
          </div>
          <span className="text-xs font-semibold text-amber-700 mt-4 block">
            Управлять исключениями ({status?.counts?.exclusionsCount ?? 2}) →
          </span>
        </div>

        {/* Panel 3: Broadcast */}
        <div
          onClick={() => onNavigate('broadcast')}
          className="bg-white border border-stone-200 rounded-2xl p-5 shadow-xs hover:border-sky-400 cursor-pointer transition-all flex flex-col justify-between group"
        >
          <div>
            <div className="flex items-center justify-between">
              <div className="h-9 w-9 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center">
                <Megaphone className="h-5 w-5" />
              </div>
              <ArrowUpRight className="h-4 w-4 text-stone-400 group-hover:text-stone-900 transition-colors" />
            </div>
            <h4 className="font-bold text-stone-900 text-sm mt-3">Рассылка и сообщения</h4>
            <p className="text-xs text-stone-500 mt-1">
              Отправка адресных или массовых сообщений в Telegram бот с медиа и инлайн-кнопками.
            </p>
          </div>
          <span className="text-xs font-semibold text-sky-700 mt-4 block">
            Создать рассылку →
          </span>
        </div>

        {/* Panel 4: Templates & Fallbacks */}
        <div
          onClick={() => onNavigate('templates')}
          className="bg-white border border-stone-200 rounded-2xl p-5 shadow-xs hover:border-stone-400 cursor-pointer transition-all flex flex-col justify-between group"
        >
          <div>
            <div className="flex items-center justify-between">
              <div className="h-9 w-9 rounded-xl bg-stone-100 text-stone-800 flex items-center justify-center">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <ArrowUpRight className="h-4 w-4 text-stone-400 group-hover:text-stone-900 transition-colors" />
            </div>
            <h4 className="font-bold text-stone-900 text-sm mt-3">Шаблоны узлов-заглушек</h4>
            <p className="text-xs text-stone-500 mt-1">
              Настройка текстов и названий фиктивных узлов при отписке от канала, муте или блокировке.
            </p>
          </div>
          <span className="text-xs font-semibold text-stone-800 mt-4 block">
            Настроить шаблоны →
          </span>
        </div>
      </div>
    </div>
  );
};
