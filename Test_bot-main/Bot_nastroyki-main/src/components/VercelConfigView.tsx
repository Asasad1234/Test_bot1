import React, { useState, useEffect } from 'react';
import {
  Cloud,
  Zap,
  Globe,
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Send,
  Terminal,
  FileCode,
  Download,
  RefreshCw,
  Server,
  Layers,
  Sparkles,
  HelpCircle,
  Link2,
  Trash2,
  Radio,
  ArrowRight,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Play,
  Database,
  ArrowLeftRight,
  HardDrive,
  UploadCloud,
  DownloadCloud,
  Activity,
  Layers as LayersIcon
} from 'lucide-react';
import {
  fetchVercelConfig,
  setVercelWebhook,
  deleteVercelWebhook,
  fetchVercelWebhookInfo,
  testVercelDeployment,
  VercelConfigResponse,
  fetchDatabaseStatus,
  configureDatabase,
  testVercelKvConnection,
  migrateDatabase,
  importDatabaseDump,
  DatabaseStatusResponse
} from '../services/api';

export const VercelConfigView: React.FC = () => {
  const [data, setData] = useState<VercelConfigResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Database Management & Migration State
  const [dbStatus, setDbStatus] = useState<DatabaseStatusResponse | null>(null);
  const [activeBackendChoice, setActiveBackendChoice] = useState<'firebase' | 'vercel_kv' | 'hybrid'>('firebase');
  const [kvUrlInput, setKvUrlInput] = useState('');
  const [kvTokenInput, setKvTokenInput] = useState('');
  const [autoDualWriteInput, setAutoDualWriteInput] = useState(true);
  const [isTestingKv, setIsTestingKv] = useState(false);
  const [kvTestResult, setKvTestResult] = useState<{ success: boolean; latencyMs: number; message: string } | null>(null);
  const [isTestingFb, setIsTestingFb] = useState(false);
  const [fbTestResult, setFbTestResult] = useState<any | null>(null);
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationStatus, setMigrationStatus] = useState<string | null>(null);
  const [isSavingDbConfig, setIsSavingDbConfig] = useState(false);
  const [isRestoringDump, setIsRestoringDump] = useState(false);

  // Webhook management state
  const [vercelUrlInput, setVercelUrlInput] = useState('');
  const [isSettingWebhook, setIsSettingWebhook] = useState(false);
  const [isDeletingWebhook, setIsDeletingWebhook] = useState(false);
  const [isRefreshingWebhook, setIsRefreshingWebhook] = useState(false);

  // Deployment test state
  const [testUrlInput, setTestUrlInput] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    latencyMs?: number;
    statusData?: any;
  } | null>(null);

  // Instructions toggle state
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  const loadConfig = async () => {
    setIsLoading(true);
    try {
      const [res, dbRes] = await Promise.all([
        fetchVercelConfig(),
        fetchDatabaseStatus().catch(() => null)
      ]);
      setData(res);
      if (dbRes) {
        setDbStatus(dbRes);
        if (dbRes.activeBackend && dbRes.activeBackend !== 'local_file') {
          setActiveBackendChoice(dbRes.activeBackend as any);
        }
        setAutoDualWriteInput(dbRes.autoDualWrite !== false);
      }
      if (res.savedVercelConfig?.customDomain) {
        setVercelUrlInput(res.savedVercelConfig.customDomain);
        setTestUrlInput(res.savedVercelConfig.customDomain);
      } else if (res.savedVercelConfig?.lastWebhookUrl) {
        try {
          const u = new URL(res.savedVercelConfig.lastWebhookUrl);
          setVercelUrlInput(u.origin);
          setTestUrlInput(u.origin);
        } catch {}
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: `Ошибка загрузки данных Vercel: ${err.message}` });
    } finally {
      setIsLoading(false);
    }
  };

  const reloadDbStatus = async () => {
    try {
      const st = await fetchDatabaseStatus();
      setDbStatus(st);
    } catch {}
  };

  const handleSaveDbConfig = async () => {
    setIsSavingDbConfig(true);
    setFeedback(null);
    try {
      await configureDatabase({
        activeBackend: activeBackendChoice,
        kvRestApiUrl: kvUrlInput.trim() || undefined,
        kvRestApiToken: kvTokenInput.trim() || undefined,
        autoDualWrite: autoDualWriteInput,
      });
      await reloadDbStatus();
      setFeedback({
        type: 'success',
        message: `Конфигурация базы данных обновлена! Активный бэкенд: ${
          activeBackendChoice === 'firebase'
            ? 'Firebase Cloud Firestore'
            : activeBackendChoice === 'vercel_kv'
            ? 'Vercel KV (Native Redis)'
            : 'Гибридный режим (Dual-Write)'
        }`,
      });
    } catch (err: any) {
      setFeedback({ type: 'error', message: `Ошибка сохранения настроек БД: ${err.message}` });
    } finally {
      setIsSavingDbConfig(false);
    }
  };

  const handleTestKv = async () => {
    setIsTestingKv(true);
    setKvTestResult(null);
    try {
      const res = await testVercelKvConnection(kvUrlInput.trim() || undefined, kvTokenInput.trim() || undefined);
      setKvTestResult(res);
      if (res.success) {
        await reloadDbStatus();
      }
    } catch (err: any) {
      setKvTestResult({ success: false, latencyMs: 0, message: err.message });
    } finally {
      setIsTestingKv(false);
    }
  };

  const handleTestFb = async () => {
    setIsTestingFb(true);
    setFbTestResult(null);
    try {
      const res = await fetch('/api/firebase/test-rw', { method: 'POST' });
      const data = await res.json();
      setFbTestResult(data);
      if (data.success) {
        await reloadDbStatus();
      }
    } catch (err: any) {
      setFbTestResult({ success: false, message: err.message });
    } finally {
      setIsTestingFb(false);
    }
  };

  const handleMigrate = async (direction: 'firebase_to_vercel' | 'vercel_to_firebase') => {
    const isToVercel = direction === 'firebase_to_vercel';
    const confirmMsg = isToVercel
      ? 'Перенести все данные (пользователи, боты, файлы) из Firebase Cloud в нативную базу Vercel KV?'
      : 'Перенести все данные из Vercel KV в Firebase Cloud Firestore? Текущие записи в Firebase будут обновлены.';
    if (!window.confirm(confirmMsg)) return;

    setIsMigrating(true);
    setMigrationStatus(isToVercel ? 'Экспорт из Firebase ➔ запись в Vercel KV...' : 'Экспорт из Vercel KV ➔ запись в Firebase...');
    setFeedback(null);
    try {
      const res = await migrateDatabase(direction);
      await reloadDbStatus();
      setFeedback({ type: 'success', message: res.message });
      setMigrationStatus(null);
    } catch (err: any) {
      setFeedback({ type: 'error', message: `Ошибка миграции: ${err.message}` });
      setMigrationStatus(null);
    } finally {
      setIsMigrating(false);
    }
  };

  const handleExportDump = () => {
    window.open('/api/database/export-dump', '_blank');
  };

  const handleImportDump = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsRestoringDump(true);
    setFeedback(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const res = await importDatabaseDump(parsed);
      await reloadDbStatus();
      setFeedback({
        type: 'success',
        message: `${res.message} Восстановлено: ${res.counts.users} подписчиков, ${res.counts.bots} ботов.`,
      });
    } catch (err: any) {
      setFeedback({ type: 'error', message: `Ошибка импорта дампа: ${err.message}` });
    } finally {
      setIsRestoringDump(false);
      e.target.value = '';
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const handleSetWebhook = async () => {
    if (!vercelUrlInput.trim()) {
      setFeedback({ type: 'error', message: 'Введите адрес вашего приложения на Vercel (например: https://my-app.vercel.app)' });
      return;
    }
    setIsSettingWebhook(true);
    setFeedback(null);
    try {
      const res = await setVercelWebhook(vercelUrlInput.trim(), true);
      setFeedback({ type: 'success', message: res.message });
      // Reload config to get updated webhook status
      await loadConfig();
    } catch (err: any) {
      setFeedback({ type: 'error', message: `Ошибка установки Webhook: ${err.message}` });
    } finally {
      setIsSettingWebhook(false);
    }
  };

  const handleDeleteWebhook = async () => {
    setIsDeletingWebhook(true);
    setFeedback(null);
    try {
      const res = await deleteVercelWebhook();
      setFeedback({ type: 'success', message: res.message });
      await loadConfig();
    } catch (err: any) {
      setFeedback({ type: 'error', message: `Ошибка сброса Webhook: ${err.message}` });
    } finally {
      setIsDeletingWebhook(false);
    }
  };

  const handleRefreshWebhookInfo = async () => {
    setIsRefreshingWebhook(true);
    try {
      const res = await fetchVercelWebhookInfo();
      if (data) {
        setData({ ...data, webhookInfo: res.webhookInfo });
      }
      setFeedback({ type: 'success', message: 'Статус Webhook в Telegram API обновлен!' });
    } catch (err: any) {
      setFeedback({ type: 'error', message: `Не удалось обновить статус Webhook: ${err.message}` });
    } finally {
      setIsRefreshingWebhook(false);
    }
  };

  const handleTestDeployment = async () => {
    const url = (testUrlInput || vercelUrlInput).trim();
    if (!url) {
      setFeedback({ type: 'error', message: 'Укажите URL для тестирования' });
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await testVercelDeployment(url);
      setTestResult(res);
      if (res.success) {
        setFeedback({ type: 'success', message: res.message });
      } else {
        setFeedback({ type: 'error', message: res.message });
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err.message });
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setIsTesting(false);
    }
  };

  const downloadFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const toggleFaq = (idx: number) => {
    setExpandedFaq(expandedFaq === idx ? null : idx);
  };

  if (isLoading && !data) {
    return (
      <div className="flex flex-col items-center justify-center p-16 space-y-4">
        <RefreshCw className="w-10 h-10 text-indigo-400 animate-spin" />
        <p className="text-slate-400 font-medium">Загрузка параметров бессерверного переноса Vercel...</p>
      </div>
    );
  }

  const isWebhookActive = Boolean(data?.webhookInfo?.url);

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12">
      {/* Banner / Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-[#0B0F17] to-slate-950 border border-indigo-500/20 p-6 md:p-8 shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                <Cloud className="w-3.5 h-3.5" />
                Vercel Serverless
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                <Zap className="w-3.5 h-3.5" />
                Альтернатива Docker «Вставил и всё»
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/30">
                <Radio className="w-3.5 h-3.5" />
                Telegram Webhook Ready
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
              Перенос на Vercel (Бессерверный метод)
            </h1>
            <p className="text-slate-400 text-sm md:text-base max-w-3xl leading-relaxed">
              Резервный и полностью бесплатный способ размещения сервиса без использования Docker и VPS.
              Если ваш сервер упал или недоступен — просто импортируйте репозиторий в Vercel, вставьте переменные окружения, и сервис мгновенно продолжит раздавать подписки HAPP и INCY!
            </p>
          </div>

          <div className="flex flex-col sm:flex-row md:flex-col gap-2.5 w-full md:w-auto shrink-0">
            <button
              onClick={() => copyToClipboard(data?.envVarsText || '', 'all-env-hero')}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm text-white bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] transition-all shadow-lg shadow-indigo-600/30"
            >
              {copiedKey === 'all-env-hero' ? (
                <>
                  <Check className="w-4 h-4 text-emerald-300" />
                  Переменные скопированы!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Скопировать .env для Vercel
                </>
              )}
            </button>
            <a
              href="https://vercel.com/new"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm text-slate-300 bg-slate-800/80 hover:bg-slate-700 hover:text-white border border-slate-700 transition-all"
            >
              <ExternalLink className="w-4 h-4 text-slate-400" />
              Открыть Vercel Dashboard
            </a>
          </div>
        </div>

        {/* Live Status Indicators */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6 pt-6 border-t border-slate-800/60">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-950/50 border border-slate-800/80">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs text-slate-400">Архитектура</div>
              <div className="text-xs font-semibold text-white">Vercel Serverless Function</div>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-950/50 border border-slate-800/80">
            <div className={`p-2 rounded-lg ${isWebhookActive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
              <Radio className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs text-slate-400">Telegram Webhook</div>
              <div className="text-xs font-semibold text-white">
                {isWebhookActive ? 'Подключен к Vercel' : 'Режим Polling (Docker)'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-950/50 border border-slate-800/80">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs text-slate-400">Хранилище данных</div>
              <div className="text-xs font-semibold text-white">Firebase Firestore Cloud</div>
            </div>
          </div>
        </div>
      </div>

      {/* Feedback Alert */}
      {feedback && (
        <div
          className={`flex items-start gap-3 p-4 rounded-xl border transition-all ${
            feedback.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-950/40 border-rose-500/30 text-rose-300'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 text-sm font-medium">{feedback.message}</div>
          <button
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-white text-xs font-mono px-2 py-0.5 rounded hover:bg-slate-800/60"
          >
            ✕
          </button>
        </div>
      )}

      {/* Quick 3-Step Setup ("Просто вставил и всё") */}
      <div className="rounded-2xl bg-[#0F172A]/70 border border-slate-800 p-6 md:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400" />
              Быстрый перенос в 3 шага («Просто вставил и всё»)
            </h2>
            <p className="text-slate-400 text-sm">
              Полный перенос всей системы на Vercel занимает менее 1 минуты без написания кода
            </p>
          </div>
          <span className="hidden sm:inline-block px-3 py-1 rounded-full text-xs font-semibold bg-slate-800 text-indigo-400 border border-indigo-500/20">
            60 секунд
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Step 1 */}
          <div className="flex flex-col justify-between p-5 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-indigo-500/40 transition-all space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="w-8 h-8 rounded-full bg-indigo-600/20 text-indigo-400 font-bold text-sm flex items-center justify-center border border-indigo-500/30">
                  1
                </span>
                <span className="text-xs text-slate-500 font-mono">Git / CLI</span>
              </div>
              <h3 className="font-semibold text-white text-base">Импортируйте проект</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                В панели Vercel нажмите <strong>Add New... &gt; Project</strong> и выберите репозиторий проекта, либо выполните команду в консоли:
              </p>
              <div className="p-2.5 rounded-lg bg-slate-950 font-mono text-xs text-indigo-300 flex items-center justify-between border border-slate-800">
                <span>vercel --prod</span>
                <button
                  onClick={() => copyToClipboard('vercel --prod', 'cmd-step1')}
                  className="text-slate-400 hover:text-white"
                  title="Скопировать"
                >
                  {copiedKey === 'cmd-step1' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
            <a
              href="https://vercel.com/new"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 pt-2 font-medium"
            >
              Открыть Vercel Import <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>

          {/* Step 2 */}
          <div className="flex flex-col justify-between p-5 rounded-xl bg-slate-900/60 border border-indigo-500/30 bg-indigo-950/10 hover:border-indigo-500/50 transition-all space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="w-8 h-8 rounded-full bg-indigo-600 text-white font-bold text-sm flex items-center justify-center shadow-lg shadow-indigo-600/40">
                  2
                </span>
                <span className="text-xs text-amber-400 font-medium">Главный шаг</span>
              </div>
              <h3 className="font-semibold text-white text-base">Вставьте переменные</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Нажмите кнопку ниже. Скопированный блок содержит все ключи GitVerse, Telegram и Firebase. Вставьте его целиком в Vercel в <strong>Environment Variables</strong> (Vercel сам распознает все строки!).
              </p>
              <button
                onClick={() => copyToClipboard(data?.envVarsText || '', 'copy-step2')}
                className="w-full py-2.5 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-md shadow-indigo-600/30"
              >
                {copiedKey === 'copy-step2' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-300" />
                    Скопировано!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Скопировать все .env ключи
                  </>
                )}
              </button>
            </div>
            <p className="text-[11px] text-slate-500 text-center italic">
              «Просто вставил через Ctrl+V и всё»
            </p>
          </div>

          {/* Step 3 */}
          <div className="flex flex-col justify-between p-5 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-indigo-500/40 transition-all space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="w-8 h-8 rounded-full bg-emerald-600/20 text-emerald-400 font-bold text-sm flex items-center justify-center border border-emerald-500/30">
                  3
                </span>
                <span className="text-xs text-emerald-400 font-mono">Готово!</span>
              </div>
              <h3 className="font-semibold text-white text-base">Деплой и Webhook</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Нажмите <strong>Deploy</strong>. Полученный домен вида <code>https://ваше-приложение.vercel.app</code> вставьте в блок Telegram Webhook ниже, чтобы бот начал получать сообщения без задержек.
              </p>
            </div>
            <div className="p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-500/20 text-[11px] text-emerald-300 text-center font-medium">
              ✓ Подписки HAPP и INCY сразу активны
            </div>
          </div>
        </div>
      </div>

      {/* Multi-Database Management & Migration (Firebase <-> Vercel KV) */}
      <div className="rounded-2xl bg-[#0F172A]/70 border border-slate-800 p-6 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400">
                <Database className="w-5 h-5" />
              </span>
              <h2 className="text-xl font-bold text-white">
                База данных: Firebase Cloud Firestore ⇄ Встроенная база Vercel (KV)
              </h2>
            </div>
            <p className="text-slate-400 text-sm">
              Используйте общую облачную базу Firebase, переподключите сервис к местной базе Vercel KV или настройте гибридную двойную запись (Dual-Write) с мгновенным переносом данных.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={reloadDbStatus}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 hover:text-white border border-slate-700 transition-all"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Обновить статус БД
            </button>
          </div>
        </div>

        {/* 3 Backend Options Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Option 1: Firebase */}
          <div
            onClick={() => setActiveBackendChoice('firebase')}
            className={`p-4 rounded-xl border cursor-pointer transition-all ${
              activeBackendChoice === 'firebase'
                ? 'bg-indigo-950/30 border-indigo-500/50 shadow-lg shadow-indigo-500/10'
                : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${
                  activeBackendChoice === 'firebase' ? 'border-indigo-400 bg-indigo-500' : 'border-slate-600'
                }`}>
                  {activeBackendChoice === 'firebase' && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                </div>
                <span className="text-sm font-semibold text-white">Firebase Firestore</span>
              </div>
              <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                dbStatus?.firebase?.connected ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-800 text-slate-400'
              }`}>
                {dbStatus?.firebase?.connected ? 'Активен' : 'Облако'}
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Единая база Google Cloud. Синхронизируется между Docker и Vercel без потерь и без ручного переноса.
            </p>
            <div className="mt-3 text-[11px] font-mono text-slate-500 truncate">
              ID: {dbStatus?.firebase?.databaseId || 'ai-studio-...'}
            </div>
          </div>

          {/* Option 2: Vercel KV */}
          <div
            onClick={() => setActiveBackendChoice('vercel_kv')}
            className={`p-4 rounded-xl border cursor-pointer transition-all ${
              activeBackendChoice === 'vercel_kv'
                ? 'bg-indigo-950/30 border-indigo-500/50 shadow-lg shadow-indigo-500/10'
                : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${
                  activeBackendChoice === 'vercel_kv' ? 'border-indigo-400 bg-indigo-500' : 'border-slate-600'
                }`}>
                  {activeBackendChoice === 'vercel_kv' && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                </div>
                <span className="text-sm font-semibold text-white">Vercel KV (Native Redis)</span>
              </div>
              <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                dbStatus?.vercelKv?.isConfigured ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'
              }`}>
                {dbStatus?.vercelKv?.isConfigured ? 'Подключен' : 'Локальная БД'}
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Встроенная бессерверная база данных проекта Vercel. Минимальный пинг (&lt;10мс) внутри инфраструктуры Vercel.
            </p>
            <div className="mt-3 text-[11px] font-mono text-slate-500 truncate">
              {dbStatus?.vercelKv?.isConfigured ? 'REST API настроен' : 'Требует KV URL и Token'}
            </div>
          </div>

          {/* Option 3: Hybrid Dual-Write */}
          <div
            onClick={() => setActiveBackendChoice('hybrid')}
            className={`p-4 rounded-xl border cursor-pointer transition-all ${
              activeBackendChoice === 'hybrid'
                ? 'bg-indigo-950/30 border-indigo-500/50 shadow-lg shadow-indigo-500/10'
                : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${
                  activeBackendChoice === 'hybrid' ? 'border-indigo-400 bg-indigo-500' : 'border-slate-600'
                }`}>
                  {activeBackendChoice === 'hybrid' && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                </div>
                <span className="text-sm font-semibold text-white">Гибрид (Dual-Write)</span>
              </div>
              <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-purple-500/15 text-purple-400">
                100% Надежность
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Параллельная запись одновременно в Firebase и Vercel KV. Идеально для перехода без риска потери данных.
            </p>
            <div className="mt-3 text-[11px] text-purple-300 font-medium">
              Зеркальная репликация в реальном времени
            </div>
          </div>
        </div>

        {/* Database Migration & Dump Tools */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
            <div>
              <div className="text-sm font-bold text-white flex items-center gap-2">
                <ArrowLeftRight className="w-4 h-4 text-indigo-400" />
                Мастер двусторонней миграции данных
              </div>
              <div className="text-xs text-slate-400">
                Переносите подписчиков, ботов, правила и файлы между Firebase и Vercel KV в один клик
              </div>
            </div>
            {dbStatus?.migration?.lastMigratedAt && (
              <div className="text-[11px] text-slate-400 bg-slate-950 px-2.5 py-1 rounded-md border border-slate-800 font-mono">
                Посл. миграция: {dbStatus.migration.lastMigratedDirection} ({new Date(dbStatus.migration.lastMigratedAt).toLocaleTimeString()})
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Migrate Firebase -> Vercel KV */}
            <button
              onClick={() => handleMigrate('firebase_to_vercel')}
              disabled={isMigrating}
              className="p-3 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-left transition-all group disabled:opacity-50"
            >
              <div className="flex items-center justify-between text-xs font-bold text-indigo-300 mb-1">
                <span>Firebase ➔ Vercel KV</span>
                <UploadCloud className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </div>
              <div className="text-[11px] text-slate-400 leading-tight">
                Скопировать все текущие данные в местную базу Vercel
              </div>
            </button>

            {/* Migrate Vercel KV -> Firebase */}
            <button
              onClick={() => handleMigrate('vercel_to_firebase')}
              disabled={isMigrating}
              className="p-3 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-left transition-all group disabled:opacity-50"
            >
              <div className="flex items-center justify-between text-xs font-bold text-purple-300 mb-1">
                <span>Vercel KV ➔ Firebase</span>
                <DownloadCloud className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </div>
              <div className="text-[11px] text-slate-400 leading-tight">
                Вернуть данные из Vercel KV обратно в Firebase Cloud
              </div>
            </button>

            {/* Export JSON Dump */}
            <button
              onClick={handleExportDump}
              className="p-3 rounded-lg bg-slate-800/80 hover:bg-slate-800 border border-slate-700 text-left transition-all group"
            >
              <div className="flex items-center justify-between text-xs font-bold text-slate-200 mb-1">
                <span>Скачать JSON-дамп</span>
                <Download className="w-4 h-4 text-slate-400 group-hover:translate-y-0.5 transition-transform" />
              </div>
              <div className="text-[11px] text-slate-400 leading-tight">
                Полная автономная резервная копия базы на компьютер
              </div>
            </button>

            {/* Import JSON Dump */}
            <label className="p-3 rounded-lg bg-slate-800/80 hover:bg-slate-800 border border-slate-700 text-left transition-all group cursor-pointer block">
              <input
                type="file"
                accept=".json"
                onChange={handleImportDump}
                disabled={isRestoringDump}
                className="hidden"
              />
              <div className="flex items-center justify-between text-xs font-bold text-slate-200 mb-1">
                <span>{isRestoringDump ? 'Импорт...' : 'Восстановить из JSON'}</span>
                <UploadCloud className="w-4 h-4 text-slate-400 group-hover:-translate-y-0.5 transition-transform" />
              </div>
              <div className="text-[11px] text-slate-400 leading-tight">
                Загрузить файл дампа для восстановления состояния
              </div>
            </label>
          </div>

          {migrationStatus && (
            <div className="p-2.5 rounded-lg bg-indigo-950/40 border border-indigo-500/30 text-xs text-indigo-300 flex items-center gap-2 animate-pulse">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              {migrationStatus}
            </div>
          )}
        </div>

        {/* Vercel KV Credentials Configuration & Tests */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-indigo-400" />
              Параметры подключения к местной базе Vercel KV / Upstash Redis
            </h3>
            <span className="text-xs text-slate-400">
              В Vercel Dashboard: <strong>Storage &gt; Create &gt; KV</strong>
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                KV_REST_API_URL
              </label>
              <input
                type="text"
                value={kvUrlInput}
                onChange={(e) => setKvUrlInput(e.target.value)}
                placeholder="https://...upstash.io (или из process.env)"
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                KV_REST_API_TOKEN
              </label>
              <input
                type="password"
                value={kvTokenInput}
                onChange={(e) => setKvTokenInput(e.target.value)}
                placeholder="Токен авторизации Upstash REST"
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={autoDualWriteInput}
                onChange={(e) => setAutoDualWriteInput(e.target.checked)}
                className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500"
              />
              <span>Включить фоновую параллельную репликацию (Dual-Write)</span>
            </label>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleTestKv}
                disabled={isTestingKv}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all"
              >
                <Activity className={`w-3.5 h-3.5 text-indigo-400 ${isTestingKv ? 'animate-spin' : ''}`} />
                {isTestingKv ? 'Тест KV...' : 'Тест связи Vercel KV'}
              </button>

              <button
                onClick={handleTestFb}
                disabled={isTestingFb}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all"
              >
                <ShieldCheck className={`w-3.5 h-3.5 text-emerald-400 ${isTestingFb ? 'animate-spin' : ''}`} />
                {isTestingFb ? 'Тест Firebase...' : 'Тест чтение/запись Firebase'}
              </button>

              <button
                onClick={handleSaveDbConfig}
                disabled={isSavingDbConfig}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 shadow-md shadow-indigo-600/30 transition-all"
              >
                <Check className="w-3.5 h-3.5" />
                {isSavingDbConfig ? 'Сохранение...' : 'Применить конфигурацию БД'}
              </button>
            </div>
          </div>

          {/* Test Results Display */}
          {kvTestResult && (
            <div className={`p-3 rounded-lg text-xs border ${
              kvTestResult.success ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300' : 'bg-rose-950/30 border-rose-500/30 text-rose-300'
            }`}>
              <div className="font-semibold">{kvTestResult.success ? '✓ Vercel KV доступен!' : '✕ Ошибка Vercel KV'}</div>
              <div>{kvTestResult.message}</div>
              {kvTestResult.latencyMs > 0 && <div className="font-mono text-[11px] mt-0.5">Латентность: {kvTestResult.latencyMs} мс</div>}
            </div>
          )}

          {fbTestResult && (
            <div className={`p-3 rounded-lg text-xs border ${
              fbTestResult.success ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300' : 'bg-rose-950/30 border-rose-500/30 text-rose-300'
            }`}>
              <div className="font-semibold">{fbTestResult.success ? '✓ Firebase Firestore доступен!' : '✕ Ошибка Firebase'}</div>
              <div>{fbTestResult.message}</div>
              {fbTestResult.writeLatencyMs && (
                <div className="font-mono text-[11px] mt-0.5">
                  Запись: {fbTestResult.writeLatencyMs} мс | Чтение: {fbTestResult.readLatencyMs} мс | Путь: {fbTestResult.documentPath}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Telegram Webhook Interactive Manager */}
      <div className="rounded-2xl bg-[#0F172A]/70 border border-slate-800 p-6 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Radio className="w-5 h-5 text-indigo-400" />
              Интерактивный Telegram Webhook для Vercel
            </h2>
            <p className="text-slate-400 text-sm">
              В бессерверной среде Vercel бот не может держать постоянное соединение (long-polling), поэтому Telegram доставляет сообщения через безопасный Webhook
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRefreshWebhookInfo}
              disabled={isRefreshingWebhook}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 hover:text-white border border-slate-700 transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingWebhook ? 'animate-spin' : ''}`} />
              Обновить статус
            </button>
          </div>
        </div>

        {/* Current Active Bot Notice */}
        {data?.activeBot ? (
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-sm">
                TG
              </div>
              <div>
                <div className="text-sm font-semibold text-white flex items-center gap-2">
                  <span>{data.activeBot.name || 'Telegram Bot'}</span>
                  {data.activeBot.username && (
                    <span className="text-xs text-indigo-400 font-mono">@{data.activeBot.username}</span>
                  )}
                </div>
                <div className="text-xs text-slate-400">
                  {data.activeBot.hasToken ? 'Токен установлен и готов к работе' : 'Токен не настроен'}
                </div>
              </div>
            </div>
            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${isWebhookActive ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-400'}`}>
              {isWebhookActive ? 'Webhook активен' : 'Long-polling'}
            </span>
          </div>
        ) : (
          <div className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-500/30 text-amber-300 text-xs">
            ⚠️ Для настройки Webhook сначала настройте токен Telegram бота во вкладке «Telegram Боты».
          </div>
        )}

        {/* Set Webhook Form */}
        <div className="space-y-4">
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Адрес вашего приложения на Vercel
          </label>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Globe className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
              <input
                type="text"
                value={vercelUrlInput}
                onChange={(e) => setVercelUrlInput(e.target.value)}
                placeholder="https://my-puls-app.vercel.app"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-mono"
              />
            </div>
            <button
              onClick={handleSetWebhook}
              disabled={isSettingWebhook || !data?.activeBot?.hasToken}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-sm shadow-md shadow-indigo-600/30 transition-all shrink-0"
            >
              {isSettingWebhook ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Регистрация...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 text-amber-300" />
                  Установить Webhook на Vercel
                </>
              )}
            </button>
            {isWebhookActive && (
              <button
                onClick={handleDeleteWebhook}
                disabled={isDeletingWebhook}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-rose-950/60 hover:text-rose-300 hover:border-rose-500/40 text-slate-300 border border-slate-700 text-sm transition-all shrink-0"
                title="Удалить Webhook и вернуться в режим Docker Long-polling"
              >
                <Trash2 className="w-4 h-4 text-rose-400" />
                Сбросить Webhook
              </button>
            )}
          </div>
          <p className="text-xs text-slate-500">
            Endpoint вебхука автоматически формируется как <code>{vercelUrlInput ? vercelUrlInput.replace(/\/+$/, '') : 'https://ваш-домен.vercel.app'}/api/telegram-webhook</code>
          </p>
        </div>

        {/* Live Telegram API Webhook Info Display */}
        {data?.webhookInfo && (
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Текущий статус в Telegram API (getWebhookInfo)
              </span>
              <span className="text-[11px] text-slate-500 font-mono">
                {data.webhookInfo.has_custom_certificate ? 'Custom SSL' : 'Telegram Trusted SSL'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-slate-900/70 border border-slate-800">
                <div className="text-slate-500">URL вебхука</div>
                <div className="font-mono text-white truncate font-medium mt-0.5" title={data.webhookInfo.url || 'Не установлен'}>
                  {data.webhookInfo.url || 'Не установлен'}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-900/70 border border-slate-800">
                <div className="text-slate-500">Очередь сообщений</div>
                <div className="font-mono text-white font-medium mt-0.5">
                  {data.webhookInfo.pending_update_count ?? 0} в очереди
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-900/70 border border-slate-800">
                <div className="text-slate-500">Макс. соединений</div>
                <div className="font-mono text-white font-medium mt-0.5">
                  {data.webhookInfo.max_connections ?? 40}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-900/70 border border-slate-800">
                <div className="text-slate-500">Ошибки доставки</div>
                <div className="font-mono text-white font-medium mt-0.5">
                  {data.webhookInfo.last_error_message ? (
                    <span className="text-rose-400 truncate block" title={data.webhookInfo.last_error_message}>
                      {data.webhookInfo.last_error_message}
                    </span>
                  ) : (
                    <span className="text-emerald-400">Нет ошибок</span>
                  )}
                </div>
              </div>
            </div>

            {data.webhookInfo.last_error_date && (
              <p className="text-[11px] text-rose-400">
                ⚠️ Последняя ошибка доставки Telegram: {data.webhookInfo.last_error_message} ({new Date(data.webhookInfo.last_error_date * 1000).toLocaleString('ru-RU')})
              </p>
            )}
          </div>
        )}
      </div>

      {/* Deployment Health & Diagnostic Ping */}
      <div className="rounded-2xl bg-[#0F172A]/70 border border-slate-800 p-6 md:p-8 space-y-6">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-400" />
            Проверка доступности развернутого Vercel сайта
          </h2>
          <p className="text-slate-400 text-sm">
            Протестируйте отклик бессерверного API на вашем Vercel домене для подтверждения корректной работы
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Globe className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
            <input
              type="text"
              value={testUrlInput}
              onChange={(e) => setTestUrlInput(e.target.value)}
              placeholder="https://my-app.vercel.app"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div>
          <button
            onClick={handleTestDeployment}
            disabled={isTesting}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-semibold text-sm transition-all shrink-0"
          >
            {isTesting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
                Тестирование...
              </>
            ) : (
              <>
                <Play className="w-4 h-4 text-emerald-400" />
                Проверить отклик API
              </>
            )}
          </button>
        </div>

        {testResult && (
          <div
            className={`p-4 rounded-xl border ${
              testResult.success
                ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-200'
                : 'bg-rose-950/30 border-rose-500/30 text-rose-200'
            } text-xs space-y-2`}
          >
            <div className="flex items-center justify-between font-semibold">
              <span className="flex items-center gap-1.5">
                {testResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertCircle className="w-4 h-4 text-rose-400" />}
                {testResult.message}
              </span>
              {typeof testResult.latencyMs === 'number' && (
                <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-black/40">
                  Пинг: {testResult.latencyMs} ms
                </span>
              )}
            </div>
            {testResult.statusData && (
              <div className="mt-2 p-3 rounded-lg bg-black/40 font-mono text-[11px] space-y-1 text-slate-300">
                <div>Версия сервиса: {testResult.statusData.version || '1.0.0'}</div>
                <div>Пользователей в базе: {testResult.statusData.userCount ?? testResult.statusData.totalUsers ?? '✓'}</div>
                <div>Центральный файл: {testResult.statusData.centralFile?.filename || 'L'}</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Configuration Files: vercel.json & Environment Variables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* vercel.json preview */}
        <div className="rounded-2xl bg-[#0F172A]/70 border border-slate-800 p-6 space-y-4 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCode className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-white text-base">Конфигурация vercel.json</h3>
              </div>
              <span className="text-xs font-mono text-slate-500">Root Directory</span>
            </div>
            <p className="text-xs text-slate-400">
              Этот файл уже находится в корне проекта и сообщает Vercel правила сборки SPA, таймаут бессерверных функций (30 сек) и перенаправление маршрутов <code>/api/*</code>.
            </p>
          </div>

          <div className="relative group">
            <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 font-mono text-xs text-indigo-300 overflow-x-auto max-h-64 leading-relaxed">
              {data?.vercelJson || '{\n  "version": 2,\n  "buildCommand": "vite build",\n  "outputDirectory": "dist"\n}'}
            </pre>
            <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 opacity-90 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => copyToClipboard(data?.vercelJson || '', 'copy-vercel-json')}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700"
                title="Скопировать vercel.json"
              >
                {copiedKey === 'copy-vercel-json' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={() => downloadFile('vercel.json', data?.vercelJson || '')}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700"
                title="Скачать vercel.json"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-xs text-slate-400">
            <span>Включает: Vite build + Express API + Serverless Functions</span>
            <button
              onClick={() => copyToClipboard(data?.vercelJson || '', 'copy-vercel-json-btn')}
              className="text-indigo-400 hover:text-indigo-300 font-medium"
            >
              Скопировать код
            </button>
          </div>
        </div>

        {/* Complete Environment Variables Block */}
        <div className="rounded-2xl bg-[#0F172A]/70 border border-slate-800 p-6 space-y-4 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-white text-base">Блок .env для Vercel</h3>
              </div>
              <button
                onClick={() => copyToClipboard(data?.envVarsText || '', 'copy-env-block')}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow transition-all"
              >
                {copiedKey === 'copy-env-block' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                Скопировать .env
              </button>
            </div>
            <p className="text-xs text-slate-400">
              В Vercel Dashboard перейдите в <strong>Settings &gt; Environment Variables</strong> и просто нажмите <code>Ctrl+V</code> в поле Key — Vercel автоматически заполнит все ключи!
            </p>
          </div>

          <div className="relative group">
            <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 font-mono text-xs text-emerald-300/90 overflow-x-auto max-h-64 leading-relaxed">
              {data?.envVarsText || 'NODE_ENV=production\nVERCEL=1'}
            </pre>
            <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 opacity-90 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => downloadFile('.env.production', data?.envVarsText || '')}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700"
                title="Скачать .env.production"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-xs text-slate-400">
            <span>Всего параметров: {data?.envVarsList?.length || 0}</span>
            <span className="text-slate-500">Автоматически маскирует секреты</span>
          </div>
        </div>
      </div>

      {/* Detailed Variables Breakdown List */}
      <div className="rounded-2xl bg-[#0F172A]/70 border border-slate-800 p-6 md:p-8 space-y-4">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <Layers className="w-5 h-5 text-indigo-400" />
          Детализация переменных окружения
        </h3>
        <p className="text-slate-400 text-xs">
          Каждая переменная может быть скопирована по отдельности при ручной настройке
        </p>

        <div className="space-y-2.5">
          {data?.envVarsList.map((item) => (
            <div
              key={item.key}
              className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 transition-all gap-2"
            >
              <div className="space-y-0.5 flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-indigo-300">{item.key}</span>
                  {item.required && (
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                      Обязателен
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 truncate">{item.description}</p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <div className="font-mono text-xs text-slate-400 bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800 max-w-[220px] truncate">
                  {item.value ? (item.key.includes('TOKEN') || item.key.includes('KEY') ? '••••••••••••' : item.value) : '—'}
                </div>
                <button
                  onClick={() => copyToClipboard(item.value, `var-${item.key}`)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-all"
                  title="Скопировать значение"
                >
                  {copiedKey === `var-${item.key}` ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Step-by-Step Complete Manual & FAQ */}
      <div className="rounded-2xl bg-[#0F172A]/70 border border-slate-800 p-6 md:p-8 space-y-6">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-indigo-400" />
            Подробная пошаговая инструкция по развертыванию на Vercel
          </h2>
          <p className="text-slate-400 text-sm">
            Ответы на частые вопросы и полное руководство для администратора
          </p>
        </div>

        <div className="space-y-3">
          {/* FAQ 1 */}
          <div className="rounded-xl bg-slate-900/60 border border-slate-800 overflow-hidden">
            <button
              onClick={() => toggleFaq(1)}
              className="w-full flex items-center justify-between p-4 text-left font-semibold text-sm text-white hover:text-indigo-300 transition-all"
            >
              <span>1. Как создать проект в Vercel и подключить репозиторий?</span>
              {expandedFaq === 1 ? <ChevronUp className="w-4 h-4 text-indigo-400" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
            </button>
            {expandedFaq === 1 && (
              <div className="p-4 pt-0 text-xs text-slate-300 space-y-2 border-t border-slate-800/60 mt-1 leading-relaxed">
                <p>1. Перейдите на официальный сайт <a href="https://vercel.com" target="_blank" rel="noreferrer" className="text-indigo-400 underline">vercel.com</a> и войдите через ваш GitHub/GitLab аккаунт (или создайте бесплатный личный аккаунт Hobby).</p>
                <p>2. В главном меню нажмите <strong>Add New... &gt; Project</strong>.</p>
                <p>3. Выберите репозиторий с кодом сервиса и нажмите <strong>Import</strong>.</p>
                <p>4. В поле <strong>Framework Preset</strong> выберите <em>Vite</em> или <em>Other</em> (Vercel определит автоматически благодаря файлу <code>vercel.json</code>).</p>
              </div>
            )}
          </div>

          {/* FAQ 2 */}
          <div className="rounded-xl bg-slate-900/60 border border-slate-800 overflow-hidden">
            <button
              onClick={() => toggleFaq(2)}
              className="w-full flex items-center justify-between p-4 text-left font-semibold text-sm text-white hover:text-indigo-300 transition-all"
            >
              <span>2. Как вставить скопированные переменные окружения?</span>
              {expandedFaq === 2 ? <ChevronUp className="w-4 h-4 text-indigo-400" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
            </button>
            {expandedFaq === 2 && (
              <div className="p-4 pt-0 text-xs text-slate-300 space-y-2 border-t border-slate-800/60 mt-1 leading-relaxed">
                <p>1. Нажмите фиолетовую кнопку <strong>«Скопировать .env для Vercel»</strong> на этой странице.</p>
                <p>2. На странице импорта проекта в Vercel разверните вкладку <strong>Environment Variables</strong>.</p>
                <p>3. Кликните в поле первого ключа (Key) и нажмите <strong>Ctrl+V</strong> (или Cmd+V на Mac). Vercel умный — он автоматически распарсит все строки и заполнит ключи со значениями!</p>
                <p>4. Нажмите <strong>Deploy</strong>.</p>
              </div>
            )}
          </div>

          {/* FAQ 3 */}
          <div className="rounded-xl bg-slate-900/60 border border-slate-800 overflow-hidden">
            <button
              onClick={() => toggleFaq(3)}
              className="w-full flex items-center justify-between p-4 text-left font-semibold text-sm text-white hover:text-indigo-300 transition-all"
            >
              <span>3. Почему для Vercel нужен Telegram Webhook и как он работает?</span>
              {expandedFaq === 3 ? <ChevronUp className="w-4 h-4 text-indigo-400" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
            </button>
            {expandedFaq === 3 && (
              <div className="p-4 pt-0 text-xs text-slate-300 space-y-2 border-t border-slate-800/60 mt-1 leading-relaxed">
                <p>В Docker контейнере бот запущен непрерывно и сам опрашивает Telegram (Long-Polling). В Vercel серверные функции «засыпают», когда нет запросов, экономя ресурсы.</p>
                <p>Webhook сообщает Telegram: «Когда пользователь пишет боту, пришли POST-запрос на <code>https://ваше-приложение.vercel.app/api/telegram-webhook</code>». Функция мгновенно просыпается за несколько миллисекунд, обрабатывает команду, выдает подписку и засыпает. Это абсолютно прозрачно для пользователя бота!</p>
              </div>
            )}
          </div>

          {/* FAQ 4 */}
          <div className="rounded-xl bg-slate-900/60 border border-slate-800 overflow-hidden">
            <button
              onClick={() => toggleFaq(4)}
              className="w-full flex items-center justify-between p-4 text-left font-semibold text-sm text-white hover:text-indigo-300 transition-all"
            >
              <span>4. Docker или Vercel: что лучше выбрать?</span>
              {expandedFaq === 4 ? <ChevronUp className="w-4 h-4 text-indigo-400" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
            </button>
            {expandedFaq === 4 && (
              <div className="p-4 pt-0 text-xs text-slate-300 space-y-2 border-t border-slate-800/60 mt-1 leading-relaxed">
                <p><strong>Docker на VPS:</strong> Идеален для автономной работы 24/7, полного контроля над процессами и частых периодических фоновых синхронизаций.</p>
                <p><strong>Vercel:</strong> Идеален как надежный бессерверный дублер, если у вас нет VPS, если сервер на ремонте или заблокирован, или для моментального тестирования. Работает полностью бесплатно в облаке Vercel.</p>
                <p>Оба метода используют одну и ту же базу Cloud Firestore и GitVerse, поэтому вы можете переключаться между ними в любой момент без потери данных!</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
