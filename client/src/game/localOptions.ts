// Thin adapters that let any client compute its own legal moves locally
// (bids, captures, builds) using the pure engine, without a round trip to a
// server. Safe because these functions only ever read floor state (public)
// and the CALLING seat's own hand (which is always real/unmasked for the
// viewer of a client-side GameState) - they never touch other seats' hands.
import { optionsForCard as engineOptionsForCard, validBidValues as engineValidBidValues } from './engine/engine';
import { GameState as PublicGameState, PlayableCardOptions } from './types';

export function validBidsLocal(state: PublicGameState): number[] {
  return engineValidBidValues(state as any);
}

export function optionsForCardLocal(state: PublicGameState, seat: number, cardId: string): PlayableCardOptions {
  return engineOptionsForCard(state as any, seat, cardId) as any;
}
