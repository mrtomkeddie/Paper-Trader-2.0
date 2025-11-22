export type Timeframe = '15m' | '1h';
export interface OHLCV { time: number; open: number; high: number; low: number; close: number; volume: number; }
export type CandleHandler = (candle: OHLCV) => void;

const tfMs: Record<Timeframe, number> = { '15m': 15 * 60 * 1000, '1h': 60 * 60 * 1000 };

function randn() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

export class ExchangeClient {
  subscribe(symbol: string, timeframe: Timeframe, cb: CandleHandler): () => void {
    let base = symbol === 'BTCUSDT' ? 70000 : symbol === 'ETHUSDT' ? 3500 : 150;
    let volBase = symbol === 'BTCUSDT' ? 1200 : symbol === 'ETHUSDT' ? 800 : 500;
    let lastClose = base;
    let nextTs = Date.now() - (Date.now() % tfMs[timeframe]) + tfMs[timeframe];
    const id = setInterval(() => {
      const drift = symbol === 'BTCUSDT' ? 0.0001 : symbol === 'ETHUSDT' ? 0.00012 : 0.0002;
      const shock = randn() * (symbol === 'BTCUSDT' ? 0.008 : symbol === 'ETHUSDT' ? 0.012 : 0.02);
      const close = Math.max(1, lastClose * (1 + drift + shock));
      const high = Math.max(close, lastClose) * (1 + Math.abs(randn()) * 0.002);
      const low = Math.min(close, lastClose) * (1 - Math.abs(randn()) * 0.002);
      const volume = Math.max(1, volBase + randn() * volBase * 0.2);
      const open = lastClose;
      const candle: OHLCV = { time: nextTs, open, high, low, close, volume };
      lastClose = close;
      nextTs += tfMs[timeframe];
      cb(candle);
    }, tfMs[timeframe] / 20);
    return () => clearInterval(id);
  }
}