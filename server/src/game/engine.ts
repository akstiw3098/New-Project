import { freshDeck, shuffle } from './deck';
import { findBuildOptions, findCaptureOptions, hasAnyCapture, nextHouseId } from './rules';
import {
  BuildOption,
  Card,
  CaptureOption,
  Difficulty,
  Floor,
  GameState,
  House,
  PlayOption,
  Seat,
  scoreValue,
  ThrowOption,
} from './types';

export const SEAT_COUNT = 4;

function ccwNext(seat: number): number {
  return (seat + 1) % SEAT_COUNT;
}

export function makeInitialState(roomId: string, targetBaaziMargin = 100): GameState {
  const seats: Seat[] = Array.from({ length: SEAT_COUNT }, (_, i) => ({
    index: i,
    playerId: null,
    name: `Seat ${i + 1}`,
    isBot: false,
    botDifficulty: 'medium' as Difficulty,
    teamId: (i % 2) as 0 | 1,
    hand: [],
    connected: false,
  }));
  return {
    roomId,
    phase: 'lobby',
    seats,
    teams: [
      { id: 0, capturedPiles: [], sweepCards: [], sweepBonuses: [], runningScoreThisBaazi: 0 },
      { id: 1, capturedPiles: [], sweepCards: [], sweepBonuses: [], runningScoreThisBaazi: 0 },
    ],
    floor: { loose: [], houses: [] },
    dealerSeat: 0,
    bidderSeat: null,
    bidValue: null,
    turnSeat: null,
    turnsPlayed: 0,
    firstPlayDone: false,
    lastCapturingTeam: null,
    baaziScoreDiff: 0,
    baaziWinnerTeam: null,
    dealNumber: 0,
    history: [],
    log: [],
    targetBaaziMargin,
    pendingRedeal: false,
  };
}

function log(state: GameState, msg: string) {
  state.log.push(msg);
  if (state.log.length > 300) state.log.shift();
}

/** Deal a fresh hand: 4 to bidder (dealer's right), 4 to floor; redeal loop if bidder can't bid. */
export function startDeal(state: GameState, rng: () => number = Math.random) {
  state.dealNumber += 1;
  const bidderSeat = ccwNext(state.dealerSeat);

  let deck: Card[] = [];
  let bidderHand: Card[] = [];
  let floorCards: Card[] = [];

  // redeal loop until bidder has a card with capture value >= 9
  for (let attempt = 0; attempt < 500; attempt++) {
    deck = shuffle(freshDeck(), rng);
    bidderHand = deck.slice(0, 4);
    floorCards = deck.slice(4, 8);
    const canBid = bidderHand.some((c) => c.rank >= 9);
    if (canBid) break;
  }

  state.seats.forEach((s) => (s.hand = []));
  state.seats[bidderSeat].hand = bidderHand;
  state.floor = { loose: floorCards, houses: [] };
  state.teams.forEach((t) => {
    t.capturedPiles = [];
    t.sweepCards = [];
    t.sweepBonuses = [];
  });

  // deal remainder round-robin starting after bidder, 4 at a time, until deck exhausted
  const rest = deck.slice(8);
  let ptr = 0;
  let recipient = ccwNext(bidderSeat);
  while (ptr < rest.length) {
    const batch = rest.slice(ptr, ptr + 4);
    state.seats[recipient].hand.push(...batch);
    ptr += 4;
    recipient = ccwNext(recipient);
  }

  state.bidderSeat = bidderSeat;
  state.bidValue = null;
  state.turnSeat = bidderSeat;
  state.turnsPlayed = 0;
  state.firstPlayDone = false;
  state.lastCapturingTeam = null;
  state.phase = 'awaiting_bid';
  log(state, `Deal #${state.dealNumber}: dealer seat ${state.dealerSeat}, bidder seat ${bidderSeat}`);
}

export function validBidValues(state: GameState): number[] {
  if (state.bidderSeat === null) return [];
  const hand = state.seats[state.bidderSeat].hand;
  const values = new Set<number>();
  hand.forEach((c) => {
    if (c.rank >= 9 && c.rank <= 13) values.add(c.rank);
  });
  return [...values].sort((a, b) => a - b);
}

