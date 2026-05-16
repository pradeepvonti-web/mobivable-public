import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Heart, Clock, ChefHat, Search, X, Loader2 } from "lucide-react";

export const Route = createFileRoute("/recipes")({
  component: RecipesPage,
  head: () => ({
    meta: [
      { title: "Recipe Finder — cook with what you have" },
      {
        name: "description",
        content:
          "Search recipes by ingredients you already have at home. See cook time, difficulty, and save your favorites.",
      },
    ],
  }),
});

type MealSummary = { idMeal: string; strMeal: string; strMealThumb: string };
type MealDetail = MealSummary & {
  strInstructions: string;
  strCategory: string;
  strArea: string;
  [k: string]: string;
};

const FAV_KEY = "recipe-finder:favorites:v1";

function loadFavorites(): Record<string, MealSummary> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(FAV_KEY) || "{}");
  } catch {
    return {};
  }
}

function getIngredients(m: MealDetail): { name: string; measure: string }[] {
  const out: { name: string; measure: string }[] = [];
  for (let i = 1; i <= 20; i++) {
    const name = (m[`strIngredient${i}`] || "").trim();
    const measure = (m[`strMeasure${i}`] || "").trim();
    if (name) out.push({ name, measure });
  }
  return out;
}

function estimateTime(m: MealDetail): number {
  const words = (m.strInstructions || "").split(/\s+/).length;
  const ingr = getIngredients(m).length;
  return Math.max(15, Math.min(120, Math.round(words / 25 + ingr * 2)));
}

function estimateDifficulty(m: MealDetail): "Easy" | "Medium" | "Hard" {
  const n = getIngredients(m).length;
  const steps = (m.strInstructions || "").split(/\.\s|\r?\n/).filter(Boolean).length;
  const score = n + steps / 2;
  if (score < 10) return "Easy";
  if (score < 18) return "Medium";
  return "Hard";
}

