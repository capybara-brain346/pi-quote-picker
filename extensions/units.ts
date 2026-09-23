export function splitUnits(markdown: string): string[] {
  const lines = markdown.split("\n");
  const units: string[] = [];
  let block: string[] = [];
  let fence = "";
  let inTable = false;

  const flush = () => {
    const text = block.join("\n").trim();
    if (text) units.push(text);
    block = [];
    inTable = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];

    if (fence) {
      block.push(line);
      if (marker?.[0] === fence[0] && marker.length >= fence.length) {
        fence = "";
        flush();
      }
      continue;
    }
    if (marker) {
      flush();
      fence = marker;
      block.push(line);
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }

    const tableRow =
      (inTable && line.includes("|")) ||
      /^\s*\|/.test(line) ||
      (line.includes("|") && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1] ?? ""));
    if (tableRow) {
      if (!inTable) flush();
      inTable = true;
    } else if (inTable || /^\s*(?:[-*+]\s|\d+[.)]\s)/.test(line)) {
      flush();
    }
    block.push(line);
  }
  flush();
  return units;
}

export function quote(unit: string): string {
  return unit
    .split("\n")
    .map((line) => (line ? `> ${line}` : ">"))
    .join("\n");
}

export function replaceLine(lines: string[], index: number, text: string): string {
  return [...lines.slice(0, index), text, ...lines.slice(index + 1)].join("\n");
}
