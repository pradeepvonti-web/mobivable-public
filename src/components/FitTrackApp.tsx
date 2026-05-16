import { useMemo, useState } from "react";
import {
  Home,
  Plus,
  BarChart3,
  Clock,
  User,
  Footprints,
  Timer,
  Flame,
  Zap,
  HeartPulse,
  ChevronLeft,
  Settings,
  Target,
} from "lucide-react";

type Activity = {
  id: string;
  type: string;
  duration: number;
  calories: number;
  notes: string;
  at: number;
};

type Tab = "home" | "log" | "summary" | "history" | "profile";

const CAL_GOAL = 2000;
const STEPS_GOAL = 10000;
const ACTIVE_GOAL = 60;

const ACTIVITY_TYPES = [
  "Running",
  "Walking",
  "Cycling",
  "Yoga",
  "Strength",
  "Swimming",
  "HIIT",
];

export function FitTrackApp() {
  const [tab, setTab] = useState<Tab>("home");
  const [activities, setActivities] = useState<Activity[]>([]);

  const totals = useMemo(() => {
    const calories = activities.reduce((s, a) => s + a.calories, 0);
    const active = activities.reduce((s, a) => s + a.duration, 0);
    // rough estimate: 1 active min ~ 120 steps
    const steps = active * 120;
    return { calories, active, steps };
  }, [activities]);

  function addActivity(a: Omit<Activity, "id" | "at">) {
    setActivities((prev) => [
      { ...a, id: crypto.randomUUID(), at: Date.now() },
      ...prev,
    ]);
    setTab("home");
  }

  return (
    <div className="flex flex-col h-full w-full bg-[#070b18] text-slate-100 font-sans">
      <div className="flex-1 overflow-y-auto pb-20 no-scrollbar">
        {tab === "home" && <HomeScreen totals={totals} activities={activities} onLog={() => setTab("log")} />}
        {tab === "log" && <LogScreen onSave={addActivity} onBack={() => setTab("home")} />}
        {tab === "summary" && <SummaryScreen totals={totals} />}
        {tab === "history" && <HistoryScreen activities={activities} />}
        {tab === "profile" && <ProfileScreen />}
      </div>
      <BottomNav tab={tab} onChange={setTab} />
    </div>
  );
}

