import { WebSocket } from 'ws';

export type Timeframe = '15m' | '1h';
export interface OHLCV { time: number; open: number; high: number; low: number; close: number; volume: number; }
export type CandleHandler = (candle: OHLCV) => void;

export class ExchangeClient {
  subscribe(symbol: string, timeframe: Timeframe, cb: CandleHandler): () => void {
    const tf = timeframe === '15m' ? '15m' : '1h';
    const stream = `${symbol.toLowerCase()}@kline_${tf}`;
    const url = `wss://stream.binance.com:9443/ws/${stream}`;
    const ws = new WebSocket(url);
    const handler = (data: any) => {
      try {
        const evt = JSON.parse(data.toString());
        const k = evt.k;
        if (!k || !k.x) return;
        const o: OHLCV = {
          time: Number(k.T),
          open: parseFloat(k.o),
          high: parseFloat(k.h),
          low: parseFloat(k.l),
          close: parseFloat(k.c),
          volume: parseFloat(k.v)
        };
        cb(o);
      } catch {}
    };
    ws.on('message', handler);
    ws.on('error', () => {});
    ws.on('close', () => {});
    return () => { try { ws.close(); } catch {} };
  }
}