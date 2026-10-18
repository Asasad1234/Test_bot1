import React, { useState, useEffect } from 'react';
import { 
  Server, 
  RotateCw, 
  Clock, 
  Terminal, 
  Copy, 
  Check, 
  AlertCircle, 
  CheckCircle2, 
  ShieldCheck, 
  Settings2, 
  FileCode, 
  Download, 
  RefreshCw,
  Play
} from 'lucide-react';
import { DockerConfig } from '../types';
import { fetchDockerConfig, saveDockerConfig, triggerDockerRestart } from '../services/api';

const DEFAULT_DOCKER_CONFIG: DockerConfig = {
  containerName: 'puls-dostupa',
  port: 3000,
  restartPolicy: 'always',
  autoRestartHours: 24,
  autoSyncIntervalMinutes: 1,
  auditIntervalMinutes: 1,
  timeZone: 'Europe/Moscow',
  environment: 'production',
  volumeMountPath: './data-store.json:/app/data-store.json',
};

const RESTART_HOURS_OPTIONS = [
  { value: 0, label: 'Выключен (перезапуск только при сбое контейнера)' },
  { value: 1, label: 'Каждый 1 час' },
  { value: 3, label: 'Каждые 3 часа' },
  { value: 6, label: 'Каждые 6 часов' },
  { value: 12, label: 'Каждые 12 часов' },
  { value: 24, label: 'Каждые 24 часа (Рекомендуется)' },
  { value: 48, label: 'Каждые 48 часов' },
  { value: 72, label: 'Каждые 72 часа' },
];

const SYNC_INTERVAL_OPTIONS = [
  { value: 0.5, label: 'Каждые 30 секунд (быстрый пульс)' },
  { value: 1, label: 'Каждую 1 минуту (стандарт)' },
  { value: 5, label: 'Каждые 5 минут' },
  { value: 15, label: 'Каждые 15 минут' },
  { value: 30, label: 'Каждые 30 минут' },
  { value: 60, label: 'Каждый 1 час' },
];

const AUDIT_INTERVAL_OPTIONS = [
  { value: 0.5, label: 'Каждые 30 секунд (быстрый аудит отписок)' },
  { value: 1, label: 'Каждую 1 минуту (рекомендуется)' },
  { value: 5, label: 'Каждые 5 минут' },
  { value: 15, label: 'Каждые 15 минут' },
];

const TIMEZONE_OPTIONS = [
  { value: 'Europe/Moscow', label: 'Europe/Moscow (МСК UTC+3)' },
  { value: 'Europe/Samara', label: 'Europe/Samara (UTC+4)' },
  { value: 'Asia/Yekaterinburg', label: 'Asia/Yekaterinburg (UTC+5)' },
  { value: 'Asia/Almaty', label: 'Asia/Almaty (UTC+5)' },
  { value: 'Asia/Novosibirsk', label: 'Asia/Novosibirsk (UTC+7)' },
  { value: 'Asia/Vladivostok', label: 'Asia/Vladivostok (UTC+10)' },
  { value: 'Europe/Kyiv', label: 'Europe/Kyiv (UTC+2)' },
  { value: 'UTC', label: 'UTC (Координированное время)' },
];