export function placeBid(state: GameState, seat: number, value: number) {
  if (state.phase !== 'awaiting_bid') throw new Error('Not awaiting bid');
  if (seat !== state.bidderSeat) throw new Error('Not the bidder');
  const options = validBidValues(state);
  if (!options.includes(value)) throw new Error('Invalid bid value');
  state.bidValue = value;
  state.phase = 'bidder_first_action';
  log(state, `Seat ${seat} bids ${value}`);
}

// ---- Option enumeration for the current turn ----

export function ownsHouseValue(state: GameState, seat: number, value: number): boolean {
  return state.floor.houses.some((h) => h.value === value && h.ownerSeats.includes(seat));
}

export interface PlayableCardOptions {
  cardId: string;
  captures: CaptureOption[];
  builds: BuildOption[];
  throwAllowed: boolean;
}

export function optionsForCard(state: GameState, seat: number, cardId: string): PlayableCardOptions {
  const hand = state.seats[seat].hand;
  const card = hand.find((c) => c.id === cardId);
  if (!card) throw new Error('Card not in hand');
  const captures = findCaptureOptions(state.floor, card.rank);
  const builds = findBuildOptions(state.floor, card.rank, seat, (v) => ownsHouseValue(state, seat, v));
  const forced = hasAnyCapture(state.floor, card.rank);
  const throwAllowed = !forced; // if capture is available, must build or capture, not throw
  return { cardId, captures, builds, throwAllowed };
}

export function legalCardIds(state: GameState, seat: number): string[] {
  return state.seats[seat].hand.map((c) => c.id);
}

// ---- Applying a play ----

function removeLoose(floor: Floor, ids: Set<string>) {
  floor.loose = floor.loose.filter((c) => !ids.has(c.id));
}

function totalFloorCount(floor: Floor): number {
  return floor.loose.length + floor.houses.reduce((s, h) => s + h.cards.length, 0);
}

interface ApplyResult {
  sweep: boolean;
}

export function applyCapture(state: GameState, seat: number, cardId: string, option: CaptureOption): ApplyResult {
  const seatObj = state.seats[seat];
  const cardIdx = seatObj.hand.findIndex((c) => c.id === cardId);
  if (cardIdx === -1) throw new Error('Card not in hand');
  const [played] = seatObj.hand.splice(cardIdx, 1);

  const captured: Card[] = [played];
  const consumedLooseIds = new Set<string>();
  const consumedHouseIds = new Set<string>();

  for (const g of option.groups) {
    if (g.isHouse && g.houseId) {
      const h = state.floor.houses.find((x) => x.id === g.houseId);
      if (h) {
        captured.push(...h.cards);
        consumedHouseIds.add(h.id);
      }
    } else {
      g.cards.forEach((c) => consumedLooseIds.add(c.id));
      captured.push(...g.cards);
    }
  }

  removeLoose(state.floor, consumedLooseIds);
  state.floor.houses = state.floor.houses.filter((h) => !consumedHouseIds.has(h.id));

  const team = state.teams[seatObj.teamId];
  team.capturedPiles.push(...captured);
  state.lastCapturingTeam = seatObj.teamId;

  const sweep = totalFloorCount(state.floor) === 0;
  if (sweep) {
    const isFirstPlay = !state.firstPlayDone;
    const isLastPlay = state.turnsPlayed === 47; // 0-indexed; this play will be the 48th
    let bonus = 50;
    if (isFirstPlay) bonus = 25;
    if (isLastPlay) bonus = 0;
    if (bonus > 0) {
      team.sweepCards.push(played);
      team.sweepBonuses.push(bonus);
      log(state, `Seat ${seat} SWEEPS the floor! Bonus ${bonus}`);
    } else {
      log(state, `Seat ${seat} sweeps the floor (no bonus - last play).`);
    }
  }

  log(state, `Seat ${seat} plays ${played.rank} and captures ${captured.length - 1} card(s).`);
  return { sweep };
}

