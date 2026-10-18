/**
 * Unified Bot Message Templates & Formatters
 * Shared between the real Telegram Bot (telegram-bot.ts) and the Web Simulator (/api/bot/simulate).
 */

export const CANONICAL_BOT_TEMPLATES = {
  welcomeMessage: 'Привет, {name}! Добро пожаловать в сервис персональных подписок.',

  channelNoticeMessage:
    '📢 **Для получения и работы подписки необходимо быть подписчиком официальных каналов проекта!**\n\n' +
    'Подпишитесь на обязательные каналы ниже и нажмите «Проверить доступ»:',

  chooseFormatMessage:
    '🎯 **Выберите формат вашей персональной подписки:**\n\n' +
    '1️⃣ 🚀 **HAPP (crypt5)** — Защищенное сквозное шифрование ключа для официального приложения HAPP (Android / Windows). Рекомендуемый формат.\n\n' +
    '2️⃣ ⚡ **INCY** — Прямая универсальная ссылка для приложений, INCY. Преимущественно устройства IOS\n\n' +
    '💡 *Подписка выдается 1 раз (персональный доступ на 1 устройство). Вы можете переключать форматы между HAPP и INCY в любой момент без потери доступа!*',

  subIssuedMessage:
    '✨ **ВАША ПЕРСОНАЛЬНАЯ ПОДПИСКА ГОТОВА!** ✨\n\n' +
    '🏷 **Формат:** {subTypeName}\n' +
    '📡 **Доступных серверов:** {totalServers}\n' +
    '👤 **Доступ:** Персональный ключ (строго 1 устройство)\n' +
    '🕒 **Время выдачи:** {time} ({tz})\n\n' +
    '🔑 **Ваш ключ доступа:**\n' +
    '`{key}`\n\n' +
    '📱 **Как подключиться:**\n' +
    '1. Нажмите на ключ выше, чтобы скопировать его в буфер.\n' +
    '2. Откройте приложение ({appGuide}).\n' +
    '3. Нажмите «Импорт из буфера обмена» и подключитесь!\n\n' +
    '⚠️ **ВАЖНОЕ ПРАВИЛО СОХРАНЕНИЯ ДОСТУПА:**\n' +
    '• Подписка активна только пока вы состоите во всех обязательных каналах проекта.\n' +
    '• Не блокируйте бота! При отписке от каналов или блокировке бота подписка мгновенно отключается, а через **{hours} ч.** полностью удаляется из системы.\n\n' +
    '💡 *Вы можете в любой момент переключить формат на {otherFormat} без потери доступа.*',

  profileMessage:
    '👤 **Личный кабинет подписчика**\n\n' +
    '🆔 **ID:** `{id}`\n' +
    '📊 **Статус подписки:** {status}\n' +
    '🏷 **Формат:** {subTypeName}\n' +
    '📱 **Привязанное устройство:** {device}\n' +
    '🕒 **Дата привязки:** {boundDate}\n' +
    '🛡 **Политика устройств:** 1 активное устройство\n\n' +
    '🔑 **Ваш ключ:**\n' +
    '`{key}`\n\n' +
    '💡 *Если вы сменили смартфон или переустановили приложение, отправьте запрос на смену устройства:*',

  instructionsMessage:
    '📋 **Инструкция по подключению:**\n\n' +
    '📱 **Для iPhone / iPad (iOS):**\n' +
    '1. Установите приложение **HAPP** или **Streisand** из App Store.\n' +
    '2. Скопируйте ваш ключ доступа в боте.\n' +
    '3. Откройте приложение, нажмите **«+»** ➔ **«Импорт из буфера»**.\n' +
    '4. Включите подключение.\n\n' +
    '🤖 **Для Android:**\n' +
    '1. Установите **v2rayNG**, **HAPP** или **NekoBox** из Google Play или GitHub.\n' +
    '2. Скопируйте ключ доступа.\n' +
    '3. В приложении нажмите **«+»** ➔ **«Импорт конфигурации из буфера»**.\n' +
    '4. Нажмите кнопку подключения.\n\n' +
    '💻 **Для Windows / macOS:**\n' +
    '1. Используйте официальный клиент **HAPP Desktop**, **v2rayN** или **Sing-box**.\n' +
    '2. Добавьте подписку и обновите конфигурации.\n\n' +
    '💡 *При возникновении вопросов вы всегда можете написать администратору!*',

  blockedUserMessage:
    '🚫 **Доступ заблокирован**\n\n' +
    '⛔ **Причина:** {reason}\n' +
    '🕒 **Время блокировки:** {date}\n' +
    '⚠️ **Количество нарушений:** {attempts}\n\n' +
    'Вы можете направить заявку на разблокировку администратору проекта:',

  unsubscribedMessage:
    '⚠️ Ваша подписка деактивирована, так как вы покинули обязательный канал {channel}. Она снова станет активной при повторной подписке на канал. Если этого не произойдет в течение {hours} часов, она будет полностью удалена.',
};

