/**
 * VPN Config Processor Utility
 * Parses, cleans, decodes and manipulates VLESS, VMess, Trojan, SS and WireGuard configurations.
 * Supports HAPP crypt5 format, Base64 decode/encode, Reality parameter overrides,
 * Remark templates with country flags, and Subscription Profile Metadata headers.
 */

export const DEFAULT_PROFILE_HEADER = `#profile-title: Vay VPN [Проверка]
#profile-update-interval: 1h
#subscription-userinfo: upload=0; download=9634698736256; total=0; expire=0
#Support-Url: https://t.me/Vaynet_vpn
#Announce: Делитесь со всеми данным сервисом. Ваша подписка является персональной, не для публичного пользования 
Телеграм👉 @Vaynet_vpn
#providerid RFthi9YM
#hide-settings: 1`;

export const SECTION_DIVIDER = '🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨';

export interface ParsedVpnNode {
  id: string;
  originalRaw: string;
  currentRaw: string;
  protocol: 'vless' | 'vmess' | 'trojan' | 'ss' | 'wireguard' | 'other';
  uuid?: string;
  password?: string;
  host: string;
  port: number | string;
  query: Record<string, string>;
  remark: string;
  countryCode: string;
  countryFlag: string;
  countryName: string;
  isValid: boolean;
  errorMessage?: string;
  isModified?: boolean;
}

export interface VpnSection {
  id: string;
  name: string;
  remarkTemplate: string;
  nodes: ParsedVpnNode[];
}

export interface ProcessorStats {
  total: number;
  valid: number;
  invalid: number;
  protocols: {
    vless: number;
    vmess: number;
    trojan: number;
    ss: number;
    wireguard: number;
    other: number;
  };
  countries: Record<string, number>;
}

// Country code & flag helpers
const COUNTRY_MAP: Record<string, { flag: string; name: string }> = {
  NL: { flag: '🇳🇱', name: 'Нидерланды' },
  DE: { flag: '🇩🇪', name: 'Германия' },
  SE: { flag: '🇸🇪', name: 'Швеция' },
  FI: { flag: '🇫🇮', name: 'Финляндия' },
  RU: { flag: '🇷🇺', name: 'Россия' },
  US: { flag: '🇺🇸', name: 'США' },
  FR: { flag: '🇫🇷', name: 'Франция' },
  GB: { flag: '🇬🇧', name: 'Великобритания' },
  UK: { flag: '🇬🇧', name: 'Великобритания' },
  PL: { flag: '🇵🇱', name: 'Польша' },
  TR: { flag: '🇹🇷', name: 'Турция' },
  KZ: { flag: '🇰🇿', name: 'Казахстан' },
  SY: { flag: '🇸🇾', name: 'Сирия' },
  MA: { flag: '🇲🇦', name: 'Марокко' },
  VN: { flag: '🇻🇳', name: 'Вьетнам' },
  SG: { flag: '🇸🇬', name: 'Сингапур' },
  JP: { flag: '🇯🇵', name: 'Япония' },
  AE: { flag: '🇦🇪', name: 'ОАЭ' },
  EU: { flag: '🇪🇺', name: 'Европа' },
  CH: { flag: '🇨🇭', name: 'Швейцария' },
  AT: { flag: '🇦🇹', name: 'Австрия' },
  IT: { flag: '🇮🇹', name: 'Италия' },
  ES: { flag: '🇪🇸', name: 'Испания' },
  CA: { flag: '🇨🇦', name: 'Канада' },
  UA: { flag: '🇺🇦', name: 'Украина' },
};

