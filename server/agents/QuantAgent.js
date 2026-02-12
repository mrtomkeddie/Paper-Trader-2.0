import { Agent } from './Agent.js';
import OpenAI from 'openai';

export class QuantAgent extends Agent {
    constructor() {
        super('quant', 'The Quant', 'Technical Scalper (DeepSeek R1)', 1000);

        // Initialize DeepSeek Client
        if (process.env.DEEPSEEK_API_KEY) {
            this.client = new OpenAI({
                baseURL: 'https://api.deepseek.com',
                apiKey: process.env.DEEPSEEK_API_KEY
            });
        } else {
            console.warn('[QUANT] Missing DEEPSEEK_API_KEY. Agent will run in mock mode.');
        }
        // Initialize state
        this.lastTickTime = 0;
    }

    calculateATR(candles, period = 14) {
        if (!candles || candles.length < period + 1) return 0;

        const trs = [];
        for (let i = 1; i < candles.length; i++) {
            const current = candles[i];
            const prev = candles[i - 1];
            const tr = Math.max(
                current.high - current.low,
                Math.abs(current.high - prev.close),
                Math.abs(current.low - prev.close)
            );
            trs.push(tr);
        }

        if (trs.length < period) return 0;

        // Simple Moving Average of TR for simplicity and speed
        // (Wilder's Smoothing is ideal but SMA is sufficient for this scope)
        const relevantTRs = trs.slice(-period);
        const sum = relevantTRs.reduce((a, b) => a + b, 0);
        return sum / period;
    }

    async onTick(marketData) {
        if (!this.client) return;
        if (this.isThinking) return;

        // Scalper Cooldown: Check every 60 seconds max
        const now = Date.now();
        if (now - this.lastTickTime < 60000) return;
        this.lastTickTime = now;

        this.isThinking = true;

        try {
            const { symbol, currentPrice, rsi, trend, ema200, bollinger, candles } = marketData;

            // Calculate ATR (14-period on 5m candles)
            const atr = this.calculateATR(candles, 14);
            const atrValue = atr || (currentPrice * 0.0015); // Fallback to 0.15% if no ATR


            // Format last 50 candles for DeepSeek
            const ohlcvHistory = (candles || []).slice(-50).map(c =>
                `[${new Date(c.time).toISOString().substr(11, 5)}] O:${c.open} H:${c.high} L:${c.low} C:${c.close} V:${c.volume}`
            ).join('\n');

            const prompt = `
You are the Quant Agent. Your goal is to capture high-probability moves by aligning momentum with the dominant trend.

## 1. THE "GUARDRAILS" (Strict Pre-Trade Checks)
Before looking for a specific setup, you must pass these checks. If they fail, the trade is rejected.

### Guardrail A: Trend Consensus (The 200 EMA)
You must never fight the 200 EMA.
- **Bull Mode:** If Price > 200 EMA, you are **LONG ONLY**. (Reject all Sell signals).
- **Bear Mode:** If Price < 200 EMA, you are **SHORT ONLY**. (Reject all Buy signals).

### Guardrail B: The Squeeze Filter (Volatility)
- **Rule:** Check the Bollinger Band Width.
- **Action:** If the bands are "squeezed" (tight/horizontal), **WAIT**. Do not enter *during* the quiet period. Wait for the bands to start expanding (opening up) before triggering the trade.

---

## 2. THE SETUP (Dynamic Logic)
Because you are trading *with* the trend, you do not need to wait for extreme "crash" signals. Use these adjusted thresholds:

### Bull Mode Scenarios (Price > 200 EMA)
- **Trigger:** Look for "Dip Buys" where RSI drops below **40** (instead of the usual 30).
- **Confirmation:** Price touching or piercing the Lower Bollinger Band + A bullish candle pattern (Pin bar, Engulfing).

### Bear Mode Scenarios (Price < 200 EMA)
- **Trigger:** Look for "Rally Sells" where RSI rises above **70** (tightened from 60 to reduce bias).
- **Confirmation:** Price touching or piercing the Upper Bollinger Band + A bearish candle pattern.

---

## 2.5 THE DANGER ZONE (10:30-12:00 UTC)
- **Warning:** Historically, the window between 10:30 and 12:00 UTC has high volatility and significant losses.
- **Guidance:** Avoid opening new positions during this window unless the setup is extremely clear and has additional confirmation from the Macro trend.

---

## 3. EXECUTION THRESHOLDS
- **Confidence:** Output a score > **70%**.
- **Cooldown:** Wait **60 seconds** between checks.
- Risk Per Trade: **1%** of account balance.
- **Stop Loss Rule:** You MUST use a dynamic stop loss based on ATR.
- **ATR Value:** ${atrValue.toFixed(4)}
- **Stop Loss Distance:** 1.5 * ATR (${(atrValue * 1.5).toFixed(4)})
- We will calculate the exact price levels in the engine, but you must factor this volatility into your logic.

## Market Data for ${symbol}:
- Price: ${currentPrice}
- Trend (200 EMA): ${trend}
- RSI (14): ${rsi.toFixed(2)}
- Volatility (BB Width): ${(bollinger.upper - bollinger.lower).toFixed(2)}
- ATR (14): ${atrValue.toFixed(4)}
- 200 EMA Level: ${ema200.toFixed(2)}

## Recent Price Action (Last 50 Candles - M5):
${ohlcvHistory}

## Output Format
Output a JSON object ONLY:
{
  "action": "BUY" | "SELL" | "HOLD",
  "confidence": number (0-100),
  "reason": "String (max 20 words)",
  "stopLoss": number,
  "takeProfit": number
}
`;

            const completion = await this.client.chat.completions.create({
                messages: [{ role: "system", content: prompt }],
                model: "deepseek-chat",
            });

            const response = completion.choices[0].message.content;
            console.log(`[QUANT] Raw Response: ${response.substring(0, 50)}...`); // Debug log
            this.processDecision(response, symbol, currentPrice, { rsi, trend, ema200, bollinger, atr: atrValue });


        } catch (error) {
            console.error('[QUANT] Error thinking:', error.message);
        } finally {
            this.isThinking = false;
        }
    }

