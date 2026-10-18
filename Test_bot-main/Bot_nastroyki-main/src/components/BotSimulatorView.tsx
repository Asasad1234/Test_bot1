import React, { useState, useRef, useEffect } from 'react';
import QRCode from 'qrcode';
import confetti from 'canvas-confetti';
import { 
  Send, 
  Bot, 
  User, 
  RotateCcw, 
  CheckCircle2, 
  Copy, 
  Check, 
  Sparkles, 
  QrCode,
  ExternalLink,
  Edit3,
  Save,
  X,
  Clock
} from 'lucide-react';
import { ManagedBotItem, BotSimulatedMessage } from '../types';
import { simulateBotMessage } from '../services/api';
import { CANONICAL_BOT_TEMPLATES, formatBotTemplate } from '../utils/bot-templates';

interface BotSimulatorViewProps {
  activeBot: ManagedBotItem | null;
  onUpdateActiveBot: (bot: Partial<ManagedBotItem>) => Promise<void>;
}

const STEP_DEFINITIONS: Record<string, { label: string; field: keyof ManagedBotItem; vars: string[] }> = {
  welcome: {
    label: 'Приветствие (/start)',
    field: 'welcomeMessage',
    vars: ['{name}', '{username}', '{id}'],
  },
  channel_notice: {
    label: 'Обязательные каналы',
    field: 'channelNoticeMessage',
    vars: ['{name}', '{channel}'],
  },
  choose_format: {
    label: 'Выбор формата (HAPP vs INCY)',
    field: 'chooseFormatMessage',
    vars: ['{name}'],
  },
  sub_issued: {
    label: 'Выдача ключа и подписки',
    field: 'subIssuedMessage',
    vars: ['{name}', '{subTypeName}', '{totalServers}', '{time}', '{tz}', '{key}', '{hours}', '{otherFormat}', '{appGuide}'],
  },
  profile: {
    label: 'Профиль / Личный кабинет',
    field: 'profileMessage',
    vars: ['{id}', '{status}', '{subTypeName}', '{device}', '{boundDate}', '{key}', '{otherFormat}'],
  },
  instructions: {
    label: 'Инструкция по подключению',
    field: 'instructionsMessage',
    vars: ['{name}'],
  },
  blocked: {
    label: 'Сообщение о блокировке',
    field: 'blockedUserMessage',
    vars: ['{reason}', '{date}', '{attempts}'],
  },
};

