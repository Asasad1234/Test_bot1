import React, { useState, useEffect, useRef } from 'react';
import {
  Terminal,
  RefreshCw,
  Trash2,
  Download,
  Search,
  Filter,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Info,
  ShieldAlert,
  GitBranch,
  Bot,
  Zap,
  Play,
  Clock,
  Layers,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Copy,
  Check
} from 'lucide-react';
import { SystemLogEntry, DeepAuditResult } from '../types';
import { fetchSystemLogs, clearSystemLogs, exportSystemLogs, deepAuditAndForceSync } from '../services/api';

interface SyncLogViewProps {
  onNavigateToCentral?: () => void;
  onNavigateToDashboard?: () => void;
}

export const SyncLogView: React.FC<SyncLogViewProps> = ({
  onNavigateToCentral,
  onNavigateToDashboard,
}) => {
  const [logs, setLogs] = useState<SystemLogEntry[]>([]);
  const [totalUnfiltered, setTotalUnfiltered] = useState(0);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedLevel, setSelectedLevel] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Deep Audit & Force Sync State
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditResult, setAuditResult] = useState<DeepAuditResult | null>(null);
  const [auditNotice, setAuditNotice] = useState<string | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);

  const pollIntervalRef = useRef<any>(null);

  const loadLogs = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await fetchSystemLogs({
        category: selectedCategory !== 'all' ? selectedCategory : undefined,
        level: selectedLevel !== 'all' ? selectedLevel : undefined,
        search: searchQuery.trim() || undefined,
        limit: 300,
      });
      setLogs(data.logs || []);
      setTotalUnfiltered(data.totalUnfiltered || 0);
    } catch (err) {
      console.warn('Failed to load logs:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [selectedCategory, selectedLevel, searchQuery]);

  useEffect(() => {
    if (autoRefresh) {
      pollIntervalRef.current = setInterval(() => {
        loadLogs(true);
      }, 2500);
    } else if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [autoRefresh, selectedCategory, selectedLevel, searchQuery]);

  const handleClear = async () => {
    if (!confirm('Вы уверены, что хотите полностью очистить журнал процессов?')) return;
    try {
      await clearSystemLogs();
      await loadLogs();
    } catch (err: any) {
      alert(err.message || 'Ошибка очистки');
    }
  };

  const handleExport = async (format: 'json' | 'text') => {
    try {
      const blob = await exportSystemLogs(format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `system-logs-${new Date().toISOString().slice(0, 10)}.${format === 'json' ? 'json' : 'txt'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || 'Ошибка экспорта логов');
    }
  };

  const handleRunDeepAudit = async () => {
    setIsAuditing(true);
    setAuditNotice(null);
    setAuditError(null);
    try {
      const res = await deepAuditAndForceSync();
      setAuditResult(res.audit);
      setAuditNotice(res.message);
      await loadLogs();
    } catch (err: any) {
      setAuditError(err.message || 'Ошибка выполнения аудита');
    } finally {
      setIsAuditing(false);
    }
  };

  const handleCopyDetails = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Category counts
  const errorCount = logs.filter((l) => l.level === 'error').length;
  const warningCount = logs.filter((l) => l.level === 'warning').length;
  const successCount = logs.filter((l) => l.level === 'success').length;
  const infoCount = logs.filter((l) => l.level === 'info').length;

  const getLevelBadge = (level: string) => {
    switch (level) {
      case 'error':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-bold">
            <AlertCircle className="h-3 w-3 text-rose-600" />
            <span>ERROR</span>
          </span>
        );
      case 'warning':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-bold">
            <AlertTriangle className="h-3 w-3 text-amber-600" />
            <span>WARN</span>
          </span>
        );
      case 'success':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold">
            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
            <span>SUCCESS</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-200 text-[11px] font-bold">
            <Info className="h-3 w-3 text-sky-600" />
            <span>INFO</span>
          </span>
        );
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'sync':
        return <RefreshCw className="h-3.5 w-3.5 text-emerald-600" />;
      case 'gitverse':
        return <GitBranch className="h-3.5 w-3.5 text-blue-600" />;
      case 'violations':
        return <ShieldAlert className="h-3.5 w-3.5 text-rose-600" />;
      case 'bot':
        return <Bot className="h-3.5 w-3.5 text-indigo-600" />;
      default:
        return <Terminal className="h-3.5 w-3.5 text-stone-600" />;
    }
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'sync':
        return 'Синхронизация subs/';
      case 'gitverse':
        return 'GitVerse API';
      case 'violations':
        return '🛡️ Мониторинг передачи (Анти-шеринг)';
      case 'bot':
        return 'Бот и каналы';
      case 'subscribers':
        return 'Подписчики';
      case 'exclusions':
        return 'Исключения';
      default:
        return 'Система';
    }
  };

  // Filter transfer monitoring specific logs
  const transferViolations = logs.filter(
    (l) => l.category === 'violations' || l.action.includes('TRANSFER') || l.action.includes('SECOND_DEVICE')
  );

  return (
    <div id="sync-log-view" className="space-y-6">
      {/* Header Bar */}
      <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div className="h-11 w-11 rounded-2xl bg-stone-900 text-amber-400 flex items-center justify-center shrink-0 shadow-xs">
              <Terminal className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-xl font-bold text-stone-900">
                  Журнал процессов и синхронизации
                </h2>
                {autoRefresh && (
                  <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold animate-pulse">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-600"></span>
                    <span>LIVE</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-stone-500 mt-1">
                Полный аудит операций: запись файлов в репозиторий GitVerse (subs/), фиксация передачи подписок 2 лицам, детекция отписки от каналов и ошибки сети.
              </p>
            </div>
          </div>

          {/* Quick Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              id="btn-run-deep-audit"
              onClick={handleRunDeepAudit}
              disabled={isAuditing}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
              title="Запустить глубокий аудит и принудительную синхронизацию минуя кэш"
            >
              <Zap className={`h-3.5 w-3.5 text-amber-300 ${isAuditing ? 'animate-bounce' : ''}`} />
              <span>{isAuditing ? 'Аудит и запись...' : 'Аудит и принудительная синхронизация'}</span>
            </button>

            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                autoRefresh
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                  : 'bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100'
              }`}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${autoRefresh ? 'animate-spin' : ''}`} />
              <span>{autoRefresh ? 'Авто-опрос (2.5с)' : 'Опрос выкл'}</span>
            </button>

            <button
              onClick={() => loadLogs(false)}
              disabled={loading}
              className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl border border-stone-200 hover:bg-stone-50 text-stone-700 text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Обновить</span>
            </button>

            <div className="relative inline-block text-left">
              <button
                onClick={() => handleExport('json')}
                className="inline-flex items-center space-x-1 px-2.5 py-2 rounded-xl border border-stone-200 hover:bg-stone-50 text-stone-700 text-xs font-semibold transition-colors cursor-pointer"
                title="Экспорт в JSON"
              >
                <Download className="h-3.5 w-3.5 text-stone-500" />
                <span>JSON</span>
              </button>
            </div>

            <button
              onClick={() => handleExport('text')}
              className="inline-flex items-center space-x-1 px-2.5 py-2 rounded-xl border border-stone-200 hover:bg-stone-50 text-stone-700 text-xs font-semibold transition-colors cursor-pointer"
              title="Экспорт в TXT"
            >
              <Download className="h-3.5 w-3.5 text-stone-500" />
              <span>TXT</span>
            </button>

            <button
              onClick={handleClear}
              className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl border border-rose-200 bg-rose-50/50 hover:bg-rose-100 text-rose-700 text-xs font-semibold transition-colors cursor-pointer"
              title="Очистить все записи логов"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Очистить</span>
            </button>
          </div>
        </div>

        {/* Audit Notification Banner */}
        {auditNotice && (
          <div className="mt-4 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-start justify-between shadow-xs">
            <div className="flex items-start space-x-2.5">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-emerald-950 block text-sm">Результаты глубокого аудита и синхронизации:</span>
                <p className="mt-0.5 leading-relaxed">{auditNotice}</p>
                {auditResult && (
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                    <span className="px-2 py-0.5 rounded-md bg-emerald-200/70 font-semibold text-emerald-900">
                      Узлов в центре: {auditResult.centralNodesCount}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-emerald-200/70 font-semibold text-emerald-900">
                      Записано файлов в subs/: {auditResult.pushedCount}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-emerald-200/70 font-semibold text-emerald-900">
                      Подписчиков проверено: {auditResult.syncedUsers}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 font-bold">
                      Время выполнения: {auditResult.durationMs} мс
                    </span>
                  </div>
                )}
              </div>
            </div>
            <button onClick={() => setAuditNotice(null)} className="text-emerald-700 font-bold cursor-pointer">✕</button>
          </div>
        )}

        {auditError && (
          <div className="mt-4 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-center justify-between shadow-xs">
            <div className="flex items-center space-x-2.5">
              <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
              <span className="font-semibold">{auditError}</span>
            </div>
            <button onClick={() => setAuditError(null)} className="text-rose-700 font-bold cursor-pointer">✕</button>
          </div>
        )}

        {/* Counter Pills */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          <div className="p-3 rounded-xl bg-rose-50/80 border border-rose-200/70 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700 block">Ошибки</span>
              <span className="text-lg font-black text-rose-900">{errorCount}</span>
            </div>
            <AlertCircle className="h-5 w-5 text-rose-600" />
          </div>

          <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200/70 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700 block">Предупреждения</span>
              <span className="text-lg font-black text-amber-900">{warningCount}</span>
            </div>
            <AlertTriangle className="h-5 w-5 text-amber-600" />
          </div>

          <div className="p-3 rounded-xl bg-emerald-50/80 border border-emerald-200/70 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 block">Успешные</span>
              <span className="text-lg font-black text-emerald-900">{successCount}</span>
            </div>
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          </div>

          <div className="p-3 rounded-xl bg-stone-100 border border-stone-200 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-stone-600 block">Всего записей</span>
              <span className="text-lg font-black text-stone-900">{totalUnfiltered}</span>
            </div>
            <Terminal className="h-5 w-5 text-stone-600" />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Category Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'all', label: 'Все процессы' },
            { id: 'violations', label: `🛡️ Передача подписки (${transferViolations.length})` },
            { id: 'sync', label: 'Синхронизация subs/' },
            { id: 'gitverse', label: 'GitVerse API' },
            { id: 'bot', label: 'Бот и каналы' },
            { id: 'system', label: 'Системные' },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                selectedCategory === cat.id
                  ? cat.id === 'violations' ? 'bg-rose-600 text-white shadow-xs' : 'bg-stone-900 text-white shadow-xs'
                  : cat.id === 'violations' && transferViolations.length > 0 ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200' : 'bg-stone-100 hover:bg-stone-200 text-stone-700'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Level & Search Input */}
        <div className="flex items-center space-x-2">
          <select
            value={selectedLevel}
            onChange={(e) => setSelectedLevel(e.target.value)}
            className="px-2.5 py-1.5 rounded-xl border border-stone-200 text-xs font-semibold text-stone-700 bg-white hover:bg-stone-50"
          >
            <option value="all">Все уровни</option>
            <option value="error">Только Ошибки</option>
            <option value="warning">Предупреждения</option>
            <option value="success">Успешные</option>
            <option value="info">Информация</option>
          </select>

          <div className="relative min-w-[200px]">
            <Search className="h-3.5 w-3.5 text-stone-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Поиск в логах (файл, IP, ошибка)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-stone-200 focus:outline-hidden focus:ring-2 focus:ring-stone-400"
            />
          </div>
        </div>
      </div>

      {/* Dedicated Transfer Monitoring (Anti-Sharing) Dashboard Card */}
      {(selectedCategory === 'violations' || transferViolations.length > 0) && (
        <div className="bg-gradient-to-br from-rose-950 via-stone-900 to-stone-950 text-white rounded-2xl p-6 shadow-md border border-rose-900/40 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div className="h-10 w-10 rounded-xl bg-rose-600/30 text-rose-400 border border-rose-500/40 flex items-center justify-center shrink-0">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-base font-bold text-white">
                    Мониторинг передачи подписок (Анти-шеринг)
                  </h3>
                  <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-bold">
                    СЦЕНАРИЙ 2 АКТИВЕН
                  </span>
                </div>
                <p className="text-xs text-stone-300 mt-0.5">
                  Автоматический перехват попыток использования одной подписки на 2-х устройствах. При обнаружении чужого устройства подписка переводится в статус «Блокировка» со сроком на удаление и уведомлением администратора в логах.
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              <button
                onClick={() => setSelectedCategory('violations')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                  selectedCategory === 'violations'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'bg-stone-800 text-rose-300 hover:bg-stone-700 border border-rose-900/50'
                }`}
              >
                Показать логи передачи ({transferViolations.length})
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <div className="p-3 rounded-xl bg-stone-800/80 border border-rose-900/30">
              <span className="text-[11px] text-stone-400 block font-semibold">Попыток передачи перехвачено</span>
              <span className="text-2xl font-black text-rose-400 mt-0.5 block">{transferViolations.length}</span>
              <span className="text-[10px] text-stone-400">Активность на чужих HWID/IP</span>
            </div>

            <div className="p-3 rounded-xl bg-stone-800/80 border border-rose-900/30">
              <span className="text-[11px] text-stone-400 block font-semibold">Автоматически заблокировано</span>
              <span className="text-2xl font-black text-amber-400 mt-0.5 block">
                {transferViolations.filter((v) => v.action === 'SUBSCRIPTION_TRANSFER_BLOCKED').length || transferViolations.length}
              </span>
              <span className="text-[10px] text-stone-400">Переведены в статус «Блокировка»</span>
            </div>

            <div className="p-3 rounded-xl bg-stone-800/80 border border-rose-900/30">
              <span className="text-[11px] text-stone-400 block font-semibold">Статус защиты 2-х лиц</span>
              <span className="text-sm font-bold text-emerald-400 mt-1 block flex items-center space-x-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                <span>Доступ 2-му лицу отклоняется</span>
              </span>
              <span className="text-[10px] text-stone-400">Файл в GitVerse заменяется на заглушку</span>
            </div>
          </div>
        </div>
      )}

      {/* Log Feed List */}
      <div className="bg-white border border-stone-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <h3 className="text-sm font-bold text-stone-900">Журнал событий</h3>
            <span className="px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 text-xs font-semibold">
              {logs.length} отображается
            </span>
          </div>
          <span className="text-[11px] text-stone-500">
            Сортировка: новые сверху
          </span>
        </div>

        {logs.length === 0 ? (
          <div className="p-12 text-center text-stone-500 space-y-2">
            <Terminal className="h-8 w-8 text-stone-400 mx-auto" />
            <p className="text-xs font-medium">Нет записей, соответствующих выбранным фильтрам.</p>
            <button
              onClick={() => {
                setSelectedCategory('all');
                setSelectedLevel('all');
                setSearchQuery('');
              }}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 cursor-pointer"
            >
              Сбросить фильтры
            </button>
          </div>
        ) : (
          <div className="divide-y divide-stone-100 max-h-[650px] overflow-y-auto font-mono text-xs">
            {logs.map((log) => {
              const isExpanded = expandedLogId === log.id;
              const dateObj = new Date(log.timestamp);
              const timeStr = dateObj.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
              const dateStr = dateObj.toLocaleDateString('ru-RU');

              return (
                <div
                  key={log.id}
                  className={`p-3.5 transition-colors ${
                    log.level === 'error'
                      ? 'bg-rose-50/40 hover:bg-rose-50/70'
                      : log.level === 'warning'
                      ? 'bg-amber-50/30 hover:bg-amber-50/60'
                      : 'hover:bg-stone-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start space-x-2.5 flex-1 min-w-0">
                      {/* Level and Category */}
                      <div className="shrink-0 flex items-center space-x-1.5 mt-0.5">
                        {getLevelBadge(log.level)}
                        <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded-md bg-stone-100 text-stone-700 text-[10px] font-semibold">
                          {getCategoryIcon(log.category)}
                          <span>{log.category.toUpperCase()}</span>
                        </span>
                      </div>

                      {/* Action Tag and Message */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                          <span className="px-1.5 py-0.5 rounded-md bg-stone-900 text-amber-300 text-[10px] font-bold">
                            {log.action}
                          </span>
                          <span className="text-[11px] text-stone-400 font-sans">
                            {timeStr} <span className="text-[10px]">({dateStr})</span>
                          </span>
                        </div>
                        <p className="text-stone-900 leading-snug break-all font-sans text-xs">
                          {log.message}
                        </p>

                        {/* Special Alert Banner for Subscription Transfer Blocked */}
                        {(log.action === 'SUBSCRIPTION_TRANSFER_BLOCKED' || log.action === 'SECOND_DEVICE_DETECTED') && (
                          <div className="mt-2 p-2.5 rounded-lg bg-rose-100/90 border border-rose-300 text-rose-950 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="flex items-center space-x-2">
                              <ShieldAlert className="h-4 w-4 text-rose-600 shrink-0" />
                              <span className="font-bold">ПЕРЕДАЧА ПОДПИСКИ ПЕРЕХВАЧЕНА • СТАТУС: БЛОКИРОВКА</span>
                            </div>
                            <span className="px-2 py-0.5 rounded bg-rose-600 text-white font-bold text-[10px] shrink-0">
                              СЦЕНАРИЙ 2
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="shrink-0 flex items-center space-x-1">
                      {log.details && (
                        <button
                          onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                          className="px-2 py-1 rounded-md text-[11px] font-semibold bg-stone-100 hover:bg-stone-200 text-stone-700 transition-colors flex items-center space-x-1 cursor-pointer"
                        >
                          <span>JSON</span>
                          {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        </button>
                      )}
                      <button
                        onClick={() => handleCopyDetails(log.id, `${log.timestamp} [${log.level.toUpperCase()}] [${log.category}] [${log.action}] ${log.message} ${log.details ? JSON.stringify(log.details) : ''}`)}
                        className="p-1 rounded-md text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 transition-colors cursor-pointer"
                        title="Скопировать строку лога"
                      >
                        {copiedId === log.id ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Expandable JSON Details Drawer */}
                  {isExpanded && log.details && (
                    <div className="mt-2.5 p-3 rounded-xl bg-stone-900 text-stone-200 text-[11px] overflow-x-auto shadow-inner relative animate-fade-in">
                      <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-stone-800 text-[10px] text-stone-400">
                        <span>Детали события (Structured Payload):</span>
                        <button
                          onClick={() => handleCopyDetails(log.id + '-json', JSON.stringify(log.details, null, 2))}
                          className="text-amber-400 hover:text-amber-300 font-semibold cursor-pointer"
                        >
                          {copiedId === log.id + '-json' ? 'Скопировано!' : 'Копировать JSON'}
                        </button>
                      </div>
                      <pre className="whitespace-pre-wrap font-mono leading-relaxed">
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
