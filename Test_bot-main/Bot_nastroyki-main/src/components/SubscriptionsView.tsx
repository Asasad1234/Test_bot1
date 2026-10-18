import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { 
  Sliders, 
  Copy, 
  Check, 
  ExternalLink, 
  QrCode, 
  FileCode, 
  Radio, 
  Smartphone, 
  CheckCircle2, 
  AlertCircle,
  Play,
  Lock,
  Unlock,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Clock,
  RefreshCw,
  Ban
} from 'lucide-react';
import { BotUser, SubFormatConfig, RelayGatewayConfig } from '../types';
import { fetchUserSubConfigs, forceUnlockUser, resolveSecondDevice, fetchRelayGatewayConfig } from '../services/api';

interface SubscriptionsViewProps {
  users: BotUser[];
  selectedUser: BotUser | null;
  onSelectUser: (user: BotUser) => void;
  onRefreshUsers?: () => void;
}

export const SubscriptionsView: React.FC<SubscriptionsViewProps> = ({
  users,
  selectedUser,
  onSelectUser,
  onRefreshUsers,
}) => {
  const activeUser = selectedUser || users[0] || null;
  const [configs, setConfigs] = useState<SubFormatConfig[]>([]);
  const [selectedFormat, setSelectedFormat] = useState<string>('v2ray');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [httpTestResult, setHttpTestResult] = useState<{
    status: number;
    contentType: string;
    size: number;
    preview: string;
  } | null>(null);
  const [isTestingHttp, setIsTestingHttp] = useState(false);
  const [loadingConfigs, setLoadingConfigs] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [unlockMessage, setUnlockMessage] = useState<string | null>(null);
  const [gatewayConfig, setGatewayConfig] = useState<RelayGatewayConfig | null>(null);

  useEffect(() => {
    fetchRelayGatewayConfig()
      .then((data) => {
        if (data?.success) {
          setGatewayConfig(data.config);
        }
      })
      .catch((err) => console.warn('[SubscriptionsView] relay gateway config fetch error:', err));
  }, []);

  useEffect(() => {
    if (!activeUser) return;
    setLoadingConfigs(true);
    fetchUserSubConfigs(activeUser.id)
      .then((data) => {
        setConfigs(data.configs);
      })
      .catch((err) => console.error(err))
      .finally(() => setLoadingConfigs(false));
  }, [activeUser?.id, activeUser?.subscriptionToken]);

  const handleForceUnlock = async () => {
    if (!activeUser) return;
    setIsUnlocking(true);
    setUnlockMessage(null);
    try {
      const res = await forceUnlockUser(activeUser.id);
      setUnlockMessage(res.message);
      setTimeout(() => setUnlockMessage(null), 4000);
      onRefreshUsers?.();
      const data = await fetchUserSubConfigs(activeUser.id);
      setConfigs(data.configs);
    } catch (err: any) {
      setUnlockMessage('Ошибка: ' + (err.message || 'Сбой разблокировки'));
      setTimeout(() => setUnlockMessage(null), 4000);
    } finally {
      setIsUnlocking(false);
    }
  };

  const handleResolveSecondDevice = async () => {
    if (!activeUser) return;
    setIsUnlocking(true);
    setUnlockMessage(null);
    try {
      const res = await resolveSecondDevice(activeUser.id);
      setUnlockMessage(res.message);
      setTimeout(() => setUnlockMessage(null), 4000);
      onRefreshUsers?.();
      const data = await fetchUserSubConfigs(activeUser.id);
      setConfigs(data.configs);
    } catch (err: any) {
      setUnlockMessage('Ошибка: ' + (err.message || 'Сбой остановки таймера'));
      setTimeout(() => setUnlockMessage(null), 4000);
    } finally {
      setIsUnlocking(false);
    }
  };

  const currentConfig = configs.find((c) => c.id === selectedFormat) || configs[0];

  // Generate QR code whenever the current link changes
  useEffect(() => {
    if (!currentConfig) return;
    QRCode.toDataURL(currentConfig.url, {
      width: 240,
      margin: 1.5,
      color: {
        dark: '#1c1917',
        light: '#ffffff',
      },
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error('QR code generation error:', err));
  }, [currentConfig?.url]);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleTestHttp = async () => {
    if (!currentConfig) return;
    setIsTestingHttp(true);
    setHttpTestResult(null);
    try {
      const res = await fetch(currentConfig.url);
      const text = await res.text();
      setHttpTestResult({
        status: res.status,
        contentType: res.headers.get('content-type') || 'text/plain',
        size: new Blob([text]).size,
        preview: text.substring(0, 300) + (text.length > 300 ? '...' : ''),
      });
    } catch (err: any) {
      setHttpTestResult({
        status: 500,
        contentType: 'error',
        size: 0,
        preview: err.message || 'Ошибка выполнения HTTP запроса',
      });
    } finally {
      setIsTestingHttp(false);
    }
  };

  if (!activeUser) {
    return (
      <div className="bg-white p-8 rounded-2xl border border-stone-200 text-center">
        <p className="text-stone-500 text-sm">В базе нет пользователей для генерации подписок.</p>
      </div>
    );
  }

  return (
    <div id="subscriptions-layouts-view" className="space-y-6">
      {/* Header and User Picker */}
      <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-xl font-bold text-stone-900">
              Макеты персональных подписок
            </h2>
            <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              5 макетов клиентов
            </span>
          </div>
          <p className="text-xs text-stone-500 mt-1">
            Проверка логики генерации ссылок и форматов подписки для конкретного пользователя.
          </p>
        </div>

        {/* User Selector */}
        <div className="flex items-center space-x-2.5">
          <span className="text-xs text-stone-500 font-medium">Пользователь:</span>
          <select
            id="select-active-user"
            value={activeUser.id}
            onChange={(e) => {
              const u = users.find((item) => item.id === e.target.value);
              if (u) onSelectUser(u);
            }}
            className="px-3 py-1.5 rounded-xl border border-stone-200 bg-stone-50 text-xs font-semibold text-stone-900 focus:outline-none focus:border-stone-400"
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.firstName} ({u.username ? `@${u.username}` : u.telegramId}) — {u.channelMembership === 'member' ? 'В канале' : 'Покинул'}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Visual Device Lock Status & Anti-Sharing Timer Card */}
      <div 
        id="device-lock-status-card"
        className={`p-5 rounded-2xl border transition-all ${
          (activeUser.status === 'blocked' || activeUser.isBlocked || activeUser.isPermanentlyBanned)
            ? 'bg-rose-50 border-rose-200 shadow-xs'
            : activeUser.isTimerFrozen
            ? 'bg-emerald-50/80 border-emerald-200'
            : (activeUser.sharingGraceDeadlineAt && !activeUser.isTimerFrozen)
            ? 'bg-amber-50/90 border-amber-300 shadow-xs'
            : activeUser.boundDevice
            ? 'bg-stone-50/80 border-stone-200'
            : 'bg-stone-50 border-stone-200'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              {(activeUser.status === 'blocked' || activeUser.isBlocked || activeUser.isPermanentlyBanned) ? (
                <>
                  <Ban className="h-4 w-4 text-rose-600 shrink-0" />
                  <span className="text-xs font-bold text-rose-900 uppercase tracking-wide">
                    ⛔ Подписка заблокирована (Перманентный бан)
                  </span>
                </>
              ) : activeUser.isTimerFrozen ? (
                <>
                  <Clock className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span className="text-xs font-bold text-emerald-900 uppercase tracking-wide">
                    ⏸️ Таймер заморожен (2-е устройство удалено)
                  </span>
                </>
              ) : (activeUser.sharingGraceDeadlineAt && !activeUser.isTimerFrozen) ? (
                <>
                  <AlertTriangle className="h-4 w-4 text-amber-600 animate-pulse shrink-0" />
                  <span className="text-xs font-bold text-amber-900 uppercase tracking-wide">
                    ⚠️ Внимание: Активен таймер блокировки (Строка 2)
                  </span>
                </>
              ) : activeUser.boundDevice ? (
                <>
                  <Lock className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span className="text-xs font-bold text-stone-900 uppercase tracking-wide">
                    🔒 Защита 1 устройства активна (Строка 1)
                  </span>
                </>
              ) : (
                <>
                  <Unlock className="h-4 w-4 text-stone-500 shrink-0" />
                  <span className="text-xs font-bold text-stone-700 uppercase tracking-wide">
                    🔓 Свободный слот (устройство не привязано)
                  </span>
                </>
              )}

              {Boolean(activeUser.sharingWarningCount && activeUser.sharingWarningCount > 0) && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                  Предупреждений: {activeUser.sharingWarningCount}
                </span>
              )}

              {/* Gateway State Pill / Indicator */}
              {(() => {
                const mode = gatewayConfig?.gatewayMode || (gatewayConfig?.whitelistMode !== false ? 'scheduled_daily' : 'always_gateway');
                if (mode === 'always_gateway') {
                  return (
                    <span 
                      className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-300 inline-flex items-center space-x-1"
                      title="Трафик подписки непрерывно идет через российский шлюз-реле"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-pulse"></span>
                      <span>Always Gateway</span>
                    </span>
                  );
                }
                
                if (mode === 'direct_whitelist') {
                  return (
                    <span 
                      className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-800 border border-teal-300 inline-flex items-center space-x-1"
                      title="Прямая раздача через белый список GitVerse (без стороннего шлюза)"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-teal-600"></span>
                      <span>Direct (GitVerse)</span>
                    </span>
                  );
                }

                // Default: scheduled_daily (1-2 times daily)
                const lastAuditTime = gatewayConfig?.lastAuditAt ? new Date(gatewayConfig.lastAuditAt).getTime() : 0;
                const intervalHours = gatewayConfig?.checkIntervalHours || 12;
                const nextPassTime = lastAuditTime + intervalHours * 3600 * 1000;
                const diffMs = nextPassTime - Date.now();
                
                let remainingLabel = 'сейчас';
                if (diffMs > 0) {
                  const hours = Math.floor(diffMs / 3600000);
                  const mins = Math.floor((diffMs % 3600000) / 60000);
                  remainingLabel = hours > 0 ? `~${hours}ч ${mins}м` : `~${mins} мин`;
                } else if (lastAuditTime === 0) {
                  remainingLabel = 'ожидает прохода';
                }

                return (
                  <span 
                    className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 inline-flex items-center space-x-1"
                    title={`Шлюз проверяет подписку 1-2 раза в день. Время до следующего прохода: ${remainingLabel}`}
                  >
                    <Clock className="w-3 h-3 text-emerald-700" />
                    <span>Gateway Scheduled ({remainingLabel})</span>
                  </span>
                );
              })()}
            </div>

            <div className="text-xs text-stone-600 leading-relaxed">
              {activeUser.isPermanentlyBanned ? (
                <span>
                  ⛔ Пользователь перманентно заблокирован: превышен лимит нарушений или истек срок таймера удаления подписки (Строка 3).
                </span>
              ) : (activeUser.status === 'blocked' || activeUser.isBlocked) ? (
                <span>
                  ⛔ <strong>Подписка заблокирована (Сценарий 2):</strong> Зафиксирована попытка передачи подписки другому лицу/устройству. Доступ 2-му устройству заблокирован, владельцу назначен таймер на удаление.
                  {activeUser.sharingGraceDeadlineAt && !activeUser.isTimerFrozen && (
                    new Date(activeUser.sharingGraceDeadlineAt) > new Date() ? (
                      <strong className="text-purple-900 font-bold ml-1">
                        ⏳ До перманентного бана: {Math.max(1, Math.round((new Date(activeUser.sharingGraceDeadlineAt).getTime() - Date.now()) / 60000))} мин. (до {new Date(activeUser.sharingGraceDeadlineAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })})
                      </strong>
                    ) : (
                      <strong className="text-rose-700 font-bold ml-1">
                        ⛔ Срок истек! Ожидается наложение перманентного бана.
                      </strong>
                    )
                  )}
                </span>
              ) : activeUser.isTimerFrozen ? (
                <span>
                  Второй пользователь удалил подписку. Таймер остановлен, ключи из центральной подписки восстановлены. Предупреждение сохранено.
                </span>
              ) : (activeUser.sharingGraceDeadlineAt && !activeUser.isTimerFrozen) ? (
                <span>
                  Обнаружена попытка подключения со второго устройства ({activeUser.secondDeviceInfo?.userAgent || 'Клиент'}, IP: {activeUser.secondDeviceInfo?.ip || 'IP'}). 
                  {new Date(activeUser.sharingGraceDeadlineAt) > new Date() ? (
                    <strong className="text-purple-900 font-bold ml-1">
                      ⏳ До бана: {Math.max(1, Math.round((new Date(activeUser.sharingGraceDeadlineAt).getTime() - Date.now()) / 60000))} мин. (до {new Date(activeUser.sharingGraceDeadlineAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })})
                    </strong>
                  ) : (
                    <strong className="text-rose-700 font-bold ml-1">
                      ⛔ Таймер истек! Ожидается наложение перманентного бана.
                    </strong>
                  )}
                </span>
              ) : activeUser.boundDevice ? (
                <span>
                  Привязано устройство: <strong>{activeUser.boundDevice.clientName}</strong> (HWID: <code className="font-mono text-[11px] bg-white px-1 py-0.5 rounded border border-stone-200">{activeUser.boundDevice.deviceId}</code>, IP: <code>{activeUser.boundDevice.ip}</code>). Передача 2-му лицу заблокирована.
                </span>
              ) : (
                <span>
                  Подписка готова к использованию. Привяжется к первому подключившемуся устройству автоматически.
                </span>
              )}
            </div>
          </div>

          {/* Action Buttons: Force Unlock & Resolve 2nd device */}
          <div className="flex items-center space-x-2 shrink-0 pt-2 sm:pt-0">
            {(activeUser.sharingGraceDeadlineAt && !activeUser.isTimerFrozen) && (
              <button
                type="button"
                id="btn-resolve-second-device"
                onClick={handleResolveSecondDevice}
                disabled={isUnlocking}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-xs cursor-pointer transition-colors disabled:opacity-50"
                title="Второй пользователь удалил подписку: остановить таймер и вернуть центральные ключи"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>2-е устр. удалено</span>
              </button>
            )}

            <button
              type="button"
              id="btn-force-unlock"
              onClick={handleForceUnlock}
              disabled={isUnlocking}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 shadow-xs cursor-pointer transition-colors disabled:opacity-50 ${
                (activeUser.status === 'blocked' || activeUser.isBlocked || activeUser.isPermanentlyBanned)
                  ? 'bg-rose-600 hover:bg-rose-700 text-white animate-pulse'
                  : 'bg-stone-900 hover:bg-stone-800 text-white'
              }`}
              title="Принудительно разблокировать пользователя, сбросить таймеры и вернуть центральные ключи"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isUnlocking ? 'animate-spin' : ''}`} />
              <span>{isUnlocking ? 'Разблокировка...' : 'Force Unlock'}</span>
            </button>
          </div>
        </div>

        {unlockMessage && (
          <div className="mt-2.5 p-2 rounded-lg bg-white border border-stone-200 text-xs font-medium text-stone-800 flex items-center space-x-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
            <span>{unlockMessage}</span>
          </div>
        )}
      </div>

      {/* Format Tabs Selector */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
        {configs.map((cfg) => {
          const isSelected = selectedFormat === cfg.id;
          return (
            <button
              key={cfg.id}
              id={`tab-format-${cfg.id}`}
              onClick={() => {
                setSelectedFormat(cfg.id);
                setHttpTestResult(null);
              }}
              className={`p-3.5 rounded-xl border text-left transition-all ${
                isSelected
                  ? 'bg-stone-900 text-white border-stone-900 shadow-xs'
                  : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-xs font-bold ${isSelected ? 'text-amber-400' : 'text-stone-900'}`}>
                  {cfg.id.toUpperCase()}
                </span>
                <Smartphone className={`h-3.5 w-3.5 ${isSelected ? 'text-amber-400' : 'text-stone-400'}`} />
              </div>
              <div className="text-xs font-semibold mt-1 truncate">{cfg.name}</div>
              <div className={`text-[11px] truncate mt-0.5 ${isSelected ? 'text-stone-300' : 'text-stone-400'}`}>
                {cfg.client}
              </div>
            </button>
          );
        })}
      </div>

      {/* Main Detail Area: Link, QR Code & HTTP Live Test */}
      {currentConfig && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2 Cols: Subscription Details & Code Preview */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                <div>
                  <h3 className="text-base font-bold text-stone-900">
                    {currentConfig.name}
                  </h3>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Рекомендуемые приложения: <strong>{currentConfig.client}</strong>
                  </p>
                </div>

                <button
                  id="btn-test-http"
                  onClick={handleTestHttp}
                  disabled={isTestingHttp}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  <Play className={`h-3.5 w-3.5 text-amber-400 ${isTestingHttp ? 'animate-spin' : ''}`} />
                  <span>{isTestingHttp ? 'Проверка...' : 'Проверить отдачу по HTTP'}</span>
                </button>
              </div>

              {/* URL field */}
              <div>
                <label className="text-xs font-semibold text-stone-700 block mb-1.5">
                  Ссылка на подписку для клиента:
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    readOnly
                    value={currentConfig.url}
                    className="w-full font-mono text-xs text-stone-800 bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 select-all focus:outline-none"
                  />
                  <button
                    onClick={() => handleCopy(currentConfig.url, 'url')}
                    className="px-3 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-medium shrink-0 flex items-center space-x-1.5"
                  >
                    {copiedKey === 'url' ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                        <span className="text-emerald-600">Скопировано</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Копировать</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Live HTTP Test Result Box */}
              {httpTestResult && (
                <div
                  id="http-test-result"
                  className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs space-y-2 text-emerald-950"
                >
                  <div className="flex items-center justify-between font-bold">
                    <span className="flex items-center space-x-1.5 text-emerald-800">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      <span>HTTP 200 OK — Эндпоинт успешно отдает конфигурацию!</span>
                    </span>
                    <span className="text-stone-500 font-mono">
                      Размер: {(httpTestResult.size / 1024).toFixed(1)} КБ
                    </span>
                  </div>
                  <div className="text-stone-600 font-mono text-[11px] bg-white p-2.5 rounded-lg border border-emerald-200/60 overflow-x-auto whitespace-pre-wrap">
                    {httpTestResult.preview}
                  </div>
                </div>
              )}

              {/* Raw Content Preview */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-stone-700 flex items-center space-x-1.5">
                    <FileCode className="h-3.5 w-3.5 text-stone-400" />
                    <span>Содержимое макета ({currentConfig.filename}):</span>
                  </label>
                  <button
                    onClick={() => handleCopy(currentConfig.content, 'content')}
                    className="text-xs text-stone-500 hover:text-stone-900 flex items-center space-x-1"
                  >
                    {copiedKey === 'content' ? (
                      <span className="text-emerald-600">Скопировано</span>
                    ) : (
                      <span>Скопировать текст макета</span>
                    )}
                  </button>
                </div>
                <textarea
                  readOnly
                  rows={8}
                  value={currentConfig.content}
                  className="w-full font-mono text-xs text-stone-800 bg-stone-50 p-3.5 rounded-xl border border-stone-200 select-all focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Right Col: QR Code Card */}
          <div className="space-y-6">
            <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-xs text-center space-y-4">
              <div className="flex items-center justify-center space-x-2 text-stone-900 font-bold text-sm">
                <QrCode className="h-4 w-4 text-stone-600" />
                <span>QR-код для быстрого импорта</span>
              </div>

              <div className="p-3 bg-stone-50 rounded-2xl border border-stone-200 inline-block mx-auto">
                {qrDataUrl ? (
                  <img
                    id="qr-code-image"
                    src={qrDataUrl}
                    alt="Subscription QR"
                    className="w-48 h-48 rounded-lg"
                  />
                ) : (
                  <div className="w-48 h-48 flex items-center justify-center text-xs text-stone-400">
                    Генерация QR...
                  </div>
                )}
              </div>

              <p className="text-xs text-stone-500 leading-relaxed max-w-xs mx-auto">
                Отсканируйте камерой в Shadowrocket, v2rayNG или V2Box для мгновенного добавления подписки на смартфон.
              </p>

              <div className="pt-3 border-t border-stone-100 text-left text-xs space-y-1.5 text-stone-600">
                <div>
                  <strong>Пользователь:</strong> {activeUser.firstName}
                </div>
                <div>
                  <strong>Токен:</strong> <span className="font-mono text-stone-800">{activeUser.subscriptionToken}</span>
                </div>
                <div>
                  <strong>Статус в канале:</strong>{' '}
                  {activeUser.channelMembership === 'member' ? (
                    <span className="text-emerald-600 font-medium">Подтвержден ✅</span>
                  ) : (
                    <span className="text-rose-600 font-medium">Покинул канал ❌</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
