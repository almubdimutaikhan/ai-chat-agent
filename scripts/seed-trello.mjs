#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadDevVars() {
  const devVarsPath = path.resolve(__dirname, '..', '.dev.vars');
  if (!existsSync(devVarsPath)) {
    return;
  }
  const lines = readFileSync(devVarsPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const [key, ...rest] = trimmed.split('=');
    if (!key) continue;
    const value = rest.join('=').trim();
    if (value && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

function computeDateFromOffset(offset) {
  if (offset === null || offset === undefined) {
    return null;
  }
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString();
}

async function trelloRequest(method, endpoint, params = {}) {
  const url = new URL(`https://api.trello.com/1${endpoint}`);
  const { TRELLO_API_KEY, TRELLO_TOKEN } = process.env;
  url.searchParams.set('key', TRELLO_API_KEY);
  url.searchParams.set('token', TRELLO_TOKEN);

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    url.searchParams.append(key, value);
  }

  const response = await fetch(url, { method });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Trello ${method} ${endpoint} failed (${response.status}): ${text}`
    );
  }
  if (response.status === 204) {
    return null;
  }
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return response.json();
  }
  return response.text();
}

async function ensureBoard(boardName) {
  const existingBoardId = process.env.TRELLO_BOARD_ID;
  if (existingBoardId) {
    const board = await trelloRequest('GET', `/boards/${existingBoardId}`, {
      fields: 'name,url',
    });
    console.log(`ℹ️  Using existing Trello board: ${board.name} (${board.url})`);
    return existingBoardId;
  }

  const boards = await trelloRequest('GET', '/members/me/boards', {
    fields: 'name,closed,url',
  });
  const existing = boards.find((board) => board.name === boardName && !board.closed);
  if (existing) {
    console.log(`ℹ️  Found existing Trello board: ${existing.name} (${existing.url})`);
    return existing.id;
  }

  const created = await trelloRequest('POST', '/boards', {
    name: boardName,
    defaultLists: 'false',
  });
  console.log(`✅ Created Trello board: ${created.name} (${created.url})`);
  return created.id;
}

async function ensureLists(boardId, desiredLists) {
  const remoteLists = await trelloRequest('GET', `/boards/${boardId}/lists`, {
    fields: 'name',
    filter: 'open',
  });
  const listMap = new Map(remoteLists.map((list) => [list.name, list.id]));

  for (const desired of desiredLists) {
    if (listMap.has(desired.name)) continue;
    const created = await trelloRequest('POST', '/lists', {
      name: desired.name,
      idBoard: boardId,
      pos: 'bottom',
    });
    console.log(`➕ Created list: ${created.name}`);
    listMap.set(created.name, created.id);
  }

  return listMap;
}

async function ensureLabels(boardId, desiredLabels) {
  const remoteLabels = await trelloRequest('GET', `/boards/${boardId}/labels`, {
    fields: 'name,color',
    limit: '1000',
  });

  const nameToId = new Map(remoteLabels.map((label) => [label.name, label.id]));
  const localIdToRemote = new Map();

  for (const label of desiredLabels) {
    if (nameToId.has(label.name)) {
      localIdToRemote.set(label.id, nameToId.get(label.name));
      continue;
    }
    const created = await trelloRequest('POST', '/labels', {
      idBoard: boardId,
      name: label.name,
      color: label.color ?? 'null',
    });
    console.log(`🏷️  Created label: ${created.name}`);
    nameToId.set(created.name, created.id);
    localIdToRemote.set(label.id, created.id);
  }

  return localIdToRemote;
}

async function seedCards(boardId, listIdMap, labelIdMap, boardData) {
  const listIdToName = new Map(boardData.lists.map((list) => [list.id, list.name]));

  const existingCards = await trelloRequest('GET', `/boards/${boardId}/cards`, {
    fields: 'name,idList',
  });
  const existingByName = new Map(existingCards.map((card) => [card.name, card]));

  for (const card of boardData.cards) {
    const listName = listIdToName.get(card.listId);
    if (!listName) {
      console.warn(`⚠️  Unknown list for card ${card.name}, skipping`);
      continue;
    }
    const targetListId = listIdMap.get(listName);
    if (!targetListId) {
      console.warn(`⚠️  Missing Trello list ${listName}, skipping card ${card.name}`);
      continue;
    }

    const labelIds = card.labelIds
      .map((id) => labelIdMap.get(id))
      .filter(Boolean);
    const dueIso = computeDateFromOffset(card.relativeDueDays);

    const existing = existingByName.get(card.name);
    if (existing) {
      console.log(`↺ Updating card: ${card.name}`);
      await trelloRequest('PUT', `/cards/${existing.id}`, {
        idList: targetListId,
        desc: card.desc,
        due: dueIso ?? 'null',
        dueComplete: card.dueComplete ? 'true' : 'false',
        closed: card.closed ? 'true' : 'false',
      });
      continue;
    }

    const created = await trelloRequest('POST', '/cards', {
      idList: targetListId,
      name: card.name,
      desc: card.desc,
      due: dueIso ?? undefined,
      dueComplete: card.dueComplete ? 'true' : 'false',
      idLabels: labelIds.length > 0 ? labelIds.join(',') : undefined,
    });

    if (card.closed) {
      await trelloRequest('PUT', `/cards/${created.id}`, {
        closed: 'true',
      });
    }

    console.log(`✅ Created card: ${card.name}`);
  }
}

async function main() {
  loadDevVars();

  const { TRELLO_API_KEY, TRELLO_TOKEN } = process.env;
  if (!TRELLO_API_KEY || !TRELLO_TOKEN) {
    console.error(
      '❌ Missing Trello credentials. Please set TRELLO_API_KEY and TRELLO_TOKEN in the environment or .dev.vars.'
    );
    process.exit(1);
  }

  const boardDataPath = path.resolve(__dirname, '../data/mock-trello-board.json');
  const boardData = JSON.parse(readFileSync(boardDataPath, 'utf8'));

  const boardName = process.env.TRELLO_BOARD_NAME ?? 'Task Flow Agent Demo Board';
  const boardId = await ensureBoard(boardName);
  const listIdMap = await ensureLists(boardId, boardData.lists);
  const labelIdMap = await ensureLabels(boardId, boardData.labels);
  await seedCards(boardId, listIdMap, labelIdMap, boardData);

  const boardInfo = await trelloRequest('GET', `/boards/${boardId}`, {
    fields: 'name,url,shortUrl',
  });

  console.log('🎉 Trello board is ready!');
  console.log(`   Name: ${boardInfo.name}`);
  console.log(`   URL:  ${boardInfo.url}`);
  console.log(`   Short URL: ${boardInfo.shortUrl}`);

  if (!process.env.TRELLO_BOARD_ID) {
    console.log('\nℹ️  Add the following to your .dev.vars if you want to reuse this board:');
    console.log(`TRELLO_BOARD_ID=${boardId}`);
  }
}

main().catch((error) => {
  console.error('❌ Failed to seed Trello data');
  console.error(error);
  process.exit(1);
});
