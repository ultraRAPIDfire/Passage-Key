// Procedural, effectively non-repeating content generation.
//
// Rather than cycling a fixed list, every request is assembled from pools and
// templates. Words mode can also compound/affix roots, sentences are built from
// grammar templates, and code snippets are generated from statement shapes.

const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const chance = (p) => Math.random() < p;

// ---------- vocabulary pools ----------

const NOUNS_SHORT = [
  'key', 'door', 'path', 'echo', 'rune', 'moon', 'star', 'wind', 'fire', 'ice',
  'sand', 'leaf', 'bone', 'wolf', 'crow', 'gate', 'ship', 'sword', 'ash', 'dusk',
  'dawn', 'mist', 'lake', 'peak', 'root', 'seed', 'wave', 'rock', 'gem', 'orb',
  'tide', 'ember', 'frost', 'storm', 'cave', 'tomb', 'mask', 'ring', 'coin', 'map',
];

const NOUNS_MID = [
  'shadow', 'signal', 'engine', 'mirror', 'castle', 'silver', 'thunder', 'crystal',
  'phantom', 'horizon', 'whisper', 'fragment', 'cipher', 'nebula', 'passage',
  'gateway', 'anchor', 'beacon', 'compass', 'harbor', 'lantern', 'summit', 'temple',
  'cavern', 'glacier', 'meadow', 'canyon', 'thicket', 'citadel', 'banner', 'relic',
  'oracle', 'raven', 'serpent', 'griffin', 'reaper', 'warden', 'seeker', 'drifter',
  'archive', 'furnace', 'lattice', 'monolith', 'obelisk', 'pilgrim', 'quarry',
];

const NOUNS_LONG = [
  'labyrinth', 'obsidian', 'cathedral', 'wilderness', 'revelation', 'constellation',
  'metamorphosis', 'incantation', 'sanctuary', 'expedition', 'threshold',
  'catastrophe', 'luminescence', 'apparition', 'benediction', 'convergence',
  'equilibrium', 'foundation', 'inheritance', 'juxtaposition', 'kaleidoscope',
  'labyrinthine', 'monumental', 'necromancer', 'observatory', 'perseverance',
];

const ADJECTIVES = [
  'ancient', 'broken', 'silent', 'burning', 'frozen', 'hollow', 'golden', 'crimson',
  'restless', 'endless', 'hidden', 'sacred', 'bitter', 'gentle', 'savage', 'weary',
  'radiant', 'shattered', 'forgotten', 'wandering', 'trembling', 'gleaming',
  'sunken', 'twisted', 'fading', 'roaring', 'quiet', 'brittle', 'vivid', 'sullen',
];

const VERBS = [
  'guards', 'breaks', 'echoes', 'burns', 'freezes', 'wakes', 'falls', 'rises',
  'hunts', 'seeks', 'binds', 'shatters', 'whispers', 'drifts', 'crawls', 'strikes',
  'carries', 'buries', 'summons', 'devours', 'mends', 'scatters', 'circles',
];

const ADVERBS = [
  'slowly', 'softly', 'fiercely', 'quietly', 'sharply', 'endlessly', 'bravely',
  'quickly', 'blindly', 'boldly', 'gently', 'wildly', 'calmly', 'grimly',
];

const PREPS = ['beneath', 'beyond', 'across', 'within', 'against', 'beside', 'toward', 'under'];

const PREFIXES = ['un', 're', 'over', 'under', 'out', 'fore', 'mis'];
const SUFFIXES = ['ing', 'ed', 'er', 'ness', 'less', 'ful', 'ish', 'able'];

const COMPOUND_A = ['moon', 'sun', 'star', 'night', 'storm', 'fire', 'frost', 'stone', 'iron', 'blood', 'shadow', 'dream', 'wind', 'sky', 'sea'];
const COMPOUND_B = ['light', 'fall', 'wood', 'break', 'watch', 'blade', 'song', 'ward', 'bane', 'weaver', 'keeper', 'runner', 'forge', 'storm', 'veil'];

// ---------- helpers ----------

function affix(root) {
  if (chance(0.5)) {
    const p = rand(PREFIXES);
    return p + root;
  }
  const s = rand(SUFFIXES);
  // crude but readable morphology: drop a trailing 'e' before vowel-initial suffixes
  if (/e$/.test(root) && /^[aeiou]/.test(s)) return root.slice(0, -1) + s;
  return root + s;
}

function compound() {
  return rand(COMPOUND_A) + rand(COMPOUND_B);
}

// ---------- words mode ----------

// `difficulty` 0..1 biases toward longer, more complex tokens.
export function generateWord(difficulty = 0) {
  const roll = Math.random();

  if (roll < 0.18) return compound();
  if (roll < 0.30) return affix(rand([...NOUNS_SHORT, ...NOUNS_MID]));

  if (difficulty < 0.33) {
    return chance(0.65) ? rand(NOUNS_SHORT) : rand(NOUNS_MID);
  }
  if (difficulty < 0.66) {
    return chance(0.55) ? rand(NOUNS_MID) : rand([...NOUNS_SHORT, ...NOUNS_LONG]);
  }
  return chance(0.5) ? rand(NOUNS_LONG) : rand(NOUNS_MID);
}

