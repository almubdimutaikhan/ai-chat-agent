import { routeAgentRequest, type Schedule } from "agents";

import { getSchedulePrompt } from "agents/schedule";

import { AIChatAgent } from "agents/ai-chat-agent";
import {
  generateId,
  streamText,
  type StreamTextOnFinishCallback,
  stepCountIs,
  createUIMessageStream,
  convertToModelMessages,
  createUIMessageStreamResponse,
  type ToolSet
} from "ai";
import { openai } from "@ai-sdk/openai";
import { processToolCalls, cleanupMessages } from "./utils";
import { tools, executions } from "./tools";
import { DATABASE_SCHEMA } from "./database-schema";
// import { env } from "cloudflare:workers";

const model = openai("gpt-4o-2024-11-20");
// Cloudflare AI Gateway
// const openai = createOpenAI({
//   apiKey: env.OPENAI_API_KEY,
//   baseURL: env.GATEWAY_BASE_URL,
// });

/**
 * Chat Agent implementation that handles real-time AI chat interactions
 * with AI Task Flow capabilities
 */
export class Chat extends AIChatAgent<Env> {
  private dbInitialized = false;

  /**
   * Initialize database schema on first run
   */
  private async initializeDatabase() {
    if (this.dbInitialized) return;

    try {
      // The sql method is a tagged template literal
      // We need to execute each CREATE TABLE separately
      
      // Table 1: Trello boards
      await this.sql`
        CREATE TABLE IF NOT EXISTS trello_boards (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          last_synced TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          total_cards INTEGER DEFAULT 0,
          total_lists INTEGER DEFAULT 0
        )
      `;

      // Table 2: Task patterns
      await this.sql`
        CREATE TABLE IF NOT EXISTS task_patterns (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          category TEXT NOT NULL,
          avg_completion_minutes INTEGER DEFAULT 0,
          difficulty TEXT CHECK(difficulty IN ('easy', 'medium', 'hard')),
          success_rate REAL DEFAULT 0.0,
          best_time_of_day TEXT,
          task_count INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `;

      // Table 3: Task history
      await this.sql`
        CREATE TABLE IF NOT EXISTS task_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          card_id TEXT NOT NULL,
          card_name TEXT NOT NULL,
          category TEXT,
          completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          time_spent_minutes INTEGER,
          difficulty TEXT CHECK(difficulty IN ('easy', 'medium', 'hard')),
          list_moved_from TEXT,
          list_moved_to TEXT
        )
      `;

      // Table 4: Recommendations
      await this.sql`
        CREATE TABLE IF NOT EXISTS recommendations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          recommended_card_id TEXT NOT NULL,
          recommended_card_name TEXT NOT NULL,
          reason TEXT,
          confidence REAL DEFAULT 0.0,
          estimated_time_minutes INTEGER,
          recommended_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          accepted BOOLEAN DEFAULT 0,
          actual_outcome TEXT
        )
      `;

      // Table 5: Trello cards snapshot
      await this.sql`
        CREATE TABLE IF NOT EXISTS trello_cards_snapshot (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          card_id TEXT NOT NULL,
          card_name TEXT NOT NULL,
          card_desc TEXT,
          list_id TEXT,
          list_name TEXT,
          labels TEXT,
          due_date TIMESTAMP,
          completed BOOLEAN DEFAULT 0,
          synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `;
      
      this.dbInitialized = true;
      console.log("✅ Database initialized successfully - 5 tables created");
    } catch (error) {
      console.error("Database initialization error:", error);
      // Continue even if tables already exist
      this.dbInitialized = true;
    }
  }
  /**
   * Handles incoming chat messages and manages the response stream
   */
  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    _options?: { abortSignal?: AbortSignal }
  ) {
    // Initialize database on first message
    await this.initializeDatabase();

    // const mcpConnection = await this.mcp.connect(
    //   "https://path-to-mcp-server/sse"
    // );

    // Collect all tools, including MCP tools
    const allTools = {
      ...tools,
      ...this.mcp.getAITools()
    };

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        // Clean up incomplete tool calls to prevent API errors
        const cleanedMessages = cleanupMessages(this.messages);

        // Process any pending tool calls from previous messages
        // This handles human-in-the-loop confirmations for tools
        const processedMessages = await processToolCalls({
          messages: cleanedMessages,
          dataStream: writer,
          tools: allTools,
          executions
        });

        const result = streamText({
          system: `You are an AI Task Flow Agent - a smart productivity assistant that helps manage and optimize tasks.

Your capabilities:
- Analyze tasks from Trello boards to learn patterns
- Recommend the best next task based on context, time, and priorities
- Track task completion to improve predictions
- Create new Trello cards and move existing cards between lists
- Provide productivity insights and statistics

When recommending or acting on tasks, consider:
- Current time of day and the user's typical productivity patterns
- Task categories and past performance
- Due dates and urgency
- Estimated effort and focus requirements

When you add, move, or complete a Trello card, explicitly mention the action you took so the user knows the board was updated.
Prefer using the available tools (createTaskCard, updateTaskStatus, logTaskCompletion) to modify Trello instead of describing hypothetical changes.

${getSchedulePrompt({ date: new Date() })}

You can also schedule tasks when requested.
`,

          messages: convertToModelMessages(processedMessages),
          model,
          tools: allTools,
          // Type boundary: streamText expects specific tool types, but base class uses ToolSet
          // This is safe because our tools satisfy ToolSet interface (verified by 'satisfies' in tools.ts)
          onFinish: onFinish as unknown as StreamTextOnFinishCallback<
            typeof allTools
          >,
          stopWhen: stepCountIs(10)
        });

        writer.merge(result.toUIMessageStream());
      }
    });

    return createUIMessageStreamResponse({ stream });
  }
  async executeTask(description: string, _task: Schedule<string>) {
    await this.saveMessages([
      ...this.messages,
      {
        id: generateId(),
        role: "user",
        parts: [
          {
            type: "text",
            text: `Running scheduled task: ${description}`
          }
        ],
        metadata: {
          createdAt: new Date()
        }
      }
    ]);
  }
}

/**
 * Worker entry point that routes incoming requests to the appropriate handler
 */
export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext) {
    const url = new URL(request.url);

    if (url.pathname === "/check-open-ai-key") {
      const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
      return Response.json({
        success: hasOpenAIKey
      });
    }
    if (!process.env.OPENAI_API_KEY) {
      console.error(
        "OPENAI_API_KEY is not set, don't forget to set it locally in .dev.vars, and use `wrangler secret bulk .dev.vars` to upload it to production"
      );
    }
    return (
      // Route the request to our agent or return 404 if not found
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
