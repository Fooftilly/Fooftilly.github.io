---
title: "Local Search MCP"
summary: "A self-hosted MCP bridge for web search and page retrieval."
summarySh: "MCP alat za pretragu interneta i učitavanje stranica preko sopstvenog servera."
repository: "https://github.com/Fooftilly/local-search-mcp"
order: 3
license: "Apache-2.0"
tags: ["MCP", "SearXNG", "Crawl4AI", "Python"]
highlights:
  - "Search through a locally managed SearXNG instance"
  - "Retrieve approved pages through a Crawl4AI backend"
  - "Review domain permissions and activity in a local dashboard"
links:
  - label: "Search documentation"
    url: "https://github.com/Fooftilly/local-search-mcp/blob/master/docs/SEARCH.md"
  - label: "Security notes"
    url: "https://github.com/Fooftilly/local-search-mcp/blob/master/SECURITY.md"
---

Connects MCP-compatible clients to a self-hosted search and page-retrieval stack.

## Requirements

Linux with Python 3.14+, separately managed SearXNG, and Crawl4AI 0.9.5 or newer. See the [setup guide](https://github.com/Fooftilly/local-search-mcp#readme).

## Limitations

Experimental software, not a network firewall. Domain approvals do not replace network isolation; consult the [security notes](https://github.com/Fooftilly/local-search-mcp/blob/master/SECURITY.md). No hosted demo is provided.
