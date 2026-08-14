import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getRecentClients,
  recordRecentClient,
  getRecentMattersForClient,
  recordRecentMatter,
} from "@/lib/recentSelections";

// Minimal in-memory Storage fake, same shape as tests/unit/lockState.test.ts
// — stubbed onto the global so recentSelections.ts's bare `localStorage`
// references resolve to it without needing jsdom.
function createFakeStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
}

describe("recentSelections", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createFakeStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("getRecentClients / recordRecentClient", () => {
    it("returns an empty list when nothing has been recorded", () => {
      expect(getRecentClients()).toEqual([]);
    });

    it("records a client and returns it", () => {
      recordRecentClient({ id: "c1", name: "CV Bumi Persada" });
      expect(getRecentClients()).toEqual([{ id: "c1", name: "CV Bumi Persada" }]);
    });

    it("MRU reorders — re-recording an existing client moves it to the top", () => {
      recordRecentClient({ id: "c1", name: "A" });
      recordRecentClient({ id: "c2", name: "B" });
      recordRecentClient({ id: "c3", name: "C" });
      recordRecentClient({ id: "c1", name: "A" });
      expect(getRecentClients().map((c) => c.id)).toEqual(["c1", "c3", "c2"]);
    });

    it("dedupes on reselect — no duplicate entry, and the cached label refreshes", () => {
      recordRecentClient({ id: "c1", name: "Old Name" });
      recordRecentClient({ id: "c1", name: "Renamed Client" });
      expect(getRecentClients()).toEqual([{ id: "c1", name: "Renamed Client" }]);
    });

    it("caps at 5, most-recent-first", () => {
      for (let i = 1; i <= 6; i++) {
        recordRecentClient({ id: `c${i}`, name: `Client ${i}` });
      }
      const recent = getRecentClients();
      expect(recent).toHaveLength(5);
      expect(recent.map((c) => c.id)).toEqual(["c6", "c5", "c4", "c3", "c2"]);
    });

    it("gracefully returns an empty list when localStorage.getItem throws", () => {
      vi.stubGlobal("localStorage", {
        getItem: () => {
          throw new Error("storage disabled");
        },
        setItem: () => {
          throw new Error("storage disabled");
        },
      });
      expect(() => recordRecentClient({ id: "c1", name: "A" })).not.toThrow();
      expect(getRecentClients()).toEqual([]);
    });

    it("ignores malformed/corrupted stored JSON instead of throwing", () => {
      localStorage.setItem("notary:recentClients", "{not valid json");
      expect(getRecentClients()).toEqual([]);
    });
  });

  describe("getRecentMattersForClient / recordRecentMatter", () => {
    it("returns an empty list when nothing has been recorded for the client", () => {
      expect(getRecentMattersForClient("client-a")).toEqual([]);
    });

    it("filters strictly to the requested client", () => {
      recordRecentMatter({ id: "m1", matterName: "Matter A1", clientId: "client-a", clientName: "A" });
      recordRecentMatter({ id: "m2", matterName: "Matter B1", clientId: "client-b", clientName: "B" });
      expect(getRecentMattersForClient("client-a").map((m) => m.id)).toEqual(["m1"]);
      expect(getRecentMattersForClient("client-b").map((m) => m.id)).toEqual(["m2"]);
    });

    it("MRU reorders per client — re-recording an existing matter moves it to the top", () => {
      recordRecentMatter({ id: "m1", matterName: "M1", clientId: "client-a", clientName: "A" });
      recordRecentMatter({ id: "m2", matterName: "M2", clientId: "client-a", clientName: "A" });
      recordRecentMatter({ id: "m1", matterName: "M1", clientId: "client-a", clientName: "A" });
      expect(getRecentMattersForClient("client-a").map((m) => m.id)).toEqual(["m1", "m2"]);
    });

    it("dedupes on reselect — no duplicate entry for the same matter id", () => {
      recordRecentMatter({ id: "m1", matterName: "M1", clientId: "client-a", clientName: "A" });
      recordRecentMatter({ id: "m1", matterName: "M1 renamed", clientId: "client-a", clientName: "A" });
      expect(getRecentMattersForClient("client-a")).toEqual([
        { id: "m1", matterName: "M1 renamed", clientId: "client-a", clientName: "A" },
      ]);
    });

    it("caps a single client's recent matters at 5, most-recent-first", () => {
      for (let i = 1; i <= 6; i++) {
        recordRecentMatter({ id: `m${i}`, matterName: `Matter ${i}`, clientId: "client-a", clientName: "A" });
      }
      const recent = getRecentMattersForClient("client-a");
      expect(recent).toHaveLength(5);
      expect(recent.map((m) => m.id)).toEqual(["m6", "m5", "m4", "m3", "m2"]);
    });

    it("gracefully returns an empty list when localStorage throws", () => {
      vi.stubGlobal("localStorage", {
        getItem: () => {
          throw new Error("storage disabled");
        },
        setItem: () => {
          throw new Error("storage disabled");
        },
      });
      expect(() => recordRecentMatter({ id: "m1", matterName: "M1", clientId: "client-a", clientName: "A" })).not.toThrow();
      expect(getRecentMattersForClient("client-a")).toEqual([]);
    });
  });
});
