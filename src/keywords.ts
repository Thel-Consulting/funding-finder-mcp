const STOPWORDS = new Set(
  `a about above after again against all also am an and any are as at be because been before being below between both but by can could
  did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it its itself
  just me more most my no nor not of off on once only or other our ours out over own same she should so some such than that the their
  theirs them then there these they this those through to too under until up very was we were what when where which while who whom why
  will with would you your yours using use used based new novel develop development developing project projects study research approach
  system systems method methods via within without toward towards proposed propose aim aims phase sbir sttr small business innovation
  technology technologies company product products provide improved improve`
    .split(/\s+/)
    .filter(Boolean),
);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, " ")
    .split(/[^a-z0-9-]+/)
    .map((t) => t.replace(/^-+|-+$/g, ""))
    .filter((t) => t.length > 2 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
}

export function extractKeywords(text: string, max = 8): string[] {
  const counts = new Map<string, { n: number; first: number }>();
  tokenize(text).forEach((t, i) => {
    const c = counts.get(t);
    if (c) c.n++;
    else counts.set(t, { n: 1, first: i });
  });
  return [...counts.entries()]
    .sort((a, b) => b[1].n - a[1].n || a[1].first - b[1].first)
    .slice(0, max)
    .map(([t]) => t);
}

export function stem(t: string) {
  return t.replace(/(ings|ing|ies|es|s)$/, "");
}

export function similarity(keywords: string[], title: string, body = "") {
  if (!keywords.length) return { score: 0, matched: [] as string[] };
  const titleStems = new Set(tokenize(title).map(stem));
  const bodyStems = new Set(tokenize(body).map(stem));
  let score = 0;
  const matched: string[] = [];
  for (const k of keywords) {
    const s = stem(k);
    const inTitle = titleStems.has(s);
    const inBody = bodyStems.has(s);
    if (inTitle || inBody) matched.push(k);
    score += (inTitle ? 2 : 0) + (inBody ? 1 : 0);
  }
  return { score: Math.round((score / (keywords.length * 3)) * 1000) / 1000, matched };
}