/* ---------- HOME ---------- */
function HomeScreen({
  totals,
  activities,
  onLog,
}: {
  totals: { calories: number; active: number; steps: number };
  activities: Activity[];
  onLog: () => void;
}) {
  const now = new Date();
  const dateStr = now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const pct = Math.min(100, Math.round((totals.calories / CAL_GOAL) * 100));

  return (
    <div className="px-5 pt-6 space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Good morning, Alex!</h1>
        <p className="text-sm text-slate-400">{dateStr}</p>
      </div>

      <Card>
        <div className="flex flex-col items-center py-3">
          <CalorieRing value={totals.calories} goal={CAL_GOAL} />
          <div className="mt-3 inline-flex items-center gap-1.5 text-amber-400 text-xs font-medium">
            <Zap className="h-3.5 w-3.5 fill-amber-400" />
            {pct}% Goal
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-3 gap-2.5">
        <StatCard icon={<Footprints className="h-4 w-4 text-emerald-400" />} value={totals.steps} label="Steps" />
        <StatCard icon={<Timer className="h-4 w-4 text-sky-400" />} value={totals.active} label="Active Mins" />
        <StatCard icon={<Flame className="h-4 w-4 text-orange-400" />} value={totals.calories} label="Calories" />
      </div>

      <button
        type="button"
        onClick={onLog}
        className="w-full flex items-center justify-center gap-2 bg-sky-400 hover:bg-sky-300 text-slate-900 font-semibold py-3.5 rounded-2xl shadow-lg shadow-sky-500/20 transition-colors"
      >
        <Plus className="h-4 w-4" />
        Log Activity
      </button>

      <div>
        <h2 className="text-base font-semibold mb-2.5">Recent Activity</h2>
        {activities.length === 0 ? (
          <Card>
            <div className="flex flex-col items-center text-center py-6">
              <div className="h-10 w-10 rounded-full bg-slate-800/80 grid place-items-center mb-2">
                <HeartPulse className="h-5 w-5 text-sky-400" />
              </div>
              <p className="text-sm font-medium">No activities logged today</p>
              <p className="text-xs text-slate-400 mt-1">Tap "Log Activity" to get started!</p>
            </div>
          </Card>
        ) : (
          <ul className="space-y-2">
            {activities.slice(0, 3).map((a) => (
              <ActivityRow key={a.id} a={a} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function CalorieRing({ value, goal }: { value: number; goal: number }) {
  const size = 170;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(1, value / goal);
  const dash = c * pct;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#1a2342" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="url(#ringGrad)"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
        />
        <defs>
          <linearGradient id="ringGrad" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#7dd3fc" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-2xl font-bold">
          {value} <span className="text-slate-500 font-medium">/ {goal}</span>
        </p>
        <p className="text-[11px] text-slate-400 uppercase tracking-wider mt-0.5">kcal Burned</p>
      </div>
    </div>
  );
}

function StatCard({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="rounded-2xl bg-slate-900/60 border border-slate-800/60 p-3 flex flex-col items-center">
      <div className="h-7 w-7 rounded-full bg-slate-800/70 grid place-items-center mb-1.5">{icon}</div>
      <p className="text-lg font-bold">{value}</p>
      <p className="text-[10px] text-slate-400">{label}</p>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-3xl bg-slate-900/60 border border-slate-800/60 p-4 shadow-xl shadow-black/20">
      {children}
    </div>
  );
}

function ActivityRow({ a }: { a: Activity }) {
  return (
    <li className="rounded-2xl bg-slate-900/60 border border-slate-800/60 p-3 flex items-center gap-3">
      <div className="h-9 w-9 rounded-full bg-sky-500/15 grid place-items-center">
        <Flame className="h-4 w-4 text-sky-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{a.type}</p>
        <p className="text-[11px] text-slate-400">
          {a.duration} min · {a.calories} kcal
        </p>
      </div>
      <p className="text-[10px] text-slate-500">
        {new Date(a.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </p>
    </li>
  );
}

/* ---------- LOG ---------- */
function LogScreen({
  onSave,
  onBack,
}: {
  onSave: (a: Omit<Activity, "id" | "at">) => void;
  onBack: () => void;
}) {
  const [type, setType] = useState(ACTIVITY_TYPES[0]);
  const [duration, setDuration] = useState("");
  const [calories, setCalories] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <div className="px-5 pt-6 space-y-4">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-slate-400">
        <ChevronLeft className="h-4 w-4" /> Back
      </button>
      <h1 className="text-xl font-semibold">Log Activity</h1>

      <Field label="Activity type">
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="w-full bg-slate-900/60 border border-slate-800/60 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-sky-400"
        >
          {ACTIVITY_TYPES.map((t) => (
            <option key={t} value={t} className="bg-slate-900">
              {t}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Duration (min)">
        <input
          inputMode="numeric"
          value={duration}
          onChange={(e) => setDuration(e.target.value.replace(/\D/g, ""))}
          placeholder="30"
          className="w-full bg-slate-900/60 border border-slate-800/60 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-sky-400"
        />
      </Field>

      <Field label="Calories burned">
        <input
          inputMode="numeric"
          value={calories}
          onChange={(e) => setCalories(e.target.value.replace(/\D/g, ""))}
          placeholder="250"
          className="w-full bg-slate-900/60 border border-slate-800/60 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-sky-400"
        />
      </Field>

      <Field label="Notes">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="How did it feel?"
          className="w-full bg-slate-900/60 border border-slate-800/60 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-sky-400 resize-none"
        />
      </Field>

      <button
        type="button"
        disabled={!duration || !calories}
        onClick={() =>
          onSave({
            type,
            duration: Number(duration) || 0,
            calories: Number(calories) || 0,
            notes,
          })
        }
        className="w-full bg-sky-400 hover:bg-sky-300 disabled:opacity-40 disabled:cursor-not-allowed text-slate-900 font-semibold py-3.5 rounded-2xl shadow-lg shadow-sky-500/20 transition-colors"
      >
        Save Activity
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs text-slate-400">{label}</span>
      {children}
    </label>
  );
}

/* ---------- SUMMARY ---------- */
function SummaryScreen({ totals }: { totals: { calories: number; active: number; steps: number } }) {
  return (
    <div className="px-5 pt-6 space-y-4">
      <h1 className="text-xl font-semibold">Summary</h1>
      <ProgressCard label="Daily calories" value={totals.calories} goal={CAL_GOAL} unit="kcal" />
      <ProgressCard label="Steps goal" value={totals.steps} goal={STEPS_GOAL} unit="steps" />
      <ProgressCard label="Active minutes" value={totals.active} goal={ACTIVE_GOAL} unit="min" />
      <Card>
        <p className="text-sm font-medium mb-3">Weekly activity</p>
        <div className="flex items-end justify-between gap-1.5 h-24">
          {[40, 65, 30, 80, 55, 20, Math.min(100, (totals.calories / CAL_GOAL) * 100)].map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-t-md bg-gradient-to-t from-sky-500/60 to-sky-300"
              style={{ height: `${Math.max(8, h)}%` }}
            />
          ))}
        </div>
        <div className="flex justify-between mt-1.5 text-[10px] text-slate-500">
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
            <span key={i} className="flex-1 text-center">
              {d}
            </span>
          ))}
        </div>
      </Card>
    </div>
  );
}

function ProgressCard({ label, value, goal, unit }: { label: string; value: number; goal: number; unit: string }) {
  const pct = Math.min(100, Math.round((value / goal) * 100));
  return (
    <Card>
      <div className="flex items-baseline justify-between mb-2">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-slate-400">
          {value} / {goal} {unit}
        </p>
      </div>
      <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
        <div className="h-full bg-gradient-to-r from-sky-400 to-blue-500" style={{ width: `${pct}%` }} />
      </div>
    </Card>
  );
}

/* ---------- HISTORY ---------- */
function HistoryScreen({ activities }: { activities: Activity[] }) {
  return (
    <div className="px-5 pt-6 space-y-4">
      <h1 className="text-xl font-semibold">History</h1>
      {activities.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center text-center py-6">
            <Clock className="h-6 w-6 text-slate-500 mb-2" />
            <p className="text-sm font-medium">No history yet</p>
            <p className="text-xs text-slate-400 mt-1">Your logged activities will appear here.</p>
          </div>
        </Card>
      ) : (
        <ul className="space-y-2">
          {activities.map((a) => (
            <ActivityRow key={a.id} a={a} />
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- PROFILE ---------- */
function ProfileScreen() {
  return (
    <div className="px-5 pt-6 space-y-4">
      <h1 className="text-xl font-semibold">Profile</h1>
      <Card>
        <div className="flex items-center gap-3">
          <div className="h-14 w-14 rounded-full bg-gradient-to-br from-sky-400 to-blue-600 grid place-items-center text-slate-900 font-bold text-lg">
            A
          </div>
          <div>
            <p className="font-semibold">Alex</p>
            <p className="text-xs text-slate-400">Goal: Stay active daily</p>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-3">
          <Target className="h-5 w-5 text-sky-400" />
          <div className="flex-1">
            <p className="text-sm font-medium">Daily calorie target</p>
            <p className="text-xs text-slate-400">{CAL_GOAL} kcal</p>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-3">
          <Settings className="h-5 w-5 text-slate-300" />
          <p className="text-sm font-medium">Settings</p>
        </div>
      </Card>
    </div>
  );
}

/* ---------- BOTTOM NAV ---------- */
function BottomNav({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const items: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "home", label: "Home", icon: <Home className="h-4 w-4" /> },
    { id: "log", label: "Log", icon: <Plus className="h-4 w-4" /> },
    { id: "summary", label: "Summary", icon: <BarChart3 className="h-4 w-4" /> },
    { id: "history", label: "History", icon: <Clock className="h-4 w-4" /> },
    { id: "profile", label: "Profile", icon: <User className="h-4 w-4" /> },
  ];
  return (
    <nav className="absolute bottom-0 inset-x-0 bg-[#070b18]/95 backdrop-blur border-t border-slate-800/80 px-2 pt-2 pb-3">
      <ul className="flex justify-between">
        {items.map((it) => {
          const active = tab === it.id;
          return (
            <li key={it.id} className="flex-1">
              <button
                type="button"
                onClick={() => onChange(it.id)}
                className={`w-full flex flex-col items-center gap-0.5 py-1 rounded-lg transition-colors ${
                  active ? "text-sky-400" : "text-slate-500"
                }`}
              >
                {it.icon}
                <span className="text-[10px] font-medium">{it.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
