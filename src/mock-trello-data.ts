/**
 * Mock Trello data for testing and development
 * Simulates a realistic software engineering student's task board
 */

import rawBoard from '../data/mock-trello-board.json';
import type { TrelloBoard, TrelloList, TrelloCard, TrelloLabel } from './types';

type RawCard = (typeof rawBoard)['cards'][number];

type RawBoard = typeof rawBoard;

function computeDateFromOffset(offset: number | null): string | null {
  if (offset === null || offset === undefined) {
    return null;
  }
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString();
}

const labelMap = new Map<string, TrelloLabel>(
  (rawBoard.labels as RawBoard['labels']).map((label) => [label.id, { ...label }])
);

const lists: TrelloList[] = (rawBoard.lists as RawBoard['lists']).map((list) => ({
  ...list,
}));

const cards: TrelloCard[] = (rawBoard.cards as RawCard[]).map((card) => ({
  id: card.id,
  name: card.name,
  desc: card.desc,
  idList: card.listId,
  labels: card.labelIds.map((id) => {
    const label = labelMap.get(id);
    if (!label) {
      throw new Error(`Missing label definition for ${id}`);
    }
    return label;
  }),
  due: computeDateFromOffset(card.relativeDueDays),
  dueComplete: card.dueComplete,
  dateLastActivity:
    computeDateFromOffset(card.relativeLastActivityDays) ?? new Date().toISOString(),
  closed: card.closed,
}));

const labels: TrelloLabel[] = Array.from(labelMap.values());

export const mockTrelloBoard: TrelloBoard = {
  id: rawBoard.id,
  name: rawBoard.name,
  labels,
  lists,
  cards,
};

export { labels, lists, cards };

export function getCardsByList(listId: string): TrelloCard[] {
  return cards.filter((card) => card.idList === listId);
}

export function getCompletedCards(): TrelloCard[] {
  return cards.filter((card) => card.closed || card.idList === 'list-4');
}

export function getActiveCards(): TrelloCard[] {
  return cards.filter((card) => !card.closed && card.idList !== 'list-4');
}

export function getCardsByLabel(labelName: string): TrelloCard[] {
  return cards.filter((card) =>
    card.labels.some((label) => label.name === labelName)
  );
}

