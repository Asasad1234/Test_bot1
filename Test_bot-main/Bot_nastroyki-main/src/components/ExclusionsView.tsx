import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { 
  KeyRound, 
  Plus, 
  Copy, 
  Check, 
  Trash2, 
  ExternalLink, 
  ShieldOff, 
  RefreshCw, 
  Sparkles, 
  GitBranch, 
  Clock, 
  FileCode, 
  QrCode, 
  Users, 
  CheckCircle2, 
  FolderGit2, 
  Search, 
  Layers, 
  Infinity as InfinityIcon, 
  ShieldCheck, 
  Radio,
  Smartphone,
  Laptop,
  Globe,
  Link2,
  Shield,
  UserPlus,
  AlertTriangle,
  AlertCircle,
  Ban,
  Lock,
  Unlock,
  ShieldAlert,
  Send,
  Timer
} from 'lucide-react';
import { ExclusionSubscription, GitSourceItem, CentralSubscriptionFile } from '../types';
import { 
  shortenExclusionClck, 
  addExclusionClient, 
  deleteExclusionClient,
  createChannelExclusion,
  resetExclusionSharingWarning,
  unbindExclusionDevice,
  verifyExclusionChannel,
  forceBanExclusion,
  createTemporaryExclusion,
  renewTemporaryExclusion,
  updateExclusionContent,
  fetchExclusionFileContent,
  updateExceptionNode as apiUpdateExceptionNode
} from '../services/api';

interface ExclusionsViewProps {
  exclusions: ExclusionSubscription[];
  activeGitSource?: GitSourceItem;
  centralFile?: (CentralSubscriptionFile & { stats?: any }) | null;
  onCreateExclusion: (payload: { name?: string; notes?: string; fileName?: string; expiresAt?: string | null; customContent?: string; attachToCentral?: boolean }) => Promise<void>;
  onDeleteExclusion: (id: string) => Promise<void>;
  onSyncExclusion?: (id: string) => Promise<any>;
  onSyncAllExclusions?: () => Promise<any>;
  onRefreshExclusions?: () => Promise<void>;
}

function getClckShortUrl(url?: string): string {
  return url && /^https:\/\/clck\.ru\/[A-Za-z0-9_-]+$/i.test(url) ? url : '';
}

