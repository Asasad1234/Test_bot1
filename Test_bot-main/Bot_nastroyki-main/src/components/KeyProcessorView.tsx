import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  RotateCcw,
  Copy,
  Check,
  Download,
  Settings,
  Trash2,
  Plus,
  ArrowRight,
  Key,
  ShieldCheck,
  CheckCircle2,
  Info,
  Server,
  Sparkles,
  Bot,
  Hash,
  Globe,
  Sliders,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Save,
  Bookmark,
  Edit2,
  X,
  Layers,
  CheckSquare,
  Square,
  Eye,
  EyeOff,
  Clipboard,
  ListFilter,
  Tag,
  SlidersHorizontal,
  ClipboardList,
  FileText,
  QrCode,
  Radio,
  Share2,
} from 'lucide-react';
import QRCode from 'qrcode';
import {
  DEFAULT_PROFILE_HEADER,
  DEFAULT_HEADER_PRESETS,
  HeaderPreset,
  SECTION_DIVIDER,
  splitHeaderAndNodes,
  setUriHostParam,
  applyHostToRawLines,
  detectCountry,
  HostUpdateOptions,
} from '../utils/vpnProcessor';
import {
  fetchCentralFile,
  saveCentralFile,
  fetchReplacementTemplates,
  saveReplacementTemplates,
  encodeGatewayOutput,
} from '../services/api';
import { CentralSubscriptionFile } from '../types';

interface KeyProcessorViewProps {
  onNavigateToCentral?: (contentToApply?: string) => void;
  onNotify?: (message: string, type?: 'success' | 'info' | 'error') => void;
  onCentralUpdated?: () => Promise<void> | void;
}

export interface MetaTagItem {
  id: string;
  tag: string;
  value: string;
  label: string;
  description?: string;
  enabled: boolean;
  isCustom?: boolean;
}

export interface LineConfigItem {
  id: string;
  raw: string;
  protocol: 'vless' | 'vmess' | 'trojan' | 'ss' | 'hysteria2' | 'tuic' | 'wireguard' | 'other';
  host: string;
  port: string | number;
  remark: string;
  countryFlag: string;
  details?: string;
  enabled: boolean;
}

interface ProcessingLine {
  id: string;
  name: string;
  keys: string;
  configs: LineConfigItem[];
  enabled: boolean;
  viewMode?: 'checklist' | 'raw';
}

interface ProcessingGroup {
  id: string;
  name: string;
  keys: string;
  remark: string;
}

const STORAGE_KEY_PRESETS = 'vaynet_header_presets_v1';
const STORAGE_KEY_ACTIVE_PRESET = 'vaynet_active_header_preset_id';
const STORAGE_KEY_SETTINGS = 'vaynet_processor_settings_v1';

const DEFAULT_GROUP_REMARKS = [
  'Vaynet [Лучшая производительность]🇪🇺',
  'Vaynet [Хорошая скорость]🇪🇺',
  'Vaynet [Качественный Аналог]🇫🇲',
  'Vaynet [Доступный]🇸🇾',
  'Vaynet [Опционально]🇻🇳',
  'Vaynet [Опционально]🇲🇦',
];

const QUICK_FLAGS = ['🇪🇺', '🇫🇲', '🇸🇾', '🇻🇳', '🇲🇦', '🇷🇺', '🇩🇪', '🇳🇱', '🇺🇸', '🇹🇷', '🇰🇿', '🇫🇮'];

export const DEFAULT_META_TAGS: MetaTagItem[] = [
  {
    id: 'tag_profile_title',
    tag: '#profile-title:',
    value: 'Vay VPN [Проверка]',
    label: 'Название профиля подписки',
    description: 'Отображается как имя профиля в V2RayNG, Streisand, Hiddify, Clash, Sing-box',
    enabled: true,
  },
  {
    id: 'tag_profile_update_interval',
    tag: '#profile-update-interval:',
    value: '1h',
    label: 'Интервал автообновления',
    description: 'Периодичность фонового обновления подписки клиентом (1h, 6h, 12h, 24h)',
    enabled: true,
  },
  {
    id: 'tag_subscription_userinfo',
    tag: '#subscription-userinfo:',
    value: 'upload=0; download=9634698736256; total=0; expire=0',
    label: 'Лимит трафика и срок действия',
    description: 'Статистика использованных байт и дата окончания срока (expire=0 - без срока)',
    enabled: true,
  },
  {
    id: 'tag_support_url',
    tag: '#Support-Url:',
    value: 'https://t.me/Vaynet_vpn',
    label: 'Служба поддержки в Telegram',
    description: 'Прямая ссылка на контакт или чат поддержки сервиса',
    enabled: true,
  },
  {
    id: 'tag_announce',
    tag: '#Announce:',
    value: 'Делитесь со всеми данным сервисом. Ваша подписка является персональной, не для публичного пользования',
    label: 'Текст объявления (Announce)',
    description: 'Всплывающее информационное сообщение для клиентов подписки',
    enabled: true,
  },
  {
    id: 'tag_telegram_bot',
    tag: 'Телеграм👉',
    value: '@Vaynet_vpn',
    label: 'Информационная строка Telegram',
    description: 'Строка с контактом Telegram-канала или бота',
    enabled: true,
  },
  {
    id: 'tag_providerid',
    tag: '#providerid',
    value: 'RFthi9YM',
    label: 'Идентификатор провайдера',
    description: 'Служебный уникальный тег провайдера в инфраструктуре',
    enabled: true,
  },
  {
    id: 'tag_hide_settings',
    tag: '#hide-settings:',
    value: '1',
    label: 'Скрыть служебные настройки',
    description: 'Блокирует ручное изменение критических параметров узлов в клиенте (1 - включено)',
    enabled: true,
  },
  {
    id: 'tag_profile_web_page_url',
    tag: '#profile-web-page-url:',
    value: 'https://t.me/Vaynet_vpn',
    label: 'Веб-страница / Личный кабинет',
    description: 'Ссылка на веб-интерфейс или бота подписки',
    enabled: false,
  },
];

