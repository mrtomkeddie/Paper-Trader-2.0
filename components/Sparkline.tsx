import React, { useMemo } from 'react';

interface Props {
    data: number[];
    color?: string; // e.g. "#30D158" or "text-ios-green" class logic
    width?: number;
    height?: number;
    trend?: 'UP' | 'DOWN';
}

const Sparkline: React.FC<Props> = ({ data, color = '#30D158', width = 120, height = 40, trend = 'UP' }) => {
    const path = useMemo(() => {
        if (!data || data.length < 2) return '';

        const min = Math.min(...data);
        const max = Math.max(...data);
        const range = max - min || 1;
        const stepX = width / (data.length - 1);

        // Simple line
        const points = data.map((val, i) => {
            const x = i * stepX;
            const y = height - ((val - min) / range) * height; // Invert Y because SVG 0 is top
            return `${x},${y}`;
        });

        return `M ${points.join(' L ')}`;
    }, [data, width, height]);

    const fillPath = useMemo(() => {
        if (!path) return '';
        return `${path} L ${width},${height} L 0,${height} Z`;
    }, [path, width, height]);

    // Determine color based on trend if not explicitly provided (or if we want to override)
    const strokeColor = trend === 'UP' ? '#30D158' : '#FF453A'; // ios-green : ios-red
    const gradientId = `gradient-${Math.random().toString(36).substr(2, 9)}`;

    return (
        <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="overflow-visible">
            <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={strokeColor} stopOpacity="0.2" />
                    <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
                </linearGradient>
            </defs>
            <path d={fillPath} fill={`url(#${gradientId})`} stroke="none" />
            <path d={path} fill="none" stroke={strokeColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
};

export default Sparkline;
