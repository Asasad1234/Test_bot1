/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { DashboardView } from './components/DashboardView';
import { CentralSubscriptionView } from './components/CentralSubscriptionView';
import { UsersChannelView } from './components/UsersChannelView';
import { ExclusionsView } from './components/ExclusionsView';
import { BroadcastView } from './components/BroadcastView';
import { BotSimulatorView } from './components/BotSimulatorView';
import { TemplatesView } from './components/TemplatesView';
import { SettingsView } from './components/SettingsView';
import { SubscriptionsView } from './components/SubscriptionsView';
import { FeedbackView } from './components/FeedbackView';
import { KeyProcessorView } from './components/KeyProcessorView';
import { SyncLogView } from './components/SyncLogView';
import { 
  SystemStatus, 
  GitSourceItem, 
  ManagedBotItem, 
  ReplacementTemplates, 
  ExclusionSubscription, 
  CentralSubscriptionFile, 
  CentralSubscriptionSavePayload,
  BotUser, 
  BroadcastPayload 
} from './types';
import { 
  fetchStatus, 
  fetchGitSources,
  saveGitSource,
  testGitSource,
  activateGitSource,
  setDefaultGitSource,
  makeCentralGitSource,
  deleteGitSource,
  fetchBots,
  saveBot,
  testBot,
  activateBot,
  deleteBot,
  fetchReplacementTemplates,
  saveReplacementTemplates,
  fetchExclusions,
  createExclusion,
  deleteExclusion,
  syncExclusion,
  syncAllExclusions,
  fetchCentralFile, 
  saveCentralFile, 
  syncCentralFileWithGit, 
  fetchUsers, 
  addUser, 
  muteUser,
  unmuteUser,
  blockUser,
  unblockUser,
  savePersonalNodes,
  deleteUser,
  sendBroadcast,
  unbindUserDevice,
  bindUserDevice,
  terminateUserSubscription,
  simulateTier,
  syncCentralToSubscribers,
  syncAllChannelSubscribers,
  updateCentralAutoSyncConfig,
  forceResyncUser
} from './services/api';

