/**
 * Task Analysis Engine
 * Analyzes Trello data to extract patterns and insights
 */

import type { 
  TrelloBoard, 
  TrelloCard, 
  TaskPattern, 
  ProductivityInsights,
  UserContext 
} from './types';
import { mockTrelloBoard } from './mock-trello-data';

/**
 * Extract categories from cards based on labels
 */
export function extractCategories(cards: TrelloCard[]): Map<string, TrelloCard[]> {
  const categoryMap = new Map<string, TrelloCard[]>();
  
  cards.forEach(card => {
    card.labels.forEach(label => {
      if (!categoryMap.has(label.name)) {
        categoryMap.set(label.name, []);
      }
      categoryMap.get(label.name)!.push(card);
    });
  });
  
  return categoryMap;
}

/**
 * Calculate average completion time for a category
 */
export function calculateAvgCompletionTime(cards: TrelloCard[]): number {
  const completedCards = cards.filter(card => card.closed || card.dueComplete);
  if (completedCards.length === 0) return 0;
  
  // For mock data, estimate based on card complexity
  // In real implementation, would calculate from actual timestamps
  const estimatedTimes = completedCards.map(card => {
    const hasMultipleLabels = card.labels.length > 1;
    const hasDescription = card.desc && card.desc.length > 50;
    const baseTime = 60; // Base 60 minutes
    
    let multiplier = 1;
    if (hasMultipleLabels) multiplier += 0.5;
    if (hasDescription) multiplier += 0.3;
    if (card.labels.some(l => l.name === 'AI/ML' || l.name === 'Research')) multiplier += 0.7;
    
    return baseTime * multiplier;
  });
  
  return Math.round(estimatedTimes.reduce((a, b) => a + b, 0) / estimatedTimes.length);
}

/**
 * Determine task difficulty based on various factors
 */
export function assessDifficulty(card: TrelloCard): 'easy' | 'medium' | 'hard' {
  let difficultyScore = 0;
  
  // Factors that increase difficulty
  if (card.labels.some(l => l.name === 'AI/ML' || l.name === 'Research')) difficultyScore += 2;
  if (card.labels.some(l => l.name === 'Project')) difficultyScore += 1;
  if (card.desc && card.desc.length > 100) difficultyScore += 1;
  if (card.labels.length > 2) difficultyScore += 1;
  
  // Factors that decrease difficulty
  if (card.labels.some(l => l.name === 'Practice')) difficultyScore -= 1;
  
  if (difficultyScore <= 1) return 'easy';
  if (difficultyScore <= 3) return 'medium';
  return 'hard';
}

/**
 * Calculate success rate for a category
 */
export function calculateSuccessRate(cards: TrelloCard[]): number {
  if (cards.length === 0) return 0;
  
  const completed = cards.filter(card => card.closed || card.dueComplete).length;
  return Math.round((completed / cards.length) * 100);
}

/**
 * Determine best time of day for a category (mock implementation)
 */
export function determineBestTimeOfDay(category: string): string {
  // Mock logic based on category type
  const timeMap: Record<string, string> = {
    'Study': 'morning (9-11am)',
    'AI/ML': 'morning (10am-12pm)',
    'Practice': 'afternoon (2-4pm)',
    'Project': 'evening (7-9pm)',
    'Research': 'morning (9-11am)',
    'Work': 'afternoon (1-5pm)',
    'Urgent': 'immediate'
  };
  
  return timeMap[category] || 'flexible';
}

/**
 * Analyze patterns from a set of cards
 */
export function analyzeTaskPatterns(cards: TrelloCard[]): TaskPattern[] {
  const patterns: TaskPattern[] = [];
  const categoryMap = extractCategories(cards);
  
  categoryMap.forEach((categoryCards, categoryName) => {
    patterns.push({
      category: categoryName,
      avgCompletionMinutes: calculateAvgCompletionTime(categoryCards),
      difficulty: assessDifficulty(categoryCards[0]), // Simplified - take first card
      successRate: calculateSuccessRate(categoryCards),
      bestTimeOfDay: determineBestTimeOfDay(categoryName),
      taskCount: categoryCards.length
    });
  });
  
  return patterns.sort((a, b) => b.taskCount - a.taskCount);
}

