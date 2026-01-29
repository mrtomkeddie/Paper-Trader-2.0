import React from 'react';
import { AccountState } from '../types';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface Props {
  indices: AccountState;
  crypto: AccountState;
}

const PortfolioHeader: React.FC<Props> = ({ indices, crypto }) => {
  const totalEquity = (indices?.equity || 0) + (crypto?.equity || 0);
  const totalBalance = (indices?.balance || 0) + (crypto?.balance || 0);
  const totalDayPnL = (indices?.dayPnL || 0) + (crypto?.dayPnL || 0);
  const isPositiveDay = totalDayPnL >= 0;
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold text-ios-gray uppercase tracking-wider">Portfolio Equity</div>
          <div className="text-3xl font-bold text-white tabular-nums">£{totalEquity.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </div>
        <div className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-bold ${isPositiveDay ? 'bg-ios-green/15 text-ios-green' : 'bg-ios-red/15 text-ios-red'}`}>
          {isPositiveDay ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
          <span>£{Math.abs(totalDayPnL || 0).toFixed(2)} ({((totalDayPnL || 0) / Math.max(1, totalBalance || 1) * 100).toFixed(2)}%)</span>
          <span className="ml-1 opacity-60 font-medium text-xs">Today</span>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="bg-white/5 rounded-xl p-3 border border-white/5">
          <div className="text-[10px] text-ios-gray uppercase font-semibold mb-1">Indices Equity</div>
          <div className="text-base font-bold text-white tabular-nums">£{(indices?.equity || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </div>
        <div className="bg-white/5 rounded-xl p-3 border border-white/5">
          <div className="text-[10px] text-ios-gray uppercase font-semibold mb-1">Crypto Equity</div>
          <div className="text-base font-bold text-white tabular-nums">£{(crypto?.equity || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </div>
      </div>
    </div>
  );
};

export default PortfolioHeader;