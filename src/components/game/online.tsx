import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Flag, LogOut, Send, UserPlus, Check, X, Trophy, Lightbulb } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { engineById } from "@/lib/engines";
import { useGame } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Panel } from "./ui";

export type OnlineRace = { id: string; opponent: string; opponentEt: number | null };

type Friend = { id: string; other: string; name: string; status: string; incoming: boolean };
type Race = { id: string; host: string; guest: string; status: string; host_engine: string; guest_engine: string | null; host_et: number | null; guest_et: number | null; created_at: string };

function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    supabase.auth.getSession().then(({ data: d }) => { setSession(d.session); setReady(true); });
    return () => data.subscription.unsubscribe();
  }, []);
  return { session, ready };
}

const input = "min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 text-sm";
const btn = "font-display rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground uppercase disabled:opacity-50";

function AuthForm() {
  const [mode, setMode] = useState<"in" | "up">("up");
  const [email, setEmail] = useState(""); const [pw, setPw] = useState(""); const [username, setUsername] = useState("");
  const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault(); setBusy(true); setMsg("");
    if (mode === "up") {
      if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) { setMsg("Username: 3–20 letters, numbers or _"); setBusy(false); return; }
      const { error } = await supabase.auth.signUp({ email, password: pw, options: { data: { username }, emailRedirectTo: window.location.origin } });
      setMsg(error ? error.message : "Check your email to confirm your account, then sign in.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
      if (error) setMsg(error.message);
    }
    setBusy(false);
  };
  const google = async () => {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (r.error) setMsg(r.error.message);
  };
  return (
    <Panel title="Join online racing">
      <p className="mb-3 text-sm text-muted-foreground">Pick a username, add friends and race them over the quarter mile.</p>
      <button onClick={google} className="mb-3 w-full rounded-lg border py-2.5 text-sm font-bold">Continue with Google</button>
      <form onSubmit={submit} className="space-y-2">
        {mode === "up" && <input className={cn(input, "w-full")} placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />}
        <input className={cn(input, "w-full")} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        <input className={cn(input, "w-full")} type="password" placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={6} autoComplete={mode === "up" ? "new-password" : "current-password"} />
        <button disabled={busy} className={cn(btn, "w-full")}>{mode === "up" ? "Create account" : "Sign in"}</button>
      </form>
      {msg && <p className="mt-2 text-sm text-primary">{msg}</p>}
      <button onClick={() => { setMode(mode === "up" ? "in" : "up"); setMsg(""); }} className="mt-3 w-full text-center text-xs text-muted-foreground underline">
        {mode === "up" ? "Already have an account? Sign in" : "New here? Create an account"}
      </button>
    </Panel>
  );
}

export function OnlineScreen({ onRace }: { onRace: (r: OnlineRace) => void }) {
  const { session, ready } = useSession();
  if (!ready) return <p className="text-center text-sm text-muted-foreground">Loading…</p>;
  return (
    <div className="space-y-3">
      <div><div className="text-[10px] tracking-[0.3em] text-primary uppercase">Online</div><h2 className="font-display text-2xl font-bold">Race your friends</h2></div>
      {session ? <Lobby uid={session.user.id} onRace={onRace} /> : <AuthForm />}
    </div>
  );
}

