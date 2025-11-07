/**
 * Type definitions for AI Task Flow Agent
 */

// Trello data types
export interface TrelloBoard {
  id: string;
  name: string;
  labels: TrelloLabel[];
  lists: TrelloList[];
  cards: TrelloCard[];
}

export interface TrelloList {
  id: string;
  name: string;
  pos: number;
}

export interface TrelloCard {
  id: string;
  name: string;
  desc: string;
  idList: string;
  labels: TrelloLabel[];
  due: string | null;
  dueComplete: boolean;
  dateLastActivity: string;
  closed: boolean;
}

export interface TrelloLabel {
  id: string;
  name: string;
  color: string;
}

// Task analysis types
export interface TaskPattern {
  category: string;
  avgCompletionMinutes: number;
  difficulty: 'easy' | 'medium' | 'hard';
  successRate: number;
  bestTimeOfDay: string;
  taskCount: number;
}

export interface TaskHistory {
  cardId: string;
  cardName: string;
  category: string;
  completedAt: Date;
  timeSpentMinutes: number;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface TaskRecommendation {
  task: {
    id: string;
    name: string;
    description: string;
    category: string;
    estimatedTime: number;
  };
  reason: string;
  confidence: number;
  estimatedTimeMinutes: number;
  bestTimeToStart: string;
  alternatives: Array<{
    id: string;
    name: string;
    reason: string;
  }>;
}

export interface ProductivityInsights {
  totalTasksAnalyzed: number;
  avgTaskCompletionTime: number;
  mostProductiveTime: string;
  categoryBreakdown: Record<string, number>;
  completionRate: number;
  patterns: TaskPattern[];
}

// Context types for recommendations
export interface UserContext {
  currentTime: Date;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  focusLevel?: 'high' | 'medium' | 'low';
  recentActivity?: string[];
}

