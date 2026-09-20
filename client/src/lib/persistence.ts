import { supabase } from './supabase';
import { GameState } from '../game/engine/types';

export async function ensureProfile(name: string, deviceId: string): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data: existing } = await supabase.from('profiles').select('id').eq('device_id', deviceId).maybeSingle();
    if (existing) {
      await supabase.from('profiles').update({ name }).eq('id', existing.id);
      return existing.id as string;
    }
    const { data, error } = await supabase.from('profiles').insert({ name, device_id: deviceId }).select('id').single();
    if (error) {
      console.error('[supabase] ensureProfile failed', error.message);
      return null;
    }
    return data.id as string;
  } catch (e) {
    console.error('[supabase] ensureProfile error', e);
    return null;
  }
}

export interface PersistSeatInfo {
  profileId: string | null;
  seat: number;
  teamId: 0 | 1;
  isBot: boolean;
  botDifficulty: string | null;
  name: string;
}

export async function persistFinishedGame(roomId: string, state: GameState, seatProfiles: PersistSeatInfo[]): Promise<void> {
  if (!supabase) return;
  try {
    const { data: game, error: gameErr } = await supabase
      .from('games')
      .insert({
        room_id: roomId,
        winner_team: state.baaziWinnerTeam,
        target_margin: state.targetBaaziMargin,
        deals_played: state.dealNumber,
        ended_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (gameErr || !game) {
      console.error('[supabase] persistFinishedGame insert failed', gameErr?.message);
      return;
    }

    const rows = seatProfiles.map((s) => ({
      game_id: game.id,
      profile_id: s.profileId,
      seat: s.seat,
      team_id: s.teamId,
      is_bot: s.isBot,
      bot_difficulty: s.botDifficulty,
      display_name: s.name,
      won: s.teamId === state.baaziWinnerTeam,
    }));
    await supabase.from('game_players').insert(rows);

    for (const s of seatProfiles) {
      if (!s.profileId) continue;
      if (s.teamId === state.baaziWinnerTeam) await awardBadge(s.profileId, 'first_win', game.id);
      const sweeps = state.teams[s.teamId].sweepBonuses.length;
      if (sweeps >= 2) await awardBadge(s.profileId, 'sweep_master', game.id);
    }
  } catch (e) {
    console.error('[supabase] persistFinishedGame error', e);
  }
}

async function awardBadge(profileId: string, badgeKey: string, gameId: string) {
  if (!supabase) return;
  const { data: badge } = await supabase.from('badges').select('id').eq('key', badgeKey).maybeSingle();
  if (!badge) return;
  const { data: existing } = await supabase
    .from('profile_badges')
    .select('id')
    .eq('profile_id', profileId)
    .eq('badge_id', badge.id)
    .maybeSingle();
  if (existing) return;
  await supabase.from('profile_badges').insert({ profile_id: profileId, badge_id: badge.id, game_id: gameId });
}

export async function fetchProfileSummary(deviceId: string) {
  if (!supabase) return null;
  const { data: profile } = await supabase.from('profiles').select('*').eq('device_id', deviceId).maybeSingle();
  if (!profile) return null;
  const { data: badges } = await supabase
    .from('profile_badges')
    .select('awarded_at, badges(key, name, description, icon)')
    .eq('profile_id', profile.id);
  const { data: games } = await supabase
    .from('game_players')
    .select('won, games(ended_at, winner_team, room_id)')
    .eq('profile_id', profile.id)
    .order('id', { ascending: false })
    .limit(20);
  return { profile, badges: badges ?? [], recentGames: games ?? [] };
}
