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

            // Format last 50 candles for DeepSeek
            const ohlcvHistory = (candles || []).slice(-50).map(c =>
                `[${new Date(c.time).toISOString().substr(11, 5)}] O:${c.open} H:${c.high} L:${c.low} C:${c.close} V:${c.volume}`
            ).join('\n');

            const prompt = `
You are a Quant Agent specializing in mathematical mean-reversion scalping using Bollinger Bands.

## CRITICAL STRATEGY UPDATE
You must now apply two strict "Guardrails" before executing any trade. These rules override your standard entry signals.

### Guardrail 1: The "Trend Consensus" Filter (EMA Rule)
You must never fight the dominant trend. Use the 200 EMA as your compass.
1.  **Check the 200 EMA:** Compare the Current Price to the 200 EMA.
2.  **Bull Mode:** If Price > 200 EMA, you are strictly FORBIDDEN from opening SELL positions. You may only look for Long/Buy setups.
3.  **Bear Mode:** If Price < 200 EMA, you are strictly FORBIDDEN from opening BUY positions. You may only look for Short/Sell setups.

*Reasoning: This prevents you from shorting a strong rally or buying a crash.*

### Guardrail 2: The "Squeeze" Filter (Volatility Rule)
You must never trade during low-volatility compression.
1.  **Check Band Width:** Observe the distance between the Upper and Lower Bollinger Bands.
2.  **The Squeeze:** If the bands are visibly tight, narrow, or moving horizontally (pinched together), this indicates a "Squeeze" is in progress.
3.  **Action:** DO NOT TRADE inside a Squeeze.
    - Wait for the bands to "open up" (expand) aggressively before entering.
    - A Squeeze indicates an imminent breakout. Do not stand in front of it.

## Market Data for ${symbol}:
- Price: ${currentPrice}
- Trend (200 EMA): ${trend}
- RSI (14): ${rsi.toFixed(2)}
- Volatility (BB Width): ${(bollinger.upper - bollinger.lower).toFixed(2)}
- 200 EMA Level: ${ema200.toFixed(2)}

## Recent Price Action (Last 50 Candles - M5):
${ohlcvHistory}

## Math/Logic:
1. Analyze the OHLCV sequence for hidden patterns (Divergence, Exhaustion, Breakouts).
2. CHECK GUARDRAIL 1: Is Price > 200 EMA? If so, REJECT all SELL signals. Is Price < 200 EMA? REJECT all BUY signals.
3. CHECK GUARDRAIL 2: Are bands squeezing? If yes, Output HOLD.
4. Only if both Guardrails pass, evaluate Mean Reversion logic (RSI > 70/ < 30).

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
            this.processDecision(response, symbol, currentPrice, { rsi, trend, ema200, bollinger });

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
                // Calculate Profit Ladder (Fixed % Strategy)
                const isBuy = decision.action === 'BUY';

                // TP1: The Safety Net (0.25%) - 40% of position
                const dist1 = currentPrice * 0.0025;
                const tp1 = isBuy ? currentPrice + dist1 : currentPrice - dist1;

                // TP2: The Target (0.6%) - 40% of position
                const dist2 = currentPrice * 0.0060;
                const tp2 = isBuy ? currentPrice + dist2 : currentPrice - dist2;

                // TP3: The Moonshot (Trailing / Open) - 20% of position
                // We set a distant target so it acts as "Open", but let Trailing Stop manage it.
                // Trailing Stop activates after TP2 is hit (logic in bot.js).
                const dist3 = currentPrice * 0.05; // 5% Moonshot target (placeholder)
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
