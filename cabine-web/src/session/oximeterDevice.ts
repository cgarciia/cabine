const ADDRESS_KEY = 'cabine.oximeter-address';

export function loadOximeterAddress(): string {
    return localStorage.getItem(ADDRESS_KEY) || '';
}

export function saveOximeterAddress(address: string) {
    const mac = address.trim().toUpperCase();
    if (mac) localStorage.setItem(ADDRESS_KEY, mac);
}
