import { CustomEditor, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import { assistantText, quote, replaceLine, splitUnits } from "./units.ts";

function insideFence(lines: string[]): boolean {
  let fence = "";
  for (const line of lines) {
    const marker = /^\s*(?:>\s*)?(`{3,}|~{3,})/.exec(line)?.[1];
    if (!marker) continue;
    if (!fence) fence = marker;
    else if (marker[0] === fence[0] && marker.length >= fence.length) fence = "";
  }
  return !!fence;
}

function canPick(editor: CustomEditor): boolean {
  const { line, col } = editor.getCursor();
  const lines = editor.getLines();
  const current = lines[line] ?? "";
  return (
    col === current.length &&
    current.startsWith(">") &&
    !editor.getText().trimStart().startsWith("!") &&
    !insideFence(lines.slice(0, line))
  );
}

function matchingItems(items: string[], search: string): string[] {
  const words = search.toLowerCase().trim().split(/\s+/);
  return items.filter((item) => words.every((word) => item.toLowerCase().includes(word)));
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    const previous = ctx.ui.getEditorComponent();
    ctx.ui.setEditorComponent((tui, theme, kb) => {
      const existing = previous?.(tui, theme, kb);
      const editor =
        existing && "getCursor" in existing && "getLines" in existing
          ? (existing as CustomEditor)
          : new CustomEditor(tui, theme, kb);
      const original = editor.handleInput.bind(editor);
      const key = "quote-picker";
      let active = false;
      let suppressed = false;
      let selected = 0;
      let items: string[] = [];

      const matches = () =>
        matchingItems(items, editor.getLines()[editor.getCursor().line]?.slice(1) ?? "");

      const show = () => {
        if (!active) {
          ctx.ui.setWidget(key, undefined);
          return;
        }
        const found = matches();
        selected = Math.min(selected, Math.max(0, found.length - 1));
        ctx.ui.setWidget(
          key,
          (_tui, colors) => ({
            render(width: number) {
              const rows = [
                colors.fg(
                  "muted",
                  `Paragraphs · ${found.length} match${found.length === 1 ? "" : "es"} · ↑↓ select · Enter quote · Alt+Enter plain · Esc close`,
                ),
              ];
              const start = Math.max(0, Math.min(selected - 2, found.length - 5));
              for (let i = start; i < Math.min(start + 5, found.length); i++) {
                const label = `${i === selected ? "❯" : " "} ${found[i]!.replace(/\s+/g, " ")}`;
                rows.push(
                  i === selected
                    ? colors.bg("selectedBg", truncateToWidth(label, width))
                    : colors.fg("muted", truncateToWidth(label, width)),
                );
              }
              if (found[selected]) {
                rows.push(colors.fg("muted", "─ Preview ─"));
                for (const line of found[selected]!.split("\n").slice(0, 8))
                  rows.push(truncateToWidth(line, width));
              }
              return rows.map((row) => truncateToWidth(row, width));
            },
            invalidate() {},
          }),
          { placement: "aboveEditor" },
        );
      };

      editor.handleInput = (data: string) => {
        if (active && canPick(editor)) {
          const found = matches();
          if (matchesKey(data, "escape")) {
            active = false;
            suppressed = true;
            show();
            return;
          }
          if (matchesKey(data, "up") || matchesKey(data, "down")) {
            if (found.length)
              selected = (selected + (matchesKey(data, "down") ? 1 : -1) + found.length) % found.length;
            show();
            return;
          }
          if (matchesKey(data, "return") || matchesKey(data, "alt+enter")) {
            if (!found.length) return;
            const { line } = editor.getCursor();
            const lines = editor.getLines();
            const text = matchesKey(data, "alt+enter") ? found[selected]! : quote(found[selected]!);
            editor.setText(replaceLine(lines, line, text));
            // setText moves to the end; restore the cursor before the trailing draft.
            const trailing = lines.slice(line + 1).join("\n");
            for (let i = 0; i < (line < lines.length - 1 ? trailing.length + 1 : 0); i++)
              original("\x1b[D");
            active = false;
            show();
            return;
          }
        }

        original(data);
        const current = editor.getLines()[editor.getCursor().line] ?? "";
        if (!current.startsWith(">")) suppressed = false;
        const open = !suppressed && canPick(editor);
        if (open && !active) {
          items = splitUnits(assistantText(ctx.sessionManager.getBranch()));
          selected = 0;
        }
        active = open && items.length > 0;
        show();
      };
      return editor;
    });
  });
}