export const ExclusionsView: React.FC<ExclusionsViewProps> = ({
  exclusions,
  activeGitSource,
  centralFile,
  onCreateExclusion,
  onDeleteExclusion,
  onSyncExclusion,
  onSyncAllExclusions,
  onRefreshExclusions,
}) => {
  // Navigation Sub-Tabs (3 sub-items: Channel, Team, Temporary Test Links)
  const [activeSubTab, setActiveSubTab] = useState<'channel' | 'team' | 'temporary'>('channel');

  // Search & Copy states
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [shorteningId, setShorteningId] = useState<string | null>(null);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [syncAllSuccessMsg, setSyncAllSuccessMsg] = useState<string | null>(null);

  // Live timer tick for accurate countdowns
  const [nowMs, setNowMs] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Standard Team Exclusion Modal State
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [customFileName, setCustomFileName] = useState('');
  const [customContent, setCustomContent] = useState('');
  const [attachToCentral, setAttachToCentral] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Temporary Test Exclusion Modal State (Срок действия, своя строка ключей, по дефолту отвязана от центра)
  const [showTempModal, setShowTempModal] = useState(false);
  const [tempName, setTempName] = useState('');
  const [tempDurationValue, setTempDurationValue] = useState(24);
  const [tempDurationUnit, setTempDurationUnit] = useState<'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'years'>('hours');
  const [tempCustomContent, setTempCustomContent] = useState('');
  const [tempAttachToCentral, setTempAttachToCentral] = useState(false);
  const [tempCustomFileName, setTempCustomFileName] = useState('');
  const [tempNotes, setTempNotes] = useState('');
  const [isSubmittingTemp, setIsSubmittingTemp] = useState(false);

  // Renew / Extend Duration Modal State
  const [renewModalExcl, setRenewModalExcl] = useState<ExclusionSubscription | null>(null);
  const [renewDurationValue, setRenewDurationValue] = useState(24);
  const [renewDurationUnit, setRenewDurationUnit] = useState<'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'years'>('hours');
  const [isSubmittingRenew, setIsSubmittingRenew] = useState(false);

  // Edit Custom Content / Keys Modal State
  const [editContentModalExcl, setEditContentModalExcl] = useState<ExclusionSubscription | null>(null);
  const [editCustomContent, setEditCustomContent] = useState('');
  const [editAttachToCentral, setEditAttachToCentral] = useState(false);
  const [editName, setEditName] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  // Individual Node Editing Modal State (Manual payload modification of a specific exception record)
  const [nodeEditModalExcl, setNodeEditModalExcl] = useState<ExclusionSubscription | null>(null);
  const [selectedNodeIndex, setSelectedNodeIndex] = useState<number | null>(null);
  const [editingNodeContent, setEditingNodeContent] = useState('');
  const [newNodeInput, setNewNodeInput] = useState('');
  const [isSubmittingNode, setIsSubmittingNode] = useState(false);
  const [nodeEditorTab, setNodeEditorTab] = useState<'individual' | 'raw'>('individual');
  const [rawNodesDraft, setRawNodesDraft] = useState('');

  // Channel Exclusion (1 Device + HWID Lock + Anti-sharing) Modal State
  const [showChannelModal, setShowChannelModal] = useState(false);
  const [channelTgId, setChannelTgId] = useState('');
  const [channelUsername, setChannelUsername] = useState('');
  const [channelFirstName, setChannelFirstName] = useState('');
  const [channelFormat, setChannelFormat] = useState<'happ' | 'incy'>('happ');
  const [channelMembership, setChannelMembership] = useState<'member' | 'left'>('member');
  const [channelGraceHours, setChannelGraceHours] = useState(2);
  const [channelGraceMinutes, setChannelGraceMinutes] = useState(0);
  const [channelNotes, setChannelNotes] = useState('');
  const [isSubmittingChannel, setIsSubmittingChannel] = useState(false);

  // Action status indicators
  const [channelActionMsg, setChannelActionMsg] = useState<{ id?: string; text: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [verifyingChannelId, setVerifyingChannelId] = useState<string | null>(null);
  const [unbindingExclId, setUnbindingExclId] = useState<string | null>(null);
  const [resettingWarningId, setResettingWarningId] = useState<string | null>(null);
  const [banningId, setBanningId] = useState<string | null>(null);

  // Connected Clients Modal State (Team Exclusions)
  const [clientsModalExcl, setClientsModalExcl] = useState<ExclusionSubscription | null>(null);
  const [clientActionFeedback, setClientActionFeedback] = useState<string | null>(null);
  const [isAddingClient, setIsAddingClient] = useState(false);
  const [newClientIp, setNewClientIp] = useState('');
  const [newClientNote, setNewClientNote] = useState('');
  const [newClientType, setNewClientType] = useState<'INCY' | 'HAPP' | 'V2Ray' | 'Clash' | 'Sing-Box' | 'Browser'>('INCY');
  const [newClientDeviceId, setNewClientDeviceId] = useState('');

  // QR Modal State
  const [qrModalExcl, setQrModalExcl] = useState<ExclusionSubscription | null>(null);
  const [qrFormat, setQrFormat] = useState<'happ' | 'raw'>('happ');
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  // Filter exclusions by search query
  const filteredExclusions = exclusions.filter((e) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      e.name.toLowerCase().includes(q) ||
      (e.notes && e.notes.toLowerCase().includes(q)) ||
      (e.gitFilePath && e.gitFilePath.toLowerCase().includes(q)) ||
      (e.username && e.username.toLowerCase().includes(q)) ||
      (e.telegramId && e.telegramId.toString().includes(q)) ||
      (e.customContent && e.customContent.toLowerCase().includes(q)) ||
      e.token.toLowerCase().includes(q)
    );
  });

  const channelExclusions = filteredExclusions.filter((e) => Boolean(e.isChannelExclusion));
  const temporaryExclusions = filteredExclusions.filter((e) => !e.isChannelExclusion && Boolean(e.isTemporary));
  const teamExclusions = filteredExclusions.filter((e) => !e.isChannelExclusion && !e.isTemporary);

  const handleCopy = (text: string, key: string) => {
    if (!text) {
      alert('Короткая ссылка clck.ru пока не создана. Нажмите кнопку обновления clck.');
      return;
    }
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleSync = async (id: string) => {
    if (!onSyncExclusion) return;
    setSyncingId(id);
    try {
      await onSyncExclusion(id);
    } finally {
      setSyncingId(null);
    }
  };

  const handleSyncAll = async () => {
    if (!onSyncAllExclusions || isSyncingAll) return;
    setIsSyncingAll(true);
    setSyncAllSuccessMsg(null);
    try {
      const res = await onSyncAllExclusions();
      setSyncAllSuccessMsg(res?.message || 'Все файлы исключений успешно синхронизированы с центральным источником');
      setTimeout(() => setSyncAllSuccessMsg(null), 4000);
    } catch (err: any) {
      alert(err.message || 'Ошибка синхронизации исключений');
    } finally {
      setIsSyncingAll(false);
    }
  };

  const handleRefreshClck = async (id: string) => {
    setShorteningId(id);
    try {
      const res = await shortenExclusionClck(id);
      if (onRefreshExclusions) await onRefreshExclusions();
      if (clientsModalExcl && clientsModalExcl.id === id) {
        setClientsModalExcl(res.exclusion);
      }
    } catch (e: any) {
      alert(e.message || 'Ошибка генерации ссылки clck.ru');
    } finally {
      setShorteningId(null);
    }
  };

  // Channel Exclusion Actions
  const handleCreateChannelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingChannel(true);
    setChannelActionMsg(null);
    try {
      const res = await createChannelExclusion({
        telegramId: channelTgId ? parseInt(channelTgId, 10) : undefined,
        username: channelUsername || undefined,
        firstName: channelFirstName || undefined,
        format: channelFormat,
        channelMembership,
        notes: channelNotes || undefined,
        graceHours: channelGraceHours,
        graceMinutes: channelGraceMinutes,
      });
      if (onRefreshExclusions) await onRefreshExclusions();
      setShowChannelModal(false);
      setChannelTgId('');
      setChannelUsername('');
      setChannelFirstName('');
      setChannelNotes('');
      setChannelActionMsg({
        text: res.message || 'Подписка успешно создана и привязана к 1 устройству!',
        type: 'success',
      });
      setTimeout(() => setChannelActionMsg(null), 5000);
    } catch (err: any) {
      setChannelActionMsg({
        text: err.message || 'Ошибка создания подписки',
        type: 'error',
      });
    } finally {
      setIsSubmittingChannel(false);
    }
  };

  const handleVerifyChannel = async (id: string) => {
    setVerifyingChannelId(id);
    setChannelActionMsg(null);
    try {
      const res = await verifyExclusionChannel(id);
      if (onRefreshExclusions) await onRefreshExclusions();
      setChannelActionMsg({
        id,
        text: res.message,
        type: res.isSubscribed ? 'success' : 'warning',
      });
      setTimeout(() => setChannelActionMsg(null), 5000);
    } catch (err: any) {
      setChannelActionMsg({
        id,
        text: err.message || 'Ошибка проверки канала',
        type: 'error',
      });
    } finally {
      setVerifyingChannelId(null);
    }
  };

  const handleUnbindDevice = async (id: string) => {
    setUnbindingExclId(id);
    setChannelActionMsg(null);
    try {
      const res = await unbindExclusionDevice(id);
      if (onRefreshExclusions) await onRefreshExclusions();
      setChannelActionMsg({
        id,
        text: res.message,
        type: 'success',
      });
      setTimeout(() => setChannelActionMsg(null), 5000);
    } catch (err: any) {
      setChannelActionMsg({
        id,
        text: err.message || 'Ошибка отвязки устройства',
        type: 'error',
      });
    } finally {
      setUnbindingExclId(null);
    }
  };

  const handleResetWarning = async (id: string) => {
    setResettingWarningId(id);
    setChannelActionMsg(null);
    try {
      const res = await resetExclusionSharingWarning(id);
      if (onRefreshExclusions) await onRefreshExclusions();
      setChannelActionMsg({
        id,
        text: res.message,
        type: 'success',
      });
      setTimeout(() => setChannelActionMsg(null), 5000);
    } catch (err: any) {
      setChannelActionMsg({
        id,
        text: err.message || 'Ошибка сброса предупреждения',
        type: 'error',
      });
    } finally {
      setResettingWarningId(null);
    }
  };

  const handleForceBan = async (id: string) => {
    setBanningId(id);
    setChannelActionMsg(null);
    try {
      const res = await forceBanExclusion(id);
      if (onRefreshExclusions) await onRefreshExclusions();
      setChannelActionMsg({
        id,
        text: res.message,
        type: 'warning',
      });
      setTimeout(() => setChannelActionMsg(null), 5000);
    } catch (err: any) {
      setChannelActionMsg({
        id,
        text: err.message || 'Ошибка блокировки',
        type: 'error',
      });
    } finally {
      setBanningId(null);
    }
  };

  // Connected clients handlers
  const handleAddClientSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientsModalExcl) return;
    setIsAddingClient(true);
    setClientActionFeedback(null);
    try {
      const res = await addExclusionClient(clientsModalExcl.id, {
        ip: newClientIp || undefined,
        userAgent: newClientNote || undefined,
        clientType: newClientType,
        deviceId: newClientDeviceId || undefined,
      });
      setClientsModalExcl(res.exclusion);
      setClientActionFeedback('Клиент успешно добавлен в список!');
      setNewClientIp('');
      setNewClientNote('');
      setNewClientDeviceId('');
      if (onRefreshExclusions) await onRefreshExclusions();
      setTimeout(() => setClientActionFeedback(null), 3000);
    } catch (err: any) {
      setClientActionFeedback(err.message || 'Ошибка добавления клиента');
    } finally {
      setIsAddingClient(false);
    }
  };

  const handleDeleteClient = async (clientId: string) => {
    if (!clientsModalExcl) return;
    try {
      const res = await deleteExclusionClient(clientsModalExcl.id, clientId);
      setClientsModalExcl(res.exclusion);
      if (onRefreshExclusions) await onRefreshExclusions();
    } catch (err: any) {
      alert(err.message || 'Ошибка удаления клиента');
    }
  };

  // QR Code generator effect
  useEffect(() => {
    if (!qrModalExcl) {
      setQrDataUrl(null);
      return;
    }

    const incyUrl = getClckShortUrl(qrModalExcl.clckUrl);
    const happUrl = qrModalExcl.happUrl || '';
    const targetUrl = qrFormat === 'happ' ? happUrl : incyUrl;
    if (!targetUrl) {
      setQrDataUrl(null);
      return;
    }

    QRCode.toDataURL(targetUrl, {
      width: 240,
      margin: 1.5,
      color: {
        dark: '#1c1917',
        light: '#ffffff',
      },
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error('QR code generation error:', err));
  }, [qrModalExcl, qrFormat]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onCreateExclusion({
        name: name || undefined,
        notes: notes || undefined,
        fileName: customFileName.trim() || undefined,
        customContent: customContent.trim() || undefined,
        attachToCentral,
      });
      setShowModal(false);
      setName('');
      setNotes('');
      setCustomFileName('');
      setCustomContent('');
      setAttachToCentral(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper: Format countdown remaining time
  const formatRemainingTime = (expiresAt: string | null | undefined) => {
    if (!expiresAt) return { text: 'Бессрочно', isExpired: false, badgeClass: 'bg-stone-100 text-stone-700' };
    const diff = new Date(expiresAt).getTime() - nowMs;
    if (diff <= 0) {
      return { 
        text: 'Срок действия истек', 
        isExpired: true, 
        badgeClass: 'bg-rose-100 text-rose-800 border-rose-300' 
      };
    }
    const totalSeconds = Math.floor(diff / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    let timeStr = '';
    if (days > 0) {
      timeStr = `${days} дн. ${hours} ч. ${minutes} мин.`;
    } else if (hours > 0) {
      timeStr = `${hours} ч. ${minutes} мин. ${seconds} сек.`;
    } else if (minutes > 0) {
      timeStr = `${minutes} мин. ${seconds} сек.`;
    } else {
      timeStr = `${seconds} сек.`;
    }
    return {
      text: `Осталось: ${timeStr}`,
      isExpired: false,
      badgeClass: days > 0 
        ? 'bg-emerald-50 text-emerald-800 border-emerald-300' 
        : 'bg-amber-50 text-amber-800 border-amber-300'
    };
  };

  const handleCreateTempSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingTemp(true);
    try {
      await createTemporaryExclusion({
        name: tempName.trim() || undefined as any,
        durationValue: Number(tempDurationValue) || 24,
        durationUnit: tempDurationUnit,
        customContent: tempCustomContent,
        attachToCentral: tempAttachToCentral,
        fileName: tempCustomFileName.trim() || undefined,
        notes: tempNotes.trim() || undefined,
      });
      if (onRefreshExclusions) await onRefreshExclusions();
      setShowTempModal(false);
      setTempName('');
      setTempCustomContent('');
      setTempAttachToCentral(false);
      setTempCustomFileName('');
      setTempNotes('');
      setChannelActionMsg({
        text: 'Временная тестовая ссылка успешно создана и файл сохранен в репозитории subs/!',
        type: 'success',
      });
      setTimeout(() => setChannelActionMsg(null), 5000);
    } catch (err: any) {
      alert(err.message || 'Ошибка создания временной ссылки');
    } finally {
      setIsSubmittingTemp(false);
    }
  };

  const handleRenewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renewModalExcl) return;
    setIsSubmittingRenew(true);
    try {
      const res = await renewTemporaryExclusion(renewModalExcl.id, {
        durationValue: Number(renewDurationValue) || 1,
        durationUnit: renewDurationUnit,
      });
      if (onRefreshExclusions) await onRefreshExclusions();
      setRenewModalExcl(null);
      setChannelActionMsg({
        text: res.message || 'Срок действия тестовой ссылки успешно продлен!',
        type: 'success',
      });
      setTimeout(() => setChannelActionMsg(null), 5000);
    } catch (err: any) {
      alert(err.message || 'Ошибка продления ссылки');
    } finally {
      setIsSubmittingRenew(false);
    }
  };

  const handleOpenEditContentModal = async (excl: ExclusionSubscription) => {
    setEditContentModalExcl(excl);
    setEditName(excl.name);
    setEditNotes(excl.notes || '');
    // Default to false (Full Replacement mode), matching requirement of replacing entire file content
    setEditAttachToCentral(Boolean(excl.attachToCentral === true));

    const directContent = excl.customContent || (excl.customNodes && excl.customNodes.join('\n')) || '';
    setEditCustomContent(directContent);

    // If no direct custom content, fetch the active file content from the server
    if (!directContent.trim()) {
      try {
        const fileData = await fetchExclusionFileContent(excl.id);
        if (fileData.content) {
          setEditCustomContent(fileData.content);
        }
      } catch {
        // Fallback silently
      }
    }
  };

  const handleEditContentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editContentModalExcl) return;
    setIsSubmittingEdit(true);
    try {
      const res = await updateExclusionContent(editContentModalExcl.id, {
        name: editName,
        notes: editNotes,
        customContent: editCustomContent,
        attachToCentral: editAttachToCentral,
        fullReplace: !editAttachToCentral, // Full replacement mechanism
      });
      if (onRefreshExclusions) await onRefreshExclusions();
      setEditContentModalExcl(null);
      setChannelActionMsg({
        text: res.message || 'Содержимое файла исключения успешно полностью заменено и зафиксировано в репозитории!',
        type: 'success',
      });
      setTimeout(() => setChannelActionMsg(null), 5000);
    } catch (err: any) {
      alert(err.message || 'Ошибка сохранения настроек');
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  // Explicit handler to update individual node contents / internal payload of a specific exception record
  const updateExceptionNode = async (
    exclusionId: string,
    payload: {
      nodeIndex?: number;
      nodeContent?: string;
      action?: 'update' | 'add' | 'delete' | 'set_all';
      fullPayload?: string;
      attachToCentral?: boolean;
      name?: string;
      notes?: string;
    }
  ) => {
    setIsSubmittingNode(true);
    try {
      const res = await apiUpdateExceptionNode(exclusionId, payload);
      if (onRefreshExclusions) await onRefreshExclusions();
      if (nodeEditModalExcl && nodeEditModalExcl.id === exclusionId) {
        setNodeEditModalExcl(res.exclusion);
        if (payload.action === 'update' || payload.action === 'add') {
          setSelectedNodeIndex(null);
          setEditingNodeContent('');
          setNewNodeInput('');
        }
      }
      setChannelActionMsg({
        id: exclusionId,
        text: res.message || 'Узел исключения успешно сохранен!',
        type: 'success',
      });
      setTimeout(() => setChannelActionMsg(null), 4000);
      return res;
    } catch (err: any) {
      setChannelActionMsg({
        id: exclusionId,
        text: err.message || 'Ошибка обновления узла исключения',
        type: 'error',
      });
      throw err;
    } finally {
      setIsSubmittingNode(false);
    }
  };

  const totalCentralNodes = centralFile?.nodesCount || (centralFile?.content ? centralFile.content.split('\n').filter(l => l.trim().length > 0 && !l.startsWith('#')).length : 0);
  const repoName = activeGitSource?.repository || 'GitVerse / Репозиторий подписок';
  const repoBranch = activeGitSource?.branch || 'master';

  return (
    <div id="exclusions-view" className="space-y-6">
      {/* Overview Banner */}
      <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          <div className="flex items-start space-x-4">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <ShieldOff className="h-6 w-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold text-stone-900">
                  Раздел «Исключения»
                </h2>
                <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-purple-50 text-purple-800 border border-purple-200 flex items-center space-x-1">
                  <Sparkles className="h-3 w-3 text-purple-600" />
                  <span>Канал + 1 устройство</span>
                </span>
                <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center space-x-1">
                  <Radio className="h-3 w-3 text-emerald-600" />
                  <span>Центральный источник</span>
                </span>
                <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-sky-50 text-sky-800 border border-sky-200 flex items-center space-x-1">
                  <ShieldCheck className="h-3 w-3 text-sky-600" />
                  <span>Анти-шеринг и HWID Lock</span>
                </span>
              </div>
              <p className="text-xs text-stone-500 mt-1.5 max-w-3xl leading-relaxed">
                Здесь можно создать два типа исключений: подписки <strong>для 1 устройства из центрального источника</strong> (для подписчиков канала, не сумевших получить в боте) с жесткой привязкой HWID, расширенным сценарием 2 строки и таймером до бана, либо <strong>командные подписки</strong> без лимитов.
              </p>
              
              {/* Repository info strip */}
              <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-stone-600">
                <div className="flex items-center space-x-1.5 bg-stone-50 px-2.5 py-1 rounded-lg border border-stone-200">
                  <FolderGit2 className="h-3.5 w-3.5 text-stone-500" />
                  <span>Репозиторий: <strong className="text-stone-800 font-mono">{repoName}</strong> (ветка: <strong className="text-stone-800 font-mono">{repoBranch}</strong>)</span>
                </div>
                <div className="flex items-center space-x-1.5 bg-stone-50 px-2.5 py-1 rounded-lg border border-stone-200">
                  <Radio className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Центральный источник: <strong className="text-stone-800">{totalCentralNodes} узлов</strong></span>
                </div>
                <div className="flex items-center space-x-1.5 bg-stone-50 px-2.5 py-1 rounded-lg border border-stone-200">
                  <Sparkles className="h-3.5 w-3.5 text-purple-600" />
                  <span>Из канала (1 устр.): <strong className="text-stone-800">{exclusions.filter(e => e.isChannelExclusion).length}</strong></span>
                </div>
                <div className="flex items-center space-x-1.5 bg-stone-50 px-2.5 py-1 rounded-lg border border-stone-200">
                  <Timer className="h-3.5 w-3.5 text-amber-600" />
                  <span>Временных (тестовых): <strong className="text-stone-800">{temporaryExclusions.length}</strong></span>
                </div>
                <div className="flex items-center space-x-1.5 bg-stone-50 px-2.5 py-1 rounded-lg border border-stone-200">
                  <Users className="h-3.5 w-3.5 text-blue-600" />
                  <span>Командных: <strong className="text-stone-800">{teamExclusions.length}</strong></span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {activeSubTab === 'channel' ? (
              <button
                id="btn-create-channel-exclusion"
                onClick={() => setShowChannelModal(true)}
                className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                <Sparkles className="h-4 w-4 text-purple-200" />
                <span>Выдать подписку из центр. источника (1 устр.)</span>
              </button>
            ) : activeSubTab === 'temporary' ? (
              <button
                id="btn-create-temporary-exclusion"
                onClick={() => setShowTempModal(true)}
                className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                <Timer className="h-4 w-4 text-amber-200" />
                <span>Создать тестовую ссылку (с таймером)</span>
              </button>
            ) : (
              <button
                onClick={() => setShowModal(true)}
                className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                <Plus className="h-4 w-4 text-amber-400" />
                <span>Создать командное исключение</span>
              </button>
            )}

            {onSyncAllExclusions && exclusions.length > 0 && (
              <button
                type="button"
                onClick={handleSyncAll}
                disabled={isSyncingAll}
                className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold border border-stone-300 transition-colors disabled:opacity-50 cursor-pointer"
                title="Перезаписать все файлы исключений в репозитории последними узлами центрального источника"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isSyncingAll ? 'animate-spin text-amber-600' : 'text-stone-500'}`} />
                <span>{isSyncingAll ? 'Синхронизация...' : 'Синхронизировать все'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Global Action Feedback Notification */}
        {channelActionMsg && (
          <div className={`mt-4 p-3 rounded-xl border flex items-center space-x-2 text-xs font-semibold ${
            channelActionMsg.type === 'success' 
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
              : channelActionMsg.type === 'warning'
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}>
            {channelActionMsg.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
            )}
            <span>{channelActionMsg.text}</span>
          </div>
        )}

        {/* Sync all success notification */}
        {syncAllSuccessMsg && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center space-x-2 text-xs font-semibold text-emerald-800">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{syncAllSuccessMsg}</span>
          </div>
        )}

        {/* Navigation Sub-Tabs */}
        <div className="flex items-center space-x-2 mt-5 pt-4 border-t border-stone-100">
          <button
            id="tab-channel-exclusions"
            onClick={() => setActiveSubTab('channel')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 cursor-pointer ${
              activeSubTab === 'channel'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Исключения из канала (1 устройство, привязка к HWID)</span>
            <span className={`px-2 py-0.2 rounded-full text-[10px] font-bold ${
              activeSubTab === 'channel' ? 'bg-purple-800 text-purple-100' : 'bg-stone-200 text-stone-700'
            }`}>
              {channelExclusions.length}
            </span>
          </button>

          <button
            id="tab-temporary-exclusions"
            onClick={() => setActiveSubTab('temporary')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 cursor-pointer ${
              activeSubTab === 'temporary'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            <Timer className="h-3.5 w-3.5" />
            <span>Временные исключения (тестовые ссылки с таймером)</span>
            <span className={`px-2 py-0.2 rounded-full text-[10px] font-bold ${
              activeSubTab === 'temporary' ? 'bg-amber-800 text-amber-100' : 'bg-stone-200 text-stone-700'
            }`}>
              {temporaryExclusions.length}
            </span>
          </button>

          <button
            id="tab-team-exclusions"
            onClick={() => setActiveSubTab('team')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 cursor-pointer ${
              activeSubTab === 'team'
                ? 'bg-stone-900 text-white shadow-xs'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            <span>Обычные исключения (Командные, без лимитов)</span>
            <span className={`px-2 py-0.2 rounded-full text-[10px] font-bold ${
              activeSubTab === 'team' ? 'bg-stone-800 text-stone-200' : 'bg-stone-200 text-stone-700'
            }`}>
              {teamExclusions.length}
            </span>
          </button>
        </div>
      </div>

      {/* Search Bar */}
      {exclusions.length > 0 && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white border border-stone-200 rounded-xl px-4 py-3 shadow-xs">
          <div className="relative flex-1 max-w-md">
            <Search className="h-4 w-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по нику, ID, названию, файлу, ключам или токену..."
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-stone-200 bg-stone-50 text-stone-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
          </div>
          <div className="text-xs text-stone-500 flex items-center space-x-2">
            <span>
              Показано: <strong>{activeSubTab === 'channel' ? channelExclusions.length : activeSubTab === 'temporary' ? temporaryExclusions.length : teamExclusions.length}</strong> {activeSubTab === 'channel' ? 'исключений канала' : activeSubTab === 'temporary' ? 'временных ссылок' : 'командных'}
            </span>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 1: CHANNEL EXCLUSIONS (1 Device, HWID Lock, Channel requirement)  */}
      {/* ========================================================================= */}
      {activeSubTab === 'channel' && (
        <div className="space-y-4">
          {/* Detailed Policy Card for Channel Exclusions */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-50 via-indigo-50/50 to-white border border-purple-200 text-xs text-purple-950 space-y-2">
            <div className="flex items-center space-x-2 font-bold text-sm text-purple-900">
              <Sparkles className="h-4 w-4 text-purple-600" />
              <span>Правила подписки для 1 устройства из центрального источника:</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1 text-[11px] leading-relaxed">
              <div className="p-2.5 bg-white/80 rounded-xl border border-purple-100">
                <span className="font-bold text-purple-900 block mb-0.5">1. Условие подписки на канал</span>
                Человек получает точно такую же подписку из центр. источника, как и все. Если он <strong>отписан от канала</strong> — подписка отвязывается от центрального источника и активируется <strong>Строка 1</strong> (заглушка).
              </div>
              <div className="p-2.5 bg-white/80 rounded-xl border border-purple-100">
                <span className="font-bold text-purple-900 block mb-0.5">2. Жесткая привязка HWID (1 устр.)</span>
                При первом импорте в HAPP или INCY устройство (HWID) закрепляется <strong>только за ним одним</strong>. В списке видно, к кому и какому клиенту привязана подписка.
              </div>
              <div className="p-2.5 bg-white/80 rounded-xl border border-purple-100">
                <span className="font-bold text-purple-900 block mb-0.5">3. Защита от передачи и таймер бана</span>
                Если скинет другому: у 2-го она <strong>не включится</strong>, 1-му выдается <strong>1 предупреждение</strong> и включается <strong>Строка 2</strong> с таймером на удаление 2-м лицом до перманентного бана!
              </div>
            </div>
          </div>

          {/* Cards of Channel Exclusions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {channelExclusions.length === 0 ? (
              <div className="col-span-full bg-white border border-stone-200 rounded-2xl p-8 text-center text-stone-500">
                <Sparkles className="h-10 w-10 text-purple-300 mx-auto mb-2" />
                <p className="text-sm font-semibold text-stone-700">
                  {exclusions.filter(e => e.isChannelExclusion).length === 0 
                    ? 'Нет созданных подписок для подписчиков канала' 
                    : 'Ничего не найдено по вашему поисковому запросу'}
                </p>
                <p className="text-xs text-stone-400 mt-1 max-w-md mx-auto">
                  Нажмите кнопку «Выдать подписку из центр. источника (1 устр.)», чтобы вручную предоставить подписку человеку, подписанному на канал, но не сумевшему получить её через бота.
                </p>
                <button
                  onClick={() => setShowChannelModal(true)}
                  className="mt-4 inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shadow-xs cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Создать первое исключение для канала</span>
                </button>
              </div>
            ) : (
              channelExclusions.map((excl) => {
                const directSubUrl = `${window.location.origin}/api/sub/${excl.token}`;
                const rawUrl = excl.gitRawUrl || directSubUrl;
                const happUrl = excl.happUrl || '';
                const incyUrl = getClckShortUrl(excl.clckUrl);
                const filePathDisplay = excl.gitFilePath || `subs/${excl.token}.txt`;
                const isSubscribed = excl.channelMembership !== 'left';
                const hasDevice = Boolean(excl.boundDevice);
                const hasSharingWarning = Boolean((excl.sharingWarningCount && excl.sharingWarningCount > 0) || excl.secondDeviceInfo);
                const deadlineDate = excl.sharingGraceDeadlineAt ? new Date(excl.sharingGraceDeadlineAt) : null;
                const isDeadlineExpired = deadlineDate ? Date.now() > deadlineDate.getTime() : false;
                const minsLeft = deadlineDate && !isDeadlineExpired ? Math.max(1, Math.round((deadlineDate.getTime() - Date.now()) / 60000)) : 0;

                return (
                  <div
                    key={excl.id}
                    className={`bg-white border rounded-2xl p-5 shadow-xs flex flex-col justify-between space-y-4 transition-all ${
                      hasSharingWarning
                        ? 'border-rose-300 ring-1 ring-rose-200'
                        : isSubscribed
                        ? 'border-stone-200 hover:border-purple-300'
                        : 'border-amber-300 bg-amber-50/20'
                    }`}
                  >
                    <div className="space-y-3">
                      {/* Top Header */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center space-x-2.5 min-w-0">
                          <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${
                            hasSharingWarning 
                              ? 'bg-rose-100 text-rose-700' 
                              : isSubscribed 
                              ? 'bg-purple-100 text-purple-700' 
                              : 'bg-amber-100 text-amber-700'
                          }`}>
                            {hasSharingWarning ? <AlertTriangle className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-bold text-stone-900 text-sm truncate" title={excl.name}>
                              {excl.name}
                            </h3>
                            <div className="flex items-center space-x-2 text-[10px] text-stone-500 font-mono">
                              {excl.username && <span className="text-purple-700 font-bold">@{excl.username}</span>}
                              {excl.telegramId && <span>TG ID: {excl.telegramId}</span>}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-800 border border-purple-200 text-[10px] font-bold flex items-center space-x-1">
                            <Sparkles className="h-3 w-3 text-purple-600" />
                            <span>Канал (1 устр.)</span>
                          </span>
                        </div>
                      </div>

                      {/* Notes / Reason */}
                      <div className="text-xs text-stone-600 bg-stone-50 p-2.5 rounded-xl border border-stone-100">
                        {excl.notes || 'Выдача из центрального источника (1 устр. + канал)'}
                      </div>

                      {/* Channel Membership Strip & Action */}
                      <div className={`p-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                        isSubscribed 
                          ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950' 
                          : 'bg-rose-50 border-rose-200 text-rose-950'
                      }`}>
                        <div className="flex items-center space-x-2 min-w-0">
                          {isSubscribed ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                          ) : (
                            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                          )}
                          <div className="text-[11px] leading-tight">
                            <span className="font-bold block">
                              {isSubscribed ? 'Подписан на канал ✅' : 'Не подписан на канал ❌'}
                            </span>
                            <span className="text-[10px] opacity-80">
                              {isSubscribed
                                ? 'Центральные узлы активны и поступают в подписку'
                                : 'Подписка отвязана от центрального источника (активирована Строка 1)'}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleVerifyChannel(excl.id)}
                          disabled={verifyingChannelId === excl.id}
                          className="px-2.5 py-1 rounded-lg bg-white border border-stone-200 text-stone-700 hover:bg-stone-50 text-[11px] font-semibold flex items-center space-x-1 shrink-0 cursor-pointer disabled:opacity-50"
                          title="Проверить статус участника в Telegram канале через Bot API"
                        >
                          <RefreshCw className={`h-3 w-3 ${verifyingChannelId === excl.id ? 'animate-spin text-purple-600' : 'text-stone-500'}`} />
                          <span>{verifyingChannelId === excl.id ? 'Проверка...' : 'Проверить'}</span>
                        </button>
                      </div>

                      {/* Device HWID Binding Strip */}
                      <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-200 text-xs space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-stone-800 text-[11px] flex items-center space-x-1.5">
                            {hasDevice ? (
                              <>
                                <Lock className="h-3.5 w-3.5 text-indigo-600" />
                                <span className="text-indigo-900 font-bold">Привязано строго к 1 устройству</span>
                              </>
                            ) : (
                              <>
                                <Unlock className="h-3.5 w-3.5 text-amber-600" />
                                <span className="text-amber-900 font-bold">Ожидает первого подключения (HWID)</span>
                              </>
                            )}
                          </span>

                          {hasDevice && (
                            <button
                              type="button"
                              onClick={() => handleUnbindDevice(excl.id)}
                              disabled={unbindingExclId === excl.id}
                              className="text-[10px] text-rose-600 hover:text-rose-800 font-bold inline-flex items-center space-x-1 hover:underline cursor-pointer disabled:opacity-50"
                              title="Отвязать HWID устройство, чтобы человек мог привязать новый телефон или компьютер"
                            >
                              <Unlock className="h-2.5 w-2.5" />
                              <span>{unbindingExclId === excl.id ? 'Отвязка...' : 'Отвязать HWID'}</span>
                            </button>
                          )}
                        </div>

                        {hasDevice && excl.boundDevice ? (
                          <div className="grid grid-cols-2 gap-2 text-[10px] text-stone-600 pt-0.5">
                            <div className="truncate" title={excl.boundDevice.clientName}>
                              <span className="text-stone-400">Клиент: </span>
                              <strong>{excl.boundDevice.clientName || 'VPN Клиент'}</strong>
                            </div>
                            <div className="truncate font-mono" title={excl.boundDevice.deviceId}>
                              <span className="text-stone-400">HWID: </span>
                              <strong>{excl.boundDevice.deviceId?.substring(0, 14)}...</strong>
                            </div>
                            <div className="truncate font-mono">
                              <span className="text-stone-400">IP: </span>
                              <strong>{excl.boundDevice.ip || '127.0.0.1'}</strong>
                            </div>
                            <div className="truncate">
                              <span className="text-stone-400">Привязано: </span>
                              <strong>{new Date(excl.boundDevice.boundAt).toLocaleDateString('ru-RU')}</strong>
                            </div>
                          </div>
                        ) : (
                          <div className="text-[10px] text-amber-800 leading-snug">
                            При первом импорте ссылки в HAPP / INCY и обращении к ней HWID зафиксируется автоматически за этим пользователем.
                          </div>
                        )}
                      </div>

                      {/* Anti-Sharing Warning & Row 2 Grace Period Box */}
                      {hasSharingWarning ? (
                        <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-950 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-xs text-rose-800 flex items-center space-x-1.5">
                              <AlertTriangle className="h-4 w-4 text-rose-600" />
                              <span>Зафиксирована передача 2-му устройству! (Предупреждение 1/1)</span>
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 bg-rose-200 text-rose-900 rounded-md">
                              Строка 2 активна
                            </span>
                          </div>

                          <div className="text-[11px] text-rose-900/90 leading-snug">
                            У <strong>2-го устройства</strong> подписка <strong>не включилась</strong> (заблокирована). У <strong>1-го пользователя</strong> включен сценарий из 2 строки.
                          </div>

                          {excl.secondDeviceInfo && (
                            <div className="text-[10px] bg-white/70 p-2 rounded-lg border border-rose-200 font-mono text-rose-900 space-y-0.5">
                              <div>Попытка 2-го: {excl.secondDeviceInfo.userAgent?.substring(0, 45) || 'Неизвестный клиент'}</div>
                              <div>IP: {excl.secondDeviceInfo.ip} • Дата: {new Date(excl.secondDeviceInfo.attemptedAt).toLocaleTimeString('ru-RU')}</div>
                            </div>
                          )}

                          {/* Countdown Timer to BAN */}
                          <div className="p-2 rounded-lg bg-purple-100 border border-purple-200 text-purple-950 flex items-center justify-between text-[11px]">
                            <div className="flex items-center space-x-1.5">
                              <Timer className="h-3.5 w-3.5 text-purple-700 animate-pulse" />
                              <span className="font-bold">
                                {isDeadlineExpired ? (
                                  <span className="text-rose-700">⛔ СРОК ИСТЕК: второй не удалил (БАН)!</span>
                                ) : (
                                  <span>Срок на удаление 2-м лицом: <strong>{minsLeft} мин.</strong> (до бана)</span>
                                )}
                              </span>
                            </div>
                            {deadlineDate && (
                              <span className="text-[10px] text-purple-800 font-mono">
                                до {deadlineDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                          </div>

                          {/* Controls to reset warning or force ban */}
                          <div className="flex items-center justify-between pt-1 gap-2">
                            <button
                              type="button"
                              onClick={() => handleResetWarning(excl.id)}
                              disabled={resettingWarningId === excl.id}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center space-x-1 cursor-pointer disabled:opacity-50"
                              title="Сбросить предупреждение и вернуть подписку в штатный режим, если второй пользователь удалил её"
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              <span>{resettingWarningId === excl.id ? 'Сброс...' : 'Сбросить (второй удалил)'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleForceBan(excl.id)}
                              disabled={banningId === excl.id}
                              className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold flex items-center space-x-1 cursor-pointer disabled:opacity-50"
                              title="Принудительно отправить пользователя в перманентный бан (Строка 3)"
                            >
                              <Ban className="h-3 w-3" />
                              <span>{banningId === excl.id ? 'Бан...' : 'Забанить (Строка 3)'}</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="p-2 rounded-xl bg-purple-50/50 border border-purple-100 text-[11px] text-purple-900 flex items-center justify-between">
                          <span className="flex items-center space-x-1.5">
                            <Shield className="h-3.5 w-3.5 text-purple-600" />
                            <span>Анти-шеринг активен (таймер бана при передаче: {excl.sharingGraceHours ?? 2}ч {excl.sharingGraceMinutes ?? 0}м)</span>
                          </span>
                        </div>
                      )}

                      {/* Links Box: HAPP & INCY */}
                      <div className="space-y-2 pt-1">
                        {/* HAPP Link */}
                        <div className="p-2.5 rounded-xl bg-purple-50/60 border border-purple-200">
                          <div className="flex items-center justify-between text-[11px] font-bold text-purple-950 mb-1">
                            <span className="flex items-center space-x-1">
                              <Sparkles className="h-3.5 w-3.5 text-purple-600" />
                              <span>HAPP (crypt4) - 1 устр.:</span>
                            </span>
                            <div className="flex items-center space-x-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setQrModalExcl(excl);
                                  setQrFormat('happ');
                                }}
                                className="px-2 py-0.5 rounded bg-white border border-purple-300 text-purple-900 hover:bg-purple-100 flex items-center space-x-1 cursor-pointer text-[10px]"
                              >
                                <QrCode className="h-2.5 w-2.5" />
                                <span>QR</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCopy(happUrl, `happ_${excl.id}`)}
                                className="px-2 py-0.5 rounded bg-white border border-purple-300 text-purple-900 hover:bg-purple-100 flex items-center space-x-1 cursor-pointer text-[10px]"
                              >
                                {copiedKey === `happ_${excl.id}` ? (
                                  <>
                                    <Check className="h-2.5 w-2.5 text-emerald-600" />
                                    <span className="font-bold text-emerald-700">Скопировано</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="h-2.5 w-2.5" />
                                    <span>Копировать</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                          <div className="font-mono text-[10px] text-stone-700 truncate select-all">{happUrl}</div>
                        </div>

                        {/* INCY / clck.ru Link */}
                        <div className="p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-200">
                          <div className="flex items-center justify-between text-[11px] font-bold text-emerald-950 mb-1">
                            <span className="flex items-center space-x-1">
                              <GitBranch className="h-3.5 w-3.5 text-emerald-600" />
                              <span>INCY / VLESS (clck.ru) - 1 устр.:</span>
                            </span>
                            <div className="flex items-center space-x-1">
                              <button
                                type="button"
                                onClick={() => handleRefreshClck(excl.id)}
                                disabled={shorteningId === excl.id}
                                className="px-2 py-0.5 rounded bg-white border border-emerald-300 text-emerald-900 hover:bg-emerald-100 flex items-center space-x-1 cursor-pointer text-[10px]"
                              >
                                <RefreshCw className={`h-2.5 w-2.5 ${shorteningId === excl.id ? 'animate-spin' : ''}`} />
                                <span>clck</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setQrModalExcl(excl);
                                  setQrFormat('raw');
                                }}
                                className="px-2 py-0.5 rounded bg-white border border-emerald-300 text-emerald-900 hover:bg-emerald-100 flex items-center space-x-1 cursor-pointer text-[10px]"
                              >
                                <QrCode className="h-2.5 w-2.5" />
                                <span>QR</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCopy(incyUrl, `incy_${excl.id}`)}
                                className="px-2 py-0.5 rounded bg-white border border-emerald-300 text-emerald-900 hover:bg-emerald-100 flex items-center space-x-1 cursor-pointer text-[10px]"
                              >
                                {copiedKey === `incy_${excl.id}` ? (
                                  <>
                                    <Check className="h-2.5 w-2.5 text-emerald-600" />
                                    <span className="font-bold text-emerald-700">Скопировано</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="h-2.5 w-2.5" />
                                    <span>Копировать</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                          <div className="font-mono text-[10px] text-stone-700 truncate select-all">{incyUrl}</div>
                        </div>
                      </div>
                    </div>

                    {/* Card Footer */}
                    <div className="flex items-center justify-between pt-3 border-t border-stone-100 text-xs">
                      <div className="flex items-center space-x-2">
                        <a
                          href={rawUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-stone-600 hover:text-stone-900 inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg border border-stone-200 bg-stone-50 hover:bg-stone-100 font-semibold"
                        >
                          <ExternalLink className="h-3 w-3 text-stone-500" />
                          <span>RAW</span>
                        </a>

                        <button
                          type="button"
                          onClick={() => handleOpenEditContentModal(excl)}
                          className="text-stone-600 hover:text-stone-900 inline-flex items-center space-x-1 border border-stone-200 rounded-lg px-2.5 py-1 bg-stone-50 hover:bg-stone-100 font-semibold cursor-pointer"
                          title="Редактировать содержимое файла исключения (полная замена или привязка к центру)"
                        >
                          <FileCode className="h-3.5 w-3.5 text-stone-500" />
                          <span>Ключи</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setNodeEditModalExcl(excl);
                            setSelectedNodeIndex(null);
                            setEditingNodeContent('');
                            setNewNodeInput('');
                            setRawNodesDraft(excl.customContent || (excl.customNodes && excl.customNodes.join('\n')) || '');
                            setNodeEditorTab('individual');
                          }}
                          className="text-purple-700 hover:text-purple-900 inline-flex items-center space-x-1 border border-purple-200 rounded-lg px-2.5 py-1 bg-purple-50 hover:bg-purple-100 font-semibold cursor-pointer text-xs"
                          title="Ручное редактирование отдельных узлов и полезной нагрузки исключения"
                        >
                          <Layers className="h-3.5 w-3.5 text-purple-600" />
                          <span>Узлы ({excl.customNodes?.length || 0})</span>
                        </button>

                        {onSyncExclusion && (
                          <button
                            type="button"
                            onClick={() => handleSync(excl.id)}
                            disabled={syncingId === excl.id}
                            className="text-stone-600 hover:text-stone-900 inline-flex items-center space-x-1 border border-stone-200 rounded-lg px-2.5 py-1 bg-stone-50 hover:bg-stone-100 font-semibold cursor-pointer disabled:opacity-50"
                            title="Синхронизировать файл с центральным источником в GitVerse"
                          >
                            <RefreshCw className={`h-3 w-3 ${syncingId === excl.id ? 'animate-spin text-purple-600' : 'text-stone-500'}`} />
                            <span>{syncingId === excl.id ? 'Синхр...' : 'Синхронизировать'}</span>
                          </button>
                        )}
                      </div>

                      {confirmDeleteId === excl.id ? (
                        <div className="flex items-center space-x-1 bg-rose-50 border border-rose-200 px-2 py-1 rounded-lg">
                          <span className="text-[11px] font-semibold text-rose-700">Удалить?</span>
                          <button
                            type="button"
                            onClick={async () => {
                              setConfirmDeleteId(null);
                              await onDeleteExclusion(excl.id);
                            }}
                            className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold"
                          >
                            Да
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-1.5 py-0.5 rounded text-stone-500 hover:text-stone-700 text-[11px]"
                          >
                            Отмена
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(excl.id)}
                          className="text-rose-600 hover:text-rose-700 inline-flex items-center space-x-1 px-2 py-1 hover:bg-rose-50 rounded-lg font-semibold cursor-pointer"
                          title="Удалить подписку"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Удалить</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 2: TEAM EXCLUSIONS (No limits, no channel checks)                  */}
      {/* ========================================================================= */}
      {activeSubTab === 'team' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {teamExclusions.length === 0 ? (
              <div className="col-span-full bg-white border border-stone-200 rounded-2xl p-8 text-center text-stone-500">
                <ShieldOff className="h-10 w-10 text-stone-300 mx-auto mb-2" />
                <p className="text-sm font-semibold text-stone-700">
                  {exclusions.filter(e => !e.isChannelExclusion).length === 0 
                    ? 'Нет созданных командных подписок-исключений' 
                    : 'Ничего не найдено по вашему запросу'}
                </p>
                <p className="text-xs text-stone-400 mt-1 max-w-md mx-auto">
                  Нажмите «Создать командное исключение», чтобы создать постоянный файл в репозитории без лимитов на устройства и без проверки каналов.
                </p>
              </div>
            ) : (
              teamExclusions.map((excl) => {
                const directSubUrl = `${window.location.origin}/api/sub/${excl.token}`;
                const rawUrl = excl.gitRawUrl || directSubUrl;
                const happUrl = excl.happUrl || '';
                const incyUrl = getClckShortUrl(excl.clckUrl);
                const filePathDisplay = excl.gitFilePath || `subs/${excl.token}.txt`;
                const customLines = (excl.customContent || (excl.customNodes && excl.customNodes.join('\n')) || '').trim();
                const customKeysCount = customLines ? customLines.split('\n').filter(l => l.trim() && !l.trim().startsWith('#')).length : 0;

                return (
                  <div
                    key={excl.id}
                    className="bg-white border border-stone-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between space-y-4 hover:border-amber-300 transition-colors"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center space-x-2 min-w-0">
                          <div className="h-8 w-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                            <KeyRound className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-bold text-stone-900 text-sm truncate" title={excl.name}>{excl.name}</h3>
                            <div className="flex items-center space-x-2 text-[10px] text-stone-500 font-mono">
                              <span>{excl.token}</span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold flex items-center space-x-1">
                            <InfinityIcon className="h-3 w-3" />
                            <span>Бессрочная / Без лимитов</span>
                          </span>
                        </div>
                      </div>

                      <p className="text-xs text-stone-600 mt-2 bg-stone-50/70 p-2.5 rounded-xl border border-stone-100">
                        {excl.notes || 'Без описания (подписка для команды/партнёров)'}
                      </p>

                      <div className="mt-3 text-[11px] text-stone-500 grid grid-cols-2 gap-2 bg-stone-50/50 p-2 rounded-lg border border-stone-100">
                        <div className="flex items-center space-x-1.5 truncate" title={`Создано: ${new Date(excl.createdAt).toLocaleString('ru-RU')}`}>
                          <Clock className="h-3 w-3 text-stone-400 shrink-0" />
                          <span className="truncate">Создано: {new Date(excl.createdAt).toLocaleDateString('ru-RU')}</span>
                        </div>

                        <div className="flex items-center space-x-1.5 truncate font-mono text-stone-600" title={`Файл в репозитории: ${filePathDisplay}`}>
                          <FileCode className="h-3 w-3 text-amber-600 shrink-0" />
                          <span className="truncate">{filePathDisplay}</span>
                        </div>

                        <div className="flex items-center space-x-1.5 truncate text-emerald-700 font-medium">
                          <Layers className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                          <span>
                            {customKeysCount > 0
                              ? `${customKeysCount} своих узлов ${excl.attachToCentral ? `+ ${totalCentralNodes} из центра` : '(автономно)'}`
                              : `${totalCentralNodes} узлов из центрального`}
                          </span>
                        </div>

                        <div className="flex items-center space-x-1.5 truncate text-stone-500" title={excl.lastSyncAt ? `Синхронизировано: ${new Date(excl.lastSyncAt).toLocaleString('ru-RU')}` : 'Синхронизировано при создании'}>
                          <RefreshCw className="h-3 w-3 text-sky-600 shrink-0" />
                          <span className="truncate">
                            Синхр: {excl.lastSyncAt ? new Date(excl.lastSyncAt).toLocaleTimeString('ru-RU') : 'при создании'}
                          </span>
                        </div>
                      </div>

                      {/* Links Box */}
                      <div className="mt-3.5 space-y-2.5">
                        {/* Happ Link (crypt4) */}
                        <div className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200/90">
                          <div className="flex items-center justify-between text-[11px] font-bold text-amber-900 mb-1">
                            <span className="flex items-center space-x-1.5">
                              <Sparkles className="h-3.5 w-3.5 text-amber-600" />
                              <span>Формат HAPP (crypt4):</span>
                            </span>
                            <div className="flex items-center space-x-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setQrModalExcl(excl);
                                  setQrFormat('happ');
                                }}
                                className="px-2 py-0.5 rounded-md bg-white border border-amber-300 text-amber-900 hover:bg-amber-100 flex items-center space-x-1 cursor-pointer"
                                title="Показать QR-код"
                              >
                                <QrCode className="h-3 w-3 text-amber-700" />
                                <span className="text-[10px]">QR</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleCopy(happUrl, `happ_${excl.id}`)}
                                className="px-2 py-0.5 rounded-md bg-white border border-amber-300 text-amber-900 hover:bg-amber-100 flex items-center space-x-1 cursor-pointer"
                              >
                                {copiedKey === `happ_${excl.id}` ? (
                                  <>
                                    <Check className="h-3 w-3 text-emerald-600" />
                                    <span className="text-[10px] font-bold text-emerald-700">Скопировано</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="h-3 w-3 text-amber-700" />
                                    <span className="text-[10px]">Копировать</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                          <div className="font-mono text-[10px] text-stone-700 truncate select-all">{happUrl}</div>
                        </div>

                        {/* INCY / clck.ru Link */}
                        <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200/90">
                          <div className="flex items-center justify-between text-[11px] font-bold text-emerald-900 mb-1">
                            <span className="flex items-center space-x-1.5">
                              <GitBranch className="h-3.5 w-3.5 text-emerald-600" />
                              <span>Формат INCY / VLESS (Зашифровано clck.ru):</span>
                            </span>
                            <div className="flex items-center space-x-1.5">
                              <button
                                type="button"
                                onClick={() => handleRefreshClck(excl.id)}
                                disabled={shorteningId === excl.id}
                                className="px-2 py-0.5 rounded-md bg-white border border-emerald-300 text-emerald-900 hover:bg-emerald-100 flex items-center space-x-1 cursor-pointer"
                                title="Пересоздать ссылку clck.ru"
                              >
                                <RefreshCw className={`h-3 w-3 ${shorteningId === excl.id ? 'animate-spin text-emerald-600' : 'text-emerald-700'}`} />
                                <span className="text-[10px]">{shorteningId === excl.id ? '...' : 'Обновить clck'}</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setQrModalExcl(excl);
                                  setQrFormat('raw');
                                }}
                                className="px-2 py-0.5 rounded-md bg-white border border-emerald-300 text-emerald-900 hover:bg-emerald-100 flex items-center space-x-1 cursor-pointer"
                                title="Показать QR-код"
                              >
                                <QrCode className="h-3 w-3 text-emerald-700" />
                                <span className="text-[10px]">QR</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleCopy(incyUrl, `raw_${excl.id}`)}
                                className="px-2 py-0.5 rounded-md bg-white border border-emerald-300 text-emerald-900 hover:bg-emerald-100 flex items-center space-x-1 cursor-pointer"
                              >
                                {copiedKey === `raw_${excl.id}` ? (
                                  <>
                                    <Check className="h-3 w-3 text-emerald-600" />
                                    <span className="text-[10px] font-bold text-emerald-700">Скопировано</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="h-3 w-3 text-emerald-700" />
                                    <span className="text-[10px]">Копировать</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                          <div className="font-mono text-[10px] text-emerald-950 font-medium truncate select-all">{incyUrl}</div>
                        </div>
                      </div>
                    </div>

                    {/* Card Action Footer */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-stone-100">
                      <div className="flex items-center space-x-2">
                        <button
                          type="button"
                          onClick={() => {
                            setClientsModalExcl(excl);
                            setClientActionFeedback(null);
                          }}
                          className="text-xs font-semibold text-sky-800 bg-sky-50 hover:bg-sky-100 border border-sky-200 inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                          title="Показать список всех подключенных клиентов и устройств к этой ссылке"
                        >
                          <Users className="h-3.5 w-3.5 text-sky-600" />
                          <span>Кто подключен ({excl.connectedClients?.length || 0})</span>
                        </button>

                        <a
                          href={rawUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-semibold text-stone-700 hover:text-stone-900 inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg border border-stone-200 bg-stone-50 hover:bg-stone-100 transition-colors"
                        >
                          <ExternalLink className="h-3.5 w-3.5 text-stone-500" />
                          <span>RAW</span>
                        </a>

                        <button
                          type="button"
                          onClick={() => handleOpenEditContentModal(excl)}
                          className="text-xs font-semibold text-stone-700 hover:text-stone-900 inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg border border-stone-200 bg-stone-50 hover:bg-stone-100 transition-colors cursor-pointer"
                          title="Редактировать содержимое файла обычного исключения (полная замена или привязка к центру)"
                        >
                          <FileCode className="h-3.5 w-3.5 text-stone-500" />
                          <span>Ключи</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setNodeEditModalExcl(excl);
                            setSelectedNodeIndex(null);
                            setEditingNodeContent('');
                            setNewNodeInput('');
                            setRawNodesDraft(excl.customContent || (excl.customNodes && excl.customNodes.join('\n')) || '');
                            setNodeEditorTab('individual');
                          }}
                          className="text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                          title="Ручное редактирование отдельных узлов и полезной нагрузки исключения"
                        >
                          <Layers className="h-3.5 w-3.5 text-amber-600" />
                          <span>Узлы ({customKeysCount})</span>
                        </button>

                        {onSyncExclusion && (
                          <button
                            type="button"
                            onClick={() => handleSync(excl.id)}
                            disabled={syncingId === excl.id}
                            className="text-xs font-semibold text-stone-600 hover:text-stone-900 inline-flex items-center space-x-1 border border-stone-200 rounded-lg px-2.5 py-1 bg-stone-50 hover:bg-stone-100 transition-colors"
                            title="Перезаписать файл в GitVerse свежими узлами из центрального источника"
                          >
                            <RefreshCw className={`h-3 w-3 ${syncingId === excl.id ? 'animate-spin text-amber-600' : 'text-stone-500'}`} />
                            <span>{syncingId === excl.id ? 'Синхронизация...' : 'Синхронизировать'}</span>
                          </button>
                        )}
                      </div>

                      {confirmDeleteId === excl.id ? (
                        <div className="flex items-center space-x-1 bg-rose-50 border border-rose-200 px-2 py-1 rounded-lg">
                          <span className="text-[11px] font-semibold text-rose-700">Удалить из Git?</span>
                          <button
                            type="button"
                            onClick={async () => {
                              setConfirmDeleteId(null);
                              await onDeleteExclusion(excl.id);
                            }}
                            className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold"
                          >
                            Да
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-1.5 py-0.5 rounded text-stone-500 hover:text-stone-700 text-[11px]"
                          >
                            Отмена
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(excl.id)}
                          className="text-xs font-semibold text-rose-600 hover:text-rose-700 inline-flex items-center space-x-1 px-2 py-1 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="Удалить подписку и стереть файл из GitVerse репозитория"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Удалить</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 3: TEMPORARY EXCLUSIONS (Test links with timers and custom keys)    */}
      {/* ========================================================================= */}
      {activeSubTab === 'temporary' && (
        <div className="space-y-4">
          {/* Detailed Policy Card for Temporary Exclusions */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-50 via-orange-50/50 to-white border border-amber-200 text-xs text-amber-950 space-y-2">
            <div className="flex items-center space-x-2 font-bold text-sm text-amber-900">
              <Timer className="h-4 w-4 text-amber-600" />
              <span>Правила временных исключений (тестовых ссылок с таймером):</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-1 text-[11px] leading-relaxed">
              <div className="p-2.5 bg-white/80 rounded-xl border border-amber-100">
                <span className="font-bold text-amber-900 block mb-0.5">1. Точный таймер действия</span>
                Работает строго заданное время: <strong>секунды, минуты, часы, дни, недели, месяцы или годы</strong>. По истечении таймера подписка автоматически деактивируется (отдает заглушку об истечении срока).
              </div>
              <div className="p-2.5 bg-white/80 rounded-xl border border-amber-100">
                <span className="font-bold text-amber-900 block mb-0.5">2. Своя строка для ключей</span>
                Имеет <strong>собственное поле для ключей/узлов</strong> (VLESS, VMESS, Trojan, Shadowsocks, WireGuard и др.). Вы можете поместить сюда любой набор ключей.
              </div>
              <div className="p-2.5 bg-white/80 rounded-xl border border-amber-100">
                <span className="font-bold text-amber-900 block mb-0.5">3. Изоляция от центра</span>
                По умолчанию <strong>отключена от центральной подписки</strong> (автономная тестовая ссылка). При необходимости можно включить опцию «Подключить к центральному».
              </div>
              <div className="p-2.5 bg-white/80 rounded-xl border border-amber-100">
                <span className="font-bold text-amber-900 block mb-0.5">4. Без ограничений и ручное удаление</span>
                <strong>Без привязки к 1 устройству</strong> (можно проверять на любых клиентах). В любой момент можно продлить срок, обновить ключи или <strong>удалить вручную</strong> (файл в Git сразу удаляется).
              </div>
            </div>
          </div>

          {/* Cards of Temporary Exclusions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {temporaryExclusions.length === 0 ? (
              <div className="col-span-full bg-white border border-stone-200 rounded-2xl p-8 text-center text-stone-500">
                <Timer className="h-10 w-10 text-amber-300 mx-auto mb-2" />
                <p className="text-sm font-semibold text-stone-700">
                  {exclusions.filter((e) => !e.isChannelExclusion && e.isTemporary).length === 0
                    ? 'Нет созданных временных тестовых ссылок'
                    : 'Ничего не найдено по вашему поисковому запросу'}
                </p>
                <p className="text-xs text-stone-400 mt-1 max-w-md mx-auto">
                  Создайте временную ссылку для тестеров с ограничением по времени (на секунды, минуты, часы, дни или недели) и собственным набором ключей.
                </p>
                <button
                  type="button"
                  onClick={() => setShowTempModal(true)}
                  className="mt-4 inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-xs cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Создать тестовую ссылку</span>
                </button>
              </div>
            ) : (
              temporaryExclusions.map((excl) => {
                const timeInfo = formatRemainingTime(excl.expiresAt);
                const directSubUrl = `${window.location.origin}/api/sub/${excl.token}`;
                const rawUrl = excl.gitRawUrl || directSubUrl;
                const incyUrl = getClckShortUrl(excl.clckUrl);
                const happUrl = excl.happUrl || '';
                const customLines = (excl.customContent || (excl.customNodes && excl.customNodes.join('\n')) || '').trim();
                const customKeysCount = customLines ? customLines.split('\n').filter(l => l.trim() && !l.trim().startsWith('#')).length : 0;

                return (
                  <div
                    key={excl.id}
                    className={`bg-white border rounded-2xl p-5 shadow-xs flex flex-col justify-between space-y-4 hover:border-amber-300 transition-all ${
                      timeInfo.isExpired ? 'border-rose-300 bg-rose-50/20' : 'border-stone-200'
                    }`}
                  >
                    <div>
                      {/* Header */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center space-x-3">
                          <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${
                            timeInfo.isExpired ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            <Timer className="h-5 w-5" />
                          </div>
                          <div>
                            <div className="flex items-center space-x-2 flex-wrap gap-1">
                              <h4 className="font-bold text-stone-900 text-sm">{excl.name}</h4>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border flex items-center space-x-1 ${timeInfo.badgeClass}`}>
                                {timeInfo.isExpired ? (
                                  <>
                                    <AlertTriangle className="h-2.5 w-2.5 text-rose-600" />
                                    <span>Истекла</span>
                                  </>
                                ) : (
                                  <>
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    <span>{timeInfo.text}</span>
                                  </>
                                )}
                              </span>
                            </div>
                            <div className="flex items-center space-x-2 text-[11px] text-stone-400 font-mono mt-0.5">
                              <span>Файл: {excl.gitFilePath || `subs/${excl.token}.txt`}</span>
                              <span>•</span>
                              <span>Создано: {new Date(excl.createdAt).toLocaleDateString('ru-RU')}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Expiration Details Bar */}
                      <div className="mt-3 p-2.5 rounded-xl bg-stone-50 border border-stone-200 text-xs flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center space-x-2 text-[11px]">
                          <Clock className="h-3.5 w-3.5 text-stone-500" />
                          <span className="text-stone-600">Срок окончания:</span>
                          <strong className={timeInfo.isExpired ? 'text-rose-600 font-mono' : 'text-stone-800 font-mono'}>
                            {excl.expiresAt ? new Date(excl.expiresAt).toLocaleString('ru-RU') : 'Бессрочно'}
                          </strong>
                        </div>
                        <div className="flex items-center space-x-1 text-[11px]">
                          <span className={`px-2 py-0.5 rounded-md font-bold ${
                            excl.attachToCentral ? 'bg-purple-100 text-purple-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {excl.attachToCentral ? 'Центральный + Свои' : 'Автономно (только свои)'}
                          </span>
                          <span className="px-2 py-0.5 bg-stone-200 text-stone-700 rounded-md font-bold">
                            {customKeysCount} ключей
                          </span>
                        </div>
                      </div>

                      {/* Notes if any */}
                      {excl.notes && (
                        <p className="text-xs text-stone-600 mt-2 bg-stone-50/70 p-2 rounded-lg border border-stone-100">
                          {excl.notes}
                        </p>
                      )}

                      {/* Custom Content preview if present */}
                      {customLines && (
                        <div className="mt-2.5 bg-stone-900 text-emerald-400 p-2.5 rounded-xl text-[10px] font-mono overflow-x-auto max-h-24 leading-relaxed">
                          <div className="text-stone-400 text-[9px] mb-1 font-sans">Собственная строка ключей:</div>
                          <pre className="whitespace-pre-wrap break-all">{customLines.substring(0, 180)}{customLines.length > 180 ? '...' : ''}</pre>
                        </div>
                      )}

                      {/* Links preview and copy */}
                      <div className="mt-3 space-y-2">
                        {/* HAPP crypt4 */}
                        <div className="flex items-center justify-between bg-stone-50 rounded-xl p-2 border border-stone-200">
                          <div className="flex items-center space-x-2 min-w-0 mr-2">
                            <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded font-bold text-[10px] uppercase shrink-0">HAPP</span>
                            <span className="font-mono text-[11px] text-stone-600 truncate">{happUrl}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleCopy(happUrl, `temp_happ_${excl.id}`)}
                            className="p-1 hover:bg-stone-200 rounded-lg text-stone-600 shrink-0 cursor-pointer"
                            title="Скопировать ссылку для HAPP (crypt4)"
                          >
                            {copiedKey === `temp_happ_${excl.id}` ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                          </button>
                        </div>

                        {/* INCY / clck.ru */}
                        <div className="flex items-center justify-between bg-stone-50 rounded-xl p-2 border border-stone-200">
                          <div className="flex items-center space-x-2 min-w-0 mr-2">
                            <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold text-[10px] uppercase shrink-0">INCY</span>
                            <span className="font-mono text-[11px] text-stone-600 truncate">{incyUrl}</span>
                          </div>
                          <div className="flex items-center space-x-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleRefreshClck(excl.id)}
                              disabled={shorteningId === excl.id}
                              className="p-1 hover:bg-stone-200 rounded-lg text-stone-600 cursor-pointer"
                              title="Обновить сокращение clck.ru"
                            >
                              <RefreshCw className={`h-3.5 w-3.5 ${shorteningId === excl.id ? 'animate-spin text-emerald-600' : ''}`} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCopy(incyUrl, `temp_incy_${excl.id}`)}
                              className="p-1 hover:bg-stone-200 rounded-lg text-stone-600 cursor-pointer"
                              title="Скопировать ссылку для INCY (clck.ru)"
                            >
                              {copiedKey === `temp_incy_${excl.id}` ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Action Bar */}
                    <div className="flex flex-wrap items-center justify-between pt-3 border-t border-stone-100 gap-2">
                      <div className="flex items-center space-x-1.5 flex-wrap gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setQrModalExcl(excl);
                            setQrFormat('happ');
                          }}
                          className="text-xs font-semibold text-stone-700 hover:text-stone-900 inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg border border-stone-200 bg-stone-50 hover:bg-stone-100 transition-colors cursor-pointer"
                        >
                          <QrCode className="h-3.5 w-3.5 text-stone-500" />
                          <span>QR</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setRenewModalExcl(excl);
                            setRenewDurationValue(24);
                            setRenewDurationUnit('hours');
                          }}
                          className="text-xs font-semibold text-amber-700 hover:text-amber-800 inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 transition-colors cursor-pointer"
                          title="Продлить или изменить срок действия"
                        >
                          <Timer className="h-3.5 w-3.5 text-amber-600" />
                          <span>Продлить</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenEditContentModal(excl)}
                          className="text-xs font-semibold text-stone-700 hover:text-stone-900 inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg border border-stone-200 bg-stone-50 hover:bg-stone-100 transition-colors cursor-pointer"
                          title="Редактировать содержимое файла исключения (полная замена или привязка к центру)"
                        >
                          <FileCode className="h-3.5 w-3.5 text-stone-500" />
                          <span>Ключи</span>
                        </button>

                        <a
                          href={rawUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-semibold text-stone-700 hover:text-stone-900 inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg border border-stone-200 bg-stone-50 hover:bg-stone-100 transition-colors"
                        >
                          <ExternalLink className="h-3.5 w-3.5 text-stone-500" />
                          <span>RAW</span>
                        </a>

                        {onSyncExclusion && (
                          <button
                            type="button"
                            onClick={() => handleSync(excl.id)}
                            disabled={syncingId === excl.id}
                            className="text-xs font-semibold text-stone-600 hover:text-stone-900 inline-flex items-center space-x-1 border border-stone-200 rounded-lg px-2.5 py-1 bg-stone-50 hover:bg-stone-100 transition-colors cursor-pointer"
                            title="Синхронизировать файл с GitVerse"
                          >
                            <RefreshCw className={`h-3 w-3 ${syncingId === excl.id ? 'animate-spin text-amber-600' : 'text-stone-500'}`} />
                            <span>{syncingId === excl.id ? 'Синхронизация...' : 'Синхронизировать'}</span>
                          </button>
                        )}
                      </div>

                      {/* Manual Deletion */}
                      {confirmDeleteId === excl.id ? (
                        <div className="flex items-center space-x-1 bg-rose-50 border border-rose-200 px-2 py-1 rounded-lg">
                          <span className="text-[11px] font-semibold text-rose-700">Удалить из Git?</span>
                          <button
                            type="button"
                            onClick={async () => {
                              setConfirmDeleteId(null);
                              await onDeleteExclusion(excl.id);
                            }}
                            className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold cursor-pointer"
                          >
                            Да
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-1.5 py-0.5 rounded text-stone-500 hover:text-stone-700 text-[11px] cursor-pointer"
                          >
                            Отмена
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(excl.id)}
                          className="text-xs font-semibold text-rose-600 hover:text-rose-700 inline-flex items-center space-x-1 px-2 py-1 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="Удалить временную тестовую ссылку и файл из GitVerse"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Удалить вручную</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CREATE CHANNEL EXCLUSION (1 Device, HWID Lock, Channel membership)  */}
      {/* ========================================================================= */}
      {showChannelModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-stone-200 space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="h-9 w-9 rounded-xl bg-purple-600 text-white flex items-center justify-center">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-stone-900 text-sm">
                    Выдать подписку из центр. источника (1 устр.)
                  </h3>
                  <p className="text-[11px] text-stone-500">
                    Для подписчика канала с привязкой HWID и анти-шерингом
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowChannelModal(false)}
                className="text-stone-400 hover:text-stone-600 text-lg leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateChannelSubmit} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-stone-800 block mb-1">
                    Telegram ID:
                  </label>
                  <input
                    type="number"
                    value={channelTgId}
                    onChange={(e) => setChannelTgId(e.target.value)}
                    placeholder="Например: 123456789"
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-purple-500 font-mono"
                  />
                  <span className="text-[10px] text-stone-400">Оставьте пустым для автогенерации</span>
                </div>

                <div>
                  <label className="font-bold text-stone-800 block mb-1">
                    Telegram Username:
                  </label>
                  <input
                    type="text"
                    value={channelUsername}
                    onChange={(e) => setChannelUsername(e.target.value)}
                    placeholder="@username"
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-stone-800 block mb-1">
                  Имя подписчика:
                </label>
                <input
                  type="text"
                  value={channelFirstName}
                  onChange={(e) => setChannelFirstName(e.target.value)}
                  placeholder="Например: Иван Иванов"
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-stone-800 block mb-1">
                    Формат ссылки:
                  </label>
                  <select
                    value={channelFormat}
                    onChange={(e) => setChannelFormat(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-purple-500 font-semibold"
                  >
                    <option value="happ">🚀 HAPP (crypt4) зашифрованная</option>
                    <option value="incy">⚡ INCY (VLESS / clck.ru)</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-stone-800 block mb-1">
                    Статус в канале:
                  </label>
                  <select
                    value={channelMembership}
                    onChange={(e) => setChannelMembership(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-purple-500 font-semibold"
                  >
                    <option value="member">✅ Подписан (активен центр. источник)</option>
                    <option value="left">❌ Не подписан (активна Строка 1)</option>
                  </select>
                </div>
              </div>

              {/* Grace Period Timer Setting */}
              <div className="p-3 rounded-xl bg-purple-50 border border-purple-200 space-y-2">
                <div className="flex items-center space-x-1.5 font-bold text-purple-900">
                  <Clock className="h-3.5 w-3.5 text-purple-600" />
                  <span>Таймер до БАНА при передаче другому лицу:</span>
                </div>
                <p className="text-[11px] text-purple-800">
                  Время, которое дается 1-му пользователю, чтобы сказать 2-му удалить подписку. Иначе наступает перманентный БАН!
                </p>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <label className="text-[10px] font-bold text-stone-600 block mb-0.5">Часы:</label>
                    <input
                      type="number"
                      min={0}
                      max={168}
                      value={channelGraceHours}
                      onChange={(e) => setChannelGraceHours(parseInt(e.target.value, 10) || 0)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white text-stone-900 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-stone-600 block mb-0.5">Минуты:</label>
                    <input
                      type="number"
                      min={0}
                      max={59}
                      value={channelGraceMinutes}
                      onChange={(e) => setChannelGraceMinutes(parseInt(e.target.value, 10) || 0)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white text-stone-900 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-purple-500"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="font-bold text-stone-800 block mb-1">
                  Заметка / Причина выдачи:
                </label>
                <textarea
                  rows={2}
                  value={channelNotes}
                  onChange={(e) => setChannelNotes(e.target.value)}
                  placeholder="Например: Не сработал бот, подписан на канал @puls, выдача вручную"
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setShowChannelModal(false)}
                  className="px-4 py-2 rounded-xl text-stone-600 hover:bg-stone-100 font-semibold cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingChannel}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>{isSubmittingChannel ? 'Создание...' : 'Создать и выдать подписку'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CREATE TEAM EXCLUSION (No Limits)                                   */}
      {/* ========================================================================= */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-stone-200 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center space-x-2">
                <div className="h-8 w-8 rounded-xl bg-amber-500 text-white flex items-center justify-center">
                  <ShieldOff className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-bold text-stone-900 text-sm">
                    Создать командное исключение
                  </h3>
                  <p className="text-[11px] text-stone-500">
                    Без лимитов, без привязки устройств и без проверки каналов
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-stone-400 hover:text-stone-600 text-lg leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-stone-800 block mb-1">
                  Название исключения / Команда:
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Например: Команда маркетинга, Семья, Партнеры"
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="font-bold text-stone-800 block mb-1">
                  Имя файла в GitVerse (необязательно):
                </label>
                <div className="flex items-center space-x-1.5 font-mono text-stone-500">
                  <span>subs/</span>
                  <input
                    type="text"
                    value={customFileName}
                    onChange={(e) => setCustomFileName(e.target.value)}
                    placeholder="team_marketing.txt"
                    className="flex-1 px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono text-xs"
                  />
                </div>
                <span className="text-[10px] text-stone-400 mt-1 block">
                  Если пусто, сгенерируется красивый уникальный токен
                </span>
              </div>

              {/* Custom Keys / String Textarea */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-stone-800">
                    Своя строка для ключей / узлов:
                  </label>
                  <span className="text-[10px] text-stone-500 font-medium">ручное содержимое</span>
                </div>
                <textarea
                  rows={3}
                  value={customContent}
                  onChange={(e) => setCustomContent(e.target.value)}
                  placeholder="Вставьте ключи (vless://..., vmess://..., trojan://... или конфиг)..."
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono text-[11px]"
                />
                <p className="text-[10px] text-stone-400 mt-0.5">
                  Каждый ключ с новой строки. Если не указано, будет отдаваться центральная подписка.
                </p>
              </div>

              {/* Attach to Central Subscription Toggle */}
              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 flex items-start space-x-2.5">
                <input
                  type="checkbox"
                  id="ordinary-attach-central"
                  checked={attachToCentral}
                  onChange={(e) => setAttachToCentral(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-stone-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                />
                <label htmlFor="ordinary-attach-central" className="cursor-pointer text-xs">
                  <span className="font-bold text-stone-800 block">
                    Подключить к центральной подписке
                  </span>
                  <span className="text-[11px] text-stone-500">
                    Если включено, к вашим ключам добавятся все узлы центральной подписки. Если отключить, файл будет отдавать только вашу персональную строку.
                  </span>
                </label>
              </div>

              <div>
                <label className="font-bold text-stone-800 block mb-1">
                  Примечание / Описание:
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Для кого предназначена эта подписка, контакты ответственного..."
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl text-stone-600 hover:bg-stone-100 font-semibold cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-semibold flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>{isSubmitting ? 'Создание...' : 'Создать исключение'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: QR CODE                                                            */}
      {/* ========================================================================= */}
      {qrModalExcl && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-stone-200 space-y-4 text-center">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center space-x-2">
                <QrCode className="h-5 w-5 text-stone-700" />
                <h3 className="font-bold text-stone-900 text-sm">QR-код для импорта</h3>
              </div>
              <button
                onClick={() => setQrModalExcl(null)}
                className="text-stone-400 hover:text-stone-600 text-lg leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>

            <p className="text-xs text-stone-500 font-medium">
              {qrModalExcl.name}
            </p>

            {/* Format Switcher */}
            <div className="flex justify-center p-1 bg-stone-100 rounded-xl max-w-xs mx-auto">
              <button
                type="button"
                onClick={() => setQrFormat('happ')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  qrFormat === 'happ' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500 hover:text-stone-900'
                }`}
              >
                HAPP (crypt4)
              </button>
              <button
                type="button"
                onClick={() => setQrFormat('raw')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  qrFormat === 'raw' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500 hover:text-stone-900'
                }`}
              >
                INCY / VLESS
              </button>
            </div>

            {/* QR Image Display */}
            <div className="flex justify-center py-2">
              {qrDataUrl ? (
                <div className="p-3 bg-white border border-stone-200 rounded-2xl shadow-xs">
                  <img src={qrDataUrl} alt="QR Code" className="w-56 h-56 mx-auto" />
                </div>
              ) : (
                <div className="w-56 h-56 flex items-center justify-center bg-stone-50 rounded-2xl text-stone-400 text-xs">
                  Генерация QR-кода...
                </div>
              )}
            </div>

            <p className="text-[11px] text-stone-400 max-w-xs mx-auto">
              Отсканируйте камерой в приложении HAPP, v2rayNG, Shadowrocket, Streisand или Hiddify.
            </p>

            <button
              type="button"
              onClick={() => setQrModalExcl(null)}
              className="w-full py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-semibold cursor-pointer"
            >
              Закрыть
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CONNECTED CLIENTS (Team Exclusions)                                 */}
      {/* ========================================================================= */}
      {clientsModalExcl && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-stone-200 space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center space-x-2">
                <div className="h-8 w-8 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center">
                  <Users className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-bold text-stone-900 text-sm">
                    Подключенные клиенты и устройства
                  </h3>
                  <p className="text-[11px] text-stone-500">
                    {clientsModalExcl.name} • токен: <span className="font-mono">{clientsModalExcl.token}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setClientsModalExcl(null)}
                className="text-stone-400 hover:text-stone-600 text-lg leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>

            {clientActionFeedback && (
              <div className="p-2.5 rounded-xl bg-sky-50 border border-sky-200 text-xs font-semibold text-sky-800">
                {clientActionFeedback}
              </div>
            )}

            {/* Connected Clients Table */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-stone-700">
                <span>Список активных пользователей ({clientsModalExcl.connectedClients?.length || 0}):</span>
              </div>

              {(!clientsModalExcl.connectedClients || clientsModalExcl.connectedClients.length === 0) ? (
                <div className="p-6 text-center bg-stone-50 rounded-xl border border-stone-200 text-stone-400 text-xs">
                  Пока нет подключенных клиентов или зафиксированных обращений к этой ссылке.
                </div>
              ) : (
                <div className="overflow-x-auto border border-stone-200 rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 font-semibold">
                      <tr>
                        <th className="px-3 py-2">Тип</th>
                        <th className="px-3 py-2">IP адрес</th>
                        <th className="px-3 py-2">Клиент / Заметка</th>
                        <th className="px-3 py-2">Подключение</th>
                        <th className="px-3 py-2 text-right">Действие</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {clientsModalExcl.connectedClients.map((c) => (
                        <tr key={c.id} className="hover:bg-stone-50/50">
                          <td className="px-3 py-2 font-bold text-stone-800">{c.clientType}</td>
                          <td className="px-3 py-2 font-mono text-[11px] text-stone-600">{c.ip}</td>
                          <td className="px-3 py-2 text-stone-700 truncate max-w-xs">{c.userAgent}</td>
                          <td className="px-3 py-2 text-[11px] text-stone-500">
                            {new Date(c.lastConnectedAt).toLocaleString('ru-RU')}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => handleDeleteClient(c.id)}
                              className="text-rose-600 hover:text-rose-800 p-1 cursor-pointer"
                              title="Отключить/удалить из списка"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Manual Client Addition Form */}
            <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center space-x-2 text-stone-900 font-semibold text-xs">
                <UserPlus className="h-4 w-4 text-sky-600" />
                <span>Добавить человека или устройство в список вручную:</span>
              </div>

              <form onSubmit={handleAddClientSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-2.5 text-xs">
                <div>
                  <label className="text-[10px] text-stone-500 block mb-0.5 font-medium">IP адрес</label>
                  <input
                    type="text"
                    value={newClientIp}
                    onChange={(e) => setNewClientIp(e.target.value)}
                    placeholder="Например: 195.82.10.45"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white font-mono text-xs focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-stone-500 block mb-0.5 font-medium">Имя / Заметка / Приложение</label>
                  <input
                    type="text"
                    value={newClientNote}
                    onChange={(e) => setNewClientNote(e.target.value)}
                    placeholder="Например: iPhone брата, Ноутбук"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white text-xs focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-stone-500 block mb-0.5 font-medium">Тип клиента</label>
                  <select
                    value={newClientType}
                    onChange={(e) => setNewClientType(e.target.value as any)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white text-xs focus:outline-none focus:ring-1 focus:ring-sky-500"
                  >
                    <option value="INCY">⚡ INCY (VLESS / Shadowrocket)</option>
                    <option value="HAPP">🚀 HAPP (crypt4)</option>
                    <option value="V2Ray">🛡️ V2Ray / v2rayNG</option>
                    <option value="Clash">📦 Clash / Mihomo</option>
                    <option value="Sing-Box">📦 Sing-Box / SFA</option>
                    <option value="Browser">🌐 Веб-браузер</option>
                  </select>
                </div>

                <div className="flex items-end">
                  <button
                    type="submit"
                    disabled={isAddingClient}
                    className="w-full py-1.5 px-3 rounded-lg bg-sky-700 hover:bg-sky-800 text-white font-semibold text-xs shadow-xs flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>{isAddingClient ? 'Добавление...' : 'Добавить'}</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end pt-2 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setClientsModalExcl(null)}
                className="px-4 py-2 rounded-xl bg-stone-900 text-white font-semibold text-xs hover:bg-stone-800 transition-colors cursor-pointer"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CREATE TEMPORARY TEST EXCLUSION (Custom Duration & Custom Nodes)   */}
      {/* ========================================================================= */}
      {showTempModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-stone-200 space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="h-9 w-9 rounded-xl bg-amber-600 text-white flex items-center justify-center">
                  <Timer className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-stone-900 text-sm">
                    Создать временную тестовую ссылку
                  </h3>
                  <p className="text-[11px] text-stone-500">
                    Ограничена по времени, своя строка ключей, без ограничений по устройствам
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowTempModal(false)}
                className="text-stone-400 hover:text-stone-600 text-lg leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateTempSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-stone-800 block mb-1">
                  Название тестовой ссылки:
                </label>
                <input
                  type="text"
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  placeholder="Например: Тестовый доступ на 24 часа"
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              {/* Duration Settings */}
              <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200 space-y-2.5">
                <div className="flex items-center space-x-1.5 font-bold text-amber-900">
                  <Clock className="h-3.5 w-3.5 text-amber-600" />
                  <span>Срок действия ссылки (таймер):</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-stone-600 block mb-0.5">Время:</label>
                    <input
                      type="number"
                      min={1}
                      value={tempDurationValue}
                      onChange={(e) => setTempDurationValue(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white text-stone-900 font-semibold focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-stone-600 block mb-0.5">Единица измерения:</label>
                    <select
                      value={tempDurationUnit}
                      onChange={(e) => setTempDurationUnit(e.target.value as any)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white text-stone-900 font-semibold focus:outline-none focus:ring-1 focus:ring-amber-500"
                    >
                      <option value="seconds">Секунды</option>
                      <option value="minutes">Минуты</option>
                      <option value="hours">Часы</option>
                      <option value="days">Дни</option>
                      <option value="weeks">Недели</option>
                      <option value="months">Месяцы</option>
                      <option value="years">Годы</option>
                    </select>
                  </div>
                </div>

                {/* Quick Presets */}
                <div className="flex flex-wrap gap-1 pt-1">
                  <span className="text-[10px] text-stone-500 mr-1 self-center">Быстро:</span>
                  {[
                    { label: '10 мин', val: 10, unit: 'minutes' },
                    { label: '1 час', val: 1, unit: 'hours' },
                    { label: '3 часа', val: 3, unit: 'hours' },
                    { label: '24 часа', val: 24, unit: 'hours' },
                    { label: '3 дня', val: 3, unit: 'days' },
                    { label: '7 дней', val: 7, unit: 'days' },
                    { label: '30 дней', val: 30, unit: 'days' },
                  ].map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => {
                        setTempDurationValue(p.val);
                        setTempDurationUnit(p.unit as any);
                      }}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors cursor-pointer ${
                        tempDurationValue === p.val && tempDurationUnit === p.unit
                          ? 'bg-amber-600 text-white border-amber-600'
                          : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-50'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Keys / String Textarea */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-stone-800">
                    Своя строка для ключей / узлов:
                  </label>
                  <span className="text-[10px] text-stone-500 font-medium">отдельная от центральной</span>
                </div>
                <textarea
                  rows={4}
                  value={tempCustomContent}
                  onChange={(e) => setTempCustomContent(e.target.value)}
                  placeholder="Вставьте ключи или узлы (vless://..., vmess://..., trojan://..., ss://... или конфиг)..."
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono text-[11px]"
                />
                <p className="text-[10px] text-stone-400 mt-0.5">
                  Каждый ключ с новой строки. Вы можете вставить свои тестовые серверы.
                </p>
              </div>

              {/* Attach to Central Subscription Toggle */}
              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 flex items-start space-x-2.5">
                <input
                  type="checkbox"
                  id="temp-attach-central"
                  checked={tempAttachToCentral}
                  onChange={(e) => setTempAttachToCentral(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-stone-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                />
                <label htmlFor="temp-attach-central" className="cursor-pointer text-xs">
                  <span className="font-bold text-stone-800 block">
                    Подключить к центральной подписке
                  </span>
                  <span className="text-[11px] text-stone-500">
                    По умолчанию <strong>отключено</strong> (ссылка полностью автономна и отдает только вашу строку). Если включить, к вашим ключам добавятся все узлы центральной подписки.
                  </span>
                </label>
              </div>

              <div>
                <label className="font-bold text-stone-800 block mb-1">
                  Имя файла в репозитории (subs/):
                </label>
                <input
                  type="text"
                  value={tempCustomFileName}
                  onChange={(e) => setTempCustomFileName(e.target.value)}
                  placeholder="Оставьте пустым для авто-генерации (например: test_24h.txt)"
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono"
                />
              </div>

              <div>
                <label className="font-bold text-stone-800 block mb-1">
                  Заметки / Описание:
                </label>
                <input
                  type="text"
                  value={tempNotes}
                  onChange={(e) => setTempNotes(e.target.value)}
                  placeholder="Например: Выдано тестеру Сергею для проверки скорости"
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setShowTempModal(false)}
                  className="px-4 py-2 rounded-xl border border-stone-200 text-stone-600 font-semibold hover:bg-stone-50 cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingTemp}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold shadow-xs flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Timer className="h-4 w-4" />
                  <span>{isSubmittingTemp ? 'Создание...' : 'Создать тестовую ссылку'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: RENEW / EXTEND TEMPORARY EXCLUSION TIMER                           */}
      {/* ========================================================================= */}
      {renewModalExcl && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-stone-200 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="h-8 w-8 rounded-xl bg-amber-600 text-white flex items-center justify-center">
                  <Timer className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-bold text-stone-900 text-sm">
                    Продлить срок действия ссылки
                  </h3>
                  <p className="text-[11px] text-stone-500 truncate max-w-[260px]">
                    {renewModalExcl.name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRenewModalExcl(null)}
                className="text-stone-400 hover:text-stone-600 text-lg leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-xs">
              <div className="text-stone-500 mb-0.5">Текущий срок окончания:</div>
              <div className="font-bold font-mono text-stone-800">
                {renewModalExcl.expiresAt ? new Date(renewModalExcl.expiresAt).toLocaleString('ru-RU') : 'Бессрочно'}
              </div>
            </div>

            <form onSubmit={handleRenewSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-stone-800 block mb-1">
                  Добавить к сроку:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    min={1}
                    value={renewDurationValue}
                    onChange={(e) => setRenewDurationValue(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white font-semibold focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                  <select
                    value={renewDurationUnit}
                    onChange={(e) => setRenewDurationUnit(e.target.value as any)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white font-semibold focus:outline-none focus:ring-1 focus:ring-amber-500"
                  >
                    <option value="seconds">Секунды</option>
                    <option value="minutes">Минуты</option>
                    <option value="hours">Часы</option>
                    <option value="days">Дни</option>
                    <option value="weeks">Недели</option>
                    <option value="months">Месяцы</option>
                    <option value="years">Годы</option>
                  </select>
                </div>

                {/* Presets */}
                <div className="flex flex-wrap gap-1 mt-2">
                  {[
                    { label: '+10 мин', val: 10, unit: 'minutes' },
                    { label: '+1 час', val: 1, unit: 'hours' },
                    { label: '+24 часа', val: 24, unit: 'hours' },
                    { label: '+3 дня', val: 3, unit: 'days' },
                    { label: '+7 дней', val: 7, unit: 'days' },
                  ].map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => {
                        setRenewDurationValue(p.val);
                        setRenewDurationUnit(p.unit as any);
                      }}
                      className="px-2 py-0.5 rounded text-[10px] font-bold border border-stone-200 bg-stone-50 hover:bg-stone-100 text-stone-700 cursor-pointer"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setRenewModalExcl(null)}
                  className="px-3.5 py-1.5 rounded-xl border border-stone-200 text-stone-600 font-semibold cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingRenew}
                  className="px-4 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold shadow-xs flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Timer className="h-3.5 w-3.5" />
                  <span>{isSubmittingRenew ? 'Продление...' : 'Продлить таймер'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: EDIT CUSTOM CONTENT / KEYS & CENTRAL ATTACHMENT                    */}
      {/* ========================================================================= */}
      {editContentModalExcl && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-stone-200 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="h-8 w-8 rounded-xl bg-stone-900 text-white flex items-center justify-center">
                  <FileCode className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-bold text-stone-900 text-sm">
                    Редактирование файла исключения
                  </h3>
                  <div className="flex items-center space-x-2 mt-0.5">
                    <span className="text-[11px] text-stone-600 font-medium">
                      {editContentModalExcl.name}
                    </span>
                    {editContentModalExcl.gitFilePath && (
                      <code className="text-[10px] text-amber-700 font-mono bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                        {editContentModalExcl.gitFilePath}
                      </code>
                    )}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditContentModalExcl(null)}
                className="text-stone-400 hover:text-stone-600 text-lg leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleEditContentSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-stone-800 block mb-1">
                  Название:
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-stone-500 font-semibold"
                />
              </div>

              {/* Mode Selection Cards: Full Replacement vs Merge with Central */}
              <div className="space-y-1.5">
                <label className="font-bold text-stone-800 block">
                  Режим сохранения файла:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div
                    onClick={() => setEditAttachToCentral(false)}
                    className={`p-2.5 rounded-xl border cursor-pointer transition-all ${
                      !editAttachToCentral
                        ? 'bg-amber-50/90 border-amber-500 ring-2 ring-amber-400/20'
                        : 'bg-stone-50 border-stone-200 hover:border-stone-300'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id="mode-replace-file"
                        name="editMode"
                        checked={!editAttachToCentral}
                        onChange={() => setEditAttachToCentral(false)}
                        className="text-amber-600 focus:ring-amber-500 cursor-pointer"
                      />
                      <label htmlFor="mode-replace-file" className="font-bold text-stone-900 text-xs cursor-pointer flex items-center space-x-1">
                        <span>⚡ Полная замена файла</span>
                      </label>
                    </div>
                    <p className="text-[10px] text-stone-600 mt-1 pl-5 leading-relaxed">
                      Содержимое файла целиком заменяется на указанные ключи. Предыдущие узлы и центр НЕ добавляются.
                    </p>
                  </div>

                  <div
                    onClick={() => setEditAttachToCentral(true)}
                    className={`p-2.5 rounded-xl border cursor-pointer transition-all ${
                      editAttachToCentral
                        ? 'bg-stone-100 border-stone-500 ring-2 ring-stone-400/20'
                        : 'bg-stone-50 border-stone-200 hover:border-stone-300'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id="mode-attach-central"
                        name="editMode"
                        checked={editAttachToCentral}
                        onChange={() => setEditAttachToCentral(true)}
                        className="text-stone-900 focus:ring-stone-500 cursor-pointer"
                      />
                      <label htmlFor="mode-attach-central" className="font-bold text-stone-900 text-xs cursor-pointer">
                        ➕ Дополнить центром
                      </label>
                    </div>
                    <p className="text-[10px] text-stone-600 mt-1 pl-5 leading-relaxed">
                      К указанным ключам будут автоматически добавлены все узлы из центральной подписки.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center space-x-2">
                    <label className="font-bold text-stone-800">
                      Содержимое файла (ключи / узлы):
                    </label>
                    {!editAttachToCentral ? (
                      <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-bold">
                        Полная замена
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded bg-stone-200 text-stone-700 text-[10px] font-bold">
                        Дополнение центром
                      </span>
                    )}
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={async () => {
                        if (!editContentModalExcl) return;
                        try {
                          const fileData = await fetchExclusionFileContent(editContentModalExcl.id);
                          if (fileData.content) {
                            setEditCustomContent(fileData.content);
                          }
                        } catch (err: any) {
                          alert(err.message || 'Ошибка загрузки файла');
                        }
                      }}
                      className="text-[10px] text-amber-700 hover:text-amber-900 font-semibold underline cursor-pointer"
                    >
                      Загрузить текущий файл
                    </button>
                    <span className="text-[10px] text-stone-400 font-mono">
                      {editCustomContent ? editCustomContent.split('\n').filter(l => l.trim() && !l.trim().startsWith('#')).length : 0} ключей
                    </span>
                  </div>
                </div>
                <textarea
                  rows={6}
                  value={editCustomContent}
                  onChange={(e) => setEditCustomContent(e.target.value)}
                  placeholder="Вставьте ключи конфигурации (vless://..., vmess://..., trojan://..., ss://...)..."
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-stone-500 font-mono text-[11px]"
                />
              </div>

              <div>
                <label className="font-bold text-stone-800 block mb-1">
                  Заметки:
                </label>
                <input
                  type="text"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-stone-500"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setEditContentModalExcl(null)}
                  className="px-3.5 py-1.5 rounded-xl border border-stone-200 text-stone-600 font-semibold cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingEdit}
                  className="px-4 py-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-semibold shadow-xs flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>
                    {isSubmittingEdit
                      ? 'Сохранение...'
                      : !editAttachToCentral
                      ? 'Полностью заменить содержимое файла в Git'
                      : 'Сохранить и дополнить центром'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: MANUAL EDITING OF INDIVIDUAL NODE CONTENTS FOR EXCEPTION RECORD     */}
      {/* ========================================================================= */}
      {nodeEditModalExcl && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-stone-200 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="h-8 w-8 rounded-xl bg-amber-600 text-white flex items-center justify-center">
                  <Layers className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-bold text-stone-900 text-sm">
                    Редактирование отдельных узлов исключения
                  </h3>
                  <p className="text-[11px] text-stone-500 truncate max-w-[360px]">
                    {nodeEditModalExcl.name} · Токен: <code className="font-mono text-stone-700">{nodeEditModalExcl.token}</code>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setNodeEditModalExcl(null);
                  setSelectedNodeIndex(null);
                  setEditingNodeContent('');
                }}
                className="text-stone-400 hover:text-stone-600 text-lg leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>

            {/* Sub-Tabs: Individual Nodes vs RAW */}
            <div className="flex items-center space-x-2 border-b border-stone-100 pb-2 text-xs">
              <button
                type="button"
                onClick={() => setNodeEditorTab('individual')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                  nodeEditorTab === 'individual'
                    ? 'bg-amber-100 text-amber-900'
                    : 'text-stone-600 hover:bg-stone-100'
                }`}
              >
                Поузловое редактирование ({nodeEditModalExcl.customNodes?.length || 0})
              </button>
              <button
                type="button"
                onClick={() => {
                  setNodeEditorTab('raw');
                  setRawNodesDraft(nodeEditModalExcl.customContent || (nodeEditModalExcl.customNodes && nodeEditModalExcl.customNodes.join('\n')) || '');
                }}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                  nodeEditorTab === 'raw'
                    ? 'bg-amber-100 text-amber-900'
                    : 'text-stone-600 hover:bg-stone-100'
                }`}
              >
                RAW-список ключей
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-xs">
              {nodeEditorTab === 'individual' ? (
                <>
                  {/* Selected Node Editor Box */}
                  {selectedNodeIndex !== null && (
                    <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-300 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-amber-900 flex items-center space-x-1.5">
                          <span>Редактирование узла #{selectedNodeIndex + 1}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedNodeIndex(null);
                            setEditingNodeContent('');
                          }}
                          className="text-stone-500 hover:text-stone-700 text-xs cursor-pointer"
                        >
                          Отмена
                        </button>
                      </div>
                      <textarea
                        rows={3}
                        value={editingNodeContent}
                        onChange={(e) => setEditingNodeContent(e.target.value)}
                        placeholder="vless://... или trojan://..."
                        className="w-full px-3 py-2 rounded-xl border border-amber-200 bg-white text-stone-900 font-mono text-[11px] focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                      <div className="flex justify-end space-x-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedNodeIndex(null);
                            setEditingNodeContent('');
                          }}
                          className="px-3 py-1 rounded-lg border border-stone-200 bg-white text-stone-600 font-medium cursor-pointer"
                        >
                          Закрыть
                        </button>
                        <button
                          type="button"
                          disabled={isSubmittingNode || !editingNodeContent.trim()}
                          onClick={() =>
                            updateExceptionNode(nodeEditModalExcl.id, {
                              nodeIndex: selectedNodeIndex,
                              nodeContent: editingNodeContent.trim(),
                              action: 'update',
                            })
                          }
                          className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold flex items-center space-x-1 cursor-pointer disabled:opacity-50"
                        >
                          <Check className="h-3 w-3" />
                          <span>{isSubmittingNode ? 'Сохранение...' : 'Сохранить узел'}</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* List of Existing Nodes */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-stone-700 font-bold mb-1">
                      <span>Список текущих узлов в исключении:</span>
                      <span className="text-[11px] text-stone-400 font-mono">
                        Всего: {nodeEditModalExcl.customNodes?.length || 0}
                      </span>
                    </div>

                    {(!nodeEditModalExcl.customNodes || nodeEditModalExcl.customNodes.length === 0) ? (
                      <div className="p-4 rounded-xl border border-dashed border-stone-200 text-center text-stone-400">
                        В этом исключении пока нет индивидуальных узлов. Добавьте узел ниже или вставьте список.
                      </div>
                    ) : (
                      nodeEditModalExcl.customNodes.map((node, idx) => {
                        const proto = node.split('://')[0] || 'node';
                        let hashPart = '';
                        if (node.includes('#')) {
                          try { hashPart = decodeURIComponent(node.split('#')[1]); } catch { hashPart = node.split('#')[1]; }
                        }
                        const hostPart = node.includes('@') ? (node.split('@')[1] || '').split('?')[0] : node.slice(0, 40);

                        return (
                          <div
                            key={idx}
                            className={`p-3 rounded-xl border transition-colors flex items-center justify-between gap-3 ${
                              selectedNodeIndex === idx
                                ? 'bg-amber-50/50 border-amber-300'
                                : 'bg-stone-50 border-stone-200 hover:border-stone-300'
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center space-x-2 mb-1">
                                <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-stone-200 text-stone-800">
                                  #{idx + 1}
                                </span>
                                <span className="uppercase text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                                  {proto}
                                </span>
                                {hashPart && (
                                  <span className="font-semibold text-stone-800 text-[11px] truncate">
                                    {hashPart}
                                  </span>
                                )}
                              </div>
                              <div className="font-mono text-[10px] text-stone-500 truncate">
                                {hostPart || node}
                              </div>
                            </div>

                            <div className="flex items-center space-x-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedNodeIndex(idx);
                                  setEditingNodeContent(node);
                                }}
                                className="px-2 py-1 rounded-lg bg-white border border-stone-200 text-stone-700 hover:bg-stone-100 text-[11px] font-semibold cursor-pointer"
                                title="Редактировать этот конкретный узел"
                              >
                                Изменить
                              </button>
                              <button
                                type="button"
                                disabled={isSubmittingNode}
                                onClick={() =>
                                  updateExceptionNode(nodeEditModalExcl.id, {
                                    nodeIndex: idx,
                                    action: 'delete',
                                  })
                                }
                                className="p-1 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 cursor-pointer"
                                title="Удалить узел"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Add New Node Section */}
                  <div className="p-3.5 rounded-xl border border-stone-200 bg-stone-50/60 space-y-2">
                    <div className="font-bold text-stone-800">
                      ➕ Добавить новый узел к этому исключению
                    </div>
                    <textarea
                      rows={2}
                      value={newNodeInput}
                      onChange={(e) => setNewNodeInput(e.target.value)}
                      placeholder="Вставьте URI узла (vless://... / vmess://... / trojan://...)"
                      className="w-full px-3 py-1.5 rounded-xl border border-stone-200 bg-white text-stone-900 font-mono text-[11px] focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        disabled={isSubmittingNode || !newNodeInput.trim()}
                        onClick={() =>
                          updateExceptionNode(nodeEditModalExcl.id, {
                            nodeContent: newNodeInput.trim(),
                            action: 'add',
                          })
                        }
                        className="px-3.5 py-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-semibold flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Plus className="h-3 w-3" />
                        <span>Добавить узел</span>
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                /* RAW Text Mode */
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-stone-700 font-bold">
                    <span>Пакетная вставка / изменение списка узлов:</span>
                    <span className="text-[10px] text-stone-400 font-mono">
                      {rawNodesDraft.split('\n').filter((l) => l.trim() && !l.startsWith('#')).length} узлов
                    </span>
                  </div>
                  <textarea
                    rows={8}
                    value={rawNodesDraft}
                    onChange={(e) => setRawNodesDraft(e.target.value)}
                    placeholder="Вставьте список узлов (каждый узел с новой строки)..."
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 font-mono text-[11px] focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      disabled={isSubmittingNode}
                      onClick={() =>
                        updateExceptionNode(nodeEditModalExcl.id, {
                          fullPayload: rawNodesDraft,
                          action: 'set_all',
                        })
                      }
                      className="px-4 py-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-semibold flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Check className="h-3.5 w-3.5" />
                      <span>{isSubmittingNode ? 'Сохранение...' : 'Сохранить весь список узлов'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-stone-100">
              <button
                type="button"
                onClick={() => {
                  setNodeEditModalExcl(null);
                  setSelectedNodeIndex(null);
                  setEditingNodeContent('');
                }}
                className="px-4 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold cursor-pointer"
              >
                Готово
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
