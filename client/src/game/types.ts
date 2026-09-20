export type Suit = 'S' | 'H' | 'D' | 'C';

export interface Card {
  id: string;
  suit: Suit;
  rank: number;
}

export function scoreValue(card: Card): number {
  if (card.suit === 'S') return card.rank;
  if (card.rank === 1) return 1;
  if (card.suit === 'D' && card.rank === 10) return 6;
  return 0;
}

export function rankLabel(rank: number): string {
  const names: Record<number, string> = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
  return names[rank] ?? String(rank);
}

export const SUIT_SYMBOL: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
export const SUIT_RED: Record<Suit, boolean> = { S: false, C: false, H: true, D: true };

export interface House {
  id: string;
  value: number;
  cemented: boolean;
  cards: Card[];
  ownerSeats: number[];
  createdBySeat: number;
}

export interface Floor {
  loose: Card[];
  houses: House[];
}

export type Difficulty = 'low' | 'medium' | 'high';

export interface Seat {
  index: number;
  playerId: string | null;
  name: string;
  isBot: boolean;
  botDifficulty: Difficulty;
  teamId: 0 | 1;
  hand: (Card | null)[];
  handCount: number;
  connected: boolean;
}

export interface TeamState {
  id: 0 | 1;
  capturedPiles: Card[];
  sweepCards: Card[];
  sweepBonuses: number[];
  runningScoreThisBaazi: number;
}

export type GamePhase =
  | 'lobby'
  | 'dealing'
  | 'awaiting_bid'
  | 'bidder_first_action'
  | 'playing'
  | 'deal_scoring'
  | 'baazi_won'
  | 'finished';

export interface CaptureGroup {
  cards: Card[];
  isHouse: boolean;
  houseId?: string;
}

export interface CaptureOption {
  type: 'capture';
  groups: CaptureGroup[];
}

export interface BuildOption {
  type: 'build';
  mode: 'new_house' | 'add_to_house' | 'cement' | 'break_house';
  targetValue: number;
  looseCardIds: string[];
  breakHouseId?: string;
  resultHouseId?: string;
}

export interface ThrowOption {
  type: 'throw';
}

export type PlayOption = CaptureOption | BuildOption | ThrowOption;

export interface DealRecord {
  dealNumber: number;
  dealerSeat: number;
  bidderSeat: number;
  bidValue: number | null;
  teamScores: [number, number];
  sweeps: { seat: number; teamId: 0 | 1; bonus: number }[];
  diffAppliedTo: 0 | 1 | null;
  diffAmount: number;
  instantBaazi: boolean;
}

export interface GameState {
  roomId: string;
  phase: GamePhase;
  seats: Seat[];
  teams: [TeamState, TeamState];
  floor: Floor;
  dealerSeat: number;
  bidderSeat: number | null;
  bidValue: number | null;
  turnSeat: number | null;
  turnsPlayed: number;
  firstPlayDone: boolean;
  lastCapturingTeam: 0 | 1 | null;
  baaziScoreDiff: number;
  baaziWinnerTeam: 0 | 1 | null;
  dealNumber: number;
  history: DealRecord[];
  log: string[];
  targetBaaziMargin: number;
  pendingRedeal: boolean;
}

export interface PlayableCardOptions {
  cardId: string;
  captures: CaptureOption[];
  builds: BuildOption[];
  throwAllowed: boolean;
}
