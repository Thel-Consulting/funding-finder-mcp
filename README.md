<p><img src="assets/logo.svg" alt="" width="64" height="64"></p>

# Federal Funding Finder

A free, open-source, read-only [MCP](https://modelcontextprotocol.io) server for SBIR/STTR and federal grants. It searches Grants.gov, NIH RePORTER and the NSF Award Search API. Every result carries the URL of the record it came from.

- No accounts, no API keys, no user data stored. See [PRIVACY.md](PRIVACY.md).
- TypeScript, the official `@modelcontextprotocol/sdk`, streamable HTTP transport, built as a Netlify Function (`/mcp`) with a Netlify Blobs response cache.
- MIT licensed. Maintained by Thel Consulting.

![The five tools and their data sources](assets/tools-table.svg)

## Tools

All tools are read-only (`readOnlyHint: true`, `destructiveHint: false`) and validate input with zod.

| Tool | What it does | Source |
| --- | --- | --- |
| `search_open_opportunities` | Forecasted and posted funding opportunities. Filters: keyword, agency code (for example `HHS-NIH11`, `NSF`, `DOD`), eligibility codes (`23` is small businesses), status, rows, offset. | Grants.gov search2 |
| `search_nih_awards` | Funded NIH projects. Defaults to SBIR/STTR activity codes R43, R44, R41, R42. Filters: text, org states, institutes (IC), fiscal years, activity codes. | NIH RePORTER v2 |
| `search_nsf_awards` | NSF awards. Defaults to SBIR/STTR (`fundProgramName=SBIR OR STTR`). Filters: keyword (supports AND, OR, NOT), awardee state, award date range, rows, offset. | NSF Award Search |
| `similar_funded_projects` | Takes a project description, extracts key terms, searches NIH and NSF, and ranks funded projects by term overlap. | NIH and NSF |
| `agency_sbir_summary` | SBIR/STTR counts and dollar totals by fiscal year, activity code or program, top organizations, and by state when no state is given. | NIH or NSF |

Notes on the data:

- NIH RePORTER returns one record per project per fiscal year, so a multi-year award appears once per year. Amounts are that year's `award_amount`.
- NSF multi-word keywords are ORed by the API. Use `AND` to require every word.
- NSF summary amounts are total funds obligated to each award, grouped by the fiscal year of the award date.
- `agency_sbir_summary` is built to finish within about 7 seconds, under Netlify's 10 second function limit. It pulls at most 2,000 NIH records (4 pages) or 600 NSF awards (24 pages, 8 in parallel). When the upstream total is larger it returns `partial: true` with a `partialNote`, and `byFiscalYear[].upstreamCount` gives the exact per-year count from the API. Dollar totals then cover only the aggregated records. Measured locally, cold cache: NSF all states over 25 fiscal years took 4.1 s, NIH all states over 25 fiscal years took 2.8 s.
- SBIR.gov's public API returned HTTP 403 when checked on 2026-10-16, so it is not used.

## Example prompts

- NIH SBIR awards to South Dakota companies since 2020
- Open Grants.gov SBIR opportunities that small businesses can apply to
- NSF SBIR awards in South Dakota
- Funded projects similar to a biofilm wound dressing
- NIH SBIR/STTR totals by year for South Dakota

## Connect

Hosted endpoint (not deployed yet; the URL is a placeholder, and a `https://<site-name>.netlify.app/mcp` URL works once a Netlify site exists):

```json
{
  "mcpServers": {
    "funding-finder": { "url": "https://<subdomain>.thelconsulting.com/mcp" }
  }
}
```

The same config ships as [mcp.json](mcp.json) for the Cursor plugin ([.cursor-plugin/plugin.json](.cursor-plugin/plugin.json)) and the Grok plugin ([.grok-plugin/plugin.json](.grok-plugin/plugin.json)).

## Local development

Requires Node 20 or later and the [Netlify CLI](https://docs.netlify.com/cli/get-started/) (`npm i -g netlify-cli`). Local dev needs no Netlify account or login.

```sh
npm install
npm run dev            # netlify dev --offline: docs/ on http://localhost:8888, MCP at http://localhost:8888/mcp, local Blobs store
npm run inspect        # MCP Inspector CLI, tools/list against the local server
npm run demo           # calls each tool with the demo prompts and reports timings, writes artifacts/demo-output.json
npm run stdio          # stdio transport, for clients or Inspector setups that launch a command
npm test               # unit tests plus contract tests that call the real APIs
npm run test:unit      # unit tests only, no network
npm run scan:secrets   # gitleaks if installed, plus grep checks
```

Layout:

- `netlify/functions/mcp.ts`: the MCP endpoint, `POST /mcp` (stateless streamable HTTP, JSON responses).
- `netlify/functions/health.ts`: `GET /health`.
- `src/`: tools, upstream clients, cache and rate limiter, shared by the function and the stdio entry (`src/stdio.ts`).
- `docs/`: the static site (landing and privacy pages), published as is.

## Deploying

Not done yet. Deploying needs a Netlify site linked to this repo (publish directory `docs`, functions in `netlify/functions`, both set in `netlify.toml`). Netlify Blobs needs no extra setup on a deployed site. Until a custom domain is set up, the endpoint would be `https://<site-name>.netlify.app/mcp`.

Rate limiting is per IP, 60 requests per minute by default (`RATE_LIMIT_PER_MINUTE` environment variable). It runs in function memory, so the limit applies per function instance, not globally.

## Data sources

- Grants.gov search2 API: `POST https://api.grants.gov/v1/api/search2` ([docs](https://www.grants.gov/api/common/search2))
- NIH RePORTER API v2: `POST https://api.reporter.nih.gov/v2/projects/search` ([docs](https://api.reporter.nih.gov/)). NIH asks clients to keep to about one request per second; summaries page sequentially.
- NSF Award Search API: `GET https://www.research.gov/awardapi-service/v1/awards.json`, falling back to `https://api.nsf.gov/services/v1/awards.json` ([docs](https://resources.research.gov/common/webapi/awardapisearch-v1.htm)). The service moved to Research.gov; the old host still answers.

This project is not affiliated with or endorsed by any federal agency.

## Design

Visuals follow the [Quartz design system](https://github.com/arla6ka/skills/tree/main/systems/quartz) by Arlan Marat (MIT). [docs/vendor/quartz/tokens.css](docs/vendor/quartz/tokens.css) is an unchanged copy with its license. Token notes are in [design/quartz-tokens.md](design/quartz-tokens.md). The logo is a draft pending approval.

## License

MIT. See [LICENSE](LICENSE).
