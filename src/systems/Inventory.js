import { audio } from '../engine/Audio.js';
import { CATALOG_BY_ID, catchDesc } from '../fishing/Catalog.js';

// Item definitions. Story memories go to the journal (never lost); everything else competes for slots.
export const ITEMS = {
  worm: { name: 'Nightcrawlers', kind: 'bait', icon: '〰', stack: 12, desc: 'Common bait. Fish like it. So do other things.' },
  minnow: { name: 'Minnows', kind: 'bait', icon: '◁', stack: 8, desc: 'Live bait. Attracts larger, more aggressive fish.' },
  lure: { name: 'Glow Lure', kind: 'bait', icon: '✦', stack: 4, desc: 'A phosphorescent lure. It reaches deep water — and is seen from far away.', reusable: true },
  chum: { name: 'Fish Chunks', kind: 'bait', icon: '▤', stack: 6, desc: 'Cut from your catch. Big things smell it. Big things.' },
  memento: { name: 'Keepsake Bait', kind: 'bait', icon: '❦', stack: 3, desc: 'Something of yours, tied to the hook. The water wants what is yours.' },
  battery: { name: 'Batteries', kind: 'battery', icon: '▮', stack: 4, desc: 'Old batteries. Nothing here needs them anymore.' },
  medicine: { name: 'Bandage & Pills', kind: 'medicine', icon: '+', stack: 3, desc: 'Restores health. Use from inventory.' },
  line: { name: 'Spare Line & Hook', kind: 'tackle', icon: '∮', stack: 5, desc: 'Re-rig after a snapped line.' },
  fuel: { name: 'Fuel Can', kind: 'fuel', icon: '⛽', stack: 2, desc: 'Refuels the boat engine.' },
  flare: { name: 'Flare', kind: 'flare', icon: '✷', stack: 2, desc: 'Burns bright red for a minute. Light keeps some things away. It draws others.' },
  bottle: { name: 'Empty Bottle', kind: 'throwable', icon: '◊', stack: 3, desc: 'Throw it to make a noise somewhere else.' },
  // keys
  key_boathouse: { name: 'Rusted Key', kind: 'key', icon: '⚷', desc: 'Tag reads: BOATHOUSE. It came out of a fish.' },
  key_cabin2: { name: 'Frozen Key', kind: 'key', icon: '⚷', desc: 'Tag reads: PELL CABIN.' },
  key_office: { name: 'Harbormaster Key', kind: 'key', icon: '⚷', desc: 'Stamped: OFFICE — DO NOT REMOVE.' },
  key_shack: { name: 'Swollen Key', kind: 'key', icon: '⚷', desc: 'Wood-handled key, soft with water.' },
  // relics (monster connection)
  relic_hat: { name: 'Waterlogged Hat', kind: 'relic', icon: '⌒', desc: 'A wide-brimmed fishing hat. It is still dripping. Initials stitched inside: W.P.' },
  relic_tooth: { name: 'Pale Tooth', kind: 'relic', icon: '▽', desc: 'Long as your hand. Warm, somehow.' },
  relic_scale: { name: 'Black Scale', kind: 'relic', icon: '⬢', desc: 'The size of a dinner plate. It reflects a room you know.' },
  relic_tag: { name: 'Brass Name Tag', kind: 'relic', icon: '▭', desc: 'HOLLOW LAKE SEARCH & RESCUE — VOLUNTEER. The name is scratched off.' },
  relic_eye: { name: 'Clouded Eye', kind: 'relic', icon: '◉', desc: 'It follows you when you put it down.' },
  relic_bulb: { name: 'The Lure', kind: 'relic', icon: '●', desc: 'A glowing bulb of flesh. It hums your lullaby.' },
  // misc strange objects
  phone: { name: 'Old Flip Phone', kind: 'curio', icon: '▯', desc: 'Waterlogged. It has one voicemail. It plays when you open it.' },
  doll: { name: 'Plastic Doll Head', kind: 'curio', icon: '☺', desc: 'Its eyes open when you are not looking.' },
};

export class Inventory {
  constructor(game) {
    this.game = game;
    this.capacity = 6;
    this.slots = []; // {id, qty, data}
  }
  def(id) {
    if (id.startsWith('catch:')) {
      const e = CATALOG_BY_ID[id.slice(6)];
      if (e) return { name: e.name, kind: 'fish', icon: e.kind === 'horror' ? '⚠' : '><>', desc: catchDesc(e), catchId: e.id };
    }
    return ITEMS[id] || { name: id, kind: 'misc', icon: '?' };
  }
  reset(capacity) { this.capacity = capacity; this.slots = []; }
  count(id) { return this.slots.filter((s) => s.id === id).reduce((a, s) => a + s.qty, 0); }
  has(id) { return this.count(id) > 0; }
  freeSlots() { return this.capacity - this.slots.length; }
  canAdd(id, qty = 1) {
    const d = this.def(id);
    if (d.stack) {
      const s = this.slots.find((x) => x.id === id && x.qty < d.stack);
      if (s && s.qty + qty <= d.stack) return true;
    }
    return this.slots.length < this.capacity;
  }
  // Returns number actually added.
  add(id, qty = 1, data = null, silent = false) {
    const d = this.def(id);
    let added = 0;
    while (qty > 0) {
      let s = d.stack ? this.slots.find((x) => x.id === id && x.qty < d.stack) : null;
      if (!s) {
        if (this.slots.length >= this.capacity) break;
        s = { id, qty: 0, data };
        this.slots.push(s);
      }
      const n = d.stack ? Math.min(qty, d.stack - s.qty) : 1;
      s.qty += n; qty -= n; added += n;
      if (!d.stack) s.data = data;
    }
    if (added && !silent) { audio.pickup(); this.game.ui.toast(`+ ${d.name}${added > 1 ? ' ×' + added : ''}`); }
    if (!added && !silent) this.game.ui.toast('Inventory full', 'warn');
    this.game.ui.refreshInventory?.();
    return added;
  }
  remove(id, qty = 1) {
    for (let i = this.slots.length - 1; i >= 0 && qty > 0; i--) {
      const s = this.slots[i];
      if (s.id !== id) continue;
      const n = Math.min(qty, s.qty);
      s.qty -= n; qty -= n;
      if (s.qty <= 0) this.slots.splice(i, 1);
    }
    this.game.ui.refreshInventory?.();
    return qty === 0;
  }
  removeSlot(index) { this.slots.splice(index, 1); this.game.ui.refreshInventory?.(); }
  baitTypes() { return [...new Set(this.slots.filter((s) => this.def(s.id).kind === 'bait').map((s) => s.id))]; }
  relics() { return this.slots.filter((s) => this.def(s.id).kind === 'relic').map((s) => s.id); }
  serialize() { return { capacity: this.capacity, slots: this.slots.map((s) => ({ ...s, data: s.data && typeof s.data === 'object' && !s.data.isObject3D ? s.data : null })) }; }
}
