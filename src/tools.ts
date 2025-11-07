/**
 * Tool definitions for the AI chat agent
 * Tools can either require human confirmation or execute automatically
 */
import { tool, type ToolSet } from "ai";
import { z } from "zod/v3";

import { getCurrentAgent } from "agents";
import { scheduleSchema } from "agents/schedule";

import type { Chat } from "./server";
import {
  analyzeBoard,
  generateProductivityInsights,
  getUserContext,
  rankTasks,
} from "./task-analyzer";
import { mockTrelloBoard } from "./mock-trello-data";
import type { TrelloBoard, TrelloCard, TrelloLabel, TrelloList } from "./types";
import {
  addCommentToCard,
  createTrelloCard,
  fetchTrelloBoard,
  isTrelloConfigured,
  updateTrelloCardList,
} from "./trello-client";

import type { TaskPattern } from "./types";

/* -------------------------------------------------------------------------- */
/* Utilities                                                                 */
/* -------------------------------------------------------------------------- */

type WorkerEnv = Env;

type BoardSource = "trello" | "mock";

interface LoadedBoard {
  board: TrelloBoard;
  source: BoardSource;
}

function toLower(text: string) {
  return text.toLocaleLowerCase();
}

function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

async function loadBoard(agent: Chat): Promise<LoadedBoard> {
  const env = (agent as unknown as { env?: WorkerEnv }).env;

  if (env && isTrelloConfigured(env)) {
    try {
      const board = await fetchTrelloBoard(env);
      return { board, source: "trello" };
    } catch (error) {
      console.error("Failed to fetch Trello board, falling back to mock data", error);
    }
  }

  return { board: mockTrelloBoard, source: "mock" };
}

function findListByName(board: TrelloBoard, listName: string): TrelloList | undefined {
  const match = normalizeWhitespace(listName);
  return board.lists.find((list) => normalizeWhitespace(list.name).toLowerCase() === match.toLowerCase());
}

function findLabelByName(board: TrelloBoard, labelName: string): TrelloLabel | undefined {
  const match = normalizeWhitespace(labelName);
  return board.labels.find((label) => normalizeWhitespace(label.name).toLowerCase() === match.toLowerCase());
}

function findCardByName(board: TrelloBoard, cardName: string): TrelloCard | undefined {
  const match = normalizeWhitespace(cardName);
  return board.cards.find((card) => normalizeWhitespace(card.name).toLowerCase() === match.toLowerCase());
}

