import React, { useEffect, useRef } from 'react';

export const TradingViewWidget: React.FC = () => {
    const container = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!container.current) return;

        // Clear previous widget
        container.current.innerHTML = '';

        const script = document.createElement("script");
        script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
        script.type = "text/javascript";
        script.async = true;
        script.innerHTML = `
      {
        "autosize": true,
        "symbol": "OANDA:XAUUSD",
        "interval": "15",
        "timezone": "Etc/UTC",
        "theme": "dark",
        "style": "1",
        "locale": "en",
        "enable_publishing": false,
        "backgroundColor": "rgba(17, 24, 39, 1)",
        "gridColor": "rgba(55, 65, 81, 1)",
        "hide_top_toolbar": false,
        "hide_legend": true,
        "save_image": false,
        "calendar": false,
        "hide_volume": true,
        "support_host": "https://www.tradingview.com"
      }`;
        container.current.appendChild(script);
    }, []);

    return (
        <div className="tradingview-widget-container h-full w-full rounded-xl overflow-hidden border border-gray-800 shadow-xl bg-gray-900" ref={container}>
            <div className="tradingview-widget-container__widget h-full w-full"></div>
        </div>
    );
};
