import * as THREE from 'three';
import './ui/style.css';
import { CONFIG, QUALITY } from './config.js';
import { PostFX } from './engine/PostFX.js';
import { Input } from './engine/Input.js';
import { audio } from './engine/Audio.js';
import { UI, wait } from './ui/UI.js';
import { Story } from './story/Story.js';
import { NoiseSystem } from './systems/Noise.js';
import { TimeSystem, Events } from './systems/Time.js';
import { Inventory } from './systems/Inventory.js';
import { Save } from './systems/Save.js';
import { Player } from './player/Player.js';
import { Fishing } from './fishing/Fishing.js';
import { CATALOG } from './fishing/Catalog.js';
import { DreamDirector, Hallucinations } from './systems/DreamEvents.js';
import { sharedUpdate, clearMatCache } from './world/Props.js';
import { buildHollowLake } from './levels/HollowLake.js';
import { buildFrozenLake } from './levels/FrozenLake.js';
import { buildOpenSea } from './levels/OpenSea.js';
import { buildHarbor } from './levels/Harbor.js';
import { buildSwamp } from './levels/Swamp.js';
import { buildDeep } from './levels/Deep.js';
import { buildRealWorld } from './levels/RealWorld.js';
import { buildEnding } from './story/Endings.js';
import { NIGHT_INTROS, DAY_TEXT, ENDINGS, MEMORY_ORDER, N } from './story/Text.js';
import { makeHumanoid } from './monsters/Monster.js';
import { clamp, damp, fmtTime, rand, smooth } from './util/math.js';

const BUILDERS = [null, (g) => buildHollowLake(g, false), buildFrozenLake, buildOpenSea, buildHarbor, buildSwamp, buildDeep, (g) => buildHollowLake(g, true)];

class Game {
  constructor() {
    const canvas = document.getElementById('game');
    this.canvas = canvas;
    this.applySavedSettings();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.3;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.camera = new THREE.PerspectiveCamera(CONFIG.fov, innerWidth / innerHeight, 0.12, 1200);
    this.post = new PostFX(this.renderer, new THREE.Scene(), this.camera);
    this.input = new Input(canvas);
    this.input.setBindings(this._savedBindings);
    this.events = new Events();
    this.story = new Story(this);
    this.ui = new UI(this);
    this.noise = new NoiseSystem();
    this.time = new TimeSystem(this);
    this.inventory = new Inventory(this);
    this.player = new Player(this);
    this.fishing = new Fishing(this);
    this.monsters = [];
    this.state = 'boot';
    this.paused = false;
    this.nightIndex = 1;
    this.nightState = this.freshNightState();
    this.difficulty = 1;
    this.lucid = false;
    this.lucidPulse = 0;
    this.dayState = {};
    this.cine = null;
    this._last = performance.now();
    this.applyQuality();
    addEventListener('resize', () => this.resize());
    this.resize();
    this.input.onUnlock = () => this.onPointerUnlock();
    canvas.addEventListener('click', () => this.tryLock());
    document.getElementById('ui').addEventListener('click', (e) => { if (e.target.id === 'clickToPlay') this.tryLock(); });
    document.addEventListener('pointerdown', () => audio.init(), { once: false });
    document.addEventListener('keydown', () => audio.init());
    window.__game = this;
    this.frames = 0;
    this.renderer.setAnimationLoop(() => this.tick());
  }

