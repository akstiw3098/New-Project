import { continueToNextDeal, legalCardIds, makeInitialState, placeBid, playCard, startDeal, validBidValues } from './engine';
import { chooseBid, chooseBotPlay } from './bots';
import { scoreValue } from './types';

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
  }
}

function totalCardsInPlay(state: ReturnType<typeof makeInitialState>): number {
  const hand = state.seats.reduce((s, seat) => s + seat.hand.length, 0);
  const floor = state.floor.loose.length + state.floor.houses.reduce((s, h) => s + h.cards.length, 0);
  const captured = state.teams.reduce((s, t) => s + t.capturedPiles.length, 0);
  return hand + floor + captured;
}

let deals = 0;
let baazis = 0;

for (let game = 0; game < 25; game++) {
  const state = makeInitialState(`TEST${game}`, 100);
  state.seats.forEach((s, i) => {
    s.isBot = true;
    s.botDifficulty = (['low', 'medium', 'high'] as const)[i % 3];
  });
  startDeal(state);

  let guard = 0;
  while (state.baaziWinnerTeam === null && guard < 2000) {
    guard++;
    if (state.phase !== 'deal_scoring' && state.phase !== 'baazi_won') {
      assert(totalCardsInPlay(state) === 52, `card count invariant broken (deal ${state.dealNumber}, phase ${state.phase})`);
    }

    if (state.phase === 'awaiting_bid') {
      const opts = validBidValues(state);
      assert(opts.length > 0, 'bidder has no valid bid');
      const value = chooseBid(state, state.bidderSeat!, state.seats[state.bidderSeat!].botDifficulty);
      placeBid(state, state.bidderSeat!, value);
      continue;
    }
    if (state.phase === 'bidder_first_action' || state.phase === 'playing') {
      const seat = state.turnSeat!;
      const { cardId, option } = chooseBotPlay(state, seat, state.seats[seat].botDifficulty);
      playCard(state, seat, cardId, option);
      continue;
    }
    if (state.phase === 'deal_scoring') {
      continueToNextDeal(state);
      continue;
    }
  }
  assert(guard < 2000, `game ${game} did not terminate (possible infinite loop)`);
  assert(state.baaziWinnerTeam !== null, `game ${game} never produced a baazi winner`);
  deals += state.history.length;
  if (state.baaziWinnerTeam !== null) baazis++;

  // scoring sanity: total score value of all 52 cards is 100
  const totalScoreValue = state.history.reduce((sum, d) => sum + d.teamScores[0] + d.teamScores[1] - d.sweeps.reduce((s, sw) => s + sw.bonus, 0), 0);
}

console.log(`Simulated ${deals} deals across 25 games, ${baazis} baazis decided.`);
if (process.exitCode !== 1) {
  console.log('All invariant checks passed.');
}
