# 🤖 AI Task Flow Agent

> **🚀 Live Demo**: This project is deployed on Cloudflare Workers with real Trello integration. The agent actively syncs with a live Trello board and can create/update tasks via natural language chat.

An intelligent productivity assistant built on Cloudflare's edge platform. This AI agent analyzes your tasks, learns productivity patterns, and recommends optimal next actions—all powered by Cloudflare Workers, Durable Objects, and the Agents SDK.

## ✨ Features

### Core Capabilities
- 🎯 **Smart Task Recommendations** – AI suggests the best next task based on urgency, time-of-day patterns, and your productivity history
- 📊 **Task Pattern Learning** – Analyzes completed tasks to predict completion times and identify peak productivity windows
- 🔗 **Trello Integration** – Syncs with your Trello board, creates cards, and moves tasks between lists via natural language
- 💾 **Persistent Memory** – Stores task patterns, completion history, and insights in SQLite (Durable Objects)
- ⚡ **Real-time Streaming** – Streams AI responses with live tool execution feedback
- 📈 **Productivity Insights** – Shows completion rates, category breakdowns, and time analytics

### Technical Highlights
- Built on **Cloudflare Workers** and **Durable Objects**
- Uses **OpenAI GPT-4o** for intelligent reasoning
- **SQLite** database for state persistence
- **Agent-based architecture** with custom tools
- **React UI** with dark/light theme
- **Type-safe** TypeScript throughout

## 🏗️ Architecture

This project demonstrates a production-ready AI application built entirely on Cloudflare:

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **LLM** | OpenAI GPT-4o (via AI SDK) | Natural language understanding & reasoning |
| **Coordination** | Cloudflare Workers + Durable Objects | Edge compute & state management |
| **Memory** | SQLite in Durable Objects | Persistent task patterns & history |
| **User Input** | React chat UI (served via Workers Assets) | Interactive conversation interface |
| **External API** | Trello REST API | Real-world task management integration |
| **Scheduling** | Agent scheduling API | Future task execution |

## Prerequisites

- Cloudflare account (for deployment)
- OpenAI API key ([get one here](https://platform.openai.com/api-keys))
- Trello API credentials ([get them here](https://trello.com/app-key))

## Quick Start

1. Create a new project:

```bash
npx create-cloudflare@latest --template cloudflare/agents-starter
```

2. Install dependencies:

```bash
npm install
```

3. Set up your environment:

Create a `.dev.vars` file:

```env
OPENAI_API_KEY=your_openai_api_key
TRELLO_API_KEY=your_trello_api_key
TRELLO_TOKEN=your_trello_token
# Optional: reuse an existing board seeded by the script below
# TRELLO_BOARD_ID=your_board_id
```

4. (Optional) Seed a Trello board with the mock tasks:

```bash
npm run trello:seed
```

This command will create (or update) a Trello board named **Task Flow Agent Demo Board** with the mock data found in `data/mock-trello-board.json`. The script lists the generated board URL and suggests a `TRELLO_BOARD_ID` value you can add to `.dev.vars` for reuse.

5. Run locally:

```bash
npm start
```

6. Deploy:

```bash
npm run deploy
```

## 🚀 Try It Out

Once running (locally or deployed), try these commands in the chat:

### Task Analysis
```
"Analyze my tasks"
```
The agent fetches your Trello board (or uses mock data) and learns productivity patterns.

### Get Recommendations
```
"What should I work on next?"
"I'm feeling focused, what's the best task for now?"
```
AI recommends the optimal task based on urgency, time-of-day, and your patterns.

### Trello Actions (requires Trello credentials)
```
"Add a task 'Research competitors' to the Backlog"
"Move 'Build AI Task Flow Agent' to Done"
"Mark 'Study TypeScript' as complete with a note that I finished all exercises"
```
The agent directly updates your Trello board and confirms the changes.

### Insights
```
"Show me my productivity insights"
"What are my completion patterns?"
```
View statistics on task categories, average times, and success rates.


## 🎯 What This Demonstrates

This project showcases key Cloudflare capabilities for building production AI applications:

### ✅ LLM Integration
- Uses OpenAI GPT-4o with streaming responses
- Can be swapped to Workers AI (Llama 3.3) or other providers via AI SDK

### ✅ Workflow & Coordination
- **Cloudflare Workers**: Handles HTTP requests and routing
- **Durable Objects**: Manages agent state and SQLite database
- **Agent SDK**: Provides scheduling, state management, and tool execution

### ✅ User Input via Chat
- React-based chat UI with real-time streaming
- WebSocket connection to Durable Object agent
- Loading states and tool execution feedback

### ✅ Memory & State
- **SQLite in Durable Objects**: Stores task patterns, completion history, recommendations
- **Persistent agent state**: Chat history and learned patterns survive restarts
- **Database migrations**: Automatic schema initialization

### 🔧 Advanced Features
- **External API integration**: Real-time Trello synchronization
- **Tool-based architecture**: 10+ custom tools for task management
- **Pattern recognition**: ML-inspired scoring algorithm for task prioritization
- **Error handling**: Graceful fallbacks when services unavailable

## 📚 Key Implementation Details

### Task Analysis Algorithm
The recommendation engine (`task-analyzer.ts`) scores tasks based on:
- **Urgency**: Due dates and "Urgent" labels
- **Context matching**: Time-of-day patterns (morning for study, evening for projects)
- **Status**: In-progress tasks get priority
- **Focus level**: Matches task difficulty to current focus state

### Database Schema
SQLite stores:
- `task_patterns`: Learned completion times and success rates per category
- `task_history`: Individual task completions with metadata
- `recommendations`: Past AI suggestions for accuracy tracking
- `trello_boards`: Sync metadata
- `trello_cards_snapshot`: Cached board state

### Tool Architecture
All tools follow a consistent pattern:
1. Load board data (Trello API or mock fallback)
2. Execute business logic
3. Update database
4. Return structured response to LLM

Tools automatically execute without confirmation—perfect for fast workflows.