export function applyBuild(state: GameState, seat: number, cardId: string, option: BuildOption) {
  const seatObj = state.seats[seat];
  const cardIdx = seatObj.hand.findIndex((c) => c.id === cardId);
  if (cardIdx === -1) throw new Error('Card not in hand');
  const [played] = seatObj.hand.splice(cardIdx, 1);

  const looseIds = new Set(option.looseCardIds);
  const consumedLoose = state.floor.loose.filter((c) => looseIds.has(c.id));
  removeLoose(state.floor, looseIds);

  if (option.mode === 'new_house') {
    const house: House = {
      id: nextHouseId(),
      value: option.targetValue,
      cemented: false,
      cards: [played, ...consumedLoose],
      ownerSeats: [seat],
      createdBySeat: seat,
    };
    // auto-cement check: if another loose card/group of same value already existed it would've been consumed above already
    // check for an *existing* same-value house is impossible per invariant (findBuildOptions skips if exists)
    state.floor.houses.push(house);
    log(state, `Seat ${seat} builds a ${option.targetValue}-house.`);
  } else if (option.mode === 'add_to_house' || option.mode === 'cement') {
    const house = state.floor.houses.find((h) => h.id === option.resultHouseId);
    if (!house) throw new Error('House not found');
    const wasOwner = house.ownerSeats.includes(seat);
    house.cards.push(played, ...consumedLoose);
    house.cemented = true;
    if (!wasOwner) {
      const partnerOwns = house.ownerSeats.some((s) => state.seats[s].teamId === seatObj.teamId);
      if (!partnerOwns) house.ownerSeats.push(seat);
    }
    log(state, `Seat ${seat} ${option.mode === 'cement' ? 'cements' : 'adds to'} the ${house.value}-house.`);
  } else if (option.mode === 'break_house') {
    const house = state.floor.houses.find((h) => h.id === option.breakHouseId);
    if (!house) throw new Error('House not found');
    const newHouse: House = {
      id: nextHouseId(),
      value: option.targetValue,
      cemented: false,
      cards: [...house.cards, played, ...consumedLoose],
      ownerSeats: [seat],
      createdBySeat: seat,
    };
    state.floor.houses = state.floor.houses.filter((h) => h.id !== house.id);
    // if there's a loose card/group matching newHouse.value remaining on floor, or another house of same value, auto-cement/merge
    const mergeHouse = state.floor.houses.find((h) => h.value === newHouse.value);
    if (mergeHouse) {
      newHouse.cards.push(...mergeHouse.cards);
      newHouse.cemented = true;
      state.floor.houses = state.floor.houses.filter((h) => h.id !== mergeHouse.id);
    }
    state.floor.houses.push(newHouse);
    log(state, `Seat ${seat} breaks a house to form a ${option.targetValue}-house.`);
  }
}

export function applyThrow(state: GameState, seat: number, cardId: string) {
  const seatObj = state.seats[seat];
  const cardIdx = seatObj.hand.findIndex((c) => c.id === cardId);
  if (cardIdx === -1) throw new Error('Card not in hand');
  const [played] = seatObj.hand.splice(cardIdx, 1);
  state.floor.loose.push(played);
  log(state, `Seat ${seat} throws ${played.rank} as a loose card.`);
}

/** Advance turn pointer and phase after a play has been applied. */
export function advanceTurn(state: GameState) {
  state.turnsPlayed += 1;
  state.firstPlayDone = true;
  if (state.phase === 'bidder_first_action') {
    state.phase = 'playing';
  }
  const allEmpty = state.seats.every((s) => s.hand.length === 0);
  if (allEmpty) {
    finishDeal(state);
    return;
  }
  state.turnSeat = ccwNext(state.turnSeat!);
}

