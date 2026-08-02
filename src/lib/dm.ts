export function snippet(text: string, max = 60): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return '';
  if (t.length <= max) return `“${t}”`;
  return `“${t.slice(0, max).trimEnd()}…”`;
}

export function buildDmUrl(userId: string, username: string, about: string): string {
  const draft = `Hey @${username}, about ${about}`;
  const params = new URLSearchParams({
    new: userId,
    draft,
    nonce: String(Date.now()),
  });
  return `/messages?${params.toString()}`;
}
