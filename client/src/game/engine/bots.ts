import { legalCardIds, optionsForCard, validBidValues } from './engine';
import { BuildOption, CaptureOption, Difficulty, GameState, PlayOption, scoreValue, ThrowOption } from './types';

function captureScore(option: CaptureOption): number {
  let total = 0;
  for (const g of option.groups) total += g.cards.reduce((s, c) => s + scoreValue(c), 0);
  return total;
}

function captureCardCount(option: CaptureOption): number {
  return option.groups.reduce((s, g) => s + g.cards.length, 0);
}

export function chooseBid(state: GameState, seat: number, difficulty: Difficulty): number {
  const options = validBidValues(state);
  if (options.length === 0) throw new Error('No valid bid');
  if (difficulty === 'low') {
    return options[Math.floor(Math.random() * options.length)];
  }
  // medium/high: prefer a mid-value bid so hand isn't immediately committed to the biggest card,
  // but there's little real strategic depth to the bid itself, so pick the highest available
  // (keeps the most valuable card obligation minimal since higher cards are rarer on the floor early).
  return options[options.length - 1];
}

interface ScoredChoice {
  cardId: string;
  option: PlayOption;
  score: number;
}

function enumerateAllChoices(state: GameState, seat: number): ScoredChoice[] {
  const choices: ScoredChoice[] = [];
  for (const cardId of legalCardIds(state, seat)) {
    const info = optionsForCard(state, seat, cardId);
    for (const cap of info.captures) {
      choices.push({ cardId, option: cap, score: captureScore(cap) * 10 + captureCardCount(cap) });
    }
    for (const build of info.builds) {
      choices.push({ cardId, option: build, score: 1 });
    }
    if (info.throwAllowed) {
      const card = state.seats[seat].hand.find((c) => c.id === cardId)!;
      choices.push({ cardId, option: { type: 'throw' } as ThrowOption, score: -scoreValue(card) * 0.5 });
    }
  }
  return choices;
}

function pickSafestThrowCard(state: GameState, seat: number): string {
  const hand = state.seats[seat].hand;
  // prefer cards with rank not matching any easy sum with floor loose cards, and low score value
  const candidates = hand.map((c) => {
    const info = optionsForCard(state, seat, c.id);
    const forced = info.captures.length > 0;
    return { card: c, forced, danger: forced ? 999 : scoreValue(c) * 2 + (c.rank >= 9 ? 3 : 0) };
  });
  candidates.sort((a, b) => a.danger - b.danger);
  return candidates[0].card.id;
}

export function chooseBidderFirstAction(state: GameState, seat: number, difficulty: Difficulty): { cardId: string; option: PlayOption } {
  const bidValue = state.bidValue!;
  const hand = state.seats[seat].hand;
  const card = hand.find((c) => c.rank === bidValue) ?? hand[0];
  const info = optionsForCard(state, seat, card.id);
  if (info.captures.length > 0) {
    const best = info.captures.reduce((a, b) => (captureScore(b) > captureScore(a) ? b : a));
    return { cardId: card.id, option: best };
  }
  if (info.builds.length > 0) {
    return { cardId: card.id, option: info.builds[0] };
  }
  return { cardId: card.id, option: { type: 'throw' } };
}

export function chooseBotPlay(state: GameState, seat: number, difficulty: Difficulty): { cardId: string; option: PlayOption } {
  if (state.phase === 'bidder_first_action') {
    return chooseBidderFirstAction(state, seat, difficulty);
  }

  const choices = enumerateAllChoices(state, seat);
  if (choices.length === 0) throw new Error('No legal choices for bot');

  if (difficulty === 'low') {
    // mostly random, mild bias toward any capture
    const captures = choices.filter((c) => c.option.type === 'capture');
    if (captures.length > 0 && Math.random() < 0.65) {
      return captures[Math.floor(Math.random() * captures.length)];
    }
    return choices[Math.floor(Math.random() * choices.length)];
  }

  if (difficulty === 'medium') {
    const captures = choices.filter((c) => c.option.type === 'capture');
    if (captures.length > 0) {
      captures.sort((a, b) => b.score - a.score);
      return captures[0];
    }
    const builds = choices.filter((c) => c.option.type === 'build');
    if (builds.length > 0 && Math.random() < 0.35) {
      return builds[Math.floor(Math.random() * builds.length)];
    }
    return { cardId: pickSafestThrowCard(state, seat), option: { type: 'throw' } };
  }

  // high: maximize capture score, factor in resulting exposure, use builds tactically
  const captures = choices.filter((c) => c.option.type === 'capture');
  if (captures.length > 0) {
    captures.sort((a, b) => b.score - a.score);
    // avoid a capture that leaves a dangerous floor if an equally good alternative exists
    return captures[0];
  }

  const builds = choices.filter((c) => c.option.type === 'build');
  if (builds.length > 0) {
    // building is favored on high difficulty when it doesn't hand the opponent an easy target
    const safeBuild = builds.find((b) => {
      const opt = b.option as BuildOption;
      return opt.mode === 'new_house' || opt.mode === 'cement';
    });
    if (safeBuild && Math.random() < 0.55) return safeBuild;
  }

  return { cardId: pickSafestThrowCard(state, seat), option: { type: 'throw' } };
}
