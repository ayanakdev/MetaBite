/**
 * Food-name disambiguation.
 *
 * Kept dependency-free and pure so it can be unit tested in isolation (see
 * tests/nameMatch.test.ts) - this is the component that decides whether a
 * database result is the same food the vision model identified, so it needs to
 * be verifiable without a network or a device.
 */

/**
 * Grammatical noise only. Preparation and cut words ("cooked", "grilled",
 * "roasted", "sliced") are deliberately KEPT - they are the strongest
 * discriminators between foods. An earlier version stripped them, which made
 * "white rice" and "rice noodles" score a perfect 1.0 against each other.
 */
const NOISE = new Set([
  "with", "and", "of", "in", "a", "an", "the", "fresh", "organic",
  "serve", "serving", "approx", "about",
]);

/**
 * Coarse categories are not enough: salmon and beef are both "protein" but are
 * different foods, and matching them is how a wrong lookup sneaks into the
 * average. So the decision is made on IDENTITY nouns - the actual food entity.
 * If the model's identity noun is absent from the candidate, it is a different
 * food, no matter how much else overlaps.
 */
const IDENTITY = new Set([
  // grains & starches
  "rice", "pasta", "noodle", "bread", "cereal", "oat", "flour", "quinoa",
  "tortilla", "potato", "sweet", "yam", "couscous", "bagel", "bun", "cake",
  "pie", "biscuit", "cracker", "chip", "candy", "chocolate", "syrup", "honey",
  // meats & seafood
  "chicken", "beef", "steak", "pork", "bacon", "ham", "sausage", "lamb",
  "turkey", "duck", "fish", "salmon", "tuna", "cod", "shrimp", "prawn",
  "crab", "lobster", "egg", "tofu", "tempeh", "anchov",
  // dairy
  "milk", "cheese", "yogurt", "yoghurt", "butter", "cream", "paneer",
  // legumes
  "lentil", "bean", "chickpea", "pea", "hummus",
  // produce
  "apple", "banana", "lettuce", "spinach", "tomato", "carrot", "broccoli",
  "avocado", "berry", "strawberr", "blueberr", "raspberr", "orange",
  "lemon", "cucumber", "pepper", "onion", "garlic", "mango", "pineapple",
  "watermelon", "melon", "grape", "pear", "peach", "plum", "kiwi",
  "potato", "corn", "pea", "mushroom", "ginger", "herb", "basil",
  "cilantro", "parsley", "mint",
  // drinks / prepared
  "juice", "smoothie", "soda", "cola", "water", "coffee", "tea", "alcohol",
  "beer", "wine",
  // fats & misc
  "oil", "butter", "mayonnaise", "dressing", "gravy", "sauce", "soup",
  "broth", "stock", "powder", "substitute", "porridge", "congee", "steak",
]);

/** Words describing the food's physical form - must be present in both. */
const FORM = new Set([
  "soup", "broth", "stock", "sauce", "paste", "powder", "substitute",
  "replacement", "juice", "smoothie", "drink", "syrup", "spread", "essence",
  "extract",   "seasoning", "gravy", "dressing", "porridge", "congee",
  "noodle", "mayonnaise",
  // prepared / plated forms
  "pudding", "custard", "mousse", "parfait", "dip", "filling", "topping",
  "crumble", "batter", "dough", "glaze", "pie", "cake", "bar", "roll",
  "sandwich", "wrap", "burger", "salad", "stew", "curry", "omelet", "fritter",
]);

/** Cheap normalisation for singular/plural plus common food synonyms. */
const SYN: Record<string, string> = {
  oats: "oat",
  oatmeal: "oat",
  tomatoes: "tomato",
  potatoes: "potato",
  berries: "berry",
  apples: "apple",
  bananas: "banana",
  eggs: "egg",
  noodles: "noodle",
  breasts: "breast",
  leaves: "leaf",
  fishes: "fish",
  chickpeas: "chickpea",
  lentilles: "lentil",
  beans: "bean",
  rices: "rice",
  fillets: "fillet",
  steaks: "steak",
  yogurts: "yogurt",
  yoghourts: "yogurt",
  broccolis: "broccoli",
  carrots: "carrot",
  salmons: "salmon",
  chickens: "chicken",
  porridges: "oat",
  anchovies: "anchov",
  mayonnaises: "mayonnaise",
  strawberries: "strawberr",
  blueberries: "blueberr",
  raspberries: "raspberr",
  corns: "corn",
  mushrooms: "mushroom",
  gingers: "ginger",
  peppers: "pepper",
  onions: "onion",
  cucumbers: "cucumber",
  oranges: "orange",
  lemons: "lemon",
  grapes: "grape",
  pears: "pear",
  peaches: "peach",
  loaves: "bread",
  breads: "bread",
  sugars: "sugar",
  honeys: "honey",
  bacons: "bacon",
  hams: "ham",
  sausages: "sausage",
  cheeses: "cheese",
  creams: "cream",
  milks: "milk",
  pastas: "pasta",
  flours: "flour",
  tortillas: "tortilla",
  cookies: "biscuit",
  candies: "candy",
  chocolates: "chocolate",
  drinks: "drink",
  smoothies: "smoothie",
  juices: "juice",
  sodas: "soda",
  waters: "water",
  coffees: "coffee",
  teas: "tea",
};