function renderTelegramFormattedLine(line: string): React.ReactNode {
  const regex = /(?:<code>([\s\S]*?)<\/code>|`([^`]+)`|<b>([\s\S]*?)<\/b>|\*\*(.*?)\*\*|<i>([\s\S]*?)<\/i>|\*([^*\n]+)\*|<a\s+href="([^"]+)">([\s\S]*?)<\/a>|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))/g;

  const elements: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      elements.push(line.substring(lastIndex, match.index));
    }

    const [
      ,
      htmlCode,
      mdCode,
      htmlBold,
      mdBold,
      htmlItalic,
      mdItalic,
      htmlLinkUrl,
      htmlLinkText,
      mdLinkText,
      mdLinkUrl,
    ] = match;

    const codeVal = htmlCode ?? mdCode;
    const boldVal = htmlBold ?? mdBold;
    const italicVal = htmlItalic ?? mdItalic;
    const linkUrl = htmlLinkUrl ?? mdLinkUrl;
    const linkText = htmlLinkText ?? mdLinkText;

    if (codeVal !== undefined) {
      elements.push(
        <code
          key={match.index}
          className="px-1.5 py-0.5 rounded bg-stone-900/90 text-amber-300 font-mono text-[11px] border border-stone-700/60 break-all select-all inline-block my-0.5"
        >
          {codeVal}
        </code>
      );
    } else if (boldVal !== undefined) {
      elements.push(
        <strong key={match.index} className="font-bold text-stone-100">
          {boldVal}
        </strong>
      );
    } else if (italicVal !== undefined) {
      elements.push(
        <em key={match.index} className="italic text-stone-300">
          {italicVal}
        </em>
      );
    } else if (linkUrl !== undefined) {
      elements.push(
        <a
          key={match.index}
          href={linkUrl}
          target="_blank"
          rel="noreferrer"
          className="text-sky-400 hover:text-sky-300 underline font-medium"
        >
          {linkText || linkUrl}
        </a>
      );
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < line.length) {
    elements.push(line.substring(lastIndex));
  }

  return elements.length > 0 ? elements : line;
}

function TelegramMessageContent({ text }: { text: string }) {
  if (!text) return null;
  const lines = text.split('\n');

  return (
    <div className="space-y-1 select-text text-xs leading-relaxed">
      {lines.map((line, idx) => {
        if (!line.trim()) {
          return <div key={idx} className="h-2" />;
        }
        return (
          <div key={idx} className="break-words">
            {renderTelegramFormattedLine(line)}
          </div>
        );
      })}
    </div>
  );
}

export const BotSimulatorView: React.FC<BotSimulatorViewProps> = ({
  activeBot,
  onUpdateActiveBot,
}) => {
  const [messages, setMessages] = useState<BotSimulatedMessage[]>([
    {
      id: 'msg_init',
      sender: 'system',
      text: '🤖 Интерактивный симулятор Telegram бота запущен. Нажмите /start для проверки полной воронки.',
      date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  // Inline message editor state
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState('');
  const [editingStepKey, setEditingStepKey] = useState<string>('welcome');
  const [isSavingInline, setIsSavingInline] = useState(false);
  const [inlineFeedback, setInlineFeedback] = useState<string | null>(null);

  // Simulation test user
  const [simUser, setSimUser] = useState({
    id: 108456789,
    firstName: 'Алексей',
    username: 'alex_test',
    isChannelMember: true,
    isBlocked: false,
  });

  // Settings form state for active bot
  const [welcomeText, setWelcomeText] = useState(activeBot?.welcomeMessage || '');
  const [adminContact, setAdminContact] = useState(activeBot?.adminContactUrl || 'https://t.me/puls_admin');
  const [blockedMsg, setBlockedMsg] = useState(activeBot?.blockedUserMessage || '');
  const [unsubMsg, setUnsubMsg] = useState(activeBot?.unsubscribedMessage || '');
  const [chooseFormatMsg, setChooseFormatMsg] = useState(activeBot?.chooseFormatMessage || '');
  const [subIssuedMsg, setSubIssuedMsg] = useState(activeBot?.subIssuedMessage || '');
  const [profileMsg, setProfileMsg] = useState(activeBot?.profileMessage || '');
  const [instructionsMsg, setInstructionsMsg] = useState(activeBot?.instructionsMessage || '');
  const [channelNoticeMsg, setChannelNoticeMsg] = useState(activeBot?.channelNoticeMessage || '');
  const [botTimeZone, setBotTimeZone] = useState(activeBot?.timeZone || 'device');
  const [selfDeleteH, setSelfDeleteH] = useState(activeBot?.selfDeleteHours || 72);
  const [deletePrevMsg, setDeletePrevMsg] = useState(activeBot?.deletePreviousMessageOnStep || false);
  const [showQrCode, setShowQrCode] = useState<boolean>(activeBot?.showQrCode ?? true);

  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<'funnel' | 'advanced'>('funnel');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  useEffect(() => {
    if (activeBot) {
      setWelcomeText(activeBot.welcomeMessage || '');
      setAdminContact(activeBot.adminContactUrl || 'https://t.me/puls_admin');
      setBlockedMsg(activeBot.blockedUserMessage || '');
      setUnsubMsg(activeBot.unsubscribedMessage || '');
      setChooseFormatMsg(activeBot.chooseFormatMessage || '');
      setSubIssuedMsg(activeBot.subIssuedMessage || '');
      setProfileMsg(activeBot.profileMessage || '');
      setInstructionsMsg(activeBot.instructionsMessage || '');
      setChannelNoticeMsg(activeBot.channelNoticeMessage || '');
      setBotTimeZone(activeBot.timeZone || 'device');
      setSelfDeleteH(activeBot.selfDeleteHours || 72);
      setDeletePrevMsg(activeBot.deletePreviousMessageOnStep || false);
      setShowQrCode(activeBot.showQrCode ?? true);
    }
  }, [activeBot]);

  const triggerFireworks = () => {
    confetti({
      particleCount: 120,
      spread: 80,
      origin: { y: 0.6 },
      colors: ['#f59e0b', '#38bdf8', '#10b981', '#6366f1', '#ec4899'],
    });
  };

  const getClientDeviceTime = () => {
    return new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const getClientDeviceTz = () => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'местное время';
    } catch {
      return 'местное время';
    }
  };

  const sendCommand = async (cmdText: string, callbackData?: string) => {
    if (!cmdText && !callbackData) return;

    const userMessage: BotSimulatedMessage = {
      id: `user_${Date.now()}`,
      sender: 'user',
      text: cmdText || (callbackData ? `[Нажата кнопка: ${callbackData}]` : ''),
      date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => {
      if (deletePrevMsg && callbackData) {
        return [...prev.slice(-2), userMessage];
      }
      return [...prev, userMessage];
    });

    setInputText('');
    setIsTyping(true);

    try {
      const data = await simulateBotMessage({
        text: cmdText,
        callbackData,
        user: simUser,
        clientTime: getClientDeviceTime(),
        clientTimeZone: getClientDeviceTz(),
      });

      if (data.response) {
        if (data.response.fireworks) {
          triggerFireworks();
        }

        let qrDataUrl = undefined;
        if (data.response.qrData && showQrCode) {
          try {
            qrDataUrl = await QRCode.toDataURL(data.response.qrData, { width: 180, margin: 1 });
          } catch {}
        }

        const botReply: BotSimulatedMessage = {
          id: `bot_${Date.now()}`,
          sender: 'bot',
          text: data.response.text,
          date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          buttons: data.response.buttons,
          copyableText: data.response.copyableText,
          qrData: qrDataUrl,
          stepKey: data.response.stepKey,
        };

        setMessages((prev) => [...prev, botReply]);
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          sender: 'system',
          text: `Ошибка симулятора: ${err.message}`,
          date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedLink(text);
    setTimeout(() => setCopiedLink(null), 2000);
  };

  // Start inline editing of a bot message
  const handleStartEditMessage = (msg: BotSimulatedMessage) => {
    let step = msg.stepKey;
    if (!step) {
      if (msg.text.includes('ГОТОВА') || msg.text.includes('Ваш ключ')) step = 'sub_issued';
      else if (msg.text.includes('Инструкция') || msg.text.includes('HAPP Desktop') || msg.text.includes('v2rayNG')) step = 'instructions';
      else if (msg.text.includes('формат') || (msg.text.includes('HAPP') && msg.text.includes('INCY'))) step = 'choose_format';
      else if (msg.text.includes('канал') || msg.text.includes('подпис')) step = 'channel_notice';
      else if (msg.text.includes('профиль') || msg.text.includes('Личный кабинет')) step = 'profile';
      else if (msg.text.includes('заблокирован')) step = 'blocked';
      else step = 'welcome';
    }

    setEditingMessageId(msg.id);
    setEditingStepKey(step);
    const stepMeta = STEP_DEFINITIONS[step];
    const savedTemplate = stepMeta && activeBot ? (activeBot[stepMeta.field] as string) : '';
    const canonicalTemplate = stepMeta ? (CANONICAL_BOT_TEMPLATES as any)[stepMeta.field] : '';
    setEditingDraft(savedTemplate || canonicalTemplate || msg.text);
  };

  // Save inline edited message directly into bot configuration
  const handleSaveInlineMessage = async (msgId: string) => {
    if (!activeBot) return;
    setIsSavingInline(true);
    try {
      const stepMeta = STEP_DEFINITIONS[editingStepKey];
      const fieldToUpdate = stepMeta ? stepMeta.field : 'welcomeMessage';

      const patch: Partial<ManagedBotItem> = {
        id: activeBot.id,
        [fieldToUpdate]: editingDraft,
      };

      await onUpdateActiveBot(patch);

      // Update in-memory state of the right-hand panel
      if (fieldToUpdate === 'welcomeMessage') setWelcomeText(editingDraft);
      if (fieldToUpdate === 'channelNoticeMessage') setChannelNoticeMsg(editingDraft);
      if (fieldToUpdate === 'chooseFormatMessage') setChooseFormatMsg(editingDraft);
      if (fieldToUpdate === 'subIssuedMessage') setSubIssuedMsg(editingDraft);
      if (fieldToUpdate === 'profileMessage') setProfileMsg(editingDraft);
      if (fieldToUpdate === 'instructionsMessage') setInstructionsMsg(editingDraft);
      if (fieldToUpdate === 'blockedUserMessage') setBlockedMsg(editingDraft);

      // Re-format the template for the bubble so user immediately sees their variables evaluated
      const simFormattedText = formatBotTemplate(editingDraft, {
        name: simUser.name,
        username: simUser.username,
        id: simUser.telegramId,
        subTypeName: simUser.subscriptionType === 'happ' ? 'HAPP (crypt5)' : 'INCY',
        format: simUser.subscriptionType === 'happ' ? 'HAPP (crypt5)' : 'INCY',
        totalServers: 10,
        time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
        tz: 'МСК',
        key: simUser.subscriptionType === 'happ' ? 'happ://crypt5/preview-key-simulator-99' : 'https://gitverse.ru/api/raw/preview-incy-simulator',
        link: simUser.subscriptionType === 'happ' ? 'happ://crypt5/preview-key-simulator-99' : 'https://gitverse.ru/api/raw/preview-incy-simulator',
        hours: activeBot.selfDeleteHours || 72,
        device: simUser.boundDevice || 'iPhone 15 Pro / Shadowrocket',
        boundDate: new Date().toLocaleString('ru-RU'),
        status: simUser.hasActiveSubscription ? '🟢 Активна' : '⚪ Не получена',
      });

      // Update current message bubble in simulator
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId ? { ...m, text: simFormattedText || editingDraft, stepKey: editingStepKey } : m
        )
      );

      setEditingMessageId(null);
      setInlineFeedback('✅ Текст сохранен навсегда в боте!');
      setTimeout(() => setInlineFeedback(null), 3500);
    } catch (err: any) {
      alert(`Ошибка сохранения: ${err.message}`);
    } finally {
      setIsSavingInline(false);
    }
  };

  const handleSaveBotSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBot) return;
    setIsSavingSettings(true);
    setSaveSuccess(false);
    try {
      await onUpdateActiveBot({
        id: activeBot.id,
        welcomeMessage: welcomeText,
        adminContactUrl: adminContact,
        blockedUserMessage: blockedMsg,
        unsubscribedMessage: unsubMsg,
        chooseFormatMessage: chooseFormatMsg,
        subIssuedMessage: subIssuedMsg,
        profileMessage: profileMsg,
        instructionsMessage: instructionsMsg,
        channelNoticeMessage: channelNoticeMsg,
        timeZone: botTimeZone,
        selfDeleteHours: selfDeleteH,
        deletePreviousMessageOnStep: deletePrevMsg,
        showQrCode: showQrCode,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } finally {
      setIsSavingSettings(false);
    }
  };

  const clearChat = () => {
    setMessages([
      {
        id: 'msg_init_reset',
        sender: 'system',
        text: '🔄 История очищена. Нажмите /start для тестирования воронки.',
        date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  };

  return (
    <div id="bot-simulator-view" className="space-y-6">
      {inlineFeedback && (
        <div className="p-3 bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 rounded-xl text-xs font-semibold flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            <span>{inlineFeedback}</span>
          </div>
          <button onClick={() => setInlineFeedback(null)} className="text-emerald-400 hover:text-emerald-200">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 7 Cols: Telegram Interactive Phone Mockup */}
        <div className="lg:col-span-7 flex flex-col">
          <div className="bg-stone-900 rounded-3xl p-3 sm:p-4 shadow-xl border border-stone-800 flex-1 flex flex-col max-w-xl mx-auto w-full">
            {/* Phone Screen Header (Telegram Style) */}
            <div className="bg-stone-800 text-white px-4 py-3 rounded-2xl flex items-center justify-between border-b border-stone-700/60 shadow-xs">
              <div className="flex items-center space-x-3">
                <div className="h-10 w-10 rounded-full bg-sky-500 flex items-center justify-center font-bold text-white shadow-xs">
                  <Bot className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-1.5">
                    <span className="font-bold text-sm text-white">
                      {activeBot?.username ? `@${activeBot.username}` : 'Пульс Доступа'}
                    </span>
                    <span className="text-[10px] bg-sky-400/20 text-sky-300 px-1.5 py-0.2 rounded font-medium">
                      bot
                    </span>
                  </div>
                  <span className="text-[11px] text-stone-400">
                    {isTyping ? 'печатает...' : 'онлайн'}
                  </span>
                </div>
              </div>

              <div className="flex items-center space-x-1.5">
                <span className="text-[10px] text-stone-400 bg-stone-900/60 px-2 py-1 rounded-md flex items-center space-x-1">
                  <Clock className="h-3 w-3 text-sky-400" />
                  <span>{getClientDeviceTime()}</span>
                </span>
                <button
                  id="btn-clear-bot-chat"
                  onClick={clearChat}
                  className="p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-stone-700/60 transition-colors cursor-pointer"
                  title="Очистить чат"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Test User Simulation Bar */}
            <div className="bg-stone-800/40 px-3 py-2 border-b border-stone-800 text-[11px] text-stone-300 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center space-x-2">
                <User className="h-3.5 w-3.5 text-stone-400" />
                <span>Тест-юзер: <strong>{simUser.firstName}</strong></span>
              </div>
              <div className="flex items-center space-x-2.5">
                <label className="flex items-center space-x-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={simUser.isChannelMember}
                    onChange={(e) => setSimUser({ ...simUser, isChannelMember: e.target.checked })}
                    className="rounded text-emerald-600 focus:ring-0"
                  />
                  <span>В канале</span>
                </label>

                <label className="flex items-center space-x-1 cursor-pointer text-rose-400">
                  <input
                    type="checkbox"
                    checked={simUser.isBlocked}
                    onChange={(e) => setSimUser({ ...simUser, isBlocked: e.target.checked })}
                    className="rounded text-rose-600 focus:ring-0"
                  />
                  <span>Заблокирован</span>
                </label>

                <button
                  type="button"
                  onClick={async () => {
                    const nextVal = !showQrCode;
                    setShowQrCode(nextVal);
                    if (activeBot) {
                      await onUpdateActiveBot({ ...activeBot, showQrCode: nextVal });
                    }
                  }}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold border transition-colors flex items-center space-x-1 cursor-pointer ${
                    showQrCode
                      ? 'bg-amber-400/20 text-amber-300 border-amber-400/40 hover:bg-amber-400/30'
                      : 'bg-stone-700/60 text-stone-400 border-stone-600 hover:bg-stone-700'
                  }`}
                  title="Быстрое переключение отображения QR-кода"
                >
                  <QrCode className="h-3 w-3" />
                  <span>QR: {showQrCode ? 'ВКЛ' : 'ВЫКЛ'}</span>
                </button>
              </div>
            </div>

            {/* Step Jump Strip: lets user click any step to see or trigger it */}
            <div className="bg-stone-950/80 px-2.5 py-1.5 border-b border-stone-800/80 flex items-center space-x-1.5 overflow-x-auto text-[10px]">
              <span className="text-stone-400 font-semibold shrink-0">Шаги воронки:</span>
              <button
                type="button"
                onClick={() => sendCommand('/start')}
                className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-stone-200 shrink-0 cursor-pointer"
              >
                1. Приветствие
              </button>
              <button
                type="button"
                onClick={() => {
                  setSimUser((u) => ({ ...u, isChannelMember: false }));
                  sendCommand('cmd_choose_format');
                }}
                className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-amber-300 shrink-0 cursor-pointer"
                title="Показать требование подписаться на каналы"
              >
                2. Каналы
              </button>
              <button
                type="button"
                onClick={() => {
                  setSimUser((u) => ({ ...u, isChannelMember: true }));
                  sendCommand('cmd_choose_format');
                }}
                className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-sky-300 shrink-0 cursor-pointer"
              >
                3. Выбор формата
              </button>
              <button
                type="button"
                onClick={() => {
                  setSimUser((u) => ({ ...u, isChannelMember: true }));
                  sendCommand('cmd_issue_happ');
                }}
                className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-emerald-300 shrink-0 cursor-pointer"
              >
                4. Выдача HAPP
              </button>
              <button
                type="button"
                onClick={() => {
                  setSimUser((u) => ({ ...u, isChannelMember: true }));
                  sendCommand('cmd_issue_incy');
                }}
                className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-teal-300 shrink-0 cursor-pointer"
              >
                5. Выдача INCY
              </button>
              <button
                type="button"
                onClick={() => sendCommand('cmd_profile')}
                className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-purple-300 shrink-0 cursor-pointer"
              >
                6. Профиль
              </button>
              <button
                type="button"
                onClick={() => sendCommand('cmd_instructions')}
                className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-indigo-300 shrink-0 cursor-pointer"
              >
                7. Инструкция
              </button>
            </div>

            {/* Chat Message Stream */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[400px] max-h-[480px] bg-stone-950/60 rounded-xl my-2">
              {messages.map((m) => {
                if (m.sender === 'system') {
                  return (
                    <div key={m.id} className="text-center my-2">
                      <span className="px-3 py-1 rounded-full bg-stone-800 text-stone-400 text-[11px]">
                        {m.text}
                      </span>
                    </div>
                  );
                }

                const isUser = m.sender === 'user';
                const isEditing = editingMessageId === m.id;
                const stepMeta = m.stepKey && STEP_DEFINITIONS[m.stepKey];

                return (
                  <div
                    key={m.id}
                    className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} group`}
                  >
                    <div
                      className={`max-w-[88%] rounded-2xl p-3 text-xs leading-relaxed relative ${
                        isUser
                          ? 'bg-sky-600 text-white rounded-br-xs'
                          : 'bg-stone-800 text-stone-100 rounded-bl-xs border border-stone-700/60'
                      }`}
                    >
                      {/* Step Tag Header & Quick Edit Button for bot messages */}
                      {!isUser && (
                        <div className="flex items-center justify-between gap-2 pb-1.5 mb-1.5 border-b border-stone-700/50 text-[10px]">
                          <span className="font-semibold text-sky-400 flex items-center space-x-1">
                            <span>🤖</span>
                            <span>{stepMeta ? stepMeta.label : 'Шаг воронки'}</span>
                          </span>

                          {!isEditing && (
                            <button
                              type="button"
                              onClick={() => handleStartEditMessage(m)}
                              className="px-2 py-0.5 rounded bg-stone-700 hover:bg-stone-600 text-amber-300 flex items-center space-x-1 transition-colors font-medium cursor-pointer"
                              title="Отредактировать текст этого шага и сохранить в бота навсегда"
                            >
                              <Edit3 className="h-2.5 w-2.5" />
                              <span>Редактировать текст</span>
                            </button>
                          )}
                        </div>
                      )}

                      {/* Editing Mode */}
                      {isEditing ? (
                        <div className="space-y-2 py-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-amber-300">
                              Редактирование шага:
                            </span>
                            <select
                              value={editingStepKey}
                              onChange={(e) => setEditingStepKey(e.target.value)}
                              className="bg-stone-900 border border-stone-700 text-stone-200 text-[10px] rounded px-1.5 py-0.5"
                            >
                              {Object.entries(STEP_DEFINITIONS).map(([k, v]) => (
                                <option key={k} value={k}>
                                  {v.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <textarea
                            rows={6}
                            value={editingDraft}
                            onChange={(e) => setEditingDraft(e.target.value)}
                            className="w-full p-2.5 bg-stone-900 text-stone-100 text-[11px] rounded-xl border border-amber-500/50 font-sans focus:outline-none focus:border-amber-400"
                          />

                          {/* Variable Helper chips */}
                          {STEP_DEFINITIONS[editingStepKey]?.vars && (
                            <div className="flex flex-wrap gap-1 text-[10px]">
                              <span className="text-stone-400">Переменные:</span>
                              {STEP_DEFINITIONS[editingStepKey].vars.map((v) => (
                                <button
                                  key={v}
                                  type="button"
                                  onClick={() => setEditingDraft((prev) => `${prev} ${v}`)}
                                  className="px-1.5 py-0.2 bg-stone-900 text-amber-300 rounded border border-stone-700 hover:border-amber-400 font-mono cursor-pointer"
                                >
                                  {v}
                                </button>
                              ))}
                            </div>
                          )}

                          <div className="flex items-center justify-end space-x-2 pt-1">
                            <button
                              type="button"
                              onClick={() => setEditingMessageId(null)}
                              className="px-2.5 py-1 rounded-lg bg-stone-700 hover:bg-stone-600 text-stone-300 text-[11px] cursor-pointer"
                            >
                              Отмена
                            </button>
                            <button
                              type="button"
                              disabled={isSavingInline}
                              onClick={() => handleSaveInlineMessage(m.id)}
                              className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[11px] flex items-center space-x-1 shadow-xs disabled:opacity-50 cursor-pointer"
                            >
                              <Save className="h-3 w-3" />
                              <span>{isSavingInline ? 'Сохранение...' : 'Сохранить навсегда в бот'}</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <TelegramMessageContent text={m.text} />
                      )}

                      {/* Copyable link card if present */}
                      {!isEditing && m.copyableText && (
                        <div className="mt-2.5 p-2 bg-stone-900/90 rounded-lg border border-stone-700 flex items-center justify-between space-x-2">
                          <span className="font-mono text-[11px] text-amber-300 truncate select-all">
                            {m.copyableText}
                          </span>
                          <button
                            onClick={() => handleCopy(m.copyableText!)}
                            className="p-1 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 shrink-0 cursor-pointer"
                          >
                            {copiedLink === m.copyableText ? (
                              <Check className="h-3 w-3 text-emerald-400" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </button>
                        </div>
                      )}

                      {/* QR preview if present */}
                      {!isEditing && m.qrData && (
                        <div className="mt-2.5 text-center">
                          <img
                            src={m.qrData}
                            alt="QR"
                            className="w-32 h-32 mx-auto rounded-lg bg-white p-1 border border-stone-600"
                          />
                        </div>
                      )}

                      <div
                        className={`text-[10px] text-right mt-1.5 ${
                          isUser ? 'text-sky-200' : 'text-stone-400'
                        }`}
                      >
                        {m.date}
                      </div>
                    </div>

                    {/* Inline Keyboard Buttons */}
                    {m.buttons && m.buttons.length > 0 && (
                      <div className="mt-1.5 flex flex-col gap-1.5 w-full max-w-[88%]">
                        {m.buttons.map((row, rowIdx) => (
                          <div key={rowIdx} className="flex gap-1.5">
                            {row.map((btn, btnIdx) => {
                              let btnBg = 'bg-stone-800 hover:bg-stone-700 text-stone-200 border-stone-700/80';
                              if (btn.color === 'indigo') btnBg = 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500';
                              if (btn.color === 'emerald') btnBg = 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500';
                              if (btn.color === 'amber') btnBg = 'bg-amber-600 hover:bg-amber-500 text-white border-amber-500';

                              return (
                                <button
                                  key={btnIdx}
                                  id={`sim-btn-${btn.callbackData || btnIdx}`}
                                  onClick={() => {
                                    if (btn.url) {
                                      window.open(btn.url, '_blank');
                                    } else if (btn.callbackData) {
                                      sendCommand('', btn.callbackData);
                                    }
                                  }}
                                  className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-semibold border shadow-xs transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${btnBg}`}
                                >
                                  <span>{btn.text}</span>
                                  {btn.url && <ExternalLink className="h-3 w-3 opacity-60" />}
                                </button>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {isTyping && (
                <div className="flex items-center space-x-2 text-stone-400 text-xs py-1">
                  <div className="flex space-x-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse"></span>
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse delay-75"></span>
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse delay-150"></span>
                  </div>
                  <span>Бот формирует ответ...</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick Command Chips */}
            <div className="flex flex-wrap gap-1.5 py-1 text-xs">
              <button
                id="chip-start"
                onClick={() => sendCommand('/start')}
                className="px-2.5 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 font-mono text-[11px] cursor-pointer"
              >
                /start (Меню)
              </button>
              <button
                id="chip-sub"
                onClick={() => sendCommand('cmd_start_funnel')}
                className="px-2.5 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 font-mono text-[11px] cursor-pointer"
              >
                Воронка подписки
              </button>
              <button
                id="chip-choose-format"
                onClick={() => sendCommand('cmd_choose_format')}
                className="px-2.5 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-sky-300 font-mono text-[11px] cursor-pointer"
              >
                Выбор формата
              </button>
              <button
                id="chip-profile"
                onClick={() => sendCommand('cmd_profile')}
                className="px-2.5 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 font-mono text-[11px] cursor-pointer"
              >
                Мой профиль
              </button>
              <button
                id="chip-fireworks"
                onClick={triggerFireworks}
                className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 text-[11px] flex items-center space-x-1 cursor-pointer"
              >
                <Sparkles className="h-3 w-3" />
                <span>Салют</span>
              </button>
            </div>

            {/* Chat Input Field */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendCommand(inputText);
              }}
              className="flex items-center space-x-2 pt-2"
            >
              <input
                type="text"
                id="input-sim-message"
                placeholder="Введите сообщение или /start..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                className="flex-1 bg-stone-800 text-white placeholder-stone-400 text-xs px-3.5 py-2.5 rounded-xl border border-stone-700 focus:outline-none focus:border-sky-500"
              />
              <button
                type="submit"
                id="btn-send-sim-message"
                disabled={!inputText.trim()}
                className="p-2.5 rounded-xl bg-sky-500 text-white hover:bg-sky-400 disabled:opacity-40 transition-colors cursor-pointer"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>

        {/* Right 5 Cols: Bot Funnel & Policy Settings */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="border-b border-stone-100 pb-3 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-stone-900">
                  Тексты шагов и воронка бота
                </h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  Редактируйте тексты прямо в симуляторе слева или сохраняйте через форму ниже
                </p>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-stone-200 space-x-3 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setActiveTab('funnel')}
                className={`pb-2 border-b-2 transition-colors cursor-pointer ${
                  activeTab === 'funnel'
                    ? 'border-stone-900 text-stone-900'
                    : 'border-transparent text-stone-400 hover:text-stone-700'
                }`}
              >
                Шаги и сообщения
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('advanced')}
                className={`pb-2 border-b-2 transition-colors cursor-pointer ${
                  activeTab === 'advanced'
                    ? 'border-stone-900 text-stone-900'
                    : 'border-transparent text-stone-400 hover:text-stone-700'
                }`}
              >
                Время выдачи и политики
              </button>
            </div>

            {saveSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center space-x-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>Все настройки бота успешно сохранены!</span>
              </div>
            )}

            <form onSubmit={handleSaveBotSettings} className="space-y-4 text-xs">
              {activeTab === 'funnel' ? (
                <>
                  <div>
                    <label className="font-semibold text-stone-700 block mb-1">
                      1. Приветственное сообщение (/start):
                    </label>
                    <textarea
                      rows={3}
                      value={welcomeText}
                      onChange={(e) => setWelcomeText(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 focus:bg-white text-stone-900 text-xs"
                      placeholder="Добро пожаловать в сервис безопасного доступа, {name}!"
                    />
                    <span className="text-[10px] text-stone-400">Переменные: {'{name}'}</span>
                  </div>

                  <div>
                    <label className="font-semibold text-stone-700 block mb-1">
                      2. Уведомление об обязательных каналах:
                    </label>
                    <textarea
                      rows={3}
                      value={channelNoticeMsg}
                      onChange={(e) => setChannelNoticeMsg(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 focus:bg-white text-stone-900 text-xs"
                      placeholder="Перед получением подписки необходимо подписаться на наши обязательные каналы..."
                    />
                    <span className="text-[10px] text-stone-400">Отображается пользователю при попытке взять ключ без подписки</span>
                  </div>

                  <div>
                    <label className="font-semibold text-stone-700 block mb-1">
                      3. Экран выбора формата (HAPP / INCY):
                    </label>
                    <textarea
                      rows={3}
                      value={chooseFormatMsg}
                      onChange={(e) => setChooseFormatMsg(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 focus:bg-white text-stone-900 text-xs"
                      placeholder="Выберите формат вашей персональной подписки: 1) HAPP (crypt5) 2) INCY / VLESS..."
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-stone-700 block mb-1">
                      4. Шаг выдачи готовой подписки (ключ доступа):
                    </label>
                    <textarea
                      rows={4}
                      value={subIssuedMsg}
                      onChange={(e) => setSubIssuedMsg(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 focus:bg-white text-stone-900 text-xs"
                      placeholder="ВАША ПЕРСОНАЛЬНАЯ ПОДПИСКА ГОТОВА! Формат: {subTypeName}, Серверов: {totalServers}, Время: {time} ({tz})..."
                    />
                    <span className="text-[10px] text-stone-400">
                      Переменные: {'{name}'}, {'{subTypeName}'}, {'{totalServers}'}, {'{time}'}, {'{tz}'}, {'{key}'}, {'{hours}'}
                    </span>
                  </div>

                  <div>
                    <label className="font-semibold text-stone-700 block mb-1">
                      5. Личный кабинет / профиль:
                    </label>
                    <textarea
                      rows={3}
                      value={profileMsg}
                      onChange={(e) => setProfileMsg(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 focus:bg-white text-stone-900 text-xs"
                      placeholder="Личный кабинет подписчика. ID: {id}, Статус: {status}..."
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-stone-700 block mb-1">
                      6. Сообщение при блокировке доступа:
                    </label>
                    <textarea
                      rows={2}
                      value={blockedMsg}
                      onChange={(e) => setBlockedMsg(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 focus:bg-white text-stone-900 text-xs"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-stone-700 block mb-1">
                      7. Инструкция по подключению:
                    </label>
                    <textarea
                      rows={3}
                      value={instructionsMsg}
                      onChange={(e) => setInstructionsMsg(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 focus:bg-white text-stone-900 text-xs"
                      placeholder="Инструкция по подключению..."
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="font-semibold text-stone-700 block mb-1">
                      Часовой пояс для времени выдачи ключа:
                    </label>
                    <select
                      value={botTimeZone}
                      onChange={(e) => setBotTimeZone(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 focus:bg-white text-stone-900 text-xs"
                    >
                      <option value="device">📱 Время с устройства пользователя (автоматически)</option>
                      <option value="Europe/Moscow">Europe/Moscow (МСК, UTC+3)</option>
                      <option value="UTC">UTC (Всемирное координированное время)</option>
                      <option value="Europe/Kaliningrad">Europe/Kaliningrad (UTC+2)</option>
                      <option value="Europe/Samara">Europe/Samara (UTC+4)</option>
                      <option value="Asia/Yekaterinburg">Asia/Yekaterinburg (UTC+5)</option>
                      <option value="Asia/Almaty">Asia/Almaty (UTC+5)</option>
                      <option value="Asia/Tashkent">Asia/Tashkent (UTC+5)</option>
                      <option value="Asia/Novosibirsk">Asia/Novosibirsk (UTC+7)</option>
                      <option value="Asia/Vladivostok">Asia/Vladivostok (UTC+10)</option>
                    </select>
                    <span className="text-[10px] text-stone-500 block mt-1">
                      При режиме «Время с устройства» бот учитывает точное местное время клиента, передаваемое при обращении.
                    </span>
                  </div>

                  <div>
                    <label className="font-semibold text-stone-700 block mb-1">
                      Ссылка на чат администратора (разбирательства):
                    </label>
                    <input
                      type="text"
                      value={adminContact}
                      onChange={(e) => setAdminContact(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 focus:bg-white text-stone-900 text-xs"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="font-semibold text-stone-700 block mb-1">
                        Самоудаление при отписке:
                      </label>
                      <div className="flex items-center space-x-1.5">
                        <input
                          type="number"
                          value={selfDeleteH}
                          onChange={(e) => setSelfDeleteH(Number(e.target.value))}
                          className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 font-medium"
                        />
                        <span className="text-stone-500 font-bold">ч.</span>
                      </div>
                    </div>

                    <div className="flex flex-col justify-end">
                      <label className="flex items-center space-x-2 cursor-pointer pb-2">
                        <input
                          type="checkbox"
                          checked={deletePrevMsg}
                          onChange={(e) => setDeletePrevMsg(e.target.checked)}
                          className="rounded text-stone-900 focus:ring-0"
                        />
                        <span className="text-stone-700 font-semibold text-[11px]">
                          Удалять старые сообщения в чате
                        </span>
                      </label>
                    </div>
                  </div>

                  <div className="pt-2">
                    <label className="flex items-start space-x-2.5 cursor-pointer p-3 rounded-xl border border-stone-200 bg-stone-50/70 hover:bg-stone-50 transition-colors">
                      <input
                        type="checkbox"
                        checked={showQrCode}
                        onChange={(e) => setShowQrCode(e.target.checked)}
                        className="rounded text-stone-900 focus:ring-0 h-4 w-4 mt-0.5"
                      />
                      <div>
                        <span className="text-stone-800 font-semibold text-xs block">
                          Генерировать и показывать QR-код в сообщении с подпиской
                        </span>
                        <span className="text-[11px] text-stone-500 block leading-relaxed mt-0.5">
                          Если выключено, бот выдает только готовую персональную ссылку (HAPP crypt5 или INCY) без блока QR-кода.
                        </span>
                      </div>
                    </label>
                  </div>
                </>
              )}

              <div className="pt-3 border-t border-stone-100 flex justify-end">
                <button
                  type="submit"
                  disabled={isSavingSettings}
                  className="px-5 py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-semibold text-xs shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {isSavingSettings ? 'Сохранение...' : 'Сохранить все настройки бота'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