  applySavedSettings() {
    const s = Save.meta().settings || {};
    if (s.volume !== undefined) CONFIG.masterVolume = s.volume;
    if (s.sens) CONFIG.mouseSensitivity = s.sens;
    if (s.fov) CONFIG.fov = s.fov;
    if (s.quality) CONFIG.quality = s.quality;
    if (s.clock !== undefined) CONFIG.showClockAlways = s.clock;
    if (s.voice !== undefined) CONFIG.voiceSynthesis = s.voice;
    if (s.invertY !== undefined) CONFIG.invertY = s.invertY;
    if (s.keyLook) CONFIG.keyLookSpeed = s.keyLook;
    if (s.retro !== undefined) CONFIG.retro = s.retro;
    if (s.brightness) CONFIG.brightness = s.brightness;
    this._savedBindings = s.bindings;
  }
  applyQuality() {
    const q = QUALITY[CONFIG.quality] || QUALITY.high;
    this.renderer.setPixelRatio(q.pixelRatio);
    this.resize();
  }
  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    const pr = this.renderer.getPixelRatio();
    this.post.setSize(w * pr, h * pr);
    this.post.u.uAspect.value = w / h;
  }
  freshNightState() { return { catches: 0, caught: new Set(), alarmCaught: false, alarmPity: 0 }; }

  tryLock() {
    audio.init();
    if ((this.state === 'night' || this.state === 'day') && !this.paused && !this.ui.modalOpen) this.input.lock();
  }
  onPointerUnlock() {
    if (this.ui.modalOpen || this.paused || this.cine) return;
    if (this.state === 'night' || this.state === 'day') this.pause();
  }
  pause() { if (this.paused) return; this.paused = true; this.input.unlock(); this.ui.showPause(); audio.setMuffle(600); }
  resume() { this.paused = false; this.ui.hidePause(); this.ui.hideMenu(); audio.setMuffle(20000); this.input.lock(); }

  // ------------------------------------------------------------------ level management
  loadLevel(level) {
    if (this.level) {
      this.director?.dispose(); this.hallu?.dispose();
      for (const m of this.monsters) m.dispose?.();
      this.level.cleanup?.();
      this.level.dispose();
      clearMatCache();
    }
    this.monsters = [];
    this.director = null; this.hallu = null;
    this.level = level;
    this.pendingLevel = null;
    level.scene.add(this.camera);
    this.post.setScene(level.scene, this.camera);
    this.fishing.attach(level.scene);
    this.noise.clear();
  }
  computeDifficulty(n) {
    const ups = Object.keys(this.story.upgrades).length;
    return 1 + ups * 0.05 + (n - 1) * 0.04 + (this.nightmare ? 0.3 : 0);
  }

  // ------------------------------------------------------------------ menu
  showTitle() {
    this.state = 'menu';
    this.paused = false;
    this.ui.setHUD(false);
    this.input.unlock();
    const level = buildHollowLake(this, false);
    this.loadLevel(level);
    this.player.vm.setVisible(false);
    this.menuT = 0;
    this.ui.showMenu('main');
    this.ui.fade(false, 2000);
    audio.setAmbience({ water: 0.3, wind: 0.2, crickets: 0.15 }, 2);
  }
  newGame({ nightmare = false } = {}) {
    audio.init();
    this.story.reset();
    this.story.nightmareMode = nightmare;
    this.setupNightmare(nightmare);
    Save.clear();
    this.story.save();
    this.startNight(1);
  }
  setupNightmare(on) {
    if (!on) { this.nightmare = null; return; }
    const w = {};
    for (const e of CATALOG) w[e.id] = rand(0.3, 2.2);
    this.nightmare = { alarmMult: rand(0.6, 1.8), weight: (id) => w[id] ?? 1 };
  }
  continueGame() {
    const s = Save.load();
    if (!s) { this.newGame(); return; }
    this.story.load(s);
    this.setupNightmare(this.story.nightmareMode);
    if (this.story.flags.dayPending) this.startDay(this.story.flags.dayPending);
    else this.startNight(Math.min(7, this.story.night));
  }
  startFromNight(n) {
    const s = Save.load();
    if (s) this.story.load(s); else this.story.reset();
    this.story.night = n; this.story.flags.dayPending = null;
    this.setupNightmare(this.story.nightmareMode);
    this.startNight(n);
  }
  quitToTitle() { this.paused = false; this.cine = null; this.fishing.reset(); audio.stopSpeech(); this.ui.fade(true, 600).then(() => this.showTitle()); }

  // ------------------------------------------------------------------ nights
  async startNight(n, opts = {}) {
    this.state = 'loading';
    this.paused = false;
    this.ui.setHUD(false);
    this.ui.hidePause(); this.ui.hideMenu();
    await this.ui.fade(true, opts.restart ? 200 : 900);
    audio.silenceAll(0.3);
    this.events.clearScoped();
    this.registerCoreEvents();
    this.nightIndex = n;
    this.nightState = opts.snapshot ? { ...opts.snapshot.nightState, caught: new Set(opts.snapshot.nightState.caught) } : this.freshNightState();
    this.lucid = !!(opts.snapshot && opts.snapshot.lucid);
    this.watchGlitch = this.lucid;
    this.difficulty = this.computeDifficulty(n);
    this.player.reset();
    const level = BUILDERS[n](this);
    this.loadLevel(level);
    // inventory
    if (opts.snapshot) { this.inventory.capacity = opts.snapshot.inv.capacity; this.inventory.slots = opts.snapshot.inv.slots.map((s) => ({ ...s })); }
    else level.kit();
    this.nightStartSnapshot = this.nightStartSnapshot && opts.restart ? this.nightStartSnapshot : this.snapshot();
    // upgrades applied to the player
    const u = this.story.upgrades;
    this.player.maxHealth = u.kit ? 120 : 100; this.player.health = this.player.maxHealth;
    this.player.flashlight.maxIntensity = u.torch ? 150 : 110;
    this.player.flashlight.drain = (1 / 420) * (u.torch ? 0.67 : 1);
    this.player.flashlight.light.angle = u.torch ? 0.5 : 0.42;
    this.player.underwater = !!level.underwater;
    const sp = level.spawn;
    this.player.spawn(new THREE.Vector3(sp.x, 0, sp.z), sp.yaw);
    if (sp.boat) { this.player.inBoat = sp.boat; sp.boat.local.set(0, 0, 1.2); }
    this.monsters = level.monsters || [];
    this.director = new DreamDirector(this, level.dreams || []);
    if (this.nightmare) this.director.defs.push(visitorEvent());
    this.hallu = new Hallucinations(this);
    this.fishing.reset();
    this.time.start(opts.hour || 0);
    this.time.clear();
    this.time.onHour((h) => this.onHour(h));
    if (this.lucid) this.time.scale = CONFIG.alarmTimeScale;
    if (opts.hour) for (let h = 1; h <= opts.hour; h++) level.onHour?.(h);
    if (this.nightmare) level.weather.set({ fog: rand(0.01, 0.06), rain: Math.random() < 0.4 ? rand(0.2, 0.8) : 0 });
    audio.setReverb(level.name === 'harbor' ? 0.5 : level.name === 'deep' ? 0.6 : 0.25);
    audio.setMuffle(level.underwater ? 900 : 20000);
    this.post.u.uUnderwater.value = level.underwater ? 1 : 0;
    this.post.u.uRed.value = n === 7 ? 0.15 : 0;
    this.post.u.uDesat.value = 0.15;
    // intro
    const intro = NIGHT_INTROS[n];
    if (!opts.restart && intro && level.introPath && !this.fastIntro) {
      this.state = 'cutscene';
      this.player.vm.setVisible(false);
      audio.setAmbience(level.ambience(0), 3);
      this.ui.fade(false, 2500);
      const camDone = this.cinematic(level.introPath, 13);
      await wait(1500);
      if (n === 1) audio.motif('low', 0.12);
      await this.ui.showTitle(intro.title, intro.sub, intro.lines(), 7);
      await camDone;
    } else {
      this.ui.fade(false, 900);
      if (opts.restart) this.ui.subtitle(opts.hour >= 3 ? '3:00 AM. You are back. You were always here.' : '12:00 AM. You are back at the beginning. Weren\'t you just...?', 4);
    }
    this.player.vm.setVisible(true);
    this.post.u.uLetterbox.value = 0;
    this.state = 'night';
    this.ui.setHUD(true);
    this.ui.flashWatch(3);
    if (n === 1 && !opts.restart && !this.story.flags.tutorial) {
      this.story.flags.tutorial = true;
      setTimeout(() => { const L = (a) => this.input.label(a); this.ui.toast(`Hold [${L('cast')}] to cast. Scroll or [${L('deeper')}]/[${L('shallower')}] for depth. [${L('watch')}] check your watch. Rebind keys in Pause → Controls.`); }, 1500);
      setTimeout(() => this.ui.toast('Survive until 6:00 AM.'), 7000);
    }
    this.tryLock();
  }

  snapshot() {
    return { inv: this.inventory.serialize(), nightState: { ...this.nightState, caught: [...this.nightState.caught] }, lucid: this.lucid };
  }

  registerCoreEvents() {
    this.events.on('hide', (spot) => { for (const m of this.monsters) m.onPlayerHide?.(spot); });
  }

  onHour(h) {
    if (this.state !== 'night') return;
    this.level.onHour?.(h);
    this.ui.flashWatch(2.5);
    audio.click(0.15);
    if (h === CONFIG.checkpointHour) { this.checkpoint = this.snapshot(); this.ui.toast(`${fmtTime(h)} — halfway through the dark. (checkpoint)`, 'dream'); }
    else if (h < 6) this.ui.toast(fmtTime(h) + (h === 5 ? ' — one more hour.' : ''));
    if (h >= 6) this.endNight();
  }

  // The alarm clock was caught: the player knows they are dreaming, and so does the dream.
  triggerLucidity() {
    const first = !this.lucid;
    this.lucid = true;
    this.watchGlitch = true;
    this.time.scale = CONFIG.alarmTimeScale;
    for (const m of this.monsters) m.onLucid?.();
    this.lucidPulse = 1;
    for (const w of this.level.waters) w.uniforms.uStill.value = 1;
    setTimeout(() => { if (this.level) for (const w of this.level.waters) w.uniforms.uStill.value = this.nightIndex === 7 ? 0.8 : 0.4; }, 9000);
    audio.silenceAll(0.05);
    setTimeout(() => {
      audio.say(`You're dreaming, ${N()}.`, { pitch: 0.35, rate: 0.7, volume: 0.7 });
      this.ui.subtitle(`(your own voice, slowed and wrong) "You're dreaming, ${N()}."`, 5, 'whisper');
      audio.sting(0.5);
      audio.motif('broken', 0.12);
    }, 1200);
    setTimeout(() => { if (this.level && this.state === 'night') audio.setAmbience(this.level.ambience(this.time.hour), 3); }, 5000);
    if (this.level.sky) { this.level.sky.setMoonAngles(this.level.sky.azimuth + 2.2, 0.6); this.post.u.uRed.value = Math.max(this.post.u.uRed.value, 0.2); }
    this.player.addFear(0.5);
    this.story.addJournal({ id: 'alarm' + this.nightIndex, title: `Night ${this.nightIndex}: the alarm clock`, text: `I pulled an alarm clock out of the water at ${fmtTime(this.time.hour)}. It rang. I'm dreaming. I know I'm dreaming. It knows I know.` });
    if (first) this.ui.toast('The dream knows you know. Time runs faster now. So do they.', 'dream');
    if (this.nightIndex === 7) setTimeout(() => this.finalChoice(), 4500);
  }

  async finalChoice() {
    if (this.state !== 'night') return;
    const relics = new Set([...this.story.relics, ...this.inventory.relics()]);
    const opts = [
      { id: 'ring', label: 'Let it ring.', why: 'Wake up.' },
      { id: 'off', label: 'Turn it off.', why: 'Five more minutes.' },
    ];
    if (relics.size >= 5) opts.push({ id: 'monster', label: 'Put on the waders and the hat.', why: `You have carried ${relics.size} pieces of them. They fit.` });
    if (this.story.memories.has('ribbon')) opts.push({ id: 'notyet', label: 'Not yet.', why: 'There is a rowboat in the middle of the lake. The water is perfectly still.' });
    this.player.frozen = true;
    const c = await this.ui.choice(`The clock in your hands is ringing.\nIt is four o'clock. It has always been four o'clock.\n\nWhat do you do?`, opts);
    this.player.frozen = false;
    if (c === 'notyet') {
      this.level.enableWaterWalk?.();
      this.pendingFinal = true;
      this.ui.subtitle('The lake goes still as glass. It would hold your weight. She is waiting in the boat.', 6);
      this.tryLock();
      return;
    }
    this.finishGame(c);
  }

  finishGame(choice) {
    const id = this.story.resolveEnding(choice === 'ring' ? 'ring' : choice);
    this.playEnding(id);
  }

  async endNight() {
    if (this.state !== 'night') return;
    if (this.nightIndex === 7) { this.finishGame(this.nightState.alarmCaught ? 'ring' : 'none'); return; }
    this.state = 'cutscene';
    this.fishing.abort();
    this.input.unlock();
    this.ui.setHUD(false);
    for (const r of this.inventory.relics()) this.story.relics.add(r);
    audio.silenceAll(1);
    this.ui.subtitle('6:00 AM.', 3, 'cine');
    await wait(1200);
    audio.alarm(3.5, { vol: 0.4 });
    this.post.u.uWhite.value = 0;
    await this.ui.fade(true, 2500);
    const n = this.nightIndex;
    this.story.night = n + 1;
    this.story.flags.dayPending = n;
    this.checkpoint = null; this.nightStartSnapshot = null;
    this.story.save();
    this.startDay(n);
  }

  // ------------------------------------------------------------------ days (the real world)
  async startDay(d) {
    this.state = 'loading';
    this.ui.setHUD(false);
    this.events.clearScoped();
    this.registerCoreEvents();
    this.dayState = { upgraded: false, ringing: false };
    this.lucid = false; this.watchGlitch = false;
    const level = buildRealWorld(this, d);
    this.loadLevel(level);
    this.player.reset();
    this.player.underwater = false;
    this.player.rodOut = false; this.player.vm.rodTarget = 0;
    this.post.u.uUnderwater.value = 0; this.post.u.uRed.value = 0; this.post.u.uDesat.value = d >= 5 ? 0.25 : 0.08;
    audio.setReverb(0.15); audio.setMuffle(20000);
    audio.setAmbience(level.ambience(), 2);
    // wake-up shot: staring at the ceiling, then the nightstand
    this.state = 'cutscene';
    this.player.vm.setVisible(false);
    const wc = level.wakeCam;
    level.digital.set('6:00');
    const cam = this.cinematic([{ pos: wc.pos, look: wc.look }, { pos: wc.pos, look: wc.look }, { pos: wc.pos.clone().add(new THREE.Vector3(0, 0.15, 0)), look: wc.look2 }], 9);
    await this.ui.fade(false, 2000);
    audio.alarm(1.2, { vol: 0.15, warp: d >= 4 ? 0.4 : 0 });
    await this.ui.captions((DAY_TEXT[Math.min(6, d)] || DAY_TEXT[1]).wake(), 3);
    await cam;
    this.post.u.uLetterbox.value = 0;
    this.player.spawn(new THREE.Vector3(level.spawn.x, 0, level.spawn.z), level.spawn.yaw);
    this.player.vm.setVisible(true);
    this.state = 'day';
    this.ui.setHUD(true);
    this.ui.toast(d >= 6 ? 'The front door.' : 'Explore the house. Dad\'s workbench is in the garage. Sleep when you\'re ready.');
    this.tryLock();
  }
  async sleep() {
    this.state = 'cutscene';
    this.input.unlock();
    this.ui.setHUD(false);
    this.ui.subtitle('You lie down. You close your eyes. You can hear water.', 4, 'cine');
    await this.ui.fade(true, 2500);
    this.story.flags.dayPending = null;
    this.story.save();
    this.startNight(this.story.night);
  }
  async beginFinalNight() {
    this.state = 'cutscene';
    this.input.unlock();
    this.ui.setHUD(false);
    audio.creak(null, 0.4);
    this.ui.subtitle('The front door opens onto the Hollow Lake dock. It is night. It has always been night.', 5, 'cine');
    await this.ui.fade(true, 3000);
    this.story.night = 7; this.story.flags.dayPending = null;
    this.story.save();
    this.startNight(7);
  }

  // ------------------------------------------------------------------ death
  onPlayerDeath(cause) { this.deathSequence({ type: 'grab', text: typeof cause === 'string' ? `${cause} caught you.` : 'Something caught you.' }); }
  async deathSequence({ type = 'grab', text = '' }) {
    if (this.state !== 'night') return;
    this.state = 'dying';
    this.player.dead = true;
    this.fishing.abort();
    this.player.vm.setVisible(false);
    this.story.stats.deaths++;
    this.death = { t: 0, type, y0: this.camera.position.y, pitch: this.player.pitch };
    audio.hit();
    if (type === 'swallow') audio.growl(this.camera.position, 0.5, 1.5, 1);
    await wait(2600);
    await this.ui.fade(true, 600);
    audio.silenceAll(0.1);
    this.ui.subtitle(text, 3, 'cine');
    await wait(2200);
    audio.alarm(2.5, { warp: 0.7, vol: 0.35 });
    this.ui.subtitle('...and then the alarm.', 2.5, 'cine');
    await wait(2800);
    this.death = null;
    const atCheckpoint = this.time.hour >= CONFIG.checkpointHour && this.checkpoint;
    const snap = atCheckpoint ? this.checkpoint : this.nightStartSnapshot;
    this.startNight(this.nightIndex, { restart: true, hour: atCheckpoint ? CONFIG.checkpointHour : 0, snapshot: snap });
  }
  updateDeath(dt) {
    const d = this.death; if (!d) return;
    d.t += dt;
    const k = smooth(clamp(d.t / 2.4, 0, 1));
    const cam = this.camera;
    if (d.type === 'drag' || d.type === 'under') {
      cam.position.y = d.y0 - k * 2.6;
      cam.rotation.x = d.pitch + k * 1.2;
      cam.rotation.z = Math.sin(d.t * 7) * 0.1 * (1 - k);
      this.post.u.uUnderwater.value = k;
      if (Math.random() < dt * 8) audio.bubble(cam.position);
    } else if (d.type === 'swallow') {
      this.post.u.uBlack.value = k;
      cam.position.x += (Math.random() - 0.5) * 0.05;
    } else {
      cam.rotation.z = k * 1.3; cam.position.y = d.y0 - k * 1.3;
      cam.position.x += (Math.random() - 0.5) * 0.04 * (1 - k);
    }
    this.post.u.uDamage.value = 1 - k * 0.5;
  }

  // ------------------------------------------------------------------ endings
  async playEnding(id) {
    this.state = 'ending';
    this.paused = false;
    this.input.unlock();
    this.ui.setHUD(false);
    this.fishing.abort();
    await this.ui.fade(true, 2500);
    audio.silenceAll(0.5);
    if (id === 'trapped') { audio.alarm(1, { vol: 0.2 }); await wait(400); audio.click(0.5); }
    else if (id !== 'monster') audio.alarm(3, { vol: 0.35 });
    await wait(2500);
    const E = buildEnding(this, id);
    this.loadLevel(E.level);
    this.player.vm.setVisible(false);
    this.post.u.uUnderwater.value = 0; this.post.u.uRed.value = id === 'monster' ? 0.2 : 0; this.post.u.uDesat.value = 0.05; this.post.u.uBlack.value = 0;
    audio.setAmbience(E.ambience || {}, 2);
    this.endingMonitor = E.monitor || 0;
    for (const shot of E.shots) {
      if (shot.scene) { await this.ui.fade(true, 1500); this.loadLevel(shot.scene()); this.endingMonitor = 0; audio.setAmbience({ water: 0.3, wind: 0.15, crickets: 0.1 }, 2); }
      const p = new THREE.Vector3(...shot.pos), l = new THREE.Vector3(...shot.look);
      const cam = this.cinematic([{ pos: p, look: l }, { pos: p.clone().add(new THREE.Vector3(0.15, 0.05, -0.3)), look: l }], shot.dur);
      this.ui.fade(false, 1800);
      await this.ui.captions(shot.lines, shot.dur / shot.lines.length);
      await cam;
    }
    if (E.reel) { for (let i = 0; i < 14; i++) setTimeout(() => audio.reelClick(1.4), i * 70); await wait(1200); }
    await this.ui.fade(true, 2000);
    audio.silenceAll(1);
    this.endingMonitor = 0;
    this.story.unlockEnding(id);
    const meta = this.story.meta;
    if (id === 'truth') audio.motif('clean', 0.18);
    const mem = MEMORY_ORDER.filter((m) => this.story.memories.has(m)).length;
    await this.ui.ending({
      title: ENDINGS[id].title, sub: ENDINGS[id].sub, text: E.text,
      stats: [`Memories recovered: ${mem} / 7`, `Nights you heard the alarm: ${this.story.lucidNights.size}`, `Relics kept: ${this.story.relics.size}`, `Things pulled from the water: ${this.story.stats.catches}`, `Times you woke up at the beginning: ${this.story.stats.deaths}`, `Endings found: ${meta.endings.length} / 6`, meta.nightmareUnlocked ? 'Nightmare Mode unlocked.' : ''].filter(Boolean),
    });
    Save.clear();
    this.post.u.uLetterbox.value = 0;
    this.showTitle();
  }

  // ------------------------------------------------------------------ cinematic camera
  // keys: [{pos, look}], interpolated over dur seconds. Resolves when done.
  cinematic(keys, dur) {
    return new Promise((resolve) => {
      this.cine = { keys, dur, t: 0, resolve };
      this.post.u.uLetterbox.value = 1;
    });
  }
  updateCine(dt) {
    const c = this.cine; if (!c) return;
    c.t += dt;
    const k = clamp(c.t / c.dur, 0, 1);
    const segs = c.keys.length - 1;
    const f = Math.min(segs - 1e-6, k * segs);
    const i = Math.floor(f), t = smooth(f - i);
    const a = c.keys[i], b = c.keys[Math.min(i + 1, segs)];
    this.camera.position.lerpVectors(a.pos, b.pos, t);
    const look = new THREE.Vector3().lerpVectors(a.look, b.look, t);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(look);
    this.camera.updateMatrixWorld();
    if (k >= 1) { this.cine = null; c.resolve(); }
  }

  // ------------------------------------------------------------------ misc actions
  throwItem(kind) {
    const p = this.player;
    const geo = kind === 'fish' ? new THREE.CapsuleGeometry(0.06, 0.25, 4, 6) : new THREE.CylinderGeometry(0.04, 0.04, 0.25, 6);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: kind === 'fish' ? 0x6a7a5a : 0x3a6a3a, roughness: 0.3 }));
    const dir = new THREE.Vector3(); this.camera.getWorldDirection(dir);
    mesh.position.copy(this.camera.position).addScaledVector(dir, 0.5);
    const vel = dir.multiplyScalar(13).add(new THREE.Vector3(0, 4, 0));
    this.level.scene.add(mesh);
    audio.whoosh();
    const level = this.level;
    const step = (dt) => {
      vel.y -= 9.8 * dt;
      mesh.position.addScaledVector(vel, dt);
      mesh.rotation.x += dt * 8;
      const g = level.groundAt(mesh.position.x, mesh.position.z, mesh.position.y).y;
      const w = level.waterSurfaceAt(mesh.position.x, mesh.position.z);
      const inWater = level.isFishable(mesh.position.x, mesh.position.z) || w > g;
      if (mesh.position.y <= Math.max(g, inWater ? w : -999)) {
        level.updaters.splice(level.updaters.indexOf(step), 1);
        const pos = mesh.position.clone();
        if (inWater) { audio.splash(pos, 0.5); level.scene.remove(mesh); level.mire?.throwBait(pos); }
        else if (kind === 'bottle') { audio._oneNoise({ pos, freq: 3500, Q: 3, d: 0.4, vol: 0.6 }); audio._oneTone({ pos, freq: 2400, freqEnd: 1800, d: 0.3, vol: 0.2, type: 'triangle' }); level.scene.remove(mesh); }
        else audio.footstep('grass', 0.4, pos);
        this.noise.emit(pos, kind === 'bottle' ? 32 : 18, 'thrown', 'item');
      }
    };
    level.onUpdate(step);
    void p;
  }
  lightFlare() {
    const level = this.level;
    const pos = this.player.pos.clone().add(new THREE.Vector3(0, 0.3, 0));
    const l = new THREE.PointLight(0xff3a20, 8, 22, 1.4); l.position.copy(pos);
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff8060 })); m.position.copy(pos);
    level.scene.add(l, m);
    const ls = level.addLightSource(pos, 9, l, { flicker: 0.4 });
    level.leviathan?.addAttention(0.2);
    this.flareT = 60;
    let t = 0;
    const fn = (dt) => { t += dt; if (Math.random() < dt * 4) audio._oneNoise({ pos, freq: 3000, Q: 0.5, d: 0.2, vol: 0.05 }); if (t > 60) { level.scene.remove(l, m); ls.on = false; level.updaters.splice(level.updaters.indexOf(fn), 1); } };
    level.onUpdate(fn);
    audio._oneNoise({ freq: 2000, Q: 0.5, a: 0.05, d: 0.8, vol: 0.4 });
  }
  smell(pos, amt) { const m = this.level.mire; if (m) { m.alert = Math.min(1, m.alert + amt * 0.5); m.target = pos.clone(); } }
  playVoicemail() {
    audio.radioStatic(1.2, 0.15);
    const lines = [`${N()}? ${N()}, wake up. The boat's going out by itself.`, `It's really dark. I can't see the tent.`, `${N()}, it's four. You said you'd—`];
    lines.forEach((l, i) => setTimeout(() => { this.ui.subtitle(`(a child's voice, through water) "${l}"`, 4.5, 'whisper'); audio.say(l, { pitch: 1.7, rate: 0.9, volume: 0.5 }); }, 1200 + i * 4800));
    this.story.addJournal({ id: 'voicemail', title: 'Voicemail, 4:17 AM', text: lines.join('\n') + '\n\n[the rest is water]' });
    this.player.addFear(0.3);
  }

  // Debug/test hook: advance the simulation without rendering.
  simulate(seconds, step = 0.05) {
    for (let t = 0; t < seconds; t += step) {
      if (this.state !== 'night') break;
      this.time.update(step); this.noise.update(step);
      this.level.update(step, this.camera, this.player);
      this.player.update(step); this.fishing.update(step);
      for (const m of this.monsters) m.update(step);
      this.director?.update(step); this.hallu?.update(step);
      this.input.endFrame();
    }
  }

  // ------------------------------------------------------------------ main loop
  tick() {
    const now = performance.now(); const rawDt = Math.min(0.5, (now - this._last) / 1000); const dt = Math.min(0.05, rawDt); this._last = now;
    this.frames++;
    const st = this.state;
    const input = this.input;
    if (!this.paused) {
      if (st === 'night') {
        this.time.update(dt);
        this.noise.update(dt);
        this.level.update(dt, this.camera, this.player);
        this.player.update(dt);
        this.fishing.update(dt);
        for (const m of this.monsters) m.update(dt);
        this.director?.update(dt);
        this.hallu?.update(dt);
        sharedUpdate(dt, this.player.fear);
        this.flareT = Math.max(0, (this.flareT || 0) - dt);
        this.lucidPulse = Math.max(0, this.lucidPulse - dt * 0.15);
      } else if (st === 'day') {
        this.time.now += dt;
        this.noise.update(dt);
        this.level.update(dt, this.camera, this.player);
        this.player.update(dt);
        sharedUpdate(dt, this.player.fear);
      } else if (st === 'dying') {
        this.level.update(dt, this.camera, null);
        for (const m of this.monsters) m.update?.(0);
        this.updateDeath(dt);
      } else if (this.level) {
        this.time.now += dt;
        this.level.update(dt, this.camera, null);
        sharedUpdate(dt, 0);
        if (st === 'menu') {
          this.menuT = (this.menuT || 0) + dt * 0.03;
          const r = 48;
          this.camera.position.set(Math.cos(this.menuT) * r, 6 + Math.sin(this.menuT * 2) * 1, Math.sin(this.menuT) * r);
          this.camera.lookAt(0, 1, 0);
        }
      }
      if (this.cine) this.updateCine(rawDt);
    }
    // global keys (read raw so they also work while a panel has released the mouse)
    const k = (a) => input.codesFor(a).some((c) => input.pressed.has(c));
    if ((st === 'night' || st === 'day') && !this.paused && !input.onCapture) {
      const modal = this.ui.modal;
      if (modal === 'doc' && (k('interact') || input.rawHit('Escape'))) this.ui.closeModal();
      else if (modal && modal !== 'choice' && modal !== 'upgrade' && input.rawHit('Escape')) this.ui.closeModal();
      else if (k('inventory') && (!modal || modal === 'inventory')) this.ui.openInventory();
      else if (k('journal') && (!modal || modal === 'journal')) this.ui.openJournal();
      else if (!modal && !this.cine && k('pause')) this.pause();
    } else if (this.paused && !input.onCapture && input.rawHit(input.bindings.pause) && !this.ui.menuOpen) this.resume();
    this.ui.showClickToPlay((st === 'night' || st === 'day') && !input.active && !this.paused && !this.ui.modalOpen && !this.cine);
    this.ui.updateHUD(dt);
    // post & audio
    const u = this.post.u;
    const p = this.player;
    u.uPixel.value = CONFIG.retro ? Math.max(2, Math.round(3 * this.renderer.getPixelRatio())) : 0;
    this.renderer.toneMappingExposure = 1.5 * CONFIG.brightness;
    const live = st === 'night' || st === 'day';
    u.uFear.value = live ? p.fear : 0;
    if (st !== 'dying') u.uDamage.value = live ? p.damageFlash * 0.8 + (p.health < 35 ? 0.25 + Math.sin(performance.now() * 0.005) * 0.1 : 0) : 0;
    u.uWarp.value = this.lucidPulse * 0.8 + (st === 'night' && this.lucid ? 0.04 : 0);
    if (st === 'night' && this.level?.ambience) {
      this._ambT = (this._ambT || 0) - dt;
      if (this._ambT <= 0) { this._ambT = 1; audio.setAmbience(this.level.ambience(this.time.hour), 1.5); }
    }
    if (audio.ready) {
      audio.updateListener(this.camera);
      audio.update(dt, { fear: live ? p.fear : 0, monitor: st === 'ending' ? this.endingMonitor : this.level?.monitor || 0, monitorRate: 1 });
    }
    if (this.level) {
      this.level.renderReflections(this.renderer, this.camera);
      this.post.render(dt);
    }
    input.endFrame();
  }
}

