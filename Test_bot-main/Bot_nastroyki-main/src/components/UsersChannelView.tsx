import React, { useState } from 'react';
import { 
  Users, 
  ShieldCheck, 
  ShieldAlert,
  RefreshCw, 
  Plus, 
  Search, 
  ExternalLink, 
  CheckCircle2, 
  XCircle, 
  Copy, 
  Check, 
  Trash2,
  Lock,
  Unlock,
  Radio,
  Clock,
  VolumeX,
  Volume2,
  Ban,
  Server,
  AlertTriangle,
  AlertCircle,
  Send,
  Sparkles,
  Laptop,
  Unlink,
  Smartphone,
  Star,
  Crown,
  Sliders,
  SlidersHorizontal,
  Settings2,
  Shield,
  Eye,
  EyeOff,
  GitBranch,
  MessageSquare,
  CheckSquare,
  Square,
  MinusSquare,
  MoreVertical,
  CheckCircle
} from 'lucide-react';
import { BotUser, GitSourceItem, SystemStatus } from '../types';
import { 
  simulateTier, 
  terminateUserSubscription,
  syncAllChannelSubscribers,
  syncCentralToSubscribers,
  forceResyncUser,
  saveUserCustomSubscription,
  shortenUserClck,
  bulkUserAction,
  resolveSecondDeviceRemoved
} from '../services/api';

interface UsersChannelViewProps {
  users: BotUser[];
  gitSources: GitSourceItem[];
  status: SystemStatus | null;
  centralContent?: string;
  onSyncChannel: () => Promise<void>;
  onSyncAllChannelSubscribers?: () => Promise<any>;
  onSyncCentralToSubscribers?: () => Promise<any>;
  onForceResyncUser?: (id: string) => Promise<any>;
  onAddUser: (user: any) => Promise<void>;
  onDeleteUser: (id: string) => Promise<{ warning?: string } | void>;
  onMuteUser: (id: string, durationMinutes: number) => Promise<void>;
  onUnmuteUser: (id: string) => Promise<void>;
  onBlockUser: (id: string, reason?: string) => Promise<void>;
  onUnblockUser: (id: string) => Promise<void>;
  onSavePersonalNodes: (id: string, nodes: string[]) => Promise<void>;
  onSendDirectMessage: (user: BotUser) => void;
  onViewUserSub: (user: BotUser) => void;
  onUnbindUserDevice?: (id: string) => Promise<void>;
  onBindUserDevice?: (id: string, clientName?: string) => Promise<void>;
  onVerifyUserChannels?: (id: string) => Promise<any>;
  onSimulateTier?: (userId: string, tier: 1 | 2 | 3, action?: 'trigger' | 'revert') => Promise<any>;
  onTerminateUser?: (id: string) => Promise<any>;
}

