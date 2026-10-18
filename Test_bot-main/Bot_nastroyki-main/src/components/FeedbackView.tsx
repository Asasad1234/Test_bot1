import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  Unlink,
  CheckCircle2,
  Clock,
  Laptop,
  Search,
  RefreshCw,
  ExternalLink,
  Trash2,
  AlertCircle,
  ShieldAlert,
  Smartphone,
  Send,
  UserCheck,
  ShieldCheck,
  Ban,
  AlertTriangle,
  XCircle,
  Bot,
  Sparkles,
  Zap,
  Play,
  Pause
} from 'lucide-react';
import { FeedbackRequest } from '../types';
import { 
  fetchFeedbackRequests, 
  resolveFeedbackUnblockAndUnbind, 
  resolveFeedbackUnblock, 
  resolveFeedbackUnbind, 
  terminateFeedbackUser,
  deleteFeedbackRequest,
  generateBotUnblockRequest
} from '../services/api';

interface FeedbackViewProps {
  onRefreshStats?: () => void;
}

export const FeedbackView: React.FC<FeedbackViewProps> = ({ onRefreshStats }) => {
  const [requests, setRequests] = useState<FeedbackRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'resolved' | 'unblock'>('all');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);
  const [isGeneratingBot, setIsGeneratingBot] = useState(false);
  const [autoSimulateBot, setAutoSimulateBot] = useState(false);
  const [botScenario, setBotScenario] = useState<'bot_deleted' | 'device_binding' | 'limit_exceeded' | 'random'>('random');
  const autoSimulateTimerRef = useRef<any>(null);

  const loadRequests = async () => {
    setIsLoading(true);
    try {
      const data = await fetchFeedbackRequests();
      setRequests(Array.isArray(data) ? data : data.requests || []);
    } catch (err) {
      console.error('Failed to load feedback requests:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const handleGenerateBotRequest = async (scenarioOverride?: 'bot_deleted' | 'device_binding' | 'limit_exceeded') => {
    setIsGeneratingBot(true);
    try {
      const scenarioParam = scenarioOverride || (botScenario === 'random' ? undefined : botScenario);
      const res = await generateBotUnblockRequest(scenarioParam);
      if (res.request) {
        setRequests((prev) => [res.request, ...prev.filter((r) => r.id !== res.request.id)]);
        setActionSuccessMsg(
          `🤖 Новая заявка на разблокировку от @${res.request.username || res.request.telegramId} успешно поступила из бота!`
        );
        if (onRefreshStats) onRefreshStats();
        setTimeout(() => setActionSuccessMsg(null), 6000);
      }
    } catch (err: any) {
      alert(err.message || 'Ошибка генерации заявки из бота');
    } finally {
      setIsGeneratingBot(false);
    }
  };

  // Background auto-generation simulator if enabled
  useEffect(() => {
    if (autoSimulateBot) {
      autoSimulateTimerRef.current = setInterval(() => {
        handleGenerateBotRequest();
      }, 35000);
    } else {
      if (autoSimulateTimerRef.current) {
        clearInterval(autoSimulateTimerRef.current);
        autoSimulateTimerRef.current = null;
      }
    }
    return () => {
      if (autoSimulateTimerRef.current) {
        clearInterval(autoSimulateTimerRef.current);
      }
    };
  }, [autoSimulateBot, botScenario]);

  const handleUnblockAndUnbind = async (reqItem: FeedbackRequest) => {
    setProcessingId(reqItem.id);
    try {
      const res = await resolveFeedbackUnblockAndUnbind(reqItem.id);
      setActionSuccessMsg(
        res.message ||
          `Пользователь @${reqItem.username || reqItem.telegramId} успешно разблокирован, а устройство отвязано!`
      );
      setRequests((prev) =>
        prev.map((r) => (r.id === reqItem.id ? { ...r, status: 'resolved', resolvedAt: new Date().toISOString() } : r))
      );
      if (onRefreshStats) onRefreshStats();
      setTimeout(() => setActionSuccessMsg(null), 6000);
    } catch (err: any) {
      alert(err.message || 'Не удалось разблокировать и отвязать пользователя');
    } finally {
      setProcessingId(null);
    }
  };

  const handleUnblockOnly = async (reqItem: FeedbackRequest) => {
    setProcessingId(reqItem.id);
    try {
      const res = await resolveFeedbackUnblock(reqItem.id);
      setActionSuccessMsg(
        res.message ||
          `Подписка пользователя @${reqItem.username || reqItem.telegramId} успешно разблокирована!`
      );
      setRequests((prev) =>
        prev.map((r) => (r.id === reqItem.id ? { ...r, status: 'resolved', resolvedAt: new Date().toISOString() } : r))
      );
      if (onRefreshStats) onRefreshStats();
      setTimeout(() => setActionSuccessMsg(null), 6000);
    } catch (err: any) {
      alert(err.message || 'Не удалось разблокировать пользователя');
    } finally {
      setProcessingId(null);
    }
  };

  const handleResolveUnbind = async (reqItem: FeedbackRequest) => {
    setProcessingId(reqItem.id);
    try {
      const res = await resolveFeedbackUnbind(reqItem.id);
      setActionSuccessMsg(
        res.message ||
          `Устройство пользователя @${reqItem.username || reqItem.telegramId} отвязано, лимит трафика сброшен!`
      );
      setRequests((prev) =>
        prev.map((r) => (r.id === reqItem.id ? { ...r, status: 'resolved', resolvedAt: new Date().toISOString() } : r))
      );
      if (onRefreshStats) onRefreshStats();
      setTimeout(() => setActionSuccessMsg(null), 5000);
    } catch (err: any) {
      alert(err.message || 'Не удалось обработать заявку на отвязку');
    } finally {
      setProcessingId(null);
    }
  };

  const handleTerminate = async (reqItem: FeedbackRequest) => {
    if (!confirm(`Вы действительно хотите полностью аннулировать подписку для @${reqItem.username || reqItem.telegramId}? Доступ к серверным узлам будет удален.`)) {
      return;
    }
    setProcessingId(reqItem.id);
    try {
      const res = await terminateFeedbackUser(reqItem.id);
      setActionSuccessMsg(
        res.message || `Подписка @${reqItem.username || reqItem.telegramId} успешно аннулирована (доступ удален)!`
      );
      setRequests((prev) =>
        prev.map((r) => (r.id === reqItem.id ? { ...r, status: 'resolved', resolvedAt: new Date().toISOString() } : r))
      );
      if (onRefreshStats) onRefreshStats();
      setTimeout(() => setActionSuccessMsg(null), 6000);
    } catch (err: any) {
      alert(err.message || 'Не удалось аннулировать подписку');
    } finally {
      setProcessingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить эту заявку из истории обратной связи?')) return;
    try {
      await deleteFeedbackRequest(id);
      setRequests((prev) => prev.filter((r) => r.id !== id));
      if (onRefreshStats) onRefreshStats();
    } catch (err: any) {
      alert(err.message || 'Ошибка удаления заявки');
    }
  };

  const filteredRequests = requests.filter((r) => {
    const matchesSearch =
      (r.username?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
      (r.firstName?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
      r.telegramId.toString().includes(searchQuery) ||
      (r.banReason?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
      (r.message || '').toLowerCase().includes(searchQuery.toLowerCase());

    if (statusFilter === 'pending') return matchesSearch && r.status === 'pending';
    if (statusFilter === 'resolved') return matchesSearch && r.status === 'resolved';
    if (statusFilter === 'unblock') return matchesSearch && r.type === 'unblock_request';
    return matchesSearch;
  });

  const pendingCount = requests.filter((r) => r.status === 'pending').length;
  const resolvedCount = requests.filter((r) => r.status === 'resolved').length;
  const unblockPendingCount = requests.filter((r) => r.type === 'unblock_request' && r.status === 'pending').length;

  return (
    <div id="feedback-view-container" className="space-y-6">
      {/* Header Overview Card */}
      <div id="feedback-header-card" className="bg-white border border-stone-200 rounded-2xl p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-start space-x-4">
            <div className="h-12 w-12 rounded-2xl bg-rose-500/10 text-rose-600 flex items-center justify-center shrink-0 border border-rose-200/50">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center space-x-3">
                <h2 className="text-xl font-bold text-stone-900">Обратная связь и заявки на разбан</h2>
                {unblockPendingCount > 0 && (
                  <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-rose-100 text-rose-800 border border-rose-300 animate-pulse">
                    {unblockPendingCount} заявок на разбан
                  </span>
                )}
              </div>
              <p className="text-xs text-stone-500 mt-1 max-w-2xl">
                Здесь отображаются заявки пользователей, заблокированных за нарушение правила «1 подписка = 1 устройство» или отписку от каналов, а также запросы на смену устройства. Вы можете в один клик <strong>разблокировать и отвязать устройство</strong>, после чего пользователю мгновенно восстанавливаются узлы центральной подписки.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              id="btn-refresh-feedback"
              onClick={loadRequests}
              disabled={isLoading}
              className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Обновить</span>
            </button>
          </div>
        </div>

        {/* Metrics Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5 pt-4 border-t border-stone-100 text-xs">
          <div className="p-3 rounded-xl bg-rose-50/70 border border-rose-200/70 flex items-center justify-between">
            <div>
              <span className="text-rose-700 block text-[11px] font-bold">Заявки на разбан</span>
              <span className="text-rose-900 font-bold text-base mt-0.5 block">{unblockPendingCount} активных</span>
            </div>
            <Ban className="h-5 w-5 text-rose-500" />
          </div>

          <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-200/70 flex items-center justify-between">
            <div>
              <span className="text-amber-700 block text-[11px] font-semibold">Всего ожидают решения</span>
              <span className="text-amber-900 font-bold text-base mt-0.5 block">{pendingCount}</span>
            </div>
            <Unlink className="h-5 w-5 text-amber-600" />
          </div>

          <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-200/70 flex items-center justify-between">
            <div>
              <span className="text-emerald-700 block text-[11px] font-semibold">Успешно решено</span>
              <span className="text-emerald-900 font-bold text-base mt-0.5 block">{resolvedCount}</span>
            </div>
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          </div>
        </div>
      </div>

      {/* Automated Bot Request Generator Panel */}
      <div id="bot-request-generator-panel" className="bg-gradient-to-br from-stone-900 via-stone-850 to-stone-900 border border-stone-800 rounded-2xl p-5 text-white shadow-md space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pb-3 border-b border-stone-800">
          <div className="flex items-start space-x-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                  <span>Автоматическая генерация заявок на разблокировку из бота</span>
                </h3>
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30">
                  Telegram Bot API
                </span>
              </div>
              <p className="text-xs text-stone-400 mt-0.5">
                Генерация входящих обращений от заблокированных пользователей по 3 типам блокировок с фиксацией никнейма, причины, времени и интерактивными кнопками разблокировки и отвязки.
              </p>
            </div>
          </div>

          {/* Auto-simulation toggle */}
          <div className="flex items-center space-x-2 bg-stone-800/80 px-3 py-1.5 rounded-xl border border-stone-700/60">
            <button
              type="button"
              id="btn-toggle-auto-simulate"
              onClick={() => setAutoSimulateBot(!autoSimulateBot)}
              className={`text-xs font-semibold flex items-center space-x-1.5 transition-colors ${
                autoSimulateBot ? 'text-amber-400' : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              {autoSimulateBot ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              <span>{autoSimulateBot ? 'Авто-прием: ВКЛ (каждые 35с)' : 'Включить авто-прием заявок'}</span>
            </button>
            <span className={`h-2 w-2 rounded-full ${autoSimulateBot ? 'bg-amber-400 animate-ping' : 'bg-stone-600'}`} />
          </div>
        </div>

        {/* Generator Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-stone-400 text-xs mr-1 font-medium">Сценарий:</span>
            <button
              type="button"
              onClick={() => setBotScenario('random')}
              className={`px-2.5 py-1 rounded-lg transition-all font-medium ${
                botScenario === 'random'
                  ? 'bg-amber-400 text-stone-950 font-bold shadow-xs'
                  : 'bg-stone-800 hover:bg-stone-700 text-stone-300'
              }`}
            >
              🎲 Любой сценарий
            </button>
            <button
              type="button"
              onClick={() => setBotScenario('bot_deleted')}
              className={`px-2.5 py-1 rounded-lg transition-all font-medium ${
                botScenario === 'bot_deleted'
                  ? 'bg-amber-400 text-stone-950 font-bold shadow-xs'
                  : 'bg-stone-800 hover:bg-stone-700 text-stone-300'
              }`}
            >
              1. Удалил бота / канал
            </button>
            <button
              type="button"
              onClick={() => setBotScenario('device_binding')}
              className={`px-2.5 py-1 rounded-lg transition-all font-medium ${
                botScenario === 'device_binding'
                  ? 'bg-amber-400 text-stone-950 font-bold shadow-xs'
                  : 'bg-stone-800 hover:bg-stone-700 text-stone-300'
              }`}
            >
              2. Привязка устройства
            </button>
            <button
              type="button"
              onClick={() => setBotScenario('limit_exceeded')}
              className={`px-2.5 py-1 rounded-lg transition-all font-medium ${
                botScenario === 'limit_exceeded'
                  ? 'bg-amber-400 text-stone-950 font-bold shadow-xs'
                  : 'bg-stone-800 hover:bg-stone-700 text-stone-300'
              }`}
            >
              3. Превышение лимита (бан)
            </button>
          </div>

          <button
            type="button"
            id="btn-generate-bot-request"
            onClick={() => handleGenerateBotRequest()}
            disabled={isGeneratingBot}
            className="inline-flex items-center justify-center space-x-2 px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-stone-950 font-bold transition-colors shadow-sm disabled:opacity-50 cursor-pointer shrink-0"
          >
            <Sparkles className={`h-4 w-4 ${isGeneratingBot ? 'animate-spin' : ''}`} />
            <span>{isGeneratingBot ? 'Генерация...' : '+ Сгенерировать заявку из бота'}</span>
          </button>
        </div>
      </div>

      {/* Success Notification Banner */}
      {actionSuccessMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center justify-between shadow-xs">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span className="font-medium">{actionSuccessMsg}</span>
          </div>
          <button onClick={() => setActionSuccessMsg(null)} className="text-emerald-700 hover:text-emerald-900 font-bold ml-4 cursor-pointer">
            ✕
          </button>
        </div>
      )}

      {/* Dynamic Unlock Request Panel (Priority attention section for unblock requests) */}
      {unblockPendingCount > 0 && (
        <div id="dynamic-unlock-request-panel" className="bg-rose-50/80 border-2 border-rose-300/80 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3.5">
            <div className="flex items-center space-x-2.5">
              <div className="h-8 w-8 rounded-xl bg-rose-600 text-white flex items-center justify-center font-bold">
                <ShieldAlert className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-rose-950">
                  Панель разблокировки подписчиков ({unblockPendingCount} ожидают решения)
                </h3>
                <p className="text-[11px] text-rose-800">
                  Заблокированные пользователи (Уровень 3 / Защита от 2-го устройства). Одобрение моментально возвращает пользователя на центральные узлы, а кнопка «Аннулировать» удаляет доступ.
                </p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-rose-200 text-rose-900 text-xs font-bold shrink-0">
              Срочные заявки
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
            {requests
              .filter((r) => r.type === 'unblock_request' && r.status === 'pending')
              .map((r) => {
                const isProcessing = processingId === r.id;
                const timestampStr = new Date(r.blockedAt || r.createdAt).toLocaleString('ru-RU');
                const nickname = r.username ? `@${r.username}` : r.firstName ? `${r.firstName}` : `ID: ${r.telegramId}`;

                return (
                  <div
                    key={`quick-${r.id}`}
                    className="bg-white border border-rose-200 rounded-xl p-4 shadow-xs flex flex-col justify-between space-y-3"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-stone-900 flex items-center space-x-1.5">
                          <span>{nickname}</span>
                          {r.username && (
                            <a
                              href={`https://t.me/${r.username.replace('@', '')}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sky-600 hover:text-sky-800 text-[11px]"
                              title="Открыть в Telegram"
                            >
                              <ExternalLink className="h-3 w-3 inline" />
                            </a>
                          )}
                        </span>
                        <span className="text-[10px] font-mono text-rose-700 bg-rose-100 px-2 py-0.5 rounded-md font-bold">
                          {r.attempts !== undefined ? `Штраф ${r.attempts}/3` : 'Бан'}
                        </span>
                      </div>

                      <div className="mt-2 text-xs space-y-1">
                        <p className="text-stone-700">
                          <strong className="text-rose-900">Причина бана:</strong> {r.banReason || 'Превышен лимит подключений'}
                        </p>
                        <p className="text-[11px] text-stone-500 flex items-center space-x-1">
                          <Clock className="h-3 w-3 text-stone-400" />
                          <span>Время: {timestampStr}</span>
                        </p>
                        {r.message && (
                          <p className="text-stone-600 italic bg-stone-50 p-2 rounded-lg text-[11px] border border-stone-100 mt-1">
                            «{r.message}»
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Action Buttons: Unblock, Unbind, Unblock & Unbind, Terminate */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-rose-100">
                      <button
                        onClick={() => handleUnblockOnly(r)}
                        disabled={isProcessing}
                        className="py-1.5 px-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center space-x-1 transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
                        title="Разблокировать подписку без отвязки устройства"
                      >
                        <ShieldCheck className="h-3.5 w-3.5" />
                        <span>{isProcessing ? '...' : 'Разблокировать'}</span>
                      </button>

                      <button
                        onClick={() => handleResolveUnbind(r)}
                        disabled={isProcessing}
                        className="py-1.5 px-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-xs flex items-center justify-center space-x-1 transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
                        title="Отвязать устройство от подписки"
                      >
                        <Unlink className="h-3.5 w-3.5" />
                        <span>{isProcessing ? '...' : 'Отвязать'}</span>
                      </button>

                      <button
                        onClick={() => handleUnblockAndUnbind(r)}
                        disabled={isProcessing}
                        className="flex-1 py-1.5 px-2.5 rounded-xl bg-stone-900 hover:bg-black text-white font-bold text-xs flex items-center justify-center space-x-1 transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
                        title="Восстановить центральную синхронизацию и отвязать устройство"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                        <span>{isProcessing ? '...' : 'Разблокировать + Отвязать'}</span>
                      </button>

                      <button
                        onClick={() => handleTerminate(r)}
                        disabled={isProcessing}
                        className="py-1.5 px-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 hover:text-rose-900 border border-rose-200 font-bold text-xs flex items-center justify-center space-x-1 transition-colors disabled:opacity-50 cursor-pointer"
                        title="Аннулировать подписку пользователя"
                      >
                        <XCircle className="h-3.5 w-3.5 text-rose-600" />
                        <span>Аннулировать</span>
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-1.5 bg-stone-100/80 p-1 rounded-xl border border-stone-200/60 text-xs">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-white text-stone-900 shadow-xs font-semibold'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            Все ({requests.length})
          </button>
          <button
            onClick={() => setStatusFilter('unblock')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer flex items-center space-x-1.5 ${
              statusFilter === 'unblock'
                ? 'bg-white text-rose-800 shadow-xs font-bold'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <span>Заявки на разбан</span>
            {unblockPendingCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-rose-100 text-rose-800 text-[10px] font-bold">
                {unblockPendingCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setStatusFilter('pending')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer flex items-center space-x-1.5 ${
              statusFilter === 'pending'
                ? 'bg-white text-amber-800 shadow-xs font-bold'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <span>В ожидании</span>
            {pendingCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">
                {pendingCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setStatusFilter('resolved')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
              statusFilter === 'resolved'
                ? 'bg-white text-emerald-800 shadow-xs font-semibold'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            Решённые ({resolvedCount})
          </button>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по имени, @username, причине..."
            className="w-full pl-9 pr-3 py-1.5 bg-white border border-stone-200 rounded-xl text-xs text-stone-900 placeholder:text-stone-400 focus:outline-hidden focus:border-stone-400"
          />
        </div>
      </div>

      {/* Requests List */}
      {isLoading ? (
        <div className="p-12 text-center bg-white border border-stone-200 rounded-2xl">
          <RefreshCw className="h-8 w-8 text-rose-500 animate-spin mx-auto mb-3" />
          <p className="text-xs text-stone-500">Загрузка обращений подписчиков...</p>
        </div>
      ) : filteredRequests.length === 0 ? (
        <div className="p-12 text-center bg-white border border-stone-200 rounded-2xl space-y-3">
          <div className="h-12 w-12 rounded-full bg-stone-100 text-stone-400 flex items-center justify-center mx-auto">
            <MessageSquare className="h-6 w-6" />
          </div>
          <h3 className="text-sm font-bold text-stone-800">Заявок не найдено</h3>
          <p className="text-xs text-stone-500 max-w-md mx-auto">
            {searchQuery
              ? 'По вашему поисковому запросу ничего не нашлось. Попробуйте изменить параметры поиска.'
              : 'Когда пользователь получит блокировку и отправит объяснение через Telegram-бота, заявка моментально появится здесь.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3.5">
          {filteredRequests.map((reqItem) => {
            const isPending = reqItem.status === 'pending';
            const isUnblock = reqItem.type === 'unblock_request';
            const isProcessing = processingId === reqItem.id;
            const createdDate = new Date(reqItem.createdAt).toLocaleString('ru-RU');
            const blockedDate = reqItem.blockedAt ? new Date(reqItem.blockedAt).toLocaleString('ru-RU') : createdDate;
            const resolvedDate = reqItem.resolvedAt ? new Date(reqItem.resolvedAt).toLocaleString('ru-RU') : null;

            return (
              <div
                key={reqItem.id}
                id={`feedback-item-${reqItem.id}`}
                className={`bg-white border rounded-2xl p-5 transition-all shadow-xs ${
                  isPending
                    ? isUnblock
                      ? 'border-rose-300 ring-2 ring-rose-100/70 bg-gradient-to-br from-white to-rose-50/20'
                      : 'border-amber-200 ring-1 ring-amber-100'
                    : 'border-stone-200'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                  {/* User info & Status */}
                  <div className="space-y-2.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-sm text-stone-900">
                        {reqItem.firstName || 'Пользователь'}
                      </span>
                      {reqItem.username && (
                        <span className="text-xs font-semibold text-stone-700 bg-stone-100 px-2 py-0.5 rounded-md">
                          @{reqItem.username}
                        </span>
                      )}
                      <span className="text-[11px] text-stone-400 font-mono">
                        ID: {reqItem.telegramId}
                      </span>

                      {/* Request Type Badge */}
                      {isUnblock ? (
                        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-800 border border-rose-200 text-[11px] font-bold">
                          <Ban className="h-3 w-3 text-rose-600 shrink-0" />
                          <span>Заявка на разбан</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-bold">
                          <Unlink className="h-3 w-3 text-amber-600 shrink-0" />
                          <span>Смена устройства</span>
                        </span>
                      )}

                      {/* Status Tag */}
                      {isPending ? (
                        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-900 border border-amber-300 text-[11px] font-bold">
                          <AlertCircle className="h-3 w-3 text-amber-600 shrink-0" />
                          <span>Ожидает решения</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-semibold">
                          <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" />
                          <span>Разблокирован и решён</span>
                        </span>
                      )}

                      <span className="text-[11px] text-stone-400 flex items-center space-x-1 ml-auto lg:ml-0">
                        <Clock className="h-3 w-3" />
                        <span>Подано: {createdDate}</span>
                      </span>
                    </div>

                    {/* Ban Details Card if Unblock Request */}
                    {isUnblock && (
                      <div className="p-3 bg-rose-50/60 border border-rose-200 rounded-xl text-xs space-y-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center space-x-1.5 text-rose-900 font-bold">
                            <AlertTriangle className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                            <span>Причина блокировки:</span>
                            <span className="font-normal text-rose-800">
                              {reqItem.banReason || 'Подозрение на нарушение правил сервиса'}
                            </span>
                          </div>
                          {reqItem.attempts !== undefined && reqItem.attempts > 0 && (
                            <span className="px-2 py-0.5 bg-rose-100 text-rose-800 font-bold rounded-md text-[10px]">
                              Нарушений: {reqItem.attempts}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-rose-700 flex items-center space-x-1.5">
                          <Clock className="h-3 w-3 text-rose-500" />
                          <span>Время фиксации блокировки: <strong>{blockedDate}</strong></span>
                        </div>
                      </div>
                    )}

                    {/* Bound Device Information */}
                    {reqItem.boundDevice && (
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-600 bg-stone-50 border border-stone-200/70 p-2.5 rounded-xl">
                        <div className="flex items-center space-x-1.5 font-medium text-stone-800">
                          <Smartphone className="h-3.5 w-3.5 text-stone-500" />
                          <span>Привязанное устройство:</span>
                          <span className="font-bold text-stone-900">{reqItem.boundDevice.clientName}</span>
                        </div>
                        <div className="text-stone-500 text-[11px] font-mono">
                          IP: {reqItem.boundDevice.ip || '—'}
                        </div>
                        {reqItem.boundDevice.boundAt && (
                          <div className="text-stone-400 text-[11px]">
                            Привязано: {new Date(reqItem.boundDevice.boundAt).toLocaleDateString('ru-RU')}
                          </div>
                        )}
                      </div>
                    )}

                    {/* User's Message / Explanation */}
                    <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-800">
                      <span className="font-bold text-stone-900 block mb-1">
                        {isUnblock ? '📝 Объяснение ситуации пользователем:' : '📝 Причина обращения:'}
                      </span>
                      <p className="italic leading-relaxed text-stone-800">
                        «{reqItem.message}»
                      </p>
                    </div>

                    {resolvedDate && (
                      <div className="text-[11px] text-emerald-700 flex items-center space-x-1 font-medium">
                        <UserCheck className="h-3.5 w-3.5 text-emerald-600" />
                        <span>Решено администратором: {resolvedDate}</span>
                      </div>
                    )}
                  </div>

                    {/* Action Buttons */}
                    <div className="flex flex-wrap lg:flex-col items-stretch lg:items-end justify-end gap-1.5 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-stone-100">
                      {isPending && (
                        <>
                          <button
                            onClick={() => handleUnblockOnly(reqItem)}
                            disabled={isProcessing}
                            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center space-x-1.5 transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
                            title="Разблокировать подписку (вернуть узлы из центрального файла)"
                          >
                            <ShieldCheck className="h-3.5 w-3.5" />
                            <span>{isProcessing ? '...' : 'Разблокировать'}</span>
                          </button>

                          <button
                            onClick={() => handleResolveUnbind(reqItem)}
                            disabled={isProcessing}
                            className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-xs flex items-center justify-center space-x-1.5 transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
                            title="Отвязать устройство пользователя"
                          >
                            <Unlink className="h-3.5 w-3.5" />
                            <span>{isProcessing ? '...' : 'Отвязать'}</span>
                          </button>

                          <button
                            onClick={() => handleUnblockAndUnbind(reqItem)}
                            disabled={isProcessing}
                            className="px-3 py-1.5 rounded-xl bg-stone-900 hover:bg-black text-white font-bold text-xs flex items-center justify-center space-x-1.5 transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
                            title="Одобрить разблокировку: восстановить центральную синхронизацию и отвязать устройство"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                            <span>{isProcessing ? '...' : 'Разблокировать + Отвязать'}</span>
                          </button>

                          <button
                            onClick={() => handleTerminate(reqItem)}
                            disabled={isProcessing}
                            className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 hover:text-rose-900 border border-rose-200 font-bold text-xs flex items-center justify-center space-x-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                            title="Аннулировать подписку пользователя и закрыть доступ"
                          >
                            <XCircle className="h-3.5 w-3.5 text-rose-600" />
                            <span>Аннулировать</span>
                          </button>
                        </>
                      )}

                    {reqItem.username && (
                      <a
                        href={`https://t.me/${reqItem.username.replace('@', '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-2 rounded-xl border border-stone-200 text-stone-700 hover:bg-stone-50 text-xs font-semibold flex items-center space-x-1.5 transition-colors"
                      >
                        <Send className="h-3 w-3 text-sky-500" />
                        <span>Написать в TG</span>
                        <ExternalLink className="h-2.5 w-2.5 text-stone-400" />
                      </a>
                    )}

                    <button
                      onClick={() => handleDelete(reqItem.id)}
                      className="p-2 rounded-xl border border-stone-200 text-stone-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                      title="Удалить заявку"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
