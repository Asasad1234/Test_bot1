import React, { useState, useEffect } from 'react';
import { 
  Database, 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  ArrowRight, 
  Clock, 
  Activity,
  HardDrive
} from 'lucide-react';

interface DatabaseStatusProps {
  onNavigateToSettings?: () => void;
}

interface TestRwResult {
  success: boolean;
  connected: boolean;
  writeLatencyMs?: number;
  readLatencyMs?: number;
  totalLatencyMs?: number;
  testedAt?: string;
  projectId?: string;
  databaseId?: string;
  documentPath?: string;
  status?: string;
  message?: string;
}

export const DatabaseStatus: React.FC<DatabaseStatusProps> = ({ onNavigateToSettings }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [testing, setTesting] = useState<boolean>(false);
  const [result, setResult] = useState<TestRwResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runReadWriteTest = async () => {
    setTesting(true);
    setError(null);
    try {
      const res = await fetch('/api/firebase/test-rw', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        setResult(data);
      } else {
        setResult(data);
        setError(data.message || 'Ошибка соединения с Firebase Firestore');
      }
    } catch (err: any) {
      setError(err.message || 'Сетевая ошибка при проверке Firebase');
      setResult({
        success: false,
        connected: false,
        message: err.message,
      });
    } finally {
      setTesting(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    runReadWriteTest();
  }, []);

  const isConnected = result?.connected === true && result?.success === true;

  return (
    <div 
      id="firebase-database-status-card"
      className="bg-white border border-stone-200 rounded-2xl p-5 shadow-xs space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${
            loading || testing 
              ? 'bg-amber-50 text-amber-600' 
              : isConnected 
                ? 'bg-emerald-50 text-emerald-600' 
                : 'bg-rose-50 text-rose-600'
          }`}>
            <Database className="h-5 w-5" />
          </div>

          <div>
            <div className="flex items-center space-x-2">
              <h4 className="text-sm font-bold text-stone-900">
                Статус базы данных Firebase
              </h4>
              {/* Green / Red / Yellow Status Indicator */}
              <div 
                id="firebase-status-indicator"
                className={`inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                  loading || testing
                    ? 'bg-amber-100 text-amber-800'
                    : isConnected
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-rose-100 text-rose-800'
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${
                  loading || testing
                    ? 'bg-amber-500 animate-pulse'
                    : isConnected
                      ? 'bg-emerald-500'
                      : 'bg-rose-500'
                }`} />
                <span>
                  {loading || testing
                    ? 'Тестирование...'
                    : isConnected
                      ? 'Подключено (Read & Write OK)'
                      : 'Ошибка подключения'}
                </span>
              </div>
            </div>
            <p className="text-xs text-stone-500 mt-0.5">
              Google Cloud Firestore (Authoritative Master Store)
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <button
            id="btn-run-firebase-test"
            type="button"
            disabled={testing || loading}
            onClick={runReadWriteTest}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold shadow-xs transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${testing ? 'animate-spin' : ''}`} />
            <span>{testing ? 'Выполняется тест...' : 'Проверить чтение / запись'}</span>
          </button>

          {onNavigateToSettings && (
            <button
              id="btn-goto-cloud-settings"
              type="button"
              onClick={onNavigateToSettings}
              className="inline-flex items-center space-x-1 px-3 py-2 rounded-xl border border-stone-200 hover:bg-stone-50 text-stone-700 text-xs font-medium transition-colors"
              title="Перейти к управлению облаком"
            >
              <span>Параметры</span>
              <ArrowRight className="h-3.5 w-3.5 text-stone-400" />
            </button>
          )}
        </div>
      </div>

      {/* Latency & Verification Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
        {/* Write Latency */}
        <div className="p-3 rounded-xl bg-stone-50 border border-stone-200/80">
          <div className="flex items-center justify-between text-stone-500 text-[11px]">
            <span>Тест записи (Write)</span>
            <Activity className="h-3.5 w-3.5 text-stone-400" />
          </div>
          <div className="mt-1 flex items-baseline space-x-1.5">
            <span className="text-base font-bold text-stone-900">
              {result?.writeLatencyMs !== undefined ? `${result.writeLatencyMs} ms` : '—'}
            </span>
            {isConnected && (
              <span className="text-[10px] text-emerald-600 font-semibold">Успех</span>
            )}
          </div>
        </div>

        {/* Read Latency */}
        <div className="p-3 rounded-xl bg-stone-50 border border-stone-200/80">
          <div className="flex items-center justify-between text-stone-500 text-[11px]">
            <span>Тест чтения (Read)</span>
            <HardDrive className="h-3.5 w-3.5 text-stone-400" />
          </div>
          <div className="mt-1 flex items-baseline space-x-1.5">
            <span className="text-base font-bold text-stone-900">
              {result?.readLatencyMs !== undefined ? `${result.readLatencyMs} ms` : '—'}
            </span>
            {isConnected && (
              <span className="text-[10px] text-emerald-600 font-semibold">Успех</span>
            )}
          </div>
        </div>

        {/* Total Latency */}
        <div className="p-3 rounded-xl bg-stone-50 border border-stone-200/80">
          <div className="flex items-center justify-between text-stone-500 text-[11px]">
            <span>Круговой пинг (RTT)</span>
            <Clock className="h-3.5 w-3.5 text-stone-400" />
          </div>
          <div className="mt-1">
            <span className="text-base font-bold text-stone-900">
              {result?.totalLatencyMs !== undefined ? `${result.totalLatencyMs} ms` : '—'}
            </span>
          </div>
        </div>

        {/* Target Document */}
        <div className="p-3 rounded-xl bg-stone-50 border border-stone-200/80">
          <div className="text-stone-500 text-[11px]">База данных</div>
          <div className="mt-1 text-xs font-mono font-semibold text-stone-800 truncate" title={result?.databaseId || 'ai-studio-03156b68-3890-4187-85fe-57fab87d5859'}>
            {result?.databaseId ? result.databaseId.slice(0, 16) + '...' : 'ai-studio-...'}
          </div>
        </div>
      </div>

      {/* Status banner / error message */}
      {error ? (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-start space-x-2">
          <XCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Ошибка тестирования Firestore: </span>
            <span>{error}</span>
          </div>
        </div>
      ) : result?.testedAt ? (
        <div className="flex items-center justify-between text-[11px] text-stone-500 pt-1">
          <div className="flex items-center space-x-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            <span>{result.message || 'Сквозной тест чтения и записи успешно пройден'}</span>
          </div>
          <span>
            Проверено: {new Date(result.testedAt).toLocaleTimeString()}
          </span>
        </div>
      ) : null}
    </div>
  );
};