export const DockerConfigView: React.FC = () => {
  const [config, setConfig] = useState<DockerConfig>(DEFAULT_DOCKER_CONFIG);
  const [dockerRunCmd, setDockerRunCmd] = useState('');
  const [dockerComposeYaml, setDockerComposeYaml] = useState('');
  const [uptimeSeconds, setUptimeSeconds] = useState(0);
  const [serverTime, setServerTime] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await fetchDockerConfig();
      if (data.dockerConfig) {
        setConfig(data.dockerConfig);
      }
      if (data.dockerRunCmd) setDockerRunCmd(data.dockerRunCmd);
      if (data.dockerComposeYaml) setDockerComposeYaml(data.dockerComposeYaml);
      if (data.uptimeSeconds) setUptimeSeconds(data.uptimeSeconds);
      if (data.serverTime) setServerTime(data.serverTime);
    } catch (err: any) {
      setFeedback({ type: 'error', message: `Ошибка загрузки Docker настроек: ${err.message}` });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const handleDownloadCompose = () => {
    const blob = new Blob([dockerComposeYaml], { type: 'text/yaml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'docker-compose.yml';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setFeedback(null);
    try {
      const res = await saveDockerConfig(config);
      setConfig(res.dockerConfig);
      setDockerRunCmd(res.dockerRunCmd);
      setDockerComposeYaml(res.dockerComposeYaml);
      setFeedback({ type: 'success', message: 'Настройки Docker и супервизора успешно сохранены!' });
      setTimeout(() => setFeedback(null), 4000);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Ошибка сохранения настроек' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRestart = async () => {
    if (!confirm('Выполнить перезапуск фонового супервизора сервиса? Все активные боты и таймеры будут мягко перезапущены.')) {
      return;
    }
    setIsRestarting(true);
    setFeedback(null);
    try {
      const res = await triggerDockerRestart();
      setFeedback({ type: 'success', message: res.message || 'Супервизор успешно перезапущен!' });
      await loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Ошибка перезапуска' });
    } finally {
      setIsRestarting(false);
    }
  };

  const formatUptime = (sec: number) => {
    const d = Math.floor(sec / (3600 * 24));
    const h = Math.floor((sec % (3600 * 24)) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const parts = [];
    if (d > 0) parts.push(`${d} дн.`);
    if (h > 0) parts.push(`${h} ч.`);
    if (m > 0) parts.push(`${m} мин.`);
    parts.push(`${s} сек.`);
    return parts.join(' ');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 text-stone-500 space-x-2">
        <RefreshCw className="h-5 w-5 animate-spin text-stone-400" />
        <span className="text-sm">Загрузка параметров контейнера Docker...</span>
      </div>
    );
  }

  return (
    <div id="docker-config-view" className="space-y-6">
      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-4 rounded-xl text-sm flex items-start space-x-3 transition-all ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
              : 'bg-rose-50 text-rose-900 border border-rose-200'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
          )}
          <span className="font-medium leading-relaxed">{feedback.message}</span>
        </div>
      )}

      {/* Header & Status Card */}
      <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-stone-100">
          <div>
            <div className="flex items-center space-x-2.5">
              <div className="p-2 rounded-xl bg-stone-900 text-white">
                <Server className="h-5 w-5" />
              </div>
              <h2 className="text-lg font-bold text-stone-900">Управление Docker и автоперезапуском</h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                Production Ready
              </span>
            </div>
            <p className="text-xs text-stone-500 mt-1">
              Настройка параметров контейнера, интервалов автоперезапуска процесса, периодичности синхронизации с центральным источником и аудита каналов.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={loadData}
              className="px-3 py-2 rounded-xl border border-stone-200 hover:bg-stone-50 text-stone-700 text-xs font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Обновить</span>
            </button>
            <button
              type="button"
              disabled={isRestarting}
              onClick={handleRestart}
              className="px-3.5 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold flex items-center space-x-1.5 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
            >
              <RotateCw className={`h-3.5 w-3.5 ${isRestarting ? 'animate-spin' : ''}`} />
              <span>{isRestarting ? 'Перезапуск...' : 'Перезапустить супервизор'}</span>
            </button>
          </div>
        </div>

        {/* Runtime Diagnostics Pill Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-5">
          <div className="bg-stone-50/70 border border-stone-200/70 rounded-xl p-3.5">
            <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider block mb-1">
              Имя контейнера
            </span>
            <span className="text-sm font-bold text-stone-800 font-mono">{config.containerName}</span>
          </div>

          <div className="bg-stone-50/70 border border-stone-200/70 rounded-xl p-3.5">
            <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider block mb-1">
              Порт сервиса
            </span>
            <span className="text-sm font-bold text-stone-800 font-mono">0.0.0.0:{config.port}</span>
          </div>

          <div className="bg-stone-50/70 border border-stone-200/70 rounded-xl p-3.5">
            <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider block mb-1">
              Время работы (Uptime)
            </span>
            <span className="text-sm font-bold text-emerald-700">{formatUptime(uptimeSeconds)}</span>
          </div>

          <div className="bg-stone-50/70 border border-stone-200/70 rounded-xl p-3.5">
            <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider block mb-1">
              Системное время контейнера
            </span>
            <span className="text-xs font-semibold text-stone-700">{serverTime || 'Синхронизировано'}</span>
          </div>
        </div>
      </div>

      {/* Main Settings Form */}
      <form onSubmit={handleSave} className="bg-white rounded-2xl border border-stone-200 p-6 shadow-xs space-y-6">
        <div className="flex items-center space-x-2 pb-3 border-b border-stone-100">
          <Settings2 className="h-4 w-4 text-stone-700" />
          <h3 className="text-sm font-bold text-stone-900 uppercase tracking-wider">Параметры контейнера и расписания</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Policy */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1.5">
              Политика перезапуска Docker (Restart Policy)
            </label>
            <select
              value={config.restartPolicy}
              onChange={(e) => setConfig({ ...config, restartPolicy: e.target.value as any })}
              className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 bg-stone-50/50 text-stone-800 text-xs font-medium focus:ring-2 focus:ring-stone-900 focus:outline-none"
            >
              <option value="always">always — Автоперезапуск всегда (при падении и при перезагрузке сервера)</option>
              <option value="unless-stopped">unless-stopped — Автоперезапуск, если не остановлен вручную</option>
              <option value="on-failure">on-failure — Только при непредвиденной ошибке процесса</option>
              <option value="no">no — Не перезапускать автоматически</option>
            </select>
            <p className="text-[11px] text-stone-500 mt-1">
              Рекомендуется оставить <code className="text-stone-700 font-mono">always</code> для бесперебойной работы VPN сервиса 24/7.
            </p>
          </div>

          {/* Auto Restart Schedule Interval */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1.5 flex items-center justify-between">
              <span>Интервал планового автоперезапуска</span>
              <Clock className="h-3.5 w-3.5 text-stone-400" />
            </label>
            <select
              value={config.autoRestartHours}
              onChange={(e) => setConfig({ ...config, autoRestartHours: Number(e.target.value) })}
              className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 bg-stone-50/50 text-stone-800 text-xs font-medium focus:ring-2 focus:ring-stone-900 focus:outline-none"
            >
              {RESTART_HOURS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-stone-500 mt-1">
              Фоновый супервизор мягко обновляет процесс Node.js, очищая кэш и предотвращая утечки памяти в долгих циклах.
            </p>
          </div>

          {/* Central Repo Sync Interval */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1.5 flex items-center justify-between">
              <span>Автосинхронизация с центральным источником (RAW)</span>
              <RotateCw className="h-3.5 w-3.5 text-stone-400" />
            </label>
            <select
              value={config.autoSyncIntervalMinutes}
              onChange={(e) => setConfig({ ...config, autoSyncIntervalMinutes: Number(e.target.value) })}
              className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 bg-stone-50/50 text-stone-800 text-xs font-medium focus:ring-2 focus:ring-stone-900 focus:outline-none"
            >
              {SYNC_INTERVAL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-stone-500 mt-1">
              Периодичность проверки обновлений в файле L на GitVerse и мгновенного распространения по активным подписчикам.
            </p>
          </div>

          {/* Channel Membership Audit Interval */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1.5 flex items-center justify-between">
              <span>Частота аудита членства в каналах (Отписки/Блокировки)</span>
              <ShieldCheck className="h-3.5 w-3.5 text-stone-400" />
            </label>
            <select
              value={config.auditIntervalMinutes}
              onChange={(e) => setConfig({ ...config, auditIntervalMinutes: Number(e.target.value) })}
              className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 bg-stone-50/50 text-stone-800 text-xs font-medium focus:ring-2 focus:ring-stone-900 focus:outline-none"
            >
              {AUDIT_INTERVAL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-stone-500 mt-1">
              Фоновый бот проверяет подписчиков. Если пользователь покинул канал — подписка мгновенно переключается на заглушку и стартует таймер.
            </p>
          </div>

          {/* Timezone */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1.5">
              Часовой пояс сервера (TZ)
            </label>
            <select
              value={config.timeZone}
              onChange={(e) => setConfig({ ...config, timeZone: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 bg-stone-50/50 text-stone-800 text-xs font-medium focus:ring-2 focus:ring-stone-900 focus:outline-none"
            >
              {TIMEZONE_OPTIONS.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
          </div>

          {/* Port */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1.5">
              Внешний порт (HTTP)
            </label>
            <input
              type="number"
              value={config.port}
              onChange={(e) => setConfig({ ...config, port: Number(e.target.value) })}
              className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 bg-stone-50/50 text-stone-800 text-xs font-medium focus:ring-2 focus:ring-stone-900 focus:outline-none"
              placeholder="3000"
            />
          </div>
        </div>

        <div className="flex items-center justify-end space-x-3 pt-4 border-t border-stone-100">
          <button
            type="submit"
            disabled={isSaving}
            className="px-5 py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold transition-colors shadow-xs cursor-pointer disabled:opacity-50 flex items-center space-x-2"
          >
            <Check className="h-3.5 w-3.5" />
            <span>{isSaving ? 'Сохранение...' : 'Сохранить конфигурацию Docker'}</span>
          </button>
        </div>
      </form>

      {/* Deployment Artifacts & CLI Snippets */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Docker Run Command */}
        <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-stone-100 mb-3">
              <div className="flex items-center space-x-2">
                <Terminal className="h-4 w-4 text-stone-700" />
                <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wider">Команда Docker Run</h3>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(dockerRunCmd, 'docker-run')}
                className="px-2.5 py-1 rounded-lg border border-stone-200 hover:bg-stone-100 text-stone-600 text-[11px] font-semibold flex items-center space-x-1 transition-colors cursor-pointer"
              >
                {copiedKey === 'docker-run' ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-600" />
                    <span className="text-emerald-700">Скопировано</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    <span>Копировать</span>
                  </>
                )}
              </button>
            </div>
            <p className="text-xs text-stone-500 mb-3 leading-relaxed">
              Выполните эту команду на вашем VPS или сервере для запуска контейнера в фоновом режиме с постоянным хранилищем.
            </p>
            <pre className="p-3.5 bg-stone-900 text-stone-100 rounded-xl text-xs font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed border border-stone-800">
              {dockerRunCmd}
            </pre>
          </div>

          <div className="mt-4 pt-3 border-t border-stone-100 text-[11px] text-stone-500 flex items-center space-x-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
            <span>Автоматически монтирует data-store.json для сохранения базы подписчиков.</span>
          </div>
        </div>

        {/* Docker Compose YAML */}
        <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-stone-100 mb-3">
              <div className="flex items-center space-x-2">
                <FileCode className="h-4 w-4 text-stone-700" />
                <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wider">docker-compose.yml</h3>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleDownloadCompose}
                  className="px-2.5 py-1 rounded-lg border border-stone-200 hover:bg-stone-100 text-stone-600 text-[11px] font-semibold flex items-center space-x-1 transition-colors cursor-pointer"
                  title="Скачать файл docker-compose.yml"
                >
                  <Download className="h-3 w-3" />
                  <span>Скачать .yml</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleCopy(dockerComposeYaml, 'compose')}
                  className="px-2.5 py-1 rounded-lg border border-stone-200 hover:bg-stone-100 text-stone-600 text-[11px] font-semibold flex items-center space-x-1 transition-colors cursor-pointer"
                >
                  {copiedKey === 'compose' ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-600" />
                      <span className="text-emerald-700">Скопировано</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      <span>Копировать</span>
                    </>
                  )}
                </button>
              </div>
            </div>
            <p className="text-xs text-stone-500 mb-3 leading-relaxed">
              Готовый файл для запуска через <code className="text-stone-700 font-mono">docker compose up -d</code> с встроенным healthcheck.
            </p>
            <pre className="p-3.5 bg-stone-900 text-stone-100 rounded-xl text-[11px] font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed border border-stone-800 max-h-56">
              {dockerComposeYaml}
            </pre>
          </div>

          <div className="mt-4 pt-3 border-t border-stone-100 text-[11px] text-stone-500 flex items-center space-x-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
            <span>Включает Healthcheck мониторинг каждые 30 секунд.</span>
          </div>
        </div>
      </div>
    </div>
  );
};