function assertTrelloConfigured(source: BoardSource) {
  if (source !== "trello") {
    throw new Error(
      "Trello integration is not configured. Run npm run trello:seed and set TRELLO_BOARD_ID in .dev.vars."
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Scheduling tools (unchanged)                                              */
/* -------------------------------------------------------------------------- */

const scheduleTask = tool({
  description: "Schedule a task to be executed later via the agent scheduler.",
  inputSchema: scheduleSchema,
  execute: async ({ when, description }) => {
    const { agent } = getCurrentAgent<Chat>();

    if (when.type === "no-schedule") {
      return "Not a valid schedule input";
    }

    const input =
      when.type === "scheduled"
        ? when.date
        : when.type === "delayed"
          ? when.delayInSeconds
          : when.type === "cron"
            ? when.cron
            : (() => {
                throw new Error("Not a valid schedule input");
              })();

    try {
      agent!.schedule(input!, "executeTask", description);
      return `Scheduled agent task (${when.type}) for "${description}".`;
    } catch (error) {
      console.error("error scheduling task", error);
      return `Error scheduling task: ${error}`;
    }
  },
});

const getScheduledTasks = tool({
  description: "List all pending scheduled tasks for the agent.",
  inputSchema: z.object({}),
  execute: async () => {
    const { agent } = getCurrentAgent<Chat>();

    try {
      const tasks = agent!.getSchedules();
      if (!tasks || tasks.length === 0) {
        return "No scheduled tasks found.";
      }
      return tasks;
    } catch (error) {
      console.error("Error listing scheduled tasks", error);
      return `Error listing scheduled tasks: ${error}`;
    }
  },
});

const cancelScheduledTask = tool({
  description: "Cancel a scheduled task using its ID.",
  inputSchema: z.object({
    taskId: z.string().describe("The ID of the task to cancel"),
  }),
  execute: async ({ taskId }) => {
    const { agent } = getCurrentAgent<Chat>();
    try {
      await agent!.cancelSchedule(taskId);
      return `Canceled scheduled task ${taskId}.`;
    } catch (error) {
      console.error("Error canceling scheduled task", error);
      return `Error canceling task ${taskId}: ${error}`;
    }
  },
});

/* -------------------------------------------------------------------------- */
/* Trello-aware helpers                                                      */
/* -------------------------------------------------------------------------- */

async function getAnalysis(agent: Chat) {
  const { board, source } = await loadBoard(agent);
  const analysis = analyzeBoard(board);
  return { board, source, analysis };
}

/* -------------------------------------------------------------------------- */
/* Core task tools                                                           */
/* -------------------------------------------------------------------------- */

const analyzeTasks = tool({
  description:
    "Analyze all tasks on the Trello board (or mock data) to learn productivity patterns.",
  inputSchema: z.object({ syncLatest: z.boolean().optional() }),
  execute: async () => {
    const { agent } = getCurrentAgent<Chat>();

    try {
      const { board, source, analysis } = await getAnalysis(agent!);

      for (const pattern of analysis.patterns) {
        await agent!.sql`
          INSERT INTO task_patterns (category, avg_completion_minutes, difficulty, success_rate, best_time_of_day, task_count)
          VALUES (${pattern.category}, ${pattern.avgCompletionMinutes}, ${pattern.difficulty},
                  ${pattern.successRate}, ${pattern.bestTimeOfDay}, ${pattern.taskCount})
          ON CONFLICT(category) DO UPDATE SET
            avg_completion_minutes = ${pattern.avgCompletionMinutes},
            difficulty = ${pattern.difficulty},
            success_rate = ${pattern.successRate},
            best_time_of_day = ${pattern.bestTimeOfDay},
            task_count = ${pattern.taskCount},
            updated_at = CURRENT_TIMESTAMP
        `;
      }

      await agent!.sql`
        INSERT OR REPLACE INTO trello_boards (id, name, total_cards, total_lists)
        VALUES (${board.id}, ${board.name}, ${board.cards.length}, ${board.lists.length})
      `;

      return {
        success: true,
        source,
        message: `Analyzed ${analysis.insights.totalTasksAnalyzed} tasks across ${analysis.patterns.length} categories from ${
          source === "trello" ? "the live Trello board" : "local mock data"
        }`,
        insights: analysis.insights,
        topPatterns: analysis.patterns.slice(0, 3),
      };
    } catch (error) {
      console.error("Error analyzing tasks:", error);
      return {
        success: false,
        message: `Error analyzing tasks: ${error}`,
      };
    }
  },
});

const getNextTask = tool({
  description:
    "Recommend the optimal next task based on Trello data, context, and productivity patterns.",
  inputSchema: z.object({
    context: z.string().optional(),
    category: z.string().optional(),
  }),
  execute: async ({ category }) => {
    const { agent } = getCurrentAgent<Chat>();

    try {
      const { board, source, analysis } = await getAnalysis(agent!);
      const userContext = getUserContext();

      let topTasks = analysis.topTasks;
      if (category) {
        topTasks = topTasks.filter((entry) =>
          entry.card.labels.some((label) => toLower(label.name) === toLower(category))
        );
      }

      if (topTasks.length === 0) {
        return {
          success: false,
          message: "No matching active tasks found.",
        };
      }

      const recommended = topTasks[0];
      const alternatives = topTasks.slice(1, 4);

      const pattern = analysis.patterns.find((p) =>
        recommended.card.labels.some((label) => label.name === p.category)
      );
      const estimatedTime = pattern?.avgCompletionMinutes ?? 60;

      const reasons: string[] = [];
      if (recommended.card.due) {
        const ms = new Date(recommended.card.due).getTime() - Date.now();
        const days = Math.floor(ms / (1000 * 60 * 60 * 24));
        if (!Number.isNaN(days)) {
          if (days <= 0) {
            reasons.push("Due today or overdue");
          } else if (days <= 3) {
            reasons.push(`Due in ${days} day${days === 1 ? "" : "s"}`);
          }
        }
      }
      if (recommended.card.idList === "list-3") {
        reasons.push("Already in progress");
      }
      if (recommended.card.labels.some((label) => label.name === "Urgent")) {
        reasons.push("Marked as urgent");
      }
      if (userContext.timeOfDay === "morning" && pattern?.bestTimeOfDay.includes("morning")) {
        reasons.push("Matches your peak morning focus");
      }

      await agent!.sql`
        INSERT INTO recommendations (recommended_card_id, recommended_card_name, reason, confidence, estimated_time_minutes)
        VALUES (${recommended.card.id}, ${recommended.card.name}, ${reasons.join(", ")}, ${recommended.score / 100}, ${estimatedTime})
      `;

      const listName = board.lists.find((list) => list.id === recommended.card.idList)?.name;

      return {
        success: true,
        source,
        recommendation: {
          task: {
            id: recommended.card.id,
            name: recommended.card.name,
            description: recommended.card.desc,
            labels: recommended.card.labels.map((label) => label.name),
            list: listName,
          },
          reason: reasons.join(". "),
          confidence: Math.min(recommended.score / 100, 1),
          estimatedTimeMinutes: estimatedTime,
        },
        alternatives: alternatives.map((candidate) => ({
          id: candidate.card.id,
          name: candidate.card.name,
          list: board.lists.find((list) => list.id === candidate.card.idList)?.name,
          score: candidate.score,
        })),
      };
    } catch (error) {
      console.error("Error getting next task:", error);
      return {
        success: false,
        message: `Error getting recommendation: ${error}`,
      };
    }
  },
});

const getProductivityInsights = tool({
  description: "Summarize productivity statistics derived from the board.",
  inputSchema: z.object({}),
  execute: async () => {
    const { agent } = getCurrentAgent<Chat>();

    try {
      const { board, source } = await loadBoard(agent!);
      const insights = generateProductivityInsights(board);

      const patterns = await agent!.sql<TaskPattern>`
        SELECT * FROM task_patterns ORDER BY task_count DESC
      `;

      const recentRecs = await agent!.sql<{
        count: number;
        avg_confidence: number;
      }>`
        SELECT COUNT(*) as count, AVG(confidence) as avg_confidence
        FROM recommendations
        WHERE recommended_at > datetime('now', '-7 days')
      `;

      return {
        success: true,
        source,
        insights: {
          totalTasks: insights.totalTasksAnalyzed,
          completedTasks: Math.round(
            insights.totalTasksAnalyzed * insights.completionRate * 0.01
          ),
          completionRate: `${insights.completionRate.toFixed(1)}%`,
          avgTaskTime: `${insights.avgTaskCompletionTime} minutes`,
          mostProductiveTime: insights.mostProductiveTime,
          categories: insights.categoryBreakdown,
          topPatterns: insights.patterns.slice(0, 5).map((pattern) => ({
            category: pattern.category,
            avgTime: `${pattern.avgCompletionMinutes} min`,
            difficulty: pattern.difficulty,
            successRate: `${pattern.successRate}%`,
            bestTime: pattern.bestTimeOfDay,
            taskCount: pattern.taskCount,
          })),
        },
        recommendations: {
          totalMade: recentRecs[0]?.count ?? 0,
          avgConfidence: recentRecs[0]?.avg_confidence ?? 0,
        },
      };
    } catch (error) {
      console.error("Error getting insights:", error);
      return {
        success: false,
        message: `Error getting insights: ${error}`,
      };
    }
  },
});

const viewAllTasks = tool({
  description: "List tasks grouped by status/list on the board.",
  inputSchema: z.object({
    listName: z.string().optional(),
  }),
  execute: async ({ listName }) => {
    try {
      const { agent } = getCurrentAgent<Chat>();
      const { board, source } = await loadBoard(agent!);
      const tasksByList: Record<string, any[]> = {};

      board.lists.forEach((list) => {
        if (listName && toLower(list.name) !== toLower(listName)) {
          return;
        }

        const cards = board.cards.filter((card) => card.idList === list.id && !card.closed);
        if (cards.length === 0) {
          return;
        }

        tasksByList[list.name] = cards.map((card) => ({
          id: card.id,
          name: card.name,
          labels: card.labels.map((label) => label.name),
          due: card.due ?? null,
          urgent: card.labels.some((label) => label.name === "Urgent"),
        }));
      });

      const totalActive = Object.values(tasksByList).flat().length;
      const totalCompleted = board.cards.filter(
        (card) => card.closed || card.idList === "list-4"
      ).length;

      return {
        success: true,
        source,
        summary: {
          totalActive,
          totalCompleted,
          lists: Object.keys(tasksByList),
        },
        tasks: tasksByList,
      };
    } catch (error) {
      console.error("Error viewing tasks:", error);
      return {
        success: false,
        message: `Error viewing tasks: ${error}`,
      };
    }
  },
});

/* -------------------------------------------------------------------------- */
/* Trello mutation tools                                                      */
/* -------------------------------------------------------------------------- */

const createTaskCard = tool({
  description:
    "Create a new task card on the Trello board. Use list names such as Backlog, To Do, In Progress, or Done.",
  inputSchema: z.object({
    title: z.string().min(1, "Provide a task title"),
    description: z.string().optional(),
    list: z.string().describe("List name to place the task in"),
    labels: z.array(z.string()).optional(),
    dueDate: z.string().optional().describe("ISO due date such as 2025-11-07 or null"),
  }),
  execute: async ({ title, description, list, labels, dueDate }) => {
    const { agent } = getCurrentAgent<Chat>();
    const { board, source } = await loadBoard(agent!);

    try {
      assertTrelloConfigured(source);

      const env = (agent as unknown as { env?: WorkerEnv }).env!;
      const targetList = findListByName(board, list);
      if (!targetList) {
        return {
          success: false,
          message: `I could not find a Trello list named "${list}".`,
        };
      }

      const labelIds = (labels ?? [])
        .map((labelName) => findLabelByName(board, labelName)?.id)
        .filter(Boolean) as string[];

      const created = await createTrelloCard(env, {
        name: title,
        desc: description ?? "",
        idList: targetList.id,
        labelIds,
        due: dueDate ?? null,
      });

      return {
        success: true,
        message: `Added Trello card "${created.name}" to ${targetList.name}.`,
        card: {
          id: created.id,
          url: undefined,
          list: targetList.name,
          labels: created.labels.map((label) => label.name),
          due: created.due,
        },
      };
    } catch (error) {
      console.error("Error creating Trello card:", error);
      return {
        success: false,
        message: `Failed to create Trello card: ${error}`,
      };
    }
  },
});

const updateTaskStatus = tool({
  description:
    "Move an existing task card to a different Trello list (e.g. move to In Progress or Done).",
  inputSchema: z.object({
    taskName: z.string().describe("Exact name of the task card to move"),
    newStatus: z.string().describe("Destination list name"),
    note: z.string().optional().describe("Optional progress note to add as a card comment"),
  }),
  execute: async ({ taskName, newStatus, note }) => {
    const { agent } = getCurrentAgent<Chat>();
    const { board, source } = await loadBoard(agent!);

    try {
      assertTrelloConfigured(source);

      const env = (agent as unknown as { env?: WorkerEnv }).env!;
      const card = findCardByName(board, taskName);
      if (!card) {
        return {
          success: false,
          message: `No Trello card named "${taskName}" was found.`,
        };
      }

      const destinationList = findListByName(board, newStatus);
      if (!destinationList) {
        return {
          success: false,
          message: `I could not find a Trello list named "${newStatus}".`,
        };
      }

      const closingList = toLower(destinationList.name) === toLower("Done");

      await updateTrelloCardList(env, card.id, destinationList.id, {
        dueComplete: closingList ? true : undefined,
        closed: closingList ? false : undefined,
      });

      if (note) {
        await addCommentToCard(env, card.id, note);
      }

      const resultMessage = note
        ? `Moved "${card.name}" to ${destinationList.name} and added a note.`
        : `Moved "${card.name}" to ${destinationList.name}.`;

      return {
        success: true,
        message: resultMessage,
      };
    } catch (error) {
      console.error("Error updating Trello card status:", error);
      return {
        success: false,
        message: `Failed to update task status: ${error}`,
      };
    }
  },
});

const logTaskCompletion = tool({
  description: "Mark a task as complete and log completion metadata.",
  inputSchema: z.object({
    taskName: z.string().describe("Name of the task that was completed"),
    timeSpentMinutes: z.number().optional(),
    difficulty: z.enum(["easy", "medium", "hard"]).optional(),
    addNote: z.string().optional().describe("Optional note to attach to the Trello card"),
  }),
  execute: async ({ taskName, timeSpentMinutes, difficulty, addNote }) => {
    const { agent } = getCurrentAgent<Chat>();
    const { board, source } = await loadBoard(agent!);

    try {
      const card = findCardByName(board, taskName);
      if (!card) {
        return {
          success: false,
          message: `Task "${taskName}" was not found.`,
        };
      }

      const category = card.labels[0]?.name ?? "Uncategorized";

      if (source === "trello") {
        const env = (agent as unknown as { env?: WorkerEnv }).env!;
        const doneList = findListByName(board, "Done") ?? board.lists.find((list) => toLower(list.name).includes("done"));
        if (doneList) {
          await updateTrelloCardList(env, card.id, doneList.id, { dueComplete: true });
        }
        if (addNote) {
          await addCommentToCard(env, card.id, addNote);
        }
      }

      if (timeSpentMinutes !== undefined || difficulty !== undefined) {
        await agent!.sql`
          INSERT INTO task_history (card_id, card_name, category, time_spent_minutes, difficulty)
          VALUES (${card.id}, ${card.name}, ${category}, ${timeSpentMinutes ?? null}, ${difficulty ?? null})
        `;

        await agent!.sql`
          UPDATE task_patterns
          SET avg_completion_minutes = CASE
                WHEN task_count = 0 OR avg_completion_minutes IS NULL THEN ${timeSpentMinutes ?? 0}
                ELSE (avg_completion_minutes * task_count + ${timeSpentMinutes ?? 0}) / (task_count + 1)
              END,
              task_count = task_count + 1,
              updated_at = CURRENT_TIMESTAMP
          WHERE category = ${category}
        `;
      }

      const parts: string[] = [`Marked "${card.name}" as complete.`];
      if (timeSpentMinutes !== undefined) {
        parts.push(`Time spent: ${timeSpentMinutes} minutes.`);
      }
      if (difficulty) {
        parts.push(`Difficulty logged as ${difficulty}.`);
      }
      if (source === "trello") {
        parts.push("Status updated on Trello.");
      }

      return {
        success: true,
        message: parts.join(" "),
      };
    } catch (error) {
      console.error("Error logging completion:", error);
      return {
        success: false,
        message: `Error logging completion: ${error}`,
      };
    }
  },
});

/* -------------------------------------------------------------------------- */
/* Exported tool set                                                          */
/* -------------------------------------------------------------------------- */

export const tools = {
  analyzeTasks,
  getNextTask,
  getProductivityInsights,
  viewAllTasks,
  createTaskCard,
  updateTaskStatus,
  logTaskCompletion,
  scheduleTask,
  getScheduledTasks,
  cancelScheduledTask,
} satisfies ToolSet;

export const executions = {};