export interface TemplateVariables {
  name?: string;
  username?: string;
  id?: string | number;
  telegramId?: string | number;
  subTypeName?: string;
  format?: string;
  otherFormat?: string;
  status?: string;
  device?: string;
  boundDate?: string;
  date?: string;
  traffic?: string | number;
  key?: string;
  link?: string;
  totalServers?: string | number;
  time?: string;
  tz?: string;
  hours?: string | number;
  channel?: string;
  reason?: string;
  attempts?: string | number;
  qrNotice?: string;
  appGuide?: string;
}

/**
 * Replaces all placeholders ({name}, {key}, etc.) in a template string.
 */
export function formatBotTemplate(template: string, vars: TemplateVariables): string {
  if (!template) return '';
  let text = template;

  const isHapp = (vars.format || vars.subTypeName || '').toLowerCase().includes('happ');
  const otherFmt =
    vars.otherFormat ||
    (isHapp ? 'INCY' : 'HAPP (crypt5)');
  const appGuide = vars.appGuide || (isHapp ? 'HAPP' : 'v2rayNG / Sing-box / Streisand / Shadowrocket');

  const replacements: Record<string, string> = {
    '{name}': vars.name || 'друг',
    '{username}': vars.username
      ? vars.username.startsWith('@')
        ? vars.username
        : `@${vars.username}`
      : vars.name || 'Пользователь',
    '{id}': String(vars.id || vars.telegramId || ''),
    '{telegramId}': String(vars.telegramId || vars.id || ''),
    '{subTypeName}': vars.subTypeName || vars.format || (isHapp ? 'HAPP (crypt5)' : 'INCY'),
    '{format}': vars.format || vars.subTypeName || (isHapp ? 'HAPP (crypt5)' : 'INCY'),
    '{otherFormat}': otherFmt,
    '{appGuide}': appGuide,
    '{status}': vars.status || '🟢 Активна',
    '{device}': vars.device || '1 устройство',
    '{boundDate}': vars.boundDate || vars.date || 'Не привязано (свободный слот)',
    '{date}': vars.date || vars.boundDate || '',
    '{traffic}': String(vars.traffic ?? '0.00'),
    '{key}': vars.key || vars.link || '',
    '{link}': vars.link || vars.key || '',
    '{totalServers}': String(vars.totalServers ?? 1),
    '{time}': vars.time || '',
    '{tz}': vars.tz || 'местное время',
    '{hours}': String(vars.hours ?? 72),
    '{channel}': vars.channel || '',
    '{reason}': vars.reason || 'Нарушение правил сервиса',
    '{attempts}': String(vars.attempts ?? 0),
    '{qrNotice}': vars.qrNotice || '',
  };

  for (const [placeholder, val] of Object.entries(replacements)) {
    text = text.split(placeholder).join(val);
  }

  return text;
}

/**
 * Converts standard Markdown formatting (bold, italic, code, links)
 * to valid Telegram HTML markup without breaking HTML tags.
 */
export function markdownToTelegramHtml(text: string): string {
  if (!text) return '';
  let s = text;

  // Code blocks: ```code```
  s = s.replace(/```(?:[a-zA-Z0-9_-]+)?\n?([\s\S]*?)```/g, '<pre>$1</pre>');

  // Inline code: `code`
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold: **text** or __text__
  s = s.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
  s = s.replace(/__(.*?)__/g, '<b>$1</b>');

  // Italic: *text* or _text_
  s = s.replace(/(?:^|[\s(])\*([^*\n]+)\*(?=[)\s.,!?:;]|$)/g, (match, p1) =>
    match.replace(`*${p1}*`, `<i>${p1}</i>`)
  );
  s = s.replace(/(?:^|[\s(])_([^_\n]+)_(?=[)\s.,!?:;]|$)/g, (match, p1) =>
    match.replace(`_${p1}_`, `<i>${p1}</i>`)
  );

  // Links: [text](url)
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');

  return s;
}
