import React from 'react';
import { 
  Radio, 
  FileCode2, 
  Users, 
  Sparkles, 
  Settings, 
  RefreshCw, 
  Send, 
  Sliders,
  ShieldAlert,
  KeyRound,
  Megaphone,
  ShieldCheck,
  MessageSquare,
  Zap,
  Download,
  Terminal
} from 'lucide-react';
import { SystemStatus } from '../types';

interface HeaderProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  status: SystemStatus | null;
  onRefreshStatus: () => void;
  isRefreshing: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onTabChange,
  status,
  onRefreshStatus,
  isRefreshing,
}) => {
  const tabs = [
    { id: 'dashboard', label: 'Обзор', icon: Radio },
    { id: 'central-sub', label: 'Центральная подписка', icon: FileCode2 },
    { id: 'processor', label: 'Обработка ключей', icon: Sliders },
    { id: 'users', label: 'Подписчики и Доступ', icon: Users, badge: status?.counts?.totalUsers },
    { id: 'feedback', label: 'Обратная связь', icon: MessageSquare, badge: status?.counts?.pendingFeedbackCount },
    { id: 'exclusions', label: 'Исключения', icon: KeyRound, badge: status?.counts?.exclusionsCount },
    { id: 'broadcast', label: 'Рассылка в бот', icon: Megaphone },
    { id: 'bot-sim', label: 'Воронка и Бот', icon: Sparkles },
    { id: 'templates', label: '3 Источника и Блокировки', icon: ShieldAlert },
    { id: 'logs', label: 'Журнал процессов', icon: Terminal },
    { id: 'settings', label: 'Источники и Боты', icon: Settings },
  ];

  const connectedGitCount = status?.gitSources?.connectedCount || 0;
  const connectedBotCount = status?.bots?.connectedCount || 0;

  return (
    <header id="app-header" className="border-b border-stone-200 bg-white/95 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Top bar: Brand + Live indicators + Refresh */}
        <div className="flex items-center justify-between h-16 border-b border-stone-100">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-2xl bg-stone-900 flex items-center justify-center text-amber-400 shadow-xs">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-black text-stone-900 tracking-tight text-base">
                  ПУЛЬС ДОСТУПА
                </span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-stone-100 text-stone-700 border border-stone-200">
                  Multi-Bot & Git v2.4
                </span>
              </div>
              <p className="text-[11px] text-stone-500">
                Централизованный шлюз подписок, администрирование каналов и персональный доступ
              </p>
            </div>
          </div>

          {/* Indicators & Refresh Button */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            {/* Git Sources Badge */}
            <div className="hidden md:flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border border-stone-200 text-xs bg-stone-50">
              <span className={`h-2 w-2 rounded-full ${connectedGitCount > 0 ? 'bg-emerald-500' : 'bg-amber-400'}`} />
              <span className="text-stone-600 font-medium">
                Git: <strong>{connectedGitCount} из {status?.gitSources?.total || 1}</strong>
              </span>
            </div>

            {/* Telegram Bots Badge */}
            <div className="hidden md:flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border border-stone-200 text-xs bg-stone-50">
              <span className={`h-2 w-2 rounded-full ${connectedBotCount > 0 ? 'bg-emerald-500' : 'bg-rose-400'}`} />
              <span className="text-stone-600 font-medium">
                Боты: <strong>{connectedBotCount} активен</strong>
              </span>
            </div>

            {/* Channel Admin Status */}
            <div className="hidden lg:flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border border-stone-200 text-xs bg-stone-50">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              <span className="text-stone-700 font-semibold">Админ канала: подтвержден</span>
            </div>

            {/* Download Full Source Button */}
            <a
              id="btn-header-download-source"
              href="/api/backup/download-full"
              download
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold shadow-xs transition-colors"
              title="Скачать полный архив исходного кода веб-приложения (.zip)"
            >
              <Download className="h-3.5 w-3.5 text-amber-400" />
              <span className="hidden sm:inline">Скачать исходники</span>
            </a>

            <button
              id="btn-header-refresh"
              onClick={onRefreshStatus}
              disabled={isRefreshing}
              className="p-2 rounded-xl border border-stone-200 hover:bg-stone-100 text-stone-700 transition-colors disabled:opacity-50"
              title="Обновить состояние системы"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin text-amber-600' : ''}`} />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav id="app-nav-tabs" className="flex space-x-1 sm:space-x-2 overflow-x-auto py-2.5 no-scrollbar text-xs">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = currentTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`nav-tab-${tab.id}`}
                onClick={() => onTabChange(tab.id)}
                className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl font-semibold whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-stone-900 text-white shadow-xs'
                    : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? 'text-amber-400' : 'text-stone-500'}`} />
                <span>{tab.label}</span>
                {typeof tab.badge === 'number' && (
                  <span
                    className={`ml-1 text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      isActive ? 'bg-amber-400 text-stone-900' : 'bg-stone-200 text-stone-700'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
