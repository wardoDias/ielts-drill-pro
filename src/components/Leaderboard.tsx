import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

interface LeaderRow {
  id: string;
  username: string;
  avatar_url: string | null;
  total_xp: number;
  rank: number;
}

const BADGE_CONFIG: { min: number; label: string; color: string }[] = [
  { min: 1000, label: 'Band 9', color: 'text-yellow-400 bg-yellow-900/40 border-yellow-600' },
  { min: 600,  label: 'Band 8', color: 'text-emerald-400 bg-emerald-900/40 border-emerald-600' },
  { min: 300,  label: 'Band 7', color: 'text-blue-400 bg-blue-900/40 border-blue-600' },
  { min: 100,  label: 'Band 6', color: 'text-purple-400 bg-purple-900/40 border-purple-600' },
  { min: 0,    label: 'Band 5', color: 'text-slate-400 bg-slate-700/40 border-slate-500' },
];

function getBadge(xp: number) {
  return BADGE_CONFIG.find((b) => xp >= b.min) ?? BADGE_CONFIG[BADGE_CONFIG.length - 1];
}

const RANK_MEDALS = ['🥇', '🥈', '🥉'];

export default function Leaderboard() {
  const [leaders, setLeaders] = useState<LeaderRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('profiles')
      .select('id, username, avatar_url, total_xp')
      .order('total_xp', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (data) {
          setLeaders(
            data.map((row, i) => ({ ...row, rank: i + 1 } as LeaderRow))
          );
        }
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-7 h-7 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
        <h2 className="text-slate-200 font-semibold text-lg">Global Leaderboard</h2>
        <span className="text-xs text-slate-500">by XP</span>
      </div>
      {leaders.length === 0 ? (
        <p className="text-slate-500 text-sm p-6 text-center">No leaders yet. Be the first!</p>
      ) : (
        <ul className="divide-y divide-slate-800">
          {leaders.map((leader) => {
            const badge = getBadge(leader.total_xp);
            return (
              <li
                key={leader.id}
                className="flex items-center gap-4 px-6 py-3 hover:bg-slate-800/50 transition-colors"
              >
                <span className="w-8 text-center text-lg font-bold text-slate-400">
                  {leader.rank <= 3 ? RANK_MEDALS[leader.rank - 1] : `#${leader.rank}`}
                </span>
                <div className="w-9 h-9 rounded-full bg-emerald-800 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {leader.avatar_url ? (
                    <img src={leader.avatar_url} alt={leader.username} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-emerald-300 text-sm font-bold uppercase">
                      {leader.username.slice(0, 2)}
                    </span>
                  )}
                </div>
                <span className="flex-1 text-slate-200 font-medium truncate">{leader.username}</span>
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded-full border ${badge.color}`}
                >
                  {badge.label}
                </span>
                <span className="text-emerald-400 font-bold text-sm w-20 text-right">
                  {leader.total_xp.toLocaleString()} XP
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}