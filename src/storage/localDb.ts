import type { AppSettings, MatchesPayload, PreflightRun } from "@/src/types/domain";

const DB_NAME = "frc9470-pit-v1";
const DB_VERSION = 1;
const STORE = "kv";
const IDB_TIMEOUT_MS = 1200;
const SETTINGS_KEY = "settings";
const RUN_PREFIX = "run:";
const SNAPSHOT_PREFIX = "snapshot:";

const DEFAULT_SETTINGS: AppSettings = {
  teamNumber: 9470,
  eventKey: "",
  queueLeadMinutes: 20,
  dataMode: "live"
};

type KvRecord = {
  key: string;
  value: unknown;
};

let dbPromise: Promise<IDBDatabase> | null = null;

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function canUseIndexedDb(): boolean {
  return isBrowser() && typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  if (!canUseIndexedDb()) {
    return Promise.reject(new Error("IndexedDB unavailable"));
  }

  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "key" });
        }
      };

      request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB"));
      request.onsuccess = () => resolve(request.result);
    });
  }

  return dbPromise;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs = IDB_TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error("IndexedDB timeout"));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

async function getRecord<T>(key: string): Promise<T | null> {
  if (canUseIndexedDb()) {
    try {
      const db = await withTimeout(openDb());
      const tx = db.transaction(STORE, "readonly");
      const store = tx.objectStore(STORE);
      const record =
        (await withTimeout(requestToPromise(store.get(key) as IDBRequest<KvRecord | undefined>))) ?? null;
      return record ? (record.value as T) : null;
    } catch {
      // Fall through to localStorage.
    }
  }

  if (!isBrowser()) {
    return null;
  }
  const raw = localStorage.getItem(key);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function setRecord<T>(key: string, value: T): Promise<void> {
  if (canUseIndexedDb()) {
    try {
      const db = await withTimeout(openDb());
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      await withTimeout(requestToPromise(store.put({ key, value })));
      return;
    } catch {
      // Fall through to localStorage.
    }
  }

  if (isBrowser()) {
    localStorage.setItem(key, JSON.stringify(value));
  }
}

async function getAllRecords(): Promise<KvRecord[]> {
  if (canUseIndexedDb()) {
    try {
      const db = await withTimeout(openDb());
      const tx = db.transaction(STORE, "readonly");
      const store = tx.objectStore(STORE);
      const records = await withTimeout(requestToPromise(store.getAll() as IDBRequest<KvRecord[]>));
      return records ?? [];
    } catch {
      // Fall through to localStorage.
    }
  }

  if (!isBrowser()) {
    return [];
  }

  const records: KvRecord[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key) {
      continue;
    }
    const raw = localStorage.getItem(key);
    if (!raw) {
      continue;
    }
    try {
      records.push({ key, value: JSON.parse(raw) });
    } catch {
      // ignore malformed storage
    }
  }

  return records;
}

async function deleteRecord(key: string): Promise<void> {
  if (canUseIndexedDb()) {
    try {
      const db = await withTimeout(openDb());
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      await withTimeout(requestToPromise(store.delete(key)));
      return;
    } catch {
      // Fall through to localStorage.
    }
  }

  if (isBrowser()) {
    localStorage.removeItem(key);
  }
}

function runKey(eventKey: string, matchKey: string): string {
  return `${RUN_PREFIX}${eventKey}:${matchKey}`;
}

function snapshotKey(eventKey: string, teamNumber: number): string {
  return `${SNAPSHOT_PREFIX}${eventKey}:${teamNumber}`;
}

function normalizeRun(run: PreflightRun): PreflightRun {
  return {
    ...run,
    responses: Array.isArray(run.responses) ? run.responses : [],
    actionCards: Array.isArray(run.actionCards) ? run.actionCards : []
  };
}

export async function getSettings(): Promise<AppSettings> {
  const stored = await getRecord<AppSettings>(SETTINGS_KEY);
  if (!stored) {
    return DEFAULT_SETTINGS;
  }

  return {
    teamNumber: Number.isFinite(stored.teamNumber) ? stored.teamNumber : DEFAULT_SETTINGS.teamNumber,
    eventKey: stored.eventKey ?? DEFAULT_SETTINGS.eventKey,
    queueLeadMinutes: Number.isFinite(stored.queueLeadMinutes) ? stored.queueLeadMinutes : DEFAULT_SETTINGS.queueLeadMinutes,
    dataMode: stored.dataMode === "mock" ? "mock" : "live"
  };
}

export async function saveSettings(next: AppSettings): Promise<void> {
  await setRecord(SETTINGS_KEY, next);
}

export async function clearAllRuns(): Promise<void> {
  const all = await getAllRecords();
  const runRecords = all.filter((record) => record.key.startsWith(RUN_PREFIX));
  await Promise.all(runRecords.map((record) => deleteRecord(record.key)));
}

export async function getRun(eventKey: string, matchKey: string): Promise<PreflightRun | null> {
  const run = await getRecord<PreflightRun>(runKey(eventKey, matchKey));
  return run ? normalizeRun(run) : null;
}

export async function saveRun(run: PreflightRun): Promise<void> {
  await setRecord(runKey(run.eventKey, run.matchKey), normalizeRun(run));
}

export async function listRunsForEvent(eventKey: string): Promise<PreflightRun[]> {
  const all = await getAllRecords();
  return all
    .filter((record) => record.key.startsWith(`${RUN_PREFIX}${eventKey}:`))
    .map((record) => normalizeRun(record.value as PreflightRun))
    .sort((a, b) => b.startedAtIso.localeCompare(a.startedAtIso));
}

export async function saveMatchesSnapshot(eventKey: string, teamNumber: number, payload: MatchesPayload): Promise<void> {
  await setRecord(snapshotKey(eventKey, teamNumber), payload);
}

export async function getMatchesSnapshot(eventKey: string, teamNumber: number): Promise<MatchesPayload | null> {
  return getRecord<MatchesPayload>(snapshotKey(eventKey, teamNumber));
}
