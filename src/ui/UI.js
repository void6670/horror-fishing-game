import { audio } from '../engine/Audio.js';
import { CONFIG } from '../config.js';
import { fmtTime, clamp } from '../util/math.js';
import { ITEMS } from '../systems/Inventory.js';
import { MEMORY_ORDER, ENDINGS, N } from '../story/Text.js';
import { Save } from '../systems/Save.js';

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

export class UI {
  constructor(game) {
    this.game = game;
    this.root = $('#ui');
    this.modal = null;
    this.build();
  }

  build() {
    this.root.innerHTML = `
      <div id="hud" class="hidden">
        <div id="crosshair"></div>
        <div id="prompt"></div>
        <div id="power" class="hidden"><i></i></div>
        <div id="fishing" class="hidden"></div>
        <div id="status"></div>
        <div id="watch"><div class="time">12:00</div><div class="ampm">AM</div></div>
        <div id="clockMini" class="hidden"></div>
        <div id="battery" class="hidden"></div>
        <div id="boathud" class="hidden"></div>
      </div>
      <div id="toasts"></div>
      <div id="subtitle"></div>
      <div id="inspect" class="panel hidden"></div>
      <div id="inventory" class="panel interactive hidden"></div>
      <div id="journal" class="panel interactive hidden"></div>
      <div id="doc" class="panel interactive hidden"></div>
      <div id="choice" class="panel interactive hidden"></div>
      <div id="upgrade" class="panel interactive hidden"></div>
      <div id="title"></div>
      <div id="fade"></div>
      <div id="pause" class="interactive hidden"></div>
      <div id="menu" class="interactive hidden"></div>
      <div id="ending" class="interactive hidden"></div>
      <div id="clickToPlay" class="hidden">Click to continue</div>
    `;
    this.hud = $('#hud');
    this.subEl = $('#subtitle');
    this.promptEl = $('#prompt');
  }

  get modalOpen() { return !!this.modal; }
  setHUD(v) { this.hud.classList.toggle('hidden', !v); }

