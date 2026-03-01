export class Storage {
  constructor(namespace) {
    this.namespace = namespace;
  }

  get(key, fallback = null) {
    const scoped = `${this.namespace}:${key}`;
    try {
      const raw = localStorage.getItem(scoped);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  set(key, value) {
    const scoped = `${this.namespace}:${key}`;
    try {
      localStorage.setItem(scoped, JSON.stringify(value));
    } catch {
      // Ignore persistent storage failures.
    }
  }

  remove(key) {
    const scoped = `${this.namespace}:${key}`;
    try {
      localStorage.removeItem(scoped);
    } catch {
      // Ignore persistent storage failures.
    }
  }
}
