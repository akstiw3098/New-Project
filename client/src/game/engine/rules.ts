import { BuildOption, Card, CaptureGroup, CaptureOption, Floor, House, PlayOption, ThrowOption } from './types';

let houseIdCounter = 1;
export function nextHouseId(): string {
  return `house-${houseIdCounter++}`;
}

// ---- Subset-sum helpers over loose cards ----

interface LooseGroup {
  cards: Card[];
}

/** All non-empty subsets of loose cards whose ranks sum to target. Capped for performance. */
function subsetsSummingTo(loose: Card[], target: number): LooseGroup[] {
  const results: LooseGroup[] = [];
  const n = loose.length;
  if (n > 18) return results; // pathological guard, never happens in practice (max 4 loose realistically)
  for (let mask = 1; mask < 1 << n; mask++) {
    let sum = 0;
    const cards: Card[] = [];
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) {
        sum += loose[i].rank;
        cards.push(loose[i]);
        if (sum > target) break;
      }
    }
    if (sum === target) results.push({ cards });
  }
  return results;
}

/**
 * Find all maximal disjoint partitions of loose-card-groups summing to `rank`,
 * each partition is a list of non-overlapping groups. Maximal = cannot add
 * another disjoint valid group from what's left over.
 */
function maximalPartitions(loose: Card[], rank: number): LooseGroup[][] {
  const allGroups = subsetsSummingTo(loose, rank);
  if (allGroups.length === 0) return [[]];

  const idOf = (c: Card) => c.id;
  const partitions: LooseGroup[][] = [];
  const seen = new Set<string>();

  function key(groups: LooseGroup[]): string {
    return groups
      .map((g) => g.cards.map(idOf).sort().join(','))
      .sort()
      .join('|');
  }

  function extend(used: Set<string>, chosen: LooseGroup[]) {
    // find groups fully disjoint from used
    const candidates = allGroups.filter((g) => g.cards.every((c) => !used.has(idOf(c))));
    if (candidates.length === 0) {
      const k = key(chosen);
      if (!seen.has(k)) {
        seen.add(k);
        partitions.push(chosen);
      }
      return;
    }
    for (const g of candidates) {
      const newUsed = new Set(used);
      g.cards.forEach((c) => newUsed.add(idOf(c)));
      extend(newUsed, [...chosen, g]);
    }
  }

  extend(new Set(), []);
  // keep only maximal ones (not a subset of another partition's group-set)
  const groupKeySets = partitions.map((p) => new Set(p.map((g) => key([g]))));
  const maximal = partitions.filter((p, i) => {
    return !partitions.some((q, j) => {
      if (i === j) return false;
      if (q.length <= p.length) return false;
      // p is dominated if every group in p also appears in q
      return groupKeySets[i].size < groupKeySets[j].size && [...groupKeySets[i]].every((k) => groupKeySets[j].has(k));
    });
  });
  return maximal.length ? maximal : partitions;
}

