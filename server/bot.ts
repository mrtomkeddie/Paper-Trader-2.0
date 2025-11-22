import { symbols, SymbolKey } from '../config/symbols';
import { ExchangeClient, OHLCV } from './exchangeClient';
import { isWeekendUTC, sma, rsi, updateVWAP, updateWeekendRange, VWAPState, RangeState, checkRangeBreakRetestLong, checkRangeBreakRetestShort, computeLotSize, RISK_PER_TRADE } from './strategies';
import { v4 as uuidv4 } from 'uuid';

type StrategyId = 'VWAP_MEAN_REV' | 'BTC_RANGE_RETEST';
type Side = 'BUY' | 'SELL';
type Status = 'OPEN' | 'CLOSED';

interface Trade {
  id: string;
  symbol: string;
  strategy: StrategyId;
  type: Side;
  entryPrice: number;
  initialSize: number;
  currentSize: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  tp1Hit: boolean;
  tp2Hit: boolean;
  tp3Hit: boolean;
  openTime: number;
  closeTime?: number;
  closePrice?: number;
  pnl: number;
  status: Status;
}

interface SymbolState {
  closes15m: number[];
  closes1h: number[];
  sma20: number;
  sma50: number;
  rsi14: number;
  vwap: VWAPState;
  range: RangeState;
  last15m?: OHLCV;
  last1h?: OHLCV;
}

const account = { balance: 10000, equity: 10000 };
const trades: Trade[] = [];
const state: Record<string, SymbolState> = {};

for (const s of Object.keys(symbols)) {
  state[s] = { closes15m: [], closes1h: [], sma20: 0, sma50: 0, rsi14: 50, vwap: { pv: 0, v: 0, vwap: 0 }, range: { high: null, low: null, frozen: false, brokeAbove: false, brokeBelow: false } };
}

function hasOpen(symbol: string, strategy: StrategyId) {
  return trades.some(t => t.symbol === symbol && t.strategy === strategy && t.status === 'OPEN');
}

function placeTrade(symbol: string, strategy: StrategyId, type: Side, entry: number, sl: number, tp1: number, tp2: number, tp3: number) {
  const size = computeLotSize(symbol, entry, sl, account.balance);
  if (size <= 0) return;
  const t: Trade = { id: uuidv4(), symbol, strategy, type, entryPrice: entry, initialSize: size, currentSize: size, stopLoss: sl, tp1, tp2, tp3, tp1Hit: false, tp2Hit: false, tp3Hit: false, openTime: Date.now(), pnl: 0, status: 'OPEN' };
  trades.unshift(t);
}

function manageTrades(symbol: string, bid: number, ask: number, sma20: number, last1h?: OHLCV) {
  for (const t of trades) {
    if (t.symbol !== symbol || t.status !== 'OPEN') continue;
    const isBuy = t.type === 'BUY';
    const exit = isBuy ? bid : ask;
    if (isBuy && exit <= t.stopLoss) { t.status = 'CLOSED'; t.closeTime = Date.now(); t.closePrice = exit; const pnl = (exit - t.entryPrice) * t.currentSize; t.pnl += pnl; account.balance += pnl; continue; }
    if (!isBuy && exit >= t.stopLoss) { t.status = 'CLOSED'; t.closeTime = Date.now(); t.closePrice = exit; const pnl = (t.entryPrice - exit) * t.currentSize; t.pnl += pnl; account.balance += pnl; continue; }
    if (!t.tp1Hit) {
      const hit = isBuy ? exit >= t.tp1 : exit <= t.tp1;
      if (hit) { const qty = t.initialSize * 0.4; const pnl = (isBuy ? t.tp1 - t.entryPrice : t.entryPrice - t.tp1) * qty; t.pnl += pnl; account.balance += pnl; t.currentSize -= qty; t.tp1Hit = true; t.stopLoss = t.entryPrice; }
    }
    if (t.tp1Hit && !t.tp2Hit) {
      const hit = isBuy ? exit >= t.tp2 : exit <= t.tp2;
      if (hit) { const qty = t.initialSize * 0.4; const pnl = (isBuy ? t.tp2 - t.entryPrice : t.entryPrice - t.tp2) * qty; t.pnl += pnl; account.balance += pnl; t.currentSize -= qty; t.tp2Hit = true; if (t.strategy === 'VWAP_MEAN_REV') { if (isBuy) t.stopLoss = Math.max(t.stopLoss, sma20 * 0.999); else t.stopLoss = Math.min(t.stopLoss, sma20 * 1.001); } else if (t.strategy === 'BTC_RANGE_RETEST' && last1h) { if (isBuy) t.stopLoss = Math.max(t.stopLoss, last1h.low * 0.999); else t.stopLoss = Math.min(t.stopLoss, last1h.high * 1.001); } }
    }
    if (t.tp2Hit && !t.tp3Hit) {
      const hit = isBuy ? exit >= t.tp3 : exit <= t.tp3;
      if (hit) { const qty = t.initialSize * 0.2; const pnl = (isBuy ? t.tp3 - t.entryPrice : t.entryPrice - t.tp3) * qty; t.pnl += pnl; account.balance += pnl; t.currentSize -= qty; t.tp3Hit = true; t.status = 'CLOSED'; t.closeTime = Date.now(); t.closePrice = exit; }
    }
  }
  account.equity = account.balance;
}