/**
 * Parent nouns. A candidate may legitimately add a parent ("salmon" is a
 * "fish"), but adding an *unrelated* food means a different product and must
 * not be rewarded for it. Without this, "milk" matched "Milk tea, prepared" at
 * 1.0 and a cup of chai got priced as pure dairy.
 */
const PARENT: Record<string, string[]> = {
  fish: ["salmon", "tuna", "cod", "anchov", "shrimp", "prawn", "crab"],
  poultry: ["chicken", "turkey", "duck"],
  meat: ["chicken", "beef", "pork", "lamb", "turkey", "steak", "bacon", "ham", "sausage"],
  beverage: ["tea", "coffee", "juice", "water", "soda", "drink", "smoothie", "beer", "wine"],
  citrus: ["orange", "lemon", "lime"],
  berry: ["strawberr", "blueberr", "raspberr"],
  dairy: ["milk", "cheese", "yogurt", "cream", "butter"],
  legume: ["bean", "lentil", "chickpea", "pea"],
  grain: ["rice", "pasta", "noodle", "oat", "bread", "cereal", "quinoa", "flour", "tortilla"],
  bread: ["biscuit", "cracker", "cake", "pie", "bar", "roll"],
  sauce: ["sauce", "gravy", "dressing", "mayonnaise", "spread", "paste"],
  soup: ["soup", "broth", "stew", "curry"],
  dessert: ["pudding", "custard", "mousse", "parfait", "cake", "pie"],
  sandwich: ["sandwich", "wrap", "burger"],
  egg: ["egg", "omelet", "fritter"],
  vegetable: ["lettuce", "spinach", "cucumber", "pepper", "onion", "tomato", "carrot", "broccoli"],
};

const PARENT_OF = new Map<string, string[]>();
for (const [parent, children] of Object.entries(PARENT)) {
  for (const c of children) {
    PARENT_OF.set(c, [...(PARENT_OF.get(c) ?? []), parent]);
  }
}

/** Every parent category this token belongs to. */
function parentsOf(token: string): string[] {
  return PARENT_OF.get(token) ?? [];
}

/**
 * True when an extra identity noun in the candidate describes the SAME
 * commodity as what the model identified.
 *
 * This is what separates legitimate database naming from a different product:
 *   "greek yogurt" vs "Milk, yogurt, plain"  -> milk and yogurt share `dairy`  -> OK
 *   "milk"            vs "Milk tea, prepared" -> dairy vs beverage, no overlap -> reject
 */
function sharesCommodity(extra: string, modelIdentities: string[]): boolean {
  const extraParents = parentsOf(extra);
  if (extraParents.length === 0) return false;
  return modelIdentities.some((m) =>
    parentsOf(m).some((p) => extraParents.includes(p)),
  );
}

/** True when `extra` is a parent category of something the model named. */
function isParentOfNamed(extra: string, modelIdentities: string[]) {
  return modelIdentities.some((m) => parentsOf(m).includes(extra));
}

/**
 * Whether an extra identity noun in the candidate still describes the same
 * food as what the model identified. Two legitimate cases, one illegitimate:
 *
 *   "salmon"            vs "Fish, salmon, Atlantic"  -> fish is a PARENT of salmon      -> ok
 *   "greek yogurt"      vs "Milk, yogurt, plain"    -> milk and yogurt share `dairy`  -> ok
 *   "milk"              vs "Milk tea, prepared"      -> dairy vs beverage, no overlap  -> REJECT
 */
function extraIsCompatible(extra: string, modelIdentities: string[]): boolean {
  return isParentOfNamed(extra, modelIdentities) || sharesCommodity(extra, modelIdentities);
}

