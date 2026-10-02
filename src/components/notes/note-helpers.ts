export function stripPreview(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return '';
  const first = trimmed.split('\n', 1)[0] ?? '';
  return first.length > 140 ? `${first.slice(0, 140)}…` : first;
}
