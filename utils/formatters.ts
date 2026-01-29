
/**
 * Safe number and date formatters to prevent "Cannot read properties of null (reading 'toLocaleString')" crashes.
 */

interface CurrencyOptions {
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
    currency?: string;
    locale?: string;
}

/**
 * Safely formats a number as currency (defaults to GBP).
 * Fallback to "£0.00" if value is null/undefined.
 */
export const formatCurrency = (
    value: number | null | undefined,
    options: CurrencyOptions = {}
): string => {
    const {
        minimumFractionDigits = 2,
        maximumFractionDigits = 2,
        currency = 'GBP',
        locale = 'en-GB'
    } = options;

    if (value === null || value === undefined || isNaN(value)) {
        return new Intl.NumberFormat(locale, {
            style: 'currency',
            currency,
            minimumFractionDigits,
            maximumFractionDigits,
        }).format(0);
    }

    return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        minimumFractionDigits,
        maximumFractionDigits,
    }).format(value);
};

/**
 * Safely formats a number with fixed decimals.
 * Fallback to "0.00" if value is null/undefined.
 */
export const formatNumber = (
    value: number | null | undefined,
    decimals: number = 2,
    locale: string = 'en-US'
): string => {
    if (value === null || value === undefined || isNaN(value)) {
        return (0).toLocaleString(locale, {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
        });
    }

    return value.toLocaleString(locale, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
};

/**
 * Safely formats a date.
 * Fallback to empty string if date is invalid.
 */
export const formatDate = (
    date: number | string | Date | null | undefined,
    locale: string = 'en-GB',
    options: Intl.DateTimeFormatOptions = {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    }
): string => {
    if (!date) return '';

    try {
        const d = new Date(date);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleString(locale, options);
    } catch {
        return '';
    }
};
