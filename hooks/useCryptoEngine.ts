import { useEffect, useRef, useState } from 'react';

export interface CryptoAssetData {
  symbol: string;
  currentPrice: number;
  history: { time: string; value: number }[];
  rsi: number;
  ema: number;
  ema200: number;
  trend: 'UP' | 'DOWN';
  botActive: boolean;
  activeStrategies: string[];
  isLive?: boolean;
  aiAnalyzing?: boolean;
}

export interface CryptoTrade {
  id: string;
  symbol: string;
  type: 'BUY' | 'SELL';
  entryPrice: number;
  initialSize: number;
  currentSize: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  tp1Hit?: boolean;
  tp2Hit?: boolean;
  tp3Hit?: boolean;
  openTime: number;
  closeTime?: number;
  closePrice?: number;
  pnl: number;
  status: 'OPEN' | 'CLOSED';
  strategy?: string;
}

export interface CryptoAccount { balance: number; equity: number; dayPnL: number; totalPnL?: number; }

export const useCryptoEngine = () => {
  const isDev = (import.meta as any)?.env?.DEV;
  const [remoteUrl, setRemoteUrl] = useState(() => (isDev ? '/crypto' : 'http://localhost:3002'));
  const [assets, setAssets] = useState<Record<string, CryptoAssetData>>({});
  const [account, setAccount] = useState<CryptoAccount>({ balance: 0, equity: 0, dayPnL: 0, totalPnL: 0 });
  const [trades, setTrades] = useState<CryptoTrade[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const base = remoteUrl.trim().replace(/\/$/, '');
    const es = new EventSource(`${base}/events?ts=${Date.now()}`);
    esRef.current = es;
    es.onmessage = (ev) => {
      try {
        const s = JSON.parse(ev.data);
        if (s.assets && s.account && s.trades) {
          setAssets(s.assets);
          setAccount(s.account);
          setTrades(s.trades);
          setIsConnected(true);
        }
      } catch {}
    };
    es.onerror = () => { try { es.close(); } catch {}; esRef.current = null; setIsConnected(false); };
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${base}/state?ts=${Date.now()}`, { cache: 'no-store' });
        if (res.ok) {
          const s = await res.json();
          if (s.assets && s.account && s.trades) {
            setAssets(s.assets);
            setAccount(s.account);
            setTrades(s.trades);
            setIsConnected(true);
          }
        }
      } catch {}
    }, 1500);
    return () => { try { clearInterval(interval); } catch {}; try { es.close(); } catch {}; esRef.current = null; };
  }, [remoteUrl]);

  const toggleBot = async (symbol: string) => {
    const base = remoteUrl.trim().replace(/\/$/, '');
    try { await fetch(`${base}/toggle/${encodeURIComponent(symbol)}`, { method: 'POST' }); } catch {}
  };
  const setStrategy = async (symbol: string, strategy: string) => {
    const base = remoteUrl.trim().replace(/\/$/, '');
    try { await fetch(`${base}/strategy/${encodeURIComponent(symbol)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ strategy }) }); } catch {}
  };
  return { assets, account, trades, isConnected, remoteUrl, setRemoteUrl, toggleBot, setStrategy };
};