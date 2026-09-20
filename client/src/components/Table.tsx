import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGameStore } from '../store/game';
import { useSettings, effectiveQuality } from '../store/settings';
import { ack } from '../lib/socket';
import PlayingCard from './PlayingCard';
import Floor from './Floor';
import BidPanel from './BidPanel';
import ScoreBar from './ScoreBar';
import ActionPicker from './ActionPicker';
import SettingsDrawer from './SettingsDrawer';
import { BuildOption, Card, CaptureOption, PlayOption, ThrowOption, scoreValue } from '../game/types';

export default function Table() {
  const state = useGameStore((s) => s.state!);
  const seat = useGameStore((s) => s.seat!);
  const setError = useGameStore((s) => s.setError);
  const error = useGameStore((s) => s.error);
  const { quality, cardSkin } = useSettings();
  const highQuality = effectiveQuality(quality) === 'high';

  const [bidValues, setBidValues] = useState<number[] | null>(null);
  const [picker, setPicker] = useState<{
    card: Card;
    captures: CaptureOption[];
    builds: BuildOption[];
    throwAllowed: boolean;
  } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pendingCardId, setPendingCardId] = useState<string | null>(null);

  const isMyBid = state.phase === 'awaiting_bid' && state.bidderSeat === seat;
  const isMyTurn = (state.phase === 'playing' || state.phase === 'bidder_first_action') && state.turnSeat === seat;

  useEffect(() => {
    if (isMyBid) {
      ack<{ ok: true; values: number[] }>('game:validBids', {}).then((r) => setBidValues(r.values)).catch(() => {});
    } else {
      setBidValues(null);
    }
  }, [isMyBid, state.dealNumber]);

  async function handleBid(v: number) {
    try {
      await ack('game:bid', { value: v });
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function handleCardClick(card: Card) {
    if (!isMyTurn) return;
    setPendingCardId(card.id);
    try {
      const res: any = await ack('game:optionsForCard', { cardId: card.id });
      const { captures, builds, throwAllowed } = res.options;
      const total = captures.length + builds.length + (throwAllowed ? 1 : 0);
      if (total <= 1) {
        const option: PlayOption = captures[0] ?? builds[0] ?? { type: 'throw' };
        await playOption(card.id, option);
      } else {
        setPicker({ card, captures, builds, throwAllowed });
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setPendingCardId(null);
    }
  }

  async function playOption(cardId: string, option: PlayOption) {
    try {
      await ack('game:play', { cardId, option });
      setPicker(null);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function handleContinueDeal() {
    try {
      await ack('game:continueDeal', {});
    } catch (e: any) {
      // likely auto-continued already server-side; ignore
    }
  }

  const relSeat = (idx: number) => (idx - seat + 4) % 4;
  const seatsByPos = useMemo(() => {
    const map: Record<number, (typeof state.seats)[number]> = {};
    state.seats.forEach((s) => (map[relSeat(s.index)] = s));
    return map;
  }, [state.seats, seat]);

  const mySeatObj = state.seats[seat];
  const myHand = (mySeatObj?.hand ?? []).filter(Boolean) as Card[];

  const lastLog = state.log[state.log.length - 1];

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'radial-gradient(ellipse at center, var(--felt-1), var(--felt-2) 78%)',
      }}
    >
      <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <ScoreBar state={state} mySeat={seat} />
        <button className="btn" onClick={() => setSettingsOpen(true)}>
          &#9881;&#65039; Settings
        </button>
      </div>

      <div style={{ flex: 1, display: 'grid', gridTemplateRows: 'auto 1fr auto', gap: 8, padding: '0 20px 12px', position: 'relative' }}>
        <SeatRow seatObj={seatsByPos[2]} state={state} skin={cardSkin} highQuality={highQuality} align="center" label="Partner" />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <SeatColumn seatObj={seatsByPos[3]} state={state} skin={cardSkin} highQuality={highQuality} label="Left" />
          <div style={{ flex: 1 }}>
            <Floor floor={state.floor} skin={cardSkin} highQuality={highQuality} />
            {lastLog && (
              <div style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--ink-dim)', marginTop: 2 }}>{lastLog}</div>
            )}
          </div>
          <SeatColumn seatObj={seatsByPos[1]} state={state} skin={cardSkin} highQuality={highQuality} label="Right" />
        </div>

        <div>
          <div
            style={{
              textAlign: 'center',
              fontSize: 12,
              color: isMyTurn ? 'var(--gold-bright)' : 'var(--ink-dim)',
              marginBottom: 6,
              minHeight: 16,
            }}
          >
            {isMyTurn ? 'Your turn — tap a card to play' : state.turnSeat !== null ? `${state.seats[state.turnSeat].name}'s turn` : ''}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', paddingBottom: 10 }}>
            {myHand
              .slice()
              .sort((a, b) => a.rank - b.rank || a.suit.localeCompare(b.suit))
              .map((c) => (
                <div key={c.id} style={{ marginLeft: -14 }}>
                  <PlayingCard
                    card={c}
                    skin={cardSkin}
                    highQuality={highQuality}
                    width={72}
                    onClick={isMyTurn ? () => handleCardClick(c) : undefined}
                    selected={pendingCardId === c.id}
                    dim={!isMyTurn}
                  />
                </div>
              ))}
          </div>
        </div>
      </div>

      {isMyBid && bidValues && bidValues.length > 0 && <BidPanel values={bidValues} onBid={handleBid} />}

      <AnimatePresence>
        {picker && (
          <ActionPicker
            card={picker.card}
            captures={picker.captures}
            builds={picker.builds}
            throwAllowed={picker.throwAllowed}
            onChoose={(opt) => playOption(picker.card.id, opt)}
            onCancel={() => setPicker(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {(state.phase === 'deal_scoring' || state.phase === 'baazi_won') && (
          <DealResultOverlay state={state} onContinue={handleContinueDeal} />
        )}
      </AnimatePresence>

      {error && (
        <div
          style={{ position: 'fixed', top: 10, left: '50%', transform: 'translateX(-50%)', color: 'var(--danger)', fontSize: 13, zIndex: 60 }}
          className="panel"
        >
          <div style={{ padding: '6px 14px' }}>{error}</div>
        </div>
      )}

      {settingsOpen && <SettingsDrawer onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

function SeatRow({ seatObj, state, skin, highQuality, align, label }: any) {
  if (!seatObj) return <div />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <SeatBadge seatObj={seatObj} state={state} label={label} />
      <div style={{ display: 'flex', gap: 4 }}>
        {Array.from({ length: Math.min(seatObj.handCount, 13) }).map((_, i) => (
          <div key={i} style={{ marginLeft: i === 0 ? 0 : -32 }}>
            <PlayingCard faceDown skin={skin} highQuality={highQuality} width={40} />
          </div>
        ))}
      </div>
    </div>
  );
}

function SeatColumn({ seatObj, state, skin, highQuality, label }: any) {
  if (!seatObj) return <div style={{ width: 60 }} />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: 'auto', minWidth: 60 }}>
      <SeatBadge seatObj={seatObj} state={state} label={label} />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {Array.from({ length: Math.min(seatObj.handCount, 13) }).map((_, i) => (
          <div key={i} style={{ marginTop: i === 0 ? 0 : -60 }}>
            <PlayingCard faceDown skin={skin} highQuality={highQuality} width={36} />
          </div>
        ))}
      </div>
    </div>
  );
}

function SeatBadge({ seatObj, state, label }: any) {
  const isTurn = state.turnSeat === seatObj.index || (state.phase === 'awaiting_bid' && state.bidderSeat === seatObj.index);
  return (
    <div
      className="panel"
      style={{
        padding: '4px 10px',
        fontSize: 11.5,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        whiteSpace: 'nowrap',
        boxShadow: isTurn ? '0 0 0 2px var(--gold-bright)' : undefined,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 99, background: seatObj.connected ? 'var(--success)' : 'var(--danger)', display: 'inline-block', flexShrink: 0 }} />
      {seatObj.isBot ? `Bot · ${seatObj.botDifficulty}` : seatObj.name}
    </div>
  );
}

function DealResultOverlay({ state, onContinue }: { state: ReturnType<typeof useGameStore.getState>['state']; onContinue: () => void }) {
  if (!state) return null;
  const last = state.history[state.history.length - 1];
  const baaziWon = state.phase === 'baazi_won';
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(4,10,7,0.72)', display: 'grid', placeItems: 'center', zIndex: 55 }}
    >
      <motion.div initial={{ scale: 0.9, y: 14 }} animate={{ scale: 1, y: 0 }} className="panel" style={{ padding: 26, width: 'min(420px, 92%)', textAlign: 'center' }}>
        {baaziWon ? (
          <>
            <div style={{ fontSize: 34 }}>&#127942;</div>
            <h2 className="gold-text" style={{ fontFamily: 'Georgia, serif' }}>
              {state.baaziWinnerTeam === 0 ? 'Team A' : 'Team B'} wins the Baazi!
            </h2>
          </>
        ) : (
          <h3 style={{ fontFamily: 'Georgia, serif' }} className="gold-text">
            Deal #{last?.dealNumber} complete
          </h3>
        )}
        {last && (
          <div style={{ fontSize: 14, marginBottom: 14 }}>
            Team A {last.teamScores[0]} &mdash; {last.teamScores[1]} Team B
            {last.instantBaazi && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4 }}>Instant Baazi — a team scored under 9 points.</div>}
          </div>
        )}
        <button className="btn btn-primary" onClick={onContinue}>
          {baaziWon ? 'Play another Baazi' : 'Continue to next deal'}
        </button>
      </motion.div>
    </motion.div>
  );
}
