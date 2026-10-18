import React, { useState } from 'react';
import { 
  ShieldAlert, 
  Save, 
  Check, 
  AlertTriangle, 
  VolumeX, 
  Ban, 
  Info, 
  Sparkles, 
  Palette, 
  Laptop,
  Layers,
  Radio,
  Clock,
  ArrowRight,
  ExternalLink,
  CheckCircle2,
  RefreshCw,
  Plus,
  Play,
  FileCode2,
  Lock,
  MessageSquare
} from 'lucide-react';
import { ReplacementTemplates, ManagedBotItem, BotUser } from '../types';
import { testReplacementSource } from '../services/api';

interface TemplatesViewProps {
  templates: ReplacementTemplates;
  bots?: ManagedBotItem[];
  users?: BotUser[];
  onSaveTemplates: (templates: ReplacementTemplates) => Promise<void>;
  onSaveBot?: (bot: ManagedBotItem) => Promise<void>;
  onTabChange?: (tab: string) => void;
}

const COLOR_PRESETS = [
  { id: 'indigo', name: 'Индиго', bg: 'bg-indigo-600', text: 'text-indigo-600', hex: '#4f46e5' },
  { id: 'emerald', name: 'Изумруд', bg: 'bg-emerald-600', text: 'text-emerald-600', hex: '#059669' },
  { id: 'rose', name: 'Рубин', bg: 'bg-rose-600', text: 'text-rose-600', hex: '#e11d48' },
  { id: 'amber', name: 'Янтарь', bg: 'bg-amber-600', text: 'text-amber-600', hex: '#d97706' },
  { id: 'sky', name: 'Небо', bg: 'bg-sky-600', text: 'text-sky-600', hex: '#0284c7' },
  { id: 'purple', name: 'Фиолетовый', bg: 'bg-purple-600', text: 'text-purple-600', hex: '#9333ea' },
  { id: 'stone', name: 'Графит', bg: 'bg-stone-800', text: 'text-stone-800', hex: '#292524' },
];

