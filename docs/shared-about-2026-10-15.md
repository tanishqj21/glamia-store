# Shared About us — 15 October 2026

Glamia and WiBrawl now render the same admin-managed About story and ordered timeline from `/api/about`. The shared admin editor explicitly says that one save updates both websites and opens the current storefront's live page. Removed the old hard-coded WiBrawl About component and its unused styles. Search/social metadata and crawler content also use the shared record; domain branding and canonical URLs stay appropriate to each website.

No production content was overwritten or migrated. Verification used an in-memory database: 14 About/storefront tests passed, and browser checks confirmed identical public story text on both sites at mobile and desktop widths, including a single admin save and reordered timeline. There were no browser page errors or horizontal overflow. Build and the 54-chunk asset graph passed. Evidence is saved under `tmp/shared-about` and `test-results/shared-about` in the main workspace.
