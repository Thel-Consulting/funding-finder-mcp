# Privacy

Federal Funding Finder is a read-only MCP server. It has no accounts and collects no personal information.

## What the server keeps

| Data | Kept | How long |
| --- | --- | --- |
| Accounts, names, emails | None collected | None |
| Your queries | Not logged. Public upstream responses are cached in Netlify Blobs under a SHA-256 hash of the upstream request. | Each entry carries a 30 to 60 minute expiry. Expired entries are ignored and deleted on the next read; until then they stay in the store. |
| IP address | A salted hash, held only in function memory, for per-IP rate limiting. The raw IP is not stored or logged. | Counter resets every 60 seconds |
| Logs | Aggregate lines only: tool name, success or failure, duration. No query text, no IPs. | Netlify function log retention |

The cache holds public federal data, not anything about you. Netlify, as the host, processes request metadata under its own policies.

## Upstream services

Each tool forwards your search terms to a public federal API. Those services have their own terms and privacy policies:

- Grants.gov: [terms of use](https://www.grants.gov/terms-of-use), [privacy policy](https://www.grants.gov/privacy), [search2 API](https://www.grants.gov/api/common/search2)
- NIH RePORTER: [API notes and usage limits](https://api.reporter.nih.gov/), [FAQs](https://reporter.nih.gov/faqs)
- NSF Award Search: [API documentation](https://resources.research.gov/common/webapi/awardapisearch-v1.htm), [NSF privacy policy](https://www.nsf.gov/policies/privacy)

## Contact

Open an issue at https://github.com/Thel-Consulting/funding-finder-mcp/issues.