// ---------- sentences mode ----------

const SENTENCE_TEMPLATES = [
  () => `the ${rand(ADJECTIVES)} ${rand(NOUNS_MID)} ${rand(VERBS)} ${rand(ADVERBS)}`,
  () => `${rand(ADJECTIVES)} ${rand(NOUNS_SHORT)} ${rand(VERBS)} the ${rand(NOUNS_MID)}`,
  () => `${rand(PREPS)} the ${rand(ADJECTIVES)} ${rand(NOUNS_MID)}`,
  () => `the ${rand(NOUNS_MID)} of ${rand(ADJECTIVES)} ${rand(NOUNS_SHORT)}`,
  () => `${rand(ADVERBS)} the ${rand(NOUNS_SHORT)} ${rand(VERBS)}`,
  () => `a ${rand(ADJECTIVES)} ${rand(NOUNS_SHORT)} ${rand(VERBS)} ${rand(PREPS)} the ${rand(NOUNS_MID)}`,
  () => `${rand(NOUNS_MID)} and ${rand(NOUNS_MID)} ${rand(VERBS)} ${rand(ADVERBS)}`,
  () => `never ${rand(VERBS).replace(/s$/, '')} the ${rand(ADJECTIVES)} ${rand(NOUNS_MID)}`,
  () => `they ${rand(VERBS).replace(/s$/, '')} ${rand(PREPS)} ${rand(ADJECTIVES)} ${rand(NOUNS_SHORT)}`,
];

// Kept deliberately bounded: anything much longer than this cannot fit on
// screen at the pixel font size, so difficulty adds density, not runaway length.
const MAX_SENTENCE_CHARS = 42;

export function generateSentence(difficulty = 0) {
  const base = rand(SENTENCE_TEMPLATES)();
  if (difficulty > 0.6 && chance(0.25)) {
    const chained = `${base} and ${rand(SENTENCE_TEMPLATES)()}`;
    if (chained.length <= MAX_SENTENCE_CHARS) return chained;
  }
  return base;
}

// ---------- programming mode ----------

const VAR_NAMES = ['count', 'index', 'value', 'result', 'buffer', 'node', 'items', 'total', 'flag', 'data', 'token', 'cache', 'entry', 'score', 'delta', 'state'];
const FN_NAMES = ['render', 'update', 'parse', 'resolve', 'compute', 'handle', 'fetchAll', 'connect', 'reduce', 'flatten', 'serialize', 'validate'];
const TYPES = ['string', 'number', 'boolean', 'object', 'array'];
const METHODS = ['map', 'filter', 'reduce', 'forEach', 'find', 'some', 'every', 'sort', 'slice', 'concat'];

const CODE_TEMPLATES = [
  () => `const ${rand(VAR_NAMES)} = ${Math.floor(Math.random() * 100)};`,
  () => `let ${rand(VAR_NAMES)} = "${rand(NOUNS_SHORT)}";`,
  () => `function ${rand(FN_NAMES)}() {`,
  () => `return ${rand(VAR_NAMES)};`,
  () => `if (${rand(VAR_NAMES)} === ${Math.floor(Math.random() * 10)}) {`,
  () => `for (let i = 0; i < ${rand(VAR_NAMES)}; i++) {`,
  () => `${rand(VAR_NAMES)}.${rand(METHODS)}()`,
  () => `while (${rand(VAR_NAMES)} > 0) {`,
  () => `console.log(${rand(VAR_NAMES)});`,
  () => `await ${rand(FN_NAMES)}();`,
  () => `export const ${rand(VAR_NAMES)} = []`,
  () => `import { ${rand(FN_NAMES)} } from "./${rand(NOUNS_SHORT)}"`,
  () => `${rand(VAR_NAMES)} = ${rand(VAR_NAMES)} + ${Math.floor(Math.random() * 20)};`,
  () => `class ${rand(NOUNS_SHORT).replace(/^./, c => c.toUpperCase())} {`,
  () => `try { ${rand(FN_NAMES)}() }`,
  () => `typeof ${rand(VAR_NAMES)} === "${rand(TYPES)}"`,
  () => `${rand(VAR_NAMES)}?.${rand(VAR_NAMES)} ?? null`,
  () => `const [${rand(VAR_NAMES)}, set] = useState()`,
];

export function generateCode(difficulty = 0) {
  const simple = CODE_TEMPLATES.slice(0, 9);
  const pool = difficulty < 0.4 ? simple : CODE_TEMPLATES;
  return rand(pool)();
}

// ---------- unified entry ----------

export function generateText(mode, difficulty = 0) {
  switch (mode) {
    case 'programming': return generateCode(difficulty);
    case 'sentences': return generateSentence(difficulty);
    default: return generateWord(difficulty);
  }
}

// Boss attacks are always sentence-shaped and scale with the boss tier.
export function generateBossPhrase(tier = 1) {
  const difficulty = Math.min(1, 0.3 + tier * 0.2);
  return generateSentence(difficulty);
}

// Attack payloads sent to opponents in versus modes.
export function generateAttackWord(mode, difficulty = 0) {
  return generateText(mode, difficulty);
}
