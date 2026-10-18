import React, { useState, useEffect } from 'react';
import { 
  Layers, 
  Save, 
  RefreshCw, 
  ArrowDownToLine, 
  ArrowUpFromLine, 
  Plus, 
  CheckCircle2, 
  AlertCircle,
  Copy,
  Check,
  FileCode,
  ShieldAlert,
  Server,
  ExternalLink,
  Trash2,
  Globe,
  Activity,
  Sparkles,
  Search,
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  Play,
  Sliders,
  Ban,
  Smartphone,
  AlertTriangle,
  Bot,
  UserX,
  Lock,
  Undo2,
  Zap,
  Terminal
} from 'lucide-react';
import { CentralSubscriptionFile, CentralSubscriptionSavePayload, GitSourceItem, GitSourceConfig, RepoUserFile } from '../types';
import { 
  fetchRepoFiles, 
  checkRepoFileUrl, 
  generateFreeRepoFiles, 
  pushAllRepoFiles,
  deleteRepoFile,
  syncCentralToSubscribers,
  updateCentralAutoSyncConfig,
  deepAuditAndForceSync
} from '../services/api';

interface CentralSubscriptionViewProps {
  centralFile: (CentralSubscriptionFile & { stats?: any }) | null;
  gitSource: GitSourceItem | GitSourceConfig | null;
  gitSources?: GitSourceItem[];
  onSetDefaultGitSource?: (id: string) => Promise<any>;
  onMakeCentralGitSource?: (id: string) => Promise<any>;
  onRefreshData?: () => Promise<void>;
  onSave: (payload: Partial<CentralSubscriptionSavePayload> & { content: string; autoSyncEnabled: boolean; filename: string }) => Promise<void>;
  onSync: (direction: 'push' | 'pull', centralRawUrl?: string) => Promise<void>;
  onSyncToSubscribers?: () => Promise<any>;
  onUpdateAutoSyncConfig?: (intervalSeconds: number, enabled?: boolean) => Promise<any>;
  onNavigateToProcessor?: () => void;
  onNavigateToLogs?: () => void;
}

