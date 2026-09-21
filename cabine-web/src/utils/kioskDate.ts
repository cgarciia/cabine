export function formatBirthDigits(digits: string): string {
    const mask = [...'DD/MM/AAAA'];
    let index = 0;
    return mask
        .map((slot) => {
            if (slot === '/') return '/';
            if (index >= digits.length) return slot;
            const char = digits[index];
            index += 1;
            return char;
        })
        .join('');
}

export function isoToBirthDigits(iso: string): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!match) return '';
    return `${match[3]}${match[2]}${match[1]}`;
}

export function digitsToIsoDate(digits: string): string | null {
    if (digits.length !== 8) return null;
    const day = Number(digits.slice(0, 2));
    const month = Number(digits.slice(2, 4));
    const year = Number(digits.slice(4, 8));
    if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) return null;
    const parsed = new Date(year, month - 1, day);
    if (
        parsed.getFullYear() !== year
        || parsed.getMonth() !== month - 1
        || parsed.getDate() !== day
    ) {
        return null;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (year < 1900 || parsed > today) return null;
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