/** Compute every legal capture partition (groups incl. matching house) for playing `card`. */
export function findCaptureOptions(floor: Floor, rank: number): CaptureOption[] {
  const looseGroupPartitions = maximalPartitions(floor.loose, rank);
  const matchingHouse = floor.houses.find((h) => h.value === rank) ?? null;

  const options: CaptureOption[] = [];
  for (const partition of looseGroupPartitions) {
    const groups: CaptureGroup[] = partition.map((g) => ({ cards: g.cards, isHouse: false }));
    if (matchingHouse) {
      groups.push({ cards: matchingHouse.cards, isHouse: true, houseId: matchingHouse.id });
    }
    if (groups.length > 0) options.push({ type: 'capture', groups });
  }
  if (options.length === 0 && matchingHouse) {
    options.push({ type: 'capture', groups: [{ cards: matchingHouse.cards, isHouse: true, houseId: matchingHouse.id }] });
  }
  // dedupe
  const seen = new Set<string>();
  return options.filter((o) => {
    const k = o.groups
      .map((g) => (g.isHouse ? `H:${g.houseId}` : g.cards.map((c) => c.id).sort().join(',')))
      .sort()
      .join('|');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function hasAnyCapture(floor: Floor, rank: number): boolean {
  if (floor.houses.some((h) => h.value === rank)) return true;
  if (floor.loose.some((c) => c.rank === rank)) return true;
  return subsetsSummingTo(floor.loose, rank).length > 0;
}

/** Enumerate build/cement/break options for playing `card` (rank r) from a given seat. */
export function findBuildOptions(floor: Floor, rank: number, seat: number, ownsHouseValue: (value: number) => boolean): BuildOption[] {
  const options: BuildOption[] = [];
  if (rank < 1 || rank > 13) return options;

  const looseSubsets = (target: number) => {
    // subsets of loose cards (any, not just those summing exactly for capture semantics reused)
    const results: LooseGroup[] = [];
    const n = floor.loose.length;
    for (let mask = 0; mask < 1 << n; mask++) {
      let sum = 0;
      const cards: Card[] = [];
      for (let i = 0; i < n; i++) {
        if (mask & (1 << i)) {
          sum += floor.loose[i].rank;
          cards.push(floor.loose[i]);
        }
      }
      if (sum === target) results.push({ cards });
    }
    return results;
  };

  // 1) Establish a brand-new ordinary/cemented house: card + subset of loose cards summing to (value-rank)
  for (let value = 9; value <= 13; value++) {
    if (floor.houses.some((h) => h.value === value)) continue; // house already exists at this value -> handled by add/cement paths
    const need = value - rank;
    if (need < 0) continue;
    if (need === 0) {
      // single-card new house needs >=2 cards total; alone it's just a capture-equivalent, not a valid "new house" (min 2 cards)
      // Only valid if there's nothing else — but per rules min house size is 2, so skip unless can combine with existing loose of same rank (auto-cement covered below with need=0 subset {} won't add loose). Instead handle exact rank match against a loose card as its own subset (handled by need>0 branch naturally since a single loose card of value `rank` also satisfies need=rank case only if need===that card rank... )
      continue;
    }
    for (const g of looseSubsets(need)) {
      if (g.cards.length === 0) continue;
      options.push({ type: 'build', mode: 'new_house', targetValue: value, looseCardIds: g.cards.map((c) => c.id) });
    }
  }

  // 2) Add to / cement an existing ordinary house (uncemented) at value V: play card + optional loose subset that sums with V-owned pile? Actually adding requires total added (card+loose subset) increases pile; for ordinary house cementing: card rank + loose subset sum === V (a second group reaching same value) OR card rank === V directly (direct cement) OR breaking (increases value) handled separately.
  for (const house of floor.houses) {
    if (house.cemented) {
      // adding further groups of equal value V allowed if includes a card from hand (this card) - group = card + loose subset summing to V, or card alone if rank === V
      const need = house.value - rank;
      if (need === 0) {
        options.push({ type: 'build', mode: 'add_to_house', targetValue: house.value, looseCardIds: [], resultHouseId: house.id });
      } else if (need > 0) {
        for (const g of looseSubsets(need)) {
          options.push({
            type: 'build',
            mode: 'add_to_house',
            targetValue: house.value,
            looseCardIds: g.cards.map((c) => c.id),
            resultHouseId: house.id,
          });
        }
      }
    } else {
      const isOwn = ownsHouseValue(house.value) && false; // ownership determined by engine via createdBySeat/owners passed separately; placeholder unused here
      // cementing without breaking: card (+ optional loose subset) sums to exactly house.value
      const need = house.value - rank;
      if (need === 0) {
        options.push({ type: 'build', mode: 'cement', targetValue: house.value, looseCardIds: [], resultHouseId: house.id });
      } else if (need > 0) {
        for (const g of looseSubsets(need)) {
          options.push({
            type: 'build',
            mode: 'cement',
            targetValue: house.value,
            looseCardIds: g.cards.map((c) => c.id),
            resultHouseId: house.id,
          });
        }
      }
      // breaking: card rank alone (or + loose subset) raises value to newValue > house.value, newValue in [9,13]
      for (let newValue = house.value + 1; newValue <= 13; newValue++) {
        const addNeeded = newValue - house.value; // amount contributed by (card + loose subset)
        if (rank > addNeeded) continue;
        const remainder = addNeeded - rank;
        if (remainder === 0) {
          options.push({
            type: 'build',
            mode: 'break_house',
            targetValue: newValue,
            looseCardIds: [],
            breakHouseId: house.id,
          });
        } else {
          for (const g of looseSubsets(remainder)) {
            options.push({
              type: 'build',
              mode: 'break_house',
              targetValue: newValue,
              looseCardIds: g.cards.map((c) => c.id),
              breakHouseId: house.id,
            });
          }
        }
      }
    }
  }

  // dedupe options
  const seen = new Set<string>();
  return options.filter((o) => {
    const k = `${o.mode}|${o.targetValue}|${o.breakHouseId ?? ''}|${o.resultHouseId ?? ''}|${o.looseCardIds.slice().sort().join(',')}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function throwOption(): ThrowOption {
  return { type: 'throw' };
}