export function detectCountry(text: string, host: string): { code: string; flag: string; name: string } {
  const combined = `${text} ${host}`.toLowerCase();

  // 1. Direct emoji flag detection
  for (const [code, info] of Object.entries(COUNTRY_MAP)) {
    if (text.includes(info.flag)) {
      return { code, flag: info.flag, name: info.name };
    }
  }

  // 2. Keyword detection
  const patterns: [RegExp, string][] = [
    [/\b(netherlands|amsterdam|ams|nl)\b/i, 'NL'],
    [/\b(germany|frankfurt|berlin|fra|de)\b/i, 'DE'],
    [/\b(sweden|stockholm|sto|se)\b/i, 'SE'],
    [/\b(finland|helsinki|hel|fi)\b/i, 'FI'],
    [/\b(russia|moscow|spb|msk|ru)\b/i, 'RU'],
    [/\b(usa|united states|new york|nyc|us)\b/i, 'US'],
    [/\b(france|paris|fr)\b/i, 'FR'],
    [/\b(uk|united kingdom|london|gb)\b/i, 'GB'],
    [/\b(poland|warsaw|pl)\b/i, 'PL'],
    [/\b(turkey|istanbul|tr)\b/i, 'TR'],
    [/\b(kazakhstan|almaty|astana|kz)\b/i, 'KZ'],
    [/\b(syria|sy)\b/i, 'SY'],
    [/\b(morocco|ma)\b/i, 'MA'],
    [/\b(vietnam|hanoi|vn)\b/i, 'VN'],
    [/\b(singapore|sg)\b/i, 'SG'],
    [/\b(japan|tokyo|jp)\b/i, 'JP'],
    [/\b(uae|dubai|ae)\b/i, 'AE'],
    [/\b(europe|eu)\b/i, 'EU'],
    [/\b(switzerland|zurich|ch)\b/i, 'CH'],
    [/\b(austria|vienna|at)\b/i, 'AT'],
  ];

  for (const [regex, code] of patterns) {
    if (regex.test(combined)) {
      const info = COUNTRY_MAP[code];
      return { code, flag: info.flag, name: info.name };
    }
  }

  return { code: 'EU', flag: '🇪🇺', name: 'Европа' };
}

