const KEY = 'deephours_save_v1';
const META = 'deephours_meta_v1';

// Saves happen between nightmares only (plus one in-night checkpoint at 3 AM, kept in memory).
export const Save = {
  load() {
    try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; }
  },
  write(data) {
    try { localStorage.setItem(KEY, JSON.stringify(data)); return true; } catch (e) { return false; }
  },
  clear() { try { localStorage.removeItem(KEY); } catch (e) { /* */ } },
  meta() {
    try { const s = localStorage.getItem(META); return s ? JSON.parse(s) : { endings: [], nightmareUnlocked: false, settings: {} }; } catch (e) { return { endings: [], nightmareUnlocked: false, settings: {} }; }
  },
  writeMeta(m) { try { localStorage.setItem(META, JSON.stringify(m)); } catch (e) { /* */ } },
};
