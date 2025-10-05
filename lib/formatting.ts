import { format, isValid } from 'date-fns';

/**
 * Parses a date string or Date object into a local Date object.
 * This is crucial for handling timezone issues with date-only strings from a database.
 * A string '2024-10-15' will be parsed as local midnight, not UTC midnight.
 * A full ISO string will be parsed correctly.
 * @param date The date to parse.
 * @returns A valid Date object, or null if the input is invalid.
 */
export const parseAsLocalDate = (date: Date | string | null | undefined): Date | null => {
    if (!date) return null;
    if (date instanceof Date) {
        return isValid(date) ? date : null;
    }
    if (typeof date === 'string') {
        let parsedDate: Date;
        // Handle date-only strings (YYYY-MM-DD)
        if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            parsedDate = new Date(date + 'T00:00:00');
        } else {
            // For full ISO strings or other formats, attempt to parse directly.
            parsedDate = new Date(date);
        }
        
        if (isValid(parsedDate)) {
            return parsedDate;
        }
    }
    console.warn("Invalid date value provided to parseAsLocalDate:", date);
    return null;
};


/**
 * Formats a date string or Date object into European date format (dd.MM.yyyy).
 * Handles timezone issues with date-only strings.
 * @param date The date to format.
 * @returns The formatted date string, or an empty string if the date is invalid.
 */
export const formatEuropeanDate = (date: Date | string | null | undefined): string => {
    const parsedDate = parseAsLocalDate(date);
    if (!parsedDate) return '';
    try {
        return format(parsedDate, 'dd.MM.yyyy');
    } catch (e) {
        console.error("Error formatting date:", date, e);
        return '';
    }
};

/**
 * Formats a date string or Date object into 24-hour time format (HH:mm).
 * Handles timezone issues with date-only strings.
 * @param date The date to format.
 * @returns The formatted time string, or an empty string if the date is invalid.
 */
export const formatEuropeanTime = (date: Date | string | null | undefined): string => {
    const parsedDate = parseAsLocalDate(date);
    if (!parsedDate) return '';
    try {
        return format(parsedDate, 'HH:mm');
    } catch (e) {
        console.error("Error formatting time:", date, e);
        return '';
    }
};