export const UsersChannelView: React.FC<UsersChannelViewProps> = ({
  users,
  gitSources,
  status,
  onSyncChannel,
  onSyncAllChannelSubscribers,
  onSyncCentralToSubscribers,
  onAddUser,
  onDeleteUser,
  onMuteUser,
  onUnmuteUser,
  onBlockUser,
  onUnblockUser,
  onSavePersonalNodes,
  onSendDirectMessage,
  onViewUserSub,
  onUnbindUserDevice,
  onBindUserDevice,
  onVerifyUserChannels,
  onSimulateTier,
  onTerminateUser,
  onForceResyncUser,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'inconsistent' | 'active' | 'admins' | 'tier1' | 'tier2' | 'tier3' | 'device_locked' | 'muted' | 'blocked' | 'channel_left' | 'channel_exclusion'>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [resyncingUserId, setResyncingUserId] = useState<string | null>(null);
  const [resyncSuccessMsg, setResyncSuccessMsg] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSyncingChannelSubscribers, setIsSyncingChannelSubscribers] = useState(false);
  const [isSyncingCentralSubs, setIsSyncingCentralSubs] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [channelSyncResultAlert, setChannelSyncResultAlert] = useState<{
    type: 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [unbindTargetUser, setUnbindTargetUser] = useState<BotUser | null>(null);
  const [isUnbinding, setIsUnbinding] = useState(false);
  const [unbindSuccessMsg, setUnbindSuccessMsg] = useState<string | null>(null);

  // Verification state
  const [verifyingUserId, setVerifyingUserId] = useState<string | null>(null);
  const [verifyResultAlert, setVerifyResultAlert] = useState<{
    type: 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);

  // 3-Tier Simulation State
  const [tierTargetUser, setTierTargetUser] = useState<BotUser | null>(null);
  const [tierProcessingUserId, setTierProcessingUserId] = useState<string | null>(null);
  const [tierActionFeedback, setTierActionFeedback] = useState<string | null>(null);

  // Individual Custom Subscription Modal State (Отвязать/привязать, добавить/убавить узлы, обход блокировок)
  const [customSubUser, setCustomSubUser] = useState<BotUser | null>(null);
  const [customSubDetached, setCustomSubDetached] = useState(false);
  const [customSubBypassBlock, setCustomSubBypassBlock] = useState(false);
  const [customSubPersonalNodesText, setCustomSubPersonalNodesText] = useState('');
  const [customSubExcludedNodesText, setCustomSubExcludedNodesText] = useState('');
  const [customSubContent, setCustomSubContent] = useState('');
  const [customSubNotes, setCustomSubNotes] = useState('');
  const [isSavingCustomSub, setIsSavingCustomSub] = useState(false);
  const [isRefreshingUserClck, setIsRefreshingUserClck] = useState(false);
  const [customSubSuccessMsg, setCustomSubSuccessMsg] = useState<string | null>(null);

  // Mass user selection & context menu states
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; user: BotUser } | null>(null);

  // Bulk action modals
  const [bulkMuteModalOpen, setBulkMuteModalOpen] = useState(false);
  const [bulkMuteMinutes, setBulkMuteMinutes] = useState(60);
  const [bulkBlockModalOpen, setBulkBlockModalOpen] = useState(false);
  const [bulkBlockReason, setBulkBlockReason] = useState('Массовая блокировка администратором');
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false);
  const [bulkMessageModalOpen, setBulkMessageModalOpen] = useState(false);
  const [bulkMessageText, setBulkMessageText] = useState('');
  const [bulkButtonText, setBulkButtonText] = useState('');
  const [bulkButtonUrl, setBulkButtonUrl] = useState('');
  const [isExecutingBulkAction, setIsExecutingBulkAction] = useState(false);
  const [bulkActionFeedback, setBulkActionFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Close context menu on outside click
  React.useEffect(() => {
    const handleOutsideClick = () => setContextMenu(null);
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

  const handleToggleSelectUser = (userId: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const handleSelectAllFiltered = () => {
    if (selectedUserIds.size === filteredUsers.length && filteredUsers.length > 0) {
      setSelectedUserIds(new Set());
    } else {
      setSelectedUserIds(new Set(filteredUsers.map((u) => u.id)));
    }
  };

  const handleSelectActiveFiltered = () => {
    const active = filteredUsers.filter((u) => u.status === 'active' && !u.isBlocked).map((u) => u.id);
    setSelectedUserIds(new Set(active));
  };

  const handleSelectSubscribedFiltered = () => {
    const subbed = filteredUsers.filter((u) => u.hasActiveSubscription).map((u) => u.id);
    setSelectedUserIds(new Set(subbed));
  };

  const handleClearSelection = () => {
    setSelectedUserIds(new Set());
  };

  const handleContextMenu = (e: React.MouseEvent, user: BotUser) => {
    e.preventDefault();
    e.stopPropagation();
    // Ensure clicked user is included in selection
    if (!selectedUserIds.has(user.id)) {
      setSelectedUserIds((prev) => new Set([...prev, user.id]));
    }
    const menuWidth = 240;
    const menuHeight = 320;
    const x = Math.min(e.clientX, window.innerWidth - menuWidth - 10);
    const y = Math.min(e.clientY, window.innerHeight - menuHeight - 10);
    setContextMenu({ x, y, user });
  };

  const executeBulkAction = async (action: 'mute' | 'unmute' | 'block' | 'unblock' | 'delete' | 'send_message', extra?: any) => {
    const ids: string[] = Array.from(selectedUserIds) as string[];
    if (ids.length === 0) return;
    setIsExecutingBulkAction(true);
    setBulkActionFeedback(null);
    try {
      const res = await bulkUserAction({
        action,
        userIds: ids,
        durationMinutes: extra?.durationMinutes,
        reason: extra?.reason,
        message: extra?.message,
        buttonText: extra?.buttonText,
        buttonUrl: extra?.buttonUrl,
      });
      setBulkActionFeedback({
        type: 'success',
        text: res.message || `Действие успешно применено к ${res.affectedCount} пользователям!`,
      });
      await onSyncChannel();
      if (action === 'delete') {
        setSelectedUserIds(new Set());
      }
      setTimeout(() => setBulkActionFeedback(null), 5000);
    } catch (err: any) {
      setBulkActionFeedback({
        type: 'error',
        text: err.message || 'Ошибка выполнения действия',
      });
    } finally {
      setIsExecutingBulkAction(false);
      setBulkMuteModalOpen(false);
      setBulkBlockModalOpen(false);
      setBulkDeleteModalOpen(false);
      setBulkMessageModalOpen(false);
    }
  };

  const openCustomSubModal = (user: BotUser) => {
    setCustomSubUser(user);
    setCustomSubDetached(Boolean(user.detachedFromCentral));
    setCustomSubBypassBlock(Boolean(user.bypassBlock));
    setCustomSubPersonalNodesText((user.personalNodes || []).join('\n'));
    setCustomSubExcludedNodesText((user.excludedNodes || []).join('\n'));
    setCustomSubContent(user.customSubscriptionContent || '');
    setCustomSubNotes(user.customNotes || '');
    setCustomSubSuccessMsg(null);
  };

  const handleSaveCustomSub = async () => {
    if (!customSubUser) return;
    setIsSavingCustomSub(true);
    setCustomSubSuccessMsg(null);
    try {
      const personalNodes = customSubPersonalNodesText
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith('#'));
      const excludedNodes = customSubExcludedNodesText
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      const res = await saveUserCustomSubscription(customSubUser.id, {
        detachedFromCentral: customSubDetached,
        bypassBlock: customSubBypassBlock,
        personalNodes,
        excludedNodes,
        customSubscriptionContent: customSubContent,
        customNotes: customSubNotes,
        resyncGitVerse: true,
      });

      setCustomSubSuccessMsg(res.message || 'Индивидуальные настройки подписки успешно применены в GitVerse!');
      await onSyncChannel();
      if (res.user) {
        setCustomSubUser(res.user);
      }
      setTimeout(() => setCustomSubSuccessMsg(null), 4000);
    } catch (err: any) {
      alert(err.message || 'Ошибка сохранения индивидуальных настроек');
    } finally {
      setIsSavingCustomSub(false);
    }
  };

  const handleRefreshUserClck = async () => {
    if (!customSubUser) return;
    setIsRefreshingUserClck(true);
    try {
      const res = await shortenUserClck(customSubUser.id);
      if (res.user) {
        setCustomSubUser(res.user);
      }
      await onSyncChannel();
      setCustomSubSuccessMsg('Ссылка clck.ru успешно сгенерирована и обновлена!');
      setTimeout(() => setCustomSubSuccessMsg(null), 3000);
    } catch (err: any) {
      alert(err.message || 'Ошибка генерации clck.ru');
    } finally {
      setIsRefreshingUserClck(false);
    }
  };

  const handleSimulateTierAction = async (userId: string, tier: 1 | 2 | 3, action?: 'trigger' | 'revert') => {
    setTierProcessingUserId(userId);
    try {
      if (onSimulateTier) {
        await onSimulateTier(userId, tier, action);
      } else {
        const res = await simulateTier(userId, tier, action);
        setTierActionFeedback(res.message);
        await onSyncChannel();
      }
      setTimeout(() => setTierActionFeedback(null), 6000);
    } catch (e: any) {
      alert(e.message || 'Ошибка симуляции уровня');
    } finally {
      setTierProcessingUserId(null);
    }
  };

  const handleTerminateUserAction = async (userId: string, username: string) => {
    if (!confirm(`Вы действительно хотите полностью аннулировать подписку для ${username}? Доступ к серверным узлам будет удален.`)) {
      return;
    }
    setTierProcessingUserId(userId);
    try {
      if (onTerminateUser) {
        await onTerminateUser(userId);
      } else {
        const res = await terminateUserSubscription(userId);
        setTierActionFeedback(res.message);
        await onSyncChannel();
      }
      setTimeout(() => setTierActionFeedback(null), 6000);
    } catch (e: any) {
      alert(e.message || 'Ошибка аннулирования');
    } finally {
      setTierProcessingUserId(null);
    }
  };

  const handleVerifyChannels = async (u: BotUser) => {
    if (!onVerifyUserChannels) return;
    setVerifyingUserId(u.id);
    setVerifyResultAlert(null);
    try {
      const res = await onVerifyUserChannels(u.id);
      if (res.allSubscribed) {
        setVerifyResultAlert({
          type: 'success',
          text: `✅ Пользователь ${u.firstName || u.telegramId} подтвержден во всех обязательных каналах! Доступ и узлы активны.`,
        });
      } else {
        const missing = (res.missingChannels || []).map((c: any) => c.title || c.id).join(', ');
        let note = `❌ Пользователь ${u.firstName || u.telegramId} не подписан на: ${missing || 'обязательные каналы'}.`;
        if (res.botNeedsAdminIn && res.botNeedsAdminIn.length > 0) {
          const adminCh = res.botNeedsAdminIn.map((c: any) => c.title || c.id).join(', ');
          note += `\n⚠️ Внимание: Бот не имеет прав администратора в ${adminCh}, поэтому Telegram API не выдает список участников. Назначьте бота администратором канала.`;
        }
        setVerifyResultAlert({
          type: 'warning',
          text: note,
        });
      }
      setTimeout(() => setVerifyResultAlert(null), 8000);
    } catch (err: any) {
      setVerifyResultAlert({
        type: 'error',
        text: `Ошибка валидации: ${err.message}`,
      });
      setTimeout(() => setVerifyResultAlert(null), 8000);
    } finally {
      setVerifyingUserId(null);
    }
  };

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [muteTargetUser, setMuteTargetUser] = useState<BotUser | null>(null);
  const [muteDuration, setMuteDuration] = useState<number>(60);
  const [blockTargetUser, setBlockTargetUser] = useState<BotUser | null>(null);
  const [blockReason, setBlockReason] = useState('Подозрение на подозрительные действия или мультиаккаунт');
  const [personalNodesTargetUser, setPersonalNodesTargetUser] = useState<BotUser | null>(null);
  const [personalNodesText, setPersonalNodesText] = useState('');

  // Add User Form State
  const [newUserId, setNewUserId] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserFirst, setNewUserFirst] = useState('');
  const [newUserMembership, setNewUserMembership] = useState('member');
  const [newUserSubName, setNewUserSubName] = useState('HAPP (crypt4) - VLESS VIP');
  const [newUserSubType, setNewUserSubType] = useState('happ');

  const activeBot = status?.bots?.activeBot;
  const channel = activeBot?.channels?.[0];
  const selfDeleteHours = activeBot?.selfDeleteHours || 72;

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await onSyncChannel();
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSyncChannelSubscribers = async () => {
    setIsSyncingChannelSubscribers(true);
    setChannelSyncResultAlert(null);
    try {
      let res: any;
      if (onSyncAllChannelSubscribers) {
        res = await onSyncAllChannelSubscribers();
      } else {
        res = await syncAllChannelSubscribers();
      }
      setChannelSyncResultAlert({
        type: 'success',
        text: res.message || 'Синхронизация подписчиков канала успешно завершена! Все участники учтены в системе.',
      });
      await onSyncChannel();
      setTimeout(() => setChannelSyncResultAlert(null), 8000);
    } catch (err: any) {
      setChannelSyncResultAlert({
        type: 'error',
        text: `Ошибка синхронизации участников канала: ${err.message}`,
      });
    } finally {
      setIsSyncingChannelSubscribers(false);
    }
  };

  const handleSyncCentralSubsDirectly = async () => {
    setIsSyncingCentralSubs(true);
    setChannelSyncResultAlert(null);
    try {
      let res: any;
      if (onSyncCentralToSubscribers) {
        res = await onSyncCentralToSubscribers();
      } else {
        res = await syncCentralToSubscribers();
      }
      setChannelSyncResultAlert({
        type: 'success',
        text: res.message || 'Центральная подписка перенесена во все персональные файлы активных подписчиков!',
      });
      await onSyncChannel();
      setTimeout(() => setChannelSyncResultAlert(null), 8000);
    } catch (err: any) {
      setChannelSyncResultAlert({
        type: 'error',
        text: `Ошибка переноса узлов из центрального источника: ${err.message}`,
      });
    } finally {
      setIsSyncingCentralSubs(false);
    }
  };

  const handleCopyLink = (u: BotUser, e: React.MouseEvent) => {
    e.stopPropagation();
    const url = u.subscriptionType === 'incy'
      ? [u.clckUrl, u.finalSubscriptionUrl].find((candidate) =>
          /^https:\/\/clck\.ru\/[A-Za-z0-9_-]+$/i.test(candidate || '')
        )
      : [u.finalSubscriptionUrl, u.clckUrl].find((candidate) =>
          /^happ:\/\/crypt[345]\//i.test(candidate || '')
        );
    if (!url) {
      setChannelSyncResultAlert({
        type: 'error',
        text: u.subscriptionType === 'incy'
          ? 'Короткая ссылка INCY clck.ru еще не создана. Синхронизируйте ссылку и попробуйте снова.'
          : 'Для пользователя пока не сформирована ссылка HAPP.',
      });
      return;
    }
    navigator.clipboard.writeText(url);
    setCopiedId(u.subscriptionToken);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserId) return;
    await onAddUser({
      telegramId: Number(newUserId),
      username: newUserName.replace('@', ''),
      firstName: newUserFirst || 'Пользователь',
      channelMembership: newUserMembership,
      subscriptionName: newUserSubName,
      subscriptionType: newUserSubType,
    });
    setShowAddModal(false);
    setNewUserId('');
    setNewUserName('');
    setNewUserFirst('');
  };

  const handleMuteSubmit = async () => {
    if (!muteTargetUser) return;
    await onMuteUser(muteTargetUser.id, muteDuration);
    setMuteTargetUser(null);
  };

  const handleBlockSubmit = async () => {
    if (!blockTargetUser) return;
    await onBlockUser(blockTargetUser.id, blockReason);
    setBlockTargetUser(null);
  };

  const handleSaveNodesSubmit = async () => {
    if (!personalNodesTargetUser) return;
    const nodes = personalNodesText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    await onSavePersonalNodes(personalNodesTargetUser.id, nodes);
    setPersonalNodesTargetUser(null);
  };

  const handleUnbindSubmit = async () => {
    if (!unbindTargetUser || !onUnbindUserDevice) return;
    setIsUnbinding(true);
    try {
      await onUnbindUserDevice(unbindTargetUser.id, true);
      setUnbindSuccessMsg(`Подписка пользователя @${unbindTargetUser.username || unbindTargetUser.telegramId} успешно отвязана от устройства! Лимит подписки сброшен. Теперь он может повторно запросить или подключить подписку.`);
      setUnbindTargetUser(null);
      setTimeout(() => setUnbindSuccessMsg(null), 5000);
    } catch (err: any) {
      alert(err.message || 'Ошибка отвязки устройства');
    } finally {
      setIsUnbinding(false);
    }
  };

  const checkUserInconsistent = (u: BotUser): { isInconsistent: boolean; reason?: string } => {
    if (u.isInconsistent) {
      return { isInconsistent: true, reason: u.inconsistencyReason || 'Отклонение конфигурации от центрального источника' };
    }
    const centralNodes = status?.centralFile?.nodesCount ?? 0;
    const isRestricted = u.isBlocked || u.status === 'blocked' || u.status === 'muted' || u.channelMembership === 'left' || u.status === 'channel_inactive' || u.status === 'bot_blocked' || u.status === 'unsubscribed';
    if (!isRestricted && centralNodes > 0 && !u.gitFilePath) {
      return { isInconsistent: true, reason: 'Отсутствует привязанный файл в Git-репозитории' };
    }
    if (u.syncHealthStatus === 'yellow') {
      return { isInconsistent: true, reason: u.inconsistencyReason || 'Несовпадение параметров с центральным источником' };
    }
    return { isInconsistent: false };
  };

  const handleDeleteUser = async (user: BotUser) => {
    setDeletingUserId(user.id);
    try {
      const result = await onDeleteUser(user.id);
      if (result?.warning) {
        alert(result.warning);
      }
    } catch (err: any) {
      alert(err.message || `Не удалось удалить подписку пользователя ${user.telegramId}`);
    } finally {
      setDeletingUserId(null);
    }
  };

  const handleForceResync = async (user: BotUser) => {
    setResyncingUserId(user.id);
    try {
      let res: any;
      if (onForceResyncUser) {
        res = await onForceResyncUser(user.id);
      } else {
        res = await forceResyncUser(user.id);
      }
      setResyncSuccessMsg(res.message || `Подписка @${user.username || user.telegramId} успешно принудительно согласована с источником!`);
      await onSyncChannel();
      setTimeout(() => setResyncSuccessMsg(null), 5000);
    } catch (err: any) {
      alert(err.message || 'Ошибка принудительной синхронизации');
    } finally {
      setResyncingUserId(null);
    }
  };

  const inconsistentUsersCount = users.filter((u) => checkUserInconsistent(u).isInconsistent).length;
  const subscriptionSources = gitSources.filter((source) => ['moshub', 'sourcecraft', 'gitverse', 'gitflic'].includes(source.provider));
  const getUserSourceId = (user: BotUser) => user.subscriptionSourceId || user.sourceSubscriptions?.[user.sourceSubscriptions.length - 1]?.sourceId;
  const getSourceClasses = (source: GitSourceItem, selected: boolean) => {
    const colors: Record<string, { active: string; idle: string }> = {
      sourcecraft: { active: 'bg-orange-600 text-white', idle: 'bg-orange-50 text-orange-800 border border-orange-200 hover:bg-orange-100' },
      gitflic: { active: 'bg-blue-600 text-white', idle: 'bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100' },
      gitverse: { active: 'bg-stone-800 text-white', idle: 'bg-stone-100 text-stone-800 border border-stone-300 hover:bg-stone-200' },
      moshub: { active: 'bg-violet-600 text-white', idle: 'bg-violet-50 text-violet-800 border border-violet-200 hover:bg-violet-100' },
    };
    const color = colors[source.provider];
    return selected ? color.active : color.idle;
  };

  const isChannelAdminUser = (user: BotUser) =>
    Boolean(user.isAdmin || ['creator', 'administrator'].includes(user.channelMembership));
  const isChannelLeftUser = (user: BotUser) =>
    !isChannelAdminUser(user) && (user.channelMembership === 'left' || user.status === 'channel_inactive');

  const filteredUsers = users.filter((u) => {
    const sourceMatches = sourceFilter === 'all' ||
      u.sourceSubscriptions?.some((subscription) => subscription.sourceId === sourceFilter) ||
      getUserSourceId(u) === sourceFilter;
    if (!sourceMatches) return false;
    const matchesSearch =
      (u.username?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (u.firstName?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (u.subscriptionName?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      u.telegramId.toString().includes(searchTerm);

    if (filterTab === 'inconsistent') return matchesSearch && checkUserInconsistent(u).isInconsistent;
    if (filterTab === 'active') return matchesSearch && u.status === 'active' && !u.isBlocked;
    if (filterTab === 'admins') return matchesSearch && (u.isAdmin || ['creator', 'administrator'].includes(u.channelMembership));
    if (filterTab === 'tier1') return matchesSearch && (isChannelLeftUser(u) || u.status === 'bot_blocked' || (u.status === 'unsubscribed' && !isChannelAdminUser(u)));
    if (filterTab === 'tier2') return matchesSearch && ((u.status === 'muted' || (u.mutedUntil && new Date(u.mutedUntil) > new Date())) && !u.isBlocked);
    if (filterTab === 'tier3') return matchesSearch && (u.isBlocked || u.status === 'blocked' || (u.deviceViolationAttempts && u.deviceViolationAttempts >= 3));
    if (filterTab === 'device_locked') return matchesSearch && (u.deviceLocked || !!u.boundDevice);
    if (filterTab === 'muted') return matchesSearch && u.status === 'muted';
    if (filterTab === 'blocked') return matchesSearch && (u.status === 'blocked' || u.isBlocked);
    if (filterTab === 'channel_left') return matchesSearch && isChannelLeftUser(u);
    if (filterTab === 'channel_exclusion') return matchesSearch && Boolean(u.isChannelExclusion);
    return matchesSearch;
  });

  return (
    <div id="users-channel-view" className="space-y-6">
      {/* Top Channel Administration & Subscriber Policy Summary */}
      <div id="channel-overview-card" className="bg-white border border-stone-200 rounded-2xl p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-start space-x-4">
            <div className="h-12 w-12 rounded-2xl bg-stone-900 text-amber-400 flex items-center justify-center shrink-0 shadow-xs">
              <Radio className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2.5">
                <h2 className="text-xl font-bold text-stone-900">
                  {channel?.title || 'Канал доступа Пульс'}
                </h2>
                <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {channel?.id || '@puls_channel'}
                </span>
                <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Бот: Администратор канала
                </span>
              </div>
              <p className="text-xs text-stone-500 mt-1">
                Система ведет учет абсолютно всех подписчиков канала и базы бота. При изменении центрального файла узлы переносятся по всем активным подпискам (кроме замученных, забаненных и отписавшихся).
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              id="btn-sync-all-channel-subscribers"
              onClick={handleSyncChannelSubscribers}
              disabled={isSyncingChannelSubscribers}
              className="inline-flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
              title="Опросить абсолютно всех участников и администраторов Telegram канала через Bot API"
            >
              <Users className={`h-3.5 w-3.5 ${isSyncingChannelSubscribers ? 'animate-spin' : ''}`} />
              <span>{isSyncingChannelSubscribers ? 'Загрузка участников...' : 'Синхронизировать подписчиков с канала'}</span>
            </button>

            <button
              id="btn-sync-central-to-subs"
              onClick={handleSyncCentralSubsDirectly}
              disabled={isSyncingCentralSubs}
              className="inline-flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
              title="Перенести текущую центральную конфигурацию по всем активным файлам подписок пользователей"
            >
              <Sparkles className={`h-3.5 w-3.5 ${isSyncingCentralSubs ? 'animate-spin text-amber-300' : ''}`} />
              <span>{isSyncingCentralSubs ? 'Перенос узлов...' : 'Синхронизировать из центрального'}</span>
            </button>

            <button
              id="btn-sync-channel"
              onClick={handleSync}
              disabled={isSyncing}
              className="inline-flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-amber-400 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Синхронизация...' : 'Обновить'}</span>
            </button>
          </div>
        </div>

        {/* Sync Alert if any */}
        {channelSyncResultAlert && (
          <div
            id="channel-sync-result-alert"
            className={`mt-4 p-3 rounded-xl flex items-center space-x-2 text-xs font-medium border ${
              channelSyncResultAlert.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            {channelSyncResultAlert.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            )}
            <span className="whitespace-pre-line">{channelSyncResultAlert.text}</span>
          </div>
        )}

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-5 pt-4 border-t border-stone-100 text-xs">
          <div className="p-3 rounded-xl bg-indigo-50/50 border border-indigo-200/60">
            <span className="text-indigo-700 block text-[11px] font-medium">В Telegram канале</span>
            <span className="text-indigo-950 font-bold text-base mt-0.5 block">
              {channel?.memberCount ?? users.length} участников
            </span>
          </div>

          <div className="p-3 rounded-xl bg-stone-50 border border-stone-200/60">
            <span className="text-stone-500 block text-[11px] font-medium">В базе бота</span>
            <span className="text-stone-900 font-bold text-base mt-0.5 block">{users.length}</span>
          </div>

          <div className="p-3 rounded-xl bg-emerald-50/50 border border-emerald-200/60">
            <span className="text-emerald-700 block text-[11px] font-medium">Активных подписок</span>
            <span className="text-emerald-900 font-bold text-base mt-0.5 block">
              {users.filter((u) => u.status === 'active' && !u.isBlocked).length}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-amber-50/50 border border-amber-200/60">
            <span className="text-amber-700 block text-[11px] font-medium">Админы / Создатели</span>
            <span className="text-amber-900 font-bold text-base mt-0.5 block">
              {users.filter((u) => u.isAdmin || ['creator', 'administrator'].includes(u.channelMembership)).length}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-rose-50/50 border border-rose-200/60 col-span-2 sm:col-span-1">
            <span className="text-rose-700 block text-[11px] font-medium">Заглушены / Бан</span>
            <span className="text-rose-900 font-bold text-base mt-0.5 block">
              {users.filter((u) => u.status === 'muted' || u.status === 'blocked' || u.isBlocked).length}
            </span>
          </div>
        </div>
      </div>

      {/* Users Management Table Card */}
      <div className="bg-white border border-stone-200 rounded-2xl shadow-xs overflow-hidden">
        {/* Table Top Controls & Filter Tabs */}
        <div className="p-5 border-b border-stone-200 space-y-3">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setSourceFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${
                sourceFilter === 'all' ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              Все источники ({users.length})
            </button>
            {subscriptionSources.map((source) => {
              const count = users.filter((user) =>
                user.sourceSubscriptions?.some((subscription) => subscription.sourceId === source.id) ||
                getUserSourceId(user) === source.id
              ).length;
              return (
                <button
                  key={source.id}
                  onClick={() => setSourceFilter(source.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${getSourceClasses(source, sourceFilter === source.id)}`}
                >
                  {source.name} ({count})
                </button>
              );
            })}
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center space-x-2 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setFilterTab('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                filterTab === 'all' ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              Все ({users.length})
            </button>
            <button
              id="filter-tab-inconsistent"
              onClick={() => setFilterTab('inconsistent')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center space-x-1.5 whitespace-nowrap ${
                filterTab === 'inconsistent'
                  ? 'bg-amber-500 text-stone-950 font-bold'
                  : inconsistentUsersCount > 0
                  ? 'bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              <AlertTriangle className="h-3 w-3 text-amber-600" />
              <span>Отклонения ({inconsistentUsersCount})</span>
            </button>
            <button
              onClick={() => setFilterTab('active')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                filterTab === 'active' ? 'bg-emerald-600 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              Активные ({users.filter((u) => u.status === 'active' && !u.isBlocked).length})
            </button>
            <button
              onClick={() => setFilterTab('admins')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center space-x-1 whitespace-nowrap ${
                filterTab === 'admins' ? 'bg-amber-600 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              <Star className="h-3 w-3" />
              <span>Админы ({users.filter((u) => u.isAdmin || ['creator', 'administrator'].includes(u.channelMembership)).length})</span>
            </button>
            <button
              onClick={() => setFilterTab('tier1')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center space-x-1 whitespace-nowrap ${
                filterTab === 'tier1' ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              <span>Уровень 1: Отписка ({users.filter(u => isChannelLeftUser(u) || u.status === 'bot_blocked' || (u.status === 'unsubscribed' && !isChannelAdminUser(u))).length})</span>
            </button>
            <button
              onClick={() => setFilterTab('tier2')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center space-x-1 whitespace-nowrap ${
                filterTab === 'tier2' ? 'bg-amber-600 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              <span>Уровень 2: 2-е устр. ({users.filter(u => (u.status === 'muted' || (u.mutedUntil && new Date(u.mutedUntil) > new Date())) && !u.isBlocked).length})</span>
            </button>
            <button
              onClick={() => setFilterTab('tier3')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center space-x-1 whitespace-nowrap ${
                filterTab === 'tier3' ? 'bg-rose-600 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              <span>Уровень 3: Бан ({users.filter(u => u.isBlocked || u.status === 'blocked' || (u.deviceViolationAttempts && u.deviceViolationAttempts >= 3)).length})</span>
            </button>
            <button
              onClick={() => setFilterTab('muted')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                filterTab === 'muted' ? 'bg-amber-600 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              На паузе (Muted)
            </button>
            <button
              onClick={() => setFilterTab('blocked')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                filterTab === 'blocked' ? 'bg-rose-600 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              Заблокированные
            </button>
            <button
              onClick={() => setFilterTab('device_locked')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center space-x-1 ${
                filterTab === 'device_locked' ? 'bg-indigo-600 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              <Laptop className="h-3 w-3" />
              <span>Привязаны к устр. ({users.filter(u => u.deviceLocked || !!u.boundDevice).length})</span>
            </button>
            <button
              onClick={() => setFilterTab('channel_left')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                filterTab === 'channel_left' ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              Покинули канал ({selfDeleteHours}ч таймер)
            </button>
            <button
              id="filter-tab-channel-exclusion"
              onClick={() => setFilterTab('channel_exclusion')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center space-x-1 whitespace-nowrap ${
                filterTab === 'channel_exclusion' ? 'bg-amber-600 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              <Sparkles className="h-3 w-3 text-amber-400" />
              <span>Исключения (1 устр.) ({users.filter(u => u.isChannelExclusion).length})</span>
            </button>
          </div>

          <div className="flex items-center space-x-2.5">
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Поиск по нику, ID, подписке..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-xl border border-stone-200 bg-stone-50 focus:bg-white text-xs text-stone-900 focus:outline-none focus:border-stone-400 w-56"
              />
            </div>
            <button
              id="btn-add-user-modal"
              onClick={() => setShowAddModal(true)}
              className="px-3.5 py-1.5 rounded-xl bg-stone-900 text-white hover:bg-stone-800 text-xs font-semibold flex items-center space-x-1 shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Добавить</span>
            </button>
          </div>
          </div>
        </div>

        {/* 3-Tier Action Feedback Notification */}
        {tierActionFeedback && (
          <div className="mx-5 my-3 p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-xs flex items-center justify-between shadow-xs">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span className="font-semibold">{tierActionFeedback}</span>
            </div>
            <button onClick={() => setTierActionFeedback(null)} className="text-emerald-700 font-bold cursor-pointer">✕</button>
          </div>
        )}

        {/* Unbind notification banner */}
        {unbindSuccessMsg && (
          <div className="mx-5 my-3 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>{unbindSuccessMsg}</span>
            </div>
            <button onClick={() => setUnbindSuccessMsg(null)} className="text-emerald-700 hover:text-emerald-900 font-bold ml-2">✕</button>
          </div>
        )}

        {/* Force Re-sync Success Notification Banner */}
        {resyncSuccessMsg && (
          <div className="mx-5 my-3 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span className="font-semibold">{resyncSuccessMsg}</span>
            </div>
            <button onClick={() => setResyncSuccessMsg(null)} className="text-emerald-700 hover:text-emerald-900 font-bold ml-2">✕</button>
          </div>
        )}

        {/* Live Channel Verification Banner */}
        {verifyResultAlert && (
          <div
            className={`mx-5 my-3 p-3.5 rounded-xl border text-xs flex items-start justify-between whitespace-pre-line ${
              verifyResultAlert.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : verifyResultAlert.type === 'warning'
                ? 'bg-amber-50 border-amber-300 text-amber-900'
                : 'bg-rose-50 border-rose-300 text-rose-900'
            }`}
          >
            <div className="flex items-start space-x-2">
              {verifyResultAlert.type === 'success' && <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />}
              {verifyResultAlert.type === 'warning' && <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />}
              {verifyResultAlert.type === 'error' && <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />}
              <span>{verifyResultAlert.text}</span>
            </div>
            <button
              onClick={() => setVerifyResultAlert(null)}
              className="text-stone-500 hover:text-stone-800 font-bold ml-3"
            >
              ✕
            </button>
          </div>
        )}

        {/* Floating Bulk Action Bar */}
        {selectedUserIds.size > 0 && (
          <div className="sticky top-2 z-30 mb-3 bg-stone-900 text-white p-3 rounded-2xl shadow-lg border border-stone-800 flex flex-wrap items-center justify-between gap-3 animate-in fade-in duration-200">
            <div className="flex items-center space-x-3">
              <div className="h-8 w-8 rounded-xl bg-purple-600 flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                {selectedUserIds.size}
              </div>
              <div>
                <div className="font-bold text-xs flex items-center space-x-1.5">
                  <span>Выбрано: <strong>{selectedUserIds.size}</strong> из {filteredUsers.length}</span>
                </div>
                <div className="flex items-center space-x-2 text-[10px] text-stone-400">
                  <button
                    type="button"
                    onClick={handleSelectAllFiltered}
                    className="hover:text-purple-300 underline cursor-pointer"
                  >
                    Все ({filteredUsers.length})
                  </button>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={handleSelectActiveFiltered}
                    className="hover:text-purple-300 underline cursor-pointer"
                  >
                    Только активные
                  </button>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={handleSelectSubscribedFiltered}
                    className="hover:text-purple-300 underline cursor-pointer"
                  >
                    С подпиской
                  </button>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={handleClearSelection}
                    className="hover:text-rose-300 underline cursor-pointer text-stone-400"
                  >
                    Снять выбор
                  </button>
                </div>
              </div>
            </div>

            {/* Bulk Action Buttons */}
            <div className="flex items-center space-x-1.5 flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setBulkMessageModalOpen(true)}
                className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs flex items-center space-x-1.5 cursor-pointer shadow-xs transition-colors"
                title="Отправить персональные сообщения в бот выбранным пользователям"
              >
                <Send className="h-3.5 w-3.5" />
                <span>Сообщение в бот</span>
              </button>

              <button
                type="button"
                onClick={() => setBulkMuteModalOpen(true)}
                className="px-2.5 py-1.5 rounded-xl bg-stone-800 hover:bg-amber-900/60 text-amber-300 font-semibold text-xs flex items-center space-x-1 cursor-pointer border border-stone-700 transition-colors"
                title="Заглушить выбранных (обрыв сети на время)"
              >
                <VolumeX className="h-3.5 w-3.5" />
                <span>Мут</span>
              </button>

              <button
                type="button"
                onClick={() => executeBulkAction('unmute')}
                disabled={isExecutingBulkAction}
                className="px-2.5 py-1.5 rounded-xl bg-stone-800 hover:bg-emerald-900/60 text-emerald-300 font-semibold text-xs flex items-center space-x-1 cursor-pointer border border-stone-700 transition-colors disabled:opacity-50"
                title="Снять заглушку (восстановить сеть)"
              >
                <Volume2 className="h-3.5 w-3.5" />
                <span>Размут</span>
              </button>

              <button
                type="button"
                onClick={() => setBulkBlockModalOpen(true)}
                className="px-2.5 py-1.5 rounded-xl bg-stone-800 hover:bg-rose-900/60 text-rose-300 font-semibold text-xs flex items-center space-x-1 cursor-pointer border border-stone-700 transition-colors"
                title="Заблокировать выбранных пользователей"
              >
                <Ban className="h-3.5 w-3.5" />
                <span>Бан</span>
              </button>

              <button
                type="button"
                onClick={() => executeBulkAction('unblock')}
                disabled={isExecutingBulkAction}
                className="px-2.5 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 font-semibold text-xs flex items-center space-x-1 cursor-pointer border border-stone-700 transition-colors disabled:opacity-50"
                title="Разблокировать пользователей"
              >
                <Unlock className="h-3.5 w-3.5" />
                <span>Разбан</span>
              </button>

              <button
                type="button"
                onClick={() => setBulkDeleteModalOpen(true)}
                className="px-2.5 py-1.5 rounded-xl bg-rose-600/90 hover:bg-rose-600 text-white font-semibold text-xs flex items-center space-x-1 cursor-pointer shadow-xs transition-colors"
                title="Удалить выбранных пользователей"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Удалить</span>
              </button>
            </div>
          </div>
        )}

        {/* Global Action Feedback Alert */}
        {bulkActionFeedback && (
          <div className={`mb-3 p-3 rounded-xl border flex items-center space-x-2 text-xs font-semibold ${
            bulkActionFeedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}>
            {bulkActionFeedback.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            )}
            <span>{bulkActionFeedback.text}</span>
          </div>
        )}

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-stone-700">
            <thead className="bg-stone-50 text-stone-500 font-semibold border-b border-stone-200">
              <tr>
                <th className="px-3 py-3 w-10 text-center">
                  <input
                    type="checkbox"
                    aria-label="Выбрать всех на странице"
                    checked={filteredUsers.length > 0 && selectedUserIds.size === filteredUsers.length}
                    ref={(el) => {
                      if (el) {
                        el.indeterminate = selectedUserIds.size > 0 && selectedUserIds.size < filteredUsers.length;
                      }
                    }}
                    onChange={handleSelectAllFiltered}
                    className="h-4 w-4 rounded border-stone-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                  />
                </th>
                <th className="px-5 py-3">Пользователь</th>
                <th className="px-5 py-3">Полученная подписка</th>
                <th className="px-5 py-3">Привязка (1 устройство)</th>
                <th className="px-5 py-3">Дата и время выдачи</th>
                <th className="px-5 py-3">Статус сети</th>
                <th className="px-5 py-3">Канал</th>
                <th className="px-5 py-3">Трафик / Персональные узлы</th>
                <th className="px-5 py-3 text-right">Управление</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredUsers.map((u) => {
                const isMuted = u.status === 'muted';
                const isBlocked = u.status === 'blocked' || u.isBlocked;
                const isLeft = isChannelLeftUser(u);
                const isBotBlocked = u.status === 'bot_blocked';
                const isSuspended = isLeft || isBotBlocked || (u.status === 'unsubscribed' && !isChannelAdminUser(u));
                const receivedText = u.receivedAt ? new Date(u.receivedAt).toLocaleString('ru-RU') : 'Ещё не получена';
                const isSelected = selectedUserIds.has(u.id);
                const userSource = subscriptionSources.find((source) => source.id === getUserSourceId(u));

                return (
                  <tr
                    key={u.id}
                    id={`user-row-${u.id}`}
                    onContextMenu={(e) => handleContextMenu(e, u)}
                    className={`transition-colors select-none ${
                      isSelected
                        ? 'bg-purple-50/70 hover:bg-purple-100/60'
                        : isSuspended
                        ? 'bg-rose-50/70 border-l-4 border-rose-500 hover:bg-rose-100/50'
                        : 'hover:bg-stone-50/80'
                    }`}
                  >
                    {/* Checkbox column */}
                    <td className="px-3 py-3.5 text-center">
                      <input
                        type="checkbox"
                        aria-label={`Выбрать ${u.firstName}`}
                        checked={isSelected}
                        onChange={() => handleToggleSelectUser(u.id)}
                        className="h-4 w-4 rounded border-stone-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                      />
                    </td>

                    {/* User info */}
                    <td className="px-5 py-3.5">
                      <div className="font-bold text-stone-900 flex items-center space-x-1.5 flex-wrap gap-1">
                        <span>{u.firstName} {u.lastName || ''}</span>
                        {(u.isAdmin || ['creator', 'administrator'].includes(u.channelMembership)) && (
                          <span className="px-1.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 rounded font-bold text-[10px] flex items-center space-x-0.5">
                            <Star className="h-2.5 w-2.5 text-amber-600" />
                            <span>{u.channelMembership === 'creator' ? 'Владелец канала' : 'Администратор'}</span>
                          </span>
                        )}
                        {isSuspended && (
                          <span className="px-1.5 py-0.5 bg-rose-100 text-rose-800 rounded font-bold text-[10px]">
                            Отключена
                          </span>
                        )}
                        {u.isChannelExclusion && (
                          <span className="px-1.5 py-0.5 bg-amber-50 text-amber-900 border border-amber-300 rounded font-bold text-[10px] flex items-center space-x-0.5">
                            <Sparkles className="h-2.5 w-2.5 text-amber-600" />
                            <span>Исключение: 1 устр.</span>
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-stone-400">
                        {u.username ? `@${u.username}` : `ID: ${u.telegramId}`}
                        {userSource && (
                          <span className={`ml-2 inline-block rounded px-1.5 py-0.5 font-semibold ${getSourceClasses(userSource, true)}`}>
                            {userSource.name}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Subscription Name & Type */}
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-stone-800 flex items-center space-x-1.5">
                        <span>{u.subscriptionName || 'Стандартная подписка'}</span>
                        {u.subscriptionType === 'happ' && (
                          <span className="px-1.5 py-0.2 bg-indigo-50 text-indigo-700 rounded text-[10px] font-bold">
                            {u.finalSubscriptionUrl?.match(/^happ:\/\/(crypt[345])\//i)?.[1] || 'HAPP'}
                          </span>
                        )}
                        {u.subscriptionType === 'incy' && (
                          <span className="px-1.5 py-0.2 bg-emerald-50 text-emerald-700 rounded text-[10px] font-bold">qsen.ru</span>
                        )}
                      </div>
                      <div className="text-[11px] text-stone-400 font-mono">
                        {u.subscriptionToken.substring(0, 18)}...
                      </div>

                      {/* Explicit Red Warning Box for Suspended / Bot-Blocked / Unsubscribed Users */}
                      {isSuspended && (
                        <div className="mt-1.5 p-2 rounded-lg bg-rose-100/90 border border-rose-200 text-rose-900 space-y-0.5">
                          <div className="flex items-center space-x-1.5 font-bold text-xs text-rose-800">
                            <AlertCircle className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                            <span>
                              {isBotBlocked
                                ? 'Бот заблокирован пользователем'
                                : 'Отписался от обязательного канала'}
                            </span>
                          </div>
                          <div className="text-[11px] text-rose-700 leading-snug">
                            {u.subscriptionStatusReason || 'Обновления из центральной подписки не поступают (заблокированы).'}
                          </div>
                          {u.deletionDeadlineAt && (
                            <div className="text-[10px] font-semibold text-rose-900 pt-0.5 flex items-center space-x-1">
                              <Clock className="h-3 w-3 text-rose-600 shrink-0" />
                              <span>
                                Полное удаление через {Math.max(1, Math.round((new Date(u.deletionDeadlineAt).getTime() - Date.now()) / 3600000))} ч. (до {new Date(u.deletionDeadlineAt).toLocaleString('ru-RU')})
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Inconsistency Warning & Force Re-sync Action */}
                      {!isSuspended && checkUserInconsistent(u).isInconsistent && (
                        <div className="mt-1.5 p-2 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 space-y-1">
                          <div className="flex items-center space-x-1.5 font-bold text-xs text-amber-800">
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                            <span>Отклонение конфигурации</span>
                          </div>
                          <div className="text-[11px] text-amber-800 leading-snug">
                            {checkUserInconsistent(u).reason}
                          </div>
                          <div className="pt-0.5">
                            <button
                              id={`btn-inline-resync-${u.id}`}
                              onClick={() => handleForceResync(u)}
                              disabled={resyncingUserId === u.id}
                              className="px-2.5 py-1 rounded-md bg-amber-600 hover:bg-amber-700 text-white font-bold text-[10px] flex items-center space-x-1 shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
                              title="Принудительно согласовать локальную конфигурацию с центральным источником"
                            >
                              <RefreshCw className={`h-3 w-3 ${resyncingUserId === u.id ? 'animate-spin' : ''}`} />
                              <span>{resyncingUserId === u.id ? 'Синхронизация...' : 'Force Re-sync'}</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </td>

                    {/* Device Binding (1 device policy) */}
                    <td className="px-5 py-3.5">
                      {u.deviceLocked && u.boundDevice ? (
                        <div className="space-y-1">
                          <div className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-stone-900 text-stone-100 font-bold text-[10px]">
                            <Lock className="h-2.5 w-2.5 text-amber-400" />
                            <span>Привязано</span>
                          </div>
                          <div className="text-[11px] font-semibold text-stone-800 truncate max-w-[150px]" title={u.boundDevice.clientName}>
                            {u.boundDevice.clientName || 'Клиент V2Ray / Sing-box'}
                          </div>
                          <div className="text-[10px] text-stone-400 font-mono">
                            IP: {u.boundDevice.ip || '127.0.0.1'}
                          </div>
                          {onUnbindUserDevice && (
                            <button
                              onClick={() => setUnbindTargetUser(u)}
                              className="mt-1 text-[11px] text-rose-600 hover:text-rose-800 font-bold inline-flex items-center space-x-1 hover:underline cursor-pointer"
                              title="Отвязать устройство, чтобы пользователь мог повторно получить/подключить подписку"
                            >
                              <Unlink className="h-3 w-3" />
                              <span>Отвязать устройство</span>
                            </button>
                          )}
                          {Boolean(u.sharingWarningCount && u.sharingWarningCount > 0) && (
                            <div className="mt-1.5 p-1.5 rounded-lg bg-rose-50 border border-rose-300 text-rose-900 text-[10px] space-y-0.5">
                              <div className="font-bold flex items-center space-x-1 text-rose-700">
                                <AlertTriangle className="h-3 w-3 text-rose-600 shrink-0" />
                                <span>Попытка передачи 2-му устр.!</span>
                              </div>
                              <div className="text-[9px] text-rose-800">
                                2-му доступ закрыт. Активирована Строка 2.
                              </div>
                              {u.isTimerFrozen ? (
                                <div className="text-[9px] font-semibold text-emerald-800 bg-emerald-100/90 border border-emerald-300 px-1 py-0.5 rounded mt-1">
                                  ⏸️ 2-е устр. удалено (таймер заморожен, предпрежд. [{u.sharingWarningCount || 1}] сохранено)
                                </div>
                              ) : u.sharingGraceDeadlineAt ? (
                                <div className="pt-0.5">
                                  <div className="text-[9px] font-bold text-purple-700">
                                    {new Date(u.sharingGraceDeadlineAt) > new Date()
                                      ? `⏳ До бана: ${Math.max(1, Math.round((new Date(u.sharingGraceDeadlineAt).getTime() - Date.now()) / 60000))} мин.`
                                      : '⛔ Таймер истек (БАН)'}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      try {
                                        await resolveSecondDeviceRemoved(u.id);
                                        onSyncChannel();
                                      } catch (err: any) {
                                        console.warn(err);
                                      }
                                    }}
                                    className="mt-1 text-[10px] text-emerald-700 hover:text-emerald-900 border border-emerald-300 px-1.5 py-0.5 rounded bg-emerald-50 hover:bg-emerald-100 flex items-center space-x-1 font-semibold cursor-pointer"
                                    title="Второй пользователь удалил подписку: остановить таймер бана и вернуть центральные ключи"
                                  >
                                    <CheckCircle className="h-3 w-3 text-emerald-600" />
                                    <span>2-е устр. удалено (снять таймер)</span>
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div>
                          <div className="text-stone-500 text-[11px] flex items-center space-x-1 font-medium">
                            <Unlock className="h-3 w-3 text-emerald-600" />
                            <span className="text-emerald-700">Свободно (отвязано)</span>
                          </div>
                          <div className="text-[10px] text-stone-400 mt-0.5">
                            Привяжется при 1-м подключении
                          </div>
                          {onBindUserDevice && (
                            <button
                              onClick={async () => {
                                await onBindUserDevice(u.id, 'Hiddify / Android');
                                onSyncChannel();
                              }}
                              className="mt-1 text-[10px] text-stone-600 hover:text-stone-900 border border-stone-200 px-1.5 py-0.5 rounded bg-stone-50 hover:bg-stone-100 inline-flex items-center space-x-1"
                              title="Сымитировать тестовое подключение с устройства для проверки блокировки"
                            >
                              <Laptop className="h-2.5 w-2.5" />
                              <span>Тест привязки</span>
                            </button>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Received Date & Time */}
                    <td className="px-5 py-3.5 text-stone-600">
                      <div className="flex items-center space-x-1">
                        <Clock className="h-3 w-3 text-stone-400 shrink-0" />
                        <span>{receivedText}</span>
                      </div>
                    </td>

                    {/* Network Status & Mute/Block indicator */}
                    <td className="px-5 py-3.5">
                      {isSuspended ? (
                        <div className="space-y-1">
                          <div className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-rose-600 text-white font-bold text-[11px] shadow-xs">
                            <XCircle className="h-3 w-3 text-rose-200" />
                            <span>Не доступна</span>
                          </div>
                          <div className="text-[10px] text-rose-700 font-semibold">
                            Обновления заблокированы
                          </div>
                        </div>
                      ) : isBlocked ? (
                        <div className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-bold text-[11px]">
                          <Ban className="h-3 w-3 text-rose-600" />
                          <span>Заблокирован</span>
                        </div>
                      ) : isMuted ? (
                        <div>
                          <div className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 font-bold text-[11px]">
                            <VolumeX className="h-3 w-3 text-amber-600" />
                            <span>Сеть оборвана (Пауза)</span>
                          </div>
                          {u.mutedUntil && (
                            <div className="text-[10px] text-amber-700 mt-0.5">
                              до {new Date(u.mutedUntil).toLocaleTimeString('ru-RU')}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[11px]">
                          <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                          <span>Сеть активна</span>
                        </span>
                      )}
                    </td>

                    {/* Channel Membership */}
                    <td className="px-5 py-3.5">
                      {isBotBlocked ? (
                        <span className="text-rose-700 font-bold flex items-center space-x-1">
                          <Ban className="h-3.5 w-3.5 text-rose-600" />
                          <span>Бот заблокирован</span>
                        </span>
                      ) : u.channelMembership === 'member' ? (
                        <span className="text-emerald-700 font-medium">В канале ✅</span>
                      ) : u.channelMembership === 'administrator' ? (
                        <span className="text-indigo-700 font-bold">Админ ⭐</span>
                      ) : (
                        <span className="text-rose-600 font-medium">Покинул ❌</span>
                      )}
                    </td>

                    {/* Traffic & Personal Nodes Count & Individual Overrides */}
                    <td className="px-5 py-3.5 text-stone-600">
                      <div>
                        {(u.trafficUsedBytes / (1024 * 1024 * 1024)).toFixed(2)} ГБ{' '}
                        <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                          Без ограничений
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {u.personalNodes?.length > 0 && (
                          <span className="px-1.5 py-0.2 rounded bg-purple-50 text-purple-700 text-[10px] font-bold border border-purple-200">
                            +{u.personalNodes.length} узлов
                          </span>
                        )}
                        {u.excludedNodes && u.excludedNodes.length > 0 && (
                          <span className="px-1.5 py-0.2 rounded bg-rose-50 text-rose-700 text-[10px] font-bold border border-rose-200" title={`Исключено ${u.excludedNodes.length} узлов из центрального`}>
                            -{u.excludedNodes.length} узлов
                          </span>
                        )}
                        {u.detachedFromCentral && (
                          <span className="px-1.5 py-0.2 rounded bg-violet-100 text-violet-800 text-[10px] font-bold border border-violet-200" title="Подписка отвязана от центрального источника (автономная)">
                            ⚡ Отвязана
                          </span>
                        )}
                        {u.bypassBlock && (
                          <span className="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold border border-emerald-200" title="Включен VIP обход блокировок">
                            🛡️ VIP обход
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Actions: Mute, Block, Personal Nodes, Copy, Message, Delete */}
                    <td className="px-5 py-3.5 text-right space-x-1.5 whitespace-nowrap">
                      {/* Individual Custom Subscription Button (Отвязать/привязать, добавить/убавить, обход блокировок) */}
                      <button
                        id={`btn-custom-sub-${u.id}`}
                        onClick={() => openCustomSubModal(u)}
                        className={`p-1.5 rounded-lg border transition-all ${
                          u.detachedFromCentral || u.bypassBlock || (u.excludedNodes && u.excludedNodes.length > 0)
                            ? 'border-indigo-400 bg-indigo-100 text-indigo-900 hover:bg-indigo-200 font-bold'
                            : 'border-stone-200 hover:bg-indigo-50 hover:text-indigo-700 text-stone-600'
                        }`}
                        title="Индивидуальная настройка подписки (отвязать/привязать к центральному источнику, добавить/убавить узлы, обход блокировок)"
                      >
                        <Sliders className="h-3.5 w-3.5 text-indigo-700" />
                      </button>

                      {/* Force Re-sync Button */}
                      <button
                        id={`btn-force-resync-${u.id}`}
                        onClick={() => handleForceResync(u)}
                        disabled={resyncingUserId === u.id}
                        className={`p-1.5 rounded-lg border transition-all ${
                          checkUserInconsistent(u).isInconsistent
                            ? 'border-amber-400 bg-amber-100 text-amber-900 hover:bg-amber-200'
                            : 'border-stone-200 hover:bg-emerald-50 hover:text-emerald-700 text-stone-600'
                        }`}
                        title={
                          checkUserInconsistent(u).isInconsistent
                            ? `Отклонение: ${checkUserInconsistent(u).reason}. Нажмите для немедленной ресинхронизации (Force Re-sync)`
                            : 'Принудительно перезаписать конфигурацию пользователя из центрального источника (Force Re-sync)'
                        }
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${resyncingUserId === u.id ? 'animate-spin text-amber-800' : checkUserInconsistent(u).isInconsistent ? 'text-amber-800 font-bold' : ''}`} />
                      </button>

                      {/* Mute / Unmute Network button */}
                      {isMuted ? (
                        <button
                          onClick={() => onUnmuteUser(u.id)}
                          className="p-1.5 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800"
                          title="Восстановить сеть (Unmute)"
                        >
                          <Volume2 className="h-3.5 w-3.5 text-amber-700" />
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setMuteTargetUser(u);
                            setMuteDuration(60);
                          }}
                          className="p-1.5 rounded-lg border border-stone-200 hover:bg-amber-50 hover:text-amber-700 text-stone-600"
                          title="Замутить подписку (оборвать сеть на N минут/часов)"
                        >
                          <VolumeX className="h-3.5 w-3.5" />
                        </button>
                      )}

                      {/* Block / Unblock in Bot */}
                      {isBlocked ? (
                        <button
                          onClick={() => onUnblockUser(u.id)}
                          className="p-1.5 rounded-lg border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-700"
                          title="Разблокировать пользователя"
                        >
                          <Unlock className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setBlockTargetUser(u);
                            setBlockReason('Подозрение на подозрительные действия');
                          }}
                          className="p-1.5 rounded-lg border border-stone-200 hover:bg-rose-50 hover:text-rose-700 text-stone-600"
                          title="Заблокировать пользователя для бота"
                        >
                          <Ban className="h-3.5 w-3.5" />
                        </button>
                      )}

                      {/* 3-Tier Protection Manager */}
                      <button
                        onClick={() => setTierTargetUser(u)}
                        className="p-1.5 rounded-lg border border-amber-200 hover:bg-amber-50 hover:text-amber-700 text-stone-600"
                        title="3-уровневая защита (тестирование отписки, 24ч блокировки 2-го устр., бана, аннулирования)"
                      >
                        <ShieldAlert className="h-3.5 w-3.5 text-amber-600" />
                      </button>

                      {/* Personal Nodes */}
                      <button
                        onClick={() => {
                          setPersonalNodesTargetUser(u);
                          setPersonalNodesText((u.personalNodes || []).join('\n'));
                        }}
                        className="p-1.5 rounded-lg border border-stone-200 hover:bg-purple-50 hover:text-purple-700 text-stone-600"
                        title="Добавить персональные узлы в эту подписку"
                      >
                        <Server className="h-3.5 w-3.5" />
                      </button>

                      {/* Send Direct Telegram Message */}
                      <button
                        onClick={() => onSendDirectMessage(u)}
                        className="p-1.5 rounded-lg border border-stone-200 hover:bg-sky-50 hover:text-sky-700 text-stone-600"
                        title="Отправить сообщение в Telegram бот"
                      >
                        <Send className="h-3.5 w-3.5" />
                      </button>

                      {/* Copy link */}
                      <button
                        onClick={(e) => handleCopyLink(u, e)}
                        className="p-1.5 rounded-lg border border-stone-200 hover:bg-stone-100 text-stone-600"
                        title="Скопировать готовую ссылку подписки (HAPP crypt4 или INCY clck.ru)"
                      >
                        {copiedId === u.subscriptionToken ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>

                      {/* View layouts */}
                      <button
                        onClick={() => onViewUserSub(u)}
                        className="p-1.5 rounded-lg border border-stone-200 hover:bg-stone-100 text-stone-600"
                        title="Просмотреть макеты подписки"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </button>

                      {/* Delete */}
                      <button
                        disabled={deletingUserId === u.id}
                        onClick={() => {
                          if (confirm(`Удалить пользователя ${u.firstName}?`)) {
                            void handleDeleteUser(u);
                          }
                        }}
                        className="p-1.5 rounded-lg border border-stone-200 hover:bg-rose-50 hover:text-rose-600 text-stone-400 disabled:opacity-50"
                        title="Удалить"
                      >
                        {deletingUserId === u.id
                          ? <RefreshCw className="h-3.5 w-3.5 text-rose-500 animate-spin" />
                          : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal 1: Mute Subscription */}
      {muteTargetUser && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-stone-200 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center space-x-2 text-stone-900 font-bold">
                <VolumeX className="h-5 w-5 text-amber-600" />
                <span>Замутить подписку (Оборвать сеть)</span>
              </div>
              <button onClick={() => setMuteTargetUser(null)} className="text-stone-400 hover:text-stone-600">✕</button>
            </div>

            <p className="text-xs text-stone-600">
              Вы собираетесь временно замутить подписку пользователя <strong>{muteTargetUser.firstName}</strong> ({muteTargetUser.username ? `@${muteTargetUser.username}` : muteTargetUser.telegramId}). Сеть будет оборвана немедленно, клиент получит уведомление-заглушку.
            </p>

            <div className="space-y-3 text-xs">
              <label className="font-semibold text-stone-700 block">Выберите длительность паузы:</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: '30 минут', val: 30 },
                  { label: '1 час', val: 60 },
                  { label: '6 часов', val: 360 },
                  { label: '24 часа', val: 1440 },
                  { label: '3 дня', val: 4320 },
                  { label: '7 дней', val: 10080 },
                ].map((d) => (
                  <button
                    key={d.val}
                    type="button"
                    onClick={() => setMuteDuration(d.val)}
                    className={`p-2 rounded-xl border text-center font-medium transition-colors ${
                      muteDuration === d.val
                        ? 'bg-amber-500 text-white border-amber-600'
                        : 'bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>

              <div>
                <label className="text-[11px] text-stone-500 block mb-1">Или введите количество минут вручную:</label>
                <input
                  type="number"
                  value={muteDuration}
                  onChange={(e) => setMuteDuration(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-900"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-3 border-t border-stone-100">
              <button
                onClick={() => setMuteTargetUser(null)}
                className="px-4 py-2 rounded-xl border border-stone-200 text-xs font-semibold text-stone-600 hover:bg-stone-50"
              >
                Отмена
              </button>
              <button
                onClick={handleMuteSubmit}
                className="px-4 py-2 rounded-xl bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700"
              >
                Оборвать сеть на {muteDuration} мин
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Block User in Bot */}
      {blockTargetUser && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-stone-200 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center space-x-2 text-stone-900 font-bold">
                <Ban className="h-5 w-5 text-rose-600" />
                <span>Блокировка пользователя в боте</span>
              </div>
              <button onClick={() => setBlockTargetUser(null)} className="text-stone-400 hover:text-stone-600">✕</button>
            </div>

            <p className="text-xs text-stone-600">
              Пользователь <strong>{blockTargetUser.firstName}</strong> будет полностью заблокирован. При попытке получить подписку через бота ему будет показано настроенное сообщение о подозрительных действиях и кнопка прямого перехода к админу в чат.
            </p>

            <div className="text-xs space-y-1.5">
              <label className="font-semibold text-stone-700 block">Причина блокировки:</label>
              <textarea
                rows={3}
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-900"
              />
            </div>

            <div className="flex justify-end space-x-2 pt-3 border-t border-stone-100">
              <button
                onClick={() => setBlockTargetUser(null)}
                className="px-4 py-2 rounded-xl border border-stone-200 text-xs font-semibold text-stone-600 hover:bg-stone-50"
              >
                Отмена
              </button>
              <button
                onClick={handleBlockSubmit}
                className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700"
              >
                Заблокировать
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Personal Nodes */}
      {personalNodesTargetUser && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-stone-200 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center space-x-2 text-stone-900 font-bold">
                <Server className="h-5 w-5 text-purple-600" />
                <span>Персональные узлы пользователя {personalNodesTargetUser.firstName}</span>
              </div>
              <button onClick={() => setPersonalNodesTargetUser(null)} className="text-stone-400 hover:text-stone-600">✕</button>
            </div>

            <p className="text-xs text-stone-600 leading-relaxed">
              Эти серверы и ключи будут подмешиваться <strong>только в персональную подписку этого пользователя</strong> в дополнение к серверам из центрального файла.
            </p>

            <div className="text-xs space-y-1.5">
              <label className="font-semibold text-stone-700 block">Узлы (по одной строке vless://, ss://, trojan://):</label>
              <textarea
                rows={6}
                value={personalNodesText}
                onChange={(e) => setPersonalNodesText(e.target.value)}
                placeholder="vless://...&#10;ss://..."
                className="w-full font-mono text-xs p-3 rounded-xl border border-stone-200 bg-stone-50 text-stone-900"
              />
            </div>

            <div className="flex justify-end space-x-2 pt-3 border-t border-stone-100">
              <button
                onClick={() => setPersonalNodesTargetUser(null)}
                className="px-4 py-2 rounded-xl border border-stone-200 text-xs font-semibold text-stone-600 hover:bg-stone-50"
              >
                Отмена
              </button>
              <button
                onClick={handleSaveNodesSubmit}
                className="px-4 py-2 rounded-xl bg-stone-900 text-white text-xs font-semibold hover:bg-stone-800"
              >
                Сохранить персональные узлы
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 4: Add New User */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-stone-200 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="text-base font-bold text-stone-900">
                Добавить подписчика вручную
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-stone-400 hover:text-stone-600">✕</button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-stone-700 block mb-1">Telegram ID *</label>
                <input
                  type="number"
                  value={newUserId}
                  onChange={(e) => setNewUserId(e.target.value)}
                  required
                  placeholder="519284721"
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-stone-700 block mb-1">Username</label>
                  <input
                    type="text"
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    placeholder="alex_dev"
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-900"
                  />
                </div>
                <div>
                  <label className="font-semibold text-stone-700 block mb-1">Имя</label>
                  <input
                    type="text"
                    value={newUserFirst}
                    onChange={(e) => setNewUserFirst(e.target.value)}
                    placeholder="Алексей"
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-900"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-stone-700 block mb-1">Название полученной подписки</label>
                <input
                  type="text"
                  value={newUserSubName}
                  onChange={(e) => setNewUserSubName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-stone-700 block mb-1">Формат</label>
                  <select
                    value={newUserSubType}
                    onChange={(e) => setNewUserSubType(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-900"
                  >
                    <option value="happ">HAPP (crypt4)</option>
                    <option value="incy">INCY (qsen-short)</option>
                    <option value="standard">Standard V2Ray</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-stone-700 block mb-1">Статус в канале</label>
                  <select
                    value={newUserMembership}
                    onChange={(e) => setNewUserMembership(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-900"
                  >
                    <option value="member">Участник</option>
                    <option value="administrator">Администратор</option>
                    <option value="left">Покинул канал</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl border border-stone-200 text-stone-600 hover:bg-stone-50"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-stone-900 text-white font-semibold hover:bg-stone-800"
                >
                  Создать подписчика
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Unbind Device Confirmation */}
      {unbindTargetUser && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-stone-200 space-y-4">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-rose-50 text-rose-600 border border-rose-100">
                <Unlink className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-stone-900">
                  Отвязать устройство пользователя?
                </h3>
                <p className="text-xs text-stone-500">
                  Пользователь: <span className="font-semibold text-stone-800">@{unbindTargetUser.username || unbindTargetUser.telegramId} ({unbindTargetUser.firstName})</span>
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-200 text-xs space-y-2 text-stone-700">
              <div className="flex justify-between">
                <span className="text-stone-500">Привязанное устройство:</span>
                <span className="font-semibold text-stone-800">{unbindTargetUser.boundDevice?.clientName || 'Неизвестный клиент'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">IP адрес:</span>
                <span className="font-mono text-stone-800">{unbindTargetUser.boundDevice?.ip || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Дата фиксации:</span>
                <span>{unbindTargetUser.boundDevice?.boundAt ? new Date(unbindTargetUser.boundDevice.boundAt).toLocaleString('ru-RU') : '—'}</span>
              </div>
            </div>

            <p className="text-xs text-stone-600 leading-relaxed">
              После отвязки этот пользователь сможет снова получить или импортировать свою подписку на новом устройстве в боте. До отвязки подключение с чужого/нового устройства блокируется защитой «1 пользователь = 1 устройство».
            </p>

            <div className="flex justify-end space-x-2 pt-2 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setUnbindTargetUser(null)}
                disabled={isUnbinding}
                className="px-4 py-2 rounded-xl border border-stone-200 text-stone-600 hover:bg-stone-50 text-xs"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleUnbindSubmit}
                disabled={isUnbinding}
                className="px-4 py-2 rounded-xl bg-rose-600 text-white font-semibold hover:bg-rose-700 text-xs flex items-center space-x-1.5 disabled:opacity-50"
              >
                <Unlink className="h-3.5 w-3.5" />
                <span>{isUnbinding ? 'Отвязываю...' : 'Да, отвязать подписку'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: 3-Tier Protection Management & Simulation */}
      {tierTargetUser && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-xl border border-stone-200 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center space-x-2 text-stone-900 font-bold">
                <ShieldAlert className="h-5 w-5 text-amber-600" />
                <span>3-Уровневая защита: {tierTargetUser.firstName} (@{tierTargetUser.username || tierTargetUser.telegramId})</span>
              </div>
              <button onClick={() => setTierTargetUser(null)} className="text-stone-400 hover:text-stone-600">✕</button>
            </div>

            <div className="text-xs text-stone-600 space-y-2">
              <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <span className="text-stone-400 block text-[10px] uppercase">Статус бота:</span>
                  <span className="font-semibold text-stone-900">{tierTargetUser.status}</span>
                </div>
                <div>
                  <span className="text-stone-400 block text-[10px] uppercase">Канал:</span>
                  <span className="font-semibold text-stone-900">{tierTargetUser.channelMembership || 'member'}</span>
                </div>
                <div>
                  <span className="text-stone-400 block text-[10px] uppercase">Штрафные попытки:</span>
                  <span className={`font-semibold ${tierTargetUser.deviceViolationAttempts && tierTargetUser.deviceViolationAttempts >= 3 ? 'text-rose-600 font-bold' : 'text-stone-900'}`}>
                    {tierTargetUser.deviceViolationAttempts || 0} / 3
                  </span>
                </div>
                <div>
                  <span className="text-stone-400 block text-[10px] uppercase">Блокировка:</span>
                  <span className={`font-semibold ${tierTargetUser.isBlocked ? 'text-rose-600 font-bold' : 'text-emerald-600'}`}>
                    {tierTargetUser.isBlocked ? 'Заблокирован' : 'Активен'}
                  </span>
                </div>
              </div>
            </div>

            {/* Actions list for all 3 tiers */}
            <div className="space-y-3">
              {/* Tier 1 Box */}
              <div className="p-3.5 rounded-xl border border-stone-200 bg-stone-50/70 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="px-2 py-0.5 rounded bg-stone-200 text-stone-800 font-bold text-[10px]">Tier 1</span>
                    <span className="font-bold text-stone-900">Выход из канала / Удаление бота (Авто-возврат)</span>
                  </div>
                </div>
                <p className="text-[11px] text-stone-500">
                  При выходе из канала или удалении бота серверные узлы подменяются на Источник 1 (заглушка). При возвращении в канал подписка автоматически возвращается к центральным узлам.
                </p>
                <div className="flex space-x-2 pt-1">
                  <button
                    disabled={tierProcessingUserId === tierTargetUser.id}
                    onClick={() => handleSimulateTierAction(tierTargetUser.id, 1, 'trigger')}
                    className="px-3 py-1.5 rounded-lg bg-stone-900 text-white font-semibold hover:bg-stone-800 text-[11px] disabled:opacity-50"
                  >
                    Симулировать выход из канала
                  </button>
                  <button
                    disabled={tierProcessingUserId === tierTargetUser.id}
                    onClick={() => handleSimulateTierAction(tierTargetUser.id, 1, 'revert')}
                    className="px-3 py-1.5 rounded-lg border border-stone-200 bg-white text-stone-700 hover:bg-stone-100 font-semibold text-[11px] disabled:opacity-50"
                  >
                    Вернуть в канал (Revert)
                  </button>
                </div>
              </div>

              {/* Tier 2 Box */}
              <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/40 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="px-2 py-0.5 rounded bg-amber-200 text-amber-900 font-bold text-[10px]">Tier 2</span>
                    <span className="font-bold text-stone-900">2-е устройство / Неавторизованный вход (24ч бан, 3 попытки)</span>
                  </div>
                </div>
                <p className="text-[11px] text-stone-600">
                  Попытка подключения с другого устройства накладывает временный бан на 24 часа. При накоплении 3 попыток система автоматически эскалирует пользователя в Tier 3 (перманентный бан).
                </p>
                <div className="flex space-x-2 pt-1">
                  <button
                    disabled={tierProcessingUserId === tierTargetUser.id}
                    onClick={() => handleSimulateTierAction(tierTargetUser.id, 2, 'trigger')}
                    className="px-3 py-1.5 rounded-lg bg-amber-600 text-white font-semibold hover:bg-amber-700 text-[11px] disabled:opacity-50"
                  >
                    +1 попытка со 2-го устройства (Блок на 24ч)
                  </button>
                  <button
                    disabled={tierProcessingUserId === tierTargetUser.id}
                    onClick={() => handleSimulateTierAction(tierTargetUser.id, 2, 'revert')}
                    className="px-3 py-1.5 rounded-lg border border-amber-200 bg-white text-amber-800 hover:bg-amber-100 font-semibold text-[11px] disabled:opacity-50"
                  >
                    Снять 24ч блок (Обнулить)
                  </button>
                </div>
              </div>

              {/* Tier 3 Box */}
              <div className="p-3.5 rounded-xl border border-rose-200 bg-rose-50/40 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="px-2 py-0.5 rounded bg-rose-200 text-rose-900 font-bold text-[10px]">Tier 3</span>
                    <span className="font-bold text-stone-900">Перманентный бан (Требует ручного подтверждения)</span>
                  </div>
                </div>
                <p className="text-[11px] text-stone-600">
                  Полная бессрочная блокировка. Для восстановления администратор должен одобрить заявку в Обратной связи или нажать кнопку ручного разбана.
                </p>
                <div className="flex space-x-2 pt-1">
                  <button
                    disabled={tierProcessingUserId === tierTargetUser.id}
                    onClick={() => handleSimulateTierAction(tierTargetUser.id, 3, 'trigger')}
                    className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-semibold hover:bg-rose-700 text-[11px] disabled:opacity-50"
                  >
                    Эскалировать в Tier 3 (Бан)
                  </button>
                  <button
                    disabled={tierProcessingUserId === tierTargetUser.id}
                    onClick={() => handleSimulateTierAction(tierTargetUser.id, 3, 'revert')}
                    className="px-3 py-1.5 rounded-lg border border-rose-200 bg-white text-rose-800 hover:bg-rose-100 font-semibold text-[11px] disabled:opacity-50"
                  >
                    Снять перманентный бан
                  </button>
                  <button
                    disabled={tierProcessingUserId === tierTargetUser.id}
                    onClick={() => handleTerminateUserAction(tierTargetUser.id, tierTargetUser.firstName)}
                    className="px-3 py-1.5 rounded-lg border border-rose-300 bg-rose-100 text-rose-900 hover:bg-rose-200 font-semibold text-[11px] disabled:opacity-50 ml-auto"
                  >
                    Аннулировать подписку (Terminate)
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-stone-100">
              <button
                onClick={() => setTierTargetUser(null)}
                className="px-4 py-2 rounded-xl border border-stone-200 text-xs font-semibold text-stone-600 hover:bg-stone-50"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Individual Custom Subscription Management (Отвязать/привязать, добавить/убавить, обход блокировок) */}
      {customSubUser && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-stone-200 space-y-4 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center space-x-3">
                <div className="h-10 w-10 rounded-xl bg-indigo-100 text-indigo-800 flex items-center justify-center shrink-0">
                  <Sliders className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-stone-900 flex items-center space-x-2">
                    <span>Индивидуальная подписка:</span>
                    <span className="text-indigo-700">{customSubUser.firstName || customSubUser.username || `ID ${customSubUser.telegramId}`}</span>
                  </h3>
                  <div className="text-xs text-stone-500 flex items-center space-x-2 mt-0.5">
                    <span>@{customSubUser.username || 'без username'}</span>
                    <span>•</span>
                    <span>ID: {customSubUser.telegramId}</span>
                    <span>•</span>
                    <code className="font-mono bg-stone-100 px-1 rounded text-[11px]">{customSubUser.subscriptionToken}</code>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setCustomSubUser(null)}
                className="text-stone-400 hover:text-stone-600 h-8 w-8 flex items-center justify-center rounded-lg hover:bg-stone-100 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {/* Notification alert */}
            {customSubSuccessMsg && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-800 flex items-center space-x-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>{customSubSuccessMsg}</span>
              </div>
            )}

            {/* Section 1: Detach / Attach from Central Source */}
            <div className="p-4 rounded-xl border border-stone-200 bg-stone-50/70 space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-stone-900 flex items-center space-x-2">
                    <span>Привязка к центральному источнику</span>
                    {customSubDetached ? (
                      <span className="px-2 py-0.5 rounded-full bg-violet-100 text-violet-800 text-[10px] font-bold border border-violet-200">
                        ⚡ Автономный режим (Отвязана)
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold border border-emerald-200">
                        🔗 Привязана к центральному
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-stone-500 mt-0.5">
                    {customSubDetached
                      ? 'Подписка полностью отвязана. Центральные обновления и синхронизации не будут перезаписывать этот файл.'
                      : 'Подписка синхронизируется с центральным файлом. Вы можете персонально добавить или убавить узлы.'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setCustomSubDetached(!customSubDetached)}
                  className={`px-3 py-1.5 rounded-xl font-semibold text-xs transition-colors cursor-pointer border ${
                    customSubDetached
                      ? 'bg-violet-600 text-white border-violet-600 hover:bg-violet-700'
                      : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-100'
                  }`}
                >
                  {customSubDetached ? '⚡ Отвязана вручную' : '🔗 Привязать к центральному'}
                </button>
              </div>
            </div>

            {/* Section 2: Bypass Block / VIP Access */}
            <div className="p-4 rounded-xl border border-stone-200 bg-stone-50/70 space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-stone-900 flex items-center space-x-2">
                    <Shield className="h-4 w-4 text-emerald-600" />
                    <span>Обход блокировок (Bypass Block / VIP доступ)</span>
                    {customSubBypassBlock && (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold border border-emerald-200">
                        Включен
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-stone-500 mt-0.5">
                    Даже если пользователя заблокировали в боте, он покинул каналы или превысил лимиты устройств — выдавать ему рабочие узлы без заглушек.
                  </p>
                </div>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={customSubBypassBlock}
                    onChange={(e) => setCustomSubBypassBlock(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-stone-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>
            </div>

            {/* Section 3: Subtract nodes (Убавить узлы из центрального) */}
            <div className="p-4 rounded-xl border border-stone-200 bg-stone-50/70 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-stone-900 flex items-center space-x-1.5">
                  <span className="text-rose-600 font-bold text-sm">−</span>
                  <span>Убавить узлы из центрального (Исключить узлы)</span>
                </label>
                <span className="text-[10px] text-stone-400">По одному ключевому слову или строке на строку</span>
              </div>
              <p className="text-[11px] text-stone-500">
                Укажите имена серверов, хосты, IP или фрагменты ссылок, которые нужно удалить из подписки этого человека.
              </p>
              <textarea
                rows={2}
                value={customSubExcludedNodesText}
                onChange={(e) => setCustomSubExcludedNodesText(e.target.value)}
                placeholder="Например: ru-09.fnpv.net&#10;#Vaynet [Доступный]🇷🇺&#10;139.100.220.79"
                className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-white text-stone-900 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {/* Section 4: Add personal nodes (Добавить индивидуально в подписку) */}
            <div className="p-4 rounded-xl border border-stone-200 bg-stone-50/70 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-stone-900 flex items-center space-x-1.5">
                  <span className="text-emerald-600 font-bold text-sm">+</span>
                  <span>Добавить индивидуально в подписку (Персональные узлы)</span>
                </label>
                <span className="text-[10px] text-stone-400">Форматы: vless://, vmess://, ss://, trojan://</span>
              </div>
              <p className="text-[11px] text-stone-500">
                Эти серверы будут встроены в подписку только для этого пользователя (в начало списка).
              </p>
              <textarea
                rows={3}
                value={customSubPersonalNodesText}
                onChange={(e) => setCustomSubPersonalNodesText(e.target.value)}
                placeholder="vless://40854303-...@host:443?security=reality...#Персональный VIP сервер"
                className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-white text-stone-900 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {/* Section 5: Custom Content (if detached) */}
            {customSubDetached && (
              <div className="p-4 rounded-xl border border-violet-200 bg-violet-50/40 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-violet-950 flex items-center space-x-1.5">
                    <SlidersHorizontal className="h-4 w-4 text-violet-700" />
                    <span>Полный кастомный текст подписки (автономный режим)</span>
                  </label>
                  <span className="text-[10px] text-violet-600 font-semibold">Игнорирует центральный файл</span>
                </div>
                <textarea
                  rows={4}
                  value={customSubContent}
                  onChange={(e) => setCustomSubContent(e.target.value)}
                  placeholder="Вставьте сюда полный список серверов для автономного файла подписки..."
                  className="w-full px-3 py-2 rounded-xl border border-violet-200 bg-white text-stone-900 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>
            )}

            {/* Section 6: INCY Link with clck.ru */}
            <div className="p-3.5 rounded-xl border border-stone-200 bg-stone-50/70 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-stone-900 flex items-center space-x-1.5">
                  <GitBranch className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Ссылка подписки INCY (Зашифровано clck.ru):</span>
                </span>
                <button
                  type="button"
                  onClick={handleRefreshUserClck}
                  disabled={isRefreshingUserClck}
                  className="px-2.5 py-1 rounded-lg border border-stone-300 bg-white hover:bg-stone-100 text-stone-700 font-medium text-[11px] flex items-center space-x-1 cursor-pointer disabled:opacity-50"
                  title="Сгенерировать короткую ссылку clck.ru"
                >
                  <RefreshCw className={`h-3 w-3 ${isRefreshingUserClck ? 'animate-spin text-emerald-600' : 'text-stone-500'}`} />
                  <span>{isRefreshingUserClck ? 'Генерация...' : 'Обновить clck.ru'}</span>
                </button>
              </div>

              <div className="p-2 rounded-lg bg-white border border-stone-200 flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] text-stone-800 truncate select-all">
                  {customSubUser.clckUrl || `${window.location.origin}/api/sub/${customSubUser.subscriptionToken}`}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const link = customSubUser.clckUrl || `${window.location.origin}/api/sub/${customSubUser.subscriptionToken}`;
                    navigator.clipboard.writeText(link);
                    alert('Ссылка скопирована!');
                  }}
                  className="px-2 py-0.5 rounded bg-stone-100 hover:bg-stone-200 text-stone-700 text-[10px] font-semibold shrink-0 cursor-pointer"
                >
                  Копировать
                </button>
              </div>
            </div>

            {/* Admin notes */}
            <div>
              <label className="text-xs font-semibold text-stone-700 block mb-1">
                Заметка администратора к пользователю:
              </label>
              <input
                type="text"
                value={customSubNotes}
                onChange={(e) => setCustomSubNotes(e.target.value)}
                placeholder="Например: VIP партнер, доступ без каналов, персональный сервер в Нидерландах"
                className="w-full px-3 py-1.5 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setCustomSubUser(null)}
                className="px-4 py-2 rounded-xl border border-stone-200 text-xs font-semibold text-stone-600 hover:bg-stone-50"
              >
                Отмена
              </button>

              <button
                type="button"
                disabled={isSavingCustomSub}
                onClick={handleSaveCustomSub}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-xs flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
              >
                {isSavingCustomSub ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin text-white" />
                    <span>Применение в GitVerse...</span>
                  </>
                ) : (
                  <>
                    <Check className="h-3.5 w-3.5 text-indigo-200" />
                    <span>Сохранить и применить</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: BULK MESSAGE TO BOT USERS                                         */}
      {/* ========================================================================= */}
      {bulkMessageModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-stone-200 space-y-4 my-8 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="h-9 w-9 rounded-xl bg-purple-600 text-white flex items-center justify-center">
                  <Send className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-stone-900 text-sm">
                    Отправить сообщение в бот
                  </h3>
                  <p className="text-[11px] text-stone-500">
                    Персональная пересылка в Telegram выбранным пользователям
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBulkMessageModalOpen(false)}
                className="text-stone-400 hover:text-stone-600 text-lg leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="p-2.5 bg-purple-50 rounded-xl border border-purple-200 text-xs flex items-center justify-between">
              <span className="font-bold text-purple-900">
                Выбрано получателей:
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-purple-200 text-purple-900 font-bold text-xs">
                {selectedUserIds.size} пользователей
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-stone-800 block mb-1">
                  Текст сообщения:
                </label>
                <textarea
                  rows={5}
                  value={bulkMessageText}
                  onChange={(e) => setBulkMessageText(e.target.value)}
                  placeholder="Привет, {name}! Важное уведомление по вашей подписке..."
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-purple-500 text-xs"
                />
                <p className="text-[10px] text-stone-400 mt-1">
                  Поддерживаются теги: <code>&#123;name&#125;</code> (имя), <code>&#123;username&#125;</code> (@ник), <code>&#123;id&#125;</code> (Telegram ID).
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3 rounded-xl bg-stone-50 border border-stone-200">
                <div>
                  <label className="text-[10px] font-bold text-stone-600 block mb-0.5">Кнопка-ссылка (текст):</label>
                  <input
                    type="text"
                    value={bulkButtonText}
                    onChange={(e) => setBulkButtonText(e.target.value)}
                    placeholder="Например: Продлить подписку"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white text-xs focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-stone-600 block mb-0.5">URL кнопки:</label>
                  <input
                    type="text"
                    value={bulkButtonUrl}
                    onChange={(e) => setBulkButtonUrl(e.target.value)}
                    placeholder="https://t.me/..."
                    className="w-full px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white text-xs focus:outline-none focus:ring-1 focus:ring-purple-500 font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setBulkMessageModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-stone-200 text-stone-600 font-semibold cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  disabled={isExecutingBulkAction || !bulkMessageText.trim()}
                  onClick={() => executeBulkAction('send_message', {
                    message: bulkMessageText,
                    buttonText: bulkButtonText.trim() || undefined,
                    buttonUrl: bulkButtonUrl.trim() || undefined,
                  })}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold shadow-xs flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                  <span>{isExecutingBulkAction ? 'Отправка...' : `Отправить (${selectedUserIds.size} чел.)`}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: BULK MUTE                                                         */}
      {/* ========================================================================= */}
      {bulkMuteModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-stone-200 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="h-8 w-8 rounded-xl bg-amber-600 text-white flex items-center justify-center">
                  <VolumeX className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-bold text-stone-900 text-sm">
                    Заглушить выбранных пользователей (Мут)
                  </h3>
                  <p className="text-[11px] text-stone-500">
                    Обрыв сети и выдача заглушки Строки 2 на указанное время
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBulkMuteModalOpen(false)}
                className="text-stone-400 hover:text-stone-600 text-lg leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-stone-800 block mb-1">
                  Длительность заглушки:
                </label>
                <div className="grid grid-cols-3 gap-1.5 mb-2">
                  {[
                    { label: '15 минут', min: 15 },
                    { label: '1 час', min: 60 },
                    { label: '6 часов', min: 360 },
                    { label: '24 часа', min: 1440 },
                    { label: '7 дней', min: 10080 },
                    { label: '30 дней', min: 43200 },
                  ].map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => setBulkMuteMinutes(p.min)}
                      className={`px-2 py-1.5 rounded-lg border text-xs font-bold transition-colors cursor-pointer ${
                        bulkMuteMinutes === p.min
                          ? 'bg-amber-600 text-white border-amber-600'
                          : 'bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-[11px] text-stone-500">Или минут:</span>
                  <input
                    type="number"
                    min={1}
                    value={bulkMuteMinutes}
                    onChange={(e) => setBulkMuteMinutes(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-24 px-2 py-1 rounded-lg border border-stone-200 bg-white font-semibold text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setBulkMuteModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-xl border border-stone-200 text-stone-600 font-semibold cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  disabled={isExecutingBulkAction}
                  onClick={() => executeBulkAction('mute', { durationMinutes: bulkMuteMinutes })}
                  className="px-4 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold shadow-xs flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                >
                  <VolumeX className="h-3.5 w-3.5" />
                  <span>{isExecutingBulkAction ? 'Применение...' : `Заглушить (${selectedUserIds.size} чел.)`}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: BULK BLOCK                                                        */}
      {/* ========================================================================= */}
      {bulkBlockModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-stone-200 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="h-8 w-8 rounded-xl bg-rose-600 text-white flex items-center justify-center">
                  <Ban className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-bold text-stone-900 text-sm">
                    Массовая блокировка пользователей (Бан)
                  </h3>
                  <p className="text-[11px] text-stone-500">
                    Блокировка доступа в боте и подписке для {selectedUserIds.size} пользователей
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBulkBlockModalOpen(false)}
                className="text-stone-400 hover:text-stone-600 text-lg leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-stone-800 block mb-1">
                  Причина блокировки:
                </label>
                <input
                  type="text"
                  value={bulkBlockReason}
                  onChange={(e) => setBulkBlockReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-rose-500"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setBulkBlockModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-xl border border-stone-200 text-stone-600 font-semibold cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  disabled={isExecutingBulkAction}
                  onClick={() => executeBulkAction('block', { reason: bulkBlockReason })}
                  className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold shadow-xs flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Ban className="h-3.5 w-3.5" />
                  <span>{isExecutingBulkAction ? 'Блокировка...' : `Заблокировать (${selectedUserIds.size})`}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: BULK DELETE                                                       */}
      {/* ========================================================================= */}
      {bulkDeleteModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-rose-200 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="h-8 w-8 rounded-xl bg-rose-600 text-white flex items-center justify-center">
                  <Trash2 className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-bold text-stone-900 text-sm">
                    Удалить выбранных пользователей?
                  </h3>
                  <p className="text-[11px] text-stone-500">
                    Необратимое удаление {selectedUserIds.size} пользователей
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBulkDeleteModalOpen(false)}
                className="text-stone-400 hover:text-stone-600 text-lg leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 text-xs text-rose-900 leading-relaxed">
              Вы уверены, что хотите удалить <strong>{selectedUserIds.size} пользователей</strong>? Их файлы подписок в репозитории будут стёрты, а доступ аннулирован.
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setBulkDeleteModalOpen(false)}
                className="px-3.5 py-1.5 rounded-xl border border-stone-200 text-stone-600 font-semibold cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={isExecutingBulkAction}
                onClick={() => executeBulkAction('delete')}
                className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold shadow-xs flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>{isExecutingBulkAction ? 'Удаление...' : `Да, удалить (${selectedUserIds.size})`}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CONTEXT MENU (Right Click on User Row)                                   */}
      {/* ========================================================================= */}
      {contextMenu && (
        <div
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          className="fixed z-50 bg-white border border-stone-200 rounded-2xl shadow-2xl py-1.5 min-w-[230px] text-xs text-stone-800 animate-in fade-in zoom-in-95 duration-100"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 border-b border-stone-100 font-bold text-stone-900 flex items-center justify-between">
            <span className="truncate max-w-[150px]">{contextMenu.user.firstName || contextMenu.user.username}</span>
            <span className="text-[10px] text-stone-400 font-mono">ID: {contextMenu.user.telegramId}</span>
          </div>

          <div className="py-1">
            <button
              type="button"
              onClick={() => {
                handleToggleSelectUser(contextMenu.user.id);
                setContextMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-purple-50 flex items-center space-x-2 text-stone-700 hover:text-purple-900 cursor-pointer"
            >
              {selectedUserIds.has(contextMenu.user.id) ? (
                <>
                  <XCircle className="h-3.5 w-3.5 text-purple-600" />
                  <span>Снять выбор</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-purple-600" />
                  <span>Выбрать пользователя</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setSelectedUserIds(new Set(filteredUsers.map((u) => u.id)));
                setContextMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-stone-50 flex items-center space-x-2 text-stone-700 cursor-pointer"
            >
              <Users className="h-3.5 w-3.5 text-stone-500" />
              <span>Выбрать всех ({filteredUsers.length})</span>
            </button>
          </div>

          <div className="border-t border-stone-100 py-1">
            <button
              type="button"
              onClick={() => {
                setBulkMessageModalOpen(true);
                setContextMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-purple-50 flex items-center space-x-2 text-purple-700 font-semibold cursor-pointer"
            >
              <Send className="h-3.5 w-3.5 text-purple-600" />
              <span>Отправить сообщение в бот ({selectedUserIds.size || 1})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setBulkMuteModalOpen(true);
                setContextMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-amber-50 flex items-center space-x-2 text-amber-800 cursor-pointer"
            >
              <VolumeX className="h-3.5 w-3.5 text-amber-600" />
              <span>Заглушить (Мут)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                executeBulkAction('unmute');
                setContextMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-emerald-50 flex items-center space-x-2 text-emerald-800 cursor-pointer"
            >
              <Volume2 className="h-3.5 w-3.5 text-emerald-600" />
              <span>Снять заглушку (Размут)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setBulkBlockModalOpen(true);
                setContextMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-rose-50 flex items-center space-x-2 text-rose-800 cursor-pointer"
            >
              <Ban className="h-3.5 w-3.5 text-rose-600" />
              <span>Заблокировать</span>
            </button>

            <button
              type="button"
              onClick={() => {
                executeBulkAction('unblock');
                setContextMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-stone-50 flex items-center space-x-2 text-stone-700 cursor-pointer"
            >
              <Unlock className="h-3.5 w-3.5 text-stone-600" />
              <span>Разблокировать</span>
            </button>

            {contextMenu.user && (contextMenu.user.sharingWarningCount || contextMenu.user.sharingGraceDeadlineAt) && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    await resolveSecondDeviceRemoved(contextMenu.user.id);
                    onSyncChannel();
                  } catch (e: any) {
                    console.warn(e);
                  }
                  setContextMenu(null);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-emerald-50 flex items-center space-x-2 text-emerald-700 font-semibold cursor-pointer border-t border-stone-100"
              >
                <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                <span>✅ 2-е устр. удалено (снять таймер)</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setBulkDeleteModalOpen(true);
                setContextMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-rose-50 flex items-center space-x-2 text-rose-600 font-semibold cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Удалить выбранных</span>
            </button>
          </div>

          <div className="border-t border-stone-100 py-1">
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(String(contextMenu.user.telegramId));
                setContextMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-stone-50 flex items-center space-x-2 text-stone-500 cursor-pointer"
            >
              <Copy className="h-3.5 w-3.5" />
              <span>Копировать Telegram ID</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
