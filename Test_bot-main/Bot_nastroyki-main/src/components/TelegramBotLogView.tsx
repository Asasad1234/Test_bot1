import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, AlertTriangle, Bot, Download, Info, RefreshCw, Search, Trash2 } from 'lucide-react';
import { TelegramBotLogEntry } from '../types';
import { clearTelegramBotLogs, fetchTelegramBotLogs } from '../services/api';

type LogLevelFilter = 'all' | TelegramBotLogEntry['level'];

export const TelegramBotLogView: React.FC = () => {
  const [logs, setLogs] = useState<TelegramBotLogEntry[]>([]);
  const [pollingEnabled, setPollingEnabled] = useState<boolean | null>(null);
  const [enabledBots, setEnabledBots] = useState(0);
  const [pollingStatuses, setPollingStatuses] = useState<Array<{ bot: string; enabled: boolean; status: 'connecting' | 'polling' | 'stopped' }>>([]);
  const [level, setLevel] = useState<LogLevelFilter>('all');
  const [search, setSearch] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadLogs = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const result = await fetchTelegramBotLogs(500);
      setLogs(result.logs);
      setPollingEnabled(result.pollingEnabled);
      setEnabledBots(result.enabledBots);
      setPollingStatuses(result.pollingStatuses || []);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Не удалось загрузить журнал бота.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => void loadLogs(true), 2500);
    return () => clearInterval(interval);
  }, [autoRefresh, loadLogs]);

  const filteredLogs = useMemo(() => {
    const query = search.trim().toLowerCase();
    return logs.filter((log) => {
      if (level !== 'all' && log.level !== level) return false;
      return !query || `${log.bot} ${log.event} ${log.message}`.toLowerCase().includes(query);
    });
  }, [level, logs, search]);

  const handleClear = async () => {
    if (!confirm('Очистить журнал Telegram-бота?')) return;
    try {
      await clearTelegramBotLogs();
      await loadLogs();
    } catch (err: any) {
      setError(err.message || 'Не удалось очистить журнал.');
    }
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(filteredLogs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `telegram-bot-logs-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const levelStyle: Record<TelegramBotLogEntry['level'], { label: string; className: string; Icon: typeof Info }> = {
    info: { label: 'INFO', className: 'bg-sky-50 text-sky-700 border-sky-200', Icon: Info },
    warning: { label: 'WARN', className: 'bg-amber-50 text-amber-800 border-amber-200', Icon: AlertTriangle },
    error: { label: 'ERROR', className: 'bg-rose-50 text-rose-700 border-rose-200', Icon: AlertCircle },
  };

  return (
    <div className="max-w-6xl mx-auto space-y-5 pb-12">
      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-sky-50 p-3 text-sky-700"><Bot className="h-6 w-6" /></div>
            <div>
              <h1 className="text-xl font-black text-stone-900">Журнал Telegram-бота</h1>
              <p className="text-sm text-stone-500">Команды, long polling и ошибки ответов Telegram</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setAutoRefresh((value) => !value)}
              className={`rounded-lg border px-3 py-2 text-xs font-semibold ${autoRefresh ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-stone-200 bg-white text-stone-600'}`}
            >
              {autoRefresh ? 'Автообновление: вкл.' : 'Автообновление: выкл.'}
            </button>
            <button onClick={() => void loadLogs()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-stone-200 px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Обновить
            </button>
            <button onClick={handleExport} className="inline-flex items-center gap-2 rounded-lg border border-stone-200 px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50">
              <Download className="h-3.5 w-3.5" /> Экспорт
            </button>
            <button onClick={() => void handleClear()} className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100">
              <Trash2 className="h-3.5 w-3.5" /> Очистить
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          <span className={`rounded-full px-3 py-1 font-bold ${pollingEnabled ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
            Polling {pollingEnabled === null ? 'проверяется…' : pollingEnabled ? 'включён' : 'отключён'}
          </span>
          <span className="rounded-full bg-stone-100 px-3 py-1 font-semibold text-stone-700">Включённых ботов: {enabledBots}</span>
          <span className="rounded-full bg-stone-100 px-3 py-1 font-semibold text-stone-700">Записей: {logs.length}</span>
        </div>
        {pollingStatuses.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {pollingStatuses.map((item) => (
              <span
                key={item.bot}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                  item.status === 'polling'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : item.status === 'connecting'
                      ? 'border-amber-200 bg-amber-50 text-amber-800'
                      : 'border-stone-200 bg-stone-50 text-stone-600'
                }`}
              >
                {item.bot}: {item.status === 'polling' ? 'получает обновления' : item.status === 'connecting' ? 'подключается' : item.enabled ? 'не запущен' : 'выключен'}
              </span>
            ))}
          </div>
        )}
        {pollingEnabled === false && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Получение команд отключено переменной ENABLE_TELEGRAM_POLLING=false.
          </p>
        )}
        {enabledBots === 0 && pollingEnabled && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            В панели нет включённых ботов с токеном для запуска polling.
          </p>
        )}
        {error && <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      </section>

      <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-stone-100 p-4 sm:flex-row">
          <label className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск по событию или сообщению" className="w-full rounded-lg border border-stone-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-sky-400" />
          </label>
          <select value={level} onChange={(event) => setLevel(event.target.value as LogLevelFilter)} className="rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-700">
            <option value="all">Все уровни</option>
            <option value="info">Информация</option>
            <option value="warning">Предупреждения</option>
            <option value="error">Ошибки</option>
          </select>
        </div>
        {filteredLogs.length === 0 ? (
          <div className="p-12 text-center text-sm text-stone-500">
            {logs.length === 0 ? 'Записей пока нет. Отправьте боту /start — событие появится здесь, если Telegram доставит команду этому приложению.' : 'По выбранному фильтру записей нет.'}
          </div>
        ) : (
          <div className="divide-y divide-stone-100">
            {filteredLogs.map((log) => {
              const badge = levelStyle[log.level];
              const Icon = badge.Icon;
              return (
                <article key={log.id} className="flex gap-3 p-4">
                  <span className={`mt-0.5 inline-flex h-fit items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-black ${badge.className}`}>
                    <Icon className="h-3 w-3" /> {badge.label}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-bold text-stone-900">{log.event}</span>
                      <span className="text-xs font-semibold text-sky-700">{log.bot}</span>
                      <time className="text-xs text-stone-400">{new Date(log.timestamp).toLocaleString('ru-RU')}</time>
                    </div>
                    <p className="mt-1 break-words text-sm text-stone-600">{log.message}</p>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
