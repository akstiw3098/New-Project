export type Suit = 'S' | 'H' | 'D' | 'C';

// Capture value: A=1, 2-10 face value, J=11, Q=12, K=13
export interface Card {
  id: string; // unique per card in a deck, e.g. "S-1", "H-13"
  suit: Suit;
  rank: number; // 1..13
}

export function cardLabel(card: Card): string {
  const names: Record<number, string> = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
  const r = names[card.rank] ?? String(card.rank);
  const suits: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
  return `${r}${suits[card.suit]}`;
}

export function scoreValue(card: Card): number {
  if (card.suit === 'S') return card.rank;
  if (card.rank === 1) return 1; // aces of other suits
  if (card.suit === 'D' && card.rank === 10) return 6;
  return 0;
}

export interface House {
  id: string;
  value: number; // 9..13
  cemented: boolean;
  cards: Card[];
  ownerSeats: number[]; // 1 or 2 seats that must hold a matching card
  createdBySeat: number;
}

export type FloorItem =
  | { kind: 'loose'; card: Card }
  | { kind: 'house'; house: House };

export interface Floor {
  loose: Card[];
  houses: House[];
}

export type Difficulty = 'low' | 'medium' | 'high';

export interface Seat {
  index: number; // 0..3
  playerId: string | null; // socket/user id, null if unfilled
  name: string;
  isBot: boolean;
  botDifficulty: Difficulty;
  teamId: 0 | 1; // seats 0,2 -> team 0 ; seats 1,3 -> team 1
  hand: Card[];
  connected: boolean;
}

export interface TeamState {
  id: 0 | 1;
  capturedPiles: Card[]; // all captured cards, face down conceptually
  sweepCards: Card[]; // cards used to make sweeps (for score reference display)
  sweepBonuses: number[]; // bonus point values recorded
  runningScoreThisBaazi: number; // computed at deal end, accumulated across deals until baazi
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
  cards: Card[]; // loose cards forming one summing group, OR house cards if house capture
  isHouse: boolean;
  houseId?: string;
}

export interface CaptureOption {
  type: 'capture';
  groups: CaptureGroup[]; // disjoint groups chosen (maximal partition variant)
}

export interface BuildOption {
  type: 'build';
  mode: 'new_house' | 'add_to_house' | 'cement' | 'break_house';
  targetValue: number;
  looseCardIds: string[]; // loose cards consumed from floor
  breakHouseId?: string; // if breaking another player's ordinary house
  resultHouseId?: string; // existing house being added to / cemented
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
  turnsPlayed: number; // total card-plays this deal (0..48)
  firstPlayDone: boolean;
  lastCapturingTeam: 0 | 1 | null;
  baaziScoreDiff: number; // signed relative to team 0 (positive => team0 leading)
  baaziWinnerTeam: 0 | 1 | null;
  dealNumber: number;
  history: DealRecord[];
  log: string[];
  targetBaaziMargin: number; // default 100
  pendingRedeal: boolean;
}
