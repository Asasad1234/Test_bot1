import React, { useState } from 'react';
import { 
  Megaphone, 
  Send, 
  Users, 
  Image, 
  Link, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  Sparkles,
  MessageSquare,
  Clock,
  Eye
} from 'lucide-react';
import { BotUser, BroadcastPayload } from '../types';

interface BroadcastViewProps {
  users: BotUser[];
  onSendBroadcast: (payload: BroadcastPayload) => Promise<void>;
  preselectedUser?: BotUser | null;
}

export const BroadcastView: React.FC<BroadcastViewProps> = ({
  users,
  onSendBroadcast,
  preselectedUser,
}) => {
  const [target, setTarget] = useState<'all' | 'active' | 'selected'>('all');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>(
    preselectedUser ? [preselectedUser.id] : []
  );
  const [text, setText] = useState('');
  const [mediaType, setMediaType] = useState<'none' | 'photo' | 'video' | 'document'>('none');
  const [mediaUrl, setMediaUrl] = useState('');
  const [buttons, setButtons] = useState<Array<{ text: string; url?: string; callbackData?: string }>>([
    { text: '🔑 Открыть профиль подписки', callbackData: 'cmd_profile' },
  ]);
  const [isSending, setIsSending] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const handleAddButton = () => {
    setButtons([...buttons, { text: 'Кнопка действия', url: 'https://t.me/' }]);
  };

  const handleRemoveButton = (index: number) => {
    setButtons(buttons.filter((_, idx) => idx !== index));
  };

  const handleUpdateButton = (index: number, field: string, val: string) => {
    const next = [...buttons];
    next[index] = { ...next[index], [field]: val };
    setButtons(next);
  };

  const toggleSelectUser = (id: string) => {
    if (selectedUserIds.includes(id)) {
      setSelectedUserIds(selectedUserIds.filter((u) => u !== id));
    } else {
      setSelectedUserIds([...selectedUserIds, id]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;

    setIsSending(true);
    setLastResult(null);
    try {
      await onSendBroadcast({
        target,
        userIds: target === 'selected' ? selectedUserIds : undefined,
        text,
        mediaType: mediaType !== 'none' ? mediaType : undefined,
        mediaUrl: mediaUrl || undefined,
        buttons: buttons.filter((b) => b.text.trim().length > 0),
      });
      setLastResult('Рассылка успешно выполнена! Сообщения доставлены пользователям в Telegram.');
      setText('');
    } catch (err: any) {
      setLastResult(`Ошибка: ${err.message}`);
    } finally {
      setIsSending(false);
    }
  };

  const targetCount =
    target === 'all'
      ? users.length
      : target === 'active'
      ? users.filter((u) => u.status === 'active').length
      : selectedUserIds.length;

  return (
    <div id="broadcast-view" className="space-y-6">
      {/* Banner */}
      <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-xs">
        <div className="flex items-start space-x-4">
          <div className="h-12 w-12 rounded-2xl bg-sky-500 text-white flex items-center justify-center shrink-0 shadow-xs">
            <Megaphone className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-stone-900">
              Рассылка и прямые сообщения в Telegram бот
            </h2>
            <p className="text-xs text-stone-500 mt-1 max-w-3xl leading-relaxed">
              Отправляйте адресные индивидуальные сообщения конкретным подписчикам или массовые уведомления (с медиа, инлайн-кнопками и переходами) прямо через привязанного Telegram бота.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form Column */}
        <div className="lg:col-span-2 bg-white border border-stone-200 rounded-2xl p-6 shadow-xs space-y-5">
          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            {/* Target Audience */}
            <div>
              <label className="font-bold text-stone-900 block mb-1.5">
                Целевая аудитория ({targetCount} получателей):
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setTarget('all')}
                  className={`p-2.5 rounded-xl border text-center font-semibold transition-colors ${
                    target === 'all'
                      ? 'bg-stone-900 text-white border-stone-900'
                      : 'bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100'
                  }`}
                >
                  Всем подписчикам ({users.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTarget('active')}
                  className={`p-2.5 rounded-xl border text-center font-semibold transition-colors ${
                    target === 'active'
                      ? 'bg-emerald-600 text-white border-emerald-700'
                      : 'bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100'
                  }`}
                >
                  Только активным ({users.filter((u) => u.status === 'active').length})
                </button>
                <button
                  type="button"
                  onClick={() => setTarget('selected')}
                  className={`p-2.5 rounded-xl border text-center font-semibold transition-colors ${
                    target === 'selected'
                      ? 'bg-sky-600 text-white border-sky-700'
                      : 'bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100'
                  }`}
                >
                  Выбранным вручную ({selectedUserIds.length})
                </button>
              </div>
            </div>

            {/* If Selected: user checkboxes list */}
            {target === 'selected' && (
              <div className="border border-stone-200 rounded-xl p-3 bg-stone-50 max-h-48 overflow-y-auto space-y-1.5">
                <span className="text-[11px] font-bold text-stone-600 block mb-1">
                  Выберите одного или нескольких пользователей:
                </span>
                {users.map((u) => (
                  <label
                    key={u.id}
                    className="flex items-center space-x-2 p-1.5 rounded-lg hover:bg-white cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedUserIds.includes(u.id)}
                      onChange={() => toggleSelectUser(u.id)}
                      className="rounded border-stone-300 text-stone-900 focus:ring-stone-500"
                    />
                    <span className="font-semibold text-stone-900">{u.firstName}</span>
                    <span className="text-stone-400">
                      {u.username ? `@${u.username}` : `ID: ${u.telegramId}`}
                    </span>
                    <span className="text-stone-400 text-[10px]">
                      • {u.subscriptionName || 'Стандарт'}
                    </span>
                  </label>
                ))}
              </div>
            )}

            {/* Message text */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-bold text-stone-900">Текст сообщения *</label>
                <span className="text-[11px] text-stone-400">Поддерживает Markdown</span>
              </div>
              <textarea
                rows={5}
                required
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Приветствуем, {name}! Мы обновили серверы в центральном файле. Для обновления просто нажмите кнопку ниже..."
                className="w-full p-3 rounded-xl border border-stone-200 bg-stone-50 focus:bg-white text-stone-900 text-xs focus:outline-none focus:border-stone-400"
              />
            </div>

            {/* Attach media */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-stone-900 block mb-1">Тип медиа:</label>
                <select
                  value={mediaType}
                  onChange={(e) => setMediaType(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 text-xs"
                >
                  <option value="none">Без медиа (только текст)</option>
                  <option value="photo">Фотография (изображение)</option>
                  <option value="video">Видеофайл</option>
                  <option value="document">Документ / Файл</option>
                </select>
              </div>

              {mediaType !== 'none' && (
                <div>
                  <label className="font-bold text-stone-900 block mb-1">Прямой URL медиа:</label>
                  <input
                    type="url"
                    value={mediaUrl}
                    onChange={(e) => setMediaUrl(e.target.value)}
                    placeholder="https://example.com/banner.png"
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 text-xs"
                  />
                </div>
              )}
            </div>

            {/* Buttons list */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="font-bold text-stone-900">Инлайн-кнопки под сообщением:</label>
                <button
                  type="button"
                  onClick={handleAddButton}
                  className="text-stone-700 hover:text-stone-900 text-xs font-semibold flex items-center space-x-1"
                >
                  <Plus className="h-3 w-3 text-amber-500" />
                  <span>Добавить кнопку</span>
                </button>
              </div>

              <div className="space-y-2">
                {buttons.map((btn, idx) => (
                  <div key={idx} className="flex items-center space-x-2">
                    <input
                      type="text"
                      placeholder="Текст на кнопке"
                      value={btn.text}
                      onChange={(e) => handleUpdateButton(idx, 'text', e.target.value)}
                      className="flex-1 px-3 py-1.5 rounded-xl border border-stone-200 bg-stone-50 text-xs"
                    />
                    <input
                      type="text"
                      placeholder="URL ссылки или callback"
                      value={btn.url || btn.callbackData || ''}
                      onChange={(e) => handleUpdateButton(idx, 'url', e.target.value)}
                      className="flex-1 px-3 py-1.5 rounded-xl border border-stone-200 bg-stone-50 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveButton(idx)}
                      className="p-1.5 text-stone-400 hover:text-rose-600 rounded-lg hover:bg-rose-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Submit */}
            <div className="pt-3 border-t border-stone-100 flex items-center justify-between">
              {lastResult && (
                <span className="text-xs font-semibold text-emerald-700">
                  {lastResult}
                </span>
              )}
              <div className="ml-auto">
                <button
                  type="submit"
                  disabled={isSending || !text.trim()}
                  className="px-5 py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-semibold text-xs flex items-center space-x-2 shadow-xs disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5 text-amber-400" />
                  <span>{isSending ? 'Отправка...' : `Отправить в бот (${targetCount})`}</span>
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Telegram Live Preview Column */}
        <div className="bg-stone-900 text-stone-100 rounded-2xl p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center space-x-2 border-b border-stone-800 pb-3 mb-4">
              <Eye className="h-4 w-4 text-amber-400" />
              <span className="font-bold text-xs uppercase tracking-wider text-stone-300">
                Предпросмотр в Telegram
              </span>
            </div>

            {/* Bubble */}
            <div className="bg-stone-800/90 rounded-2xl p-4 border border-stone-700 space-y-3">
              {mediaType === 'photo' && mediaUrl && (
                <img
                  src={mediaUrl}
                  alt="Media preview"
                  className="rounded-xl w-full h-36 object-cover"
                />
              )}

              <p className="text-xs text-stone-200 whitespace-pre-wrap leading-relaxed">
                {text || 'Здесь будет отображаться текст вашего сообщения для пользователей бота...'}
              </p>

              {buttons.length > 0 && (
                <div className="pt-2 space-y-1.5">
                  {buttons.map((b, i) => (
                    <div
                      key={i}
                      className="w-full py-2 px-3 rounded-xl bg-stone-700/80 hover:bg-stone-700 text-center text-xs font-semibold text-sky-300 border border-stone-600"
                    >
                      {b.text || 'Кнопка'}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-stone-800 text-[11px] text-stone-400">
            Сообщение отправляется от имени активного Telegram бота прямо в чат с пользователем.
          </div>
        </div>
      </div>
    </div>
  );
};
