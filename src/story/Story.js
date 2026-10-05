import { MEMORIES, MEMORY_ORDER, N } from './Text.js';
import { audio } from '../engine/Audio.js';
import { Save } from '../systems/Save.js';
import { CONFIG } from '../config.js';

// Persistent story state: memories (journal), relics, lucid nights, upgrades, flags, settings.
export class Story {
  constructor(game) {
    this.game = game;
    this.meta = Save.meta();
    this.settings = { secondsPerHour: CONFIG.secondsPerHour, alarmChanceByHour: CONFIG.alarmChanceByHour.slice(), ...(this.meta.settings || {}) };
    this.reset();
  }
  reset() {
    this.night = 1;
    this.memories = new Set();
    this.relics = new Set();
    this.caught = new Set();
    this.lucidNights = new Set();
    this.journal = [];
    this.upgrades = {};
    this.flags = {};
    this.stats = { catches: 0, deaths: 0 };
    this.nightmareMode = false;
  }
  addMemory(id) {
    if (this.memories.has(id)) return;
    this.memories.add(id);
    const m = MEMORIES[id];
    this.journal.push({ id, type: 'memory', title: m.title, text: m.text() });
    audio.motif('clean', 0.14);
    this.game.ui.toast(`Memory recovered: ${m.title}`, 'memory');
    this.game.ui.showDocument({ title: m.title, text: m.text(), memory: true });
    this.game.events.emit('memory', id);
  }
  addJournal(entry) {
    if (this.journal.find((j) => j.id === entry.id)) return;
    this.journal.push({ type: 'note', ...entry, text: typeof entry.text === 'function' ? entry.text() : entry.text });
    this.game.ui.toast(`Journal: ${entry.title}`);
  }
  alarmCaught(night) { this.lucidNights.add(night); }
  memoryCount() { return this.memories.size; }
  memoryList() { return MEMORY_ORDER.filter((m) => this.memories.has(m)); }

  serialize() {
    return {
      night: this.night, memories: [...this.memories], relics: [...this.relics], caught: [...this.caught], lucid: [...this.lucidNights],
      journal: this.journal, upgrades: this.upgrades, flags: this.flags, stats: this.stats, name: CONFIG.playerName, nightmareMode: this.nightmareMode,
    };
  }
  load(d) {
    this.reset();
    this.night = d.night || 1;
    this.memories = new Set(d.memories || []);
    this.relics = new Set(d.relics || []);
    this.caught = new Set(d.caught || []);
    this.lucidNights = new Set(d.lucid || []);
    this.journal = d.journal || [];
    this.upgrades = d.upgrades || {};
    this.flags = d.flags || {};
    this.stats = d.stats || { catches: 0, deaths: 0 };
    this.nightmareMode = !!d.nightmareMode;
    if (d.name) CONFIG.playerName = d.name;
  }
  save() { Save.write(this.serialize()); }
  saveSettings() { this.meta.settings = this.settings; Save.writeMeta(this.meta); }
  unlockEnding(id) {
    if (!this.meta.endings.includes(id)) this.meta.endings.push(id);
    this.meta.nightmareUnlocked = true;
    Save.writeMeta(this.meta);
  }

  // Which ending, given the final choice on the last night.
  resolveEnding(choice) {
    const mem = this.memories.size;
    if (choice === 'monster') return 'monster';
    if (choice === 'boat') return 'boat';
    if (choice === 'off' || choice === 'none') return 'trapped';
    // let it ring
    if (mem >= 7) return 'truth';
    if (mem >= 4) return 'wake';
    return 'false';
  }
  get name() { return N(); }
}
