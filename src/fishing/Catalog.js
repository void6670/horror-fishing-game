import { N } from '../story/Text.js';

// Everything that can bite. Weights are relative; the Fishing system adjusts them by hour, depth, bait,
// spot, fear and story progress. "Some aren't actually fish."
//
// fight.b behaviours: steady | darter | thrasher | diver | dead | heavy | grabber
const B = (o) => ({ worm: 1, minnow: 1, lure: 1, chum: 1, memento: 0.6, none: 0.02, ...o });

export const CATALOG = [
  // ---------------- Night 1: Forest Lake ----------------
  { id: 'perch', name: 'Yellow Perch', kind: 'fish', nights: [1, 7], hours: [0, 6], depth: [0, 8], w: 10, baits: B({ worm: 2, lure: 0.3 }), fight: { b: 'steady', str: 0.3, sta: 4 }, kg: [0.15, 0.5],
    model: { type: 'fish', len: 0.25, color: '#7a8a30', pattern: 'bars', belly: '#e8d890' }, desc: 'Green-gold with dark bars. A perfectly ordinary fish. You forgot how good this feels.' },
  { id: 'bass', name: 'Largemouth Bass', kind: 'fish', nights: [1, 7], hours: [0, 6], depth: [1, 10], w: 7, baits: B({ minnow: 2.5, lure: 1.5 }), fight: { b: 'darter', str: 0.55, sta: 7 }, kg: [0.8, 3.2],
    model: { type: 'fish', len: 0.42, color: '#4a5a2a', pattern: 'mottled', belly: '#d8d8b0', fat: 0.32 }, desc: 'A fat, angry bass. It fought like it had somewhere to be.' },
  { id: 'trout', name: 'Rainbow Trout', kind: 'fish', nights: [1], hours: [0, 6], depth: [0, 6], w: 6, baits: B({ worm: 1.5, lure: 1.2 }), fight: { b: 'darter', str: 0.45, sta: 6 }, kg: [0.4, 1.8],
    model: { type: 'fish', len: 0.38, color: '#6a7a6a', pattern: 'stripe', belly: '#e0e0d8' }, desc: 'Pink stripe down its flank. Cold and clean. It smells like the lake used to.' },
  { id: 'catfish', name: 'Channel Catfish', kind: 'fish', nights: [1, 4, 5], hours: [1, 6], depth: [4, 99], w: 5, baits: B({ chum: 3, worm: 1.2 }), fight: { b: 'diver', str: 0.7, sta: 10 }, kg: [2, 9],
    model: { type: 'fish', len: 0.6, color: '#4a4a48', pattern: 'spots', belly: '#c8c0b0', fat: 0.25 }, desc: 'Whiskered, heavy, from the cold bottom. It stares at you with an eye like a drop of oil.' },
  { id: 'pike', name: 'Northern Pike', kind: 'fish', nights: [1], hours: [1, 6], depth: [1, 12], w: 4, baits: B({ minnow: 3, lure: 2 }), fight: { b: 'thrasher', str: 0.75, sta: 9, teeth: true }, kg: [2, 8],
    model: { type: 'fish', len: 0.75, color: '#3a4a2a', pattern: 'spots', belly: '#e0e0c0', fat: 0.18, teeth: 'fangs' }, desc: 'A long green torpedo full of teeth. It frayed your line.' },
  { id: 'bloated_pike', name: 'Bloated Pike', kind: 'fish', nights: [1], hours: [1, 6], depth: [2, 99], w: 0, story: true, once: 'game', baits: B({ minnow: 2 }), fight: { b: 'thrasher', str: 0.6, sta: 7 }, kg: [5, 6],
    model: { type: 'fish', len: 0.7, color: '#3a4a2a', pattern: 'spots', belly: '#e8e0d0', fat: 0.32, teeth: 'fangs' },
    desc: 'Its belly is swollen hard and square, like it swallowed a box. Something inside clinks when you move it. [C] to cut it open.', contents: 'key_boathouse' },
  // ---------------- Night 2: Frozen Lake ----------------
  { id: 'whitefish', name: 'Lake Whitefish', kind: 'fish', nights: [2], hours: [0, 6], depth: [2, 20], w: 10, baits: B({ worm: 1.5 }), fight: { b: 'steady', str: 0.35, sta: 5 }, kg: [0.5, 2], model: { type: 'fish', len: 0.38, color: '#8a9098', belly: '#f0f0f0' }, desc: 'Silver and cold enough to hurt your hands.' },
  { id: 'burbot', name: 'Burbot', kind: 'fish', nights: [2], hours: [1, 6], depth: [6, 99], w: 6, baits: B({ chum: 2, minnow: 1.5 }), fight: { b: 'diver', str: 0.55, sta: 8 }, kg: [1, 4], model: { type: 'fish', len: 0.6, color: '#4a4a30', pattern: 'mottled', fat: 0.17, belly: '#a8a080' }, desc: 'Eel-bodied, slimy, mottled like a bruise. It wrapped itself around your wrist.' },
  { id: 'char', name: 'Arctic Char', kind: 'fish', nights: [2], hours: [0, 6], depth: [4, 30], w: 6, baits: B({ lure: 2 }), fight: { b: 'darter', str: 0.5, sta: 6 }, kg: [1, 3], model: { type: 'fish', len: 0.45, color: '#5a6a7a', pattern: 'spots', belly: '#e07040' }, desc: 'A belly the color of a campfire. It is the warmest thing out here.' },
  { id: 'laketrout', name: 'Lake Trout', kind: 'fish', nights: [2], hours: [2, 6], depth: [10, 99], w: 3, baits: B({ minnow: 2 }), fight: { b: 'diver', str: 0.8, sta: 12 }, kg: [4, 12], model: { type: 'fish', len: 0.8, color: '#4a5a5a', pattern: 'spots', belly: '#d8d8d0', fat: 0.24 }, desc: 'A huge, old trout from very deep. Its back is scarred with long parallel lines, like claw marks.' },
  { id: 'mitten', name: 'Red Mitten', kind: 'story', nights: [2], hours: [2, 6], depth: [0, 99], w: 0, story: true, once: 'game', memory: 'mitten', baits: B({ none: 1, memento: 3 }), fight: { b: 'dead', str: 0.2, sta: 1 }, kg: [0.1, 0.1], model: { type: 'item', item: 'mitten' },
    desc: 'A child\'s red mitten, frozen stiff. You know whose it is before you read the tag.' },
  { id: 'frozen_key', name: 'Frozen Key', kind: 'junk', nights: [2], hours: [1, 6], depth: [0, 99], w: 0, story: true, once: 'game', item: 'key_cabin2', baits: B({ none: 2 }), fight: { b: 'dead', str: 0.2, sta: 1 }, kg: [0.05, 0.05], model: { type: 'item', item: 'key' },
    desc: 'A key frozen inside a fist-sized lump of ice. The tag reads PELL CABIN. Somebody wanted you to find this.' },
  { id: 'office_key', name: 'Harbormaster Key', kind: 'junk', nights: [4], hours: [1, 6], depth: [0, 99], w: 0, story: true, once: 'game', item: 'key_office', baits: B({ none: 2 }), fight: { b: 'dead', str: 0.2, sta: 1 }, kg: [0.05, 0.05], model: { type: 'item', item: 'key' },
    desc: 'A heavy brass key on a cork float. Stamped: OFFICE — DO NOT REMOVE.' },
  // ---------------- Night 3: Open Sea ----------------
  { id: 'mackerel', name: 'Atlantic Mackerel', kind: 'fish', nights: [3], hours: [0, 6], depth: [0, 15], w: 10, baits: B({ lure: 2, minnow: 1.5 }), fight: { b: 'darter', str: 0.4, sta: 5 }, kg: [0.3, 1], model: { type: 'fish', len: 0.35, color: '#2a5a6a', pattern: 'bars', belly: '#e0e8e8', fat: 0.2 }, desc: 'Tiger-striped, iridescent. They come up in the dark like coins.' },
  { id: 'cod', name: 'Atlantic Cod', kind: 'fish', nights: [3], hours: [0, 6], depth: [8, 60], w: 7, baits: B({ worm: 1.5, chum: 1.5 }), fight: { b: 'steady', str: 0.55, sta: 8 }, kg: [2, 8], model: { type: 'fish', len: 0.6, color: '#6a6a4a', pattern: 'spots', belly: '#e8e0d0', fat: 0.26 }, desc: 'Heavy and dull-eyed.' },
  { id: 'hagfish', name: 'Hagfish', kind: 'fish', nights: [3, 6], hours: [1, 6], depth: [20, 999], w: 4, baits: B({ chum: 3 }), fight: { b: 'steady', str: 0.35, sta: 5 }, kg: [0.3, 1], model: { type: 'fish', len: 0.5, color: '#9a7a7a', eel: true, eyes: 'none', belly: '#9a7a7a' }, desc: 'It has no eyes. It has no jaw. It filled your hands with slime and it is still producing more.' },
  { id: 'monkfish', name: 'Monkfish', kind: 'fish', nights: [3], hours: [2, 6], depth: [30, 999], w: 3, baits: B({ chum: 2 }), fight: { b: 'heavy', str: 0.7, sta: 9 }, kg: [5, 20], model: { type: 'fish', len: 0.7, color: '#4a3a30', pattern: 'mottled', fat: 0.5, teeth: 'fangs', belly: '#6a5a4a' }, desc: 'Mostly mouth. It looks like something that should only exist in the dark. It is.' },
  { id: 'photo_fish', name: 'Cod With a Square Belly', kind: 'fish', nights: [3], hours: [1, 6], depth: [5, 999], w: 0, story: true, once: 'game', baits: B({}), fight: { b: 'steady', str: 0.5, sta: 7 }, kg: [4, 5],
    model: { type: 'fish', len: 0.6, color: '#6a6a4a', pattern: 'spots', belly: '#e8e0d0', fat: 0.3 }, desc: 'There is a hard, flat rectangle pressing against the inside of its stomach. [C] to cut it open.', contents: 'memory:wake_us_at_4' },
  // ---------------- Night 4: Harbor ----------------
  { id: 'eel', name: 'American Eel', kind: 'fish', nights: [4, 5], hours: [0, 6], depth: [1, 20], w: 9, baits: B({ worm: 2, chum: 1.5 }), fight: { b: 'thrasher', str: 0.45, sta: 7 }, kg: [0.5, 2], model: { type: 'fish', len: 0.7, color: '#3a3a20', eel: true, belly: '#a8a060' }, desc: 'It ties itself in knots on the dock. It does not seem to want to die.' },
  { id: 'flounder', name: 'Winter Flounder', kind: 'fish', nights: [4], hours: [0, 6], depth: [2, 20], w: 8, baits: B({ worm: 1.5 }), fight: { b: 'dead', str: 0.4, sta: 4 }, kg: [0.5, 2], model: { type: 'fish', len: 0.38, color: '#5a4a3a', pattern: 'mottled', fat: 0.7, eyesWrong: true }, desc: 'Both eyes on one side of its head. It watched you the whole way up with both of them.' },
  { id: 'mullet', name: 'Harbor Mullet', kind: 'fish', nights: [4], hours: [0, 6], depth: [0, 10], w: 7, baits: B({ worm: 1.5 }), fight: { b: 'darter', str: 0.4, sta: 5 }, kg: [0.4, 1.5], model: { type: 'fish', len: 0.4, color: '#5a6060', belly: '#e0e0e0' }, desc: 'Grey and oily. It tastes of diesel. You don\'t know how you know that.' },
  // ---------------- Night 5: Swamp ----------------
  { id: 'bowfin', name: 'Bowfin', kind: 'fish', nights: [5], hours: [0, 6], depth: [0, 10], w: 8, baits: B({ minnow: 2, worm: 1.2 }), fight: { b: 'thrasher', str: 0.6, sta: 8 }, kg: [1, 4], model: { type: 'fish', len: 0.55, color: '#3a4a2a', pattern: 'mottled', fat: 0.22, belly: '#a0a070' }, desc: 'A living fossil. It gulps air. It is still gulping.' },
  { id: 'gar', name: 'Longnose Gar', kind: 'fish', nights: [5], hours: [0, 6], depth: [0, 10], w: 6, baits: B({ minnow: 2.5 }), fight: { b: 'thrasher', str: 0.65, sta: 8, teeth: true }, kg: [1, 6], model: { type: 'fish', len: 0.9, color: '#5a5a3a', pattern: 'spots', fat: 0.12, teeth: 'fangs' }, desc: 'A needle full of teeth. It grinned at you the entire fight.' },
  { id: 'bullhead', name: 'Brown Bullhead', kind: 'fish', nights: [5], hours: [0, 6], depth: [0, 8], w: 9, baits: B({ worm: 2, chum: 1.5 }), fight: { b: 'steady', str: 0.35, sta: 5 }, kg: [0.3, 1.5], model: { type: 'fish', len: 0.3, color: '#4a3a2a', fat: 0.3 }, desc: 'It croaks when you hold it.' },
  { id: 'snakehead', name: 'Snakehead', kind: 'fish', nights: [5], hours: [2, 6], depth: [0, 10], w: 4, baits: B({ minnow: 3 }), fight: { b: 'thrasher', str: 0.8, sta: 10 }, kg: [2, 7], model: { type: 'fish', len: 0.7, color: '#3a3a2a', pattern: 'mottled', fat: 0.18 }, desc: 'It can walk on land, the old men say. It is looking at the shore.' },
  // ---------------- Night 6: The Deep ----------------
  { id: 'angler_small', name: 'Black Seadevil', kind: 'fish', nights: [6], hours: [0, 6], depth: [0, 999], w: 8, baits: B({ lure: 2 }), fight: { b: 'steady', str: 0.4, sta: 6 }, kg: [0.2, 1], model: { type: 'fish', len: 0.3, color: '#151515', fat: 0.6, teeth: 'fangs', lureBulb: true }, desc: 'A small one. The light on its head is the same color as the light on your bedroom clock.' },
  { id: 'gulper', name: 'Gulper Eel', kind: 'fish', nights: [6], hours: [0, 6], depth: [0, 999], w: 7, baits: B({}), fight: { b: 'thrasher', str: 0.5, sta: 7 }, kg: [0.5, 2], model: { type: 'fish', len: 0.8, color: '#101018', eel: true, glow: '#300818' }, desc: 'A mouth on a whip.' },
  { id: 'glassfish', name: 'Glass Fish', kind: 'horror', nights: [6], hours: [0, 6], depth: [0, 999], w: 5, baits: B({}), fight: { b: 'darter', str: 0.4, sta: 5 }, kg: [0.3, 0.5], model: { type: 'fish', len: 0.4, color: '#a0c0d0', translucent: true, eyes: 'none' },
    desc: () => `Perfectly transparent. Inside it, very small, is a room: a bed, a nightstand, a brass alarm clock, and someone asleep under the covers. You know the shape of that sleeper.` },
  { id: 'watch', name: "Child's Watch", kind: 'story', nights: [6], hours: [1, 6], depth: [0, 999], w: 0, story: true, once: 'game', memory: 'watch', baits: B({ memento: 3, none: 1 }), fight: { b: 'dead', str: 0.2, sta: 1 }, kg: [0.05, 0.05], model: { type: 'item', item: 'watch' },
    desc: 'Pink plastic, cracked. It stopped at 4:17.' },
  // ---------------- Night 7: The Original Lake ----------------
  { id: 'wrong_perch', name: 'Yellow Perch?', kind: 'horror', nights: [7], hours: [0, 6], depth: [0, 99], w: 8, baits: B({}), fight: { b: 'steady', str: 0.3, sta: 4 }, kg: [0.3, 0.3], model: { type: 'fish', len: 0.25, color: '#7a8a30', pattern: 'bars', belly: '#e8d890', eyesWrong: true, teeth: 'human' }, desc: 'The same perch you caught on the first night. Same notch in the fin. It has been waiting.' },
  { id: 'drawn_fish', name: 'The Drawn Fish', kind: 'horror', nights: [7], hours: [1, 6], depth: [0, 99], w: 5, baits: B({ memento: 3 }), fight: { b: 'darter', str: 0.4, sta: 5 }, kg: [1, 1], model: { type: 'fish', len: 0.45, color: '#e07a10', belly: '#f0a040', fat: 0.4 },
    desc: () => `Orange. Lopsided. One black dot for an eye. It is exactly the fish from Mara's crayon drawing, "ME + ${N().toUpperCase()}", come to life and very, very scared.` },
  { id: 'ribbon', name: 'Yellow Ribbon', kind: 'story', nights: [7], hours: [1, 6], depth: [0, 99], w: 0, story: true, once: 'game', memory: 'ribbon', baits: B({ memento: 4, none: 1 }), fight: { b: 'dead', str: 0.15, sta: 1 }, kg: [0.01, 0.01], model: { type: 'item', item: 'ribbon' },
    desc: 'A yellow hair ribbon, still tied in a small, careful bow. You tied that bow.' },

  // ---------------- Horror catches across nights ----------------
  { id: 'teeth_fish', name: 'Perch With Human Teeth', kind: 'horror', nights: [1, 2, 4, 5, 7], hours: [2, 6], depth: [0, 99], w: 3, baits: B({}), fight: { b: 'thrasher', str: 0.45, sta: 5 }, kg: [0.4, 0.6], fear: 0.2,
    model: { type: 'fish', len: 0.3, color: '#7a8a30', pattern: 'bars', belly: '#e8d890', teeth: 'human' }, desc: 'Two neat rows of human teeth. Adult teeth. One of them has a filling.' },
  { id: 'eye_fish', name: 'Fish With Human Eyes', kind: 'horror', nights: [1, 2, 3, 4, 5, 6, 7], hours: [3, 6], depth: [0, 999], w: 2.5, baits: B({}), fight: { b: 'steady', str: 0.4, sta: 5 }, kg: [0.5, 1], fear: 0.25,
    model: { type: 'fish', len: 0.38, color: '#5a6a5a', belly: '#d8d8c8', eyes: 'human' }, desc: 'Its eyes are human. Blue. They blink, wetly, and keep looking at you after it stops breathing.' },
  { id: 'carved_fish', name: 'Carved Fish', kind: 'horror', nights: [2, 3, 4, 5, 6, 7], hours: [2, 6], depth: [0, 999], w: 2.5, baits: B({}), fight: { b: 'steady', str: 0.4, sta: 5 }, kg: [0.6, 1.2], fear: 0.15,
    model: { type: 'fish', len: 0.42, color: '#6a7068', belly: '#d8d8c8', symbols: '4:17' }, desc: 'Someone has carved "4:17" into its side, and a row of little waves underneath, like a child\'s drawing of the sea. The cuts have healed over. They are old.' },
  { id: 'whisper_fish', name: 'Whispering Fish', kind: 'horror', nights: [1, 2, 3, 4, 5, 6, 7], hours: [3, 6], depth: [0, 999], w: 2, baits: B({}), fight: { b: 'darter', str: 0.4, sta: 5 }, kg: [0.4, 0.8], whisper: true,
    model: { type: 'fish', len: 0.35, color: '#5a5a5a', belly: '#c8c8c0' }, desc: () => `Its gills flutter. When you lift it close, you hear it: a tiny, wet voice saying "${N()}... ${N()}... it's four..."` },
  { id: 'vanish_fish', name: '???', kind: 'horror', nights: [1, 2, 3, 4, 5, 6, 7], hours: [2, 6], depth: [0, 999], w: 2, baits: B({}), fight: { b: 'darter', str: 0.5, sta: 6 }, kg: [1, 2], vanish: true,
    model: { type: 'fish', len: 0.45, color: '#6a7a5a', belly: '#e0e0d0' }, desc: 'You feel the weight of it as you lift it off the hook — and then you are holding nothing. The hook is wet and warm.' },
  { id: 'changing_fish', name: 'Rainbow Trout', kind: 'horror', nights: [1, 3, 4, 5, 7], hours: [2, 6], depth: [0, 999], w: 2.5, baits: B({}), fight: { b: 'darter', str: 0.45, sta: 6 }, kg: [0.6, 1.4], changes: true,
    model: { type: 'fish', len: 0.38, color: '#6a7a6a', pattern: 'stripe', belly: '#e0e0d8' }, changedModel: { type: 'fish', len: 0.38, color: '#6a7a6a', pattern: 'stripe', belly: '#e0e0d8', face: true, eyes: 'human' },
    desc: 'A normal trout. Turn it over and look again.', changedDesc: 'There is a face pressed against the inside of its skin, mouth open, as if it is calling for someone. It is a child\'s face.' },
  { id: 'voice_fish', name: 'Fish That Speaks', kind: 'horror', nights: [4, 5, 6, 7], hours: [3, 6], depth: [0, 999], w: 1.5, baits: B({ memento: 3 }), fight: { b: 'steady', str: 0.4, sta: 5 }, kg: [1, 1], speaks: true, fear: 0.3,
    model: { type: 'fish', len: 0.42, color: '#4a5a5a', belly: '#c8c8b8', teeth: 'human' }, desc: () => `It opens its mouth and your own voice comes out of it, very calm: "Five more minutes, Mara. Five more minutes."` },
  { id: 'phone', name: 'Old Flip Phone', kind: 'junk', nights: [4, 5], hours: [1, 6], depth: [0, 999], w: 1.2, once: 'game', baits: B({ none: 2 }), fight: { b: 'dead', str: 0.25, sta: 1 }, kg: [0.1, 0.1], item: 'phone',
    model: { type: 'item', item: 'phone' }, desc: 'Waterlogged. The screen lights up anyway. "1 NEW VOICEMAIL — 4:17 AM".' },
  { id: 'doll', name: 'Doll Head', kind: 'junk', nights: [1, 5, 7], hours: [2, 6], depth: [0, 99], w: 1, baits: B({ none: 2 }), fight: { b: 'dead', str: 0.2, sta: 1 }, kg: [0.1, 0.1], item: 'doll',
    model: { type: 'item', item: 'doll' }, desc: 'A plastic doll head with blonde hair, bleached by water. Its eyes are open. They were closed when it came out of the water.' },
  { id: 'hand', name: 'Drowned Hand', kind: 'grab', nights: [1, 5, 7], hours: [4, 6], depth: [0, 99], w: 1.2, baits: B({ chum: 3 }), fight: { b: 'grabber', str: 1, sta: 99 }, kg: [80, 80],
    model: { type: 'item', item: 'hand' }, desc: 'That is not a fish. Something on the other end is pulling YOU in. [X] cut the line!' },
  { id: 'heavy_thing', name: 'Something Enormous', kind: 'grab', nights: [3], hours: [3, 6], depth: [30, 999], w: 1.5, baits: B({ chum: 3, lure: 2 }), fight: { b: 'grabber', str: 1, sta: 99 }, kg: [9999, 9999],
    model: { type: 'item', item: 'scale' }, desc: 'The line goes straight down and does not stop. The boat tilts toward it. [X] cut the line!' },
  // relics (fished)
  { id: 'relic_hat', name: 'Waterlogged Hat', kind: 'relic', nights: [1], hours: [3, 6], depth: [4, 99], w: 0.6, once: 'game', baits: B({ none: 2 }), fight: { b: 'dead', str: 0.3, sta: 1 }, kg: [0.3, 0.3], item: 'relic_hat', model: { type: 'item', item: 'hat' }, desc: 'A wide-brimmed fishing hat, dripping. W.P. stitched in the band.' },
  { id: 'relic_tooth', name: 'Pale Tooth', kind: 'relic', nights: [2], hours: [3, 6], depth: [10, 99], w: 0.8, once: 'game', baits: B({ chum: 2 }), fight: { b: 'heavy', str: 0.6, sta: 4 }, kg: [0.4, 0.4], item: 'relic_tooth', model: { type: 'item', item: 'tooth' }, desc: 'A tooth as long as your hand, snagged on your hook. Whatever lost it did not notice.' },
  { id: 'relic_scale', name: 'Black Scale', kind: 'relic', nights: [3], hours: [2, 6], depth: [20, 999], w: 0.8, once: 'game', baits: B({}), fight: { b: 'heavy', str: 0.6, sta: 4 }, kg: [1, 1], item: 'relic_scale', model: { type: 'item', item: 'scale' }, desc: 'A scale the size of a dinner plate. In its black mirror you see a bedroom ceiling.' },
  { id: 'relic_tag', name: 'Brass Name Tag', kind: 'relic', nights: [4], hours: [2, 6], depth: [0, 99], w: 0.8, once: 'game', baits: B({ none: 2 }), fight: { b: 'dead', str: 0.2, sta: 1 }, kg: [0.05, 0.05], item: 'relic_tag', model: { type: 'item', item: 'tag' }, desc: 'SEARCH & RESCUE — VOLUNTEER. The name is scratched off.' },
  { id: 'relic_eye', name: 'Clouded Eye', kind: 'relic', nights: [5], hours: [3, 6], depth: [0, 99], w: 0.8, once: 'game', baits: B({ chum: 2 }), fight: { b: 'heavy', str: 0.5, sta: 4 }, kg: [0.3, 0.3], item: 'relic_eye', model: { type: 'item', item: 'eye' }, desc: 'An eye the size of a fist. Cloudy as swamp water. It turns to face the water when you set it down.' },
  { id: 'relic_bulb', name: 'The Lure', kind: 'relic', nights: [6], hours: [3, 6], depth: [0, 999], w: 0.8, once: 'game', baits: B({ lure: 3 }), fight: { b: 'heavy', str: 0.5, sta: 4 }, kg: [0.5, 0.5], item: 'relic_bulb', model: { type: 'item', item: 'bulb' }, desc: 'A glowing bulb of flesh, torn from something enormous. It hums.' },
  // junk
  { id: 'boot', name: 'Old Boot', kind: 'junk', nights: [1, 2, 4, 5, 7], hours: [0, 6], depth: [0, 99], w: 2, baits: B({ none: 5 }), fight: { b: 'dead', str: 0.3, sta: 1 }, kg: [0.8, 0.8], model: { type: 'item', item: 'boot' }, desc: 'A rubber wader boot. Child\'s size.' },
  { id: 'can', name: 'Rusted Can', kind: 'junk', nights: [1, 3, 4, 5], hours: [0, 6], depth: [0, 99], w: 2, baits: B({ none: 5 }), fight: { b: 'dead', str: 0.2, sta: 1 }, kg: [0.2, 0.2], model: { type: 'item', item: 'can' }, desc: 'A rusted can of bait corn. Your father\'s brand.' },
  { id: 'weeds', name: 'Lake Weed', kind: 'junk', nights: [1, 2, 3, 4, 5, 6, 7], hours: [0, 6], depth: [0, 999], w: 2.5, baits: B({ none: 6 }), fight: { b: 'dead', str: 0.25, sta: 1 }, kg: [0.3, 0.3], model: { type: 'item', item: 'weeds' }, desc: 'A tangle of weed. Something is knotted in the middle of it: a long strand of blonde hair.' },
  // the alarm clock — handled specially by the fishing system's hour-based probability
  { id: 'alarm', name: 'The Alarm Clock', kind: 'alarm', nights: [1, 2, 3, 4, 5, 6, 7], hours: [0, 6], depth: [0, 9999], w: 0, baits: B({}), fight: { b: 'heavy', str: 0.85, sta: 10 }, kg: [0.6, 0.6], model: { type: 'clock' },
    desc: 'An old brass wind-up alarm clock. It is still ticking. It shows the exact time.' },
];

export const CATALOG_BY_ID = Object.fromEntries(CATALOG.map((c) => [c.id, c]));

export function catchDesc(entry) { return typeof entry.desc === 'function' ? entry.desc() : entry.desc; }
