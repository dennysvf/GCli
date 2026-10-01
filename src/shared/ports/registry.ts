// Process-wide registry for port implementations that one module registers into another
// (ADR-007 dependency inversion, wired by src/composition.ts). Next.js may load a module more
// than once per process (instrumentation and route bundles each get their own copy), so the
// registrations live on globalThis, like the event bus, and every copy sees the same one.
const globalForPorts = globalThis as unknown as { gcliPorts?: Map<string, unknown> };
const ports = (globalForPorts.gcliPorts ??= new Map<string, unknown>());

export type Port<T> = {
  get(): T;
  // null restores the default.
  register(implementation: T | null): void;
};

export function definePort<T>(name: string, fallback: T): Port<T> {
  return {
    get: () => (ports.has(name) ? (ports.get(name) as T) : fallback),
    register: (implementation) => {
      if (implementation === null) ports.delete(name);
      else ports.set(name, implementation);
    },
  };
}
