# The Deep Hours

*A first-person, story-driven survival horror game about fishing in your own nightmares.*

Every night you wake up somewhere you were not when you fell asleep — a forest lake, a frozen lake, the open sea, a fog-drowned harbor, a swamp, the bottom of the ocean — with a rod, a flashlight and a little bait. Survive from **12:00 AM to 6:00 AM**. Fish. Explore. Hide. As the hours pass, the chance of reeling in an old brass **alarm clock** rises. When you catch it, it shows the exact time, and it rings with the same bell that wakes you up. You realize you are dreaming — and the dream realizes you know.

Between nights you wake up in your house. It is safe. At first.

The whole game runs in the browser with Three.js. **There are no asset files**: every mesh, texture, sound, voice line and piece of music is generated procedurally at runtime.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
npm run preview    # serve the production build
```

Use a desktop browser with WebGL2 (Chrome, Edge or Firefox). Headphones are strongly recommended — sound is one of the main ways the game communicates danger.

## Controls

| Key | Action |
| --- | --- |
| W A S D / Shift / C | move / run (uses stamina) / crouch (quieter) |
| Mouse | look |
| Hold LMB, release | charge and cast (power meter) |
| Mouse wheel | line depth (1–60 m) |
| LMB click | set the hook when the float goes under |
| Hold LMB | reel; reel in an empty line |
| Mouse left/right | during a fight, counter the fish's pull to lower tension |
| RMB | reel in |
| X | cut the line (you will need to) |
| B | cycle bait |
| Q | stow or draw the rod |
| F / R | flashlight / replace batteries |
| E | interact, hide, leave a hiding spot |
| Space (hidden) | hold your breath |
| T | look at your watch |
| I or Tab / J | tackle bag (inventory) / journal |
| L | boat lights (Night 3) |
| Esc | pause, settings |

## The seven nights

| Night | Place | Monster(s) | How it hunts |
| --- | --- | --- | --- |
| 1 | Hollow Lake (forest) | The Drowned Fisherman | Revealed in stages: footsteps → a glimpse between trees → standing across the lake → moves closer only while you are not looking → hunts by sight (flashlights carry), sound and memory, and searches hiding spots it saw you use. Sometimes it just watches, then walks back into the lake. |
| 2 | The Frozen Lake | The Thing Beneath the Ice | Blind; follows vibration (steps, running, drilling, reeling). Its shadow drifts under the translucent ice. Cracks spread under you before it breaks through, and every hole it makes becomes a new fishing hole. Fish only through holes; drill new ones with the auger (loud). |
| 3 | The Open Sea | The Leviathan, The Drowned, The Watcher | The Leviathan responds to attention (engine, lights, fights on the line, chum, glowing lures) with shadows, fins, bumps that stall the engine, tentacles and hull damage. The Drowned swim to the boat in the dark and climb aboard; light makes them let go. The Watcher stands on the horizon and only moves while you are not looking at it. |
| 4 | The Abandoned Harbor | The Dockhands (a pack) | Eyeless; hunt by sound only. They stop and click to listen. Crouch, don't run, throw bottles. |
| 5 | The Swamp | The Mire | Never really seen: a wake, bubbles, two eyes. It follows smell (fish and chum in your bag, your blood) and splashes. It cannot leave the water. Throw it a fish. |
| 6 | The Deep | The Angler | A warm, swaying light in the dark that looks like every safe lantern you have stood under. It drifts toward flashlights. Cast down into the trench. |
| 7 | Hollow Lake, again | The Fisherman and the Watcher (who looks like you) | Where it began. The tent, the alarm clock on the stump, a rowboat in the middle of the lake. |

Each night has its own weather timeline (fog, rain, storms, blizzards, snow falling upward, a flat silent sea, an aurora), its own fish, its own dream events and its own story pieces.

## Systems

- **Fishing** (`src/fishing/`): cast power and direction, bait choice, line depth, a float that nibbles before it bites, a timed hook-set, then a real fight — tension vs. line strength, line paying out when the fish runs, the fish's pull direction (counter it with the mouse), stamina, snapped lines, thrown hooks, toothy fish that fray the line, and things on the other end that pull *you* in until you cut the line. Catches can be kept, released or cut open.
- **What comes out of the water** (`Catalog.js`): ~50 entries. Normal fish per location; fish with human teeth, human eyes, carvings, a fish that whispers your name, one that vanishes when you lift it, one that changes when you turn it over, one that speaks in your own voice; keys and photographs inside fish; relics of the monsters; the alarm clock. Weights shift with hour, depth, bait, location, fear and story progress.
- **The alarm clock**: per-catch chance by hour, adjustable in `src/config.js` (`alarmChanceByHour`) or in Settings. Catching it triggers the lucid state: the water goes still, sound drops out, your own voice tells you you're dreaming, time runs faster and every monster becomes more aggressive.
- **Time** (`src/systems/Time.js`): 12–6 AM, each hour a phase with scripted escalation. A checkpoint at 3 AM.
- **Survival**: health, stamina, breath-holding while hidden, flashlight battery, limited inventory (relics compete with bait for slots).
- **Fear** (`Hallucinations` in `DreamEvents.js`): darkness and nearby threats raise fear. High fear changes what you see and hear — trees sway, shadow figures stand at the edge of vision, faces form in the water, footsteps and whispers come from behind, hearing muffles. Most of it is harmless.
- **Dream logic** (`DreamDirector`): the moon jumps across the sky when you look away, a distant light goes out when you turn away, your own silhouette stands on the far shore, objects appear behind you, a phantom rowboat drifts and vanishes, the water reflects a child standing next to you who is not there, footsteps echo yours, the world goes silent, a door frame on the sea floor leads somewhere different every time, a man in a yellow coat is at the end of every pier at once and says the same sentence the same way.
- **Stealth**: cabins, closets, tents, the car, containers, boat wheelhouses, under beds. Monsters that saw you hide will search; holding your breath helps.
- **Sound** (`src/engine/Audio.js`): fully synthesized, positional (HRTF). Wind, water, waves, rain, crickets (which stop when something is close), ice singing, creaks, bumps under the hull, growls, clicking, whispers, the alarm bell, a recurring music-box lullaby. Long stretches have no music at all. Optional speech synthesis for voices.
- **Graphics**: planar-reflection water with ripples, moon glitter and flashlight speculars (plus a reflection-only layer the dream uses), Gerstner-style ocean swell shared with the boat physics, procedural sky with moving moon, eclipse and aurora, dynamic shadows from the moon and flashlight, fog, rain/snow particles, a post-processing pass for grain, vignette, fear distortion, damage and the lucid warp.
- **Real world** (`src/levels/RealWorld.js`): a house to explore between nights — bedroom, the brass clock that should not be there, phone, computer, fridge, bathroom mirror, garage workbench (choose one upgrade each day). It changes: the clock stops at 4:17, a photograph from a dream appears and turns out to be real, water drips from the ceiling onto a dry floor, the hallway gets longer, the phone repeats something said in a nightmare, the house floods.
- **Death** usually isn't "YOU DIED": it's a monster-specific sequence, then the alarm, then you are back at the beginning of the night (or at 3 AM).
- **Saving**: automatic between nights; settings and endings are stored separately.
- **Replay**: Night Select and **Nightmare Mode** (randomized catch tables, alarm odds and weather, harder monsters, and a rare encounter that never happens on a first playthrough) unlock after any ending.

## Endings (spoilers)

<details>
<summary>Six endings</summary>

Everything turns on the final night's alarm clock, on how many of the **seven memories** you recovered (one per night, from exploring or from fishing), and on how many monster **relics** you chose to carry instead of bait.

- **The Truth** — let it ring, with all 7 memories.
- **Wake Up** — let it ring, with 4–6 memories.
- **False Awakening** — let it ring, with fewer than 4.
- **Trapped** — turn it off (at the tent at 4:00, or when the clock rings in your hands), or never catch it.
- **Become the Monster** — carry 5 or more relics into the last night and put on the waders.
- **The Other Shore** (secret) — recover the ribbon, answer "Not yet," and walk out across the still lake to the rowboat.

</details>

## Project layout

```
src/
  main.js            game state machine: menu, nights, days, deaths, lucidity, endings, cinematics
  config.js          tunables (night length, alarm odds per hour, quality presets)
  engine/            renderer post-processing, input, procedural audio
  world/             Level base (collision, platforms, hide spots, lights), terrain, water, sky, weather, props
  player/            first-person controller, viewmodel (hands, rod, flashlight)
  fishing/           fishing system, catch catalog, procedural catch models
  monsters/          monster base (sight/hearing/light/memory), one file per monster family
  systems/           time, noise, inventory, boat, save, dream director & hallucinations
  levels/            the seven nights + the real-world house
  story/             narrative text, story state, ending scenes
  ui/                HUD, menus, inventory, journal, documents
```

### Debug URL parameters

- `?night=N` start night N directly (`&fast` skips the intro cinematic)
- `?day=N` start the morning after night N
- `?ending=truth|wake|false|trapped|monster|boat` play an ending
- `window.__game` exposes the game; `__game.simulate(seconds)` advances the simulation without rendering

## Limitations

This is a complete, playable game, but it is built entirely from code: characters, monsters and props are stylized procedural geometry rather than authored, high-detail models, and there is no recorded audio or voice acting (voices use the browser's speech synthesis if enabled). Darkness, fog, sound and timing carry most of the horror. Performance depends on the GPU; lower the graphics setting if needed.
