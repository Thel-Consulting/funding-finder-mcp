# Contributing

Bug reports, fixes and new data sources are welcome.

- **Bugs and ideas:** open a [GitHub issue](https://github.com/Thel-Consulting/funding-finder-mcp/issues/new/choose). For a wrong or missing result, include the tool, the arguments and what you expected.
- **Security problems:** do not open a public issue. See [SECURITY.md](SECURITY.md).

## Pull requests

1. Fork the repo and create a branch.
2. `npm install`, then make the change. Local setup is in the [README](README.md#local-development).
3. Run `npm run typecheck`, `npm test` and `npm run scan:secrets`. Contract tests call the real APIs, so run them before changing a parser.
4. Keep the server read-only. Do not add tools that write anywhere, need accounts or store user queries. See [PRIVACY.md](PRIVACY.md).
5. Do not commit secrets, personal emails or real investigator contact details in fixtures.

By contributing you agree that your work is released under the [MIT license](LICENSE).
