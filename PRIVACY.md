# Privacy

Federal Funding Finder is a read-only MCP server. It has no accounts, does not store your queries and collects no personal information.

## What the server keeps

| Data | Kept | How long |
| --- | --- | --- |
| Accounts, names, emails | None collected. | None |
| Your queries | Not stored and not logged. Search terms are sent to the upstream API for that request only. | None |
| Response cache | A trimmed copy of each upstream response, stored in Netlify Blobs: only the result fields the tools return (IDs, titles, organizations, amounts, dates, abstracts). Fields that echo the request, such as Grants.gov `searchParams` and NIH saved-search links, are removed before caching, as are investigator and program officer names, emails and phone numbers. The cache key is an HMAC-SHA256 of the request made with a secret server-side key, so it contains no query text. | 30 minutes (Grants.gov) or 60 minutes (NIH, NSF). Expired entries are never served. They are deleted when read and by an hourly cleanup job. |
| IP address | Counted by Netlify's edge rate limiter (per IP, 60 requests per minute) and, as a salted hash, in function memory. This server does not store or log the raw IP. | Counters reset every 60 seconds |
| Logs | One line per tool call: tool name, success or failure, duration. No query text, no IPs. | Netlify function log retention |

One limit to be aware of: cached entries are public federal records that matched some search, so their content can hint at the topic that was searched. They are not linked to an IP address or to any person.

Netlify, as the host, processes request metadata such as IP addresses under its own policies.

## Upstream services

Each tool forwards your search terms to a public federal API. Those services have their own terms and privacy policies:

- Grants.gov: [terms of use](https://www.grants.gov/terms-of-use), [privacy policy](https://www.grants.gov/privacy), [search2 API](https://www.grants.gov/api/common/search2)
- NIH RePORTER: [API notes and usage limits](https://api.reporter.nih.gov/), [FAQs](https://reporter.nih.gov/faqs)
- NSF Award Search: [API documentation](https://resources.research.gov/common/webapi/awardapisearch-v1.htm), [NSF privacy policy](https://www.nsf.gov/policies/privacy)

Use of the service is covered by the [terms of use](TERMS.md).

## Contact

Open an issue at https://github.com/Thel-Consulting/funding-finder-mcp/issues. Report security problems privately as described in [SECURITY.md](SECURITY.md).