function Lobby({ uid, onRace }: { uid: string; onRace: (r: OnlineRace) => void }) {
  const g = useGame();
  const [me, setMe] = useState(""); const [edit, setEdit] = useState("");
  const [friends, setFriends] = useState<Friend[]>([]); const [races, setRaces] = useState<Race[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [add, setAdd] = useState(""); const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const [{ data: prof }, { data: fr }, { data: rc }] = await Promise.all([
      supabase.from("profiles").select("username").eq("id", uid).maybeSingle(),
      supabase.from("friendships").select("*"),
      supabase.from("races").select("*").order("created_at", { ascending: false }).limit(20),
    ]);
    if (prof) { setMe(prof.username); setEdit((e) => e || prof.username); }
    const ids = new Set<string>();
    (fr ?? []).forEach((f) => ids.add(f.requester === uid ? f.addressee : f.requester));
    (rc ?? []).forEach((r) => ids.add(r.host === uid ? r.guest : r.host));
    const nm: Record<string, string> = {};
    if (ids.size) { const { data: ps } = await supabase.from("profiles").select("id, username").in("id", [...ids]); (ps ?? []).forEach((p) => (nm[p.id] = p.username)); }
    setNames(nm);
    setFriends((fr ?? []).map((f) => { const other = f.requester === uid ? f.addressee : f.requester; return { id: f.id, other, name: nm[other] ?? "racer", status: f.status, incoming: f.addressee === uid }; }));
    setRaces((rc ?? []) as Race[]);
  }, [uid]);

  useEffect(() => {
    void load();
    const ch = supabase.channel(`lobby-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "races" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [load]);

  const rpc = async (p: PromiseLike<{ error: { message: string } | null; data?: unknown }>, ok?: string) => {
    const { error } = await p; setMsg(error ? error.message : ok ?? ""); void load();
  };
  const saveName = () => {
    if (!/^[A-Za-z0-9_]{3,20}$/.test(edit)) { setMsg("Username: 3–20 letters, numbers or _"); return; }
    void rpc(supabase.from("profiles").update({ username: edit }).eq("id", uid), "Username saved");
  };
  const signOut = async () => { await supabase.auth.signOut(); };
  const engineName = g.engineId;

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Panel title="Your racer">
        <div className="flex gap-2">
          <input className={input} value={edit} onChange={(e) => setEdit(e.target.value)} aria-label="Username" />
          <button onClick={saveName} disabled={edit === me} className={btn}>Save</button>
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>Racing as <b className="text-foreground">{me || "…"}</b> · {engineById(g.engineId).name}</span>
          <button onClick={signOut} className="flex items-center gap-1 underline"><LogOut className="h-3 w-3" />Sign out</button>
        </div>
      </Panel>
      <Panel title="Friends">
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (add.trim()) { void rpc(supabase.rpc("send_friend_request", { p_username: add.trim() }).then((r) => { if (!r.error) setAdd(""); return r; }), "Friend request sent"); } }}>
          <input className={input} placeholder="Friend's username" value={add} onChange={(e) => setAdd(e.target.value)} />
          <button className={cn(btn, "flex items-center gap-1")}><UserPlus className="h-4 w-4" />Add</button>
        </form>
        <ul className="mt-3 space-y-2">
          {friends.map((f) => (
            <li key={f.id} className="flex items-center gap-2 rounded-lg border bg-background/40 p-2 text-sm">
              <span className="min-w-0 flex-1 truncate font-bold">{f.name}</span>
              {f.status === "accepted" ? (
                <button onClick={() => void rpc(supabase.rpc("challenge_friend", { p_friend: f.other, p_engine: engineName }), `Challenge sent to ${f.name}`)} className="flex items-center gap-1 rounded-md bg-primary/15 px-3 py-1.5 text-xs text-primary uppercase"><Flag className="h-3 w-3" />Challenge</button>
              ) : f.incoming ? (
                <button onClick={() => void rpc(supabase.rpc("accept_friend", { p_id: f.id }), "Friend added")} className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground uppercase">Accept</button>
              ) : <span className="text-xs text-muted-foreground">Pending</span>}
              <button aria-label="Remove friend" onClick={() => void rpc(supabase.from("friendships").delete().eq("id", f.id))} className="p-1 text-muted-foreground"><X className="h-4 w-4" /></button>
            </li>
          ))}
          {friends.length === 0 && <li className="text-sm text-muted-foreground">No friends yet — add one by username.</li>}
        </ul>
      </Panel>
      <Panel title="Races" className="md:col-span-2">
        <ul className="space-y-2">
          {races.map((r) => {
            const host = r.host === uid, opp = names[host ? r.guest : r.host] ?? "racer";
            const myEt = host ? r.host_et : r.guest_et, theirEt = host ? r.guest_et : r.host_et;
            const oppEngine = host ? r.guest_engine : r.host_engine;
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border bg-background/40 p-2 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold">vs {opp}</div>
                  <div className="truncate text-xs text-muted-foreground">{oppEngine ? engineById(oppEngine).name : "—"} · {r.status}</div>
                </div>
                {r.status === "finished" && myEt != null && theirEt != null && (
                  <span className={cn("flex items-center gap-1 font-mono text-xs", Number(myEt) < Number(theirEt) ? "text-ok" : "text-primary")}>
                    <Trophy className="h-3 w-3" />{Number(myEt) < Number(theirEt) ? "WIN" : "LOSS"} {Number(myEt).toFixed(2)} / {Number(theirEt).toFixed(2)}s
                  </span>
                )}
                {r.status === "invited" && !host && <>
                  <button onClick={() => void rpc(supabase.rpc("respond_race", { p_id: r.id, p_accept: true, p_engine: engineName }))} className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground uppercase"><Check className="h-3 w-3" />Accept</button>
                  <button onClick={() => void rpc(supabase.rpc("respond_race", { p_id: r.id, p_accept: false, p_engine: engineName }))} className="rounded-md border px-3 py-1.5 text-xs uppercase">Decline</button>
                </>}
                {r.status === "invited" && host && <span className="text-xs text-muted-foreground">Waiting for {opp}…</span>}
                {r.status === "accepted" && myEt == null && (
                  <button onClick={() => onRace({ id: r.id, opponent: opp, opponentEt: theirEt == null ? null : Number(theirEt) })} className="font-display flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground uppercase"><Flag className="h-3 w-3" />Race now</button>
                )}
                {r.status === "accepted" && myEt != null && <span className="text-xs text-muted-foreground">Your time {Number(myEt).toFixed(2)}s · waiting for {opp}</span>}
                {(r.status === "invited" || r.status === "accepted") && myEt == null && (
                  <button aria-label="Cancel race" onClick={() => void rpc(supabase.rpc("cancel_race", { p_id: r.id }))} className="p-1 text-muted-foreground"><X className="h-4 w-4" /></button>
                )}
              </li>
            );
          })}
          {races.length === 0 && <li className="text-sm text-muted-foreground">No races yet — challenge a friend.</li>}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">Each racer runs their own quarter mile; the lowest time wins.</p>
      </Panel>
      {msg && <p className="text-sm text-primary md:col-span-2">{msg}</p>}
    </div>
  );
}

export async function submitOnlineTime(id: string, et: number) {
  const { error } = await supabase.rpc("submit_race_time", { p_id: id, p_et: +et.toFixed(3) });
  return error?.message ?? null;
}

export function IdeaBox() {
  const [name, setName] = useState(""); const [text, setText] = useState(""); const [state, setState] = useState<"" | "sending" | "sent" | string>("");
  const send = async (ev: React.FormEvent) => {
    ev.preventDefault(); if (text.trim().length < 3) return;
    setState("sending");
    const { data } = await supabase.auth.getSession();
    const { error } = await supabase.from("ideas").insert({ message: text.trim().slice(0, 1000), name: name.trim().slice(0, 60) || null, user_id: data.session?.user.id ?? null });
    if (error) setState(error.message); else { setState("sent"); setText(""); }
  };
  return (
    <Panel title="Idea box">
      <form onSubmit={send} className="space-y-2">
        <p className="flex items-center gap-1 text-xs text-muted-foreground"><Lightbulb className="h-3 w-3" />Got an idea for a new engine or feature? Send it to the owner.</p>
        <input className={cn(input, "w-full")} placeholder="Your name (optional)" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        <textarea className={cn(input, "min-h-20 w-full")} placeholder="Your idea…" value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} />
        <button disabled={state === "sending" || text.trim().length < 3} className={cn(btn, "flex w-full items-center justify-center gap-1")}><Send className="h-4 w-4" />Send idea</button>
        {state === "sent" && <p className="text-sm text-ok">Thanks! Your idea was sent.</p>}
        {state && state !== "sent" && state !== "sending" && <p className="text-sm text-primary">{state}</p>}
      </form>
    </Panel>
  );
}
