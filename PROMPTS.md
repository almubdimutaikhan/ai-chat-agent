# AI Assistance Prompts

This document tracks key prompts used during development with AI coding assistants.

## Project Setup & Architecture

**Initial Planning**
```
I want to build an AI agent that analyzes tasks and recommends what to work on next.
How should I structure this using Cloudflare Workers and the Agents SDK?
```

**Database Design**
```
What database schema would work best for storing task patterns, completion history,
and productivity insights in a Durable Object's SQLite database?
```

## Implementation Challenges

**Tool Development**
```
I need to add tools for creating and moving Trello cards. Show me how to
structure tool definitions with the AI SDK that include proper error handling.
```

## Debugging & Fixes

**Environment Variables**
```
The Trello integration works in my seed script but not in the Worker.
How do environment variables from .dev.vars get passed to the Worker runtime?
```

**Build Error**
```
Getting syntax error about backslash character in trello-client.ts line 26.
How do I fix string literal escaping issues?
```

## Enhancement Questions

**Loading States**
```
What's the best way to add loading animations to show when the AI is
thinking or executing tool calls?
```

