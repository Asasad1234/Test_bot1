import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Server,
  Cloud,
  Zap,
  Globe,
  Copy,
  Check,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  Power,
  Terminal,
  Activity,
  ArrowRight,
  Sparkles,
  Info,
  CreditCard,
  Clock,
  Code2,
  Laptop
} from 'lucide-react';
import { RelayGatewayConfig } from '../types';
import {
  fetchRelayGatewayConfig,
  saveRelayGatewayConfig,
  testRelayGateway,
  triggerManualGatewayAudit,
  runGatewayPass
} from '../services/api';

export const RelayGatewayView: React.FC = () => {
  const [config, setConfig] = useState<RelayGatewayConfig | null>(null);
  const [backendUrl, setBackendUrl] = useState<string>('');
  const [yandexSnippet, setYandexSnippet] = useState<string>('');
  const [begetSnippet, setBegetSnippet] = useState<string>('');
  const [htaccessSnippet, setHtaccessSnippet] = useState<string>('');
  const [cloudflareSnippet, setCloudflareSnippet] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isAuditing, setIsAuditing] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [selectedInstructionTab, setSelectedInstructionTab] = useState<'gitverse' | 'beget' | 'cloudflare' | 'yandex' | 'nginx'>('gitverse');

  // Form state
  const [enabled, setEnabled] = useState(false);
  const [gatewayUrl, setGatewayUrl] = useState('');
  const [provider, setProvider] = useState<'gitverse_whitelist' | 'beget_free' | 'cloudflare_worker' | 'yandex_cloud' | 'custom_vps' | 'local_tunnel'>('gitverse_whitelist');
  const [gatewayMode, setGatewayMode] = useState<'scheduled_daily' | 'always_gateway' | 'direct_whitelist'>('scheduled_daily');
  const [whitelistMode, setWhitelistMode] = useState(true);
  const [checkIntervalHours, setCheckIntervalHours] = useState(12);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const res = await fetchRelayGatewayConfig();
      if (res && res.success) {
        setConfig(res.config);
        setEnabled(Boolean(res.config?.enabled));
        setGatewayUrl(res.config?.url || '');
        setProvider(res.config?.provider || 'gitverse_whitelist');
        setGatewayMode(res.config?.gatewayMode || (res.config?.whitelistMode !== false ? 'scheduled_daily' : 'always_gateway'));
        setWhitelistMode(res.config?.whitelistMode !== false);
        setCheckIntervalHours(res.config?.checkIntervalHours || 12);
        setBackendUrl(res.backendUrl || '');
        setYandexSnippet(res.yandexCodeSnippet || '');
        setBegetSnippet(res.begetCodeSnippet || '');
        setHtaccessSnippet(res.htaccessSnippet || '');
        setCloudflareSnippet(res.cloudflareCodeSnippet || '');
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: 'Ошибка загрузки конфигурации шлюза: ' + err.message });
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

  const handleSave = async (customEnabled?: boolean) => {
    setIsSaving(true);
    setFeedback(null);
    try {
      const toEnable = typeof customEnabled === 'boolean' ? customEnabled : enabled;
      const res = await saveRelayGatewayConfig({
        enabled: toEnable,
        url: gatewayUrl.trim(),
        provider: provider,
        gatewayMode: gatewayMode,
        whitelistMode: whitelistMode,
        checkIntervalHours: Number(checkIntervalHours),
      });
      if (res.success) {
        setConfig(res.config);
        setEnabled(Boolean(res.config.enabled));
        setFeedback({ type: 'success', message: 'Настройки шлюза успешно сохранены и применены!' });
      } else {
        setFeedback({ type: 'error', message: res.message || 'Ошибка сохранения' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Сбой при сохранении' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRunGatewayPass = async () => {
    setIsAuditing(true);
    setFeedback(null);
    try {
      const res = await runGatewayPass();
      if (res.success) {
        setFeedback({
          type: 'success',
          message: res.message || 'Проход шлюза (Gateway Pass) успешно завершен!',
        });
        await loadData();
      } else {
        setFeedback({
          type: 'error',
          message: res.message || 'Ошибка выполнения проверки',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: 'Ошибка при запуске проверки шлюза: ' + err.message,
      });
    } finally {
      setIsAuditing(false);
    }
  };

  const handleTest = async () => {
    if (!gatewayUrl.trim()) {
      setFeedback({ type: 'error', message: 'Сначала укажите адрес шлюза (URL)' });
      return;
    }
    setIsTesting(true);
    setFeedback(null);
    try {
      const res = await testRelayGateway(gatewayUrl.trim());
      if (res.success) {
        setFeedback({
          type: 'success',
          message: `Успех! Шлюз доступен, пинг: ${res.latencyMs} мс. Соединение с РФ работает!`
        });
        loadData();
      } else {
        setFeedback({
          type: 'error',
          message: res.message || 'Не удалось связаться со шлюзом'
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: 'Ошибка при проверке шлюза: ' + err.message
      });
    } finally {
      setIsTesting(false);
    }
  };

  const nginxConfigSnippet = `# Конфигурация Nginx для проксирования на российском сервере
# Сохранить в: /etc/nginx/sites-available/relay
server {
    listen 80;
    server_name ${gatewayUrl ? gatewayUrl.replace(/^https?:\/\//, '').replace(/\/.*$/, '') : 'sub.your-domain.ru'};

    # Проброс всех запросов клиентов (HAPP / Sing-box / V2Ray)
    location / {
        proxy_pass ${backendUrl || 'https://your-main-app.onrender.com'};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header User-Agent $http_user_agent;
        proxy_buffering off;
        proxy_read_timeout 60s;
    }
}`;

  const begetDefaultCode = `<?php
// Beget Бесплатный RU Шлюз (Без привязки банковской карты, сервера в РФ)
// Поместите этот файл как index.php в корень бесплатного сайта на Beget (.bget.ru)
$upstream = "${backendUrl || 'https://your-main-app.onrender.com'}";
$path = $_SERVER['REQUEST_URI'] ?? '/';
$target = rtrim($upstream, '/') . $path;

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

  const cloudflareDefaultCode = `// Cloudflare Workers (100,000 запросов/день БЕСПЛАТНО, БЕЗ привязки карты)
export default {
  async fetch(request) {
    const upstream = "${backendUrl || 'https://your-main-app.onrender.com'}";
    const url = new URL(request.url);
    const targetUrl = upstream.replace(/\\/+$/, '') + url.pathname + url.search;

    const newHeaders = new Headers(request.headers);
    newHeaders.delete('host');
    const clientIp = request.headers.get('cf-connecting-ip') || '';
    if ($clientIp) {
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

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-400">
        <RefreshCw className="w-8 h-8 animate-spin text-indigo-500 mb-3" />
        <p className="text-sm">Загрузка параметров российского шлюза...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner / Explanation */}
      <div className="bg-gradient-to-r from-indigo-950 via-slate-900 to-emerald-950 border border-indigo-700/40 rounded-2xl p-6 shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <Globe className="w-48 h-48 text-indigo-400" />
        </div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
              <Sparkles className="w-3.5 h-3.5" />
              Белые списки РФ + 100% БЕСПЛАТНО (Без привязки банковских карт)
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <Server className="w-6 h-6 text-indigo-400" />
              Российский Шлюз & Белые Списки (RU Relay Gateway)
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Если в Яндекс.Облаке требуют привязать банковскую карту — <b>не переживайте</b>! Вы можете использовать полностью бесплатные варианты без карт: 
              <b> GitVerse (Сбер)</b> напрямую, бесплатный хостинг <b>Beget (.bget.ru)</b> в СПб или <b>Cloudflare Workers</b>.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
            <button
              id="btn-run-gateway-pass-top"
              onClick={handleRunGatewayPass}
              disabled={isAuditing}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-950 flex items-center justify-center gap-2 transition-all cursor-pointer"
              title="Запустить немедленный проход шлюза (Gateway Pass)"
            >
              <RefreshCw className={`w-4 h-4 ${isAuditing ? 'animate-spin' : ''}`} />
              <span>{isAuditing ? 'Проход...' : 'Run Gateway Pass'}</span>
            </button>
            <button
              id="btn-toggle-gateway"
              onClick={() => handleSave(!enabled)}
              disabled={isSaving}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-md ${
                enabled
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950'
                  : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
              }`}
            >
              <Power className="w-4 h-4" />
              <span>{enabled ? 'Шлюз активен (ВКЛ)' : 'Включить шлюз'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Feedback Alert */}
      {feedback && (
        <div
          className={`p-4 rounded-xl border flex items-start gap-3 transition-all ${
            feedback.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
              : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 text-xs sm:text-sm font-medium">{feedback.message}</div>
          <button
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-white text-xs font-semibold px-2 py-0.5 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* CARD 1: Mode Switcher - 'Always Gateway' vs 'Gateway 1-2 times daily' vs 'Direct GitVerse' */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-md space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-400" />
              Режим работы шлюза (Gateway Mode)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Выберите, как клиенты взаимодействуют со шлюзом для обеспечения доступности в «белых списках»:
            </p>
          </div>

          <button
            id="btn-run-gateway-pass-main"
            onClick={handleRunGatewayPass}
            disabled={isAuditing}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs flex items-center gap-2 transition-all cursor-pointer shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isAuditing ? 'animate-spin' : ''}`} />
            <span>{isAuditing ? 'Синхронизация...' : 'Run Gateway Pass'}</span>
          </button>
        </div>

        {/* 3 Modes Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Mode 1: Scheduled Daily */}
          <div
            onClick={() => {
              setGatewayMode('scheduled_daily');
              setWhitelistMode(true);
            }}
            className={`p-4 rounded-xl border cursor-pointer transition-all ${
              gatewayMode === 'scheduled_daily'
                ? 'bg-emerald-950/40 border-emerald-500 text-white ring-1 ring-emerald-500/50'
                : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold">Шлюз 1-2 раза в день</span>
              </div>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">
                Рекомендуется
              </span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Первая установка и обновления идут напрямую через <b>GitVerse (белый список РФ)</b>. Шлюз проверяет подписку 1-2 раза в сутки или по кнопке Run Gateway Pass.
            </p>
          </div>

          {/* Mode 2: Always Gateway */}
          <div
            onClick={() => {
              setGatewayMode('always_gateway');
              setWhitelistMode(false);
            }}
            className={`p-4 rounded-xl border cursor-pointer transition-all ${
              gatewayMode === 'always_gateway'
                ? 'bg-indigo-950/40 border-indigo-500 text-white ring-1 ring-indigo-500/50'
                : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-indigo-400" />
                <span className="text-xs font-bold">Всегда через шлюз</span>
              </div>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300">
                Always Gateway
              </span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Абсолютно каждый запрос клиента маршрутизируется через шлюз-посредник. Мгновенно отслеживает User-Agent и HWID при любом обновлении.
            </p>
          </div>

          {/* Mode 3: Direct Whitelist */}
          <div
            onClick={() => {
              setGatewayMode('direct_whitelist');
              setWhitelistMode(true);
            }}
            className={`p-4 rounded-xl border cursor-pointer transition-all ${
              gatewayMode === 'direct_whitelist'
                ? 'bg-teal-950/40 border-teal-500 text-white ring-1 ring-teal-500/50'
                : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-teal-400" />
                <span className="text-xs font-bold">Прямой GitVerse (0 руб)</span>
              </div>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300">
                Без сторонних серверов
              </span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              100% автономная раздача через GitVerse Сбера. Никаких сторонних реле и прокси. Самый устойчивый вариант без карты и без серверов.
            </p>
          </div>
        </div>

        {/* Interval Selector & Audit Status */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-2">
            <label className="text-xs font-bold text-white block">
              Интервал проверки шлюзом (при режиме «1-2 раза в день»):
            </label>
            <select
              value={checkIntervalHours}
              onChange={(e) => setCheckIntervalHours(Number(e.target.value))}
              className="w-full bg-slate-900 border border-slate-700 focus:border-indigo-500 rounded-lg px-3 py-2 text-xs text-white font-medium outline-none"
            >
              <option value={12}>Каждые 12 часов (2 раза в день) — Оптимально</option>
              <option value={24}>Каждые 24 часа (1 раз в день)</option>
              <option value={8}>Каждые 8 часов (3 раза в день)</option>
              <option value={6}>Каждые 6 часов (4 раза в день)</option>
            </select>
            <p className="text-[11px] text-slate-400">
              Фоновый планировщик каждые {checkIntervalHours} ч. проверяет срок действия и актуализирует файлы в GitVerse.
            </p>
          </div>

          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
            <div className="space-y-1">
              <span className="text-xs font-bold text-white block">Статус последнего прохода шлюза:</span>
              <p className="text-xs text-slate-300">
                {config?.lastAuditAt ? (
                  <>
                    <b>Выполнен:</b> {new Date(config.lastAuditAt).toLocaleString('ru-RU')}
                    {config.lastAuditMessage && (
                      <span className="block text-[11px] text-slate-400 mt-1">{config.lastAuditMessage}</span>
                    )}
                  </>
                ) : (
                  <span className="text-slate-400">Проверка шлюза еще не производилась</span>
                )}
              </p>
            </div>
            <div className="pt-2">
              <button
                onClick={() => handleSave()}
                disabled={isSaving}
                className="w-full py-2 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer"
              >
                {isSaving ? 'Сохранение...' : 'Применить режим работы'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* CARD 2: FREE Options WITHOUT Card vs Other Providers */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-md space-y-6">
        <div className="border-b border-slate-800 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-emerald-400" />
              Провайдер шлюза: Бесплатные варианты БЕЗ привязки карты
            </h3>
            <p className="text-xs text-slate-400">
              Выберите платформу, через которую будет работать ваш адрес шлюза:
            </p>
          </div>

          {config?.lastTestedAt && (
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg text-xs bg-slate-800 border border-slate-700">
              <span className="text-slate-400">Пинг шлюза:</span>
              {config.lastTestStatus === 'success' ? (
                <span className="text-emerald-400 font-bold">{config.lastTestLatencyMs} мс (OK)</span>
              ) : (
                <span className="text-rose-400 font-bold">Ошибка</span>
              )}
            </div>
          )}
        </div>

        {/* Provider Buttons */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* 1. GitVerse */}
          <button
            type="button"
            onClick={() => {
              setProvider('gitverse_whitelist');
              setSelectedInstructionTab('gitverse');
            }}
            className={`p-3 rounded-xl border text-left transition-all ${
              provider === 'gitverse_whitelist'
                ? 'bg-emerald-950/60 border-emerald-500 text-white ring-1 ring-emerald-500/50'
                : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold">GitVerse (Сбер)</span>
            </div>
            <span className="text-[10px] text-emerald-300 font-semibold block">0 руб • БЕЗ КАРТЫ</span>
            <p className="text-[10px] text-slate-400 mt-1 leading-tight">
              Встроен в систему, высший приоритет в РФ
            </p>
          </button>

          {/* 2. Beget Free */}
          <button
            type="button"
            onClick={() => {
              setProvider('beget_free');
              setSelectedInstructionTab('beget');
            }}
            className={`p-3 rounded-xl border text-left transition-all ${
              provider === 'beget_free'
                ? 'bg-emerald-950/60 border-emerald-500 text-white ring-1 ring-emerald-500/50'
                : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <Server className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold">Beget Хостинг</span>
            </div>
            <span className="text-[10px] text-emerald-300 font-semibold block">0 руб • БЕЗ КАРТЫ</span>
            <p className="text-[10px] text-slate-400 mt-1 leading-tight">
              Сервера в СПб, домен bget.ru, PHP скрипт
            </p>
          </button>

          {/* 3. Cloudflare Workers */}
          <button
            type="button"
            onClick={() => {
              setProvider('cloudflare_worker');
              setSelectedInstructionTab('cloudflare');
            }}
            className={`p-3 rounded-xl border text-left transition-all ${
              provider === 'cloudflare_worker'
                ? 'bg-indigo-950/60 border-indigo-500 text-white ring-1 ring-indigo-500/50'
                : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <Cloud className="w-4 h-4 text-indigo-400" />
              <span className="text-xs font-bold">Cloudflare</span>
            </div>
            <span className="text-[10px] text-indigo-300 font-semibold block">0 руб • БЕЗ КАРТЫ</span>
            <p className="text-[10px] text-slate-400 mt-1 leading-tight">
              100,000 запросов/день бесплатно
            </p>
          </button>

          {/* 4. Yandex Cloud */}
          <button
            type="button"
            onClick={() => {
              setProvider('yandex_cloud');
              setSelectedInstructionTab('yandex');
            }}
            className={`p-3 rounded-xl border text-left transition-all ${
              provider === 'yandex_cloud'
                ? 'bg-amber-950/60 border-amber-500 text-white ring-1 ring-amber-500/50'
                : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <Cloud className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold">Яндекс.Облако</span>
            </div>
            <span className="text-[10px] text-amber-300 font-semibold block">0 руб • Нужна карта</span>
            <p className="text-[10px] text-slate-400 mt-1 leading-tight">
              1 млн вызовов, но требует карту при регистрации
            </p>
          </button>

          {/* 5. Custom VPS */}
          <button
            type="button"
            onClick={() => {
              setProvider('custom_vps');
              setSelectedInstructionTab('nginx');
            }}
            className={`p-3 rounded-xl border text-left transition-all ${
              provider === 'custom_vps'
                ? 'bg-indigo-950/60 border-indigo-500 text-white ring-1 ring-indigo-500/50'
                : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <Terminal className="w-4 h-4 text-indigo-400" />
              <span className="text-xs font-bold">Свой VPS / Nginx</span>
            </div>
            <span className="text-[10px] text-slate-400 font-semibold block">50-90 руб/мес</span>
            <p className="text-[10px] text-slate-400 mt-1 leading-tight">
              Любой хостинг в РФ со своим доменом .ru
            </p>
          </button>
        </div>

        {/* Gateway URL Input */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <label className="text-xs font-bold text-slate-200 uppercase tracking-wider block">
              Публичный адрес шлюза (URL):
            </label>
            <span className="text-[11px] text-slate-400">
              {provider === 'gitverse_whitelist'
                ? 'Для встроенного GitVerse адрес шлюза не требуется (используются ссылки GitVerse)'
                : provider === 'beget_free'
                ? 'Например: https://myname.bget.ru'
                : provider === 'cloudflare_worker'
                ? 'Например: https://sub-relay.my-account.workers.dev'
                : provider === 'yandex_cloud'
                ? 'Например: https://functions.yandexcloud.net/d4e...'
                : 'Например: https://sub.my-domain.ru'}
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <input
              type="text"
              value={gatewayUrl}
              onChange={(e) => setGatewayUrl(e.target.value)}
              disabled={provider === 'gitverse_whitelist'}
              placeholder={
                provider === 'gitverse_whitelist'
                  ? 'Автоматически: https://gitverse.ru/... (встроено)'
                  : provider === 'beget_free'
                  ? 'https://login.bget.ru'
                  : provider === 'cloudflare_worker'
                  ? 'https://sub-relay.workers.dev'
                  : 'https://...'
              }
              className="flex-1 bg-slate-900 border border-slate-700 focus:border-indigo-500 rounded-lg px-3.5 py-2 text-xs font-mono text-white placeholder-slate-500 outline-none disabled:opacity-50"
            />

            <button
              onClick={handleTest}
              disabled={isTesting || !gatewayUrl.trim() || provider === 'gitverse_whitelist'}
              className="px-4 py-2 rounded-lg text-xs font-bold bg-indigo-600/40 hover:bg-indigo-600 text-indigo-200 border border-indigo-500/40 flex items-center justify-center gap-1.5 transition-all disabled:opacity-40 cursor-pointer shrink-0"
            >
              <Activity className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
              <span>{isTesting ? 'Проверка...' : 'Пинг шлюза'}</span>
            </button>

            <button
              onClick={() => handleSave()}
              disabled={isSaving}
              className="px-4 py-2 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all cursor-pointer shrink-0"
            >
              {isSaving ? 'Сохранение...' : 'Сохранить URL'}
            </button>
          </div>
        </div>
      </div>

      {/* CARD 3: Detailed Step-by-Step Guides with Ready Snippets */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-md space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Terminal className="w-5 h-5 text-indigo-400" />
            Инструкции и готовые коды для настройки (Выберите вариант)
          </h3>

          {/* Navigation sub-tabs */}
          <div className="flex flex-wrap items-center gap-1 bg-slate-950 p-1 rounded-xl text-xs font-medium border border-slate-800">
            <button
              onClick={() => setSelectedInstructionTab('gitverse')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                selectedInstructionTab === 'gitverse'
                  ? 'bg-emerald-600 text-white shadow-xs font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              1. GitVerse (0 руб)
            </button>
            <button
              onClick={() => setSelectedInstructionTab('beget')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                selectedInstructionTab === 'beget'
                  ? 'bg-emerald-600 text-white shadow-xs font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              2. Sprinthost / Beget (0 руб)
            </button>
            <button
              onClick={() => setSelectedInstructionTab('cloudflare')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                selectedInstructionTab === 'cloudflare'
                  ? 'bg-indigo-600 text-white shadow-xs font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              3. Cloudflare (0 руб)
            </button>
            <button
              onClick={() => setSelectedInstructionTab('yandex')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                selectedInstructionTab === 'yandex'
                  ? 'bg-amber-600 text-white shadow-xs font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              4. Яндекс.Облако
            </button>
            <button
              onClick={() => setSelectedInstructionTab('nginx')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                selectedInstructionTab === 'nginx'
                  ? 'bg-indigo-600 text-white shadow-xs font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              5. Свой VPS (Nginx)
            </button>
          </div>
        </div>

        {/* TAB 1: GitVerse Direct (100% Free, No Card, Built-in) */}
        {selectedInstructionTab === 'gitverse' && (
          <div className="space-y-4 text-xs text-slate-300 leading-relaxed">
            <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-xl p-4 space-y-2">
              <div className="font-bold text-emerald-300 text-sm flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Почему GitVerse — идеальное решение без банковской карты?
              </div>
              <p>
                <b>GitVerse</b> создан Сбером и хостится внутри сертифицированных ЦОД в Москве и Санкт-Петербурге. Все домены <code className="text-emerald-300 font-mono">gitverse.ru</code> находятся в <b>высших национальных белых списках</b> всех операторов РФ (МТС, Билайн, Мегафон, Теле2, Ростелеком).
              </p>
              <ul className="list-disc list-inside space-y-1 text-slate-300">
                <li><b>0 рублей навсегда</b> — никаких платных тарифов для репозиториев;</li>
                <li><b>Никаких банковских карт</b> — регистрация через Сбер ID или email за 30 секунд;</li>
                <li><b>Уже встроено в панель</b> — наша система сама генерирует зашифрованные HAPP и INCY ссылки на файлы GitVerse.</li>
              </ul>
            </div>

            <ol className="space-y-3 list-decimal list-inside text-slate-300">
              <li className="pl-1">
                Перейдите на <a href="https://gitverse.ru" target="_blank" rel="noreferrer" className="text-emerald-400 underline font-semibold">gitverse.ru</a> и зарегистрируйтесь (через Сбер ID или email).
              </li>
              <li className="pl-1">
                Создайте репозиторий (например, <code className="bg-slate-800 px-1.5 py-0.5 rounded text-emerald-300">vpn-subs</code>) и сгенерируйте Personal Access Token в профиле.
              </li>
              <li className="pl-1">
                Во вкладке <b>«Настройки» → «Источники Git»</b> укажите ваш репозиторий GitVerse и токен.
              </li>
              <li className="pl-1">
                Выберите режим <b>«Шлюз 1-2 раза в день»</b> выше. Ваши пользователи будут получать файлы подписки напрямую из GitVerse без VPN, а защита от 2-го устройства и аудит будут автоматически выполняться в фоновом режиме!
              </li>
            </ol>
          </div>
        )}

        {/* TAB 2: Sprinthost / Beget Free Hosting (100% Free, No Card, Server in SPb) */}
        {selectedInstructionTab === 'beget' && (
          <div className="space-y-4 text-xs text-slate-300 leading-relaxed">
            <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-xl p-4 space-y-2">
              <div className="font-bold text-emerald-300 text-sm flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Российский хостинг Sprinthost или Beget (БЕЗ банковской карты, серверы в РФ)
              </div>
              <p>
                Sprinthost (<a href="https://sprinthost.ru" target="_blank" rel="noreferrer" className="text-emerald-400 underline">sprinthost.ru</a>) и Beget (<a href="https://beget.com" target="_blank" rel="noreferrer" className="text-emerald-400 underline">beget.com</a>) предоставляют бесплатные домены (<code className="text-emerald-300 font-mono">*.xsph.ru</code> или <code className="text-emerald-300 font-mono">*.bget.ru</code>) на серверах в Санкт-Петербурге/Москве.
              </p>
            </div>

            <ol className="space-y-3 list-decimal list-inside text-slate-300">
              <li className="pl-1">
                В панели управления хостингом откройте <b>«Файловый менеджер»</b> и перейдите в папку вашего сайта: <code className="bg-slate-800 px-1.5 py-0.5 rounded text-emerald-300">domains/ваш-домен/public_html/</code>.
              </li>
              <li className="pl-1">
                <b>Шаг 1:</b> Создайте файл <b>index.php</b> и вставьте в него код микро-шлюза:
              </li>
            </ol>

            {/* Code Box for index.php */}
            <div className="relative bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs overflow-x-auto text-slate-200">
              <div className="absolute top-3 right-3 flex items-center gap-2">
                <button
                  onClick={() => handleCopy(begetSnippet || begetDefaultCode, 'beget')}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-sans font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                >
                  {copiedKey === 'beget' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'beget' ? 'Скопировано!' : 'Скопировать index.php'}</span>
                </button>
              </div>
              <pre className="pr-32">{begetSnippet || begetDefaultCode}</pre>
            </div>

            <ol start={3} className="space-y-3 list-decimal list-inside text-slate-300">
              <li className="pl-1">
                <b>Шаг 2 (Обязательно):</b> В той же папке <code className="bg-slate-800 px-1.5 py-0.5 rounded text-emerald-300">public_html</code> создайте файл с именем <b>.htaccess</b> (с точкой в начале!). Он перенаправляет запросы подписок <code className="text-emerald-400">/api/sub/...</code> в наш скрипт:
              </li>
            </ol>

            {/* Code Box for .htaccess */}
            <div className="relative bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs overflow-x-auto text-slate-200">
              <div className="absolute top-3 right-3 flex items-center gap-2">
                <button
                  onClick={() => handleCopy(htaccessSnippet || `DirectoryIndex index.php\n\n<IfModule mod_rewrite.c>\nRewriteEngine On\nRewriteBase /\nRewriteCond %{REQUEST_FILENAME} !-f\nRewriteCond %{REQUEST_FILENAME} !-d\nRewriteRule ^(.*)$ index.php [QSA,L]\n</IfModule>`, 'htaccess')}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-sans font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                >
                  {copiedKey === 'htaccess' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'htaccess' ? 'Скопировано!' : 'Скопировать .htaccess'}</span>
                </button>
              </div>
              <pre className="pr-32">{htaccessSnippet || `DirectoryIndex index.php\n\n<IfModule mod_rewrite.c>\nRewriteEngine On\nRewriteBase /\nRewriteCond %{REQUEST_FILENAME} !-f\nRewriteCond %{REQUEST_FILENAME} !-d\nRewriteRule ^(.*)$ index.php [QSA,L]\n</IfModule>`}</pre>
            </div>

            <ol start={4} className="space-y-3 list-decimal list-inside text-slate-300">
              <li className="pl-1">
                Вставьте адрес вашего сайта (например: <code className="bg-slate-800 px-1.5 py-0.5 rounded text-emerald-300">http://shluz.xsph.ru</code>) в поле «Публичный адрес шлюза (URL)» выше, нажмите <b>«Сохранить URL»</b> и затем <b>«Проверить задержку»</b>.
              </li>
              <li className="pl-1">
                Готово! Теперь у вас полноценный российский шлюз в Санкт-Петербурге / Москве, без единого рубля затрат и без привязки банковской карты!
              </li>
            </ol>
          </div>
        )}

        {/* TAB 3: Cloudflare Workers (100k requests/day free, No Card) */}
        {selectedInstructionTab === 'cloudflare' && (
          <div className="space-y-4 text-xs text-slate-300 leading-relaxed">
            <div className="bg-indigo-950/30 border border-indigo-500/30 rounded-xl p-4 space-y-2">
              <div className="font-bold text-indigo-300 text-sm flex items-center gap-2">
                <Cloud className="w-4 h-4 text-indigo-400" />
                Cloudflare Workers (100,000 запросов в день БЕСПЛАТНО, БЕЗ КАРТЫ)
              </div>
              <p>
                Cloudflare позволяет создать бессерверный скрипт Worker. Бесплатный тариф дает 100 000 запросов в сутки без ввода каких-либо банковских реквизитов.
              </p>
            </div>

            <ol className="space-y-3 list-decimal list-inside text-slate-300">
              <li className="pl-1">
                Зайдите на <a href="https://dash.cloudflare.com" target="_blank" rel="noreferrer" className="text-indigo-400 underline font-semibold">dash.cloudflare.com</a> и выберите раздел <b>Workers & Pages</b>.
              </li>
              <li className="pl-1">
                Нажмите <b>«Create Application» → «Create Worker»</b>.
              </li>
              <li className="pl-1">
                Вставьте следующий код в редактор воркера:
              </li>
            </ol>

            {/* Code Box for Cloudflare */}
            <div className="relative bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs overflow-x-auto text-slate-200">
              <div className="absolute top-3 right-3 flex items-center gap-2">
                <button
                  onClick={() => handleCopy(cloudflareSnippet || cloudflareDefaultCode, 'cloudflare')}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-sans font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                >
                  {copiedKey === 'cloudflare' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'cloudflare' ? 'Скопировано!' : 'Скопировать код Worker'}</span>
                </button>
              </div>
              <pre className="pr-32">{cloudflareSnippet || cloudflareDefaultCode}</pre>
            </div>

            <ol start={4} className="space-y-3 list-decimal list-inside text-slate-300">
              <li className="pl-1">
                Нажмите <b>«Deploy»</b>, скопируйте полученный адрес <code className="bg-slate-800 px-1.5 py-0.5 rounded text-indigo-300">https://sub-relay.ваше-имя.workers.dev</code> и укажите его в поле URL выше.
              </li>
            </ol>
          </div>
        )}

        {/* TAB 4: Yandex Cloud Functions */}
        {selectedInstructionTab === 'yandex' && (
          <div className="space-y-4 text-xs text-slate-300 leading-relaxed">
            <div className="bg-amber-950/20 border border-amber-600/30 rounded-xl p-4 space-y-1.5">
              <div className="font-bold text-amber-300 text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-400" />
                Примечание по Яндекс.Облаку:
              </div>
              <p>
                Яндекс дает 1 миллион бесплатных вызовов функций в месяц, <b>НО</b> при первой регистрации запрашивает привязку банковской карты для подтверждения личности. Если вы не хотите указывать карту — воспользуйтесь вкладками <b>1. GitVerse</b> или <b>2. Beget Хостинг</b> выше!
              </p>
            </div>

            <ol className="space-y-2 list-decimal list-inside text-slate-300">
              <li className="pl-1">Зайдите в консоль Яндекс.Облака (<a href="https://console.yandex.cloud" target="_blank" rel="noreferrer" className="text-amber-400 underline">console.yandex.cloud</a>) → <b>Cloud Functions</b>.</li>
              <li className="pl-1">Создайте функцию на Node.js 18+ и вставьте код микро-шлюза:</li>
            </ol>

            <div className="relative bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs overflow-x-auto text-slate-200">
              <div className="absolute top-3 right-3 flex items-center gap-2">
                <button
                  onClick={() => handleCopy(yandexSnippet, 'yandex')}
                  className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-sans font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                >
                  {copiedKey === 'yandex' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'yandex' ? 'Скопировано!' : 'Скопировать код Яндекса'}</span>
                </button>
              </div>
              <pre className="pr-32">{yandexSnippet}</pre>
            </div>
          </div>
        )}

        {/* TAB 5: Custom VPS Nginx */}
        {selectedInstructionTab === 'nginx' && (
          <div className="space-y-4 text-xs text-slate-300 leading-relaxed">
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
              <div className="font-bold text-white flex items-center gap-2">
                <Server className="w-4 h-4 text-emerald-400" />
                Свой сервер в РФ (Aeza, Timeweb, SpaceWeb, FirstVDS)
              </div>
              <p>
                Самый дешевый VPS в РФ стоит 50–90 руб/мес (1 vCPU, 512MB RAM). Nginx потребляет 5 МБ оперативной памяти и держит огромный поток клиентов.
              </p>
            </div>

            <div className="relative bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs overflow-x-auto text-slate-200">
              <div className="absolute top-3 right-3 flex items-center gap-2">
                <button
                  onClick={() => handleCopy(nginxConfigSnippet, 'nginx')}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-sans font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                >
                  {copiedKey === 'nginx' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'nginx' ? 'Скопировано!' : 'Скопировать Nginx конфиг'}</span>
                </button>
              </div>
              <pre className="pr-32">{nginxConfigSnippet}</pre>
            </div>
          </div>
        )}
      </div>

      {/* Upstream backend notice */}
      <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 text-xs text-slate-400 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-indigo-400 shrink-0" />
          <span>Целевой сервер панели (Upstream Backend):</span>
          <code className="text-indigo-300 font-mono bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
            {backendUrl || 'Автоопределение'}
          </code>
        </div>
        <span className="text-[11px] text-slate-500">
          Запросы пересылаются с сохранением X-Forwarded-For и оригинальных User-Agent
        </span>
      </div>
    </div>
  );
};