/**
 * Get current user context
 */
export function getUserContext(): UserContext {
  const now = new Date();
  const hour = now.getHours();
  
  let timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  if (hour >= 5 && hour < 12) timeOfDay = 'morning';
  else if (hour >= 12 && hour < 17) timeOfDay = 'afternoon';
  else if (hour >= 17 && hour < 21) timeOfDay = 'evening';
  else timeOfDay = 'night';
  
  return {
    currentTime: now,
    timeOfDay,
    focusLevel: timeOfDay === 'morning' ? 'high' : 'medium'
  };
}

/**
 * Generate productivity insights from board data
 */
export function generateProductivityInsights(board: TrelloBoard): ProductivityInsights {
  const allCards = board.cards;
  const completedCards = allCards.filter(c => c.closed || c.idList === 'list-4');
  const patterns = analyzeTaskPatterns(allCards);
  
  // Category breakdown
  const categoryBreakdown: Record<string, number> = {};
  patterns.forEach(p => {
    categoryBreakdown[p.category] = p.taskCount;
  });
  
  // Calculate average completion time
  const avgTimes = patterns.map(p => p.avgCompletionMinutes * p.taskCount);
  const totalTime = avgTimes.reduce((a, b) => a + b, 0);
  const avgTaskTime = Math.round(totalTime / allCards.length);
  
  return {
    totalTasksAnalyzed: allCards.length,
    avgTaskCompletionTime: avgTaskTime,
    mostProductiveTime: 'morning (9-11am)', // Based on mock data
    categoryBreakdown,
    completionRate: (completedCards.length / allCards.length) * 100,
    patterns
  };
}

/**
 * Score a task based on various factors for recommendation
 */
export function scoreTask(card: TrelloCard, context: UserContext): number {
  let score = 0;
  
  // Due date urgency
  if (card.due) {
    const daysUntilDue = Math.floor((new Date(card.due).getTime() - context.currentTime.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntilDue <= 1) score += 100;
    else if (daysUntilDue <= 3) score += 50;
    else if (daysUntilDue <= 7) score += 20;
  }
  
  // Urgent label
  if (card.labels.some(l => l.name === 'Urgent')) score += 75;
  
  // Time of day match
  const categoryTimeMap: Record<string, string[]> = {
    'morning': ['Study', 'AI/ML', 'Research'],
    'afternoon': ['Practice', 'Work'],
    'evening': ['Project']
  };
  
  const goodCategories = categoryTimeMap[context.timeOfDay] || [];
  if (card.labels.some(l => goodCategories.includes(l.name))) score += 30;
  
  // In progress tasks get priority
  if (card.idList === 'list-3') score += 60;
  
  // Focus level match
  const difficulty = assessDifficulty(card);
  if (context.focusLevel === 'high' && difficulty === 'hard') score += 25;
  if (context.focusLevel === 'medium' && difficulty === 'medium') score += 20;
  if (context.focusLevel === 'low' && difficulty === 'easy') score += 15;
  
  return score;
}

/**
 * Rank tasks by recommendation score
 */
export function rankTasks(cards: TrelloCard[], context: UserContext): Array<{card: TrelloCard, score: number}> {
  const activeCards = cards.filter(c => !c.closed && c.idList !== 'list-4');
  
  const rankedTasks = activeCards.map(card => ({
    card,
    score: scoreTask(card, context)
  }));
  
  return rankedTasks.sort((a, b) => b.score - a.score);
}

/**
 * Main analysis function that processes the entire board
 */
export function analyzeBoard(board: TrelloBoard = mockTrelloBoard): {
  insights: ProductivityInsights;
  patterns: TaskPattern[];
  topTasks: Array<{card: TrelloCard, score: number}>;
  context: UserContext;
} {
  const insights = generateProductivityInsights(board);
  const patterns = analyzeTaskPatterns(board.cards);
  const context = getUserContext();
  const topTasks = rankTasks(board.cards, context).slice(0, 5);
  
  return {
    insights,
    patterns,
    topTasks,
    context
  };
}