// Nightmare Mode rare encounter: a little girl in a yellow raincoat on the far shore, waving.
function visitorEvent() {
  return {
    id: 'visitor', hours: [1, 5], chance: 0.6, once: true,
    run: (g) => {
      const p = g.player;
      const a = p.yaw + rand(-0.3, 0.3);
      const x = p.pos.x - Math.sin(a) * 35, z = p.pos.z - Math.cos(a) * 35;
      const m = makeHumanoid({ height: 1.15, thin: 0.75, color: 0xd8b020, skin: 0xe0c0a8, coat: true });
      m.root.position.set(x, g.level.groundAt(x, z, 50).y, z);
      m.root.rotation.y = Math.atan2(p.pos.x - x, p.pos.z - z);
      g.level.scene.add(m.root);
      g.ui.subtitle('Someone small, in a yellow raincoat, is waving at you.', 4);
      return { t: 0, update(dt) { this.t += dt; m.armR.rotation.x = -2.6 + Math.sin(this.t * 6) * 0.4; return this.t < 12 && p.pos.distanceTo(m.root.position) > 15; }, cleanup() { g.level.scene.remove(m.root); } };
    },
  };
}

const game = new Game();
const params = new URLSearchParams(location.search);
if (params.has('fast')) game.fastIntro = true;
if (params.has('night')) { const n = +params.get('night'); game.story.reset(); game.startNight(n); }
else if (params.has('day')) { game.startDay(+params.get('day')); }
else if (params.has('ending')) { game.playEnding(params.get('ending')); }
else game.showTitle();
void damp;