export const CentralSubscriptionView: React.FC<CentralSubscriptionViewProps> = ({
  centralFile,
  gitSource,
  gitSources = [],
  onSetDefaultGitSource,
  onMakeCentralGitSource,
  onRefreshData,
  onSave,
  onSync,
  onSyncToSubscribers,
  onUpdateAutoSyncConfig,
  onNavigateToProcessor,
  onNavigateToLogs,
}) => {
  const getProviderRepoUrl = (source: any) => {
    if (!source || !source.repository) return 'https://gitverse.ru/Vaynet/bot';
    const repo = source.repository;
    if (source.provider === 'sourcecraft') return `https://sourcecraft.dev/${repo}`;
    if (source.provider === 'github') return `https://github.com/${repo}`;
    if (source.provider === 'gitlab') return `https://gitlab.com/${repo}`;
    if (source.provider === 'gitflic') return `https://gitflic.ru/project/${repo}`;
    if (source.provider === 'moshub') return `https://hub.mos.ru/${repo}`;
    return `https://gitverse.ru/${repo}`;
  };

  const getProviderRawUrl = (source: any, fname = 'L') => {
    if (!source) return 'https://gitverse.ru/api/repos/Vaynet/bot/raw/branch/master/L';
    if (source.centralRawUrl) return source.centralRawUrl;
    const branch = source.branch || (source.provider === 'sourcecraft' || source.provider === 'github' ? 'main' : 'master');
    if (source.provider === 'sourcecraft') {
      const shaMatch = (source.baseRawUrl || source.centralRawUrl || '').match(/\/raw\/[^\/]+\/[^\/]+\/([0-9a-f]{40})\//i);
      const targetRef = shaMatch ? shaMatch[1] : 'b10033a9ce8a1c8b075a82fd2ea4b1aa9431284e';
      return `https://raw.sourcecraft.tech/raw/${source.repository}/${targetRef}/${fname}`;
    }
    return `https://gitverse.ru/api/repos/${source.repository || 'Vaynet/bot'}/raw/branch/${branch}/${fname}`;
  };

  const [content, setContent] = useState<string>(centralFile?.content || '');
  const [autoSync, setAutoSync] = useState<boolean>(centralFile?.autoSyncEnabled ?? true);
  const [autoSyncInterval, setAutoSyncInterval] = useState<number>(centralFile?.autoSyncIntervalSeconds || 1);
  const [filename, setFilename] = useState<string>(centralFile?.filename || 'L');
  const [centralRawUrl, setCentralRawUrl] = useState<string>(
    centralFile?.centralRawUrl || getProviderRawUrl(gitSource, centralFile?.filename || 'L')
  );
  const [repositoryUrl, setRepositoryUrl] = useState<string>(
    centralFile?.repositoryUrl || getProviderRepoUrl(gitSource)
  );

  useEffect(() => {
    if (centralFile?.centralRawUrl) {
      setCentralRawUrl(centralFile.centralRawUrl);
    } else if (gitSource) {
      setCentralRawUrl(getProviderRawUrl(gitSource, filename));
    }
    if (centralFile?.repositoryUrl) {
      setRepositoryUrl(centralFile.repositoryUrl);
    } else if (gitSource) {
      setRepositoryUrl(getProviderRepoUrl(gitSource));
    }
  }, [gitSource?.id, centralFile?.centralRawUrl, centralFile?.repositoryUrl]);

  const handleApplyActiveGitConfig = () => {
    if (!gitSource) return;
    const raw = getProviderRawUrl(gitSource, filename);
    const repo = getProviderRepoUrl(gitSource);
    setCentralRawUrl(raw);
    setRepositoryUrl(repo);
    setStatusMessage({
      type: 'success',
      text: `Параметры источника "${gitSource.name}" (${gitSource.provider.toUpperCase()}: ${gitSource.repository}) применены к центральной подписке!`,
    });
  };

  const handleSelectGitSource = async (id: string) => {
    const selected = gitSources.find((s) => s.id === id);
    if (!selected) return;
    const raw = getProviderRawUrl(selected, selected.filePath || filename);
    const repo = getProviderRepoUrl(selected);
    setCentralRawUrl(raw);
    setRepositoryUrl(repo);
    if (selected.filePath) setFilename(selected.filePath);

    if (onSetDefaultGitSource) {
      try {
        await onSetDefaultGitSource(selected.id);
        setStatusMessage({
          type: 'success',
          text: `Источник "${selected.name}" выбран активным и назначен по умолчанию!`,
        });
        if (onRefreshData) await onRefreshData();
      } catch (err: any) {
        setStatusMessage({ type: 'error', text: err.message || 'Ошибка смены источника' });
      }
    }
  };

  const handleMakeCentralFromActive = async () => {
    if (!gitSource) return;
    setIsSaving(true);
    setStatusMessage(null);
    try {
      if (onMakeCentralGitSource) {
        await onMakeCentralGitSource(gitSource.id);
      }
      handleApplyActiveGitConfig();
      setStatusMessage({
        type: 'success',
        text: `Центральный источник успешно создан и привязан к "${gitSource.name}"!`,
      });
      if (onRefreshData) await onRefreshData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Ошибка создания центрального источника' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveSourceParams = async () => {
    setIsSaving(true);
    setStatusMessage(null);
    try {
      await onSave({
        content,
        autoSyncEnabled: autoSync,
        filename,
        centralRawUrl,
        repositoryUrl,
        autoSyncIntervalSeconds: autoSyncInterval,
      });
      setStatusMessage({
        type: 'success',
        text: 'Параметры центрального источника и репозитория успешно сохранены!',
      });
      if (onRefreshData) await onRefreshData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Ошибка сохранения' });
    } finally {
      setIsSaving(false);
    }
  };

  const [isPushingAll, setIsPushingAll] = useState(false);
  const handlePushAllFilesToGit = async () => {
    setIsPushingAll(true);
    setStatusMessage(null);
    try {
      const res = await pushAllRepoFiles();
      if (res.files) setRepoFiles(res.files);
      setStatusMessage({
        type: 'success',
        text: res.message || `Все файлы подписок (${res.totalSynced} шт.) успешно зафиксированы в репозитории!`,
      });
      if (onRefreshData) await onRefreshData();
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Ошибка фиксации файлов в репозитории',
      });
    } finally {
      setIsPushingAll(false);
    }
  };
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState<'push' | 'pull' | null>(null);
  const [isSyncingSubscribers, setIsSyncingSubscribers] = useState(false);
  const [lastSyncSubscribersResult, setLastSyncSubscribersResult] = useState<{
    syncedUsers: number;
    syncedExclusions: number;
    durationMs: number;
    timestamp: string;
  } | null>(null);
  const [lastGitPushResult, setLastGitPushResult] = useState<{
    success: boolean;
    timestamp: string;
    message: string;
    error?: string;
  } | null>(null);
  const [lastGitPullResult, setLastGitPullResult] = useState<{
    success: boolean;
    timestamp: string;
    message: string;
    error?: string;
  } | null>(null);
  const [lastSubscribersErrors, setLastSubscribersErrors] = useState<string[]>([]);
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditReport, setAuditReport] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showAddNodeModal, setShowAddNodeModal] = useState(false);

  // 3 сценария блокировок (Параметры и файлы-заглушки)
  // Сценарий 1: Пользователь удалил бота / вышел из канала
  const [botDeletedStubContent, setBotDeletedStubContent] = useState<string>(
    centralFile?.botDeletedStubContent || 'vless://00000000-0000-0000-0000-000000000000@127.0.0.1:443?encryption=none&security=none#⚠️ Доступ приостановлен: вы удалили или заблокировали бота'
  );
  const [botDeletedBlockHours, setBotDeletedBlockHours] = useState<number>(centralFile?.botDeletedBlockHours ?? 72);
  const [botDeletedMaxAttempts, setBotDeletedMaxAttempts] = useState<number>(centralFile?.botDeletedMaxAttempts ?? 3);
  const [botDeletedNotice, setBotDeletedNotice] = useState<string>(
    centralFile?.botDeletedNotice || 'Вы удалили или заблокировали бота. Сетевой доступ деактивирован. Запустите бота заново (/start) для восстановления.'
  );

  // Сценарий 2: Попытка привязки 2-го устройства
  const [deviceBindingStubContent, setDeviceBindingStubContent] = useState<string>(
    centralFile?.deviceBindingStubContent || 'vless://00000000-0000-0000-0000-000000000000@127.0.0.1:443?encryption=none&security=none#⚠️ Заблокировано: попытка привязки 2-го устройства (1 подписка = 1 устройство)'
  );
  const [deviceBindingBlockHours, setDeviceBindingBlockHours] = useState<number>(centralFile?.deviceBindingBlockHours ?? 24);
  const [deviceBindingMaxAttempts, setDeviceBindingMaxAttempts] = useState<number>(centralFile?.deviceBindingMaxAttempts ?? 3);
  const [deviceBindingNotice, setDeviceBindingNotice] = useState<string>(
    centralFile?.deviceBindingNotice || 'Зафиксирована попытка подключения со второго устройства. Правило сервиса: 1 подписка = строго 1 устройство. Доступ временно заблокирован.'
  );

  // Сценарий 3: Превышение лимита удалений (Перманентный бан)
  const [limitExceededStubContent, setLimitExceededStubContent] = useState<string>(
    centralFile?.limitExceededStubContent || 'vless://00000000-0000-0000-0000-000000000000@127.0.0.1:443?encryption=none&security=none#⛔ Перманентный бан: превышен лимит нарушений'
  );
  const [limitExceededBlockHours, setLimitExceededBlockHours] = useState<number>(centralFile?.limitExceededBlockHours ?? 0);
  const [limitExceededMaxAttempts, setLimitExceededMaxAttempts] = useState<number>(centralFile?.limitExceededMaxAttempts ?? 5);
  const [limitExceededNotice, setLimitExceededNotice] = useState<string>(
    centralFile?.limitExceededNotice || 'Подписка перманентно заблокирована из-за систематических нарушений правил сервиса. Для подачи апелляции используйте раздел помощи в боте.'
  );

  const [activeBlockingTab, setActiveBlockingTab] = useState<'all' | 'bot_deleted' | 'device_binding' | 'limit_exceeded'>('all');

  useEffect(() => {
    if (centralFile?.content !== undefined) {
      setContent(centralFile.content);
    }
    if (centralFile?.centralRawUrl) {
      setCentralRawUrl(centralFile.centralRawUrl);
    }
    if (centralFile?.filename) {
      setFilename(centralFile.filename);
    }
    if (centralFile?.autoSyncIntervalSeconds) {
      setAutoSyncInterval(centralFile.autoSyncIntervalSeconds);
    }
    if (centralFile?.autoSyncEnabled !== undefined) {
      setAutoSync(centralFile.autoSyncEnabled);
    }
    if (centralFile?.botDeletedStubContent !== undefined) {
      setBotDeletedStubContent(centralFile.botDeletedStubContent);
    }
    if (centralFile?.botDeletedBlockHours !== undefined) {
      setBotDeletedBlockHours(centralFile.botDeletedBlockHours);
    }
    if (centralFile?.botDeletedMaxAttempts !== undefined) {
      setBotDeletedMaxAttempts(centralFile.botDeletedMaxAttempts);
    }
    if (centralFile?.botDeletedNotice !== undefined) {
      setBotDeletedNotice(centralFile.botDeletedNotice);
    }

    if (centralFile?.deviceBindingStubContent !== undefined) {
      setDeviceBindingStubContent(centralFile.deviceBindingStubContent);
    }
    if (centralFile?.deviceBindingBlockHours !== undefined) {
      setDeviceBindingBlockHours(centralFile.deviceBindingBlockHours);
    }
    if (centralFile?.deviceBindingMaxAttempts !== undefined) {
      setDeviceBindingMaxAttempts(centralFile.deviceBindingMaxAttempts);
    }
    if (centralFile?.deviceBindingNotice !== undefined) {
      setDeviceBindingNotice(centralFile.deviceBindingNotice);
    }

    if (centralFile?.limitExceededStubContent !== undefined) {
      setLimitExceededStubContent(centralFile.limitExceededStubContent);
    }
    if (centralFile?.limitExceededBlockHours !== undefined) {
      setLimitExceededBlockHours(centralFile.limitExceededBlockHours);
    }
    if (centralFile?.limitExceededMaxAttempts !== undefined) {
      setLimitExceededMaxAttempts(centralFile.limitExceededMaxAttempts);
    }
    if (centralFile?.repositoryUrl) {
      setRepositoryUrl(centralFile.repositoryUrl);
    } else if (gitSource) {
      setRepositoryUrl(getProviderRepoUrl(gitSource));
    }
  }, [centralFile, gitSource]);

  // Repo Files & Free Links Pool State
  const [repoFiles, setRepoFiles] = useState<RepoUserFile[]>([]);
  const [loadingRepoFiles, setLoadingRepoFiles] = useState(false);
  const [repoFilter, setRepoFilter] = useState<'all' | 'free' | 'assigned'>('all');
  const [generateCount, setGenerateCount] = useState<number>(3);
  const [isGenerating, setIsGenerating] = useState(false);
  const [checkingFile, setCheckingFile] = useState<string | null>(null);
  const [isCheckingAll, setIsCheckingAll] = useState(false);
  const [previewContent, setPreviewContent] = useState<{ path: string; text: string; nodes: number; size: number } | null>(null);
  const [copiedFileUrl, setCopiedFileUrl] = useState<string | null>(null);

  // New Node Form
  const [newNode, setNewNode] = useState({
    protocol: 'vless',
    countryCode: 'NL',
    countryName: 'Netherlands',
    server: 'nl-ams2.access-node.net',
    port: '443',
    uuid: '8a7b3c21-5d6e-4f3a-9c1b-2e4d6f8a0b2c',
    sni: 'gateway.icloud.com',
    pbk: 'xJ8qZ7vKp2mN5wY8rT3uI1oL4eA9sD6fG2hJ0kL',
  });

  // Calculate live stats
  const lines = content.split('\n').filter((l) => l.trim().length > 0 && !l.startsWith('#'));
  const vlessCount = lines.filter((l) => l.startsWith('vless://')).length;
  const vmessCount = lines.filter((l) => l.startsWith('vmess://')).length;
  const ssCount = lines.filter((l) => l.startsWith('ss://')).length;
  const trojanCount = lines.filter((l) => l.startsWith('trojan://')).length;
  const wgCount = lines.filter((l) => l.startsWith('wireguard://') || l.includes('[Interface]')).length;

  const loadRepoFiles = async () => {
    setLoadingRepoFiles(true);
    try {
      const data = await fetchRepoFiles();
      setRepoFiles(data.files || []);
    } catch (err) {
      console.error('Error fetching repo files:', err);
    } finally {
      setLoadingRepoFiles(false);
    }
  };

  useEffect(() => {
    loadRepoFiles();
  }, []);

  const handleGenerateFree = async () => {
    setIsGenerating(true);
    try {
      const res = await generateFreeRepoFiles(generateCount);
      await loadRepoFiles();
      setStatusMessage({ type: 'success', text: res.message || `Создано ${res.created.length} свободных файлов в репозитории!` });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Ошибка создания файлов' });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCheckFile = async (file: RepoUserFile) => {
    setCheckingFile(file.filePath);
    try {
      const result = await checkRepoFileUrl(file.rawUrl, file.filePath);
      setRepoFiles((prev) =>
        prev.map((f) =>
          f.filePath === file.filePath
            ? {
                ...f,
                isAccessible: result.isAccessible,
                httpStatus: result.status,
                latencyMs: result.latencyMs,
                sizeBytes: result.sizeBytes,
                nodesFound: result.nodesCount,
                checkError: result.error,
                lastCheckedAt: new Date().toISOString(),
              }
            : f
        )
      );
      if (result.preview) {
        setPreviewContent({
          path: file.filePath,
          text: result.preview,
          nodes: result.nodesCount,
          size: result.sizeBytes,
        });
      }
    } catch (err: any) {
      console.error('Error checking file URL:', err);
    } finally {
      setCheckingFile(null);
    }
  };

  const handleCheckAllFiles = async () => {
    setIsCheckingAll(true);
    try {
      for (const file of repoFiles) {
        try {
          const result = await checkRepoFileUrl(file.rawUrl, file.filePath);
          setRepoFiles((prev) =>
            prev.map((f) =>
              f.filePath === file.filePath
                ? {
                    ...f,
                    isAccessible: result.isAccessible,
                    httpStatus: result.status,
                    latencyMs: result.latencyMs,
                    sizeBytes: result.sizeBytes,
                    nodesFound: result.nodesCount,
                    checkError: result.error,
                    lastCheckedAt: new Date().toISOString(),
                  }
                : f
            )
          );
        } catch {}
      }
      setStatusMessage({ type: 'success', text: 'Все файлы подписок проверены на доступность!' });
    } finally {
      setIsCheckingAll(false);
    }
  };

  const handleDeleteFile = async (filePath: string) => {
    if (!window.confirm(`Удалить файл подписки ${filePath} из репозитория?`)) return;
    try {
      await deleteRepoFile(filePath);
      setRepoFiles((prev) => prev.filter((f) => f.filePath !== filePath));
      setStatusMessage({ type: 'success', text: `Файл ${filePath} удален из репозитория.` });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Ошибка удаления' });
    }
  };

  const handleCopyFileLink = (url: string, path: string) => {
    navigator.clipboard.writeText(url);
    setCopiedFileUrl(path);
    setTimeout(() => setCopiedFileUrl(null), 2000);
  };

  const freeCount = repoFiles.filter((f) => !f.userId || f.isPoolFree).length;
  const assignedCount = repoFiles.filter((f) => f.userId && !f.isPoolFree).length;
  const accessibleCount = repoFiles.filter((f) => f.isAccessible).length;

  const filteredRepoFiles = repoFiles.filter((f) => {
    if (repoFilter === 'free') return !f.userId || f.isPoolFree;
    if (repoFilter === 'assigned') return f.userId && !f.isPoolFree;
    return true;
  });

  const handleSave = async () => {
    setIsSaving(true);
    setStatusMessage(null);
    try {
      await onSave({
        content,
        autoSyncEnabled: autoSync,
        filename,
        centralRawUrl,
        repositoryUrl,
        autoSyncIntervalSeconds: autoSyncInterval,
        // 3 сценария блокировок
        botDeletedStubContent,
        botDeletedBlockHours,
        botDeletedMaxAttempts,
        botDeletedNotice,
        deviceBindingStubContent,
        deviceBindingBlockHours,
        deviceBindingMaxAttempts,
        deviceBindingNotice,
        limitExceededStubContent,
        limitExceededBlockHours,
        limitExceededMaxAttempts,
        limitExceededNotice,
      });
      setStatusMessage({
        type: 'success',
        text: 'Центральная подписка и параметры 3 типов блокировок успешно сохранены в системе!',
      });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Ошибка сохранения' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSyncToSubscribers = async () => {
    setIsSyncingSubscribers(true);
    setStatusMessage(null);
    setLastSubscribersErrors([]);
    const nowTime = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    try {
      let res: any;
      if (onSyncToSubscribers) {
        res = await onSyncToSubscribers();
      } else {
        res = await syncCentralToSubscribers();
      }
      setLastSyncSubscribersResult({
        syncedUsers: res.syncResult?.syncedUsers ?? 0,
        syncedExclusions: res.syncResult?.syncedExclusions ?? 0,
        durationMs: res.syncResult?.durationMs ?? 0,
        timestamp: nowTime,
      });

      const errors = res.syncResult?.errors || [];
      if (errors.length > 0) {
        setLastSubscribersErrors(errors);
        setStatusMessage({
          type: 'error',
          text: `Синхронизация завершена с ошибками: ${errors.length} файлов не удалось обновить в GitVerse!`,
        });
      } else {
        setStatusMessage({
          type: 'success',
          text: res.message || 'Центральная подписка успешно перенесена по всем активным файлам подписчиков!',
        });
      }
      await loadRepoFiles();
    } catch (err: any) {
      const errMsg = err.message || 'Ошибка синхронизации с подписками';
      setLastSubscribersErrors([errMsg]);
      setStatusMessage({ type: 'error', text: errMsg });
    } finally {
      setIsSyncingSubscribers(false);
    }
  };

  const handleDeepAuditForceSync = async () => {
    setIsAuditing(true);
    setStatusMessage(null);
    setLastSubscribersErrors([]);
    const nowTime = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    try {
      const res = await deepAuditAndForceSync();
      setAuditReport(res.audit);
      if (res.audit?.errors && res.audit.errors.length > 0) {
        setLastSubscribersErrors(res.audit.errors);
        setStatusMessage({
          type: 'error',
          text: `Аудит завершен с ошибками: ${res.audit.errors.length} файлов вызвали сбой при записи в subs/.`,
        });
      } else {
        setStatusMessage({
          type: 'success',
          text: res.message || `Глубокий аудит успешно завершен (${nowTime})! Все файлы в subs/ актуализированы.`,
        });
      }
      setLastSyncSubscribersResult({
        syncedUsers: res.audit?.syncedUsers ?? 0,
        syncedExclusions: res.audit?.syncedExclusions ?? 0,
        durationMs: res.audit?.durationMs ?? 0,
        timestamp: nowTime,
      });
      await loadRepoFiles();
    } catch (err: any) {
      const errMsg = err.message || 'Ошибка выполнения глубокого аудита';
      setLastSubscribersErrors([errMsg]);
      setStatusMessage({ type: 'error', text: errMsg });
    } finally {
      setIsAuditing(false);
    }
  };

  const handleAutoSyncIntervalChange = async (newSec: number) => {
    setAutoSyncInterval(newSec);
    try {
      if (onUpdateAutoSyncConfig) {
        await onUpdateAutoSyncConfig(newSec, autoSync);
      } else {
        await updateCentralAutoSyncConfig(newSec, autoSync);
      }
      setStatusMessage({
        type: 'success',
        text: `Интервал фоновой авто-синхронизации установлен на ${newSec} сек.`,
      });
    } catch (err: any) {
      console.warn('Failed updating auto sync interval:', err);
    }
  };

  const handleAutoSyncToggle = async (enabled: boolean) => {
    setAutoSync(enabled);
    try {
      if (onUpdateAutoSyncConfig) {
        await onUpdateAutoSyncConfig(autoSyncInterval, enabled);
      } else {
        await updateCentralAutoSyncConfig(autoSyncInterval, enabled);
      }
    } catch (err: any) {
      console.warn('Failed updating auto sync enabled state:', err);
    }
  };

  const handleSyncAction = async (direction: 'push' | 'pull') => {
    setIsSyncing(direction);
    setStatusMessage(null);
    const nowTime = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    try {
      await onSync(direction, centralRawUrl);
      const successMsg = direction === 'push'
        ? `Конфигурация успешно зафиксирована в репозитории GitVerse (${nowTime})!`
        : `Свежая конфигурация успешно загружена из источника RAW: ${centralRawUrl} (${nowTime})`;
      setStatusMessage({
        type: 'success',
        text: successMsg,
      });
      if (direction === 'push') {
        setLastGitPushResult({ success: true, timestamp: nowTime, message: successMsg });
      } else {
        setLastGitPullResult({ success: true, timestamp: nowTime, message: successMsg });
      }
    } catch (err: any) {
      const errMsg = err.message || 'Ошибка синхронизации';
      setStatusMessage({ type: 'error', text: errMsg });
      if (direction === 'push') {
        setLastGitPushResult({ success: false, timestamp: nowTime, message: 'Сбой отправки в GitVerse', error: errMsg });
      } else {
        setLastGitPullResult({ success: false, timestamp: nowTime, message: 'Сбой загрузки из GitVerse', error: errMsg });
      }
    } finally {
      setIsSyncing(null);
    }
  };

  const handlePullFromCentralSource = async () => {
    await handleSyncAction('pull');
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAddNodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let nodeUri = '';
    if (newNode.protocol === 'vless') {
      nodeUri = `vless://${newNode.uuid}@${newNode.server}:${newNode.port}?encryption=none&security=reality&sni=${newNode.sni}&fp=chrome&pbk=${newNode.pbk}&sid=4a2c&type=tcp#${newNode.countryName}`;
    } else if (newNode.protocol === 'ss') {
      const base64Creds = btoa('chacha20-ietf-poly1305:Password123');
      nodeUri = `ss://${base64Creds}@${newNode.server}:${newNode.port}#${newNode.countryName}`;
    } else {
      nodeUri = `trojan://Password123@${newNode.server}:${newNode.port}?security=tls&sni=${newNode.sni}#${newNode.countryName}`;
    }

    const updated = content.trim() ? `${content.trim()}\n${nodeUri}` : nodeUri;
    setContent(updated);
    setShowAddNodeModal(false);
    setStatusMessage({ type: 'success', text: `Узел ${newNode.countryName} успешно добавлен в список!` });
  };

  return (
    <div id="central-subscription-view" className="space-y-6">
      {/* Top Banner and Actions */}
      <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-xl font-bold text-stone-900">
                Центральная подписка (Источник конфигураций)
              </h2>
              <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                {lines.length} узлов
              </span>
            </div>
            <p className="text-xs text-stone-500 mt-1">
              Редактируйте список узлов прямо здесь или в Git-репозитории. Изменения автоматически подтягиваются и распространяются пользователям через бота.
            </p>
          </div>

          {/* Sync & Save Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              id="btn-add-node"
              onClick={() => setShowAddNodeModal(true)}
              className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl border border-stone-200 hover:bg-stone-50 text-stone-700 text-xs font-semibold transition-colors cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Добавить узел</span>
            </button>

            <button
              id="btn-pull-git"
              onClick={() => handleSyncAction('pull')}
              disabled={isSyncing !== null}
              className={`inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer ${
                lastGitPullResult && !lastGitPullResult.success
                  ? 'border-rose-300 bg-rose-50 text-rose-800'
                  : lastGitPullResult?.success
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                  : 'border-stone-200 hover:bg-stone-50 text-stone-700'
              }`}
              title="Загрузить изменения из репозитория GitVerse"
            >
              <ArrowDownToLine className={`h-3.5 w-3.5 ${isSyncing === 'pull' ? 'animate-bounce' : ''}`} />
              <span>Подтянуть из Git</span>
              {lastGitPullResult && (
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${lastGitPullResult.success ? 'bg-emerald-200 text-emerald-900' : 'bg-rose-200 text-rose-900'}`}>
                  {lastGitPullResult.success ? 'OK' : 'ERR'}
                </span>
              )}
            </button>

            <button
              id="btn-push-git"
              onClick={() => handleSyncAction('push')}
              disabled={isSyncing !== null}
              className={`inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer ${
                lastGitPushResult && !lastGitPushResult.success
                  ? 'border-rose-300 bg-rose-50 text-rose-800'
                  : lastGitPushResult?.success
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                  : 'border-stone-200 hover:bg-stone-50 text-stone-700'
              }`}
              title="Закоммитить и отправить в Git-репозиторий GitVerse"
            >
              <ArrowUpFromLine className={`h-3.5 w-3.5 ${isSyncing === 'push' ? 'animate-bounce' : ''}`} />
              <span>Запушить в Git</span>
              {lastGitPushResult && (
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${lastGitPushResult.success ? 'bg-emerald-200 text-emerald-900' : 'bg-rose-200 text-rose-900'}`}>
                  {lastGitPushResult.success ? 'OK' : 'ERR'}
                </span>
              )}
            </button>

            <button
              id="btn-audit-force-sync-central"
              onClick={handleDeepAuditForceSync}
              disabled={isAuditing || isSyncingSubscribers}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition-all disabled:opacity-50 cursor-pointer"
              title="Полная сверка GitVerse, сканирование subs/ и принудительная запись минуя кэш"
            >
              <Zap className={`h-3.5 w-3.5 text-amber-300 ${isAuditing ? 'animate-bounce' : ''}`} />
              <span>{isAuditing ? 'Аудит и запись...' : 'Аудит и принудительная синхронизация'}</span>
            </button>

            {onNavigateToProcessor && (
              <button
                type="button"
                id="btn-goto-key-processor"
                onClick={onNavigateToProcessor}
                className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-200 text-xs font-semibold transition-colors shadow-xs cursor-pointer"
                title="Перейти в инструмент пакетной обработки ключей (Remarks, UID, авто-флаги, актуализация)"
              >
                <Sliders className="h-3.5 w-3.5 text-stone-600" />
                <span>Обработка ключей</span>
              </button>
            )}

            {onNavigateToLogs && (
              <button
                type="button"
                id="btn-goto-sync-logs"
                onClick={onNavigateToLogs}
                className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-200 text-xs font-semibold transition-colors shadow-xs cursor-pointer"
                title="Открыть подробный журнал процессов и синхронизации"
              >
                <Terminal className="h-3.5 w-3.5 text-stone-600" />
                <span>Журнал логов</span>
              </button>
            )}

            <button
              id="btn-sync-to-subscribers"
              onClick={handleSyncToSubscribers}
              disabled={isSyncingSubscribers || isSaving || isAuditing}
              className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-all shadow-xs disabled:opacity-50 active:scale-95 cursor-pointer"
              title="Мгновенно перенести текущее содержимое центральной подписки во все персональные файлы активных подписчиков"
            >
              <Zap className={`h-3.5 w-3.5 text-amber-300 ${isSyncingSubscribers ? 'animate-bounce' : ''}`} />
              <span>{isSyncingSubscribers ? 'Синхронизация...' : 'Синхронизировать с подписками'}</span>
            </button>

            <button
              id="btn-save-central-file"
              onClick={handleSave}
              disabled={isSaving}
              className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
            >
              <Save className="h-3.5 w-3.5 text-amber-400" />
              <span>{isSaving ? 'Сохранение...' : 'Сохранить'}</span>
            </button>
          </div>
        </div>

        {/* Visual Error Banner for Git Push Failure */}
        {lastGitPushResult && !lastGitPushResult.success && (
          <div className="mt-4 p-4 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 text-xs shadow-xs animate-fade-in flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start space-x-3">
              <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-rose-950 text-sm block">
                  Ошибка отправки в GitVerse ({lastGitPushResult.timestamp}):
                </span>
                <p className="mt-0.5 text-rose-800 leading-relaxed font-mono">
                  {lastGitPushResult.error || lastGitPushResult.message}
                </p>
                <p className="text-[11px] text-rose-700 mt-1">
                  Файлы в репозитории не были обновлены. Проверьте права токена в репозитории или запустите принудительную синхронизацию.
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2 shrink-0">
              <button
                onClick={handleDeepAuditForceSync}
                className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold transition-colors cursor-pointer"
              >
                Аудит и принудительно
              </button>
              {onNavigateToLogs && (
                <button
                  onClick={onNavigateToLogs}
                  className="px-3 py-1.5 rounded-lg border border-rose-300 bg-white text-rose-800 font-semibold hover:bg-rose-100 transition-colors cursor-pointer"
                >
                  Открыть логи →
                </button>
              )}
            </div>
          </div>
        )}

        {/* Visual Error Banner for Subscribers Sync Failure */}
        {lastSubscribersErrors.length > 0 && (
          <div className="mt-4 p-4 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 text-xs shadow-xs animate-fade-in flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start space-x-3">
              <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-rose-950 text-sm block">
                  Сбой записи файлов подписчиков в каталог subs/ ({lastSubscribersErrors.length} ошибок):
                </span>
                <p className="mt-0.5 text-rose-800 leading-relaxed font-mono text-[11px]">
                  {lastSubscribersErrors.slice(0, 3).join('; ')}
                </p>
                <p className="text-[11px] text-rose-700 mt-1">
                  Обновления не достигли некоторых файлов в subs/. Запустите глубокий аудит для повторной записи без кэша.
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2 shrink-0">
              <button
                onClick={handleDeepAuditForceSync}
                className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold transition-colors cursor-pointer"
              >
                Принудительная запись
              </button>
              {onNavigateToLogs && (
                <button
                  onClick={onNavigateToLogs}
                  className="px-3 py-1.5 rounded-lg border border-rose-300 bg-white text-rose-800 font-semibold hover:bg-rose-100 transition-colors cursor-pointer"
                >
                  Логи →
                </button>
              )}
            </div>
          </div>
        )}

        {/* Status notification */}
        {statusMessage && (
          <div
            id="central-file-alert"
            className={`mt-4 p-3 rounded-xl flex items-center space-x-2 text-xs font-medium border ${
              statusMessage.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Last Sync to Subscribers Report if performed */}
        {lastSyncSubscribersResult && (
          <div className="mt-3 p-3.5 rounded-xl bg-emerald-50/80 border border-emerald-200 flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-900 shadow-xs animate-fade-in">
            <div className="flex items-center space-x-2.5">
              <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
              <div>
                <span className="font-semibold">Синхронизация с подписчиками выполнена ({lastSyncSubscribersResult.timestamp}):</span>{' '}
                <span>
                  {lastSyncSubscribersResult.syncedUsers} активных файлов пользователей обновлено, {lastSyncSubscribersResult.syncedExclusions} исключений актуализировано.
                </span>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 text-[11px] font-bold">
                <Zap className="h-3 w-3 text-amber-600 fill-amber-500" />
                <span>{lastSyncSubscribersResult.durationMs} мс</span>
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-200 text-emerald-800 text-[11px] font-bold">
                Все пользователи синхронизированы
              </span>
            </div>
          </div>
        )}

        {/* Auto-Sync & Frequency Settings Controls */}
        <div className="mt-5 pt-4 border-t border-stone-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center space-x-3">
            <label className="relative inline-flex items-center cursor-pointer mt-0.5 sm:mt-0">
              <input
                type="checkbox"
                id="toggle-autosync"
                checked={autoSync}
                onChange={(e) => handleAutoSyncToggle(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-stone-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-semibold text-stone-900">
                  Авто-синхронизация подписок (фоновое распространение)
                </span>
                {autoSync ? (
                  <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold border border-emerald-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                    <span>Активна (каждые {autoSyncInterval} сек.)</span>
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 text-[10px] font-semibold border border-stone-200">
                    Приостановлена
                  </span>
                )}
              </div>
              <span className="text-xs text-stone-500 block mt-0.5">
                При изменении центрального файла узлы переносятся по всем файлам подписок (кроме замученных, забаненных и отписавшихся).
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center space-x-1.5">
              <Clock className="h-3.5 w-3.5 text-stone-500" />
              <span className="text-stone-600 font-medium">Интервал:</span>
              <select
                id="select-autosync-interval"
                value={autoSyncInterval}
                onChange={(e) => handleAutoSyncIntervalChange(Number(e.target.value))}
                className="px-2.5 py-1 rounded-lg border border-stone-200 text-stone-800 bg-stone-50 text-xs font-medium focus:bg-white focus:outline-none focus:border-stone-400 cursor-pointer"
              >
                <option value={1}>1 секунда (по умолчанию)</option>
                <option value={2}>2 секунды</option>
                <option value={3}>3 секунды</option>
                <option value={5}>5 секунд</option>
                <option value={10}>10 секунд</option>
                <option value={30}>30 секунд</option>
                <option value={60}>60 секунд</option>
              </select>
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-stone-500">Имя файла:</span>
              <input
                type="text"
                id="input-central-filename"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                className="px-2.5 py-1 rounded-lg border border-stone-200 text-stone-800 bg-stone-50 font-mono text-xs focus:bg-white focus:outline-none focus:border-stone-400 w-20"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Central Source and Repository Definition Card */}
      <div className="bg-gradient-to-br from-amber-500/10 via-stone-50 to-emerald-500/10 border border-amber-200/80 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-200/80">
          <div className="flex items-center space-x-2.5">
            <div className="h-8 w-8 rounded-xl bg-amber-500 text-stone-900 flex items-center justify-center font-bold text-sm shrink-0">
              L
            </div>
            <div>
              <h3 className="text-sm font-bold text-stone-900">
                Центральный источник узлов и Репозиторий создания подписок
              </h3>
              <p className="text-xs text-stone-600">
                Из этого источника берутся узлы, а персональные подписки создаются строго в указанном Git-репозитории.
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2 flex-wrap gap-2">
            <div className="flex items-center space-x-1.5 bg-stone-100/90 px-2.5 py-1 rounded-xl border border-stone-200">
              <span className="text-[11px] font-bold text-stone-700">Активный Git:</span>
              <select
                value={gitSource?.id || ''}
                onChange={(e) => handleSelectGitSource(e.target.value)}
                className="bg-white border border-stone-300 rounded-lg px-2 py-0.5 text-xs font-bold text-stone-900 cursor-pointer focus:ring-1 focus:ring-amber-500"
              >
                {gitSources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.provider === 'sourcecraft' ? 'SourceCraft' : s.provider.toUpperCase()}: {s.repository})
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={handleApplyActiveGitConfig}
              className="px-2.5 py-1 text-xs font-bold rounded-lg bg-amber-500 hover:bg-amber-600 text-stone-900 border border-amber-600/30 transition-all flex items-center space-x-1 shadow-2xs cursor-pointer"
              title="Применить адрес RAW и репозиторий из текущего активного Git источника"
            >
              <RefreshCw className="h-3 w-3" />
              <span>Применить адрес</span>
            </button>
            <button
              type="button"
              onClick={handleMakeCentralFromActive}
              disabled={isSaving}
              className="px-2.5 py-1 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-all flex items-center space-x-1 shadow-2xs cursor-pointer"
              title="Создать центральный источник и зафиксировать мастер-файл в этом репозитории"
            >
              <Globe className={`h-3 w-3 ${isSaving ? 'animate-spin' : ''}`} />
              <span>Сделать центральным</span>
            </button>
            <button
              type="button"
              onClick={handlePushAllFilesToGit}
              disabled={isPushingAll}
              className="px-2.5 py-1 text-xs font-bold rounded-lg bg-stone-900 hover:bg-stone-800 text-amber-400 border border-amber-400/30 transition-all flex items-center space-x-1 shadow-2xs cursor-pointer"
              title="Зафиксировать и отправить все подписки в репозиторий Git"
            >
              <RefreshCw className={`h-3 w-3 ${isPushingAll ? 'animate-spin' : ''}`} />
              <span>{isPushingAll ? 'Отправка...' : 'Отправить все подписки в Git'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
          {/* Central Source URL */}
          <div className="space-y-1.5 bg-white p-3.5 rounded-xl border border-stone-200 shadow-2xs">
            <div className="flex items-center justify-between">
              <label className="font-bold text-stone-900 flex items-center space-x-1.5">
                <Globe className="h-3.5 w-3.5 text-amber-600" />
                <span>Центральный источник (по умолчанию, можно поменять)</span>
              </label>
              <button
                type="button"
                id="btn-pull-from-central"
                onClick={handlePullFromCentralSource}
                disabled={isSyncing !== null}
                className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold text-[11px] transition-colors flex items-center space-x-1 disabled:opacity-50 cursor-pointer"
                title="Загрузить текущие узлы по этой ссылке в редактор"
              >
                <ArrowDownToLine className={`h-3 w-3 ${isSyncing === 'pull' ? 'animate-bounce' : ''}`} />
                <span>{isSyncing === 'pull' ? 'Загрузка...' : 'Загрузить из источника'}</span>
              </button>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                id="input-central-raw-url"
                value={centralRawUrl}
                onChange={(e) => setCentralRawUrl(e.target.value)}
                placeholder={getProviderRawUrl(gitSource, filename)}
                className="w-full px-3 py-1.5 rounded-lg border border-stone-200 text-stone-900 bg-stone-50 font-mono text-xs focus:bg-white focus:outline-none focus:border-amber-500"
              />
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(centralRawUrl);
                  setStatusMessage({ type: 'success', text: 'Ссылка на центральный источник скопирована в буфер обмена!' });
                }}
                className="p-1.5 rounded-lg border border-stone-200 hover:bg-stone-50 text-stone-600 shrink-0 cursor-pointer"
                title="Скопировать ссылку"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
              <a
                href={centralRawUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded-lg border border-stone-200 hover:bg-stone-50 text-stone-600 hover:text-sky-600 shrink-0"
                title="Открыть в браузере"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
            <p className="text-[11px] text-stone-500 leading-tight">
              Вот его вы меняете, сохраняете и из него формируются все подписки пользователей.
            </p>
          </div>

          {/* Target Subscription Repository */}
          <div className="space-y-1.5 bg-white p-3.5 rounded-xl border border-stone-200 shadow-2xs">
            <div className="flex items-center justify-between">
              <label className="font-bold text-stone-900 flex items-center space-x-1.5">
                <Server className="h-3.5 w-3.5 text-emerald-600" />
                <span>Репозиторий создания подписок (по умолчанию, можно поменять)</span>
              </label>
              <span className="text-[11px] font-mono text-stone-500">
                ветка {gitSource?.branch || (gitSource?.provider === 'sourcecraft' || gitSource?.provider === 'github' ? 'main' : 'master')}
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                id="input-repo-url"
                value={repositoryUrl}
                onChange={(e) => setRepositoryUrl(e.target.value)}
                placeholder={getProviderRepoUrl(gitSource)}
                className="w-full px-3 py-1.5 rounded-lg border border-stone-200 text-stone-900 bg-stone-50 font-mono text-xs focus:bg-white focus:outline-none focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(repositoryUrl);
                  setStatusMessage({ type: 'success', text: 'Ссылка на репозиторий подписок скопирована в буфер обмена!' });
                }}
                className="p-1.5 rounded-lg border border-stone-200 hover:bg-stone-50 text-stone-600 shrink-0 cursor-pointer"
                title="Скопировать ссылку"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
              <a
                href={repositoryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded-lg border border-stone-200 hover:bg-stone-50 text-stone-600 hover:text-emerald-600 shrink-0"
                title="Открыть репозиторий"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
            <p className="text-[11px] text-stone-500 leading-tight">
              Подписки создаются строго в этом репозитории (<span className="font-mono text-stone-700">subs/sub_*.txt</span>). И ничего больше, никаких лишних ссылок и сторонних сокращателей.
            </p>
          </div>
        </div>

        {/* Action Row: Save Configuration Button */}
        <div className="flex items-center justify-between pt-2 border-t border-stone-200/80">
          <span className="text-[11px] text-stone-500">
            После изменения URL центрального источника или репозитория нажмите «Сохранить параметры источника»
          </span>
          <button
            type="button"
            onClick={handleSaveSourceParams}
            disabled={isSaving}
            className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-amber-500 hover:bg-amber-600 text-stone-900 transition-all flex items-center space-x-1.5 shadow-xs cursor-pointer disabled:opacity-50"
            title="Сохранить параметры центрального источника и репозитория"
          >
            <CheckCircle2 className={`h-3.5 w-3.5 ${isSaving ? 'animate-spin' : ''}`} />
            <span>{isSaving ? 'Сохранение...' : 'Сохранить параметры источника'}</span>
          </button>
        </div>
      </div>

      {/* Protocol Breakdown Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white border border-stone-200 rounded-xl p-3 text-center">
          <span className="text-xs text-stone-400 block font-medium">VLESS (Reality)</span>
          <span className="text-xl font-bold text-stone-900 mt-1 block">{vlessCount}</span>
        </div>
        <div className="bg-white border border-stone-200 rounded-xl p-3 text-center">
          <span className="text-xs text-stone-400 block font-medium">VMess</span>
          <span className="text-xl font-bold text-stone-900 mt-1 block">{vmessCount}</span>
        </div>
        <div className="bg-white border border-stone-200 rounded-xl p-3 text-center">
          <span className="text-xs text-stone-400 block font-medium">Shadowsocks</span>
          <span className="text-xl font-bold text-stone-900 mt-1 block">{ssCount}</span>
        </div>
        <div className="bg-white border border-stone-200 rounded-xl p-3 text-center">
          <span className="text-xs text-stone-400 block font-medium">Trojan (TLS)</span>
          <span className="text-xl font-bold text-stone-900 mt-1 block">{trojanCount}</span>
        </div>
        <div className="bg-white border border-stone-200 rounded-xl p-3 text-center">
          <span className="text-xs text-stone-400 block font-medium">WireGuard</span>
          <span className="text-xl font-bold text-stone-900 mt-1 block">{wgCount}</span>
        </div>
      </div>

      {/* Editor Container */}
      <div className="bg-white border border-stone-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="bg-stone-50 px-5 py-3 border-b border-stone-200 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2 font-mono text-stone-600">
            <FileCode className="h-4 w-4 text-stone-400" />
            <span>{filename}</span>
            <span className="text-stone-300">•</span>
            <span>{content.split('\n').length} строк</span>
            <span className="text-stone-300">•</span>
            {content.includes('🟨') && (
              <>
                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 font-bold border border-amber-300 text-[10px] flex items-center gap-1">
                  <span>🟨</span>
                  <span>{content.split(/🟨{10,}/).filter((s) => s.trim().length > 0).length} секций</span>
                </span>
                <span className="text-stone-300">•</span>
              </>
            )}
            <span>{(new Blob([content]).size / 1024).toFixed(1)} КБ</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              id="btn-insert-section-divider"
              onClick={() => {
                const divider = '\n🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨\n';
                setContent((prev) => `${prev.trim()}${divider}`);
                setStatusMessage({ type: 'success', text: 'Разделитель секций 🟨 добавлен в конец файла!' });
              }}
              className="text-xs px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 font-medium transition-colors flex items-center gap-1 shadow-xs"
              title="Вставить разделитель секций (🟨🟨...) для разделения категорий ключей"
            >
              <span>🟨</span>
              <span>Разделитель строк</span>
            </button>

            <button
              type="button"
              id="btn-insert-profile-header"
              onClick={() => {
                const header = `#profile-title: Vay VPN [Проверка]\n#profile-update-interval: 1h\n#subscription-userinfo: upload=0; download=9634698736256; total=0; expire=0\n#Support-Url: https://t.me/Vaynet_vpn\n#Announce: Делитесь со всеми данным сервисом. Ваша подписка является персональной, не для публичного пользования \nТелеграм👉 @Vaynet_vpn\n#providerid RFthi9YM\n#hide-settings: 1`;
                if (!content.includes('#profile-title:')) {
                  setContent(`${header}\n\n${content.trim()}`);
                } else {
                  const nodeIdx = content.search(/(vless|vmess|ss|trojan|wireguard):\/\//);
                  if (nodeIdx !== -1) {
                    setContent(`${header}\n\n${content.substring(nodeIdx).trim()}`);
                  } else {
                    setContent(header);
                  }
                }
              }}
              className="text-xs px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-medium transition-colors flex items-center gap-1 shadow-xs"
              title="Вставить или обновить служебный заголовок метаданных подписки Vay VPN перед ключами"
            >
              <Sparkles className="h-3 w-3 text-amber-600" />
              Вставить заголовок Vay VPN
            </button>

            <button
              id="btn-copy-content"
              onClick={handleCopy}
              className="flex items-center space-x-1 text-stone-600 hover:text-stone-900 font-medium text-xs px-2 py-1 rounded-lg hover:bg-stone-100"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="text-emerald-600">Скопировано</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Скопировать всё</span>
                </>
              )}
            </button>
          </div>
        </div>

        <div className="p-4">
          <textarea
            id="textarea-central-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={14}
            className="w-full font-mono text-xs sm:text-sm text-stone-900 bg-stone-50/50 p-4 rounded-xl border border-stone-200 focus:bg-white focus:outline-none focus:border-stone-400 leading-relaxed resize-y"
            placeholder="Вставьте ссылки на серверы (vless://, vmess://, ss://, trojan://)..."
          />
        </div>
      </div>

      {/* 3 Blocking Scenarios and Stub Files Configuration Section */}
      <div id="blocking-types-configuration-section" className="bg-white border border-stone-200 rounded-2xl p-6 shadow-xs space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-stone-200">
          <div className="flex items-start space-x-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-stone-900 to-amber-900 text-amber-400 flex items-center justify-center shrink-0 shadow-xs mt-0.5">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold text-stone-900">
                  Параметры 3 типов блокировок и файлы-заглушки
                </h3>
                <span className="px-2 py-0.5 text-[11px] font-semibold rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                  Мгновенная замена файлов
                </span>
              </div>
              <p className="text-xs text-stone-500 mt-1 max-w-2xl">
                Настройте параметры (часы блокировки, лимит попыток) и содержимое файлов-заглушек для каждого из 3 сценариев. При наступлении любого события персональный файл пользователя в GitVerse немедленно заменяется на соответствующую заглушку.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Filter buttons */}
            <div className="flex items-center space-x-1 bg-stone-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setActiveBlockingTab('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeBlockingTab === 'all'
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                Все 3 сценария
              </button>
              <button
                type="button"
                onClick={() => setActiveBlockingTab('bot_deleted')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center space-x-1.5 ${
                  activeBlockingTab === 'bot_deleted'
                    ? 'bg-white text-amber-900 shadow-xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <Bot className="h-3.5 w-3.5 text-amber-600" />
                <span>1. Удалил бота</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveBlockingTab('device_binding')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center space-x-1.5 ${
                  activeBlockingTab === 'device_binding'
                    ? 'bg-white text-indigo-900 shadow-xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <Smartphone className="h-3.5 w-3.5 text-indigo-600" />
                <span>2. Привязка устр.</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveBlockingTab('limit_exceeded')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center space-x-1.5 ${
                  activeBlockingTab === 'limit_exceeded'
                    ? 'bg-white text-rose-900 shadow-xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <Ban className="h-3.5 w-3.5 text-rose-600" />
                <span>3. Лимит удалений</span>
              </button>
            </div>

            <button
              type="button"
              id="btn-save-blocking-params-top"
              onClick={handleSave}
              disabled={isSaving}
              className="inline-flex items-center space-x-1.5 px-4 py-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-amber-400 text-xs font-bold transition-colors disabled:opacity-50 shadow-xs"
            >
              <Save className="h-3.5 w-3.5" />
              <span>{isSaving ? 'Сохранение...' : 'Сохранить параметры'}</span>
            </button>
          </div>
        </div>

        {/* 3 Scenarios Grid / Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* СЦЕНАРИЙ 1: Пользователь удалил бота / вышел из канала */}
          {(activeBlockingTab === 'all' || activeBlockingTab === 'bot_deleted') && (
            <div className="bg-amber-50/40 border border-amber-200/90 rounded-2xl p-4 flex flex-col justify-between space-y-4 hover:border-amber-300 transition-all">
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-amber-200/70">
                  <div className="flex items-center space-x-2">
                    <div className="p-1.5 bg-amber-100 rounded-lg text-amber-800">
                      <UserX className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-stone-900">
                        1. Пользователь удалил бота
                      </h4>
                      <span className="text-[10px] text-amber-800 font-medium">
                        (или покинул обязательный канал)
                      </span>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[10px] font-bold border border-amber-300">
                    Источник 1
                  </span>
                </div>

                <p className="text-xs text-stone-600 leading-relaxed">
                  При удалении бота или отписке от канала файл подписки моментально замещается на заглушку ниже. При возвращении в бота восстанавливается файл из центрального источника.
                </p>

                {/* Parameters inputs */}
                <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                  <div>
                    <label className="block text-[11px] font-semibold text-stone-700 mb-1">
                      Срок блокировки (часы):
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        id="input-bot-deleted-hours"
                        min={1}
                        max={8760}
                        value={botDeletedBlockHours}
                        onChange={(e) => setBotDeletedBlockHours(Math.max(1, Number(e.target.value)))}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-amber-300 bg-white text-xs font-semibold text-stone-900 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                      <span className="absolute right-2.5 top-1.5 text-stone-400 text-xs">ч.</span>
                    </div>
                    <span className="text-[10px] text-stone-500 block mt-0.5">Временный мут</span>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-stone-700 mb-1">
                      Лимит попыток:
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        id="input-bot-deleted-attempts"
                        min={1}
                        max={100}
                        value={botDeletedMaxAttempts}
                        onChange={(e) => setBotDeletedMaxAttempts(Math.max(1, Number(e.target.value)))}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-amber-300 bg-white text-xs font-semibold text-stone-900 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                      <span className="absolute right-2.5 top-1.5 text-stone-400 text-xs">раз</span>
                    </div>
                    <span className="text-[10px] text-stone-500 block mt-0.5">До пермбана</span>
                  </div>
                </div>

                {/* Notice text in bot */}
                <div>
                  <label className="block text-[11px] font-semibold text-stone-700 mb-1">
                    Текст причины в Telegram-боте:
                  </label>
                  <input
                    type="text"
                    id="input-bot-deleted-notice"
                    value={botDeletedNotice}
                    onChange={(e) => setBotDeletedNotice(e.target.value)}
                    placeholder="Вы удалили бота. Доступ деактивирован..."
                    className="w-full px-2.5 py-1.5 rounded-lg border border-amber-300 bg-white text-xs text-stone-900 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>

                {/* Stub File Content */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-bold text-stone-800 flex items-center space-x-1">
                      <span>Содержимое файла-заглушки (Stub):</span>
                    </label>
                    <div className="flex items-center space-x-1.5 text-[10px]">
                      <button
                        type="button"
                        onClick={() =>
                          setBotDeletedStubContent(
                            'vless://00000000-0000-0000-0000-000000000000@127.0.0.1:443?encryption=none&security=none#⚠️ Доступ приостановлен: вы удалили или заблокировали бота'
                          )
                        }
                        className="text-amber-800 hover:underline font-medium"
                      >
                        Стандарт
                      </button>
                      <span className="text-stone-300">|</span>
                      <button
                        type="button"
                        onClick={() => setBotDeletedStubContent('')}
                        className="text-stone-500 hover:text-stone-800"
                      >
                        Очистить
                      </button>
                    </div>
                  </div>
                  <textarea
                    id="textarea-bot-deleted-stub"
                    rows={4}
                    value={botDeletedStubContent}
                    onChange={(e) => setBotDeletedStubContent(e.target.value)}
                    placeholder="vless://00000000-0000-0000-0000-000000000000@127.0.0.1:443..."
                    className="w-full font-mono text-[11px] text-stone-900 bg-white p-2.5 rounded-xl border border-amber-300 focus:outline-none focus:ring-1 focus:ring-amber-500 leading-relaxed resize-y"
                  />
                  <div className="flex justify-between items-center text-[10px] text-stone-500 mt-1">
                    <span>Строк: {botDeletedStubContent.split('\n').filter(Boolean).length}</span>
                    <span className="text-amber-700 font-medium">Замещает персональный файл в Git</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* СЦЕНАРИЙ 2: Попытка привязки устройства (2-е устройство) */}
          {(activeBlockingTab === 'all' || activeBlockingTab === 'device_binding') && (
            <div className="bg-indigo-50/40 border border-indigo-200/90 rounded-2xl p-4 flex flex-col justify-between space-y-4 hover:border-indigo-300 transition-all">
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-indigo-200/70">
                  <div className="flex items-center space-x-2">
                    <div className="p-1.5 bg-indigo-100 rounded-lg text-indigo-800">
                      <Smartphone className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-stone-900">
                        2. Попытка привязки устройства
                      </h4>
                      <span className="text-[10px] text-indigo-800 font-medium">
                        (защита: 1 подписка = 1 устройство)
                      </span>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-900 text-[10px] font-bold border border-indigo-300">
                    Источник 2
                  </span>
                </div>

                <p className="text-xs text-stone-600 leading-relaxed">
                  Срабатывает при попытке обновить подписку с другого IP/User-Agent. Пользователь блокируется, файл заменяется на заглушку 2, а в панель падает заявка на отвязку.
                </p>

                {/* Parameters inputs */}
                <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                  <div>
                    <label className="block text-[11px] font-semibold text-stone-700 mb-1">
                      Срок блокировки (часы):
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        id="input-device-binding-hours"
                        min={1}
                        max={8760}
                        value={deviceBindingBlockHours}
                        onChange={(e) => setDeviceBindingBlockHours(Math.max(1, Number(e.target.value)))}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-indigo-300 bg-white text-xs font-semibold text-stone-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <span className="absolute right-2.5 top-1.5 text-stone-400 text-xs">ч.</span>
                    </div>
                    <span className="text-[10px] text-stone-500 block mt-0.5">Временный мут</span>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-stone-700 mb-1">
                      Лимит нарушений:
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        id="input-device-binding-attempts"
                        min={1}
                        max={100}
                        value={deviceBindingMaxAttempts}
                        onChange={(e) => setDeviceBindingMaxAttempts(Math.max(1, Number(e.target.value)))}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-indigo-300 bg-white text-xs font-semibold text-stone-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <span className="absolute right-2.5 top-1.5 text-stone-400 text-xs">поп.</span>
                    </div>
                    <span className="text-[10px] text-stone-500 block mt-0.5">До пермбана</span>
                  </div>
                </div>

                {/* Notice text in bot */}
                <div>
                  <label className="block text-[11px] font-semibold text-stone-700 mb-1">
                    Текст причины в Telegram-боте:
                  </label>
                  <input
                    type="text"
                    id="input-device-binding-notice"
                    value={deviceBindingNotice}
                    onChange={(e) => setDeviceBindingNotice(e.target.value)}
                    placeholder="Зафиксирована попытка подключения со 2-го устройства..."
                    className="w-full px-2.5 py-1.5 rounded-lg border border-indigo-300 bg-white text-xs text-stone-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                {/* Stub File Content */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-bold text-stone-800 flex items-center space-x-1">
                      <span>Содержимое файла-заглушки (Stub):</span>
                    </label>
                    <div className="flex items-center space-x-1.5 text-[10px]">
                      <button
                        type="button"
                        onClick={() =>
                          setDeviceBindingStubContent(
                            'vless://00000000-0000-0000-0000-000000000000@127.0.0.1:443?encryption=none&security=none#⚠️ Заблокировано: попытка привязки 2-го устройства (1 подписка = 1 устройство)'
                          )
                        }
                        className="text-indigo-800 hover:underline font-medium"
                      >
                        Стандарт
                      </button>
                      <span className="text-stone-300">|</span>
                      <button
                        type="button"
                        onClick={() => setDeviceBindingStubContent('')}
                        className="text-stone-500 hover:text-stone-800"
                      >
                        Очистить
                      </button>
                    </div>
                  </div>
                  <textarea
                    id="textarea-device-binding-stub"
                    rows={4}
                    value={deviceBindingStubContent}
                    onChange={(e) => setDeviceBindingStubContent(e.target.value)}
                    placeholder="vless://00000000-0000-0000-0000-000000000000@127.0.0.1:443..."
                    className="w-full font-mono text-[11px] text-stone-900 bg-white p-2.5 rounded-xl border border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 leading-relaxed resize-y"
                  />
                  <div className="flex justify-between items-center text-[10px] text-stone-500 mt-1">
                    <span>Строк: {deviceBindingStubContent.split('\n').filter(Boolean).length}</span>
                    <span className="text-indigo-700 font-medium">Замещает персональный файл в Git</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* СЦЕНАРИЙ 3: Превышение лимита удалений (Перманентный бан) */}
          {(activeBlockingTab === 'all' || activeBlockingTab === 'limit_exceeded') && (
            <div className="bg-rose-50/40 border border-rose-200/90 rounded-2xl p-4 flex flex-col justify-between space-y-4 hover:border-rose-300 transition-all">
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-rose-200/70">
                  <div className="flex items-center space-x-2">
                    <div className="p-1.5 bg-rose-100 rounded-lg text-rose-800">
                      <Ban className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-stone-900">
                        3. Превышение лимита удалений
                      </h4>
                      <span className="text-[10px] text-rose-800 font-medium">
                        (перманентная блокировка подписки)
                      </span>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-900 text-[10px] font-bold border border-rose-300">
                    Источник 3
                  </span>
                </div>

                <p className="text-xs text-stone-600 leading-relaxed">
                  При достижении предельного количества нарушений наступает перманентный бан. Файл заменяется на заглушку 3 и никогда не восстанавливается автоматически.
                </p>

                {/* Parameters inputs */}
                <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                  <div>
                    <label className="block text-[11px] font-semibold text-stone-700 mb-1">
                      Срок блокировки (0 = навсегда):
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        id="input-limit-exceeded-hours"
                        min={0}
                        max={8760}
                        value={limitExceededBlockHours}
                        onChange={(e) => setLimitExceededBlockHours(Math.max(0, Number(e.target.value)))}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-rose-300 bg-white text-xs font-semibold text-stone-900 focus:outline-none focus:ring-1 focus:ring-rose-500"
                      />
                      <span className="absolute right-2.5 top-1.5 text-stone-400 text-xs">
                        {limitExceededBlockHours === 0 ? '∞' : 'ч.'}
                      </span>
                    </div>
                    <span className="text-[10px] text-stone-500 block mt-0.5">
                      {limitExceededBlockHours === 0 ? 'Перманентный бан' : 'Часов бана'}
                    </span>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-stone-700 mb-1">
                      Лимит удалений / отписок:
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        id="input-limit-exceeded-attempts"
                        min={1}
                        max={100}
                        value={limitExceededMaxAttempts}
                        onChange={(e) => setLimitExceededMaxAttempts(Math.max(1, Number(e.target.value)))}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-rose-300 bg-white text-xs font-semibold text-stone-900 focus:outline-none focus:ring-1 focus:ring-rose-500"
                      />
                      <span className="absolute right-2.5 top-1.5 text-stone-400 text-xs">раз</span>
                    </div>
                    <span className="text-[10px] text-stone-500 block mt-0.5">Порог бана</span>
                  </div>
                </div>

                {/* Notice text in bot */}
                <div>
                  <label className="block text-[11px] font-semibold text-stone-700 mb-1">
                    Текст причины в Telegram-боте:
                  </label>
                  <input
                    type="text"
                    id="input-limit-exceeded-notice"
                    value={limitExceededNotice}
                    onChange={(e) => setLimitExceededNotice(e.target.value)}
                    placeholder="Подписка перманентно заблокирована за нарушения..."
                    className="w-full px-2.5 py-1.5 rounded-lg border border-rose-300 bg-white text-xs text-stone-900 focus:outline-none focus:ring-1 focus:ring-rose-500"
                  />
                </div>

                {/* Stub File Content */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-bold text-stone-800 flex items-center space-x-1">
                      <span>Содержимое файла-заглушки (Stub):</span>
                    </label>
                    <div className="flex items-center space-x-1.5 text-[10px]">
                      <button
                        type="button"
                        onClick={() =>
                          setLimitExceededStubContent(
                            'vless://00000000-0000-0000-0000-000000000000@127.0.0.1:443?encryption=none&security=none#⛔ Перманентный бан: превышен лимит нарушений'
                          )
                        }
                        className="text-rose-800 hover:underline font-medium"
                      >
                        Стандарт
                      </button>
                      <span className="text-stone-300">|</span>
                      <button
                        type="button"
                        onClick={() => setLimitExceededStubContent('')}
                        className="text-stone-500 hover:text-stone-800"
                      >
                        Очистить
                      </button>
                    </div>
                  </div>
                  <textarea
                    id="textarea-limit-exceeded-stub"
                    rows={4}
                    value={limitExceededStubContent}
                    onChange={(e) => setLimitExceededStubContent(e.target.value)}
                    placeholder="vless://00000000-0000-0000-0000-000000000000@127.0.0.1:443..."
                    className="w-full font-mono text-[11px] text-stone-900 bg-white p-2.5 rounded-xl border border-rose-300 focus:outline-none focus:ring-1 focus:ring-rose-500 leading-relaxed resize-y"
                  />
                  <div className="flex justify-between items-center text-[10px] text-stone-500 mt-1">
                    <span>Строк: {limitExceededStubContent.split('\n').filter(Boolean).length}</span>
                    <span className="text-rose-700 font-medium">Замещает персональный файл в Git</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="pt-3 border-t border-stone-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="flex items-center space-x-2 text-stone-500">
            <ShieldAlert className="h-4 w-4 text-amber-600" />
            <span>
              Все 3 типа заглушек синхронизируются с центральной подпиской и системой шаблонов.
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              id="btn-reset-standard-stubs"
              onClick={() => {
                setBotDeletedStubContent('vless://00000000-0000-0000-0000-000000000000@127.0.0.1:443?encryption=none&security=none#⚠️ Доступ приостановлен: вы удалили или заблокировали бота');
                setBotDeletedBlockHours(72);
                setBotDeletedMaxAttempts(3);
                setBotDeletedNotice('Вы удалили или заблокировали бота. Сетевой доступ деактивирован. Запустите бота заново (/start) для восстановления.');

                setDeviceBindingStubContent('vless://00000000-0000-0000-0000-000000000000@127.0.0.1:443?encryption=none&security=none#⚠️ Заблокировано: попытка привязки 2-го устройства (1 подписка = 1 устройство)');
                setDeviceBindingBlockHours(24);
                setDeviceBindingMaxAttempts(3);
                setDeviceBindingNotice('Зафиксирована попытка подключения со второго устройства. Правило сервиса: 1 подписка = строго 1 устройство. Доступ временно заблокирован.');

                setLimitExceededStubContent('vless://00000000-0000-0000-0000-000000000000@127.0.0.1:443?encryption=none&security=none#⛔ Перманентный бан: превышен лимит нарушений');
                setLimitExceededBlockHours(0);
                setLimitExceededMaxAttempts(5);
                setLimitExceededNotice('Подписка перманентно заблокирована из-за систематических нарушений правил сервиса. Для подачи апелляции используйте раздел помощи в боте.');

                setStatusMessage({ type: 'success', text: 'Все 3 заглушки и параметры сброшены к стандартным значениям. Нажмите "Сохранить", чтобы применить.' });
              }}
              className="px-3 py-1.5 rounded-xl border border-stone-200 hover:bg-stone-50 text-stone-700 font-medium transition-colors flex items-center space-x-1"
            >
              <Undo2 className="h-3.5 w-3.5" />
              <span>Сбросить к стандарту</span>
            </button>

            <button
              type="button"
              id="btn-save-blocking-params-bottom"
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-stone-900 font-bold transition-colors flex items-center space-x-1.5 disabled:opacity-50 shadow-xs"
            >
              <Save className="h-3.5 w-3.5" />
              <span>{isSaving ? 'Сохранение...' : 'Сохранить параметры блокировок'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* GitVerse Repo Files & Free Links Pool Section */}
      <div id="repo-files-pool-section" className="bg-white border border-stone-200 rounded-2xl p-6 shadow-xs space-y-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2.5">
              <div className="h-9 w-9 rounded-xl bg-stone-900 text-amber-400 flex items-center justify-center shrink-0">
                <Globe className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-stone-900 flex items-center space-x-2">
                  <span>Файлы подписок в репозитории и Пул свободных ссылок</span>
                  <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    RAW источник
                  </span>
                </h3>
                <p className="text-xs text-stone-500">
                  Ссылки создаются в репозитории как файлы (<span className="font-mono text-stone-700">subs/sub_*.txt</span>) с ключами из центрального источника. Ссылка выдается 1 раз, формат (HAPP или INCY) можно выбирать повторно.
                </p>
              </div>
            </div>
          </div>

          {/* Quick Pool Stats */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold flex items-center space-x-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Свободно ссылок: <strong>{freeCount}</strong></span>
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-stone-100 border border-stone-200 text-stone-700 font-medium">
              Выдано подписчикам: <strong>{assignedCount}</strong>
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-stone-100 border border-stone-200 text-stone-700 font-medium">
              Всего файлов: <strong>{repoFiles.length}</strong>
            </div>
          </div>
        </div>

        {/* Action Controls & Filters */}
        <div className="pt-2 border-t border-stone-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Filter tabs */}
          <div className="flex items-center space-x-1 bg-stone-100 p-1 rounded-xl">
            <button
              id="filter-repo-all"
              onClick={() => setRepoFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                repoFilter === 'all'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Все файлы ({repoFiles.length})
            </button>
            <button
              id="filter-repo-free"
              onClick={() => setRepoFilter('free')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center space-x-1.5 ${
                repoFilter === 'free'
                  ? 'bg-white text-emerald-700 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span>Свободные ссылки ({freeCount})</span>
            </button>
            <button
              id="filter-repo-assigned"
              onClick={() => setRepoFilter('assigned')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                repoFilter === 'assigned'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Выдано подписчикам ({assignedCount})
            </button>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center space-x-1 bg-stone-50 border border-stone-200 rounded-xl px-2 py-1">
              <span className="text-xs text-stone-500 mr-1">Кол-во:</span>
              {[1, 3, 5, 10].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setGenerateCount(num)}
                  className={`px-2 py-0.5 rounded-md text-xs font-semibold ${
                    generateCount === num
                      ? 'bg-stone-900 text-white'
                      : 'text-stone-600 hover:bg-stone-200/60'
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>

            <button
              id="btn-generate-free-files"
              onClick={handleGenerateFree}
              disabled={isGenerating}
              className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors disabled:opacity-50 shadow-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{isGenerating ? 'Создание...' : `+ Создать ${generateCount} свободных файлов`}</span>
            </button>

            <button
              id="btn-check-all-repo-files"
              onClick={handleCheckAllFiles}
              disabled={isCheckingAll || repoFiles.length === 0}
              className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl border border-stone-200 hover:bg-stone-50 text-stone-800 text-xs font-semibold transition-colors disabled:opacity-50"
              title="Проверить открываются ли все ссылки"
            >
              <Activity className={`h-3.5 w-3.5 text-indigo-600 ${isCheckingAll ? 'animate-spin' : ''}`} />
              <span>{isCheckingAll ? 'Проверка ссылок...' : '⚡ Проверить открываются ли'}</span>
            </button>

            <button
              id="btn-refresh-repo-files"
              onClick={loadRepoFiles}
              disabled={loadingRepoFiles}
              className="p-1.5 rounded-xl border border-stone-200 hover:bg-stone-50 text-stone-600 transition-colors"
              title="Обновить список файлов"
            >
              <RefreshCw className={`h-4 w-4 ${loadingRepoFiles ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Files Pool List Table */}
        <div className="overflow-x-auto border border-stone-200 rounded-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-stone-50 text-stone-500 font-semibold border-b border-stone-200 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-4 py-3">Файл в репозитории</th>
                <th className="px-4 py-3">Статус в пуле / Владелец</th>
                <th className="px-4 py-3">RAW Ссылка</th>
                <th className="px-4 py-3">Проверка доступности</th>
                <th className="px-4 py-3 text-right">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {filteredRepoFiles.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-stone-400">
                    {loadingRepoFiles
                      ? 'Загрузка списка файлов из репозитория...'
                      : repoFilter === 'free'
                      ? 'В пуле нет свободных ссылок. Нажмите «+ Создать свободные файлы», чтобы заготовить их.'
                      : 'Нет файлов в репозитории.'}
                  </td>
                </tr>
              ) : (
                filteredRepoFiles.map((f) => {
                  const isFree = !f.userId || f.isPoolFree;
                  const isCurrentlyChecking = checkingFile === f.filePath;

                  return (
                    <tr key={f.filePath} className="hover:bg-stone-50/70 transition-colors">
                      {/* File Path */}
                      <td className="px-4 py-3">
                        <div className="flex items-center space-x-2">
                          <FileText className="h-4 w-4 text-stone-400 shrink-0" />
                          <div>
                            <span className="font-mono font-semibold text-stone-900 block">
                              {f.filePath}
                            </span>
                            <span className="text-[11px] text-stone-400">
                              {(f.sizeBytes / 1024).toFixed(1)} КБ • {f.nodesFound ?? 0} узлов
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Status / Owner */}
                      <td className="px-4 py-3">
                        {isFree ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />
                            Свободна в пуле
                          </span>
                        ) : (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                              👤 @{f.username || f.firstName || 'user'}
                            </span>
                            <span className="text-[10px] text-stone-400 block font-mono">
                              ID: {f.telegramId || '—'}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* RAW URL */}
                      <td className="px-4 py-3 max-w-xs">
                        <div className="flex items-center space-x-1.5">
                          <span className="font-mono text-[11px] text-stone-600 truncate block max-w-[220px]" title={f.rawUrl}>
                            {f.rawUrl}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyFileLink(f.rawUrl, f.filePath)}
                            className="p-1 rounded text-stone-400 hover:text-stone-700 shrink-0"
                            title="Скопировать прямую RAW ссылку"
                          >
                            {copiedFileUrl === f.filePath ? (
                              <Check className="h-3.5 w-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </button>
                          <a
                            href={f.rawUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 rounded text-stone-400 hover:text-sky-600 shrink-0"
                            title="Открыть RAW файл в новой вкладке"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      </td>

                      {/* URL Accessibility Check */}
                      <td className="px-4 py-3">
                        <div className="flex items-center space-x-2">
                          {f.isAccessible ? (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-semibold">
                              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                              <span>HTTP {f.httpStatus || 200} OK</span>
                              {f.latencyMs ? <span className="text-stone-400 text-[10px] font-normal">• {f.latencyMs}ms</span> : null}
                            </span>
                          ) : f.lastCheckedAt ? (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-semibold">
                              <XCircle className="h-3 w-3 text-rose-600" />
                              <span>Ошибка ({f.httpStatus || '500'})</span>
                            </span>
                          ) : (
                            <span className="text-[11px] text-stone-400">Не проверялась</span>
                          )}

                          <button
                            type="button"
                            onClick={() => handleCheckFile(f)}
                            disabled={isCurrentlyChecking}
                            className="px-2 py-1 rounded-lg border border-stone-200 bg-stone-50 hover:bg-stone-100 text-stone-700 text-[11px] font-medium transition-colors disabled:opacity-50 flex items-center space-x-1"
                          >
                            {isCurrentlyChecking ? (
                              <RefreshCw className="h-3 w-3 animate-spin text-stone-500" />
                            ) : (
                              <Play className="h-3 w-3 text-emerald-600 fill-emerald-600" />
                            )}
                            <span>{isCurrentlyChecking ? '...' : 'Проверить'}</span>
                          </button>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end space-x-1">
                          <button
                            type="button"
                            onClick={() => handleCheckFile(f)}
                            className="p-1.5 rounded-lg text-stone-500 hover:text-stone-900 hover:bg-stone-100"
                            title="Посмотреть содержимое"
                          >
                            <Search className="h-3.5 w-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteFile(f.filePath)}
                            className="p-1.5 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-rose-50"
                            title="Удалить файл из репозитория"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: File Preview */}
      {previewContent && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-xl border border-stone-200 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-stone-900 font-mono">
                  {previewContent.path}
                </h3>
                <span className="text-xs text-stone-500">
                  {previewContent.nodes} узлов найдено • {(previewContent.size / 1024).toFixed(1)} КБ
                </span>
              </div>
              <button
                onClick={() => setPreviewContent(null)}
                className="text-stone-400 hover:text-stone-600 text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            <div className="bg-stone-900 text-stone-100 p-3 rounded-xl font-mono text-xs max-h-64 overflow-y-auto whitespace-pre-wrap leading-relaxed">
              {previewContent.text}
            </div>

            <div className="flex justify-between items-center pt-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(previewContent.text);
                  alert('Содержимое файла скопировано!');
                }}
                className="px-3 py-1.5 rounded-xl border border-stone-200 hover:bg-stone-50 text-stone-700 text-xs font-semibold flex items-center space-x-1.5"
              >
                <Copy className="h-3.5 w-3.5" />
                <span>Скопировать всё</span>
              </button>

              <button
                onClick={() => setPreviewContent(null)}
                className="px-4 py-1.5 rounded-xl bg-stone-900 text-white text-xs font-semibold hover:bg-stone-800"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Quick Add Node */}
      {showAddNodeModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-stone-200 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="text-base font-bold text-stone-900">
                Добавить сервер в подписку
              </h3>
              <button
                onClick={() => setShowAddNodeModal(false)}
                className="text-stone-400 hover:text-stone-600 text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddNodeSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="font-semibold text-stone-700 block mb-1">Протокол</label>
                <select
                  value={newNode.protocol}
                  onChange={(e) => setNewNode({ ...newNode, protocol: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50 focus:bg-white text-stone-900"
                >
                  <option value="vless">VLESS (Reality / Vision)</option>
                  <option value="ss">Shadowsocks (Chacha20-ietf-poly1305)</option>
                  <option value="trojan">Trojan (TLS)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-stone-700 block mb-1">Сервер / Хост</label>
                  <input
                    type="text"
                    value={newNode.server}
                    onChange={(e) => setNewNode({ ...newNode, server: e.target.value })}
                    required
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50 focus:bg-white text-stone-900"
                  />
                </div>
                <div>
                  <label className="font-semibold text-stone-700 block mb-1">Порт</label>
                  <input
                    type="text"
                    value={newNode.port}
                    onChange={(e) => setNewNode({ ...newNode, port: e.target.value })}
                    required
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50 focus:bg-white text-stone-900"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-stone-700 block mb-1">Название узла (Флаг + Город)</label>
                <input
                  type="text"
                  value={newNode.countryName}
                  onChange={(e) => setNewNode({ ...newNode, countryName: e.target.value })}
                  required
                  placeholder="🇳🇱 NL - Amsterdam Fast"
                  className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50 focus:bg-white text-stone-900"
                />
              </div>

              {newNode.protocol === 'vless' && (
                <>
                  <div>
                    <label className="font-semibold text-stone-700 block mb-1">UUID пользователя</label>
                    <input
                      type="text"
                      value={newNode.uuid}
                      onChange={(e) => setNewNode({ ...newNode, uuid: e.target.value })}
                      required
                      className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50 focus:bg-white text-stone-900 font-mono text-[11px]"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-stone-700 block mb-1">SNI (Server Name Indication)</label>
                    <input
                      type="text"
                      value={newNode.sni}
                      onChange={(e) => setNewNode({ ...newNode, sni: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50 focus:bg-white text-stone-900 font-mono text-[11px]"
                    />
                  </div>
                </>
              )}

              <div className="flex justify-end space-x-2 pt-3 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setShowAddNodeModal(false)}
                  className="px-3.5 py-2 rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-50"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-stone-900 text-white font-semibold hover:bg-stone-800"
                >
                  Добавить в список
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
