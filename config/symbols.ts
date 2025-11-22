export const symbols = {
  BTCUSDT: {
    enabled: true,
    runVWAPMeanReversion: true,
    runRangeBreakRetest: true,
    valuePerPoint: 1,
    minLot: 0.001,
    maxLot: 1,
    lotStep: 0.001
  },
  ETHUSDT: {
    enabled: true,
    runVWAPMeanReversion: true,
    runRangeBreakRetest: false,
    valuePerPoint: 0.5,
    minLot: 0.01,
    maxLot: 5,
    lotStep: 0.01
  },
  SOLUSDT: {
    enabled: true,
    runVWAPMeanReversion: true,
    runRangeBreakRetest: false,
    valuePerPoint: 0.1,
    minLot: 0.1,
    maxLot: 50,
    lotStep: 0.1
  }
} as const;

export type SymbolKey = keyof typeof symbols;