export const TemplatesView: React.FC<TemplatesViewProps> = ({
  templates: initialTemplates,
  bots = [],
  users = [],
  onSaveTemplates,
  onSaveBot,
  onTabChange,
}) => {
  const [templates, setTemplates] = useState<ReplacementTemplates>({
    ...initialTemplates,
    source1Name: initialTemplates.source1Name || 'Источник 1: При отписке / удалении бота',
    source1Content: initialTemplates.source1Content || 'vless://00000000-0000-0000-0000-000000000000@127.0.0.1:443?encryption=none&security=none#⚠️ Подписка деактивирована: вернитесь в канал доступа',
    source1Message: initialTemplates.source1Message || '⚠️ Ваша подписка деактивирована, так как вы покинули обязательный канал! Подпишитесь обратно, чтобы возобновить работу подписки.',
    maxChannelLeftCount: initialTemplates.maxChannelLeftCount ?? 0,

    source2Name: initialTemplates.source2Name || 'Источник 2: Защита (подключение 2-го устройства)',
    source2Content: initialTemplates.source2Content || 'vless://00000000-0000-0000-0000-000000000000@127.0.0.1:443?encryption=none&security=none#⚠️ Заблокировано: попытка использования на 2-м устройстве (1 подписка = 1 устройство)',
    source2BlockHours: initialTemplates.source2BlockHours ?? 24,
    source2MaxAttempts: initialTemplates.source2MaxAttempts ?? 3,
    source2WarningMessage: initialTemplates.source2WarningMessage || '⚠️ ПРЕДУПРЕЖДЕНИЕ [{attempt}/3]: Зафиксирована попытка подключения второго устройства! Подписка заблокирована на {hours} ч. до {until}. Осталось попыток: {remaining}. После 3 попыток последует перманентный бан.',

    source3Name: initialTemplates.source3Name || 'Источник 3: Перманентный бан (Заблокированные)',
    source3Content: initialTemplates.source3Content || 'vless://00000000-0000-0000-0000-000000000000@127.0.0.1:443?encryption=none&security=none#⛔ Заблокировано: перманентный бан (обратитесь к администратору)',
    source3BanMessage: initialTemplates.source3BanMessage || '⛔ ВАША ПОДПИСКА ПЕРМАНЕНТНО ЗАБЛОКИРОВАНА!\nПричина: Превышен лимит попыток передачи подписки третьим лицам.\nДля разблокировки обратитесь к администратору через кнопку ниже.',

    source4Enabled: initialTemplates.source4Enabled ?? false,
    source4Name: initialTemplates.source4Name || 'Источник 4: Сервисные работы / Резерв',
    source4Content: initialTemplates.source4Content || 'vless://00000000-0000-0000-0000-000000000000@127.0.0.1:443?encryption=none&security=none#🛠️ Сервисные работы: сеть будет доступна в ближайшее время',
    source4Description: initialTemplates.source4Description || 'Резервный источник или узлы на время планового обслуживания инфраструктуры.',
  });

  const [managedBots, setManagedBots] = useState<ManagedBotItem[]>(bots);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [botSavingId, setBotSavingId] = useState<string | null>(null);

  // Active sub-tab in this view
  const [activeSubTab, setActiveSubTab] = useState<'sources' | 'visuals' | 'client_labels'>('sources');

  // Source test results state
  const [testingSource, setTestingSource] = useState<number | null>(null);
  const [testResults, setTestResults] = useState<{ [key: number]: any }>({});

  // Real-time user stats distribution
  const totalUsersCount = users.length;
  const centralActiveCount = users.filter((u) => u.status === 'active' && !u.isBlocked && u.channelMembership !== 'left').length;
  const leftChannelCount = users.filter((u) => u.channelMembership === 'left' || u.status === 'channel_inactive').length;
  const mutedSecondDeviceCount = users.filter((u) => u.status === 'muted' || (u.mutedUntil && new Date(u.mutedUntil).getTime() > Date.now())).length;
  const permanentlyBannedCount = users.filter((u) => u.status === 'blocked' || u.isBlocked || u.isPermanentlyBanned).length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSavedSuccess(false);
    try {
      await onSaveTemplates(templates);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3500);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestRunSource = async (num: 1 | 2 | 3 | 4) => {
    setTestingSource(num);
    try {
      const res = await testReplacementSource(num);
      setTestResults((prev) => ({ ...prev, [num]: res }));
    } catch (err: any) {
      alert(`Ошибка проверки Источника ${num}: ${err.message}`);
    } finally {
      setTestingSource(null);
    }
  };

  const handleUpdateBotColor = async (botId: string, color: string) => {
    const updated = managedBots.map((b) => (b.id === botId ? { ...b, buttonColor: color } : b));
    setManagedBots(updated);
    const target = updated.find((b) => b.id === botId);
    if (target && onSaveBot) {
      setBotSavingId(botId);
      try {
        await onSaveBot(target);
      } finally {
        setBotSavingId(null);
      }
    }
  };

  const handleToggleBotFireworks = async (botId: string, enabled: boolean) => {
    const updated = managedBots.map((b) => (b.id === botId ? { ...b, enableFireworks: enabled } : b));
    setManagedBots(updated);
    const target = updated.find((b) => b.id === botId);
    if (target && onSaveBot) {
      setBotSavingId(botId);
      try {
        await onSaveBot(target);
      } finally {
        setBotSavingId(null);
      }
    }
  };

  return (
    <div id="templates-sources-view" className="space-y-6">
      {/* Top Banner with Real-time Status */}
      <div className="bg-white border border-stone-200 rounded-3xl p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="flex items-start space-x-4">
            <div className="h-14 w-14 rounded-2xl bg-amber-500 text-stone-900 flex items-center justify-center shrink-0 shadow-sm">
              <ShieldAlert className="h-8 w-8" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight">
                  Система 3 источников подмены и блокировок
                </h2>
                <span className="text-[11px] font-mono font-bold bg-amber-100 text-amber-900 px-2.5 py-0.5 rounded-full border border-amber-300">
                  МГНОВЕННАЯ ЗАМЕНА
                </span>
              </div>
              <p className="text-xs sm:text-sm text-stone-500 mt-1 max-w-3xl leading-relaxed">
                Автоматическая замена содержимого подписки при отписке от канала, попытке передачи на 2-е устройство или перманентном бане.
                Пока действует ограничение, из центрального источника <strong>ничего не поступает</strong> — файл заменяется исключительно выбранным источником-заглушкой. Все настройки персистентны и сохраняются в облаке!
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSaving}
              className="px-6 py-3 rounded-2xl bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-xs transition disabled:opacity-50 cursor-pointer"
            >
              <Save className="h-4 w-4 text-amber-400" />
              <span>{isSaving ? 'Сохранение...' : 'Сохранить все источники'}</span>
            </button>
          </div>
        </div>

        {/* Real-time Analytics Bar */}
        <div className="mt-6 pt-6 border-t border-stone-100 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200">
            <div className="flex items-center justify-between text-emerald-800 text-xs font-semibold">
              <span>Центральный источник</span>
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
            </div>
            <div className="text-2xl font-black text-emerald-950 mt-1">{centralActiveCount}</div>
            <div className="text-[11px] text-emerald-700 mt-0.5">Активные подписчики с полным доступом</div>
          </div>

          <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200">
            <div className="flex items-center justify-between text-amber-800 text-xs font-semibold">
              <span>Источник 1: Отписка</span>
              <span className="h-2 w-2 rounded-full bg-amber-500" />
            </div>
            <div className="text-2xl font-black text-amber-950 mt-1">{leftChannelCount}</div>
            <div className="text-[11px] text-amber-700 mt-0.5">Покинули канал (заглушка 1)</div>
          </div>

          <div className="p-3.5 rounded-2xl bg-purple-50/70 border border-purple-200">
            <div className="flex items-center justify-between text-purple-800 text-xs font-semibold">
              <span>Источник 2: 2-е устр.</span>
              <span className="h-2 w-2 rounded-full bg-purple-500" />
            </div>
            <div className="text-2xl font-black text-purple-950 mt-1">{mutedSecondDeviceCount}</div>
            <div className="text-[11px] text-purple-700 mt-0.5">Временный бан на N ч. (заглушка 2)</div>
          </div>

          <div className="p-3.5 rounded-2xl bg-rose-50/70 border border-rose-200">
            <div className="flex items-center justify-between text-rose-800 text-xs font-semibold">
              <span>Источник 3: Перм. бан</span>
              <span className="h-2 w-2 rounded-full bg-rose-500" />
            </div>
            <div className="text-2xl font-black text-rose-950 mt-1">{permanentlyBannedCount}</div>
            <div className="text-[11px] text-rose-700 mt-0.5">Разбан только через админа</div>
          </div>
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="flex border-b border-stone-200 space-x-2">
        <button
          type="button"
          onClick={() => setActiveSubTab('sources')}
          className={`pb-3 px-4 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition ${
            activeSubTab === 'sources'
              ? 'border-stone-900 text-stone-900'
              : 'border-transparent text-stone-500 hover:text-stone-800'
          }`}
        >
          <Layers className="h-4 w-4" />
          <span>3 Строки-Источника (Блокировки & Заглушки)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('visuals')}
          className={`pb-3 px-4 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition ${
            activeSubTab === 'visuals'
              ? 'border-stone-900 text-stone-900'
              : 'border-transparent text-stone-500 hover:text-stone-800'
          }`}
        >
          <Sparkles className="h-4 w-4 text-amber-500" />
          <span>Салюты и Цвета кнопок ботов</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('client_labels')}
          className={`pb-3 px-4 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition ${
            activeSubTab === 'client_labels'
              ? 'border-stone-900 text-stone-900'
              : 'border-transparent text-stone-500 hover:text-stone-800'
          }`}
        >
          <FileCode2 className="h-4 w-4" />
          <span>Названия узлов в VPN клиентах</span>
        </button>
      </div>

      {/* SUB-TAB 1: THE 3 SOURCES SYSTEM */}
      {activeSubTab === 'sources' && (
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* ============================================================ */}
          {/* SOURCE 1: Channel/Bot Deletion or Unsubscribe */}
          {/* ============================================================ */}
          <div className="bg-white border-2 border-amber-200 rounded-3xl p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-amber-100 pb-4">
              <div className="flex items-center space-x-3">
                <div className="h-10 w-10 rounded-2xl bg-amber-500 text-stone-900 font-black text-sm flex items-center justify-center shrink-0">
                  1
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-stone-900 text-base">
                      {templates.source1Name || 'Источник 1: При отписке от канала или удалении бота'}
                    </h3>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200">
                      Отписка / Удаление
                    </span>
                  </div>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Удаляет всё, что было до, и подставляет то, что вписано в эту строку-источник. Из центрального источника ничего не поступает до обратной подписки!
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleTestRunSource(1)}
                disabled={testingSource === 1}
                className="px-4 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-semibold flex items-center gap-1.5 transition self-start sm:self-auto cursor-pointer"
              >
                <Play className="h-3.5 w-3.5 text-amber-600" />
                <span>{testingSource === 1 ? 'Проверка...' : '🧪 Проверить Источник 1'}</span>
              </button>
            </div>

            {/* Test result card if checked */}
            {testResults[1] && (
              <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-300 text-xs text-amber-950 font-mono space-y-1">
                <div className="font-bold">Результат проверки Источника 1:</div>
                <div>Всего узлов в источнике: <strong>{testResults[1].nodesTotal}</strong></div>
                <div className="text-[11px] text-stone-600 truncate">Адрес/Тип: {testResults[1].rawUrl}</div>
                <div className="text-[10px] bg-white p-2 rounded-lg border border-amber-200 truncate">{testResults[1].preview}</div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-stone-800 block mb-1">
                  Название источника 1:
                </label>
                <input
                  type="text"
                  value={templates.source1Name || ''}
                  onChange={(e) => setTemplates({ ...templates, source1Name: e.target.value })}
                  placeholder="Источник 1: При отписке / удалении бота"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 text-xs font-medium focus:bg-white transition"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-stone-800 block mb-1">
                  Лимит отписок до перманентного бана:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={50}
                    value={templates.maxChannelLeftCount ?? 0}
                    onChange={(e) => setTemplates({ ...templates, maxChannelLeftCount: parseInt(e.target.value, 10) || 0 })}
                    className="w-32 px-3.5 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 text-xs font-medium focus:bg-white transition"
                  />
                  <span className="text-xs text-stone-500">
                    {templates.maxChannelLeftCount === 0 ? '0 = Без ограничений (по умолчанию)' : 'попыток (при превышении — перманентный бан в Источник 3)'}
                  </span>
                </div>
              </div>
            </div>

            {/* Content Textarea (Source 1 Content) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-stone-800">
                  Содержимое файла подписки (Строка-источник 1):
                </label>
                <span className="text-[11px] text-stone-500 font-mono">
                  Строк: {(templates.source1Content || '').split('\n').filter((l) => l.trim()).length}
                </span>
              </div>
              <textarea
                rows={4}
                value={templates.source1Content || ''}
                onChange={(e) => setTemplates({ ...templates, source1Content: e.target.value })}
                placeholder="Вставьте URI ключи (vless://..., vmess://..., trojan://...) или заглушку для Источника 1"
                className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 bg-stone-900 text-amber-400 font-mono text-xs focus:ring-1 focus:ring-amber-500 transition resize-y"
              />
              <p className="text-[11px] text-stone-500 mt-1">
                Это то, что мгновенно заменит подписку пользователя при отписке. Старые ключи стираются, новые центральные не выдаются до повторного вступления в канал.
              </p>
            </div>

            {/* Raw URL fallback for Source 1 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-stone-800 block mb-1">
                  RAW URL внешнего файла Источника 1 (опционально):
                </label>
                <input
                  type="text"
                  value={templates.source1RawUrl || ''}
                  onChange={(e) => setTemplates({ ...templates, source1RawUrl: e.target.value })}
                  placeholder="https://gitverse.ru/.../raw/branch/master/stubs/source1.txt"
                  className="w-full px-3.5 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 text-xs font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-stone-800 block mb-1">
                  Сообщение в боте при выходе из канала:
                </label>
                <input
                  type="text"
                  value={templates.source1Message || ''}
                  onChange={(e) => setTemplates({ ...templates, source1Message: e.target.value })}
                  placeholder="⚠️ Ваша подписка деактивирована, так как вы покинули обязательный канал..."
                  className="w-full px-3.5 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 text-xs font-medium"
                />
              </div>
            </div>
          </div>

          {/* ============================================================ */}
          {/* SOURCE 2: 2nd Device Attempt / Sharing Protection (N hours) */}
          {/* ============================================================ */}
          <div className="bg-white border-2 border-purple-200 rounded-3xl p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-purple-100 pb-4">
              <div className="flex items-center space-x-3">
                <div className="h-10 w-10 rounded-2xl bg-purple-600 text-white font-black text-sm flex items-center justify-center shrink-0">
                  2
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-stone-900 text-base">
                      {templates.source2Name || 'Источник 2: Защита (подключение 2-го устройства)'}
                    </h3>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-100 text-purple-900 border border-purple-200">
                      Временный бан на {templates.source2BlockHours ?? 24} ч.
                    </span>
                  </div>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Попытка передать ссылку или подключить 2-е устройство (1 подписка = 1 устройство). И у владельца, и у второго пользователя подписка заменяется лишь этим источником!
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleTestRunSource(2)}
                disabled={testingSource === 2}
                className="px-4 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200 text-xs font-semibold flex items-center gap-1.5 transition self-start sm:self-auto cursor-pointer"
              >
                <Play className="h-3.5 w-3.5 text-purple-600" />
                <span>{testingSource === 2 ? 'Проверка...' : '🧪 Проверить Источник 2'}</span>
              </button>
            </div>

            {/* Test result card if checked */}
            {testResults[2] && (
              <div className="p-3.5 rounded-2xl bg-purple-50 border border-purple-300 text-xs text-purple-950 font-mono space-y-1">
                <div className="font-bold">Результат проверки Источника 2:</div>
                <div>Всего узлов в источнике: <strong>{testResults[2].nodesTotal}</strong></div>
                <div className="text-[11px] text-stone-600 truncate">Адрес/Тип: {testResults[2].rawUrl}</div>
                <div className="text-[10px] bg-white p-2 rounded-lg border border-purple-200 truncate">{testResults[2].preview}</div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-bold text-stone-800 block mb-1">
                  Название источника 2:
                </label>
                <input
                  type="text"
                  value={templates.source2Name || ''}
                  onChange={(e) => setTemplates({ ...templates, source2Name: e.target.value })}
                  placeholder="Источник 2: Защита (подключение 2-го устройства)"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 text-xs font-medium focus:bg-white transition"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-stone-800 block mb-1">
                  Срок блокировки в часах (N часов):
                </label>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-purple-600" />
                  <input
                    type="number"
                    min={1}
                    max={720}
                    value={templates.source2BlockHours ?? 24}
                    onChange={(e) => setTemplates({ ...templates, source2BlockHours: parseInt(e.target.value, 10) || 24 })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 text-xs font-medium focus:bg-white transition"
                  />
                  <span className="text-xs text-stone-500 font-semibold whitespace-nowrap">ч.</span>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-stone-800 block mb-1">
                  Лимит попыток до перманентного бана:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={templates.source2MaxAttempts ?? 3}
                    onChange={(e) => setTemplates({ ...templates, source2MaxAttempts: parseInt(e.target.value, 10) || 3 })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 text-xs font-medium focus:bg-white transition"
                  />
                  <span className="text-xs text-stone-500 font-semibold whitespace-nowrap">попытки (по умолч. 3)</span>
                </div>
              </div>

              {/* Extended Anti-Sharing Grace Period (Часы и Минуты до БАНА) */}
              <div className="lg:col-span-2 p-3.5 rounded-2xl bg-purple-50/70 border border-purple-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-purple-950 flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-purple-600" />
                    <span>Расширенный сценарий: Срок на удаление 2-м пользователем до БАНА</span>
                  </span>
                  <span className="text-[10px] font-semibold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full border border-purple-200">
                    Таймер до перманентного бана
                  </span>
                </div>
                <p className="text-[11px] text-purple-900/80 leading-relaxed">
                  Если пользователь скинул подписку другому: у второго она <strong>не включится</strong>, первому выдается <strong>1 предупреждение</strong> и включается сценарий из 2 строки. Также запускается таймер, за который пользователь должен сказать второму удалить её. Иначе автоматически наступает перманентный БАН!
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="text-[11px] font-bold text-stone-700 block mb-1">
                      Время в часах:
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={168}
                        value={templates.source2GracePeriodHours ?? 2}
                        onChange={(e) => setTemplates({ ...templates, source2GracePeriodHours: parseInt(e.target.value, 10) || 0 })}
                        className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-white text-stone-900 text-xs font-semibold focus:ring-1 focus:ring-purple-500"
                      />
                      <span className="text-xs text-stone-500 font-semibold whitespace-nowrap">ч.</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-stone-700 block mb-1">
                      Время в минутах:
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={59}
                        value={templates.source2GracePeriodMinutes ?? 0}
                        onChange={(e) => setTemplates({ ...templates, source2GracePeriodMinutes: parseInt(e.target.value, 10) || 0 })}
                        className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-white text-stone-900 text-xs font-semibold focus:ring-1 focus:ring-purple-500"
                      />
                      <span className="text-xs text-stone-500 font-semibold whitespace-nowrap">мин.</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Content Textarea (Source 2 Content) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-stone-800">
                  Содержимое файла подписки (Строка-источник 2):
                </label>
                <span className="text-[11px] text-stone-500 font-mono">
                  Строк: {(templates.source2Content || '').split('\n').filter((l) => l.trim()).length}
                </span>
              </div>
              <textarea
                rows={4}
                value={templates.source2Content || ''}
                onChange={(e) => setTemplates({ ...templates, source2Content: e.target.value })}
                placeholder="Вставьте URI ключи или заглушку для Источника 2"
                className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 bg-stone-900 text-purple-300 font-mono text-xs focus:ring-1 focus:ring-purple-500 transition resize-y"
              />
              <p className="text-[11px] text-stone-500 mt-1">
                Центральный источник блокируется для обоих устройств. Никакие рабочие серверы не отдаются до истечения установленного срока (например, 24 ч.).
              </p>
            </div>

            {/* Warning Message Template & RAW URL */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-stone-800 block mb-1">
                  RAW URL файла Источника 2 (опционально):
                </label>
                <input
                  type="text"
                  value={templates.source2RawUrl || ''}
                  onChange={(e) => setTemplates({ ...templates, source2RawUrl: e.target.value })}
                  placeholder="https://gitverse.ru/.../raw/branch/master/stubs/source2.txt"
                  className="w-full px-3.5 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 text-xs font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-stone-800 block mb-1">
                  Шаблон предупреждения в боте:
                </label>
                <input
                  type="text"
                  value={templates.source2WarningMessage || ''}
                  onChange={(e) => setTemplates({ ...templates, source2WarningMessage: e.target.value })}
                  placeholder="⚠️ ПРЕДУПРЕЖДЕНИЕ [{attempt}/3]: Зафиксирована попытка подключения..."
                  className="w-full px-3.5 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 text-xs font-medium"
                />
                <span className="text-[10px] text-stone-400 mt-0.5 block">
                  Переменные: {'{attempt}'}, {'{max}'}, {'{hours}'}, {'{until}'}, {'{remaining}'}
                </span>
              </div>
            </div>
          </div>

          {/* ============================================================ */}
          {/* SOURCE 3: Permanent Ban / Flagged Users */}
          {/* ============================================================ */}
          <div className="bg-white border-2 border-rose-200 rounded-3xl p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-rose-100 pb-4">
              <div className="flex items-center space-x-3">
                <div className="h-10 w-10 rounded-2xl bg-rose-600 text-white font-black text-sm flex items-center justify-center shrink-0">
                  3
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-stone-900 text-base">
                      {templates.source3Name || 'Источник 3: Перманентный бан (Заблокированные)'}
                    </h3>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-100 text-rose-900 border border-rose-200">
                      Перманентная блокировка
                    </span>
                  </div>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Применяется для всех видов блокировок: исчерпаны 3 попытки, превышен лимит отписок или ручной бан администратором. Центральный источник отключен полностью.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {onTabChange && (
                  <button
                    type="button"
                    onClick={() => onTabChange('feedback')}
                    className="px-3.5 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-semibold flex items-center gap-1.5 transition"
                  >
                    <MessageSquare className="h-3.5 w-3.5 text-stone-600" />
                    <span>Обратная связь →</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleTestRunSource(3)}
                  disabled={testingSource === 3}
                  className="px-4 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-900 border border-rose-200 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Play className="h-3.5 w-3.5 text-rose-600" />
                  <span>{testingSource === 3 ? 'Проверка...' : '🧪 Проверить Источник 3'}</span>
                </button>
              </div>
            </div>

            {/* Test result card if checked */}
            {testResults[3] && (
              <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-300 text-xs text-rose-950 font-mono space-y-1">
                <div className="font-bold">Результат проверки Источника 3:</div>
                <div>Всего узлов в источнике: <strong>{testResults[3].nodesTotal}</strong></div>
                <div className="text-[11px] text-stone-600 truncate">Адрес/Тип: {testResults[3].rawUrl}</div>
                <div className="text-[10px] bg-white p-2 rounded-lg border border-rose-200 truncate">{testResults[3].preview}</div>
              </div>
            )}

            <div>
              <label className="text-xs font-bold text-stone-800 block mb-1">
                Название источника 3:
              </label>
              <input
                type="text"
                value={templates.source3Name || ''}
                onChange={(e) => setTemplates({ ...templates, source3Name: e.target.value })}
                placeholder="Источник 3: Перманентный бан"
                className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 text-xs font-medium focus:bg-white transition"
              />
            </div>

            {/* Content Textarea (Source 3 Content) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-stone-800">
                  Содержимое файла подписки (Строка-источник 3):
                </label>
                <span className="text-[11px] text-stone-500 font-mono">
                  Строк: {(templates.source3Content || '').split('\n').filter((l) => l.trim()).length}
                </span>
              </div>
              <textarea
                rows={4}
                value={templates.source3Content || ''}
                onChange={(e) => setTemplates({ ...templates, source3Content: e.target.value })}
                placeholder="Вставьте URI ключи или заглушку для заблокированных"
                className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 bg-stone-900 text-rose-400 font-mono text-xs focus:ring-1 focus:ring-rose-500 transition resize-y"
              />
            </div>

            {/* Ban Message and RAW URL */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-stone-800 block mb-1">
                  RAW URL файла Источника 3 (опционально):
                </label>
                <input
                  type="text"
                  value={templates.source3RawUrl || ''}
                  onChange={(e) => setTemplates({ ...templates, source3RawUrl: e.target.value })}
                  placeholder="https://gitverse.ru/.../raw/branch/master/stubs/source3.txt"
                  className="w-full px-3.5 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 text-xs font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-stone-800 block mb-1">
                  Текст уведомления о перманентном бане в боте:
                </label>
                <textarea
                  rows={2}
                  value={templates.source3BanMessage || ''}
                  onChange={(e) => setTemplates({ ...templates, source3BanMessage: e.target.value })}
                  placeholder="⛔ ВАША ПОДПИСКА ПЕРМАНЕНТНО ЗАБЛОКИРОВАНА!..."
                  className="w-full px-3.5 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 text-xs font-medium"
                />
              </div>
            </div>

            {/* Unban Workflow Card */}
            <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="space-y-1">
                <div className="font-bold text-stone-900 flex items-center gap-1.5">
                  <Lock className="h-4 w-4 text-rose-600" />
                  <span>Сценарий разблокировки через бота:</span>
                </div>
                <p className="text-stone-500 max-w-2xl">
                  Заблокированный пользователь отправляет заявку через бота. Заявка мгновенно появляется в разделе <strong>«Обратная связь»</strong> с причиной блокировки, временем, никнеймом и сообщением пользователя. Вы можете нажать <strong>«Разблокировать и отвязать»</strong> или <strong>«Разблокировать»</strong> для мгновенного восстановления!
                </p>
              </div>

              {onTabChange && (
                <button
                  type="button"
                  onClick={() => onTabChange('feedback')}
                  className="px-4 py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs flex items-center gap-1.5 shrink-0 transition"
                >
                  <MessageSquare className="h-3.5 w-3.5 text-amber-400" />
                  <span>В Обратную связь</span>
                </button>
              )}
            </div>
          </div>

          {/* ============================================================ */}
          {/* SOURCE 4: Optional Custom / Emergency / VIP Source */}
          {/* ============================================================ */}
          <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center space-x-3">
                <div className="h-10 w-10 rounded-2xl bg-sky-100 text-sky-700 font-black text-sm flex items-center justify-center shrink-0">
                  4
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-stone-900 text-base">
                      {templates.source4Name || 'Источник 4: Сервисные работы / Резерв (Дополнительный)'}
                    </h3>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 border border-sky-200">
                      Дополнительный источник
                    </span>
                  </div>
                  <p className="text-xs text-stone-500">
                    Пользовательский дополнительный источник для планового обслуживания, VIP-резерва или спец-сценариев.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setTemplates({ ...templates, source4Enabled: !templates.source4Enabled })}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                    templates.source4Enabled ? 'bg-sky-600' : 'bg-stone-300'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      templates.source4Enabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
                <span className="text-xs font-bold text-stone-700">
                  {templates.source4Enabled ? 'ВКЛ' : 'ВЫКЛ'}
                </span>
              </div>
            </div>

            {templates.source4Enabled && (
              <div className="space-y-4 pt-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-stone-800 block mb-1">
                      Название источника 4:
                    </label>
                    <input
                      type="text"
                      value={templates.source4Name || ''}
                      onChange={(e) => setTemplates({ ...templates, source4Name: e.target.value })}
                      placeholder="Источник 4: Сервисные работы"
                      className="w-full px-3.5 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 text-xs"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-stone-800 block mb-1">
                      RAW URL Источника 4:
                    </label>
                    <input
                      type="text"
                      value={templates.source4RawUrl || ''}
                      onChange={(e) => setTemplates({ ...templates, source4RawUrl: e.target.value })}
                      placeholder="https://gitverse.ru/.../raw/branch/master/stubs/source4.txt"
                      className="w-full px-3.5 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 text-xs font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-stone-800 block mb-1">
                    Содержимое Источника 4 (узлы/заглушки):
                  </label>
                  <textarea
                    rows={3}
                    value={templates.source4Content || ''}
                    onChange={(e) => setTemplates({ ...templates, source4Content: e.target.value })}
                    placeholder="Вставьте URI ключи для Источника 4"
                    className="w-full px-3.5 py-2 rounded-xl border border-stone-200 bg-stone-900 text-sky-400 font-mono text-xs"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Action Bar */}
          <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center space-x-2 text-xs">
              <Info className="h-4 w-4 text-stone-400 shrink-0" />
              <span className="text-stone-600">
                Все изменения сохраняются в Cloud Firestore и на локальный диск — данные не сбрасываются при выходе!
              </span>
            </div>

            <div className="flex items-center space-x-3">
              {savedSuccess && (
                <span className="text-xs font-bold text-emerald-600 flex items-center space-x-1">
                  <Check className="h-4 w-4" />
                  <span>Все источники и настройки успешно сохранены!</span>
                </span>
              )}
              <button
                type="submit"
                disabled={isSaving}
                className="px-6 py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs flex items-center space-x-2 shadow-xs disabled:opacity-50 cursor-pointer"
              >
                <Save className="h-3.5 w-3.5 text-amber-400" />
                <span>{isSaving ? 'Сохранение...' : 'Сохранить изменения'}</span>
              </button>
            </div>
          </div>
        </form>
      )}

      {/* SUB-TAB 2: VISUAL EFFECTS & BUTTON COLORS */}
      {activeSubTab === 'visuals' && (
        <div className="bg-white border border-stone-200 rounded-3xl p-6 sm:p-8 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 pb-4">
            <div className="flex items-center space-x-3">
              <div className="h-10 w-10 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-stone-900 text-base">
                  Визуальные эффекты при получении и цвет кнопок
                </h3>
                <p className="text-xs text-stone-500">
                  Салюты/фейерверки в окне выдачи подписки и персональная цветовая гамма для каждого бота
                </p>
              </div>
            </div>

            {/* Master Fireworks Toggle */}
            <div className="flex items-center space-x-3 bg-stone-50 border border-stone-200 px-4 py-2.5 rounded-xl">
              <Sparkles className="h-4 w-4 text-amber-500" />
              <div className="text-xs font-semibold text-stone-800">
                Салюты/фейерверки при выдаче:
              </div>
              <button
                type="button"
                onClick={() => setTemplates({ ...templates, enableFireworks: !templates.enableFireworks })}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  templates.enableFireworks !== false ? 'bg-indigo-600' : 'bg-stone-300'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    templates.enableFireworks !== false ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
              <span className="text-xs font-bold text-stone-700">
                {templates.enableFireworks !== false ? 'ВКЛ ✨' : 'ВЫКЛ'}
              </span>
            </div>
          </div>

          {/* Per-bot buttons customization table */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2 text-xs font-bold text-stone-800">
              <Palette className="h-4 w-4 text-stone-600" />
              <span>Настройка цвета кнопок и салютов для каждого бота:</span>
            </div>

            {managedBots.length === 0 ? (
              <div className="text-xs text-stone-500 italic p-4 bg-stone-50 rounded-2xl border border-stone-200">
                Нет подключенных ботов. Добавьте бота во вкладке «Источники и Боты».
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {managedBots.map((b) => {
                  const currentBotColor = b.buttonColor || templates.defaultButtonColor || 'indigo';
                  const botFireworks = b.enableFireworks !== false;
                  const isUpdating = botSavingId === b.id;

                  return (
                    <div 
                      key={b.id} 
                      className="p-5 rounded-2xl border border-stone-200 bg-stone-50/70 hover:bg-stone-50 transition-colors space-y-3.5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2.5">
                          <div className="h-9 w-9 rounded-xl bg-stone-900 text-white flex items-center justify-center font-bold text-sm">
                            {b.name.charAt(0)}
                          </div>
                          <div>
                            <div className="font-bold text-xs sm:text-sm text-stone-900">{b.name}</div>
                            <div className="text-[11px] text-stone-500">{b.username}</div>
                          </div>
                        </div>
                        {isUpdating && (
                          <span className="text-[10px] text-indigo-600 animate-pulse font-medium">Сохранение...</span>
                        )}
                      </div>

                      {/* Color selector */}
                      <div>
                        <div className="text-[11px] font-semibold text-stone-600 mb-1.5 flex items-center justify-between">
                          <span>Цвет кнопок в боте:</span>
                          <span className="text-[10px] font-mono text-stone-500 uppercase">{currentBotColor}</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {COLOR_PRESETS.map((preset) => (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() => handleUpdateBotColor(b.id, preset.id)}
                              className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all ${
                                currentBotColor === preset.id
                                  ? `${preset.bg} text-white border-transparent shadow-xs scale-105`
                                  : 'bg-white text-stone-700 border-stone-200 hover:border-stone-300'
                              }`}
                            >
                              <span className={`h-2 w-2 rounded-full ${preset.bg}`} />
                              <span>{preset.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Bot-specific fireworks switch */}
                      <div className="flex items-center justify-between pt-2 border-t border-stone-200/80 text-xs">
                        <span className="text-[11px] text-stone-600 font-medium">Салюты при получении подписки:</span>
                        <div className="flex items-center space-x-2">
                          <button
                            type="button"
                            onClick={() => handleToggleBotFireworks(b.id, !botFireworks)}
                            className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition ${
                              botFireworks
                                ? 'bg-amber-50 text-amber-700 border-amber-300'
                                : 'bg-stone-200 text-stone-600 border-stone-300'
                            }`}
                          >
                            {botFireworks ? '🎉 Включены' : 'Выключены'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex justify-end pt-4 border-t border-stone-100">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSaving}
              className="px-6 py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs flex items-center space-x-2 shadow-xs cursor-pointer"
            >
              <Save className="h-3.5 w-3.5 text-amber-400" />
              <span>{isSaving ? 'Сохранение...' : 'Сохранить настройки оформления'}</span>
            </button>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: CLIENT LABELS & NOTICES */}
      {activeSubTab === 'client_labels' && (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left channel */}
            <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-xs space-y-4">
              <div className="flex items-center space-x-2 border-b border-stone-100 pb-3">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                <h3 className="font-bold text-stone-900 text-sm">
                  1. Отображение при отписке от канала
                </h3>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="font-bold text-stone-800 block mb-1">
                    Название узла в VPN клиенте:
                  </label>
                  <input
                    type="text"
                    value={templates.unsubscribedNodeName}
                    onChange={(e) => setTemplates({ ...templates, unsubscribedNodeName: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 font-medium"
                  />
                </div>

                <div>
                  <label className="font-bold text-stone-800 block mb-1">
                    Текст уведомления / Инструкция:
                  </label>
                  <textarea
                    rows={2}
                    value={templates.unsubscribedNotice}
                    onChange={(e) => setTemplates({ ...templates, unsubscribedNotice: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-900"
                  />
                </div>

                <div className="p-3 rounded-xl bg-stone-900 text-stone-100 text-[11px] font-mono border border-stone-800">
                  <div className="text-stone-400 text-[10px] mb-1">Вид в V2Ray / Happ:</div>
                  <div className="text-amber-400 font-bold">{templates.unsubscribedNodeName}</div>
                  <div className="text-stone-400 text-[10px] mt-0.5">{templates.unsubscribedNotice}</div>
                </div>
              </div>
            </div>

            {/* Blocked by admin */}
            <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-xs space-y-4">
              <div className="flex items-center space-x-2 border-b border-stone-100 pb-3">
                <Ban className="h-5 w-5 text-rose-500" />
                <h3 className="font-bold text-stone-900 text-sm">
                  2. Отображение при перманентном бане
                </h3>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="font-bold text-stone-800 block mb-1">
                    Название узла в VPN клиенте:
                  </label>
                  <input
                    type="text"
                    value={templates.blockedNodeName}
                    onChange={(e) => setTemplates({ ...templates, blockedNodeName: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 font-medium"
                  />
                </div>

                <div>
                  <label className="font-bold text-stone-800 block mb-1">
                    Текст уведомления / Инструкция:
                  </label>
                  <textarea
                    rows={2}
                    value={templates.blockedNotice}
                    onChange={(e) => setTemplates({ ...templates, blockedNotice: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-900"
                  />
                </div>

                <div className="p-3 rounded-xl bg-stone-900 text-stone-100 text-[11px] font-mono border border-stone-800">
                  <div className="text-stone-400 text-[10px] mb-1">Вид в V2Ray / Happ:</div>
                  <div className="text-rose-400 font-bold">{templates.blockedNodeName}</div>
                  <div className="text-stone-400 text-[10px] mt-0.5">{templates.blockedNotice}</div>
                </div>
              </div>
            </div>

            {/* Muted / Temporary pause */}
            <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-xs space-y-4">
              <div className="flex items-center space-x-2 border-b border-stone-100 pb-3">
                <VolumeX className="h-5 w-5 text-amber-600" />
                <h3 className="font-bold text-stone-900 text-sm">
                  3. Отображение при временной блокировке (Мут / Пауза)
                </h3>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="font-bold text-stone-800 block mb-1">
                    Название узла в VPN клиенте:
                  </label>
                  <input
                    type="text"
                    value={templates.mutedNodeName}
                    onChange={(e) => setTemplates({ ...templates, mutedNodeName: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 font-medium"
                  />
                </div>

                <div>
                  <label className="font-bold text-stone-800 block mb-1">
                    Текст уведомления:
                  </label>
                  <textarea
                    rows={2}
                    value={templates.mutedNotice}
                    onChange={(e) => setTemplates({ ...templates, mutedNotice: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-900"
                  />
                </div>

                <div className="p-3 rounded-xl bg-stone-900 text-stone-100 text-[11px] font-mono border border-stone-800">
                  <div className="text-stone-400 text-[10px] mb-1">Вид в V2Ray / Happ:</div>
                  <div className="text-amber-400 font-bold">{templates.mutedNodeName}</div>
                  <div className="text-stone-400 text-[10px] mt-0.5">{templates.mutedNotice}</div>
                </div>
              </div>
            </div>

            {/* Single Device notice */}
            <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-xs space-y-4">
              <div className="flex items-center space-x-2 border-b border-stone-100 pb-3">
                <Laptop className="h-5 w-5 text-purple-600" />
                <h3 className="font-bold text-stone-900 text-sm">
                  4. Отображение на 2-м устройстве (Политика 1 устройство)
                </h3>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="font-bold text-stone-800 block mb-1">
                    Название узла-заглушки для 2-го устройства:
                  </label>
                  <input
                    type="text"
                    value={templates.singleDeviceBlockedNotice || '⛔ Доступ заблокирован: Подписка уже привязана к другому устройству!'}
                    onChange={(e) => setTemplates({ ...templates, singleDeviceBlockedNotice: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 font-medium"
                  />
                </div>

                <div className="p-3 rounded-xl bg-stone-900 text-stone-100 text-[11px] font-mono border border-stone-800">
                  <div className="text-stone-400 text-[10px] mb-1">Вид на неавторизованном 2-м устройстве:</div>
                  <div className="text-purple-400 font-bold">
                    {templates.singleDeviceBlockedNotice || '⛔ Доступ заблокирован: Подписка уже привязана к другому устройству!'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs flex items-center space-x-2 shadow-xs cursor-pointer"
            >
              <Save className="h-3.5 w-3.5 text-amber-400" />
              <span>{isSaving ? 'Сохранение...' : 'Сохранить тексты узлов'}</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
