import { CONFIG } from '../config.js';

// All narrative text lives here. N() is the player's chosen name.
export const N = () => CONFIG.playerName || 'Sam';

export const MEMORIES = {
  three_on_dock: {
    night: 1, title: 'Photograph: Three on the Dock',
    text: () => `A man in a wide-brimmed fishing hat, a teenager, and a small girl with a yellow ribbon in her hair, standing on the Hollow Lake dock. Someone has scratched the man's face out with something sharp.\n\nOn the back, in pencil: "Walt, ${N()} & Mara — opening day."\n\nYou don't remember this photo being taken. You remember the hat.`,
  },
  mitten: {
    night: 2, title: "Mara's Mitten",
    text: () => `A child's red mitten, frozen stiff as a board. The name tag your mother sewed into the cuff is still legible: MARA.\n\nThey suspended the search when the lake froze. Dad didn't. He drilled holes in the ice every night until February, and lowered a lantern into each one.`,
  },
  wake_us_at_4: {
    night: 3, title: 'Photograph: The Campsite',
    text: () => `The tent on the north shore. A brass alarm clock sitting on a tree stump, set to 4:00. Along the white border, in your father's handwriting:\n\n"${N()}'s job: wake us at 4."\n\nYou were seventeen. It was one job.`,
  },
  clipping: {
    night: 4, title: 'Newspaper Clipping — Pell\'s Landing Courier',
    text: () => `GIRL, 9, MISSING AT HOLLOW LAKE\n\nMara Pell, 9, was last seen near her family's campsite on the north shore at approximately 4 a.m. Saturday. Her older sibling, 17, who had been asked to wake the family before dawn, told deputies they had fallen back asleep.\n\nA rowboat belonging to the family was recovered drifting mid-lake. It was empty. A child's fishing rod was found inside.\n\nVolunteers continue to search. Her father, Walter Pell, has asked that anyone with a boat come to the north landing.`,
  },
  tape: {
    night: 5, title: "Dad's Tape",
    text: () => `[click] [wind] [oars]\n\n"...three a.m. again. I keep coming out here. I know she's not— I know.\n\n${N()} won't look at me. Won't eat. Sits by that damn clock like it's going to say something.\n\nI should've said it the first night. It wasn't the alarm, kid. It was my lake. My idea. My boat, that I didn't tie off right. Nine years old and I taught her to row and I didn't tie the boat.\n\nIf you ever find this — I'm sorry I let you carry it. Put it down. Please. Put it—"\n\n[click]`,
  },
  watch: {
    night: 6, title: "Mara's Watch",
    text: () => `Pink plastic, cracked face. A cartoon fish on the dial. The hands stopped at 4:17.\n\nSeventeen minutes after the alarm.\n\nSeventeen minutes after you reached over in the dark, found the brass bells by feel, and pressed them quiet.`,
  },
  ribbon: {
    night: 7, title: 'The Yellow Ribbon',
    text: () => `She wore it so Dad could find her in a crowd. You tied it for her that night because she couldn't do bows yet.\n\nShe was going to catch the big one before anyone woke up. She was going to bring it back to the tent and wake you up with it, and you were going to say "no way," and she was going to laugh.\n\nShe tried to wake you. You remember now. "${N()}. ${N()}, it's four. Come on." And you said, "five more minutes."`,
  },
};
export const MEMORY_ORDER = ['three_on_dock', 'mitten', 'wake_us_at_4', 'clipping', 'tape', 'watch', 'ribbon'];

export const RELIC_LINES = {
  relic_hat: 'You put the hat in your bag. For a second, the forest goes quiet, like it is listening for its owner.',
  relic_tooth: 'Under the ice, something stops moving.',
  relic_scale: 'The sea goes flat for one breath, and you see your bedroom in the black of the scale.',
  relic_tag: 'Somewhere in the fog, something sniffs, and clicks, and turns toward you.',
  relic_eye: 'The eye turns in your hand to look at the water.',
  relic_bulb: 'The lure hums. You know the tune.',
};

export const NIGHT_INTROS = [
  null,
  { title: 'Night One', sub: 'Hollow Lake', lines: () => ['Hollow Lake.', "You haven't been here in fourteen years.", "You aren't sure why you came back.", 'But the fish are biting.'] },
  { title: 'Night Two', sub: 'The Frozen Lake', lines: () => ['You were in bed. You are sure you were in bed.', 'Now the lake is frozen solid, and the auger is already in your hands.', 'The ice groans like something is turning over in its sleep.'] },
  { title: 'Night Three', sub: 'The Open Sea', lines: () => ['No land. No lights. A boat that smells like your father\'s.', 'The water goes down forever here.', 'Keep the engine quiet. Keep the lights low.'] },
  { title: 'Night Four', sub: 'The Abandoned Harbor', lines: () => ['A harbor you have never seen, and know by heart.', 'Something in the fog is clicking.', 'They cannot see you. They can hear everything.'] },
  { title: 'Night Five', sub: 'The Swamp', lines: () => ['The water is warm here. It should not be warm.', 'Stay on the boards. Do not carry what bleeds.', 'It can smell what you\'ve caught.'] },
  { title: 'Night Six', sub: 'The Deep', lines: () => ['You are standing on the bottom of the sea.', 'You should not be able to breathe. You are not breathing.', 'Something down here has a light, and it is very patient.'] },
  { title: 'The Last Night', sub: 'Hollow Lake', lines: () => ['Hollow Lake.', 'It is the night of the fourteenth.', 'The tent is exactly where you left it.'] },
];

