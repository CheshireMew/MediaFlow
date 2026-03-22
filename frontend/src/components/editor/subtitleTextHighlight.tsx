export function highlightSubtitleText(
  text: string,
  searchTerm?: string,
  matchCase?: boolean,
) {
  if (!searchTerm) return text;

  try {
    const escapedTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const splitRegex = new RegExp(`(${escapedTerm})`, matchCase ? "g" : "gi");
    const parts = text.split(splitRegex);
    return parts.map((part, i) =>
      i % 2 === 1 ? (
        <mark key={i} className="bg-yellow-500/50 text-white rounded-sm px-0.5">
          {part}
        </mark>
      ) : (
        <span key={i}>{part}</span>
      ),
    );
  } catch {
    return text;
  }
}