  // ---------------------------------------------------------------- small messages
  toast(msg, cls = '') {
    const t = el('div', 'toast ' + cls, esc(msg));
    const box = $('#toasts');
    box.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 500); }, cls === 'memory' ? 6000 : 4200);
    while (box.children.length > 5) box.firstChild.remove();
  }
  subtitle(text, dur = 4, cls = '') {
    this.subEl.className = cls;
    this.subEl.textContent = text;
    requestAnimationFrame(() => this.subEl.classList.add('show'));
    clearTimeout(this._subT);
    this._subT = setTimeout(() => this.subEl.classList.remove('show'), dur * 1000);
  }

  // ---------------------------------------------------------------- per-frame HUD
  updateHUD(dt) {
    const g = this.game, p = g.player;
    if (!p) return;
    // prompt
    const it = p.interactTarget;
    if (it && !this.modal && !p.hidden) {
      const txt = typeof it.prompt === 'function' ? it.prompt() : it.prompt;
      const hold = it.hold > 0 ? `<div class="bar"><i style="width:${(p.holdProgress * 100).toFixed(0)}%"></i></div>` : '';
      const html = `<span class="key">E</span>${esc(txt)}${hold}`;
      if (this._lastPrompt !== html) { this.promptEl.innerHTML = html; this._lastPrompt = html; }
    } else if (p.hidden && !this.modal) {
      const html = `<span class="key">E</span>Leave ${esc(p.hidden.name)} &nbsp; <span class="key">Space</span>Hold breath ${p.holdingBreath ? '(' + Math.round(p.breath * 100) + '%)' : ''}`;
      if (this._lastPrompt !== html) { this.promptEl.innerHTML = html; this._lastPrompt = html; }
    } else if (this._lastPrompt) { this.promptEl.innerHTML = ''; this._lastPrompt = ''; }
    // status meters — only visible when not full
    const showHp = p.health < p.maxHealth - 0.5, showSt = p.stamina < 0.99;
    const bat = p.flashlight.battery;
    const showBat = p.flashlight.on && bat < 0.5;
    const st = $('#status');
    const html = `${showHp ? `<div class="row">Health<div class="meter hp"><i style="width:${(p.health / p.maxHealth * 100).toFixed(0)}%"></i></div></div>` : ''}${showSt ? `<div class="row">Breath<div class="meter"><i style="width:${(p.stamina * 100).toFixed(0)}%"></i></div></div>` : ''}${showBat ? `<div class="row">Light<div class="meter bat"><i style="width:${(bat * 100).toFixed(0)}%"></i></div></div>` : ''}${p.hidden ? `<div class="row">Held breath<div class="meter"><i style="width:${(p.breath * 100).toFixed(0)}%"></i></div></div>` : ''}`;
    if (st._h !== html) { st.innerHTML = html; st._h = html; }
    $('#battery').classList.toggle('hidden', !(p.flashlight.on && bat < 0.12) && !(bat <= 0));
    if (bat <= 0) $('#battery').textContent = 'Flashlight dead — [R] replace batteries';
    else $('#battery').textContent = 'Battery low';
    // watch
    const show = g.state === 'night' && (g.input.down('KeyT') || this._forceWatch > 0);
    this._forceWatch = Math.max(0, (this._forceWatch || 0) - dt);
    const w = $('#watch');
    w.classList.toggle('show', show);
    if (show && g.time) {
      const glitch = g.watchGlitch || (p.fear > 0.8 && Math.random() < 0.02);
      w.classList.toggle('glitch', !!glitch);
      const t = glitch ? '4:17' : fmtTime(g.time.hour).replace(' AM', '');
      w.querySelector('.time').textContent = t;
    }
    const mini = $('#clockMini');
    mini.classList.toggle('hidden', !(CONFIG.showClockAlways && g.state === 'night'));
    if (CONFIG.showClockAlways && g.time) mini.textContent = fmtTime(g.time.hour);
    // boat
    const b = p.inBoat;
    const bh = $('#boathud');
    bh.classList.toggle('hidden', !b);
    if (b) {
      const h = `<span>FUEL ${(b.fuel * 100).toFixed(0)}%</span><span>HULL ${b.hull.toFixed(0)}%</span><span>${b.engineOn ? 'ENGINE ON' : b.stalled ? 'ENGINE STALLED' : 'ENGINE OFF'}</span><span>LIGHTS ${b.lightsOn ? 'ON' : 'OFF'} [L]</span>${b.atHelm ? `<span>THROTTLE ${(b.throttle * 100).toFixed(0)}%</span>` : ''}`;
      if (bh._h !== h) { bh.innerHTML = h; bh._h = h; }
    }
  }
  flashWatch(sec = 3) { this._forceWatch = sec; }

  fishingHUD(f) {
    const box = $('#fishing');
    const pw = $('#power');
    const g = this.game;
    pw.classList.toggle('hidden', f.state !== 'charging');
    if (f.state === 'charging') pw.firstElementChild.style.width = (f.power * 100).toFixed(0) + '%';
    const showBox = g.player.rodOut && !g.player.hidden && g.state === 'night' && !this.modal;
    box.classList.toggle('hidden', !showBox);
    if (!showBox) return;
    const bait = f.bait ? `${ITEMS[f.bait].name} ×${g.inventory.count(f.bait)}` : 'none';
    const depthTxt = f.state === 'waiting' || f.state === 'bite' ? `${f.lineDepth.toFixed(f.lineDepth > 99 ? 0 : 1)} m${f.impossible && f.lineDepth > f.waterDepth ? ' ?' : ''}` : `${f.depthTarget} m`;
    let hint = '';
    switch (f.state) {
      case 'idle': hint = '<b>Hold LMB</b> to cast · <b>Wheel</b> depth · <b>B</b> bait'; break;
      case 'unrigged': hint = 'Line snapped. <b>Click</b> to re-rig.'; break;
      case 'charging': hint = 'Release to cast'; break;
      case 'flight': hint = '...'; break;
      case 'ground': hint = '<b>Hold LMB</b> to reel in'; break;
      case 'waiting': hint = f.nibbleT > 0 ? 'Something is nibbling... wait for it.' : 'Watch the float. <b>Click</b> when it goes under. <b>RMB</b> reel in.'; break;
      case 'bite': hint = '<b style="color:#e8d090">NOW — CLICK!</b>'; break;
      case 'fight': hint = '<b>Hold LMB</b> reel · <b>Mouse ⟷</b> counter its pull · ease off when the line screams · <b>X</b> cut'; break;
      case 'inspect': hint = 'Drag the mouse to turn it over.'; break;
      default: break;
    }
    let fight = '';
    if (f.state === 'fight') {
      const t = clamp(f.tension / (f.stats.lineStrength * 1.25), 0, 1);
      const lim = clamp(f.stats.lineStrength / (f.stats.lineStrength * 1.25), 0, 1);
      const dir = f.fish ? (f.fish.dir < -0.3 ? '◀◀ · ·' : f.fish.dir > 0.3 ? '· · ▶▶' : '· ◆ ·') : '';
      fight = `<div class="flex"><div class="tension"><i style="height:${(t * 100).toFixed(0)}%"></i><div class="limit" style="bottom:${(lim * 100).toFixed(0)}%"></div></div>
        <div><div class="label">Line out</div><div class="val">${f.lineOut.toFixed(1)} m</div><div class="label" style="margin-top:8px">Pull</div><div class="dir">${dir}</div></div></div>`;
    }
    const html = `${fight}<div><div class="label">Depth</div><div class="val">${depthTxt}</div></div><div><div class="label">Bait</div><div class="val">${esc(bait)}</div></div><div class="hint">${hint}</div>`;
    if (box._h !== html) { box.innerHTML = html; box._h = html; }
  }

  // ---------------------------------------------------------------- inspect (catch in hand)
  showInspect({ name, desc, sub = '', actions = [], kind = '' }) {
    const box = $('#inspect');
    box.classList.remove('hidden');
    box.innerHTML = `<div><span class="t ${kind}">${esc(name)}</span><span class="s">${esc(sub)}</span></div><div class="d">${esc(desc)}</div>
      <div class="a">${actions.map((a) => `<span><span class="key">${a.key}</span>${esc(a.label)}</span>`).join('')}</div>`;
  }
  hideInspect() { $('#inspect').classList.add('hidden'); }

  // ---------------------------------------------------------------- modals
  openModal(name) {
    this.modal = name;
    this.game.input.unlock();
    audio.uiClick();
  }
  closeModal() {
    const was = this.modal;
    this.modal = null;
    for (const id of ['inventory', 'journal', 'doc', 'choice', 'upgrade']) $('#' + id).classList.add('hidden');
    if (was && (this.game.state === 'night' || this.game.state === 'day')) this.game.input.lock();
  }

  showDocument({ title, lines, text, memory = false, tex }) {
    const d = $('#doc');
    d.className = 'panel interactive' + (memory ? ' memory' : '');
    const body = text ?? (lines || []).join('\n\n');
    d.innerHTML = `<h3>${esc(title || '')}</h3><div>${esc(body)}</div><div class="close">[E] / [Esc] / click to close</div>`;
    if (tex && tex.image && tex.image.getContext) {
      const c = document.createElement('canvas'); c.width = tex.image.width; c.height = tex.image.height;
      c.getContext('2d').drawImage(tex.image, 0, 0);
      c.style.width = '260px';
      if (!lines || lines.length < 2) d.insertBefore(c, d.children[1]);
    }
    d.onclick = () => this.closeModal();
    this.openModal('doc');
    d.classList.remove('hidden');
  }

  // ---------------------------------------------------------------- inventory
  openInventory() {
    if (this.modal) { if (this.modal === 'inventory') this.closeModal(); return; }
    this.openModal('inventory');
    $('#inventory').classList.remove('hidden');
    this.selSlot = 0;
    this.refreshInventory();
  }
  refreshInventory() {
    if (this.modal !== 'inventory') return;
    const g = this.game, inv = g.inventory;
    const box = $('#inventory');
    let grid = '';
    for (let i = 0; i < inv.capacity; i++) {
      const s = inv.slots[i];
      if (!s) { grid += `<div class="slot empty"></div>`; continue; }
      const d = inv.def(s.id);
      const eq = d.kind === 'bait' && g.fishing.bait === s.id ? ' equipped' : '';
      grid += `<div class="slot ${d.kind}${eq} ${i === this.selSlot ? 'sel' : ''}" data-i="${i}">${esc(d.icon)}<div class="nm">${esc(d.name)}</div>${s.qty > 1 ? `<span class="n">${s.qty}</span>` : ''}</div>`;
    }
    const sel = inv.slots[this.selSlot];
    let detail = '<div class="d">Empty.</div>';
    if (sel) {
      const d = inv.def(sel.id);
      const acts = this.itemActions(sel, d);
      detail = `<div class="t">${esc(d.name)}${sel.qty > 1 ? ' ×' + sel.qty : ''}</div><div class="d">${esc(d.desc || '')}</div>${acts.map((a, k) => `<button data-a="${k}">${esc(a.label)}</button>`).join('')}`;
      this._acts = acts;
    }
    const lightTxt = `Flashlight ${(g.player.flashlight.battery * 100).toFixed(0)}% · Health ${Math.round(g.player.health)} · Relics carried ${inv.relics().length}`;
    box.innerHTML = `<h2>Tackle bag</h2><div class="sub">${inv.slots.length}/${inv.capacity} slots — what you carry, you carry. [I] / [Tab] close</div><div class="grid">${grid}</div><div class="detail">${detail}</div><div class="equip">Rod, reel, knife and flashlight are always with you. ${lightTxt}</div>`;
    box.querySelectorAll('.slot[data-i]').forEach((s) => s.onclick = () => { this.selSlot = +s.dataset.i; audio.uiClick(); this.refreshInventory(); });
    box.querySelectorAll('button[data-a]').forEach((b) => b.onclick = () => { const a = this._acts[+b.dataset.a]; a.fn(); this.refreshInventory(); });
  }
  itemActions(slot, d) {
    const g = this.game, inv = g.inventory;
    const acts = [];
    const idx = inv.slots.indexOf(slot);
    switch (d.kind) {
      case 'bait': acts.push({ label: g.fishing.bait === slot.id ? 'Equipped' : 'Use as bait', fn: () => { g.fishing.bait = slot.id; } }); break;
      case 'battery': acts.push({ label: 'Replace flashlight batteries', fn: () => g.player.replaceBattery() }); break;
      case 'medicine': acts.push({ label: 'Use', fn: () => { if (g.player.health >= g.player.maxHealth) { this.toast('You are not hurt.'); return; } inv.remove('medicine', 1); g.player.heal(45); this.toast('You patch yourself up. Your hands are steadier.'); } }); break;
      case 'tackle': acts.push({ label: 'Re-rig line', fn: () => { if (g.fishing.state === 'unrigged') g.fishing.rerig(); else this.toast('Your line is fine.'); } }); break;
      case 'fish':
        acts.push({ label: 'Throw (distraction)', fn: () => { inv.removeSlot(idx); g.throwItem('fish'); this.closeModal(); } });
        acts.push({ label: 'Cut into bait', fn: () => { inv.removeSlot(idx); inv.add('chum', 2); g.smell?.(g.player.pos, 0.5); } });
        break;
      case 'throwable': acts.push({ label: 'Throw', fn: () => { inv.remove(slot.id, 1); g.throwItem('bottle'); this.closeModal(); } }); break;
      case 'flare': acts.push({ label: 'Light a flare', fn: () => { inv.remove('flare', 1); g.lightFlare(); this.closeModal(); } }); break;
      case 'fuel': acts.push({ label: 'Refuel boat', fn: () => { if (g.player.inBoat) { inv.remove('fuel', 1); g.player.inBoat.fuel = 1; this.toast('Refueled.'); } else this.toast('No engine here.'); } }); break;
      case 'curio':
        if (slot.id === 'phone') acts.push({ label: 'Play voicemail', fn: () => g.playVoicemail() });
        break;
      default: break;
    }
    acts.push({ label: d.kind === 'relic' ? 'Leave it behind' : 'Drop', fn: () => { inv.removeSlot(idx); this.toast(`Dropped ${d.name}.`); if (this.selSlot >= inv.slots.length) this.selSlot = Math.max(0, inv.slots.length - 1); } });
    return acts;
  }

  // ---------------------------------------------------------------- journal
  openJournal() {
    if (this.modal) { if (this.modal === 'journal') this.closeModal(); return; }
    this.openModal('journal');
    const box = $('#journal');
    box.classList.remove('hidden');
    const s = this.game.story;
    const entries = [...s.journal].sort((a, b) => (a.type === 'memory' ? 0 : 1) - (b.type === 'memory' ? 0 : 1));
    const mems = MEMORY_ORDER.filter((m) => s.memories.has(m)).length;
    box.innerHTML = `<h2>Journal</h2><div class="progress">Memories recovered: ${mems} / 7 · Nights you heard the alarm: ${s.lucidNights.size} · Relics kept: ${s.relics.size}</div>
      <div class="cols"><div class="list">${entries.map((e, i) => `<div class="e ${e.type}" data-i="${i}">${e.type === 'memory' ? '❦ ' : ''}${esc(e.title)}</div>`).join('') || '<div class="e">Nothing yet.</div>'}</div><div class="read">${entries.length ? 'Select an entry.' : 'The pages are damp and empty.'}</div></div>`;
    box.querySelectorAll('.e[data-i]').forEach((d) => d.onclick = () => {
      box.querySelectorAll('.e').forEach((x) => x.classList.remove('sel'));
      d.classList.add('sel');
      const e = entries[+d.dataset.i];
      box.querySelector('.read').textContent = `${e.title}\n\n${e.text}`;
      audio.uiClick();
    });
  }

  // ---------------------------------------------------------------- choice & upgrade
  choice(question, options) {
    return new Promise((resolve) => {
      this.openModal('choice');
      const box = $('#choice');
      box.classList.remove('hidden');
      box.innerHTML = `<div class="q">${esc(question)}</div>${options.map((o, i) => `<button data-i="${i}">${esc(o.label)}${o.why ? `<span class="why">${esc(o.why)}</span>` : ''}</button>`).join('')}`;
      box.querySelectorAll('button').forEach((b) => b.onclick = () => { const o = options[+b.dataset.i]; this.closeModal(); resolve(o.id); });
    });
  }
  upgradePicker(options, defs) {
    return new Promise((resolve) => {
      this.openModal('upgrade');
      const box = $('#upgrade');
      box.classList.remove('hidden');
      box.innerHTML = `<h2>Dad's workbench</h2><div class="sub">Everything in the garage still smells like him. Take one thing for tonight.</div><div class="cards">${options.map((o) => `<div class="card" data-id="${o}"><div class="n">${esc(defs[o].name)}</div><div class="d">${esc(defs[o].desc)}</div></div>`).join('')}</div>`;
      box.querySelectorAll('.card').forEach((c) => c.onclick = () => { audio.pickup(); this.closeModal(); resolve(c.dataset.id); });
    });
  }

  // ---------------------------------------------------------------- titles, fades
  fade(on, ms = 1200) {
    const f = $('#fade');
    f.style.transition = `opacity ${ms}ms`;
    f.classList.toggle('on', on);
    return new Promise((r) => setTimeout(r, ms));
  }
  async showTitle(big, small = '', lines = [], dur = 6) {
    const t = $('#title');
    t.innerHTML = `<div class="big">${esc(big)}</div>${small ? `<div class="small">${esc(small)}</div>` : ''}${lines.length ? `<div class="lines">${lines.map(esc).join('<br>')}</div>` : ''}`;
    t.classList.add('show');
    await wait(dur * 1000);
    t.classList.remove('show');
    await wait(1800);
  }
  async captions(lines, per = 3.2, cls = 'cine') {
    for (const l of lines) { this.subtitle(l, per - 0.3, cls); await wait(per * 1000); }
  }

  // ---------------------------------------------------------------- pause
  showPause() {
    const p = $('#pause');
    p.classList.remove('hidden');
    p.innerHTML = `<div class="box"><h2>PAUSED</h2>
      <button id="pResume">Resume</button><button id="pJournal">Journal</button><button id="pSettings">Settings</button><button id="pControls">Controls</button><button id="pQuit">Quit to title</button>
      <div class="hint">Progress is saved when you wake up.</div></div>`;
    $('#pResume').onclick = () => this.game.resume();
    $('#pJournal').onclick = () => { this.hidePause(); this.game.paused = false; this.openJournal(); };
    $('#pSettings').onclick = () => this.showMenu('settings', true);
    $('#pControls').onclick = () => this.showMenu('controls', true);
    $('#pQuit').onclick = () => { this.hidePause(); this.game.quitToTitle(); };
  }
  hidePause() { $('#pause').classList.add('hidden'); }

  // ---------------------------------------------------------------- main menu
  showMenu(page = 'main', fromPause = false) {
    const m = $('#menu');
    m.classList.remove('hidden');
    const g = this.game;
    const save = Save.load();
    const meta = g.story.meta;
    const back = `<button id="mBack">← Back</button>`;
    let html = '';
    if (page === 'main') {
      html = `<h1>THE DEEP HOURS</h1><div class="tag">a fishing nightmare in seven nights</div><div class="items">
        ${save ? `<button id="mContinue">Continue — ${save.night > 7 ? 'Epilogue' : save.night === 7 ? 'The Last Night' : 'Night ' + save.night}</button>` : ''}
        <button id="mNew">New Game</button>
        <button id="mNight" ${save || meta.nightmareUnlocked ? '' : 'disabled'}>Night Select</button>
        <button id="mNightmare" ${meta.nightmareUnlocked ? '' : 'disabled'}>Nightmare Mode${meta.nightmareUnlocked ? '' : ' — locked'}</button>
        <button id="mSettings">Settings</button><button id="mControls">Controls</button><button id="mEndings">Endings (${meta.endings.length}/6)</button></div>
        <div class="note">Headphones strongly recommended. Play in the dark.<br>Everything you see and hear is generated in your browser.</div>`;
    } else if (page === 'new') {
      html = `<h1>THE DEEP HOURS</h1><div class="tag">who are you?</div><div class="page">
        <label>Your name <input type="text" id="mName" maxlength="14" value="${esc(CONFIG.playerName)}"></label>
        <div class="note">The water will use it.</div><div style="margin-top:20px"><button id="mBegin">Begin</button>${back}</div></div>`;
    } else if (page === 'settings') {
      const s = g.story.settings;
      html = `<h1 style="font-size:30px">Settings</h1><div class="page">
        <label>Volume <input type="range" id="sVol" min="0" max="1" step="0.05" value="${CONFIG.masterVolume}"></label>
        <label>Mouse sensitivity <input type="range" id="sSens" min="0.0006" max="0.005" step="0.0002" value="${CONFIG.mouseSensitivity}"></label>
        <label>Field of view <input type="range" id="sFov" min="55" max="95" step="1" value="${CONFIG.fov}"></label>
        <label>Graphics <select id="sQual"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
        <label>Night length <select id="sLen"><option value="60">Short (6 min)</option><option value="100">Normal (10 min)</option><option value="150">Long (15 min)</option><option value="240">Very long (24 min)</option></select></label>
        <label>Alarm clock odds <select id="sAlarm"><option value="0.6">Rare</option><option value="1">Normal</option><option value="1.6">Frequent</option></select></label>
        <label>Always show clock <input type="checkbox" id="sClock" ${CONFIG.showClockAlways ? 'checked' : ''}></label>
        <label>Synthesized voices <input type="checkbox" id="sVoice" ${CONFIG.voiceSynthesis ? 'checked' : ''}></label>
        <div class="note">Alarm odds per catch by hour (12–5 AM): ${s.alarmChanceByHour.map((v) => (v * 100).toFixed(0) + '%').join(' · ')}</div>
        <div style="margin-top:16px">${back}</div></div>`;
    } else if (page === 'controls') {
      html = `<h1 style="font-size:30px">Controls</h1><div class="page controls">
        <div><b>W A S D</b> move</div><div><b>Shift</b> run</div><div><b>C / Ctrl</b> crouch</div><div><b>Mouse</b> look</div>
        <div><b>Hold LMB</b> cast / reel</div><div><b>LMB click</b> set the hook</div><div><b>Mouse ⟷</b> fight the pull</div><div><b>RMB</b> reel in</div>
        <div><b>Wheel</b> line depth</div><div><b>B</b> cycle bait</div><div><b>X</b> cut line</div><div><b>Q</b> stow / draw rod</div>
        <div><b>F</b> flashlight</div><div><b>R</b> new batteries</div><div><b>E</b> interact / hide</div><div><b>Space</b> hold breath (hidden)</div>
        <div><b>T</b> check watch</div><div><b>I / Tab</b> tackle bag</div><div><b>J</b> journal</div><div><b>L</b> boat lights</div><div><b>Esc</b> pause</div>
        </div><div style="margin-top:16px">${back}</div>`;
    } else if (page === 'endings') {
      html = `<h1 style="font-size:30px">Endings</h1><div class="page endings">${Object.entries(ENDINGS).map(([k, e]) => `<div class="${meta.endings.includes(k) ? 'got' : ''}">${meta.endings.includes(k) ? esc(e.title) : '???'}</div>`).join('')}</div>
        <div class="note">Some endings ask you to remember everything. One asks you to break a rule.</div><div style="margin-top:16px">${back}</div>`;
    } else if (page === 'nights') {
      const reached = Math.max(save ? save.night : 1, meta.nightmareUnlocked ? 7 : 1);
      const names = ['Hollow Lake', 'The Frozen Lake', 'The Open Sea', 'The Abandoned Harbor', 'The Swamp', 'The Deep', 'The Last Night'];
      html = `<h1 style="font-size:30px">Night Select</h1><div class="page night-list items">${names.map((n, i) => `<button data-n="${i + 1}" ${i + 1 <= reached ? '' : 'disabled'}>${i + 1}. ${i + 1 <= reached ? n : '???'}</button>`).join('')}</div>
        <div class="note">Starting from a later night keeps the memories and upgrades from your save.</div><div style="margin-top:16px">${back}</div>`;
    }
    m.innerHTML = `<div class="box">${html}</div>`;
    const on = (id, fn) => { const b = $('#' + id); if (b) b.onclick = () => { audio.init(); audio.uiClick(); fn(); }; };
    on('mContinue', () => { this.hideMenu(); g.continueGame(); });
    on('mNew', () => this.showMenu('new'));
    on('mBegin', () => { const n = ($('#mName').value || 'Sam').trim().slice(0, 14) || 'Sam'; CONFIG.playerName = n.charAt(0).toUpperCase() + n.slice(1); this.hideMenu(); g.newGame(); });
    on('mNight', () => this.showMenu('nights'));
    on('mNightmare', () => { this.hideMenu(); g.newGame({ nightmare: true }); });
    on('mSettings', () => this.showMenu('settings', fromPause));
    on('mControls', () => this.showMenu('controls', fromPause));
    on('mEndings', () => this.showMenu('endings'));
    on('mBack', () => { if (fromPause) { this.hideMenu(); this.showPause(); } else this.showMenu('main'); });
    m.querySelectorAll('button[data-n]').forEach((b) => b.onclick = () => { audio.init(); this.hideMenu(); g.startFromNight(+b.dataset.n); });
    if (page === 'settings') {
      const s = g.story.settings;
      $('#sQual').value = CONFIG.quality;
      $('#sLen').value = String(s.secondsPerHour);
      const mult = s.alarmChanceByHour[5] / CONFIG.alarmChanceByHour[5];
      $('#sAlarm').value = mult < 0.8 ? '0.6' : mult > 1.3 ? '1.6' : '1';
      $('#sVol').oninput = (e) => { CONFIG.masterVolume = +e.target.value; audio.setVolume(CONFIG.masterVolume); this.persistSettings(); };
      $('#sSens').oninput = (e) => { CONFIG.mouseSensitivity = +e.target.value; this.persistSettings(); };
      $('#sFov').oninput = (e) => { CONFIG.fov = +e.target.value; g.camera.fov = CONFIG.fov; g.camera.updateProjectionMatrix(); this.persistSettings(); };
      $('#sQual').onchange = (e) => { CONFIG.quality = e.target.value; g.applyQuality(); this.persistSettings(); };
      $('#sLen').onchange = (e) => { s.secondsPerHour = +e.target.value; this.persistSettings(); };
      $('#sAlarm').onchange = (e) => { s.alarmChanceByHour = CONFIG.alarmChanceByHour.map((v) => Math.min(1, v * +e.target.value)); this.persistSettings(); this.showMenu('settings', fromPause); };
      $('#sClock').onchange = (e) => { CONFIG.showClockAlways = e.target.checked; this.persistSettings(); };
      $('#sVoice').onchange = (e) => { CONFIG.voiceSynthesis = e.target.checked; this.persistSettings(); };
    }
  }
  persistSettings() {
    const s = this.game.story.settings;
    Object.assign(s, { volume: CONFIG.masterVolume, sens: CONFIG.mouseSensitivity, fov: CONFIG.fov, quality: CONFIG.quality, clock: CONFIG.showClockAlways, voice: CONFIG.voiceSynthesis });
    this.game.story.saveSettings();
  }
  hideMenu() { $('#menu').classList.add('hidden'); }

  showClickToPlay(v) { $('#clickToPlay').classList.toggle('hidden', !v); }

  // ---------------------------------------------------------------- ending screen
  ending({ title, sub, text, stats }) {
    return new Promise((resolve) => {
      const e = $('#ending');
      e.classList.remove('hidden');
      e.innerHTML = `<div class="box"><h1>${esc(title)}</h1><div class="sub">${esc(sub)}</div><div class="txt">${esc(text)}</div><div class="stats">${stats.map(esc).join('<br>')}</div><button id="eDone">Return to title</button></div>`;
      $('#eDone').onclick = () => { e.classList.add('hidden'); resolve(); };
    });
  }
}

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export { N };
