import type { TrelloBoard, TrelloCard, TrelloLabel, TrelloList } from "./types";

type EnvWithTrello = {
  TRELLO_API_KEY?: string;
  TRELLO_TOKEN?: string;
  TRELLO_BOARD_ID?: string;
  TRELLO_BOARD_NAME?: string;
};

const API_BASE = "https://api.trello.com/1";

class TrelloError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "TrelloError";
    this.status = status;
  }
}

function requireEnv(env: EnvWithTrello) {
  const { TRELLO_API_KEY, TRELLO_TOKEN } = env;
  if (!TRELLO_API_KEY || !TRELLO_TOKEN) {
    throw new TrelloError(
      "Trello integration is not configured. Set TRELLO_API_KEY and TRELLO_TOKEN in your environment."
    );
  }
}

async function trelloRequest<T>(
  env: EnvWithTrello,
  path: string,
  opts: {
    method?: string;
    searchParams?: Record<string, string | undefined | null>;
    body?: Record<string, string | undefined | null>;
  } = {}
): Promise<T> {
  requireEnv(env);

  const url = new URL(path.startsWith("http") ? path : `${API_BASE}${path}`);
  url.searchParams.set("key", env.TRELLO_API_KEY!);
  url.searchParams.set("token", env.TRELLO_TOKEN!);

  for (const [k, v] of Object.entries(opts.searchParams ?? {})) {
    if (v !== undefined && v !== null) {
      url.searchParams.set(k, v);
    }
  }

  let body: BodyInit | undefined;
  if (opts.body) {
    const form = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.body)) {
      if (v !== undefined && v !== null) {
        form.set(k, v);
      }
    }
    body = form;
  }

  const response = await fetch(url, {
    method: opts.method ?? "GET",
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new TrelloError(
      `Trello request failed (${response.status}): ${text}`,
      response.status
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return (await response.json()) as T;
  }

  return (await response.text()) as unknown as T;
}

async function resolveBoardId(env: EnvWithTrello): Promise<string> {
  requireEnv(env);

  if (env.TRELLO_BOARD_ID) {
    return env.TRELLO_BOARD_ID;
  }

  if (!env.TRELLO_BOARD_NAME) {
    throw new TrelloError(
      "Set TRELLO_BOARD_ID or TRELLO_BOARD_NAME so the agent can look up your Trello board."
    );
  }

  const boards = await trelloRequest<any[]>(env, "/members/me/boards", {
    searchParams: {
      fields: "id,name,closed",
    },
  });

  const board = boards.find(
    (b) => b.name === env.TRELLO_BOARD_NAME && b.closed === false
  );
  if (!board) {
    throw new TrelloError(
      `Could not find Trello board named "${env.TRELLO_BOARD_NAME}". Set TRELLO_BOARD_ID to avoid lookups.`
    );
  }

  return board.id as string;
}

export async function fetchTrelloBoard(env: EnvWithTrello): Promise<TrelloBoard> {
  const boardId = await resolveBoardId(env);

  const [lists, labels, cards] = await Promise.all([
    trelloRequest<any[]>(env, `/boards/${boardId}/lists`, {
      searchParams: { fields: "id,name,pos", filter: "open" },
    }),
    trelloRequest<any[]>(env, `/boards/${boardId}/labels`, {
      searchParams: { fields: "id,name,color", limit: "1000" },
    }),
    trelloRequest<any[]>(env, `/boards/${boardId}/cards`, {
      searchParams: {
        fields:
          "id,name,desc,idList,due,dueComplete,dateLastActivity,closed",
        attachments: "false",
        members: "false",
        checklists: "none",
        limit: "1000",
      },
    }),
  ]);

  const labelMap = new Map<string, TrelloLabel>(
    labels.map((label) => [label.id as string, {
      id: label.id as string,
      name: label.name as string,
      color: (label.color as string | null) ?? "" ,
    }])
  );

  const normalizedCards: TrelloCard[] = cards.map((card) => ({
    id: card.id as string,
    name: card.name as string,
    desc: card.desc as string,
    idList: card.idList as string,
    labels: (card.idLabels as string[] | undefined)?.map((id) =>
      labelMap.get(id) ?? { id, name: "", color: "" }
    ) ?? (card.labels as any[])?.map((label) => ({
      id: label.id as string,
      name: label.name as string,
      color: (label.color as string | null) ?? "",
    })) ?? [],
    due: (card.due as string | null) ?? null,
    dueComplete: Boolean(card.dueComplete),
    dateLastActivity: card.dateLastActivity as string,
    closed: Boolean(card.closed),
  }));

  const normalizedLists: TrelloList[] = lists.map((list) => ({
    id: list.id as string,
    name: list.name as string,
    pos: Number(list.pos),
  }));

  const normalizedLabels: TrelloLabel[] = Array.from(labelMap.values());

  const boardInfo = await trelloRequest<any>(env, `/boards/${boardId}`, {
    searchParams: { fields: "name" },
  });

  return {
    id: boardId,
    name: boardInfo.name as string,
    labels: normalizedLabels,
    lists: normalizedLists,
    cards: normalizedCards,
  };
}

export async function createTrelloCard(
  env: EnvWithTrello,
  input: {
    name: string;
    desc?: string;
    idList: string;
    labelIds?: string[];
    due?: string | null;
  }
): Promise<TrelloCard> {
  const created = await trelloRequest<any>(env, "/cards", {
    method: "POST",
    body: {
      name: input.name,
      desc: input.desc ?? "",
      idList: input.idList,
      due: input.due ?? undefined,
      idLabels: input.labelIds && input.labelIds.length > 0
        ? input.labelIds.join(",")
        : undefined,
    },
  });

  return {
    id: created.id as string,
    name: created.name as string,
    desc: created.desc as string,
    idList: created.idList as string,
    labels:
      (created.labels as any[])?.map((label) => ({
        id: label.id as string,
        name: label.name as string,
        color: (label.color as string | null) ?? "",
      })) ?? [],
    due: (created.due as string | null) ?? null,
    dueComplete: Boolean(created.dueComplete),
    dateLastActivity: created.dateLastActivity as string,
    closed: Boolean(created.closed),
  };
}

export async function updateTrelloCardList(
  env: EnvWithTrello,
  cardId: string,
  listId: string,
  options: { dueComplete?: boolean; closed?: boolean } = {}
): Promise<void> {
  await trelloRequest(env, `/cards/${cardId}`, {
    method: "PUT",
    body: {
      idList: listId,
      dueComplete:
        options.dueComplete === undefined
          ? undefined
          : options.dueComplete ? "true" : "false",
      closed:
        options.closed === undefined
          ? undefined
          : options.closed ? "true" : "false",
    },
  });
}

export async function addCommentToCard(
  env: EnvWithTrello,
  cardId: string,
  text: string
): Promise<void> {
  await trelloRequest(env, `/cards/${cardId}/actions/comments`, {
    method: "POST",
    body: {
      text,
    },
  });
}

export function isTrelloConfigured(env: EnvWithTrello | undefined): env is EnvWithTrello {
  return Boolean(
    env?.TRELLO_API_KEY &&
      env?.TRELLO_TOKEN &&
      (env?.TRELLO_BOARD_ID || env?.TRELLO_BOARD_NAME)
  );
}