export function parseHeaderToMetaTags(rawHeader: string): MetaTagItem[] {
  if (!rawHeader.trim()) return [];
  const lines = rawHeader.split('\n').map((l) => l.trim()).filter(Boolean);

  return lines.map((line, idx) => {
    let tag = '';
    let value = '';
    let label = 'Мета-тег';
    let description = 'Параметр директивы шапки подписки';

    const colonIdx = line.indexOf(':');
    const spaceIdx = line.indexOf(' ');

    if (colonIdx !== -1 && (spaceIdx === -1 || colonIdx < spaceIdx)) {
      tag = line.slice(0, colonIdx + 1);
      value = line.slice(colonIdx + 1).trim();
    } else if (spaceIdx !== -1) {
      tag = line.slice(0, spaceIdx);
      value = line.slice(spaceIdx + 1).trim();
    } else {
      tag = line;
      value = '';
    }

    const defaultMatch = DEFAULT_META_TAGS.find(
      (d) => d.tag.toLowerCase() === tag.toLowerCase()
    );

    if (defaultMatch) {
      label = defaultMatch.label;
      description = defaultMatch.description || '';
    } else {
      label = tag.replace(/^[#:/]+/, '').trim() || `Тег ${idx + 1}`;
    }

    return {
      id: `mt_${idx}_${tag.replace(/[^a-zA-Z0-9]/g, '_')}_${idx}`,
      tag,
      value,
      label,
      description,
      enabled: true,
      isCustom: !defaultMatch,
    };
  });
}

export function buildHeaderFromMetaTags(tags: MetaTagItem[]): string {
  return tags
    .filter((t) => t.enabled && (t.tag.trim() || t.value.trim()))
    .map((t) => {
      const tag = t.tag.trim();
      const val = t.value.trim();
      if (!val) return tag;
      if (tag.endsWith(':')) return `${tag} ${val}`;
      return `${tag} ${val}`;
    })
    .join('\n');
}

export function parseKeysToLineConfigs(keysText: string, prevConfigs?: LineConfigItem[]): LineConfigItem[] {
  const lines = keysText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#') && !l.startsWith('🟨'));

  const prevMap = new Map<string, boolean>();
  if (prevConfigs) {
    prevConfigs.forEach((c) => prevMap.set(c.raw, c.enabled));
  }

  return lines.map((line, idx) => {
    let protocol: LineConfigItem['protocol'] = 'other';
    if (line.startsWith('vless://')) protocol = 'vless';
    else if (line.startsWith('vmess://')) protocol = 'vmess';
    else if (line.startsWith('trojan://')) protocol = 'trojan';
    else if (line.startsWith('ss://')) protocol = 'ss';
    else if (line.startsWith('hysteria2://') || line.startsWith('hy2://')) protocol = 'hysteria2';
    else if (line.startsWith('tuic://')) protocol = 'tuic';
    else if (line.startsWith('wireguard://')) protocol = 'wireguard';

    let host = '';
    let port: string | number = '';
    let remark = '';

    // Extract remark
    const hashIdx = line.indexOf('#');
    if (hashIdx !== -1) {
      try {
        remark = decodeURIComponent(line.slice(hashIdx + 1));
      } catch {
        remark = line.slice(hashIdx + 1);
      }
    }

    // Extract host and port
    if (line.startsWith('vmess://')) {
      try {
        const b64 = line.replace('vmess://', '').split('#')[0];
        const json = JSON.parse(atob(b64));
        host = json.add || '';
        port = json.port || '';
        if (!remark && json.ps) remark = json.ps;
      } catch {}
    } else {
      const match = line.match(/@([^:/?#]+)(?::(\d+))?/);
      if (match) {
        host = match[1];
        port = match[2] || '';
      }
    }

    const country = detectCountry(remark, host);
    const enabled = prevMap.has(line) ? prevMap.get(line)! : true;

    // Extract connection parameters for subtitle (e.g. SNI: cdn.tbank.ru · security: reality · type: tcp...)
    let details = '';
    try {
      const queryIdx = line.indexOf('?');
      const hashPos = line.indexOf('#');
      if (queryIdx !== -1) {
        const queryString = hashPos !== -1 ? line.slice(queryIdx + 1, hashPos) : line.slice(queryIdx + 1);
        const params = new URLSearchParams(queryString);
        const parts: string[] = [];
        const sni = params.get('sni');
        if (sni) parts.push(`SNI: ${sni}`);
        const security = params.get('security');
        if (security) parts.push(`security: ${security}`);
        const type = params.get('type');
        if (type) parts.push(`type: ${type}`);
        const headerType = params.get('headerType');
        if (headerType && headerType !== 'none') parts.push(`header: ${headerType}`);
        const flow = params.get('flow');
        if (flow) parts.push(`flow: ${flow}`);
        const alpn = params.get('alpn');
        if (alpn) parts.push(`alpn: ${alpn}`);
        if (parts.length > 0) {
          details = parts.join(' · ');
        }
      }
    } catch {}

    if (!details) {
      if (host) {
        details = `host: ${host}${port ? `:${port}` : ''} · protocol: ${protocol}`;
      } else {
        details = `protocol: ${protocol}`;
      }
    }

    return {
      id: `cfg_${idx}_${line.slice(0, 15)}_${idx}`,
      raw: line,
      protocol,
      host: host || 'сервер',
      port: port || '',
      remark: remark || (host ? `${host}:${port}` : `Узел ${idx + 1}`),
      countryFlag: country.flag,
      details,
      enabled,
    };
  });
}

export const KeyProcessorView: React.FC<KeyProcessorViewProps> = ({
  onNavigateToCentral,
  onNotify,
  onCentralUpdated,
}) => {
  // References for smooth scrolling between vertical stages
  const stage00Ref = useRef<HTMLDivElement>(null);
  const stage01Ref = useRef<HTMLDivElement>(null);
  const stage02Ref = useRef<HTMLDivElement>(null);
  const stage03Ref = useRef<HTMLDivElement>(null);
  const stage04Ref = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  // 1. Stage 00: Raw input for auto-split
  const [stage00RawText, setStage00RawText] = useState<string>('');

  // 2. Stage 01: Lines of keys
  const [stage01Lines, setStage01Lines] = useState<ProcessingLine[]>([
    { id: 'l1', name: 'Строка 01', keys: '', configs: [], enabled: true, viewMode: 'checklist' },
    { id: 'l2', name: 'Строка 02', keys: '', configs: [], enabled: true, viewMode: 'checklist' },
    { id: 'l3', name: 'Строка 03', keys: '', configs: [], enabled: true, viewMode: 'checklist' },
    { id: 'l4', name: 'Строка 04', keys: '', configs: [], enabled: true, viewMode: 'checklist' },
    { id: 'l5', name: 'Строка 05', keys: '', configs: [], enabled: true, viewMode: 'checklist' },
    { id: 'l6', name: 'Строка 06', keys: '', configs: [], enabled: true, viewMode: 'checklist' },
  ]);

  // 3. Stage 02: Groups with remarks
  const [stage02Groups, setStage02Groups] = useState<ProcessingGroup[]>([
    { id: 'g1', name: 'Группа 01', keys: '', remark: DEFAULT_GROUP_REMARKS[0] },
    { id: 'g2', name: 'Группа 02', keys: '', remark: DEFAULT_GROUP_REMARKS[1] },
    { id: 'g3', name: 'Группа 03', keys: '', remark: DEFAULT_GROUP_REMARKS[2] },
    { id: 'g4', name: 'Группа 04', keys: '', remark: DEFAULT_GROUP_REMARKS[3] },
    { id: 'g5', name: 'Группа 05', keys: '', remark: DEFAULT_GROUP_REMARKS[4] },
    { id: 'g6', name: 'Группа 06', keys: '', remark: DEFAULT_GROUP_REMARKS[5] },
  ]);

  // Stage 2 status notification
  const [stage02Status, setStage02Status] = useState<{
    processed: boolean;
    count: number;
    groupsCount: number;
  }>({
    processed: false,
    count: 0,
    groupsCount: 0,
  });

  // 4. Result output
  const [mergedResult, setMergedResult] = useState<string>('');
  const [perGroupResults, setPerGroupResults] = useState<{ name: string; keys: string[]; count: number }[]>([]);

  // 5. Stage 03: Host parameter & options
  const [hostValue, setHostValue] = useState<string>('');
  const [updateHostParam, setUpdateHostParam] = useState<boolean>(true);
  const [updateSniParam, setUpdateSniParam] = useState<boolean>(true);
  const [updateServerAddress, setUpdateServerAddress] = useState<boolean>(false);
  const [stage03Status, setStage03Status] = useState<{ applied: boolean; count: number; host: string } | null>(null);
  const [isStage03Copied, setIsStage03Copied] = useState<boolean>(false);
  const [showStage03Preview, setShowStage03Preview] = useState<boolean>(false);

  // 5b. Stage 04: Subscription Gateway Output & Encoders (crypt5 HAPP & clck.ru / INCY)
  const [gatewayToken, setGatewayToken] = useState<string>(() => `gw_${Math.random().toString(36).substring(2, 8)}`);
  const [gatewayUrlOverride, setGatewayUrlOverride] = useState<string>('http://shluz.xsph.ru');
  const [gatewayFormat, setGatewayFormat] = useState<'both' | 'happ' | 'clck'>('both');
  const [isEncodingGateway, setIsEncodingGateway] = useState<boolean>(false);
  const [gatewayEncodedResult, setGatewayEncodedResult] = useState<{
    happUrl: string;
    clckUrl: string;
    targetSubUrl: string;
    token: string;
    contentBase64?: string;
    transformedAt: string;
  } | null>(null);
  const [gatewayQrModal, setGatewayQrModal] = useState<{ url: string; title: string; format: 'happ' | 'clck' } | null>(null);
  const [gatewayQrDataUrl, setGatewayQrDataUrl] = useState<string | null>(null);
  const [isGatewayHappCopied, setIsGatewayHappCopied] = useState<boolean>(false);
  const [isGatewayClckCopied, setIsGatewayClckCopied] = useState<boolean>(false);
  const [isGatewaySubCopied, setIsGatewaySubCopied] = useState<boolean>(false);

  // 6. Header Presets & Active Header
  const [headerPresets, setHeaderPresets] = useState<HeaderPreset[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_PRESETS);
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_HEADER_PRESETS;
  });

  const [activePresetId, setActivePresetId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_ACTIVE_PRESET);
      if (saved) return saved;
    } catch {}
    return DEFAULT_HEADER_PRESETS[0].id;
  });

  const [includeHeaderInResult, setIncludeHeaderInResult] = useState<boolean>(true);
  const [customHeaderContent, setCustomHeaderContent] = useState<string>(DEFAULT_PROFILE_HEADER);
  const [isHeaderPanelOpen, setIsHeaderPanelOpen] = useState<boolean>(true);

  // Meta-tags checklist state (Vertical configurations selector with checkboxes)
  const [metaTags, setMetaTags] = useState<MetaTagItem[]>(() => {
    return parseHeaderToMetaTags(DEFAULT_PROFILE_HEADER);
  });
  const [metaTagMode, setMetaTagMode] = useState<'checklist' | 'raw'>('checklist');
  const [isNewTagModalOpen, setIsNewTagModalOpen] = useState<boolean>(false);
  const [newTagDirective, setNewTagDirective] = useState<string>('#custom-directive:');
  const [newTagVal, setNewTagVal] = useState<string>('');
  const [newTagLabel, setNewTagLabel] = useState<string>('Пользовательский тег');
  const [showFullRawStack, setShowFullRawStack] = useState<boolean>(false);

  // Settings Modal
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false);
  const [settingsActiveTab, setSettingsActiveTab] = useState<'presets' | 'defaults'>('presets');
  const [defaultRemarksSettings, setDefaultRemarksSettings] = useState<string[]>(DEFAULT_GROUP_REMARKS);

  // Preset editor state
  const [editingPreset, setEditingPreset] = useState<HeaderPreset | null>(null);
  const [newPresetName, setNewPresetName] = useState<string>('');

  // Central File API integration
  const [centralFile, setCentralFile] = useState<CentralSubscriptionFile | null>(null);
  const [isLoadingCentral, setIsLoadingCentral] = useState<boolean>(false);
  const [isSavingCentral, setIsSavingCentral] = useState<boolean>(false);

  // Copy status indicators
  const [isCopiedAll, setIsCopiedAll] = useState<boolean>(false);
  const [copiedGroupIndex, setCopiedGroupIndex] = useState<number | null>(null);

  // Load active preset content when activePresetId changes
  useEffect(() => {
    const found = headerPresets.find((p) => p.id === activePresetId);
    if (found) {
      setCustomHeaderContent(found.content);
      const parsedTags = parseHeaderToMetaTags(found.content);
      if (parsedTags.length > 0) {
        setMetaTags(parsedTags);
      }
    }
  }, [activePresetId, headerPresets]);

  // Save presets to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_PRESETS, JSON.stringify(headerPresets));
    } catch {}
  }, [headerPresets]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_ACTIVE_PRESET, activePresetId);
    } catch {}
  }, [activePresetId]);

  // Load Central File on mount
  useEffect(() => {
    loadCentralFile();
  }, []);

  const loadCentralFile = async () => {
    setIsLoadingCentral(true);
    try {
      const file = await fetchCentralFile();
      setCentralFile(file);
      if (file && file.content) {
        const split = splitHeaderAndNodes(file.content);
        if (split.header.trim()) {
          setCustomHeaderContent(split.header);
          const parsed = parseHeaderToMetaTags(split.header);
          if (parsed.length > 0) {
            setMetaTags(parsed);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load central file:', err);
    } finally {
      setIsLoadingCentral(false);
    }
  };

  // Helper: Count active configs in Stage 01
  const stage01TotalConfigs = useMemo(() => {
    return stage01Lines.reduce((acc, line) => acc + line.configs.length, 0);
  }, [stage01Lines]);

  const stage01SelectedConfigs = useMemo(() => {
    return stage01Lines.reduce((acc, line) => {
      if (!line.enabled) return acc;
      return acc + line.configs.filter((c) => c.enabled).length;
    }, 0);
  }, [stage01Lines]);

  // Helper: Count active configs in Stage 02
  const stage02TotalConfigs = useMemo(() => {
    return stage02Groups.reduce((acc, group) => {
      if (!group.keys.trim()) return acc;
      const count = group.keys.split('\n').filter((k) => k.trim() && !k.trim().startsWith('#') && !k.trim().startsWith('🟨')).length;
      return acc + count;
    }, 0);
  }, [stage02Groups]);

  // --- META-TAGS (HEADER) HANDLERS ---
  const handleToggleMetaTag = (tagId: string) => {
    setMetaTags((prev) => {
      const updated = prev.map((t) => (t.id === tagId ? { ...t, enabled: !t.enabled } : t));
      const newHeader = buildHeaderFromMetaTags(updated);
      setCustomHeaderContent(newHeader);
      return updated;
    });
  };

  const handleUpdateMetaTagValue = (tagId: string, value: string) => {
    setMetaTags((prev) => {
      const updated = prev.map((t) => (t.id === tagId ? { ...t, value } : t));
      const newHeader = buildHeaderFromMetaTags(updated);
      setCustomHeaderContent(newHeader);
      return updated;
    });
  };

  const handleAddCustomMetaTag = () => {
    if (!newTagDirective.trim()) return;
    const newTag: MetaTagItem = {
      id: `mt_${Date.now()}`,
      tag: newTagDirective.trim(),
      value: newTagVal.trim(),
      label: newTagLabel.trim() || 'Пользовательский тег',
      enabled: true,
      isCustom: true,
    };
    setMetaTags((prev) => {
      const updated = [...prev, newTag];
      setCustomHeaderContent(buildHeaderFromMetaTags(updated));
      return updated;
    });
    setNewTagDirective('#custom-directive:');
    setNewTagVal('');
    setNewTagLabel('Пользовательский тег');
    setIsNewTagModalOpen(false);
    onNotify?.('Новый мета-тег добавлен в список', 'success');
  };

  const handleDeleteMetaTag = (tagId: string) => {
    setMetaTags((prev) => {
      const updated = prev.filter((t) => t.id !== tagId);
      setCustomHeaderContent(buildHeaderFromMetaTags(updated));
      return updated;
    });
  };

  const handleSelectAllMetaTags = (select: boolean) => {
    setMetaTags((prev) => {
      const updated = prev.map((t) => ({ ...t, enabled: select }));
      setCustomHeaderContent(buildHeaderFromMetaTags(updated));
      return updated;
    });
  };

  // --- STAGE 01 (LINE & CHECKBOX) HANDLERS ---
  const syncLineToGroup = (lineIdx: number, targetLines: ProcessingLine[]) => {
    const line = targetLines[lineIdx];
    if (!line) return;
    const activeKeys = line.enabled
      ? line.configs.filter((c) => c.enabled).map((c) => c.raw).join('\n')
      : '';

    setStage02Groups((prevGroups) => {
      const copy = [...prevGroups];
      if (copy[lineIdx]) {
        copy[lineIdx] = {
          ...copy[lineIdx],
          keys: activeKeys,
        };
      }
      return copy;
    });
  };

  const handleUpdateLineKeys = (lineId: string, keysText: string) => {
    setStage01Lines((prev) => {
      const line = prev.find((l) => l.id === lineId);
      const parsedConfigs = parseKeysToLineConfigs(keysText, line?.configs);
      const next = prev.map((l) =>
        l.id === lineId ? { ...l, keys: keysText, configs: parsedConfigs } : l
      );
      const lineIdx = prev.findIndex((l) => l.id === lineId);
      if (lineIdx !== -1) {
        syncLineToGroup(lineIdx, next);
      }
      return next;
    });
  };

  const handleToggleLineConfig = (lineId: string, configId: string) => {
    setStage01Lines((prev) => {
      const next = prev.map((l) => {
        if (l.id !== lineId) return l;
        const updatedConfigs = l.configs.map((c) =>
          c.id === configId ? { ...c, enabled: !c.enabled } : c
        );
        return { ...l, configs: updatedConfigs };
      });
      const lineIdx = prev.findIndex((l) => l.id === lineId);
      if (lineIdx !== -1) {
        syncLineToGroup(lineIdx, next);
      }
      return next;
    });
  };

  const handleSelectAllLineConfigs = (lineId: string, select: boolean) => {
    setStage01Lines((prev) => {
      const next = prev.map((l) => {
        if (l.id !== lineId) return l;
        return {
          ...l,
          configs: l.configs.map((c) => ({ ...c, enabled: select })),
        };
      });
      const lineIdx = prev.findIndex((l) => l.id === lineId);
      if (lineIdx !== -1) {
        syncLineToGroup(lineIdx, next);
      }
      return next;
    });
  };

  const handleToggleLineEnabled = (lineId: string, enabled: boolean) => {
    setStage01Lines((prev) => {
      const next = prev.map((l) => (l.id === lineId ? { ...l, enabled } : l));
      const lineIdx = prev.findIndex((l) => l.id === lineId);
      if (lineIdx !== -1) {
        syncLineToGroup(lineIdx, next);
      }
      return next;
    });
  };

  const handleToggleLineViewMode = (lineId: string) => {
    setStage01Lines((prev) =>
      prev.map((l) =>
        l.id === lineId
          ? { ...l, viewMode: l.viewMode === 'raw' ? 'checklist' : 'raw' }
          : l
      )
    );
  };

  const handleDeleteSingleConfig = (lineId: string, configId: string) => {
    setStage01Lines((prev) => {
      const next = prev.map((l) => {
        if (l.id !== lineId) return l;
        const filteredConfigs = l.configs.filter((c) => c.id !== configId);
        const newKeys = filteredConfigs.map((c) => c.raw).join('\n');
        return { ...l, configs: filteredConfigs, keys: newKeys };
      });
      const lineIdx = prev.findIndex((l) => l.id === lineId);
      if (lineIdx !== -1) {
        syncLineToGroup(lineIdx, next);
      }
      return next;
    });
  };

  const handlePasteToLine = async (lineId: string) => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        onNotify?.('Буфер обмена пуст', 'info');
        return;
      }
      handleUpdateLineKeys(lineId, text.trim());
      onNotify?.('Ключи успешно вставлены из буфера обмена', 'success');
    } catch {
      onNotify?.('Не удалось прочитать буфер обмена', 'error');
    }
  };

  // --- LIVE ASSEMBLED CONTENT STACK (Сверху вниз) ---
  const liveContentStack = useMemo(() => {
    // 1. Header layer
    const activeHeaderTags = metaTags.filter((t) => t.enabled);
    let headerText = '';
    if (includeHeaderInResult) {
      headerText = metaTagMode === 'checklist' 
        ? buildHeaderFromMetaTags(metaTags) 
        : customHeaderContent;
      headerText = headerText.trim();
    }

    // 2. Groups layers (Строка 01 -> Группа 01, etc.)
    const groupSections: {
      groupIndex: number;
      name: string;
      remark: string;
      configs: {
        id: string;
        raw: string;
        protocol: string;
        remark: string;
        countryFlag: string;
        host: string;
        port: string | number;
      }[];
      text: string;
    }[] = [];

    stage02Groups.forEach((group, idx) => {
      const rawLines = group.keys
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith('#') && !l.startsWith('🟨'));

      if (rawLines.length === 0) return;

      const targetRemark = group.remark.trim();
      const updatedKeys = rawLines.map((line) => {
        const hashIdx = line.indexOf('#');
        let baseUrl = hashIdx !== -1 ? line.substring(0, hashIdx) : line;
        if (targetRemark) {
          return `${baseUrl}#${encodeURIComponent(targetRemark)}`;
        }
        return line;
      });

      const parsedItems = updatedKeys.map((k, kIdx) => {
        let protocol = 'other';
        if (k.startsWith('vless://')) protocol = 'vless';
        else if (k.startsWith('vmess://')) protocol = 'vmess';
        else if (k.startsWith('trojan://')) protocol = 'trojan';
        else if (k.startsWith('ss://')) protocol = 'ss';
        else if (k.startsWith('hysteria2://') || k.startsWith('hy2://')) protocol = 'hysteria2';
        else if (k.startsWith('tuic://')) protocol = 'tuic';
        else if (k.startsWith('wireguard://')) protocol = 'wireguard';

        let host = '';
        let port: string | number = '';
        const match = k.match(/@([^:/?#]+)(?::(\d+))?/);
        if (match) {
          host = match[1];
          port = match[2] || '';
        }

        const country = detectCountry(targetRemark, host);

        return {
          id: `stk_${idx}_${kIdx}`,
          raw: k,
          protocol,
          remark: targetRemark || `Узел ${kIdx + 1}`,
          countryFlag: country.flag,
          host: host || 'сервер',
          port,
        };
      });

      groupSections.push({
        groupIndex: idx,
        name: group.name,
        remark: targetRemark,
        configs: parsedItems,
        text: updatedKeys.join('\n'),
      });
    });

    const divider = SECTION_DIVIDER;
    const bodyContent = groupSections.map((s) => s.text).join(`\n${divider}\n`);
    const fullText = headerText
      ? (bodyContent ? `${headerText}\n\n${bodyContent}` : headerText)
      : bodyContent;

    const totalConfigs = groupSections.reduce((acc, s) => acc + s.configs.length, 0);

    return {
      headerText,
      activeHeaderTags,
      groupSections,
      fullText,
      totalConfigs,
      groupsCount: groupSections.length,
    };
  }, [includeHeaderInResult, metaTagMode, metaTags, customHeaderContent, stage02Groups]);

  // --- ACTIONS ---

  // Reset entire workflow
  const handleResetAll = () => {
    if (window.confirm('Сбросить все введённые ключи и настройки в исходное состояние?')) {
      setStage00RawText('');
      setStage01Lines([
        { id: 'l1', name: 'Строка 01', keys: '', configs: [], enabled: true, viewMode: 'checklist' },
        { id: 'l2', name: 'Строка 02', keys: '', configs: [], enabled: true, viewMode: 'checklist' },
        { id: 'l3', name: 'Строка 03', keys: '', configs: [], enabled: true, viewMode: 'checklist' },
        { id: 'l4', name: 'Строка 04', keys: '', configs: [], enabled: true, viewMode: 'checklist' },
        { id: 'l5', name: 'Строка 05', keys: '', configs: [], enabled: true, viewMode: 'checklist' },
        { id: 'l6', name: 'Строка 06', keys: '', configs: [], enabled: true, viewMode: 'checklist' },
      ]);
      setStage02Groups([
        { id: 'g1', name: 'Группа 01', keys: '', remark: defaultRemarksSettings[0] || DEFAULT_GROUP_REMARKS[0] },
        { id: 'g2', name: 'Группа 02', keys: '', remark: defaultRemarksSettings[1] || DEFAULT_GROUP_REMARKS[1] },
        { id: 'g3', name: 'Группа 03', keys: '', remark: defaultRemarksSettings[2] || DEFAULT_GROUP_REMARKS[2] },
        { id: 'g4', name: 'Группа 04', keys: '', remark: defaultRemarksSettings[3] || DEFAULT_GROUP_REMARKS[3] },
        { id: 'g5', name: 'Группа 05', keys: '', remark: defaultRemarksSettings[4] || DEFAULT_GROUP_REMARKS[4] },
        { id: 'g6', name: 'Группа 06', keys: '', remark: defaultRemarksSettings[5] || DEFAULT_GROUP_REMARKS[5] },
      ]);
      setMetaTags(parseHeaderToMetaTags(DEFAULT_PROFILE_HEADER));
      setCustomHeaderContent(DEFAULT_PROFILE_HEADER);
      setMergedResult('');
      setPerGroupResults([]);
      setHostValue('');
      setStage02Status({ processed: false, count: 0, groupsCount: 0 });
      onNotify?.('Все этапы очищены', 'info');
    }
  };

  // Load from Central Source into Stage 00
  const handleLoadFromCentral = async () => {
    setIsLoadingCentral(true);
    try {
      const file = await fetchCentralFile();
      setCentralFile(file);
      if (file && file.content) {
        setStage00RawText(file.content);
        const split = splitHeaderAndNodes(file.content);
        if (split.header.trim()) {
          setCustomHeaderContent(split.header);
          const parsed = parseHeaderToMetaTags(split.header);
          if (parsed.length > 0) {
            setMetaTags(parsed);
          }
        }
        onNotify?.('Центральный файл успешно загружен в Этап 00', 'success');
        // Auto-split right away
        handleAutoSplit(file.content);
      } else {
        onNotify?.('Центральный файл пуст', 'info');
      }
    } catch (err: any) {
      onNotify?.(`Ошибка загрузки: ${err.message}`, 'error');
    } finally {
      setIsLoadingCentral(false);
    }
  };

  // ЭТАП 00: Auto-split block by remark or by existing 20 yellow squares
  const handleAutoSplit = (textToProcess?: string) => {
    const raw = (textToProcess !== undefined ? textToProcess : stage00RawText).trim();
    if (!raw) {
      onNotify?.('Пожалуйста, вставьте блок конфигураций', 'info');
      return;
    }

    // 1. Separate header directives if present
    const { header, nodesText } = splitHeaderAndNodes(raw);
    if (header.trim()) {
      setCustomHeaderContent(header);
      const parsedTags = parseHeaderToMetaTags(header);
      if (parsedTags.length > 0) {
        setMetaTags(parsedTags);
      }
    }

    // 2. Check if already divided by yellow squares
    const dividerRegex = /(?:\r?\n|^)\s*(?:🟨\s*){5,}\s*(?:\r?\n|$)/;
    let parts: string[] = [];

    if (dividerRegex.test(nodesText)) {
      parts = nodesText.split(dividerRegex).filter((p) => p.trim());
    } else {
      // Group by remark extracted from #hash
      const lines = nodesText.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
      const remarkGroupsMap: Map<string, string[]> = new Map();

      for (const line of lines) {
        const hashIdx = line.indexOf('#');
        let remark = 'Без названия';
        if (hashIdx !== -1) {
          try {
            remark = decodeURIComponent(line.substring(hashIdx + 1).trim());
          } catch {
            remark = line.substring(hashIdx + 1).trim();
          }
        }
        if (!remarkGroupsMap.has(remark)) {
          remarkGroupsMap.set(remark, []);
        }
        remarkGroupsMap.get(remark)!.push(line);
      }

      if (remarkGroupsMap.size > 0) {
        parts = Array.from(remarkGroupsMap.values()).map((groupLines) => groupLines.join('\n'));
      } else {
        parts = [nodesText];
      }
    }

    // Populate Stage 01 Lines with parsed configs
    const newLines: ProcessingLine[] = parts.map((chunk, idx) => ({
      id: `l_${Date.now()}_${idx}`,
      name: `Строка ${String(idx + 1).padStart(2, '0')}`,
      keys: chunk.trim(),
      configs: parseKeysToLineConfigs(chunk.trim()),
      enabled: true,
      viewMode: 'checklist',
    }));

    // If fewer than 6, fill up to 6 for consistency
    while (newLines.length < 6) {
      const idx = newLines.length;
      newLines.push({
        id: `l_${Date.now()}_${idx}`,
        name: `Строка ${String(idx + 1).padStart(2, '0')}`,
        keys: '',
        configs: [],
        enabled: true,
        viewMode: 'checklist',
      });
    }

    setStage01Lines(newLines);

    // Also populate Stage 02 Groups
    const newGroups: ProcessingGroup[] = parts.map((chunk, idx) => {
      // Determine dominant remark or default
      const defaultRem = defaultRemarksSettings[idx] || DEFAULT_GROUP_REMARKS[idx % DEFAULT_GROUP_REMARKS.length];
      return {
        id: `g_${Date.now()}_${idx}`,
        name: `Группа ${String(idx + 1).padStart(2, '0')}`,
        keys: chunk.trim(),
        remark: defaultRem,
      };
    });

    while (newGroups.length < 6) {
      const idx = newGroups.length;
      newGroups.push({
        id: `g_${Date.now()}_${idx}`,
        name: `Группа ${String(idx + 1).padStart(2, '0')}`,
        keys: '',
        remark: defaultRemarksSettings[idx] || DEFAULT_GROUP_REMARKS[idx % DEFAULT_GROUP_REMARKS.length],
      });
    }

    setStage02Groups(newGroups);

    onNotify?.(`Блок успешно разделён на ${parts.length} групп! Переход к Этапу 01.`, 'success');

    // Scroll to Stage 01 smoothly
    setTimeout(() => {
      stage01Ref.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  // Transfer from Stage 01 to Stage 02
  const handleTransferStage01ToStage02 = () => {
    const activeLines = stage01Lines.filter((l) => l.enabled && (l.keys.trim() || l.configs.length > 0));
    if (activeLines.length === 0) {
      onNotify?.('В строках нет ключей для передачи в Этап 02', 'info');
      return;
    }

    const updatedGroups = stage01Lines.map((line, idx) => {
      const existing = stage02Groups[idx];
      const defaultRem = defaultRemarksSettings[idx] || DEFAULT_GROUP_REMARKS[idx % DEFAULT_GROUP_REMARKS.length];
      const activeKeys = line.enabled
        ? line.configs.filter((c) => c.enabled).map((c) => c.raw).join('\n')
        : '';
      return {
        id: existing?.id || `g_${Date.now()}_${idx}`,
        name: `Группа ${String(idx + 1).padStart(2, '0')}`,
        keys: activeKeys,
        remark: existing?.remark || defaultRem,
      };
    });

    setStage02Groups(updatedGroups);
    onNotify?.('Выбранные конфигурации переданы в Этап 02!', 'success');

    // Scroll to Stage 02
    setTimeout(() => {
      stage02Ref.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  // ЭТАП 02: Process Remarks & Assemble Result
  const handleProcessRemarksAndAssemble = () => {
    const nonEmpty = stage02Groups.filter((g) => g.keys.trim().length > 0);
    if (nonEmpty.length === 0) {
      onNotify?.('Нет ключей для обработки в группах', 'info');
      return;
    }

    let totalConfigCount = 0;
    const groupOutputs: { name: string; keys: string[]; count: number }[] = [];
    const sectionOutputs: string[] = [];

    nonEmpty.forEach((group) => {
      const rawLines = group.keys
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith('#') && !l.startsWith('🟨'));

      const targetRemark = group.remark.trim();

      const updatedKeys = rawLines.map((line) => {
        const hashIdx = line.indexOf('#');
        let baseUrl = hashIdx !== -1 ? line.substring(0, hashIdx) : line;
        if (targetRemark) {
          return `${baseUrl}#${encodeURIComponent(targetRemark)}`;
        }
        return line;
      });

      totalConfigCount += updatedKeys.length;
      groupOutputs.push({
        name: group.name,
        keys: updatedKeys,
        count: updatedKeys.length,
      });

      sectionOutputs.push(updatedKeys.join('\n'));
    });

    // Assemble final output with 20 yellow squares
    const divider = SECTION_DIVIDER;
    const bodyContent = sectionOutputs.join(`\n${divider}\n`);

    let finalResult = '';
    if (includeHeaderInResult && customHeaderContent.trim()) {
      finalResult = `${customHeaderContent.trim()}\n\n${bodyContent}`;
    } else {
      finalResult = bodyContent;
    }

    setMergedResult(finalResult);
    setPerGroupResults(groupOutputs);
    setStage02Status({
      processed: true,
      count: totalConfigCount,
      groupsCount: nonEmpty.length,
    });

    onNotify?.(`Этап 2 завершён. ${totalConfigCount} конфигураций отсортировано и обработано.`, 'success');

    // Scroll to Result
    setTimeout(() => {
      resultRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  // ЭТАП 03: Replace Host parameter
  const handleApplyHost = () => {
    const trimmedHost = hostValue.trim();
    if (!trimmedHost) {
      onNotify?.('Введите значение host (например: cdn.tbank.ru или domain.com)', 'info');
      return;
    }

    const options: HostUpdateOptions = {
      updateHostParam,
      updateSniParam,
      updateServerAddress,
    };

    // 1. Determine active source keys from stage02Groups or stage01Lines
    let currentGroups = [...stage02Groups];
    const stage02HasKeys = currentGroups.some((g) => g.keys.trim().length > 0);

    if (!stage02HasKeys) {
      // Auto-transfer active selected keys from Stage 01
      currentGroups = stage01Lines.map((line, idx) => {
        const existing = stage02Groups[idx];
        const defaultRem = defaultRemarksSettings[idx] || DEFAULT_GROUP_REMARKS[idx % DEFAULT_GROUP_REMARKS.length];
        const activeKeys = line.enabled
          ? line.configs.filter((c) => c.enabled).map((c) => c.raw).join('\n')
          : '';
        return {
          id: existing?.id || `g_${Date.now()}_${idx}`,
          name: `Группа ${String(idx + 1).padStart(2, '0')}`,
          keys: activeKeys,
          remark: existing?.remark || defaultRem,
        };
      });
    }

    const totalNodesBefore = currentGroups.reduce((acc, g) => {
      if (!g.keys.trim()) return acc;
      const count = g.keys.split('\n').filter((k) => k.trim() && !k.trim().startsWith('#') && !k.trim().startsWith('🟨')).length;
      return acc + count;
    }, 0);

    if (totalNodesBefore === 0) {
      onNotify?.('В строках нет активных конфигураций. Вставьте ключи в Этап 01.', 'info');
      return;
    }

    // 2. Apply host replacement to stage02Groups
    const updatedGroups = currentGroups.map((grp) => {
      if (!grp.keys.trim()) return grp;
      const updatedKeys = applyHostToRawLines(grp.keys, trimmedHost, options);
      return {
        ...grp,
        keys: updatedKeys,
      };
    });
    setStage02Groups(updatedGroups);

    // 3. Apply host replacement to stage01Lines so Stage 01 cards and checkboxes also reflect the updated host
    setStage01Lines((prev) => {
      return prev.map((l) => {
        if (!l.keys.trim() && l.configs.length === 0) return l;
        const updatedKeys = applyHostToRawLines(l.keys, trimmedHost, options);
        const parsedConfigs = parseKeysToLineConfigs(updatedKeys, l.configs);
        return {
          ...l,
          keys: updatedKeys,
          configs: parsedConfigs,
        };
      });
    });

    // 4. Assemble final merged result with updated host and dividers
    const sectionOutputs: string[] = [];
    const groupOutputs: { name: string; keys: string[]; count: number }[] = [];

    updatedGroups.forEach((group) => {
      if (!group.keys.trim()) return;
      const rawLines = group.keys
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith('#') && !l.startsWith('🟨'));

      const targetRemark = group.remark.trim();
      const finalKeys = rawLines.map((line) => {
        if (!targetRemark) return line;
        const hashIdx = line.indexOf('#');
        const baseUrl = hashIdx !== -1 ? line.substring(0, hashIdx) : line;
        return `${baseUrl}#${targetRemark}`;
      });

      if (finalKeys.length > 0) {
        groupOutputs.push({
          name: group.name,
          keys: finalKeys,
          count: finalKeys.length,
        });
        sectionOutputs.push(finalKeys.join('\n'));
      }
    });

    const bodyContent = sectionOutputs.join(`\n${SECTION_DIVIDER}\n`);
    let finalResult = '';
    const currentHeader = customHeaderContent.trim();
    if (includeHeaderInResult && currentHeader) {
      finalResult = `${currentHeader}\n\n${bodyContent}`;
    } else {
      finalResult = bodyContent;
    }

    setMergedResult(finalResult);
    setPerGroupResults(groupOutputs);

    setStage03Status({
      applied: true,
      count: totalNodesBefore,
      host: trimmedHost,
    });

    onNotify?.(`Этап 3 успешно выполнен: для ${totalNodesBefore} конфигураций установлен host "${trimmedHost}"!`, 'success');
  };

  // Copy all
  const handleCopyAll = async () => {
    if (!mergedResult.trim()) return;
    try {
      await navigator.clipboard.writeText(mergedResult);
      setIsCopiedAll(true);
      setTimeout(() => setIsCopiedAll(false), 2000);
      onNotify?.('Весь объединённый результат скопирован в буфер', 'success');
    } catch {
      onNotify?.('Не удалось скопировать', 'error');
    }
  };

  // Copy single group
  const handleCopyGroup = async (groupIndex: number, keys: string[]) => {
    try {
      await navigator.clipboard.writeText(keys.join('\n'));
      setCopiedGroupIndex(groupIndex);
      setTimeout(() => setCopiedGroupIndex(null), 2000);
      onNotify?.(`Конфигурации группы ${groupIndex + 1} скопированы`, 'success');
    } catch {
      onNotify?.('Не удалось скопировать', 'error');
    }
  };

  // Save to Central Source
  const handleSaveToCentral = async () => {
    if (!mergedResult.trim()) {
      onNotify?.('Результат пуст', 'info');
      return;
    }

    setIsSavingCentral(true);
    try {
      await saveCentralFile({
        content: mergedResult,
        autoSyncEnabled: centralFile?.autoSyncEnabled ?? true,
        filename: centralFile?.filename || 'central_subscription.txt',
        centralRawUrl: centralFile?.centralRawUrl,
      });
      onNotify?.('Успешно сохранено в Центральный источник и синхронизировано с GitVerse!', 'success');
      await loadCentralFile();
      onCentralUpdated?.();
    } catch (err: any) {
      onNotify?.(`Ошибка сохранения в центральный источник: ${err.message}`, 'error');
    } finally {
      setIsSavingCentral(false);
    }
  };

  // Insert generated/processed keys directly into one of the 3 Replacement Sources
  const [isSavingToSource, setIsSavingToSource] = useState<number | null>(null);

  const handleInsertIntoSource = async (sourceNum: 1 | 2 | 3) => {
    const contentToSave = (mergedResult && mergedResult.trim().length > 0)
      ? mergedResult
      : stage01Lines.filter((l) => l.enabled).flatMap((l) => l.configs.filter((c) => c.enabled).map((c) => c.raw)).join('\n');

    if (!contentToSave.trim()) {
      onNotify?.('Нет активных ключей для сохранения в источник', 'info');
      return;
    }

    setIsSavingToSource(sourceNum);
    try {
      const { templates } = await fetchReplacementTemplates();
      const payload: any = {};
      if (sourceNum === 1) payload.source1Content = contentToSave;
      if (sourceNum === 2) payload.source2Content = contentToSave;
      if (sourceNum === 3) payload.source3Content = contentToSave;

      await saveReplacementTemplates(payload);
      const lineCount = contentToSave.split('\n').filter(Boolean).length;
      onNotify?.(`Успешно сохранено ${lineCount} конфигураций в Источник ${sourceNum}!`, 'success');
    } catch (err: any) {
      onNotify?.(`Ошибка сохранения в Источник ${sourceNum}: ${err.message}`, 'error');
    } finally {
      setIsSavingToSource(null);
    }
  };

  // Download as file
  const handleDownloadResult = () => {
    if (!mergedResult.trim()) return;
    const blob = new Blob([mergedResult], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = centralFile?.filename || 'vaynet_subscription.txt';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onNotify?.('Файл подписки скачан', 'success');
  };

  // --- STAGE 04: GATEWAY ENCODING HANDLERS ---
  const handleEncodeGateway = async () => {
    const contentToEncode = (mergedResult && mergedResult.trim().length > 0)
      ? mergedResult
      : stage01Lines.filter((l) => l.enabled).flatMap((l) => l.configs.filter((c) => c.enabled).map((c) => c.raw)).join('\n');

    if (!contentToEncode.trim()) {
      alert('Сначала обработайте или объедините ключи во 2-м или 3-м этапе!');
      return;
    }

    setIsEncodingGateway(true);
    try {
      const res = await encodeGatewayOutput({
        content: contentToEncode,
        token: gatewayToken.trim(),
        gatewayUrl: gatewayUrlOverride.trim(),
        format: gatewayFormat,
      });

      setGatewayEncodedResult({
        happUrl: res.happUrl,
        clckUrl: res.clckUrl,
        targetSubUrl: res.targetSubUrl,
        token: res.token,
        contentBase64: res.contentBase64,
        transformedAt: res.transformedAt,
      });
      onNotify?.('Подписка успешно закодирована через шлюз!', 'success');
    } catch (err: any) {
      alert('Ошибка кодирования через шлюз: ' + err.message);
    } finally {
      setIsEncodingGateway(false);
    }
  };

  useEffect(() => {
    if (gatewayQrModal?.url) {
      QRCode.toDataURL(gatewayQrModal.url, {
        width: 260,
        margin: 2,
        color: { dark: '#0f172a', light: '#ffffff' },
      })
        .then((url) => setGatewayQrDataUrl(url))
        .catch((err) => console.error('QR generation error:', err));
    } else {
      setGatewayQrDataUrl(null);
    }
  }, [gatewayQrModal]);

  // --- PRESET MANAGEMENT ---
  const handleSelectPreset = (preset: HeaderPreset) => {
    setActivePresetId(preset.id);
    setCustomHeaderContent(preset.content);
    onNotify?.(`Шапка переключена: "${preset.name}"`, 'success');
  };

  const handleSaveCurrentAsPreset = () => {
    const name = prompt('Введите название для новой шапки (мета-тегов):', 'Моя персональная шапка');
    if (!name || !name.trim()) return;

    const newPreset: HeaderPreset = {
      id: `preset_${Date.now()}`,
      name: name.trim(),
      content: customHeaderContent,
      isDefault: false,
    };

    const updated = [...headerPresets, newPreset];
    setHeaderPresets(updated);
    setActivePresetId(newPreset.id);
    onNotify?.(`Вариант шапки "${name.trim()}" успешно сохранён!`, 'success');
  };

  const handleDeletePreset = (id: string, name: string) => {
    if (window.confirm(`Удалить пресет "${name}"?`)) {
      const filtered = headerPresets.filter((p) => p.id !== id);
      setHeaderPresets(filtered);
      if (activePresetId === id) {
        const fallback = filtered[0] || DEFAULT_HEADER_PRESETS[0];
        setActivePresetId(fallback.id);
        setCustomHeaderContent(fallback.content);
      }
      onNotify?.(`Пресет "${name}" удалён`, 'info');
    }
  };

  const handleSaveEditedPreset = () => {
    if (!editingPreset) return;
    const updated = headerPresets.map((p) => (p.id === editingPreset.id ? editingPreset : p));
    setHeaderPresets(updated);
    if (activePresetId === editingPreset.id) {
      setCustomHeaderContent(editingPreset.content);
    }
    setEditingPreset(null);
    onNotify?.(`Пресет "${editingPreset.name}" обновлён`, 'success');
  };

  const handleResetPresetsToDefault = () => {
    if (window.confirm('Сбросить все пресеты шапок к заводским настройкам?')) {
      setHeaderPresets(DEFAULT_HEADER_PRESETS);
      setActivePresetId(DEFAULT_HEADER_PRESETS[0].id);
      setCustomHeaderContent(DEFAULT_HEADER_PRESETS[0].content);
      onNotify?.('Пресеты шапок сброшены', 'info');
    }
  };

  return (
    <div
      id="vpn-config-processor-container"
      className="min-h-screen bg-[#faf9f5] [background-image:linear-gradient(to_right,#e5e3da_1px,transparent_1px),linear-gradient(to_bottom,#e5e3da_1px,transparent_1px)] [background-size:24px_24px] text-slate-800 pb-24 font-sans"
    >
      {/* Top Floating App Bar */}
      <header className="sticky top-0 z-40 bg-[#faf9f5]/90 backdrop-blur-md border-b border-[#e5e3da] px-4 py-3 sm:px-6">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-900 text-yellow-400 flex items-center justify-center shadow-sm">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 leading-none flex items-center gap-2">
                VPN Config Processor
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Строгая обработка ключей: сверху вниз · сохранение структуры и строк
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleLoadFromCentral}
              disabled={isLoadingCentral}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#d6d3c7] bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 transition shadow-xs"
              title="Загрузить из центрального источника GitVerse"
            >
              <Server className="w-3.5 h-3.5 text-blue-600" />
              <span>Центральный файл</span>
            </button>

            <button
              onClick={handleResetAll}
              className="p-2 rounded-lg border border-[#d6d3c7] bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition shadow-xs"
              title="Сбросить всё в начальное состояние"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area: Sequential, Top-to-Bottom Layout */}
      <main className="max-w-4xl mx-auto px-4 py-8 space-y-10">

        {/* ============================================================== */}
        {/* ============================================================== */}
        {/* ВЕРТИКАЛЬНЫЙ СПИСОК ВЫБОРА КОНФИГУРАЦИЙ (МЕТА-ТЕГОВ) С ЧЕКБОКСАМИ */}
        {/* ============================================================== */}
        <section
          id="header-preset-quick-bar"
          className="bg-white rounded-3xl p-5 sm:p-6 border border-[#e2dfd5] shadow-xs space-y-5"
        >
          {/* Header Bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="inline-flex items-center gap-1.5 bg-[#fef3c7] text-[#92400e] font-bold text-xs uppercase tracking-wider px-2.5 py-0.5 rounded-md border border-[#fde68a]">
                  <Layers className="w-3.5 h-3.5 text-amber-700" />
                  Шапка центрального файла
                </span>
                <span className="text-xs font-mono text-slate-500">
                  {metaTags.filter((t) => t.enabled).length} из {metaTags.length} включено
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <span>Вертикальный выбор конфигураций (мета-тегов)</span>
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-2xl leading-relaxed">
                Отмечайте галочками директивы. Выбранные строки автоматически формируют верхний слой контента для центрального файла сверху вниз.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap self-start md:self-center">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 bg-[#f5f4ef] px-3 py-1.5 rounded-xl border border-[#e2dfd5] cursor-pointer hover:bg-[#edebe2] transition">
                <input
                  type="checkbox"
                  checked={includeHeaderInResult}
                  onChange={(e) => setIncludeHeaderInResult(e.target.checked)}
                  className="rounded border-[#d6d3c7] text-slate-800 focus:ring-0"
                />
                <span>Включать в стек файла</span>
              </label>

              {/* Switch View Mode: Checklist vs Raw */}
              <div className="flex items-center bg-[#f0ede4] p-0.5 rounded-xl border border-[#e2dfd5]">
                <button
                  onClick={() => setMetaTagMode('checklist')}
                  className={`px-3 py-1 text-xs font-medium rounded-lg transition flex items-center gap-1.5 ${
                    metaTagMode === 'checklist'
                      ? 'bg-white text-slate-900 shadow-xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <CheckSquare className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Чекбоксы</span>
                </button>
                <button
                  onClick={() => setMetaTagMode('raw')}
                  className={`px-3 py-1 text-xs font-medium rounded-lg transition flex items-center gap-1.5 ${
                    metaTagMode === 'raw'
                      ? 'bg-white text-slate-900 shadow-xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
                  <span>Исходный текст</span>
                </button>
              </div>

              <button
                onClick={() => setIsHeaderPanelOpen(!isHeaderPanelOpen)}
                className="p-1.5 rounded-xl border border-[#d6d3c7] bg-slate-50 hover:bg-slate-100 text-slate-600 transition"
                title={isHeaderPanelOpen ? 'Свернуть панель' : 'Развернуть панель'}
              >
                {isHeaderPanelOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Quick Header Preset Switcher Pills */}
          <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-[#f0ede4]">
            <span className="text-xs font-semibold text-slate-500 flex items-center gap-1 mr-1">
              <Bookmark className="w-3.5 h-3.5 text-amber-600" />
              Пресеты:
            </span>
            {headerPresets.map((preset) => (
              <button
                key={preset.id}
                onClick={() => handleSelectPreset(preset)}
                className={`px-3 py-1 rounded-xl text-xs font-medium transition flex items-center gap-1.5 ${
                  activePresetId === preset.id
                    ? 'bg-slate-900 text-yellow-400 font-semibold shadow-xs'
                    : 'bg-[#f5f4ef] text-slate-700 hover:bg-[#edebe2] border border-[#e2dfd5]'
                }`}
              >
                <span>{preset.name}</span>
                {activePresetId === preset.id && <Check className="w-3.5 h-3.5" />}
              </button>
            ))}

            <button
              onClick={() => {
                setIsSettingsModalOpen(true);
                setSettingsActiveTab('presets');
              }}
              className="px-2.5 py-1 text-xs text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition flex items-center gap-1 ml-auto"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Менеджер</span>
            </button>
          </div>

          {/* Body: Vertical Checklist of Configurations */}
          {isHeaderPanelOpen && (
            <div className="space-y-4 pt-2">
              {metaTagMode === 'checklist' ? (
                <>
                  {/* Action Toolbar */}
                  <div className="flex items-center justify-between gap-2 flex-wrap bg-[#faf9f5] px-3 py-2 rounded-xl border border-[#e8e6dc] text-xs">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleSelectAllMetaTags(true)}
                        className="text-slate-700 hover:text-slate-900 font-medium flex items-center gap-1 hover:underline"
                      >
                        <CheckSquare className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Выбрать все ({metaTags.length})</span>
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        onClick={() => handleSelectAllMetaTags(false)}
                        className="text-slate-500 hover:text-slate-700 flex items-center gap-1 hover:underline"
                      >
                        <Square className="w-3.5 h-3.5 text-slate-400" />
                        <span>Снять все</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setIsNewTagModalOpen(true)}
                        className="text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>+ Добавить мета-тег</span>
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        onClick={handleSaveCurrentAsPreset}
                        className="text-emerald-700 hover:text-emerald-900 font-medium flex items-center gap-1"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>Сохранить в пресет</span>
                      </button>
                    </div>
                  </div>

                  {/* Vertical List of MetaTag Items (Top-to-Bottom) */}
                  <div className="space-y-2.5">
                    {metaTags.map((item) => (
                      <div
                        key={item.id}
                        className={`rounded-2xl border transition p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                          item.enabled
                            ? 'bg-[#fbfbf8] border-[#d8d4c7] shadow-xs'
                            : 'bg-[#f5f4ef]/60 border-[#e8e6dc] opacity-60'
                        }`}
                      >
                        {/* Left: Checkbox and Tag Identifier */}
                        <div className="flex items-start sm:items-center gap-3 min-w-0 md:w-5/12">
                          <button
                            type="button"
                            onClick={() => handleToggleMetaTag(item.id)}
                            className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition mt-0.5 sm:mt-0 ${
                              item.enabled
                                ? 'bg-slate-900 text-yellow-400 shadow-xs ring-2 ring-slate-900/10'
                                : 'bg-white border-2 border-slate-300 text-transparent hover:border-slate-400'
                            }`}
                          >
                            <Check className="w-4 h-4 stroke-[3]" />
                          </button>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={`font-mono text-xs font-bold px-2 py-0.5 rounded-md border ${
                                  item.enabled
                                    ? 'bg-amber-50 text-amber-900 border-amber-200'
                                    : 'bg-slate-100 text-slate-500 border-slate-200'
                                }`}
                              >
                                {item.tag}
                              </span>
                              <span className="text-xs font-semibold text-slate-800 truncate">
                                {item.label}
                              </span>
                              {item.isCustom && (
                                <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.2 rounded font-medium">
                                  Свой
                                </span>
                              )}
                            </div>
                            {item.description && (
                              <p className="text-[11px] text-slate-500 truncate mt-0.5">
                                {item.description}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Right: Editable Value Input and Quick Actions */}
                        <div className="flex items-center gap-2 flex-1 w-full md:w-auto">
                          <div className="relative flex-1">
                            <input
                              type="text"
                              value={item.value}
                              onChange={(e) => handleUpdateMetaTagValue(item.id, e.target.value)}
                              placeholder={`Значение для ${item.tag}...`}
                              className={`w-full font-mono text-xs px-3 py-1.5 rounded-xl border transition focus:outline-none focus:ring-1 focus:ring-slate-400 ${
                                item.enabled
                                  ? 'bg-white border-[#d6d3c7] text-slate-900 focus:bg-white'
                                  : 'bg-[#eeebe2] border-transparent text-slate-500'
                              }`}
                            />
                            {item.value && (
                              <button
                                onClick={() => handleUpdateMetaTagValue(item.id, '')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-[10px] p-0.5"
                                title="Очистить значение"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>

                          {item.isCustom && (
                            <button
                              onClick={() => handleDeleteMetaTag(item.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg transition shrink-0"
                              title="Удалить этот тег"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                /* Raw Mode: Direct Text Editing with Auto-Parse */
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>Прямое редактирование строк шапки:</span>
                    <button
                      onClick={() => {
                        const parsed = parseHeaderToMetaTags(customHeaderContent);
                        setMetaTags(parsed);
                        setMetaTagMode('checklist');
                        onNotify?.('Шапка разобрана в вертикальный список чекбоксов', 'success');
                      }}
                      className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1"
                    >
                      <CheckSquare className="w-3.5 h-3.5" />
                      <span>Синхронизировать с чекбоксами →</span>
                    </button>
                  </div>
                  <textarea
                    value={customHeaderContent}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCustomHeaderContent(val);
                      const parsed = parseHeaderToMetaTags(val);
                      setMetaTags(parsed);
                    }}
                    rows={6}
                    className="w-full font-mono text-xs p-3 rounded-xl border border-[#d6d3c7] bg-[#faf9f5] focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-400 leading-relaxed"
                    placeholder="#profile-title: ...&#10;#subscription-userinfo: ..."
                  />
                </div>
              )}
            </div>
          )}
        </section>

        {/* ============================================================== */}
        {/* ЭТАП 00: Разделить блок по remark (Screenshot 1)              */}
        {/* ============================================================== */}
        <section
          ref={stage00Ref}
          id="stage-00-container"
          className="bg-white rounded-3xl p-6 sm:p-7 border border-[#e2dfd5] shadow-xs space-y-6"
        >
          {/* Badge & Title */}
          <div>
            <div className="inline-block bg-[#facc15] text-slate-950 font-bold text-xs uppercase tracking-wider px-2.5 py-1 rounded-md mb-2">
              ЭТАП 00
            </div>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
              Разделить блок по remark
            </h2>
            <p className="text-sm text-slate-600 mt-1 max-w-2xl leading-relaxed">
              Вставьте весь блок конфигураций. Приложение найдёт одинаковые remark, соберёт их в группы и само поставит между разными группами разделитель из 20 жёлтых квадратов.
            </p>
          </div>

          {/* Large Input Textarea */}
          <div className="rounded-2xl border border-[#e2dfd5] bg-[#faf9f5] p-3 focus-within:bg-white focus-within:border-slate-400 transition">
            <textarea
              value={stage00RawText}
              onChange={(e) => setStage00RawText(e.target.value)}
              rows={8}
              className="w-full bg-transparent font-mono text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none resize-y leading-relaxed"
              placeholder={`Вставьте весь блок конфигураций...\nvless://...#Группа A\nvless://...#Группа B\nvless://...#Группа A`}
            />
          </div>

          {/* Info note */}
          <div className="rounded-2xl border border-[#e8e6dc] bg-[#faf9f5] p-4 flex items-start gap-3 text-xs sm:text-sm text-slate-600">
            <Info className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              Разделители, пустые строки и повторяющиеся remark обрабатываются автоматически. Порядок первого появления групп сохраняется.
            </p>
          </div>

          {/* Action Button: Auto-Split */}
          <button
            onClick={() => handleAutoSplit()}
            className="w-full py-3.5 px-6 rounded-2xl bg-[#202c39] hover:bg-[#1a2430] active:scale-[0.99] text-white font-medium text-sm sm:text-base flex items-center justify-center gap-2 transition shadow-xs"
          >
            <Sparkles className="w-4 h-4 text-yellow-400" />
            <span>Разделить автоматически →</span>
          </button>

          {/* Settings Box Below Stage 00 */}
          <div className="pt-2">
            <div className="rounded-2xl border border-[#e8e6dc] bg-[#f9f8f4] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 font-bold text-slate-800 text-sm">
                  <Settings className="w-4 h-4 text-slate-600" />
                  <span>Настройки строк и значений по умолчанию</span>
                </div>
                <p className="text-xs text-slate-500">
                  Источники {stage01Lines.length} · выбор {stage01Lines.length} · замена remark {stage02Groups.length} строк
                </p>
              </div>

              <button
                onClick={() => setIsSettingsModalOpen(true)}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-medium transition shadow-xs"
              >
                <Settings className="w-4 h-4 text-yellow-400" />
                <span>Открыть настройки</span>
              </button>
            </div>
          </div>
        </section>

        {/* ============================================================== */}
        {/* ЭТАП 01: Выбор ключей по строкам (Screenshots 2, 3, 4)        */}
        {/* ============================================================== */}
        <section
          ref={stage01Ref}
          id="stage-01-container"
          className="bg-white rounded-3xl p-6 sm:p-7 border border-[#e2dfd5] shadow-xs space-y-6"
        >
          {/* Badge & Title */}
          <div>
            <div className="inline-block bg-[#facc15] text-slate-950 font-bold text-xs uppercase tracking-wider px-2.5 py-1 rounded-md mb-2">
              ЭТАП 01
            </div>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
              Выбор ключей по строкам
            </h2>
            <p className="text-sm text-slate-600 mt-1 max-w-2xl leading-relaxed">
              Вставьте ключи в отдельные строки, снимите ненужные чекбоксы и передайте выбранные конфигурации в этап 2 — замену remark.
            </p>
          </div>

          {/* Info note & Counter */}
          <div className="rounded-2xl border border-[#e8e6dc] bg-[#faf9f5] p-4 space-y-2">
            <div className="flex items-start gap-3 text-xs sm:text-sm text-slate-600">
              <Info className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                Каждая строка — отдельная группа. Порядок строк и ключей сохраняется, а выбранные ключи можно пропустить прямо в этом этапе.
              </p>
            </div>
            <div className="text-xs font-medium text-slate-500 pl-8">
              {stage01Lines.length} строк · {stage01SelectedConfigs} из {stage01TotalConfigs} выбрано
            </div>
          </div>

          {/* List of Line Cards (Строка 01, Строка 02, etc.) */}
          <div className="space-y-4">
            {stage01Lines.map((line, idx) => {
              const selectedLineCount = line.configs.filter((c) => c.enabled).length;
              const totalLineCount = line.configs.length;

              return (
                <div
                  key={line.id}
                  className="rounded-2xl border border-[#e8e6dc] bg-white p-4 sm:p-5 shadow-xs space-y-3 transition"
                >
                  {/* Line Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-full bg-[#f4f2ea] text-slate-700 font-mono text-xs font-bold flex items-center justify-center border border-[#e2dfd5] shrink-0">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <input
                        type="text"
                        value={line.name}
                        onChange={(e) => {
                          const val = e.target.value;
                          setStage01Lines((prev) =>
                            prev.map((l) => (l.id === line.id ? { ...l, name: val } : l))
                          );
                        }}
                        className="text-sm sm:text-base font-bold text-slate-900 bg-transparent focus:outline-none focus:border-b border-slate-400"
                      />
                    </div>

                    {stage01Lines.length > 1 && (
                      <button
                        onClick={() => {
                          setStage01Lines((prev) => prev.filter((l) => l.id !== line.id));
                        }}
                        className="p-1.5 text-slate-400 hover:text-rose-500 transition rounded-lg"
                        title="Удалить строку"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Textarea Label */}
                  <div className="text-xs text-slate-500 font-medium">
                    Все ключи, по одному в строке
                  </div>

                  {/* Textarea (Always visible, preserves original keys) */}
                  <textarea
                    value={line.keys}
                    onChange={(e) => handleUpdateLineKeys(line.id, e.target.value)}
                    rows={4}
                    className="w-full rounded-2xl border-2 border-[#facc15] bg-[#fffdf7] p-3.5 font-mono text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#facc15]/30 resize-y leading-relaxed"
                    placeholder={`vless://...\nvmess://...\ntrojan://...`}
                  />

                  {/* Checkboxes (Automatically appear below textarea when configs exist) */}
                  {line.configs.length > 0 && (
                    <div className="space-y-2 pt-1">
                      {/* Counter and Action Bar */}
                      <div className="flex items-center justify-between text-xs text-slate-500 font-medium px-0.5">
                        <span>
                          {selectedLineCount} из {totalLineCount} выбрано
                        </span>
                        <button
                          type="button"
                          onClick={() => handleSelectAllLineConfigs(line.id, selectedLineCount === 0)}
                          className="text-xs font-semibold text-slate-700 hover:text-slate-900 cursor-pointer transition"
                        >
                          {selectedLineCount > 0 ? 'Снять все' : 'Выбрать все'}
                        </button>
                      </div>

                      {/* Config Items List */}
                      <div className="space-y-2">
                        {line.configs.map((config) => {
                          const hasEmoji = /[\p{Extended_Pictographic}\uD83C-\uDBFF\uDC00-\uDFFF]/u.test(config.remark);
                          const displayTitle = hasEmoji || !config.countryFlag
                            ? config.remark
                            : `${config.remark} ${config.countryFlag}`;

                          return (
                            <div
                              key={config.id}
                              onClick={() => handleToggleLineConfig(line.id, config.id)}
                              className={`rounded-2xl border transition-all p-3 flex items-start gap-3 cursor-pointer select-none ${
                                config.enabled
                                  ? 'bg-[#fffef7] border-[#fef08a] shadow-2xs hover:border-[#facc15]'
                                  : 'bg-[#faf9f5]/70 border-[#e8e6dc] opacity-45 hover:opacity-75'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleLineConfig(line.id, config.id);
                                }}
                                className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 transition ${
                                  config.enabled
                                    ? 'bg-[#facc15] text-slate-950 font-bold shadow-2xs'
                                    : 'bg-white border-2 border-slate-300 text-transparent'
                                }`}
                              >
                                <Check className="w-3.5 h-3.5 stroke-[3]" />
                              </button>

                              <div className="flex-1 min-w-0">
                                <div className="text-xs sm:text-sm font-semibold text-slate-900 truncate">
                                  {displayTitle}
                                </div>
                                <div
                                  className="text-[11px] font-mono text-slate-500 truncate mt-0.5"
                                  title={config.details || config.raw}
                                >
                                  {config.details || config.raw}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Action Row: Add Line + Move to Next Stages */}
          <div className="space-y-3 pt-2">
            <button
              onClick={() => {
                const nextIdx = stage01Lines.length + 1;
                setStage01Lines((prev) => [
                  ...prev,
                  {
                    id: `l_${Date.now()}_${nextIdx}`,
                    name: `Строка ${String(nextIdx).padStart(2, '0')}`,
                    keys: '',
                    configs: [],
                    enabled: true,
                  },
                ]);
              }}
              className="w-full py-2.5 px-4 rounded-xl border border-dashed border-[#cfcbbe] hover:border-slate-500 bg-[#faf9f5] hover:bg-white text-slate-700 text-xs sm:text-sm font-medium transition flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>Добавить строку</span>
            </button>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                onClick={handleTransferStage01ToStage02}
                className="py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs sm:text-sm flex items-center justify-center gap-1.5 transition shadow-xs"
              >
                <span>→ В этап 2</span>
              </button>

              <button
                onClick={() => {
                  handleTransferStage01ToStage02();
                  setTimeout(() => {
                    stage03Ref.current?.scrollIntoView({ behavior: 'smooth' });
                  }, 150);
                }}
                className="py-3 px-4 rounded-xl border border-[#d6d3c7] bg-white hover:bg-slate-50 text-slate-700 font-medium text-xs sm:text-sm flex items-center justify-center gap-1.5 transition shadow-xs"
              >
                <span>→ В этап 3</span>
              </button>

              <button
                onClick={() => {
                  handleTransferStage01ToStage02();
                  handleProcessRemarksAndAssemble();
                }}
                className="py-3 px-4 rounded-xl border border-[#d6d3c7] bg-white hover:bg-slate-50 text-slate-700 font-medium text-xs sm:text-sm flex items-center justify-center gap-1.5 transition shadow-xs"
              >
                <span>→ В этап 4 (Результат)</span>
              </button>
            </div>
          </div>
        </section>

        {/* ============================================================== */}
        {/* ЭТАП 02: Remark и объединение (Screenshots 4, 5, 6, 7, 8)     */}
        {/* ============================================================== */}
        <section
          ref={stage02Ref}
          id="stage-02-container"
          className="bg-white rounded-3xl p-6 sm:p-7 border border-[#e2dfd5] shadow-xs space-y-6"
        >
          {/* Badge & Title */}
          <div>
            <div className="inline-block bg-[#facc15] text-slate-950 font-bold text-xs uppercase tracking-wider px-2.5 py-1 rounded-md mb-2">
              ЭТАП 02
            </div>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
              Remark и объединение
            </h2>
            <p className="text-sm text-slate-600 mt-1 max-w-2xl leading-relaxed">
              Ключи приходят сюда из этапа 1 или их можно вставить вручную. Одна ссылка на строку, порядок групп и строк сохраняется.
            </p>
            <div className="text-xs font-semibold text-slate-500 mt-2">
              {stage02Groups.length} групп / {stage02TotalConfigs} конфигураций
            </div>
          </div>

          {/* Group Cards List */}
          <div className="space-y-5">
            {stage02Groups.map((group, idx) => {
              const configCount = group.keys
                .split('\n')
                .filter((k) => k.trim() && !k.trim().startsWith('#') && !k.trim().startsWith('🟨')).length;

              return (
                <div
                  key={group.id}
                  className="rounded-2xl border border-[#e8e6dc] bg-white p-4 sm:p-5 shadow-xs space-y-3"
                >
                  {/* Group Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-full bg-[#f4f2ea] text-slate-700 font-mono text-xs font-bold flex items-center justify-center border border-[#e2dfd5]">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          НАЗВАНИЕ ГРУППЫ
                        </div>
                        <input
                          type="text"
                          value={group.name}
                          onChange={(e) => {
                            const val = e.target.value;
                            setStage02Groups((prev) =>
                              prev.map((g) => (g.id === group.id ? { ...g, name: val } : g))
                            );
                          }}
                          className="text-sm sm:text-base font-bold text-slate-900 bg-transparent focus:outline-none focus:border-b border-slate-400"
                        />
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        if (stage02Groups.length <= 1) return;
                        setStage02Groups((prev) => prev.filter((g) => g.id !== group.id));
                      }}
                      className="p-1.5 text-slate-400 hover:text-rose-500 transition rounded-lg"
                      title="Удалить группу"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Group Textarea */}
                  <div className="rounded-xl border border-[#e8e6dc] bg-[#faf9f5] p-3 relative focus-within:bg-white focus-within:border-slate-400 transition">
                    <textarea
                      value={group.keys}
                      onChange={(e) => {
                        const val = e.target.value;
                        setStage02Groups((prev) =>
                          prev.map((g) => (g.id === group.id ? { ...g, keys: val } : g))
                        );
                      }}
                      rows={5}
                      className="w-full bg-transparent font-mono text-xs text-slate-800 placeholder-slate-400 focus:outline-none resize-y leading-relaxed pb-6"
                      placeholder={`vless://...\ntrojan://...\nВставьте одну ссылку в строку`}
                    />
                    <div className="absolute bottom-2 right-3 text-[11px] font-mono text-slate-400 select-none">
                      {configCount} конфигураций
                    </div>
                  </div>

                  {/* Group Remark Bar */}
                  <div className="rounded-xl border border-[#e8e6dc] bg-[#f9f8f4] p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1">
                      <Hash className="w-4 h-4 text-slate-400 shrink-0 ml-1" />
                      <input
                        type="text"
                        value={group.remark}
                        onChange={(e) => {
                          const val = e.target.value;
                          setStage02Groups((prev) =>
                            prev.map((g) => (g.id === group.id ? { ...g, remark: val } : g))
                          );
                        }}
                        className="w-full bg-transparent font-medium text-xs sm:text-sm text-slate-800 focus:outline-none placeholder-slate-400"
                        placeholder="Название remark..."
                      />
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                      {/* Quick flags */}
                      <div className="hidden sm:flex items-center gap-1 overflow-x-auto max-w-[160px]">
                        {QUICK_FLAGS.slice(0, 5).map((flag) => (
                          <button
                            key={flag}
                            onClick={() => {
                              setStage02Groups((prev) =>
                                prev.map((g) =>
                                  g.id === group.id
                                    ? {
                                        ...g,
                                        remark: g.remark ? `${g.remark} ${flag}` : flag,
                                      }
                                    : g
                                )
                              );
                            }}
                            className="p-1 hover:bg-slate-200 rounded text-xs transition"
                            title={`Добавить флаг ${flag}`}
                          >
                            {flag}
                          </button>
                        ))}
                      </div>

                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 ml-1">
                        REMARK
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Action Row */}
          <div className="space-y-3 pt-2">
            <button
              onClick={() => {
                const nextIdx = stage02Groups.length + 1;
                const defaultRem = defaultRemarksSettings[nextIdx - 1] || DEFAULT_GROUP_REMARKS[(nextIdx - 1) % DEFAULT_GROUP_REMARKS.length];
                setStage02Groups((prev) => [
                  ...prev,
                  {
                    id: `g_${Date.now()}_${nextIdx}`,
                    name: `Группа ${String(nextIdx).padStart(2, '0')}`,
                    keys: '',
                    remark: defaultRem,
                  },
                ]);
              }}
              className="w-full py-2.5 px-4 rounded-xl border border-dashed border-[#cfcbbe] hover:border-slate-500 bg-[#faf9f5] hover:bg-white text-slate-700 text-xs sm:text-sm font-medium transition flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>Добавить группу</span>
            </button>

            <button
              onClick={handleProcessRemarksAndAssemble}
              className="w-full py-3.5 px-6 rounded-2xl bg-[#202c39] hover:bg-[#1a2430] active:scale-[0.99] text-white font-medium text-sm sm:text-base flex items-center justify-center gap-2 transition shadow-xs"
            >
              <Sparkles className="w-4 h-4 text-yellow-400" />
              <span>⚡ Обработать remark →</span>
            </button>
          </div>

          {/* Status Message (Screenshot 8, 12) */}
          {stage02Status.processed ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 flex items-center gap-3 text-xs sm:text-sm text-emerald-900">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>
                Этап 2 завершён. {stage02Status.count} конфигураций отсортировано и обработано.
              </span>
            </div>
          ) : (
            <div className="rounded-2xl border border-[#e8e6dc] bg-[#faf9f5] p-4 flex items-center gap-3 text-xs sm:text-sm text-slate-500">
              <Info className="w-5 h-5 text-slate-400 shrink-0" />
              <span>Ожидание ссылок конфигураций.</span>
            </div>
          )}
        </section>

        {/* ============================================================== */}
        {/* РЕЗУЛЬТАТ: ИТОГОВЫЙ СТЕК КОНТЕНТА ДЛЯ ЦЕНТРАЛЬНОГО ФАЙЛА     */}
        {/* ============================================================== */}
        <section
          ref={resultRef}
          id="stage-result-container"
          className="bg-white rounded-3xl p-6 sm:p-7 border border-[#e2dfd5] shadow-xs space-y-6"
        >
          {/* Badge & Title */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-block bg-[#facc15] text-slate-950 font-bold text-xs uppercase tracking-wider px-2.5 py-1 rounded-md">
                  ИТОГОВЫЙ СТЕК
                </span>
                <span className="text-xs font-mono text-slate-500">
                  {liveContentStack.totalConfigs} конфигураций · {liveContentStack.groupsCount} групп · {liveContentStack.activeHeaderTags.length} мета-тегов
                </span>
              </div>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                Итоговый «стек» контента для центрального файла
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-2xl leading-relaxed">
                Процесс набора сверху вниз: при выборе галочек конфигурации и мета-теги автоматически добавляются в итоговый контент в строгом порядке следования.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
              <button
                onClick={handleCopyAll}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs sm:text-sm font-semibold transition"
              >
                {isCopiedAll ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span>Скопировано!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-slate-600" />
                    <span>Копировать всё</span>
                  </>
                )}
              </button>

              <button
                onClick={handleSaveToCentral}
                disabled={isSavingCentral}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#202c39] hover:bg-[#1a2430] text-yellow-400 text-xs sm:text-sm font-semibold transition shadow-xs disabled:opacity-50"
              >
                <Server className="w-4 h-4 text-yellow-400" />
                <span>{isSavingCentral ? 'Сохранение...' : '⚡ В Центральный источник'}</span>
              </button>

              <button
                onClick={handleDownloadResult}
                className="p-2.5 rounded-xl border border-[#d6d3c7] bg-white hover:bg-slate-50 text-slate-600 transition"
                title="Скачать файл подписки"
              >
                <Download className="w-4 h-4" />
              </button>

              {/* 3 Source direct buttons */}
              <button
                onClick={() => handleInsertIntoSource(1)}
                disabled={isSavingToSource !== null}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-950 border border-amber-300 text-xs font-bold transition disabled:opacity-50"
                title="Сохранить в Источник 1 (при отписке от канала/бота)"
              >
                <span>{isSavingToSource === 1 ? '...' : '📥 В Источник 1 (Отписка)'}</span>
              </button>

              <button
                onClick={() => handleInsertIntoSource(2)}
                disabled={isSavingToSource !== null}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-950 border border-purple-300 text-xs font-bold transition disabled:opacity-50"
                title="Сохранить в Источник 2 (при попытке подключения 2-го устройства)"
              >
                <span>{isSavingToSource === 2 ? '...' : '📥 В Источник 2 (2-е устр.)'}</span>
              </button>

              <button
                onClick={() => handleInsertIntoSource(3)}
                disabled={isSavingToSource !== null}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-950 border border-rose-300 text-xs font-bold transition disabled:opacity-50"
                title="Сохранить в Источник 3 (при перманентном бане)"
              >
                <span>{isSavingToSource === 3 ? '...' : '📥 В Источник 3 (Перм. бан)'}</span>
              </button>
            </div>
          </div>

          {/* Toggle View Mode: Visual Top-to-Bottom Stack vs Raw Text */}
          <div className="flex items-center justify-between gap-2 border-b border-[#e8e6dc] pb-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowFullRawStack(false)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
                  !showFullRawStack
                    ? 'bg-slate-900 text-yellow-400 shadow-xs'
                    : 'bg-[#f5f4ef] text-slate-600 hover:bg-[#edebe2]'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Стек набора сверху вниз</span>
              </button>
              <button
                onClick={() => setShowFullRawStack(true)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
                  showFullRawStack
                    ? 'bg-slate-900 text-yellow-400 shadow-xs'
                    : 'bg-[#f5f4ef] text-slate-600 hover:bg-[#edebe2]'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Исходный код файла (RAW)</span>
              </button>
            </div>

            <span className="text-[11px] font-mono text-slate-400 hidden sm:inline">
              Сборка: Мета-теги → Разделитель 🟨 → Группы
            </span>
          </div>

          {!showFullRawStack ? (
            /* VISUAL STACK (Сверху вниз) */
            <div className="space-y-4">
              {/* Layer 1: Header Meta-Tags */}
              <div className="rounded-2xl border-2 border-amber-200 bg-[#fffdfa] p-4 sm:p-5 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                      СЛОЙ 01 · ВЕРХНИЙ КОЛОНТИТУЛ
                    </span>
                    <span className="text-xs font-bold text-slate-800">
                      Мета-теги шапки ({liveContentStack.activeHeaderTags.length} активно)
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    {includeHeaderInResult ? 'Включено в стек' : 'Отключено'}
                  </span>
                </div>

                {includeHeaderInResult && liveContentStack.activeHeaderTags.length > 0 ? (
                  <div className="space-y-2 pt-1">
                    {liveContentStack.activeHeaderTags.map((tag) => (
                      <div
                        key={tag.id}
                        className="rounded-xl border border-amber-100 bg-amber-50/50 p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span className="font-mono font-bold text-amber-900">{tag.tag}</span>
                          <span className="text-slate-600 truncate">{tag.label}</span>
                        </div>
                        <span className="font-mono text-[11px] text-slate-700 bg-white px-2 py-0.5 rounded border border-amber-200/60 truncate max-w-sm">
                          {tag.value || '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-3 text-center text-xs text-slate-400 rounded-xl bg-slate-50 border border-dashed border-slate-200">
                    Шапка исключена или ни один мета-тег не выбран.
                  </div>
                )}
              </div>

              {/* Divider 1 */}
              <div className="py-1 flex items-center justify-center gap-2 text-xs font-mono text-amber-700 bg-amber-50/60 py-2 rounded-xl border border-amber-200 select-none">
                <span className="tracking-widest">🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨</span>
                <span className="font-bold text-[10px] uppercase text-amber-900 ml-2">РАЗДЕЛИТЕЛЬ ГРУПП</span>
              </div>

              {/* Group Layers */}
              {liveContentStack.groupSections.length === 0 ? (
                <div className="p-8 text-center rounded-2xl border-2 border-dashed border-[#e2dfd5] bg-[#faf9f5] text-slate-500 text-xs sm:text-sm space-y-2">
                  <Layers className="w-8 h-8 text-slate-400 mx-auto" />
                  <p className="font-semibold text-slate-700">Стек пока пуст</p>
                  <p className="text-slate-500 max-w-md mx-auto">
                    Вставьте ключи в строки Этапа 01 или разделите блок на Этапе 00. Отмеченные галочками конфигурации мгновенно появятся здесь сверху вниз.
                  </p>
                </div>
              ) : (
                liveContentStack.groupSections.map((sec, sIdx) => (
                  <div key={sec.groupIndex} className="space-y-4">
                    {sIdx > 0 && (
                      <div className="py-1 flex items-center justify-center gap-2 text-xs font-mono text-amber-700 bg-amber-50/60 py-2 rounded-xl border border-amber-200 select-none">
                        <span className="tracking-widest">🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨</span>
                        <span className="font-bold text-[10px] uppercase text-amber-900 ml-2">
                          РАЗДЕЛИТЕЛЬ СЛОЕВ ({sIdx + 1})
                        </span>
                      </div>
                    )}

                    <div className="rounded-2xl border border-[#e8e6dc] bg-[#faf9f5] p-4 sm:p-5 shadow-xs space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <span className="w-6 h-6 rounded-full bg-slate-900 text-yellow-400 font-mono text-xs font-bold flex items-center justify-center">
                            {String(sIdx + 2).padStart(2, '0')}
                          </span>
                          <span className="font-bold text-sm text-slate-900">
                            {sec.name}
                          </span>
                          {sec.remark && (
                            <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-white border border-[#d6d3c7] text-slate-700">
                              #{sec.remark}
                            </span>
                          )}
                        </div>
                        <span className="text-xs font-mono text-slate-500">
                          {sec.configs.length} конфигураций
                        </span>
                      </div>

                      {/* Configs inside this layer */}
                      <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                        {sec.configs.map((c) => (
                          <div
                            key={c.id}
                            className="rounded-xl border border-[#e8e6dc] bg-white p-2 flex items-center justify-between gap-2 text-xs"
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <span className="text-sm select-none">{c.countryFlag}</span>
                              <span className="font-mono text-[10px] font-bold uppercase px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
                                {c.protocol}
                              </span>
                              <span className="font-medium text-slate-800 truncate">
                                {c.remark}
                              </span>
                              {c.host && (
                                <span className="font-mono text-[11px] text-slate-400 truncate hidden sm:inline">
                                  @{c.host}{c.port ? `:${c.port}` : ''}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            /* RAW TEXTAREA OUTPUT */
            <div className="rounded-2xl border border-[#e8e6dc] bg-[#faf9f5] p-3 focus-within:bg-white focus-within:border-slate-400 transition">
              <textarea
                value={mergedResult || liveContentStack.fullText}
                onChange={(e) => setMergedResult(e.target.value)}
                rows={12}
                className="w-full bg-transparent font-mono text-xs sm:text-sm text-slate-800 focus:outline-none resize-y leading-relaxed"
                placeholder="Здесь появится готовый результат, объединённый с разделителями из 20 жёлтых квадратов..."
              />
            </div>
          )}

          {/* Local storage note */}
          <div className="text-xs text-slate-500 flex flex-col sm:flex-row sm:items-center justify-between gap-1 pt-2 border-t border-[#f0ede4]">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-slate-400" />
              <span>Сформировано сверху вниз. Синхронизировано с Центральным источником.</span>
            </div>
            <div className="font-mono text-slate-400">
              Порядок: [Шапка] → 🟨...🟨 → [Строки / Группы]
            </div>
          </div>

          {/* Continuation Navigation Banner (Screenshot 11) */}
          <div className="rounded-2xl bg-[#202c39] text-white p-5 space-y-4">
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Оставьте результат как есть или передайте те же конфигурации на этап 3, чтобы задать единый host.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => {
                  stage03Ref.current?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="py-2.5 px-5 rounded-xl bg-[#facc15] hover:bg-[#eab308] text-slate-950 font-bold text-xs sm:text-sm transition flex items-center gap-1.5"
              >
                <span>Перейти к этапу 3 →</span>
              </button>

              <button
                onClick={handleCopyAll}
                className="py-2.5 px-4 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-800 text-white text-xs sm:text-sm font-medium transition"
              >
                <span>Копировать весь стек</span>
              </button>

              <button
                onClick={() => {
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="text-xs text-slate-400 hover:text-white underline underline-offset-2 ml-auto"
              >
                В начало страницы ↑
              </button>
            </div>
          </div>
        </section>

        {/* ============================================================== */}
        {/* ЭТАП 03: Задать единый host (Screenshot 11)                   */}
        {/* ============================================================== */}
        <section
          ref={stage03Ref}
          id="stage-03-container"
          className="bg-white rounded-3xl p-6 sm:p-7 border border-[#e2dfd5] shadow-xs space-y-6"
        >
          {/* Badge & Title */}
          <div>
            <div className="inline-block bg-[#facc15] text-slate-950 font-bold text-xs uppercase tracking-wider px-2.5 py-1 rounded-md mb-2">
              ЭТАП 03
            </div>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
              Задать единый host
            </h2>
            <p className="text-sm text-slate-600 mt-1 max-w-2xl leading-relaxed">
              Поддерживаемые URI обновляются на месте. Существующий host заменяется, а отсутствующий добавляется.
            </p>
          </div>

          {/* Host input card */}
          <div className="rounded-2xl border border-[#e8e6dc] bg-white p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
                <Key className="w-4 h-4 text-slate-600" />
                <span>Значение host</span>
              </div>
              <span className="text-xs text-slate-500 font-mono">
                {liveContentStack.totalConfigs > 0
                  ? `Готово к обработке: ${liveContentStack.totalConfigs} узлов`
                  : 'Введите ключи в Этап 01'}
              </span>
            </div>

            {/* Input field */}
            <div className="rounded-xl border border-[#e2dfd5] bg-[#faf9f5] p-3 focus-within:bg-white focus-within:border-slate-400 transition">
              <input
                type="text"
                value={hostValue}
                onChange={(e) => setHostValue(e.target.value)}
                placeholder="например: cdn.tbank.ru, dzen.ru или domain.com"
                className="w-full bg-transparent font-mono text-sm text-slate-900 focus:outline-none"
              />
            </div>

            {/* Quick Host Presets */}
            <div className="space-y-1.5">
              <div className="text-[11px] text-slate-500 font-medium">Быстрый выбор хоста:</div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  'cdn.tbank.ru',
                  'dzen.ru',
                  'yandex.ru',
                  'nl5.citysborka.ru',
                  'speedtest.net',
                  'zoom.us',
                ].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setHostValue(preset)}
                    className={`px-2.5 py-1 text-xs font-mono rounded-lg border transition ${
                      hostValue === preset
                        ? 'bg-slate-900 text-yellow-400 border-slate-900 font-semibold'
                        : 'bg-[#faf9f5] hover:bg-white text-slate-700 border-[#e2dfd5]'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Host replacement options */}
            <div className="pt-2 border-t border-[#f0ede4] space-y-2">
              <div className="text-xs font-bold text-slate-700">Параметры применения:</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs text-slate-700">
                <label className="flex items-center gap-2 cursor-pointer bg-[#faf9f5] p-2.5 rounded-xl border border-[#e8e6dc] hover:bg-white transition">
                  <input
                    type="checkbox"
                    checked={updateHostParam}
                    onChange={(e) => setUpdateHostParam(e.target.checked)}
                    className="rounded border-[#d6d3c7] text-slate-900 focus:ring-0"
                  />
                  <span>Параметр host (host=...)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer bg-[#faf9f5] p-2.5 rounded-xl border border-[#e8e6dc] hover:bg-white transition">
                  <input
                    type="checkbox"
                    checked={updateSniParam}
                    onChange={(e) => setUpdateSniParam(e.target.checked)}
                    className="rounded border-[#d6d3c7] text-slate-900 focus:ring-0"
                  />
                  <span>Параметр SNI (sni=...)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer bg-[#faf9f5] p-2.5 rounded-xl border border-[#e8e6dc] hover:bg-white transition">
                  <input
                    type="checkbox"
                    checked={updateServerAddress}
                    onChange={(e) => setUpdateServerAddress(e.target.checked)}
                    className="rounded border-[#d6d3c7] text-slate-900 focus:ring-0"
                  />
                  <span>Адрес сервера (@сервер)</span>
                </label>
              </div>
            </div>

            <button
              onClick={handleApplyHost}
              className="w-full py-3.5 px-6 rounded-2xl bg-[#202c39] hover:bg-[#1a2430] active:scale-[0.99] text-white font-medium text-sm sm:text-base flex items-center justify-center gap-2 transition shadow-xs cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-yellow-400" />
              <span>⚡ Завершить этап 3</span>
            </button>

            {/* Protocol badges */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-600 pt-2 border-t border-[#f0ede4]">
              <span className="flex items-center gap-1.5 text-emerald-700 font-medium">
                <Check className="w-3.5 h-3.5" />
                VLESS / VMess / Trojan
              </span>
              <span className="flex items-center gap-1.5 text-emerald-700 font-medium">
                <Check className="w-3.5 h-3.5" />
                Shadowsocks / Hysteria2
              </span>
              <span className="flex items-center gap-1.5 text-emerald-700 font-medium">
                <Check className="w-3.5 h-3.5" />
                TUIC / SOCKS
              </span>
            </div>
          </div>

          {/* Stage 03 Result Banner (Appears immediately upon completing Stage 03) */}
          {stage03Status?.applied && (
            <div className="rounded-2xl border-2 border-emerald-300 bg-[#f0fdf4] p-5 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
                    <Check className="w-4 h-4 stroke-[3]" />
                  </span>
                  <div>
                    <div className="text-sm font-bold text-emerald-950">
                      Этап 3 успешно завершён!
                    </div>
                    <div className="text-xs text-emerald-800">
                      Для {stage03Status.count} конфигураций установлен host: <span className="font-mono font-bold">{stage03Status.host}</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setShowStage03Preview(!showStage03Preview)}
                  className="text-xs font-semibold text-emerald-800 hover:text-emerald-950 flex items-center gap-1 ml-auto sm:ml-0"
                >
                  {showStage03Preview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>{showStage03Preview ? 'Скрыть текст' : 'Просмотр результата'}</span>
                </button>
              </div>

              {/* Action Buttons for Stage 03 Result */}
              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                <button
                  onClick={handleSaveToCentral}
                  disabled={isSavingCentral}
                  className="py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-bold flex items-center gap-1.5 transition shadow-xs disabled:opacity-50"
                >
                  <Save className="w-4 h-4 text-yellow-400" />
                  <span>{isSavingCentral ? 'Сохранение...' : '⚡ В Центральный источник'}</span>
                </button>

                <button
                  onClick={async () => {
                    if (!mergedResult.trim()) return;
                    try {
                      await navigator.clipboard.writeText(mergedResult);
                      setIsStage03Copied(true);
                      setTimeout(() => setIsStage03Copied(false), 2000);
                      onNotify?.('Результат Этапа 3 скопирован в буфер обмена', 'success');
                    } catch {
                      onNotify?.('Не удалось скопировать', 'error');
                    }
                  }}
                  className="py-2.5 px-4 rounded-xl border border-emerald-300 bg-white hover:bg-emerald-50 text-emerald-900 text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition"
                >
                  {isStage03Copied ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-600" />
                      <span>Скопировано!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 text-emerald-700" />
                      <span>Копировать результат</span>
                    </>
                  )}
                </button>

                <button
                  onClick={handleDownloadResult}
                  className="py-2.5 px-4 rounded-xl border border-emerald-300 bg-white hover:bg-emerald-50 text-emerald-900 text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition"
                >
                  <Download className="w-4 h-4 text-emerald-700" />
                  <span>Скачать .txt</span>
                </button>

                {/* Direct 3-Source Buttons */}
                <button
                  onClick={() => handleInsertIntoSource(1)}
                  disabled={isSavingToSource !== null}
                  className="py-2.5 px-3 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-950 text-xs font-bold flex items-center gap-1.5 transition shadow-xs disabled:opacity-50"
                  title="Записать эти ключи в Источник 1 (при отписке от канала/бота)"
                >
                  <span>{isSavingToSource === 1 ? '...' : '📥 В Источник 1 (Отписка)'}</span>
                </button>

                <button
                  onClick={() => handleInsertIntoSource(2)}
                  disabled={isSavingToSource !== null}
                  className="py-2.5 px-3 rounded-xl border border-purple-300 bg-purple-50 hover:bg-purple-100 text-purple-950 text-xs font-bold flex items-center gap-1.5 transition shadow-xs disabled:opacity-50"
                  title="Записать эти ключи в Источник 2 (при попытке подключения 2-го устройства)"
                >
                  <span>{isSavingToSource === 2 ? '...' : '📥 В Источник 2 (2-е устр.)'}</span>
                </button>

                <button
                  onClick={() => handleInsertIntoSource(3)}
                  disabled={isSavingToSource !== null}
                  className="py-2.5 px-3 rounded-xl border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-950 text-xs font-bold flex items-center gap-1.5 transition shadow-xs disabled:opacity-50"
                  title="Записать эти ключи в Источник 3 (при перманентном бане)"
                >
                  <span>{isSavingToSource === 3 ? '...' : '📥 В Источник 3 (Перм. бан)'}</span>
                </button>

                <button
                  onClick={() => {
                    resultRef.current?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="text-xs text-emerald-800 hover:text-emerald-950 underline underline-offset-2 ml-auto"
                >
                  ↑ К Стек контента
                </button>
              </div>

              {/* Collapsible Preview Textarea */}
              {showStage03Preview && (
                <div className="pt-2">
                  <textarea
                    readOnly
                    value={mergedResult}
                    rows={8}
                    className="w-full rounded-xl border border-emerald-200 bg-white p-3 font-mono text-xs text-slate-800 focus:outline-none resize-y"
                  />
                </div>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* STAGE 04: SUBSCRIPTION GATEWAY OUTPUT & ENCODERS               */}
          {/* ============================================================== */}
          <div className="rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50/70 via-white to-orange-50/50 p-5 sm:p-7 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-amber-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white flex items-center justify-center shadow-xs">
                  <Share2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200 uppercase tracking-wider">
                      Этап 04
                    </span>
                    <h3 className="text-base sm:text-lg font-bold text-slate-900">
                      Выдача через шлюз и кодирование
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Формирование ссылок через скоростной шлюз РФ: HAPP (crypt5) и прямой шлюз INCY
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleEncodeGateway}
                disabled={isEncodingGateway}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs sm:text-sm font-bold shadow-xs transition cursor-pointer disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
                <span>{isEncodingGateway ? 'Кодирование...' : '⚡ Закодировать через шлюз'}</span>
              </button>
            </div>

            {/* Gateway Parameters */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Адрес шлюза (URL):
                </label>
                <input
                  type="text"
                  value={gatewayUrlOverride}
                  onChange={(e) => setGatewayUrlOverride(e.target.value)}
                  placeholder="http://shluz.xsph.ru"
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-white text-slate-900 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Токен подписки:
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={gatewayToken}
                    onChange={(e) => setGatewayToken(e.target.value)}
                    placeholder="gw_preview_01"
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-white text-slate-900 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                  <button
                    type="button"
                    onClick={() => setGatewayToken(`gw_${Math.random().toString(36).substring(2, 8)}`)}
                    className="p-2 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 text-stone-600 transition cursor-pointer"
                    title="Сгенерировать новый токен"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Формат вывода:
                </label>
                <select
                  value={gatewayFormat}
                  onChange={(e) => setGatewayFormat(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-white text-slate-900 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer font-semibold"
                >
                  <option value="both">Оба (HAPP crypt5 + INCY шлюз)</option>
                  <option value="happ">Только HAPP (crypt5)</option>
                  <option value="clck">Только INCY (шлюз РФ)</option>
                </select>
              </div>
            </div>

            {/* Generated Gateway Output Cards */}
            {gatewayEncodedResult && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-amber-950 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Ссылки через шлюз готовы к выдаче:</span>
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    Токен: {gatewayEncodedResult.token}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {/* HAPP crypt5 Card */}
                  {gatewayEncodedResult.happUrl && (
                    <div className="p-4 rounded-2xl bg-white border border-purple-200 shadow-xs space-y-2.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-purple-900 flex items-center gap-1.5">
                          <Sparkles className="w-4 h-4 text-purple-600" />
                          <span>HAPP (crypt5)</span>
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              setGatewayQrModal({
                                url: gatewayEncodedResult.happUrl,
                                title: 'HAPP (crypt5) Ссылка подписки',
                                format: 'happ',
                              })
                            }
                            className="px-2 py-1 rounded-lg border border-purple-200 bg-purple-50 hover:bg-purple-100 text-purple-800 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                          >
                            <QrCode className="w-3 h-3" />
                            <span>QR</span>
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await navigator.clipboard.writeText(gatewayEncodedResult.happUrl);
                              setIsGatewayHappCopied(true);
                              setTimeout(() => setIsGatewayHappCopied(false), 2500);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                          >
                            {isGatewayHappCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                            <span>{isGatewayHappCopied ? 'Скопировано!' : 'Копировать'}</span>
                          </button>
                        </div>
                      </div>

                      <div className="p-2.5 rounded-xl bg-purple-50/50 border border-purple-100 font-mono text-[10px] text-purple-950 break-all select-all max-h-20 overflow-y-auto">
                        {gatewayEncodedResult.happUrl}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Шифрованная ссылка протокола HAPP crypt5 для мгновенного импорта в 1 клик.
                      </div>
                    </div>
                  )}

                  {/* INCY Direct Gateway Card */}
                  {gatewayEncodedResult.clckUrl && (
                    <div className="p-4 rounded-2xl bg-white border border-emerald-200 shadow-xs space-y-2.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-emerald-900 flex items-center gap-1.5">
                          <Globe className="w-4 h-4 text-emerald-600" />
                          <span>INCY (Шлюз РФ)</span>
                        </span>
                        <div className="flex items-center gap-1">
                          <a
                            href={gatewayEncodedResult.clckUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="px-2 py-1 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[11px] font-semibold inline-flex items-center gap-1"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>Открыть</span>
                          </a>
                          <button
                            type="button"
                            onClick={() =>
                              setGatewayQrModal({
                                url: gatewayEncodedResult.clckUrl,
                                title: 'INCY Ссылка подписки через шлюз',
                                format: 'clck',
                              })
                            }
                            className="px-2 py-1 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                          >
                            <QrCode className="w-3 h-3" />
                            <span>QR</span>
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await navigator.clipboard.writeText(gatewayEncodedResult.clckUrl);
                              setIsGatewayClckCopied(true);
                              setTimeout(() => setIsGatewayClckCopied(false), 2500);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                          >
                            {isGatewayClckCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                            <span>{isGatewayClckCopied ? 'Скопировано!' : 'Копировать'}</span>
                          </button>
                        </div>
                      </div>

                      <div className="p-2.5 rounded-xl bg-emerald-50/50 border border-emerald-100 font-mono text-[10px] text-emerald-950 break-all select-all">
                        {gatewayEncodedResult.clckUrl}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Прямая ссылка через российский релей-шлюз. Работает без переадресаций и сторонних блокировок.
                      </div>
                    </div>
                  )}
                </div>

                {/* Sub Endpoint Direct */}
                <div className="p-3 rounded-2xl bg-amber-50/50 border border-amber-200 flex items-center justify-between text-xs gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Radio className="w-4 h-4 text-amber-600 shrink-0" />
                    <span className="text-slate-600 shrink-0">Прямой URL шлюза:</span>
                    <code className="font-mono text-amber-950 text-[11px] truncate select-all">
                      {gatewayEncodedResult.targetSubUrl}
                    </code>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(gatewayEncodedResult.targetSubUrl);
                      setIsGatewaySubCopied(true);
                      setTimeout(() => setIsGatewaySubCopied(false), 2500);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-white border border-amber-300 hover:bg-amber-100 text-amber-900 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    {isGatewaySubCopied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    <span>{isGatewaySubCopied ? 'Скопировано' : 'Копировать'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Info note */}
          <div className="rounded-2xl border border-[#e8e6dc] bg-[#faf9f5] p-4 flex items-start gap-3 text-xs sm:text-sm text-slate-600">
            <Info className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-slate-800 mb-0.5">Что изменится</div>
              <p className="leading-relaxed">
                Меняется параметр host / sni в URI. Данные доступа, пути, remark и разделители сохраняются.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* ============================================================== */}
      {/* GATEWAY QR CODE MODAL                                          */}
      {/* ============================================================== */}
      {gatewayQrModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full border border-stone-200 shadow-2xl p-6 flex flex-col items-center text-center space-y-4">
            <div className="w-full flex items-center justify-between pb-2 border-b border-stone-100">
              <span className="font-bold text-slate-900 text-sm">{gatewayQrModal.title}</span>
              <button
                type="button"
                onClick={() => setGatewayQrModal(null)}
                className="text-stone-400 hover:text-stone-600 text-lg leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>

            {gatewayQrDataUrl ? (
              <img
                src={gatewayQrDataUrl}
                alt="QR Code"
                className="w-56 h-56 rounded-2xl border border-stone-200 p-2 shadow-xs bg-white"
              />
            ) : (
              <div className="w-56 h-56 rounded-2xl bg-stone-100 flex items-center justify-center text-xs text-stone-400">
                Генерация QR...
              </div>
            )}

            <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-200 w-full text-[10px] font-mono text-stone-700 break-all select-all">
              {gatewayQrModal.url}
            </div>

            <div className="flex gap-2 w-full">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(gatewayQrModal.url);
                  onNotify?.('Ссылка скопирована!', 'success');
                }}
                className="flex-1 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Копировать</span>
              </button>
              <button
                type="button"
                onClick={() => setGatewayQrModal(null)}
                className="px-4 py-2 rounded-xl border border-stone-200 text-stone-600 hover:bg-stone-50 text-xs font-semibold cursor-pointer"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* SETTINGS & HEADER PRESETS MODAL                                */}
      {/* ============================================================== */}
      {isSettingsModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full border border-[#e2dfd5] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-5 sm:p-6 border-b border-[#e8e6dc] flex items-center justify-between bg-[#faf9f5]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-slate-900 text-yellow-400 flex items-center justify-center">
                  <Settings className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900">
                    Настройки строк и шапок (мета-тегов)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Управление вариантами шапок и значениями remark по умолчанию
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsSettingsModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex border-b border-[#e8e6dc] bg-white px-6">
              <button
                onClick={() => setSettingsActiveTab('presets')}
                className={`py-3 px-4 text-xs sm:text-sm font-semibold border-b-2 transition ${
                  settingsActiveTab === 'presets'
                    ? 'border-slate-900 text-slate-900'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Варианты «Шапки» ({headerPresets.length})
              </button>
              <button
                onClick={() => setSettingsActiveTab('defaults')}
                className={`py-3 px-4 text-xs sm:text-sm font-semibold border-b-2 transition ${
                  settingsActiveTab === 'defaults'
                    ? 'border-slate-900 text-slate-900'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Remarks по умолчанию (6 строк)
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1">
              {settingsActiveTab === 'presets' && (
                <div className="space-y-5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-600">
                      Сохраняйте разные варианты мета-тегов, чтобы переключаться между ними в один клик:
                    </p>

                    <button
                      onClick={() => {
                        const name = prompt('Название новой шапки:', 'Новый вариант шапки');
                        if (!name || !name.trim()) return;
                        const created: HeaderPreset = {
                          id: `custom_${Date.now()}`,
                          name: name.trim(),
                          content: customHeaderContent,
                          isDefault: false,
                        };
                        setHeaderPresets((prev) => [...prev, created]);
                        setActivePresetId(created.id);
                        onNotify?.(`Создана шапка "${name.trim()}"`, 'success');
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-yellow-400 text-xs font-semibold transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Создать вариант</span>
                    </button>
                  </div>

                  {/* List of Presets */}
                  <div className="space-y-3">
                    {headerPresets.map((preset) => (
                      <div
                        key={preset.id}
                        className={`rounded-2xl border p-4 transition ${
                          activePresetId === preset.id
                            ? 'border-slate-900 bg-[#f9f8f4]'
                            : 'border-[#e8e6dc] bg-white hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-slate-900">{preset.name}</span>
                            {activePresetId === preset.id && (
                              <span className="px-2 py-0.5 rounded-md bg-slate-900 text-yellow-400 text-[10px] font-bold uppercase">
                                Активен
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            {activePresetId !== preset.id && (
                              <button
                                onClick={() => handleSelectPreset(preset)}
                                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-800 transition"
                              >
                                Выбрать
                              </button>
                            )}

                            <button
                              onClick={() => setEditingPreset(preset)}
                              className="p-1.5 text-slate-400 hover:text-slate-700 transition rounded-lg"
                              title="Редактировать пресет"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            {!preset.isDefault && (
                              <button
                                onClick={() => handleDeletePreset(preset.id, preset.name)}
                                className="p-1.5 text-slate-400 hover:text-rose-500 transition rounded-lg"
                                title="Удалить пресет"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="font-mono text-xs text-slate-600 bg-white p-2.5 rounded-xl border border-[#e8e6dc] max-h-24 overflow-y-auto whitespace-pre">
                          {preset.content}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Editing Drawer / Form if active */}
                  {editingPreset && (
                    <div className="rounded-2xl border-2 border-slate-900 bg-white p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs uppercase tracking-wider text-slate-700">
                          Редактирование: {editingPreset.name}
                        </span>
                        <button
                          onClick={() => setEditingPreset(null)}
                          className="text-xs text-slate-400 hover:text-slate-600"
                        >
                          Отмена
                        </button>
                      </div>

                      <input
                        type="text"
                        value={editingPreset.name}
                        onChange={(e) =>
                          setEditingPreset({ ...editingPreset, name: e.target.value })
                        }
                        className="w-full text-xs sm:text-sm font-semibold p-2 rounded-lg border border-[#d6d3c7]"
                        placeholder="Название варианта..."
                      />

                      <textarea
                        value={editingPreset.content}
                        onChange={(e) =>
                          setEditingPreset({ ...editingPreset, content: e.target.value })
                        }
                        rows={6}
                        className="w-full font-mono text-xs p-2.5 rounded-lg border border-[#d6d3c7]"
                      />

                      <button
                        onClick={handleSaveEditedPreset}
                        className="w-full py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-yellow-400 text-xs font-bold transition"
                      >
                        Сохранить изменения пресета
                      </button>
                    </div>
                  )}

                  <div className="pt-2 flex justify-between items-center text-xs">
                    <button
                      onClick={handleResetPresetsToDefault}
                      className="text-rose-600 hover:text-rose-800 underline"
                    >
                      Сбросить к заводским вариантам
                    </button>
                  </div>
                </div>
              )}

              {settingsActiveTab === 'defaults' && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-600">
                    Укажите названия remark, которые автоматически подставляются в группы 1–6:
                  </p>

                  <div className="space-y-3">
                    {defaultRemarksSettings.map((rem, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="w-7 h-7 rounded-lg bg-[#f4f2ea] text-slate-700 font-mono text-xs font-bold flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <input
                          type="text"
                          value={rem}
                          onChange={(e) => {
                            const val = e.target.value;
                            setDefaultRemarksSettings((prev) => {
                              const copy = [...prev];
                              copy[idx] = val;
                              return copy;
                            });
                          }}
                          className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-[#d6d3c7] font-medium"
                        />
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => {
                      // Apply to current stage 02 groups
                      setStage02Groups((prev) =>
                        prev.map((g, idx) => ({
                          ...g,
                          remark: defaultRemarksSettings[idx] || g.remark,
                        }))
                      );
                      onNotify?.('Значения по умолчанию обновлены и применены к группам', 'success');
                      setIsSettingsModalOpen(false);
                    }}
                    className="w-full py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-semibold transition"
                  >
                    Применить и сохранить
                  </button>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-[#e8e6dc] bg-[#faf9f5] flex justify-end">
              <button
                onClick={() => setIsSettingsModalOpen(false)}
                className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-semibold transition"
              >
                Готово
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal for adding custom meta-tag */}
      {isNewTagModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full border border-[#e2dfd5] shadow-xl overflow-hidden">
            <div className="p-5 border-b border-[#e8e6dc] flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-900">
                Добавить собственный мета-тег
              </h3>
              <button
                onClick={() => setIsNewTagModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Директива / Тег (начиная с #)
                </label>
                <input
                  type="text"
                  value={newTagDirective}
                  onChange={(e) => setNewTagDirective(e.target.value)}
                  placeholder="#custom-tag:"
                  className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-[#d6d3c7] font-mono focus:border-slate-800 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Понятное название (лейбл)
                </label>
                <input
                  type="text"
                  value={newTagLabel}
                  onChange={(e) => setNewTagLabel(e.target.value)}
                  placeholder="Например: Канал поддержки"
                  className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-[#d6d3c7] text-xs sm:text-sm focus:border-slate-800 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Значение по умолчанию
                </label>
                <input
                  type="text"
                  value={newTagVal}
                  onChange={(e) => setNewTagVal(e.target.value)}
                  placeholder="https://t.me/..."
                  className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-[#d6d3c7] text-xs sm:text-sm focus:border-slate-800 focus:outline-none"
                />
              </div>
            </div>

            <div className="p-4 border-t border-[#e8e6dc] bg-[#faf9f5] flex items-center justify-end gap-2">
              <button
                onClick={() => setIsNewTagModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs sm:text-sm font-medium text-slate-600 hover:bg-slate-100 transition"
              >
                Отмена
              </button>
              <button
                onClick={handleAddCustomMetaTag}
                className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-semibold transition"
              >
                Добавить в список
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
