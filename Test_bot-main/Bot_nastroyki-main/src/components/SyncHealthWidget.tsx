import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  RefreshCw, 
  Server, 
  Users, 
  Radio, 
  Zap, 
  ArrowRight,
  ShieldCheck,
  Check,
  Clock
} from 'lucide-react';
import { SyncHealthReport, NodeSyncHealth, SubscriberSyncHealth } from '../types';
import { fetchSyncHealth, forceResyncUser, forceResyncAllInconsistent } from '../services/api';

interface SyncHealthWidgetProps {
  onNavigateToUsers?: () => void;
  onRefreshParent?: () => void;
}

export const SyncHealthWidget: React.FC<SyncHealthWidgetProps> = ({
  onNavigateToUsers,
  onRefreshParent,
}) => {
  const [report, setReport] = useState<SyncHealthReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'nodes' | 'subscribers'>('nodes');
  const [subscriberFilter, setSubscriberFilter] = useState<'all' | 'green' | 'yellow' | 'red'>('all');
  const [resyncingUserId, setResyncingUserId] = useState<string | null>(null);
  const [isResyncingAll, setIsResyncingAll] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'warning' | 'error'; message: string } | null>(null);

  const loadHealthData = async () => {
    setIsLoading(true);
    try {
      const data = await fetchSyncHealth();
      setReport(data);
    } catch (err: any) {
      console.warn('[SyncHealthWidget] Error loading health report:', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadHealthData();
    // Background polling every 12 seconds
    const interval = setInterval(loadHealthData, 12000);
    return () => clearInterval(interval);
  }, []);

  const handleForceResync = async (userId: string, usernameOrId: string) => {
    setResyncingUserId(userId);
    try {
      const res = await forceResyncUser(userId);
      setNotification({
        type: 'success',
        message: res.message || `Подписчик ${usernameOrId} успешно согласован с источником!`,
      });
      await loadHealthData();
      if (onRefreshParent) onRefreshParent();
      setTimeout(() => setNotification(null), 4000);
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: err.message || 'Ошибка принудительной синхронизации',
      });
      setTimeout(() => setNotification(null), 5000);
    } finally {
      setResyncingUserId(null);
    }
  };

  const handleForceResyncAll = async () => {
    setIsResyncingAll(true);
    try {
      const res = await forceResyncAllInconsistent();
      setNotification({
        type: 'success',
        message: res.message || 'Все подписчики с отклонениями успешно синхронизированы!',
      });
      if (res.report) setReport(res.report);
      else await loadHealthData();
      if (onRefreshParent) onRefreshParent();
      setTimeout(() => setNotification(null), 4000);
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: err.message || 'Ошибка синхронизации всех пользователей',
      });
      setTimeout(() => setNotification(null), 5000);
    } finally {
      setIsResyncingAll(false);
    }
  };

  const summary = report?.summary || {
    totalSubscribers: 0,
    syncedCount: 0,
    inconsistentCount: 0,
    desyncedCount: 0,
    healthPercentage: 100,
    centralNodesCount: 0,
    lastCentralUpdate: null,
  };

  const filteredSubscribers = (report?.subscribers || []).filter((sub) => {
    if (subscriberFilter === 'all') return true;
    return sub.status === subscriberFilter;
  });

  const getStatusBadge = (status: 'green' | 'yellow' | 'red') => {
    switch (status) {
      case 'green':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100/80 text-emerald-800 border border-emerald-300/80">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            Совпадает 100%
          </span>
        );
      case 'yellow':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100/80 text-amber-800 border border-amber-300/80">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            Отклонение
          </span>
        );
      case 'red':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100/80 text-rose-800 border border-rose-300/80">
            <span className="h-2 w-2 rounded-full bg-rose-500" />
            Отключен / Блок
          </span>
        );
    }
  };

  return (
    <div id="sync-health-widget" className="bg-white border border-stone-200/90 rounded-2xl p-5 shadow-xs space-y-4">
      {/* Header & Overall Score */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-stone-100">
        <div className="flex items-center space-x-3">
          <div className="h-10 w-10 rounded-xl bg-stone-900 text-amber-400 flex items-center justify-center font-bold shadow-xs">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-base font-bold text-stone-900">
                Здоровье синхронизации (Sync Health)
              </h2>
              <span className="relative flex h-2.5 w-2.5">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${summary.inconsistentCount > 0 ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${summary.inconsistentCount > 0 ? 'bg-amber-500' : 'bg-emerald-500'}`} />
              </span>
            </div>
            <p className="text-xs text-stone-500">
              Потоковое подтверждение идентичности конфигурации узлов и файлов подписчиков с центральным источником
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Health Percentage Badge */}
          <div className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 ${
            summary.healthPercentage >= 90
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
              : summary.healthPercentage >= 60
              ? 'bg-amber-50 text-amber-900 border-amber-200'
              : 'bg-rose-50 text-rose-900 border-rose-200'
          }`}>
            <ShieldCheck className="h-4 w-4" />
            <span>Согласованность: {summary.healthPercentage}%</span>
          </div>

          {/* Quick Resync All Button */}
          {summary.inconsistentCount > 0 && (
            <button
              id="btn-sync-all-inconsistent"
              onClick={handleForceResyncAll}
              disabled={isResyncingAll}
              className="px-3 py-1.5 text-xs font-bold rounded-xl bg-amber-600 hover:bg-amber-700 text-white transition-colors flex items-center gap-1.5 shadow-xs disabled:opacity-50"
              title="Принудительно синхронизировать всех подписчиков с отклонениями"
            >
              <Zap className={`h-3.5 w-3.5 ${isResyncingAll ? 'animate-spin' : ''}`} />
              <span>{isResyncingAll ? 'Синхронизация...' : `Исправить (${summary.inconsistentCount})`}</span>
            </button>
          )}

          {/* Refresh Button */}
          <button
            id="btn-refresh-sync-health"
            onClick={loadHealthData}
            disabled={isLoading}
            className="p-1.5 text-stone-500 hover:text-stone-800 hover:bg-stone-100 rounded-lg transition-colors border border-stone-200"
            title="Обновить статус согласованности"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin text-stone-800' : ''}`} />
          </button>
        </div>
      </div>

      {/* Action Notification Banner */}
      {notification && (
        <div className={`px-4 py-2.5 rounded-xl text-xs font-medium border flex items-center justify-between ${
          notification.type === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
            : notification.type === 'warning'
            ? 'bg-amber-50 border-amber-200 text-amber-900'
            : 'bg-rose-50 border-rose-200 text-rose-900'
        }`}>
          <div className="flex items-center space-x-2">
            {notification.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-stone-400 hover:text-stone-700 text-xs ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Summary Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="bg-stone-50 border border-stone-200/70 rounded-xl p-3">
          <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider block">Узлов в источнике</span>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-xl font-bold text-stone-900">{summary.centralNodesCount}</span>
            <span className="text-xs text-stone-500">активных</span>
          </div>
        </div>

        <div className="bg-emerald-50/60 border border-emerald-200/70 rounded-xl p-3">
          <span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider block">В норме (Green)</span>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-xl font-bold text-emerald-900">{summary.syncedCount}</span>
            <span className="text-xs text-emerald-700">совпадают точь-в-точь</span>
          </div>
        </div>

        <div className={`border rounded-xl p-3 ${summary.inconsistentCount > 0 ? 'bg-amber-50/70 border-amber-300' : 'bg-stone-50 border-stone-200/70'}`}>
          <span className="text-[11px] font-semibold text-amber-800 uppercase tracking-wider block">Отклонения (Yellow)</span>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-xl font-bold text-amber-950">{summary.inconsistentCount}</span>
            <span className="text-xs text-amber-800">требуют сверки</span>
          </div>
        </div>

        <div className="bg-stone-50 border border-stone-200/70 rounded-xl p-3">
          <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider block">Изоляция (Red)</span>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-xl font-bold text-rose-900">{summary.desyncedCount}</span>
            <span className="text-xs text-stone-500">блок / отписка</span>
          </div>
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="flex items-center justify-between border-b border-stone-200/80 pt-1">
        <div className="flex items-center space-x-2">
          <button
            id="tab-sync-health-nodes"
            onClick={() => setActiveTab('nodes')}
            className={`px-3.5 py-2 text-xs font-bold rounded-t-xl transition-colors border-b-2 flex items-center gap-1.5 ${
              activeTab === 'nodes'
                ? 'border-stone-900 text-stone-950 bg-stone-100/50'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            <Server className="h-3.5 w-3.5" />
            <span>Подключенные узлы ({report?.centralNodes?.length || 0})</span>
          </button>
          <button
            id="tab-sync-health-subscribers"
            onClick={() => setActiveTab('subscribers')}
            className={`px-3.5 py-2 text-xs font-bold rounded-t-xl transition-colors border-b-2 flex items-center gap-1.5 ${
              activeTab === 'subscribers'
                ? 'border-stone-900 text-stone-950 bg-stone-100/50'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            <span>Подписчики и файлы ({summary.totalSubscribers})</span>
            {summary.inconsistentCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-amber-500 text-stone-950 font-bold">
                {summary.inconsistentCount}
              </span>
            )}
          </button>
        </div>

        {onNavigateToUsers && (
          <button
            onClick={onNavigateToUsers}
            className="text-xs font-semibold text-stone-600 hover:text-stone-900 flex items-center gap-1 hover:underline pb-1.5"
          >
            <span>В управление пользователями</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* TAB 1: Connected Central Nodes */}
      {activeTab === 'nodes' && (
        <div className="space-y-2">
          {(!report?.centralNodes || report.centralNodes.length === 0) ? (
            <div className="text-center py-8 text-stone-400 text-xs bg-stone-50 rounded-xl border border-dashed border-stone-200">
              В центральном источнике пока нет распарсенных узлов. Заполните конфигурацию в «Центральной подписке».
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {report.centralNodes.map((node, idx) => {
                const isAllConfirmed = node.status === 'green';
                return (
                  <div
                    key={node.id || idx}
                    className="p-3 rounded-xl border border-stone-200/80 hover:border-stone-300 bg-white transition-all shadow-2xs flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <div className={`h-8 w-8 rounded-lg flex items-center justify-center font-bold text-[10px] shrink-0 ${
                        node.protocol === 'VLESS' ? 'bg-indigo-100 text-indigo-800' :
                        node.protocol === 'HYSTERIA2' ? 'bg-purple-100 text-purple-800' :
                        node.protocol === 'VMESS' ? 'bg-sky-100 text-sky-800' :
                        node.protocol === 'TROJAN' ? 'bg-amber-100 text-amber-800' :
                        'bg-stone-100 text-stone-800'
                      }`}>
                        {node.protocol.substring(0, 3)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center space-x-1.5">
                          <span className="text-xs font-bold text-stone-900 truncate">
                            {node.name}
                          </span>
                        </div>
                        <span className="text-[11px] text-stone-500 font-mono block truncate">
                          {node.server}:{node.port}
                        </span>
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      {getStatusBadge(node.status)}
                      <span className="text-[10px] text-stone-400 block mt-0.5">
                        {node.matchedSubscribersCount}/{node.totalSubscribersCount} подписчиков
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Subscribers & Local Files Reconciliation */}
      {activeTab === 'subscribers' && (
        <div className="space-y-3">
          {/* Sub-filters */}
          <div className="flex items-center space-x-1.5 text-xs">
            <button
              onClick={() => setSubscriberFilter('all')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                subscriberFilter === 'all' ? 'bg-stone-900 text-white font-bold' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              Все ({summary.totalSubscribers})
            </button>
            <button
              onClick={() => setSubscriberFilter('green')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                subscriberFilter === 'green' ? 'bg-emerald-600 text-white font-bold' : 'bg-stone-100 text-emerald-800 hover:bg-emerald-100'
              }`}
            >
              🟢 Совпадают ({summary.syncedCount})
            </button>
            <button
              onClick={() => setSubscriberFilter('yellow')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                subscriberFilter === 'yellow' ? 'bg-amber-500 text-stone-950 font-bold' : 'bg-stone-100 text-amber-800 hover:bg-amber-100'
              }`}
            >
              🟡 С отклонениями ({summary.inconsistentCount})
            </button>
            <button
              onClick={() => setSubscriberFilter('red')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                subscriberFilter === 'red' ? 'bg-rose-600 text-white font-bold' : 'bg-stone-100 text-rose-800 hover:bg-rose-100'
              }`}
            >
              🔴 Изолированы ({summary.desyncedCount})
            </button>
          </div>

          {/* Subscribers List */}
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {filteredSubscribers.length === 0 ? (
              <div className="text-center py-8 text-stone-400 text-xs bg-stone-50 rounded-xl border border-dashed border-stone-200">
                Подписчиков в этой категории не найдено.
              </div>
            ) : (
              filteredSubscribers.map((sub) => {
                const isResyncing = resyncingUserId === sub.userId;
                return (
                  <div
                    key={sub.userId}
                    className={`p-3 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${
                      sub.isInconsistent
                        ? 'bg-amber-50/50 border-amber-300'
                        : sub.status === 'red'
                        ? 'bg-stone-50/80 border-stone-200 opacity-80'
                        : 'bg-white border-stone-200/90'
                    }`}
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-stone-900">
                          {sub.firstName || (sub.username ? `@${sub.username}` : `ID: ${sub.telegramId}`)}
                        </span>
                        {sub.username && (
                          <span className="text-[11px] text-stone-500 font-mono">
                            @{sub.username}
                          </span>
                        )}
                        {getStatusBadge(sub.status)}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-stone-600">
                        <span>
                          Узлов: <strong className={sub.currentNodesCount === sub.expectedNodesCount ? 'text-emerald-700' : 'text-amber-700'}>
                            {sub.currentNodesCount} / {sub.expectedNodesCount}
                          </strong>
                        </span>
                        {sub.gitFilePath && (
                          <span className="font-mono text-stone-500 truncate max-w-[200px]" title={sub.gitFilePath}>
                            {sub.gitFilePath}
                          </span>
                        )}
                        {sub.lastSyncedAt && (
                          <span className="text-stone-400 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(sub.lastSyncedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>

                      {/* Inconsistency Reason Alert */}
                      {sub.inconsistencyReason && (
                        <p className="text-[11px] text-amber-800 font-medium bg-amber-100/70 px-2 py-0.5 rounded-md inline-block mt-0.5">
                          ⚠️ {sub.inconsistencyReason}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* Force Re-sync Button for inconsistent users */}
                      <button
                        onClick={() => handleForceResync(sub.userId, sub.username || String(sub.telegramId))}
                        disabled={isResyncing}
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 shadow-2xs ${
                          sub.isInconsistent
                            ? 'bg-amber-600 hover:bg-amber-700 text-white'
                            : 'bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-200'
                        }`}
                        title="Принудительно перезаписать конфигурацию пользователя из центрального источника"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${isResyncing ? 'animate-spin' : ''}`} />
                        <span>{isResyncing ? 'Сверка...' : 'Force Re-sync'}</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
