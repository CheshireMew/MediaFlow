export interface FindReplaceTextMatch {
  start: number;
  end: number;
}

export function findTextMatches(
  text: string,
  searchTerm: string,
  matchCase: boolean,
): FindReplaceTextMatch[] {
  if (!text || !searchTerm) {
    return [];
  }

  const source = matchCase ? text : text.toLowerCase();
  const term = matchCase ? searchTerm : searchTerm.toLowerCase();
  const matches: FindReplaceTextMatch[] = [];

  let pos = source.indexOf(term);
  while (pos !== -1) {
    matches.push({
      start: pos,
      end: pos + term.length,
    });
    pos = source.indexOf(term, pos + term.length);
  }

  return matches;
}

export function replaceAllLiteral(
  text: string,
  searchTerm: string,
  replaceTerm: string,
  matchCase: boolean,
): string {
  if (!text || !searchTerm) {
    return text;
  }

  const flag = matchCase ? "g" : "gi";
  const escapedTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(escapedTerm, flag);
  return text.replace(regex, () => replaceTerm);
}