function finishDeal(state: GameState) {
  // remaining loose cards go to last capturing team
  if (state.floor.loose.length > 0 && state.lastCapturingTeam !== null) {
    state.teams[state.lastCapturingTeam].capturedPiles.push(...state.floor.loose);
    state.floor.loose = [];
  }
  const teamScores: [number, number] = [0, 0];
  for (const team of state.teams) {
    let pts = team.capturedPiles.reduce((s, c) => s + scoreValue(c), 0);
    pts += team.sweepBonuses.reduce((s, b) => s + b, 0);
    teamScores[team.id] = pts;
  }

  const sweepsRecord = state.teams.flatMap((t) =>
    t.sweepBonuses.map((b, i) => ({ seat: -1, teamId: t.id, bonus: b }))
  );

  let instantBaazi = false;
  let diffApplied: 0 | 1 | null = null;
  let diffAmount = 0;

  if (teamScores[0] < 9 || teamScores[1] < 9) {
    instantBaazi = true;
    const winner: 0 | 1 = teamScores[0] < 9 ? 1 : 0;
    state.baaziWinnerTeam = winner;
    state.baaziScoreDiff = 0;
    diffApplied = winner;
    diffAmount = 0;
    log(state, `Team ${teamScores[0] < 9 ? 0 : 1} scored under 9 points - instant Baazi to Team ${winner}!`);
  } else {
    const diff = teamScores[0] - teamScores[1];
    state.baaziScoreDiff += diff;
    if (Math.abs(state.baaziScoreDiff) >= state.targetBaaziMargin) {
      state.baaziWinnerTeam = state.baaziScoreDiff > 0 ? 0 : 1;
      diffApplied = state.baaziWinnerTeam;
      diffAmount = Math.abs(state.baaziScoreDiff);
      log(state, `Team ${state.baaziWinnerTeam} wins the Baazi with a margin of ${diffAmount}!`);
      state.baaziScoreDiff = 0;
    }
  }

  state.history.push({
    dealNumber: state.dealNumber,
    dealerSeat: state.dealerSeat,
    bidderSeat: state.bidderSeat!,
    bidValue: state.bidValue,
    teamScores,
    sweeps: sweepsRecord,
    diffAppliedTo: diffApplied,
    diffAmount,
    instantBaazi,
  });

  if (state.baaziWinnerTeam !== null) {
    state.phase = 'baazi_won';
  } else {
    state.phase = 'deal_scoring';
  }

  // determine next dealer per rules: dealt-by-losing-team; same dealer if dealer's
  // team is behind or tied; otherwise deal passes to next player to the right (ccw).
  // After a baazi (instant or by margin), the deal instead passes to the PARTNER
  // of whoever would have dealt under the normal rule.
  const prevDealer = state.dealerSeat;
  const dealerTeam = state.seats[prevDealer].teamId;
  const dealerTeamScore = teamScores[dealerTeam];
  const otherTeamScore = teamScores[dealerTeam === 0 ? 1 : 0];
  const normalNextDealer = dealerTeamScore > otherTeamScore ? ccwNext(prevDealer) : prevDealer;
  state.dealerSeat = state.baaziWinnerTeam !== null ? (normalNextDealer + 2) % SEAT_COUNT : normalNextDealer;

  log(state, `Deal #${state.dealNumber} finished. Score T0=${teamScores[0]} T1=${teamScores[1]}.`);
}

export function playCard(state: GameState, seat: number, cardId: string, choice: PlayOption) {
  if (state.phase !== 'playing' && state.phase !== 'bidder_first_action') {
    throw new Error('Not in playing phase');
  }
  if (state.turnSeat !== seat) throw new Error('Not your turn');

  if (state.phase === 'bidder_first_action') {
    const card = state.seats[seat].hand.find((c) => c.id === cardId);
    if (!card || card.rank !== state.bidValue) {
      throw new Error('Must play the card matching your bid value');
    }
  }

  const info = optionsForCard(state, seat, cardId);

  if (choice.type === 'throw') {
    if (!info.throwAllowed) throw new Error('Must capture or build - cannot throw');
    applyThrow(state, seat, cardId);
  } else if (choice.type === 'capture') {
    const match = info.captures.find(
      (c) =>
        c.groups.length === choice.groups.length &&
        c.groups.every((g, i) => {
          const other = choice.groups[i];
          if (g.isHouse !== other.isHouse) return false;
          if (g.isHouse) return g.houseId === other.houseId;
          const a = g.cards.map((x) => x.id).sort().join(',');
          const b = other.cards.map((x) => x.id).sort().join(',');
          return a === b;
        })
    );
    if (!match) throw new Error('Invalid capture option');
    applyCapture(state, seat, cardId, choice);
  } else if (choice.type === 'build') {
    const match = info.builds.find(
      (b) =>
        b.mode === choice.mode &&
        b.targetValue === choice.targetValue &&
        (b.resultHouseId ?? '') === (choice.resultHouseId ?? '') &&
        (b.breakHouseId ?? '') === (choice.breakHouseId ?? '') &&
        b.looseCardIds.slice().sort().join(',') === choice.looseCardIds.slice().sort().join(',')
    );
    if (!match) throw new Error('Invalid build option');
    applyBuild(state, seat, cardId, choice);
  }

  advanceTurn(state);
}

/** Start the next deal after a deal has finished scoring (whether or not a Baazi was decided). */
export function continueToNextDeal(state: GameState, rng: () => number = Math.random) {
  if (state.phase !== 'deal_scoring' && state.phase !== 'baazi_won') {
    throw new Error('No deal is ready to continue');
  }
  if (state.phase === 'baazi_won') {
    state.baaziWinnerTeam = null;
  }
  startDeal(state, rng);
}