    processDecision(responseText, symbol, currentPrice, snapshot) {
        try {
            // Basic JSON extraction cleanup
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (!jsonMatch) return;

            const decision = JSON.parse(jsonMatch[0]);

            // --- STRICT GUARDRAILS (Code Enforcement) ---
            const { ema200 } = snapshot; // Get EMA from snapshot

            // Guardrail 1: Trend Consensus
            if (ema200 && decision.action !== 'HOLD') {
                if (decision.action === 'BUY' && currentPrice < ema200) {
                    console.log(`[QUANT] Blocked BUY: Price (${currentPrice}) < 200 EMA (${ema200.toFixed(2)})`);
                    decision.action = 'HOLD';
                    decision.reason = 'Blocked: Against 200 EMA Trend';
                } else if (decision.action === 'SELL' && currentPrice > ema200) {
                    console.log(`[QUANT] Blocked SELL: Price (${currentPrice}) > 200 EMA (${ema200.toFixed(2)})`);
                    decision.action = 'HOLD';
                    decision.reason = 'Blocked: Against 200 EMA Trend';
                }
            }

            this.lastThought = decision.reason;
            this.lastAction = decision.action;

            if (decision.action !== 'HOLD' && decision.confidence > 70) {
                // Calculate Profit Ladder (ATR-Based Strategy)
                const isBuy = decision.action === 'BUY';
                const atr = snapshot.atr || (currentPrice * 0.0015);

                // ATR Multipliers
                const riskDist = atr * 1.5; // 1.5x ATR Stop Loss

                // Calculate Dynamic Stop Loss
                const stopLossPrice = isBuy ? currentPrice - riskDist : currentPrice + riskDist;
                decision.stopLoss = Number(stopLossPrice.toFixed(2));

                // TP1: The Safety Net (1.0x Risk) - 40% of position
                const dist1 = riskDist * 1.0;
                const tp1 = isBuy ? currentPrice + dist1 : currentPrice - dist1;

                // TP2: The Target (2.0x Risk) - 40% of position
                const dist2 = riskDist * 2.0;
                const tp2 = isBuy ? currentPrice + dist2 : currentPrice - dist2;

                // TP3: The Moonshot (4.0x Risk) - 20% of position
                // Trailing Stop activates after TP2 is hit (logic in bot.js).
                const dist3 = riskDist * 4.0;
                const tp3 = isBuy ? currentPrice + dist3 : currentPrice - dist3;

                const tpLevels = [
                    { id: 1, price: Number(tp1.toFixed(2)), percentage: 0.4, hit: false },
                    { id: 2, price: Number(tp2.toFixed(2)), percentage: 0.4, hit: false },
                    { id: 3, price: Number(tp3.toFixed(2)), percentage: 0.2, hit: false }
                ];

                this.executeTrade(
                    symbol,
                    decision.action,
                    0, // Size ignored (calculated dynamically)
                    currentPrice,
                    decision.stopLoss,
                    tpLevels,
                    decision.reason,
                    snapshot // Pass Technical Data
                );
            }
        } catch (e) {
            console.error('[QUANT] Failed to parse decision:', e);
        }
    }
}
