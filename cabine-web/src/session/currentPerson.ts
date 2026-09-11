const PERSON_KEY = 'cabine.current-person-id';

export function loadCurrentPersonId(): string {
    return localStorage.getItem(PERSON_KEY) || sessionStorage.getItem('cabine-person-id') || '';
}

export function saveCurrentPersonId(id: string) {
    localStorage.setItem(PERSON_KEY, id);
    sessionStorage.setItem('cabine-person-id', id);
}

export function clearCurrentPersonId() {
    localStorage.removeItem(PERSON_KEY);
    sessionStorage.removeItem('cabine-person-id');
}