// Lines for the car radio on Night 1 — conversations that haven't happened yet.
export const RADIO_FUTURE = () => [
  `...${N()}? Can you hear me? It's Dr. Okafor. You're at St. Agnes.`,
  'You were in the water a very long time.',
  "Squeeze my hand if you can hear me. ...No? That's alright. We'll try again tomorrow.",
  `Ruth, they can hear you. Talk to them. Tell ${N()} about the lake.`,
];

export const WHISPERS = () => [N(), `${N()}...`, 'wake up', "it's four", 'five more minutes', 'come on', 'look at the water', 'you turned it off', `${N()}, it's four`];

export const DAY_TEXT = {
  1: {
    wake: () => ['6:00 AM.', 'Your own bed. Your own ceiling.', 'Your hands smell like lake water.'],
    clock: 'An old brass wind-up alarm clock. Its alarm hand is set to 4:00. You have no idea how it got here.',
    computer: () => [`From: Mom`, `Subject: please call`, ``, `${N()}, it's almost the 14th again. I know you don't want to talk about it. I just want to hear your voice.`, ``, `Also Dr. Okafor's office called. They said you missed Thursday.`, `Love, Mom`],
    phone: 'No new messages. The battery is at 4%.',
  },
  2: {
    wake: () => ['6:00 AM.', 'You fell asleep fishing. No. You fell asleep in bed.', 'There is frost on the inside of the window.'],
    clock: 'The brass clock reads 4:17. You wind it. You set it. It reads 4:17.',
    computer: () => ['FORECAST — HOLLOW LAKE AREA', '', 'Tonight: Clear and cold. First hard freeze of the season.', 'Ice will NOT be safe for weeks. Stay off the lake.', '', '(Why did you search for Hollow Lake?)'],
    phone: 'One missed call. No number. The voicemail is eight seconds of water.',
  },
  3: {
    wake: () => ['6:00 AM.', 'Your fingertips are numb.', 'Something is pinned to the refrigerator that was not there yesterday.'],
    clock: 'Still 4:17. The glass is fogged from the inside.',
    computer: () => ['Search history:', '', '  hollow lake drowning', '  hollow lake 2011', '  can you hear people when you are in a coma', '  can you dream in a coma', '', 'You did not type these.'],
    phone: 'A text from Mom: "I\'m going to sit with you today. I\'ll bring the radio."',
    fridge: 'A photograph of a frozen lake at night. A single figure stands on the ice beside an auger. The figure is wearing your coat.',
  },
  4: {
    wake: () => ['6:00 AM.', 'You can hear water. Dripping.', 'Inside the house.'],
    clock: 'Still 4:17. There is lake weed caught under the bells.',
    computer: () => ['PELL\'S LANDING COURIER — ARCHIVE', '', '"SEARCH SUSPENDED AS HOLLOW LAKE FREEZES"', '', 'Photo: A volunteer on the north-shore ice, January.', '', 'It is the same photograph that is on your refrigerator.', 'The volunteer\'s face is turned away. The coat is the same.', 'The photograph was taken fourteen years ago.'],
    phone: 'Battery 4%. Always 4%.',
  },
  5: {
    wake: () => ['6:00 AM.', 'The hallway was not this long.', 'The phone is ringing.'],
    clock: 'The brass clock is ticking. The hands are not moving.',
    computer: () => ['The screen is black. Your reflection is lying down.'],
    call: () => [`...${N()}? It's Dr. Okafor. Can you hear me?`, `You keep saying something in your sleep. "They're always biting tonight." Twice now.`, `Your mother says your father used to say that.`, `You were in the water a long time, ${N()}. You need to decide to come back. We can't decide it for you.`],
    phone: 'The call log is empty.',
  },
  6: {
    wake: () => ['6:00 AM.', 'The floor is wet. The floor is under water.', 'You can hear a heart monitor through the walls.'],
    clock: 'The brass clock is gone. There is a dry circle where it stood.',
    computer: () => ['SQUEEZE MY HAND IF YOU CAN HEAR ME', 'SQUEEZE MY HAND IF YOU CAN HEAR ME', 'SQUEEZE MY HAND IF YOU CAN HEAR ME'],
    phone: 'Mom: "They say there was a change in your brain activity at 4:17 this morning. Please. Please."',
  },
};

export const UPGRADES = {
  rod: { name: 'Graphite Rod', desc: 'Casts farther. Flexes instead of breaking: +15% line strength.' },
  reel: { name: 'Smooth-Drag Reel', desc: 'Reels 30% faster, with less tension spike.' },
  line: { name: 'Braided Line', desc: '+20% line strength. Resists teeth.' },
  vest: { name: 'Tackle Vest', desc: '+2 inventory slots.' },
  torch: { name: 'LED Flashlight', desc: 'Brighter, wider beam. Batteries last 50% longer.' },
  bait: { name: 'Bait Cooler', desc: 'Start every night with extra bait.' },
  kit: { name: 'First-Aid Kit', desc: 'Start every night with medicine. +20 max health.' },
  boots: { name: 'Wading Boots', desc: 'Your steps are quieter in water, on snow and on ice.' },
  auger: { name: 'Sharpened Auger', desc: 'Drill through ice in two seconds instead of three.' },
  boat: { name: 'Engine Tune-up Kit', desc: 'A stalled outboard restarts far more reliably.' },
};

export const ENDINGS = {
  truth: { title: 'Ending: The Truth', sub: 'You let it ring.' },
  wake: { title: 'Ending: Wake Up', sub: 'You let it ring. Some of it stayed in the water.' },
  false: { title: 'Ending: False Awakening', sub: 'You woke up too early.' },
  trapped: { title: 'Ending: Trapped', sub: 'Five more minutes.' },
  monster: { title: 'Ending: Become the Monster', sub: 'Someone has to keep looking.' },
  boat: { title: 'Secret Ending: The Other Shore', sub: 'You walked out on the water.' },
};