function RecipesPage() {
  const [input, setInput] = useState("");
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [results, setResults] = useState<MealSummary[]>([]);
  const [details, setDetails] = useState<Record<string, MealDetail>>({});
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<MealDetail | null>(null);
  const [favorites, setFavorites] = useState<Record<string, MealSummary>>({});
  const [tab, setTab] = useState<"search" | "favorites">("search");

  useEffect(() => {
    setFavorites(loadFavorites());
  }, []);

  useEffect(() => {
    if (ingredients.length === 0) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const lists = await Promise.all(
          ingredients.map((ing) =>
            fetch(
              `https://www.themealdb.com/api/json/v1/1/filter.php?i=${encodeURIComponent(ing)}`,
            )
              .then((r) => r.json())
              .then((d) => (d.meals as MealSummary[] | null) || []),
          ),
        );
        if (cancelled) return;
        const counts = new Map<string, { meal: MealSummary; hits: number }>();
        for (const list of lists) {
          for (const m of list) {
            const cur = counts.get(m.idMeal);
            if (cur) cur.hits += 1;
            else counts.set(m.idMeal, { meal: m, hits: 1 });
          }
        }
        const ranked = [...counts.values()]
          .sort((a, b) => b.hits - a.hits)
          .slice(0, 24)
          .map((x) => x.meal);
        setResults(ranked);

        const need = ranked.filter((m) => !details[m.idMeal]).slice(0, 24);
        const fetched = await Promise.all(
          need.map((m) =>
            fetch(`https://www.themealdb.com/api/json/v1/1/lookup.php?i=${m.idMeal}`)
              .then((r) => r.json())
              .then((d) => (d.meals?.[0] as MealDetail) || null),
          ),
        );
        if (cancelled) return;
        setDetails((prev) => {
          const next = { ...prev };
          for (const d of fetched) if (d) next[d.idMeal] = d;
          return next;
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ingredients]);

  const addIngredient = () => {
    const v = input.trim().toLowerCase();
    if (!v || ingredients.includes(v)) {
      setInput("");
      return;
    }
    setIngredients((p) => [...p, v]);
    setInput("");
  };

  const toggleFav = (m: MealSummary) => {
    setFavorites((prev) => {
      const next = { ...prev };
      if (next[m.idMeal]) delete next[m.idMeal];
      else next[m.idMeal] = { idMeal: m.idMeal, strMeal: m.strMeal, strMealThumb: m.strMealThumb };
      localStorage.setItem(FAV_KEY, JSON.stringify(next));
      return next;
    });
  };

  const openDetail = async (id: string) => {
    let d = details[id];
    if (!d) {
      const r = await fetch(`https://www.themealdb.com/api/json/v1/1/lookup.php?i=${id}`);
      const j = await r.json();
      d = j.meals?.[0];
      if (d) setDetails((p) => ({ ...p, [id]: d }));
    }
    if (d) setSelected(d);
  };

  const visible = useMemo<MealSummary[]>(
    () => (tab === "favorites" ? Object.values(favorites) : results),
    [tab, favorites, results],
  );

  return (
    <div className="recipe-app min-h-screen">
      <style>{`
        .recipe-app {
          --cream: #fbf3e4;
          --cream-2: #f3e3c3;
          --terracotta: #c0532a;
          --paprika: #8a2a1f;
          --olive: #5b6b3a;
          --ink: #2a1a10;
          background:
            radial-gradient(1200px 600px at 10% -10%, #f7d9a8 0%, transparent 60%),
            radial-gradient(900px 500px at 100% 0%, #efb98a 0%, transparent 55%),
            var(--cream);
          color: var(--ink);
          font-family: 'Space Grotesk', sans-serif;
        }
        .recipe-app .chip {
          background: var(--cream-2);
          color: var(--ink);
          border: 1px solid #e0c89a;
        }
        .recipe-app .btn-primary {
          background: var(--terracotta);
          color: var(--cream);
        }
        .recipe-app .btn-primary:hover { background: var(--paprika); }
        .recipe-app .card {
          background: #fff8ea;
          border: 1px solid #e8d3a8;
          box-shadow: 0 6px 24px -12px rgba(138,42,31,0.25);
        }
        .recipe-app .pill {
          background: rgba(192,83,42,0.1);
          color: var(--paprika);
        }
        .recipe-app .tab-active { background: var(--terracotta); color: var(--cream); }
        .recipe-app .tab-idle { background: transparent; color: var(--ink); }
      `}</style>

      <header className="max-w-6xl mx-auto px-6 pt-12 pb-6">
        <div className="flex items-center gap-3">
          <ChefHat className="w-8 h-8" style={{ color: "var(--terracotta)" }} />
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight" style={{ fontFamily: "Anton, sans-serif", letterSpacing: "0.02em" }}>
            PANTRY KITCHEN
          </h1>
        </div>
        <p className="mt-2 text-lg opacity-80 max-w-2xl">
          Tell me what's in your fridge. I'll find recipes you can actually cook tonight.
        </p>

        <div className="mt-6 flex gap-2">
          <button
            onClick={() => setTab("search")}
            className={`px-4 py-2 rounded-full text-sm font-medium ${tab === "search" ? "tab-active" : "tab-idle"}`}
          >
            Search
          </button>
          <button
            onClick={() => setTab("favorites")}
            className={`px-4 py-2 rounded-full text-sm font-medium ${tab === "favorites" ? "tab-active" : "tab-idle"}`}
          >
            Favorites ({Object.keys(favorites).length})
          </button>
        </div>
      </header>

      {tab === "search" && (
        <section className="max-w-6xl mx-auto px-6">
          <div className="card rounded-2xl p-5">
            <label className="block text-sm font-medium mb-2 opacity-80">
              Add ingredients you have at home
            </label>
            <div className="flex gap-2">
              <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-white border" style={{ borderColor: "#e0c89a" }}>
                <Search className="w-4 h-4 opacity-60" />
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addIngredient();
                    }
                  }}
                  placeholder="e.g. chicken, garlic, tomato"
                  className="flex-1 bg-transparent outline-none text-sm"
                />
              </div>
              <button onClick={addIngredient} className="btn-primary px-5 rounded-xl text-sm font-semibold">
                Add
              </button>
            </div>

            {ingredients.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                {ingredients.map((ing) => (
                  <span key={ing} className="chip inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm">
                    {ing}
                    <button
                      onClick={() => setIngredients((p) => p.filter((x) => x !== ing))}
                      className="opacity-60 hover:opacity-100"
                      aria-label={`Remove ${ing}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))}
                <button
                  onClick={() => setIngredients([])}
                  className="text-xs opacity-60 hover:opacity-100 ml-1"
                >
                  Clear all
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      <section className="max-w-6xl mx-auto px-6 py-8">
        {loading && (
          <div className="flex items-center gap-2 opacity-70 mb-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Finding recipes…
          </div>
        )}

        {tab === "search" && ingredients.length === 0 && !loading && (
          <div className="text-center opacity-60 py-16">
            Add at least one ingredient to start finding recipes.
          </div>
        )}

        {tab === "favorites" && visible.length === 0 && (
          <div className="text-center opacity-60 py-16">
            No favorites yet. Tap the heart on a recipe to save it.
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {visible.map((m) => {
            const d = details[m.idMeal];
            const time = d ? estimateTime(d) : null;
            const diff = d ? estimateDifficulty(d) : null;
            const isFav = !!favorites[m.idMeal];
            return (
              <article key={m.idMeal} className="card rounded-2xl overflow-hidden flex flex-col">
                <button onClick={() => openDetail(m.idMeal)} className="relative block text-left">
                  <img src={m.strMealThumb} alt={m.strMeal} className="w-full h-48 object-cover" loading="lazy" />
                </button>
                <div className="p-4 flex flex-col gap-3 flex-1">
                  <h3 className="font-semibold leading-snug">{m.strMeal}</h3>
                  <div className="flex items-center gap-2 text-xs">
                    {time !== null && (
                      <span className="pill inline-flex items-center gap-1 px-2 py-1 rounded-full">
                        <Clock className="w-3 h-3" /> ~{time} min
                      </span>
                    )}
                    {diff && (
                      <span className="pill inline-flex items-center gap-1 px-2 py-1 rounded-full">
                        <ChefHat className="w-3 h-3" /> {diff}
                      </span>
                    )}
                  </div>
                  <div className="mt-auto flex items-center justify-between pt-2">
                    <button
                      onClick={() => openDetail(m.idMeal)}
                      className="text-sm font-semibold"
                      style={{ color: "var(--terracotta)" }}
                    >
                      View recipe →
                    </button>
                    <button
                      onClick={() => toggleFav(m)}
                      aria-label={isFav ? "Remove favorite" : "Save favorite"}
                      className="p-2 rounded-full hover:bg-black/5"
                    >
                      <Heart
                        className="w-5 h-5"
                        style={{ color: "var(--paprika)" }}
                        fill={isFav ? "currentColor" : "none"}
                      />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {selected && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6"
          onClick={() => setSelected(null)}
        >
          <div
            className="card rounded-t-3xl sm:rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative">
              <img src={selected.strMealThumb} alt={selected.strMeal} className="w-full h-64 object-cover" />
              <button
                onClick={() => setSelected(null)}
                className="absolute top-3 right-3 p-2 rounded-full bg-black/40 text-white hover:bg-black/60"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold" style={{ fontFamily: "Anton, sans-serif" }}>
                    {selected.strMeal}
                  </h2>
                  <p className="text-sm opacity-70 mt-1">
                    {selected.strCategory} · {selected.strArea}
                  </p>
                </div>
                <button
                  onClick={() => toggleFav(selected)}
                  className="p-2 rounded-full hover:bg-black/5"
                  aria-label="Toggle favorite"
                >
                  <Heart
                    className="w-6 h-6"
                    style={{ color: "var(--paprika)" }}
                    fill={favorites[selected.idMeal] ? "currentColor" : "none"}
                  />
                </button>
              </div>

              <div className="flex gap-2 mt-3 text-xs">
                <span className="pill inline-flex items-center gap-1 px-2 py-1 rounded-full">
                  <Clock className="w-3 h-3" /> ~{estimateTime(selected)} min
                </span>
                <span className="pill inline-flex items-center gap-1 px-2 py-1 rounded-full">
                  <ChefHat className="w-3 h-3" /> {estimateDifficulty(selected)}
                </span>
              </div>

              <h3 className="mt-6 mb-2 font-semibold">Ingredients</h3>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                {getIngredients(selected).map((i, idx) => (
                  <li key={idx} className="flex justify-between border-b border-dashed py-1" style={{ borderColor: "#e0c89a" }}>
                    <span>{i.name}</span>
                    <span className="opacity-60">{i.measure}</span>
                  </li>
                ))}
              </ul>

              <h3 className="mt-6 mb-2 font-semibold">Instructions</h3>
              <p className="text-sm leading-relaxed whitespace-pre-line opacity-90">
                {selected.strInstructions}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
