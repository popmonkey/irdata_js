class MockStorage implements Storage {
  private data: Record<string, string> = {};

  get length() {
    return Object.keys(this.data).length;
  }

  clear() {
    this.data = {};
  }

  getItem(key: string) {
    return this.data[key] || null;
  }

  key(index: number) {
    return Object.keys(this.data)[index] || null;
  }

  removeItem(key: string) {
    delete this.data[key];
  }

  setItem(key: string, value: string) {
    this.data[key] = String(value);
  }
}

// Only mock if the environment is node or if localStorage is broken
if (typeof window === 'undefined' || !localStorage.clear) {
  const mockLocalStorage = new MockStorage();
  const mockSessionStorage = new MockStorage();

  Object.defineProperty(global, 'localStorage', {
    value: mockLocalStorage,
    writable: true,
  });

  Object.defineProperty(global, 'sessionStorage', {
    value: mockSessionStorage,
    writable: true,
  });

  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
    });

    Object.defineProperty(window, 'sessionStorage', {
      value: mockSessionStorage,
      writable: true,
    });
  }
}