function normalise(t: string) {
  const base = SYN[t] ?? t;
  return base.length > 4 && base.endsWith("s") ? base.slice(0, -1) : base;
}

export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !NOISE.has(t))
    .map(normalise);
}

/**
 * 0..1 similarity between what the model identified and what a database
 * returned.
 *
 * Decision order:
 *  1. Form guard - "soup"/"broth"/"powder" in only one of the two means a
 *     genuinely different food.
 *  2. Identity guard - the model's food noun must appear in the candidate.
 *     This is what stops "grilled salmon" matching "beef steak".
 *  3. Token overlap, only to grade how confident the identity match is.
 */
export function nameMatch(modelName: string, candidate: string): number {
  const a = tokenize(modelName);
  const b = tokenize(candidate);
  if (a.length === 0 || b.length === 0) return 0;

  // 0. dry-vs-cooked guard, before anything can award points.
  //
  // USDA lists rice, pasta, oats and legumes twice - once raw, once cooked -
  // under near-identical names. Cooked white rice is 130 kcal / 28 g carbs per
  // 100 g; dry white rice is 365 kcal / 80 g carbs. Because the two rows are
  // otherwise indistinguishable, an unweighted match lets whichever one the API
  // happens to return first win, which inflates a plate of rice by ~3x. The
  // dry form therefore loses outright when the scan is of prepared food.
  if (DRY_STAPLE.test(candidate) && RAW_MARKER.test(candidate) && !RAW_MARKER.test(modelName)) {
    return 0;
  }

  // 1. form guard
  const formA = a.filter((t) => FORM.has(t));
  const formB = b.filter((t) => FORM.has(t));
  if (formA.length !== formB.length) return 0;
  if (formA.some((t) => !formB.includes(t))) return 0;

  // 2. identity guard
  const idA = a.filter((t) => IDENTITY.has(t));
  const idB = b.filter((t) => IDENTITY.has(t));
  if (idA.length > 0 && idB.length > 0) {
    const setB = new Set(idB);
    const shared = idA.filter((t) => setB.has(t));
    // The model's food noun must be present in the candidate.
    if (shared.length === 0) return 0;
    const identityRecall = shared.length / idA.length;

    // A candidate may legitimately name a PARENT the model did not ("Fish,
    // salmon, Atlantic" satisfies "salmon"). But an extra identity noun that is
    // NOT a parent of anything the model said means a different product, and
    // that is a hard reject - this is what stopped "milk" matching "Milk tea"
    // and pricing a cup of chai as pure dairy.
    // NB: extras are the identity nouns the CANDIDATE has that the MODEL did
    // not. Comparing against the candidate's own set would always yield empty.
    const extras = idB.filter((t) => !idA.includes(t));
    const allExtrasCompatible = extras.every((e) => extraIsCompatible(e, idA));
    if (extras.length > 0 && !allExtrasCompatible) return 0;

    const superset = extras.length > 0;
    const base = superset ? Math.min(1, identityRecall + 0.2) : identityRecall;

    // Preparation words in the model name that the candidate lacks (grilled vs
    // raw) lower confidence a little but do not reject outright, because
    // databases are inconsistent about naming preparation.
    const extraPrep = a.filter(
      (t) => !IDENTITY.has(t) && !FORM.has(t) && !b.includes(t),
    ).length;
    const penalty = Math.min(0.25, extraPrep * 0.08);
    return Math.max(0, Math.min(1, base - penalty));
  }

  // 3. no identity nouns on one side - fall back to plain token overlap
  const setB = new Set(b);
  let hits = 0;
  for (const t of a) if (setB.has(t)) hits++;
  if (hits === 0) return 0;
  const recall = hits / a.length;
  const coverage = hits / b.length;
  return Math.min(recall, 0.5 + 0.5 * coverage);
}

/** Candidates below this are treated as a different food, not a match. */
export const MATCH_FLOOR = 0.5;

/**
 * Dry staples, where preparation state is the single largest nutrition factor.
 * Meat is excluded on purpose: raw vs cooked chicken differ mainly in water
 * content, and "chicken" matching "Chicken, raw, boneless" is already correct.
 */
const DRY_STAPLE =
  /\b(rice|pasta|noodle|oat|quinoa|barley|bread|flour|cereal|lentil|bean|chickpea|pulse|porridge)s?\b/i;
const RAW_MARKER = /\b(raw|dry|dried|uncooked)\b/i;

