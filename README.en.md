# Northstar Memory

Local-first memory service for MCP-capable AI agents: structured, editable, zero runtime dependencies.

> Three things only:
> 1. **Per-turn summary** — the agent fills a seven-field form at the end of each turn.
> 2. **Previous-turn injection** — only the immediately previous summary is recalled (bounded by design).
> 3. **Editable repository** — browse, edit, and delete memories in a local web UI.

## Why this shape

Northstar stores one field table per turn, injects only the previous one, and lets the agent search
older turns on demand. No external model, no vector database, no hosted service.

Measured overhead: **~600–800 tokens per turn**, recall **<1 ms**, save **~30 ms**. See [docs/LOAD.md](docs/LOAD.md).

## Quick start

Requirements: Node ≥ 18.17. No npm dependencies at runtime.

```bash
git clone <repo> northstar && cd northstar
node dist/server.js --data ./data
# UI: http://127.0.0.1:8777
```

MCP config (stdio):

```json
{
  "mcpServers": {
    "northstar-memory": {
      "command": "node",
      "args": ["<ABS>/dist/server.js", "--data", "<ABS>/data"]
    }
  }
}
```

Host-specific examples: [docs/HOSTS.md](docs/HOSTS.md) (Claude Desktop, Cursor, WorkBuddy, ZCode, generic).

Give the agent the behavior contract: [docs/AGENTS.md](docs/AGENTS.md) or the compressed [docs/SKILL.md](docs/SKILL.md).

## Profiles

Default `general` has seven fields. `work` and `story` are optional packs:

```bash
node dist/cli.js profile install work
node dist/cli.js profile install story
```

See [docs/PROFILES.md](docs/PROFILES.md).

## Tools

Default **lite** mode (three tools):

| Tool | Purpose |
|---|---|
| `memory_save` | Save one turn's seven-field summary (natural key `session_id + turn_no`) |
| `memory_recall` | Return exactly one previous-turn summary |
| `memory_search` | Search older summaries on demand (Chinese bigram + field weighting) |

`--tools full` additionally exposes `memory_get`, `memory_list`, `memory_update`, `memory_delete`,
`memory_restore`, `memory_stats`.

## Multi-device

Local-first: every device holds a full replica; sync through your own storage
(OneDrive / iCloud / Syncthing / git). Each record carries `device_id` and field-level timestamps;
concurrent edits are merged per field, deletes propagate as tombstones. See [docs/REMOTE.md](docs/REMOTE.md).

## Data layout

```
data/spaces/<space>/sessions/<session>/
  _meta.json
  turn-0001.json
  range-0001-0010.json
data/tombstones/   deleted records (restorable)
data/conflicts/    merged conflict reports
```

One record = one JSON file. `content` and `title` are derived at read time, never stored twice.

## CLI

```bash
node dist/cli.js save   --session s1 --fields '{"时间":"2026-10-19","事情":"...","结果":"...","重点":"..."}'
node dist/cli.js recall --session s1
node dist/cli.js search "keyword" --session s1
node dist/cli.js stats
node dist/cli.js sync doctor
node dist/cli.js export --out backup.json
```

## Tests

```bash
npm ci && npm run build && npm test   # 12 suites, 74 assertions
```

## Docs

- [Agent contract](docs/AGENTS.md) · [Compressed skill](docs/SKILL.md)
- [Host setup](docs/HOSTS.md) · [Data format](docs/DATA_FORMAT.md)
- [Multi-device](docs/REMOTE.md) · [Load & limits](docs/LOAD.md)
- [Product & commercialization notes](docs/PRODUCT.md) (Chinese)

## License

MIT — see [LICENSE](LICENSE).