function evaluateVWAPMeanReversion(symbol: string) {
  const cfg = (symbols as any)[symbol];
  if (!cfg.enabled || !cfg.runVWAPMeanReversion) return;
  const st = state[symbol];
  if (st.closes15m.length < 60) return;
  const now = new Date(st.last15m!.time);
  if (!isWeekendUTC(now)) return;
  if (hasOpen(symbol, 'VWAP_MEAN_REV')) return;
  const close = st.closes15m[st.closes15m.length - 1];
  const prevClose = st.closes15m[st.closes15m.length - 2];
  const vwap = st.vwap.vwap || close;
  const deviation = (close - vwap) / vwap;
  const prevSma20 = sma(st.closes15m.slice(0, st.closes15m.length - 1), 20);
  const longCross = prevClose < prevSma20 && close > st.sma20;
  const shortCross = prevClose > prevSma20 && close < st.sma20;
  const longOk = deviation <= -0.015 && st.rsi14 < 30 && longCross;
  const shortOk = deviation >= 0.015 && st.rsi14 > 70 && shortCross;
  if (longOk) {
    const sl = close * (1 - 0.008);
    const tp1 = vwap;
    const tp2 = st.sma50 > close ? st.sma50 : close * 1.01;
    const tp3 = close + 2 * (tp1 - close);
    placeTrade(symbol, 'VWAP_MEAN_REV', 'BUY', close, sl, tp1, tp2, tp3);
  } else if (shortOk) {
    const sl = close * (1 + 0.008);
    const tp1 = vwap;
    const tp2 = st.sma50 < close ? st.sma50 : close * 0.99;
    const tp3 = close - 2 * (close - tp1);
    placeTrade(symbol, 'VWAP_MEAN_REV', 'SELL', close, sl, tp1, tp2, tp3);
  }
}

function evaluateRangeBreakRetest(symbol: string) {
  const cfg = (symbols as any)[symbol];
  if (!cfg.enabled || !cfg.runRangeBreakRetest) return;
  const st = state[symbol];
  if (!st.last1h) return;
  const now = new Date(st.last1h.time);
  if (!isWeekendUTC(now)) return;
  if (!st.range.frozen || st.range.high == null || st.range.low == null) return;
  if (hasOpen(symbol, 'BTC_RANGE_RETEST')) return;
  const c = st.last1h;
  const longOk = checkRangeBreakRetestLong(st.range, { close: c.close, low: c.low });
  const shortOk = checkRangeBreakRetestShort(st.range, { close: c.close, high: c.high });
  if (longOk) {
    const entry = c.close;
    const sl = entry * (1 - 0.005);
    const tp1 = entry + (entry - st.range.high);
    const tp2 = entry + 2 * (entry - st.range.high);
    const tp3 = st.range.high + (st.range.high - st.range.low);
    placeTrade(symbol, 'BTC_RANGE_RETEST', 'BUY', entry, sl, tp1, tp2, tp3);
  } else if (shortOk) {
    const entry = c.close;
    const sl = entry * (1 + 0.005);
    const tp1 = entry - (st.range.low - entry);
    const tp2 = entry - 2 * (st.range.low - entry);
    const tp3 = st.range.low - (st.range.high - st.range.low);
    placeTrade(symbol, 'BTC_RANGE_RETEST', 'SELL', entry, sl, tp1, tp2, tp3);
  }
}

function on15m(symbol: string, c: OHLCV) {
  const st = state[symbol];
  st.last15m = c;
  st.closes15m.push(c.close);
  if (st.closes15m.length > 300) st.closes15m.shift();
  st.sma20 = sma(st.closes15m, 20);
  st.sma50 = sma(st.closes15m, 50);
  st.rsi14 = rsi(st.closes15m, 14);
  st.vwap = updateVWAP(st.vwap, c.close, c.volume, c.time);
  evaluateVWAPMeanReversion(symbol);
  const bid = c.close * 0.999;
  const ask = c.close * 1.001;
  manageTrades(symbol, bid, ask, st.sma20, state[symbol].last1h);
}

function on1h(symbol: string, c: OHLCV) {
  const st = state[symbol];
  st.last1h = c;
  st.closes1h.push(c.close);
  if (st.closes1h.length > 300) st.closes1h.shift();
  st.range = updateWeekendRange(st.range, { time: c.time, high: c.high, low: c.low, close: c.close });
  evaluateRangeBreakRetest(symbol);
}

function main() {
  const client = new ExchangeClient();
  const unsub: (() => void)[] = [];
  for (const s of Object.keys(symbols) as SymbolKey[]) {
    if (!(symbols as any)[s].enabled) continue;
    unsub.push(client.subscribe(s, '15m', c => on15m(s, c)));
    if ((symbols as any)[s].runRangeBreakRetest) unsub.push(client.subscribe(s, '1h', c => on1h(s, c)));
  }
}

main();