import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { DAILY_CHALLENGES } from '@shared/challenges';
import { TRACK } from '@shared/track';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from '@/components/ui/table';

interface ResultRow {
  mode: string;
  position: number;
  metric: number;
}

function todayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function DailyChallenges() {
  const { session, refreshProfile } = useAuth();
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [claimed, setClaimed] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase || !session) return;
    const uid = session.user.id;
    const [{ data: res }, { data: cl }] = await Promise.all([
      supabase
        .from('race_results')
        .select('mode, position, metric')
        .eq('profile_id', uid)
        .gte('created_at', todayIso()),
      supabase.from('daily_claims').select('challenge_id').gte('day', todayIso().slice(0, 10)),
    ]);
    setRows((res as ResultRow[]) ?? []);
    setClaimed(new Set((cl ?? []).map((c) => (c as { challenge_id: number }).challenge_id)));
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  const claim = async (id: number) => {
    if (!supabase) return;
    setBusy(id);
    setMsg(null);
    const { error } = await supabase.rpc('claim_daily', { p_challenge_id: id });
    if (error) setMsg(error.message);
    else {
      await Promise.all([load(), refreshProfile()]);
    }
    setBusy(null);
  };

  if (!supabase || !session) {
    return <p className="text-muted-foreground">Entre com uma conta para acompanhar e resgatar os desafios diários.</p>;
  }

  return (
    <>
      {msg && <p className="mb-3 text-sm text-destructive">{msg}</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {DAILY_CHALLENGES.map((c) => {
          const progress = Math.min(c.goal, c.progress(rows));
          const done = progress >= c.goal;
          const already = claimed.has(c.id);
          const pct = Math.round((progress / c.goal) * 100);
          return (
            <Card key={c.id} className="border-white/10 bg-white/[0.03]">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{c.title}</CardTitle>
                  <Badge variant="secondary">+{c.reward}</Badge>
                </div>
                <CardDescription>{c.desc}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    {progress.toLocaleString('pt-BR')}/{c.goal.toLocaleString('pt-BR')}
                  </span>
                  <Button
                    size="sm"
                    disabled={!done || already || busy === c.id}
                    onClick={() => void claim(c.id)}
                  >
                    {already ? 'Resgatado' : busy === c.id ? '...' : 'Resgatar'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}

interface Player {
  profile_id: string;
  nick: string;
  best_metric: number;
}

function fmtTime(ms: number): string {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const c = Math.floor((ms % 1000) / 10);
  return `${m}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
}

export function FriendsPanel() {
  const { session } = useAuth();
  const [top, setTop] = useState<Player[]>([]);
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase || !session) return;
    const [{ data: lb }, { data: fr }] = await Promise.all([
      supabase
        .from('leaderboards')
        .select('profile_id, nick, best_metric')
        .eq('mode', 'circuit')
        .eq('track', TRACK.id)
        .order('best_metric', { ascending: true })
        .limit(20),
      supabase.from('friendships').select('friend_id'),
    ]);
    setTop((lb as Player[]) ?? []);
    setFriendIds(new Set((fr ?? []).map((f) => (f as { friend_id: string }).friend_id)));
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (id: string, isFriend: boolean) => {
    if (!supabase) return;
    setMsg(null);
    const { error } = await supabase.rpc(isFriend ? 'remove_friend' : 'add_friend', {
      p_friend_id: id,
    });
    if (error) setMsg(error.message);
    else await load();
  };

  if (!supabase || !session) {
    return <p className="text-muted-foreground">Entre com uma conta para seguir amigos.</p>;
  }

  const uid = session.user.id;
  const friends = top.filter((p) => friendIds.has(p.profile_id));
  const others = top.filter((p) => p.profile_id !== uid && !friendIds.has(p.profile_id));

  return (
    <>
      {msg && <p className="mb-3 text-sm text-destructive">{msg}</p>}
      {friends.length > 0 && (
        <>
          <h3 className="mb-2 mt-2 text-sm font-semibold">Seus amigos</h3>
          <Table>
            <TableBody>
              {friends.map((p) => (
                <TableRow key={p.profile_id}>
                  <TableCell>{p.nick}</TableCell>
                  <TableCell>{fmtTime(p.best_metric)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => void toggle(p.profile_id, true)}>
                      Remover
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
      <h3 className="mb-2 mt-3 text-sm font-semibold">Adicionar do ranking</h3>
      {others.length === 0 ? (
        <p className="text-muted-foreground">Sem pilotos para adicionar por enquanto.</p>
      ) : (
        <Table>
          <TableBody>
            {others.slice(0, 8).map((p) => (
              <TableRow key={p.profile_id}>
                <TableCell>{p.nick}</TableCell>
                <TableCell>{fmtTime(p.best_metric)}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" onClick={() => void toggle(p.profile_id, false)}>
                    Amigo
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
