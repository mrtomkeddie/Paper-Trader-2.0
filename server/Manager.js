import { QuantAgent } from './agents/QuantAgent.js';
import { MacroAgent } from './agents/MacroAgent.js';
import { RiskAgent } from './agents/RiskAgent.js';

export class Manager {
    constructor() {
        this.agents = [
            new QuantAgent(),
            new MacroAgent(),
            new RiskAgent()
        ];
        this.marketData = {}; // Symbol -> Data
        this.newTradesQueue = [];
        this.decisionLog = []; // Log of last 50 decisions
    }

    /**
     * Initialize agents (load state from DB)
     * @param {Object} persistedState - The JSON state from Firebase/Local
     */
    hydrate(persistedState) {
        if (!persistedState || !persistedState.accounts) return;

        this.agents.forEach(agent => {
            const state = persistedState.accounts[agent.id];
            if (state) {
                agent.balance = state.balance;
                agent.equity = state.equity;
            }

            // Load active trades
            if (persistedState.trades) {
                agent.trades = persistedState.trades.filter(t => t.agentId === agent.id);
            }
        });
        console.log('[MANAGER] Agents hydrated from state.');
    }

    /**
     * Process a market tick
     * @param {string} symbol 
     * @param {Object} data - Enriched market data (price, rsi, trend, etc.)
     */
    onTick(symbol, data) {
        this.marketData[symbol] = data;

        // Specific: Get Global Sentiment from Macro Agent if available
        const macroAgent = this.agents.find(a => a.id === 'macro');
        const globalSentiment = macroAgent && macroAgent.latestDecision ? macroAgent.latestDecision.sentiment_score : null;

        // Enrich data with global sentiment for Risk Agent
        data.globalSentiment = globalSentiment;

        // Trigger agents
        this.agents.forEach(agent => {
            try {
                agent.onTick(data);
                // Collect new trades
                const newTrades = agent.getNewTrades();
                if (newTrades.length > 0) {
                    this.newTradesQueue.push(...newTrades);
                }
            } catch (e) {
                console.error(`[MANAGER] Error ticking agent ${agent.name}:`, e);
            }
        });
    }

    consumeNewTrades() {
        const trades = [...this.newTradesQueue];
        this.newTradesQueue = [];
        return trades;
    }

    recalculateState(allTrades) {
        this.agents.forEach(agent => {
            const agentTrades = allTrades.filter(t => t.agentId === agent.id);
            const closedPnL = agentTrades
                .filter(t => t.status === 'CLOSED')
                .reduce((acc, t) => acc + (t.pnl || 0), 0);

            const floatingPnL = agentTrades
                .filter(t => t.status === 'OPEN')
                .reduce((acc, t) => acc + (t.floatingPnl || 0), 0);

            agent.balance = 1000 + closedPnL;
            agent.equity = agent.balance + floatingPnL;
        });
    }

    toggleAgentPause(agentId) {
        const agent = this.agents.find(a => a.id === agentId);
        if (!agent) return null;

        // Toggle halt state
        agent.isHalted = !agent.isHalted;
        console.log(`[MANAGER] Agent ${agentId} is now ${agent.isHalted ? 'PAUSED' : 'ACTIVE'}`);

        // If pausing, close all open trades immediately
        if (agent.isHalted) {
            agent.trades.forEach(t => {
                if (t.status === 'OPEN') {
                    // Force close logic
                    t.status = 'CLOSED';
                    t.closeTime = Date.now();
                    t.closePrice = this.marketData[t.symbol]?.currentPrice || t.entryPrice;
                    t.closeReason = 'MANUAL_PAUSE';

                    // Finalize PnL
                    const isBuy = t.type === 'BUY';
                    const priceDiff = isBuy ? (t.closePrice - t.entryPrice) : (t.entryPrice - t.closePrice);
                    // Approximate PnL calculation if config missing (simplified)
                    t.pnl = priceDiff * (t.currentSize || 0); // Need actual calc if possible, but this is a failsafe

                    console.log(`[MANAGER] Force closed trade ${t.id} for agent ${agentId}`);
                }
            });
            // Recalc state after force close
            this.recalculateState(this.getAllTrades());
        }

        return agent.isHalted;
    }

    getAllTrades() {
        return this.agents.flatMap(a => a.trades);
    }

    /**
     * Get total system state for frontend/DB
     */
    getState() {
        const accounts = {};
        let allTrades = [];

        this.agents.forEach(agent => {
            accounts[agent.id] = {
                name: agent.name,
                role: agent.role,
                balance: agent.balance,
                equity: agent.equity,
                isThinking: agent.isThinking,
                lastAction: agent.lastAction,
                lastThought: agent.lastThought,
                latestDecision: agent.latestDecision // Include full decision object
            };
            allTrades = allTrades.concat(agent.trades);
        });

        return {
            accounts,
            trades: allTrades
        };
    }
    getDetailedState() {
        // Collect balances
        const accounts = {};
        this.agents.forEach(a => {
            accounts[a.id] = {
                id: a.id,
                name: a.name,
                role: a.role,
                balance: a.balance,
                equity: a.equity,
                isThinking: a.isThinking,
                lastAction: a.lastAction
            };
        });

        // Collect latest decisions (snapshot)
        const decisions = this.agents
            .filter(a => a.latestDecision)
            .map(a => ({
                agentId: a.id,
                ...a.latestDecision,
                timestamp: Date.now() // specific logic might be needed for real timestamp
            }));

        return { accounts, decisions };
    }
}