// Generate UUIDv4
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Generate random short ID (8 hex chars)
export function generateShortId(): string {
  return Array.from({ length: 8 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

// Split full subscription content into Header directives and Node lines
export function splitHeaderAndNodes(content: string): { header: string; nodesText: string } {
  const lines = content.split('\n');
  const headerLines: string[] = [];
  const nodeLines: string[] = [];
  let readingHeader = true;

  for (const line of lines) {
    const trimmed = line.trim();
    if (readingHeader) {
      if (
        trimmed.startsWith('#') || 
        trimmed.startsWith('//') || 
        trimmed === '' || 
        trimmed.startsWith('Телеграм👉') ||
        trimmed.startsWith('Делитесь')
      ) {
        headerLines.push(line);
      } else {
        readingHeader = false;
        nodeLines.push(line);
      }
    } else {
      nodeLines.push(line);
    }
  }

  // Trim trailing empty lines in header and leading in nodes
  return {
    header: headerLines.join('\n').trim(),
    nodesText: nodeLines.join('\n').trim(),
  };
}

// Parse a single VLESS URL
function parseVless(raw: string): Partial<ParsedVpnNode> {
  // Format: vless://uuid@host:port?query#remark
  try {
    const match = raw.match(/^vless:\/\/([^@]+)@([^:?#]+):(\d+)(?:\?([^#]*))?(?:#(.*))?$/);
    if (!match) {
      return { isValid: false, errorMessage: 'Неверный синтаксис VLESS ссылки' };
    }
    const [_, uuid, host, portStr, queryString = '', hash = ''] = match;
    const query: Record<string, string> = {};
    if (queryString) {
      const params = new URLSearchParams(queryString);
      params.forEach((val, key) => {
        query[key] = val;
      });
    }
    const remark = hash ? decodeURIComponent(hash) : '';
    return {
      protocol: 'vless',
      uuid,
      host,
      port: parseInt(portStr, 10),
      query,
      remark,
      isValid: true,
    };
  } catch (err: any) {
    return { isValid: false, errorMessage: err.message };
  }
}

// Parse a single VMess URL
function parseVmess(raw: string): Partial<ParsedVpnNode> {
  try {
    const b64 = raw.replace(/^vmess:\/\//, '').trim();
    const jsonStr = atob(b64);
    const obj = JSON.parse(jsonStr);
    return {
      protocol: 'vmess',
      uuid: obj.id || '',
      host: obj.add || '',
      port: parseInt(obj.port, 10) || 443,
      query: {
        net: obj.net || 'tcp',
        type: obj.type || 'none',
        host: obj.host || '',
        path: obj.path || '',
        tls: obj.tls || 'none',
        sni: obj.sni || obj.host || '',
      },
      remark: obj.ps || '',
      isValid: true,
    };
  } catch (err: any) {
    return { isValid: false, errorMessage: err.message };
  }
}

// Parse a single Trojan URL
function parseTrojan(raw: string): Partial<ParsedVpnNode> {
  try {
    const match = raw.match(/^trojan:\/\/([^@]+)@([^:?#]+):(\d+)(?:\?([^#]*))?(?:#(.*))?$/);
    if (!match) return { isValid: false, errorMessage: 'Неверный синтаксис Trojan ссылки' };
    const [_, password, host, portStr, queryString = '', hash = ''] = match;
    const query: Record<string, string> = {};
    if (queryString) {
      const params = new URLSearchParams(queryString);
      params.forEach((val, key) => {
        query[key] = val;
      });
    }
    const remark = hash ? decodeURIComponent(hash) : '';
    return {
      protocol: 'trojan',
      password,
      host,
      port: parseInt(portStr, 10),
      query,
      remark,
      isValid: true,
    };
  } catch (err: any) {
    return { isValid: false, errorMessage: err.message };
  }
}

// Parse a single Shadowsocks (SS) URL
function parseShadowsocks(raw: string): Partial<ParsedVpnNode> {
  try {
    // ss://base64(method:password)@host:port#remark or ss://base64(method:password@host:port)#remark
    const match = raw.match(/^ss:\/\/([^#]+)(?:#(.*))?$/);
    if (!match) return { isValid: false, errorMessage: 'Неверный синтаксис Shadowsocks ссылки' };
    const [_, body, hash = ''] = match;
    const remark = hash ? decodeURIComponent(hash) : '';

    let host = '';
    let port = 8388;
    if (body.includes('@')) {
      const parts = body.split('@');
      const hostPort = parts[1].split(':');
      host = hostPort[0];
      port = parseInt(hostPort[1], 10) || 8388;
    } else {
      try {
        const decoded = atob(body);
        const parts = decoded.split('@');
        if (parts.length === 2) {
          const hostPort = parts[1].split(':');
          host = hostPort[0];
          port = parseInt(hostPort[1], 10) || 8388;
        }
      } catch {}
    }

    return {
      protocol: 'ss',
      host: host || 'ss-node',
      port,
      query: {},
      remark,
      isValid: true,
    };
  } catch (err: any) {
    return { isValid: false, errorMessage: err.message };
  }
}

// Build serialized URL from parsed node
export function serializeNode(node: ParsedVpnNode): string {
  if (node.protocol === 'vless') {
    const queryParams = new URLSearchParams();
    for (const [k, v] of Object.entries(node.query)) {
      if (v !== undefined && v !== null && v !== '') {
        queryParams.set(k, v);
      }
    }
    const qStr = queryParams.toString();
    const hash = node.remark ? `#${encodeURIComponent(node.remark)}` : '';
    return `vless://${node.uuid || '00000000-0000-0000-0000-000000000000'}@${node.host}:${node.port}${qStr ? `?${qStr}` : ''}${hash}`;
  }

  if (node.protocol === 'vmess') {
    try {
      const obj: any = {
        v: '2',
        ps: node.remark,
        add: node.host,
        port: Number(node.port),
        id: node.uuid,
        aid: 0,
        net: node.query.net || 'tcp',
        type: node.query.type || 'none',
        host: node.query.host || node.query.sni || '',
        path: node.query.path || '',
        tls: node.query.tls || 'tls',
        sni: node.query.sni || node.query.host || '',
      };
      return `vmess://${btoa(JSON.stringify(obj))}`;
    } catch {
      return node.currentRaw;
    }
  }

  if (node.protocol === 'trojan') {
    const queryParams = new URLSearchParams();
    for (const [k, v] of Object.entries(node.query)) {
      if (v !== undefined && v !== null && v !== '') {
        queryParams.set(k, v);
      }
    }
    const qStr = queryParams.toString();
    const hash = node.remark ? `#${encodeURIComponent(node.remark)}` : '';
    return `trojan://${node.password || 'password'}@${node.host}:${node.port}${qStr ? `?${qStr}` : ''}${hash}`;
  }

  if (node.protocol === 'ss') {
    const hash = node.remark ? `#${encodeURIComponent(node.remark)}` : '';
    const bodyWithoutHash = node.originalRaw.split('#')[0];
    return `${bodyWithoutHash}${hash}`;
  }

  return node.currentRaw;
}

// Parse text input containing multiple VPN node lines
export function parseVpnNodes(input: string): { nodes: ParsedVpnNode[]; header: string; stats: ProcessorStats } {
  const { header, nodesText } = splitHeaderAndNodes(input);
  const rawLines = nodesText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

  const nodes: ParsedVpnNode[] = [];
  const protocolsCount = { vless: 0, vmess: 0, trojan: 0, ss: 0, wireguard: 0, other: 0 };
  const countriesCount: Record<string, number> = {};
  let validCount = 0;
  let invalidCount = 0;

  rawLines.forEach((line, index) => {
    let parsed: Partial<ParsedVpnNode> = {};
    let protocol: ParsedVpnNode['protocol'] = 'other';

    if (line.startsWith('vless://')) {
      protocol = 'vless';
      parsed = parseVless(line);
    } else if (line.startsWith('vmess://')) {
      protocol = 'vmess';
      parsed = parseVmess(line);
    } else if (line.startsWith('trojan://')) {
      protocol = 'trojan';
      parsed = parseTrojan(line);
    } else if (line.startsWith('ss://')) {
      protocol = 'ss';
      parsed = parseShadowsocks(line);
    } else if (line.startsWith('wireguard://') || line.includes('[Interface]')) {
      protocol = 'wireguard';
      parsed = { protocol: 'wireguard', isValid: true, host: 'wireguard', port: 51820, query: {}, remark: 'WireGuard' };
    } else {
      protocol = 'other';
      parsed = { protocol: 'other', isValid: false, errorMessage: 'Неизвестный протокол' };
    }

    protocolsCount[protocol]++;

    const remark = parsed.remark || '';
    const host = parsed.host || '';
    const country = detectCountry(remark, host);

    countriesCount[country.code] = (countriesCount[country.code] || 0) + 1;

    const isValid = parsed.isValid ?? false;
    if (isValid) validCount++;
    else invalidCount++;

    const node: ParsedVpnNode = {
      id: `node_${index + 1}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      originalRaw: line,
      currentRaw: line,
      protocol,
      uuid: parsed.uuid,
      password: parsed.password,
      host,
      port: parsed.port || 443,
      query: parsed.query || {},
      remark,
      countryCode: country.code,
      countryFlag: country.flag,
      countryName: country.name,
      isValid,
      errorMessage: parsed.errorMessage,
      isModified: false,
    };

    nodes.push(node);
  });

  const stats: ProcessorStats = {
    total: nodes.length,
    valid: validCount,
    invalid: invalidCount,
    protocols: protocolsCount,
    countries: countriesCount,
  };

  return { nodes, header, stats };
}

export function calculateStats(nodes: ParsedVpnNode[]): ProcessorStats {
  const protocolsCount = { vless: 0, vmess: 0, trojan: 0, ss: 0, wireguard: 0, other: 0 };
  const countriesCount: Record<string, number> = {};
  let validCount = 0;
  let invalidCount = 0;

  for (const node of nodes) {
    if (protocolsCount[node.protocol] !== undefined) {
      protocolsCount[node.protocol]++;
    } else {
      protocolsCount.other++;
    }

    if (node.countryCode) {
      countriesCount[node.countryCode] = (countriesCount[node.countryCode] || 0) + 1;
    }

    if (node.isValid) validCount++;
    else invalidCount++;
  }

  return {
    total: nodes.length,
    valid: validCount,
    invalid: invalidCount,
    protocols: protocolsCount,
    countries: countriesCount,
  };
}

// Clean and filter nodes (Deduplication, Protocol filter)
export interface CleanFilterOptions {
  removeDuplicates: boolean;
  dedupMethod: 'hostPort' | 'full';
  allowedProtocols: string[];
  removeInvalid: boolean;
  sortBy: 'none' | 'country' | 'protocol';
}

export function filterAndCleanNodes(nodes: ParsedVpnNode[], options: CleanFilterOptions): ParsedVpnNode[] {
  let result = [...nodes];

  // 1. Remove invalid if checked
  if (options.removeInvalid) {
    result = result.filter((n) => n.isValid);
  }

  // 2. Protocol filter
  if (options.allowedProtocols && options.allowedProtocols.length > 0) {
    result = result.filter((n) => options.allowedProtocols.includes(n.protocol));
  }

  // 3. Deduplication
  if (options.removeDuplicates) {
    const seen = new Set<string>();
    result = result.filter((n) => {
      let key = '';
      if (options.dedupMethod === 'hostPort') {
        key = `${n.host.toLowerCase()}:${n.port}`;
      } else {
        key = n.originalRaw;
      }
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // 4. Sorting
  if (options.sortBy === 'country') {
    result.sort((a, b) => a.countryName.localeCompare(b.countryName));
  } else if (options.sortBy === 'protocol') {
    result.sort((a, b) => a.protocol.localeCompare(b.protocol));
  }

  return result;
}

// Remark batch replacement options
export interface RemarkOptions {
  mode: 'prefixSuffix' | 'findReplace' | 'template' | 'cleanAds';
  prefix?: string;
  suffix?: string;
  findText?: string;
  replaceText?: string;
  isRegex?: boolean;
  templatePattern?: string; // e.g. "{flag} {name} #{index}" or "Vaynet [{status}] {flag}"
  cleanAdsKeywords?: string[]; // e.g. ['@', 't.me/', 'VPN', 'Channel']
  numberingStart?: number;
}

export function applyRemarkReplacement(nodes: ParsedVpnNode[], options: RemarkOptions): ParsedVpnNode[] {
  let counter = options.numberingStart || 1;

  return nodes.map((node, idx) => {
    let newRemark = node.remark;

    if (options.mode === 'prefixSuffix') {
      const p = options.prefix || '';
      const s = options.suffix || '';
      newRemark = `${p}${newRemark}${s}`.trim();
    } else if (options.mode === 'findReplace') {
      if (options.findText) {
        if (options.isRegex) {
          try {
            const re = new RegExp(options.findText, 'gi');
            newRemark = newRemark.replace(re, options.replaceText || '');
          } catch {}
        } else {
          newRemark = newRemark.split(options.findText).join(options.replaceText || '');
        }
      }
    } else if (options.mode === 'template') {
      // e.g. "{flag} {country} #{num}" or "Vaynet [Доступный] {flag}"
      const pattern = options.templatePattern || 'Vaynet [Доступный] {flag}';
      const num = counter++;
      newRemark = pattern
        .replace('{flag}', node.countryFlag)
        .replace('{country}', node.countryName)
        .replace('{code}', node.countryCode)
        .replace('{num}', String(num))
        .replace('{index}', String(idx + 1))
        .replace('{host}', node.host)
        .replace('{protocol}', node.protocol.toUpperCase());
    } else if (options.mode === 'cleanAds') {
      // Remove @usernames, links, and ads
      newRemark = newRemark
        .replace(/@\w+/g, '')
        .replace(/https?:\/\/[^\s]+/g, '')
        .replace(/t\.me\/[^\s]+/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    }

    const updatedNode = {
      ...node,
      remark: newRemark,
      isModified: newRemark !== node.remark,
    };
    updatedNode.currentRaw = serializeNode(updatedNode);
    return updatedNode;
  });
}

// UID and Reality overrides options
export interface UidRealityOptions {
  overrideUid: boolean;
  uidMode: 'single' | 'randomPerNode' | 'keep';
  targetUid?: string;
  overrideSni: boolean;
  targetSni?: string;
  overridePbk: boolean;
  targetPbk?: string;
  overrideSid: boolean;
  targetSid?: string;
  overrideFlow: boolean;
  targetFlow?: string; // 'xtls-rprx-vision' | 'none'
  overrideFp: boolean;
  targetFp?: string; // 'firefox' | 'chrome' | 'random'
  overridePort: boolean;
  targetPort?: number;
  overrideHeaderType: boolean;
  targetHeaderType?: string; // 'none' | 'tcp' | 'grpc'
}

export function applyUidAndReality(nodes: ParsedVpnNode[], options: UidRealityOptions): ParsedVpnNode[] {
  return nodes.map((node) => {
    let uuid = node.uuid;
    const query = { ...node.query };
    let port = node.port;
    let isModified = false;

    // 1. UID Override
    if (options.overrideUid && (node.protocol === 'vless' || node.protocol === 'vmess')) {
      if (options.uidMode === 'single' && options.targetUid) {
        uuid = options.targetUid.trim();
        isModified = true;
      } else if (options.uidMode === 'randomPerNode') {
        uuid = generateUUID();
        isModified = true;
      }
    }

    // 2. SNI Override
    if (options.overrideSni && options.targetSni) {
      query.sni = options.targetSni.trim();
      isModified = true;
    }

    // 3. PBK Override
    if (options.overridePbk && options.targetPbk) {
      query.pbk = options.targetPbk.trim();
      isModified = true;
    }

    // 4. SID Override
    if (options.overrideSid && options.targetSid) {
      query.sid = options.targetSid.trim();
      isModified = true;
    }

    // 5. Flow Override
    if (options.overrideFlow && options.targetFlow) {
      if (options.targetFlow === 'none') {
        delete query.flow;
      } else {
        query.flow = options.targetFlow;
      }
      isModified = true;
    }

    // 6. Fingerprint Override
    if (options.overrideFp && options.targetFp) {
      query.fp = options.targetFp;
      isModified = true;
    }

    // 7. Port Override
    if (options.overridePort && options.targetPort) {
      port = options.targetPort;
      isModified = true;
    }

    // 8. HeaderType Override
    if (options.overrideHeaderType && options.targetHeaderType) {
      query.headerType = options.targetHeaderType === 'none' ? '' : options.targetHeaderType;
      isModified = true;
    }

    const updatedNode = {
      ...node,
      uuid,
      query,
      port,
      isModified: isModified || node.isModified,
    };
    updatedNode.currentRaw = serializeNode(updatedNode);
    return updatedNode;
  });
}

// Assemble final full subscription content: Header directives + Node links
export function assembleFullSubscription(header: string, nodes: ParsedVpnNode[], includeHeader: boolean = true): string {
  const nodeLines = nodes.map((n) => n.currentRaw).filter(Boolean);
  if (!includeHeader || !header.trim()) {
    return nodeLines.join('\n');
  }
  return `${header.trim()}\n\n${nodeLines.join('\n')}`;
}

// Split subscription content into distinct Sections divided by SECTION_DIVIDER (🟨🟨🟨...)
export function splitSubscriptionIntoSections(content: string): { header: string; sections: VpnSection[] } {
  if (!content || !content.trim()) {
    return {
      header: DEFAULT_PROFILE_HEADER,
      sections: [
        {
          id: `sec-${Date.now()}-0`,
          name: 'Основная секция',
          remarkTemplate: 'Vaynet [Доступный] {flag}',
          nodes: [],
        },
      ],
    };
  }

  // Split by 5 or more yellow squares with surrounding newlines
  const dividerRegex = /(?:\r?\n|^)\s*(?:🟨\s*){5,}\s*(?:\r?\n|$)/;
  const rawParts = content.split(dividerRegex);

  let header = '';
  const sections: VpnSection[] = [];

  rawParts.forEach((part, index) => {
    let chunkText = part;
    if (index === 0) {
      const splitRes = splitHeaderAndNodes(part);
      header = splitRes.header;
      chunkText = splitRes.nodesText;
    }

    const { nodes } = parseVpnNodes(chunkText);
    if (nodes.length === 0 && !chunkText.trim()) {
      return;
    }

    // Detect most prevalent remark in this section
    const remarkCounts: Record<string, number> = {};
    for (const n of nodes) {
      if (n.remark) {
        remarkCounts[n.remark] = (remarkCounts[n.remark] || 0) + 1;
      }
    }
    let topRemark = '';
    let maxCount = 0;
    for (const [r, count] of Object.entries(remarkCounts)) {
      if (count > maxCount) {
        maxCount = count;
        topRemark = r;
      }
    }

    const defaultTitle = topRemark || `Секция ${index + 1}`;
    sections.push({
      id: `sec-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 6)}`,
      name: defaultTitle,
      remarkTemplate: topRemark || 'Vaynet [Доступный] {flag}',
      nodes,
    });
  });

  if (sections.length === 0) {
    sections.push({
      id: `sec-${Date.now()}-0`,
      name: 'Основная секция',
      remarkTemplate: 'Vaynet [Доступный] {flag}',
      nodes: [],
    });
  }

  return { header: header || DEFAULT_PROFILE_HEADER, sections };
}

// Assemble multiple sections into the complete subscription output separated by SECTION_DIVIDER
export function assembleSectionsToSubscription(
  header: string,
  sections: VpnSection[],
  includeHeader: boolean = true
): string {
  const sectionTexts = sections
    .map((sec) => {
      const nodeLines = sec.nodes.map((n) => n.currentRaw).filter(Boolean);
      return nodeLines.join('\n');
    })
    .filter((text) => text.trim().length > 0);

  if (sectionTexts.length === 0) {
    return includeHeader && header.trim() ? header.trim() : '';
  }

  let result = '';
  if (includeHeader && header.trim()) {
    result = `${header.trim()}\n\n`;
  }

  result += sectionTexts.join(`\n${SECTION_DIVIDER}\n`);
  return result;
}

export interface HostUpdateOptions {
  updateHostParam?: boolean;
  updateSniParam?: boolean;
  updateServerAddress?: boolean;
}

// Set or replace the host/SNI parameter in any URI without disturbing other params
export function setUriHostParam(
  rawUri: string,
  newHost: string,
  options: HostUpdateOptions = { updateHostParam: true, updateSniParam: true }
): string {
  const trimmed = rawUri.trim();
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('🟨')) return trimmed;

  const updateHost = options.updateHostParam !== false;
  const updateSni = options.updateSniParam !== false;
  const updateServer = options.updateServerAddress === true;

  // VMess JSON base64 format
  if (trimmed.startsWith('vmess://')) {
    try {
      const hashIdx = trimmed.indexOf('#');
      const base = hashIdx !== -1 ? trimmed.slice(0, hashIdx) : trimmed;
      const hashPart = hashIdx !== -1 ? trimmed.slice(hashIdx) : '';
      const b64 = base.replace(/^vmess:\/\//, '').trim();

      // UTF-8 safe base64 decode
      const binaryString = atob(b64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const decoded = new TextDecoder('utf-8').decode(bytes);
      const json = JSON.parse(decoded);

      if (updateHost) {
        json.host = newHost;
      }
      if (updateSni) {
        json.sni = newHost;
      }
      if (updateServer) {
        json.add = newHost;
      }

      // UTF-8 safe base64 encode
      const jsonStr = JSON.stringify(json);
      const encBytes = new TextEncoder().encode(jsonStr);
      let encBinary = '';
      for (let i = 0; i < encBytes.length; i++) {
        encBinary += String.fromCharCode(encBytes[i]);
      }
      return 'vmess://' + btoa(encBinary) + hashPart;
    } catch {
      // fallback to URI manipulation below
    }
  }

  // General URI protocols (vless://, trojan://, ss://, hysteria2://, tuic://, etc.)
  const hashIdx = trimmed.indexOf('#');
  let basePart = hashIdx !== -1 ? trimmed.slice(0, hashIdx) : trimmed;
  const hashPart = hashIdx !== -1 ? trimmed.slice(hashIdx) : '';

  // Optionally update server address in @host:port
  if (updateServer) {
    basePart = basePart.replace(/@([^:/?#]+)(?::(\d+))?/, (_m, _oldHost, port) => {
      return `@${newHost}${port ? `:${port}` : ''}`;
    });
  }

  const qIdx = basePart.indexOf('?');
  if (qIdx === -1) {
    const parts: string[] = [];
    if (updateHost) parts.push(`host=${encodeURIComponent(newHost)}`);
    if (updateSni) parts.push(`sni=${encodeURIComponent(newHost)}`);
    const qStr = parts.join('&');
    return qStr ? `${basePart}?${qStr}${hashPart}` : `${basePart}${hashPart}`;
  }

  const pathPart = basePart.slice(0, qIdx);
  const queryPart = basePart.slice(qIdx + 1);
  const params = new URLSearchParams(queryPart);

  if (updateHost) {
    params.set('host', newHost);
  }
  if (updateSni) {
    // If it has sni or is reality/tls, update sni
    if (params.has('sni') || params.get('security') === 'reality' || params.get('security') === 'tls') {
      params.set('sni', newHost);
    } else {
      params.set('sni', newHost);
    }
  }

  return `${pathPart}?${params.toString()}${hashPart}`;
}

// Apply host replacement to multiple raw links
export function applyHostToRawLines(
  rawText: string,
  newHost: string,
  options?: HostUpdateOptions
): string {
  if (!newHost.trim()) return rawText;
  const lines = rawText.split('\n');
  return lines
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('🟨')) {
        return line;
      }
      return setUriHostParam(trimmed, newHost.trim(), options);
    })
    .join('\n');
}

// Preset interface for Profile Metadata Headers
export interface HeaderPreset {
  id: string;
  name: string;
  content: string;
  isDefault?: boolean;
}

export const DEFAULT_HEADER_PRESETS: HeaderPreset[] = [
  {
    id: 'vaynet-check',
    name: 'Vay VPN [Проверка] (@Vaynet_vpn)',
    isDefault: true,
    content: `#profile-title: Vay VPN [Проверка]
#profile-update-interval: 1h
#subscription-userinfo: upload=0; download=9634698736256; total=0; expire=0
#Support-Url: https://t.me/Vaynet_vpn
#Announce: Делитесь со всеми данным сервисом. Ваша подписка является персональной, не для публичного пользования 
Телеграм👉 @Vaynet_vpn
#providerid RFthi9YM
#hide-settings: 1`,
  },
  {
    id: 'vaynet-premium',
    name: 'Vaynet VPN Premium [Основной]',
    isDefault: true,
    content: `#profile-title: Vaynet VPN Premium
#profile-update-interval: 1h
#subscription-userinfo: upload=0; download=10995116277760; total=10995116277760; expire=1798761600
#Support-Url: https://t.me/Vaynet_vpn
#Announce: Премиальный доступ Vaynet VPN. Высокая скорость и стабильное соединение.
#providerid RFthi9YM
#hide-settings: 1`,
  },
  {
    id: 'vaynet-unlimited',
    name: 'Vaynet Скоростной [Безлимит]',
    isDefault: true,
    content: `#profile-title: Vaynet Unlimited Speed
#profile-update-interval: 2h
#subscription-userinfo: upload=0; download=0; total=0; expire=0
#Support-Url: https://t.me/Vaynet_vpn
#Announce: Безлимитное подключение без ограничений по трафику.
#hide-settings: 1`,
  },
  {
    id: 'minimal-clean',
    name: 'Чистый заголовок (Без контактов)',
    isDefault: true,
    content: `#profile-title: Vaynet Private Nodes
#profile-update-interval: 6h
#hide-settings: 1`,
  },
];

// Apply remark template or string to an array of nodes
export function applyRemarkToNodes(nodes: ParsedVpnNode[], templateOrRemark: string): ParsedVpnNode[] {
  return nodes.map((node, idx) => {
    let newRemark = templateOrRemark;
    if (
      newRemark.includes('{flag}') ||
      newRemark.includes('{country}') ||
      newRemark.includes('{code}') ||
      newRemark.includes('{num}') ||
      newRemark.includes('{index}') ||
      newRemark.includes('{host}') ||
      newRemark.includes('{protocol}')
    ) {
      newRemark = newRemark
        .replace('{flag}', node.countryFlag)
        .replace('{country}', node.countryName)
        .replace('{code}', node.countryCode)
        .replace('{num}', String(idx + 1))
        .replace('{index}', String(idx + 1))
        .replace('{host}', node.host)
        .replace('{protocol}', node.protocol.toUpperCase());
    }
    const updated = {
      ...node,
      remark: newRemark,
      isModified: newRemark !== node.remark,
    };
    updated.currentRaw = serializeNode(updated);
    return updated;
  });
}

// Apply remark template or string to all nodes in a specific section
export function applyRemarkToSection(section: VpnSection, templateOrRemark: string): VpnSection {
  return {
    ...section,
    remarkTemplate: templateOrRemark,
    name: templateOrRemark.replace(/\{.*?\}/g, '').trim() || section.name,
    nodes: applyRemarkToNodes(section.nodes, templateOrRemark),
  };
}

