Trimmed copies of real API responses captured on 2026-10-16, used only by the parser unit tests.
Personal fields (investigator names, emails, phone numbers) were removed. Shipped code never reads these files.

- grants-search2.json: POST https://api.grants.gov/v1/api/search2 (keyword SBIR, rows 3)
- nih-search.json: POST https://api.reporter.nih.gov/v2/projects/search (R41-R44, SD, FY2024-2025)
- nsf-awards.json: GET https://www.research.gov/awardapi-service/v1/awards.json?fundProgramName=SBIR%20OR%20STTR&awardeeStateCode=SD&rpp=3