export default function App() {
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [status, setStatus] = useState<SystemStatus | null>(null);
  
  // Git Sources State
  const [gitSources, setGitSources] = useState<GitSourceItem[]>([]);
  const [activeGitSourceId, setActiveGitSourceId] = useState<string>('');

  // Bots State
  const [bots, setBots] = useState<ManagedBotItem[]>([]);
  const [activeBotId, setActiveBotId] = useState<string>('');

  // Replacement Templates State
  const [templates, setTemplates] = useState<ReplacementTemplates>({
    unsubscribedNodeName: '⚠️ Доступ приостановлен: вы отписались от канала',
    unsubscribedNotice: 'Для возобновления подписки вернитесь в канал доступа и нажмите /check в боте.',
    blockedNodeName: '⛔ Подписка заблокирована администратором',
    blockedNotice: 'Ваша подписка заблокирована по подозрению в нарушении правил. Для разбирательств напишите администратору.',
    mutedNodeName: '⏳ Подписка на паузе (Заглушена)',
    mutedNotice: 'Сетевой доступ временно отключен администратором.',
    botDeletedNotice: 'Вы заблокировали или удалили бота. Запустите бота снова, чтобы получить обновленную подписку.',
  });

  // Exclusions State
  const [exclusions, setExclusions] = useState<ExclusionSubscription[]>([]);

  // Central File State
  const [centralFile, setCentralFile] = useState<(CentralSubscriptionFile & { stats?: any }) | null>(null);

  // Users State
  const [users, setUsers] = useState<BotUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<BotUser | null>(null);
  const [directMessageUser, setDirectMessageUser] = useState<BotUser | null>(null);

  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Load all initial state
  const loadAllData = async () => {
    setIsRefreshing(true);
    try {
      const [
        statusData, 
        gitData, 
        botData, 
        templateData, 
        exclData, 
        centralData, 
        usersData
      ] = await Promise.all([
        fetchStatus().catch(() => null),
        fetchGitSources().catch(() => ({ gitSources: [], activeGitSourceId: '' })),
        fetchBots().catch(() => ({ bots: [], activeBotId: '' })),
        fetchReplacementTemplates().catch(() => null),
        fetchExclusions().catch(() => ({ exclusions: [] })),
        fetchCentralFile().catch(() => null),
        fetchUsers().catch(() => ({ users: [] })),
      ]);

      if (statusData) setStatus(statusData);
      
      if (gitData?.gitSources) {
        setGitSources(gitData.gitSources);
        setActiveGitSourceId(gitData.activeGitSourceId || gitData.gitSources[0]?.id || '');
      }

      if (botData?.bots) {
        setBots(botData.bots);
        setActiveBotId(botData.activeBotId || botData.bots[0]?.id || '');
      }

      if (templateData?.templates) {
        setTemplates(templateData.templates);
      }

      if (exclData?.exclusions) {
        setExclusions(exclData.exclusions);
      }

      if (centralData) setCentralFile(centralData);

      if (usersData?.users) {
        setUsers(usersData.users);
        if (!selectedUser && usersData.users.length > 0) {
          setSelectedUser(usersData.users[0]);
        }
      }
    } catch (err) {
      console.error('Error loading initial data:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  // 5-second polling background task that checks for centralFile changes
  // and triggers syncCentralFileWithGit whenever centralFile content changes,
  // ensuring automatic distribution to all active user subscriptions except those explicitly excluded.
  const lastSyncedContentRef = useRef<string | null>(null);
  const isSyncingGitRef = useRef<boolean>(false);

  useEffect(() => {
    if (centralFile?.content && lastSyncedContentRef.current === null) {
      lastSyncedContentRef.current = centralFile.content;
    }
  }, [centralFile?.content]);

  useEffect(() => {
    const pollInterval = setInterval(async () => {
      if (isSyncingGitRef.current) return;
      try {
        const latestCentral = await fetchCentralFile();
        if (latestCentral && latestCentral.content) {
          if (lastSyncedContentRef.current !== null && latestCentral.content !== lastSyncedContentRef.current) {
            console.log('[CentralFile Watcher] Detected content change. Triggering push to Git and active subscribers...');
            isSyncingGitRef.current = true;
            setCentralFile(latestCentral);
            await syncCentralFileWithGit('push', latestCentral.centralRawUrl);
            lastSyncedContentRef.current = latestCentral.content;
            await loadAllData();
          } else if (lastSyncedContentRef.current === null) {
            lastSyncedContentRef.current = latestCentral.content;
          }
        }
      } catch (err) {
        console.warn('[CentralFile Watcher] Polling check notice:', err);
      } finally {
        isSyncingGitRef.current = false;
      }
    }, 5000);

    return () => clearInterval(pollInterval);
  }, []);

  const activeGitSource = gitSources.find((s) => s.id === activeGitSourceId) || gitSources[0] || null;
  const activeBot = bots.find((b) => b.id === activeBotId) || bots[0] || null;

  // Handlers for Central File
  const handleSaveCentral = async (payload: Partial<CentralSubscriptionSavePayload> & { content: string; autoSyncEnabled: boolean; filename: string }) => {
    const res = await saveCentralFile(payload);
    if (res.centralFile) {
      setCentralFile(res.centralFile);
      lastSyncedContentRef.current = res.centralFile.content;
    }
    await loadAllData();
    return res;
  };

  const handleSyncGit = async (direction: 'push' | 'pull', centralRawUrl?: string, content?: string) => {
    const res = await syncCentralFileWithGit(direction, centralRawUrl, content);
    if (res.content && centralFile) {
      setCentralFile({ ...centralFile, content: res.content });
      lastSyncedContentRef.current = res.content;
    }
    await loadAllData();
    return res;
  };

  const handleSyncToSubscribers = async () => {
    const res = await syncCentralToSubscribers();
    await loadAllData();
    return res;
  };

  const handleSyncAllChannelSubscribers = async () => {
    const res = await syncAllChannelSubscribers();
    await loadAllData();
    return res;
  };

  const handleUpdateAutoSyncConfig = async (intervalSeconds: number, enabled?: boolean) => {
    const res = await updateCentralAutoSyncConfig(intervalSeconds, enabled);
    await loadAllData();
    return res;
  };

  // Handlers for Git Sources
  const handleSaveGitSource = async (item: Partial<GitSourceItem>) => {
    const res = await saveGitSource(item);
    if (res?.gitSources) {
      setGitSources([...res.gitSources]);
    }
    await loadAllData();
  };

  const handleTestGitSource = async (id: string) => {
    const res = await testGitSource(id);
    await loadAllData();
    return res;
  };

  const handleActivateGitSource = async (id: string) => {
    const res = await activateGitSource(id);
    setActiveGitSourceId(id);
    if (res?.gitSources) setGitSources([...res.gitSources]);
    await loadAllData();
  };

  const handleSetDefaultGitSource = async (id: string) => {
    const res = await setDefaultGitSource(id);
    setActiveGitSourceId(id);
    if (res?.gitSources) setGitSources([...res.gitSources]);
    await loadAllData();
    return res;
  };

  const handleMakeCentralGitSource = async (id: string) => {
    const res = await makeCentralGitSource(id);
    setActiveGitSourceId(id);
    if (res?.gitSources) setGitSources([...res.gitSources]);
    if (res?.centralFile) setCentralFile(res.centralFile);
    await loadAllData();
    return res;
  };

  const handleDeleteGitSource = async (id: string) => {
    const res = await deleteGitSource(id);
    if (res?.gitSources) {
      setGitSources([...res.gitSources]);
      if (activeGitSourceId === id) {
        setActiveGitSourceId(res.activeGitSourceId || res.gitSources[0]?.id || '');
      }
    }
    await loadAllData();
  };

  // Handlers for Bots
  const handleSaveBot = async (bot: Partial<ManagedBotItem>) => {
    const res = await saveBot(bot);
    if (res?.bots) {
      setBots([...res.bots]);
    }
    await loadAllData();
  };

  const handleTestBot = async (id: string) => {
    const res = await testBot(id);
    await loadAllData();
    return res;
  };

  const handleActivateBot = async (id: string) => {
    await activateBot(id);
    setActiveBotId(id);
    await loadAllData();
  };

  const handleDeleteBot = async (id: string) => {
    const res = await deleteBot(id);
    if (res?.bots) {
      setBots([...res.bots]);
      if (activeBotId === id) {
        setActiveBotId(res.activeBotId || res.bots[0]?.id || '');
      }
    }
    await loadAllData();
  };

  // Handlers for Users
  const handleAddUser = async (user: any) => {
    await addUser(user);
    await loadAllData();
  };

  const handleMuteUser = async (id: string, durationMinutes: number) => {
    await muteUser(id, durationMinutes);
    await loadAllData();
  };

  const handleUnmuteUser = async (id: string) => {
    await unmuteUser(id);
    await loadAllData();
  };

  const handleBlockUser = async (id: string, reason?: string) => {
    await blockUser(id, reason);
    await loadAllData();
  };

  const handleUnblockUser = async (id: string) => {
    await unblockUser(id);
    await loadAllData();
  };

  const handleSavePersonalNodes = async (id: string, nodes: string[]) => {
    await savePersonalNodes(id, nodes);
    await loadAllData();
  };

  const handleDeleteUser = async (id: string) => {
    const result = await deleteUser(id);
    await loadAllData();
    return { warning: result.warning };
  };

  const handleTerminateUser = async (id: string) => {
    const res = await terminateUserSubscription(id);
    await loadAllData();
    return res;
  };

  const handleSimulateTier = async (userId: string, tier: 1 | 2 | 3, action?: 'trigger' | 'revert') => {
    const res = await simulateTier(userId, tier, action);
    await loadAllData();
    return res;
  };

  const handleUnbindUserDevice = async (id: string) => {
    await unbindUserDevice(id);
    await loadAllData();
  };

  const handleBindUserDevice = async (id: string, clientName?: string) => {
    await bindUserDevice(id, clientName);
    await loadAllData();
  };

  // Handlers for Exclusions
  const handleCreateExclusion = async (payload: any) => {
    const res = await createExclusion(payload);
    if (res?.exclusions) {
      setExclusions([...res.exclusions]);
    }
    await loadAllData();
  };

  const handleDeleteExclusion = async (id: string) => {
    const res = await deleteExclusion(id);
    if (res?.exclusions) {
      setExclusions([...res.exclusions]);
    }
    await loadAllData();
  };

  const handleSyncExclusion = async (id: string) => {
    const res = await syncExclusion(id);
    await loadAllData();
    return res;
  };

  const handleSyncAllExclusions = async () => {
    const res = await syncAllExclusions();
    if (res?.exclusions) {
      setExclusions([...res.exclusions]);
    }
    await loadAllData();
    return res;
  };

  const handleForceResyncUser = async (userId: string) => {
    const res = await forceResyncUser(userId);
    await loadAllData();
    return res;
  };

  // Handlers for Templates
  const handleSaveTemplates = async (newTemplates: ReplacementTemplates) => {
    await saveReplacementTemplates(newTemplates);
    setTemplates(newTemplates);
  };

  // Handlers for Broadcast
  const handleSendBroadcast = async (payload: BroadcastPayload) => {
    await sendBroadcast(payload);
    await loadAllData();
  };

  return (
    <div id="app-root" className="min-h-screen bg-stone-100/70 text-stone-900 font-sans flex flex-col antialiased">
      {/* Persistent Navigation Header */}
      <Header
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        status={status}
        onRefreshStatus={loadAllData}
        isRefreshing={isRefreshing}
      />

      {/* Main View Area */}
      <main id="app-main" className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {currentTab === 'dashboard' && (
          <DashboardView
            status={status}
            users={users}
            onNavigate={setCurrentTab}
            onSyncChannel={loadAllData}
            onSyncGit={() => handleSyncGit('pull')}
            onUnblockUser={handleUnblockUser}
            onTerminateUser={handleTerminateUser}
            onSyncAllChannelSubscribers={handleSyncAllChannelSubscribers}
            onSyncCentralToSubscribers={handleSyncToSubscribers}
          />
        )}

        {currentTab === 'central-sub' && (
          <CentralSubscriptionView
            centralFile={centralFile}
            gitSource={activeGitSource}
            gitSources={gitSources}
            onSetDefaultGitSource={handleSetDefaultGitSource}
            onMakeCentralGitSource={handleMakeCentralGitSource}
            onRefreshData={loadAllData}
            onSave={handleSaveCentral}
            onSync={handleSyncGit}
            onSyncToSubscribers={handleSyncToSubscribers}
            onUpdateAutoSyncConfig={handleUpdateAutoSyncConfig}
            onNavigateToProcessor={() => setCurrentTab('processor')}
            onNavigateToLogs={() => setCurrentTab('logs')}
          />
        )}

        {currentTab === 'processor' && (
          <KeyProcessorView
            onNavigateToCentral={async (contentToApply?: string) => {
              if (contentToApply && centralFile) {
                await handleSaveCentral({
                  content: contentToApply,
                  autoSyncEnabled: centralFile.autoSyncEnabled,
                  filename: centralFile.filename,
                  centralRawUrl: centralFile.centralRawUrl,
                });
              }
              setCurrentTab('central-sub');
            }}
            onCentralUpdated={async () => {
              await loadAllData();
            }}
          />
        )}

        {currentTab === 'users' && (
          <UsersChannelView
            users={users}
            gitSources={gitSources}
            status={status}
            centralContent={centralFile?.content}
            onSyncChannel={loadAllData}
            onSyncAllChannelSubscribers={handleSyncAllChannelSubscribers}
            onSyncCentralToSubscribers={handleSyncToSubscribers}
            onAddUser={handleAddUser}
            onDeleteUser={handleDeleteUser}
            onMuteUser={handleMuteUser}
            onUnmuteUser={handleUnmuteUser}
            onBlockUser={handleBlockUser}
            onUnblockUser={handleUnblockUser}
            onSavePersonalNodes={handleSavePersonalNodes}
            onUnbindUserDevice={handleUnbindUserDevice}
            onBindUserDevice={handleBindUserDevice}
            onSimulateTier={handleSimulateTier}
            onTerminateUser={handleTerminateUser}
            onForceResyncUser={handleForceResyncUser}
            onSendDirectMessage={(user) => {
              setDirectMessageUser(user);
              setCurrentTab('broadcast');
            }}
            onViewUserSub={(u) => {
              setSelectedUser(u);
              setCurrentTab('layouts');
            }}
          />
        )}

        {currentTab === 'feedback' && (
          <FeedbackView onRefreshStats={loadAllData} />
        )}

        {currentTab === 'exclusions' && (
          <ExclusionsView
            exclusions={exclusions}
            activeGitSource={gitSources.find((s) => s.id === activeGitSourceId) || gitSources[0]}
            centralFile={centralFile}
            onCreateExclusion={handleCreateExclusion}
            onDeleteExclusion={handleDeleteExclusion}
            onSyncExclusion={handleSyncExclusion}
            onSyncAllExclusions={handleSyncAllExclusions}
            onRefreshExclusions={loadAllData}
          />
        )}

        {currentTab === 'broadcast' && (
          <BroadcastView
            users={users}
            onSendBroadcast={handleSendBroadcast}
            preselectedUser={directMessageUser}
          />
        )}

        {currentTab === 'bot-sim' && (
          <BotSimulatorView
            activeBot={activeBot}
            onUpdateActiveBot={handleSaveBot}
          />
        )}

        {currentTab === 'templates' && (
          <TemplatesView
            templates={templates}
            bots={bots}
            users={users}
            onSaveTemplates={handleSaveTemplates}
            onSaveBot={handleSaveBot}
            onTabChange={setCurrentTab}
          />
        )}

        {currentTab === 'logs' && (
          <SyncLogView
            onNavigateToCentral={() => setCurrentTab('central-sub')}
            onNavigateToDashboard={() => setCurrentTab('dashboard')}
          />
        )}

        {currentTab === 'settings' && (
          <SettingsView
            gitSources={gitSources}
            activeGitSourceId={activeGitSourceId}
            bots={bots}
            activeBotId={activeBotId}
            onSaveGitSource={handleSaveGitSource}
            onTestGitSource={handleTestGitSource}
            onActivateGitSource={handleActivateGitSource}
            onSetDefaultGitSource={handleSetDefaultGitSource}
            onMakeCentralGitSource={handleMakeCentralGitSource}
            onDeleteGitSource={handleDeleteGitSource}
            onSaveBot={handleSaveBot}
            onTestBot={handleTestBot}
            onActivateBot={handleActivateBot}
            onDeleteBot={handleDeleteBot}
            onRefreshData={loadAllData}
          />
        )}

        {currentTab === 'layouts' && (
          <SubscriptionsView
            users={users}
            selectedUser={selectedUser}
            onSelectUser={setSelectedUser}
            onRefreshUsers={loadAllData}
          />
        )}
      </main>

      {/* Footer */}
      <footer id="app-footer" className="border-t border-stone-200 bg-white py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between text-xs text-stone-500 gap-2">
          <div>
            <strong>Пульс Доступа</strong> — Multi-Bot & Git API система управления персональными подписками
          </div>
          <div className="flex items-center space-x-3">
            <span>GitVerse • GitFlic • MosHub • GitHub • GitLab</span>
            <span>•</span>
            <span>HAPP (crypt4) • INCY (qsen.ru)</span>
            <span>•</span>
            <span className="text-emerald-600 font-medium">Система активна</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
