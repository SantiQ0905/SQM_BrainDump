const KEY = "brainDump.adminKey";

export function getAdminKey(): string | null {
  return localStorage.getItem(KEY);
}

export function setAdminKey(value: string) {
  localStorage.setItem(KEY, value);
}

export function clearAdminKey() {
  localStorage.removeItem(KEY);
}
