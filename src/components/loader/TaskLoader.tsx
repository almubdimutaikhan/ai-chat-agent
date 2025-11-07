/**
 * Task-specific loading animation for AI Task Flow Agent
 */
import React from 'react';

interface TaskLoaderProps {
  message?: string;
  size?: 'small' | 'medium' | 'large';
}

export const TaskLoader: React.FC<TaskLoaderProps> = ({ 
  message = "Analyzing tasks...", 
  size = 'medium' 
}) => {
  const sizeClasses = {
    small: 'w-8 h-8',
    medium: 'w-12 h-12',
    large: 'w-16 h-16'
  };

  return (
    <div className="flex flex-col items-center justify-center gap-3 p-4">
      <div className="relative">
        {/* Outer rotating ring */}
        <div className={`${sizeClasses[size]} animate-spin rounded-full border-4 border-neutral-200 dark:border-neutral-700 border-t-[#F48120] dark:border-t-[#F48120]`} />
        
        {/* Inner pulsing dot */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-2 h-2 bg-[#F48120] rounded-full animate-pulse" />
        </div>
      </div>
      
      {message && (
        <p className="text-sm text-neutral-600 dark:text-neutral-400 animate-pulse">
          {message}
        </p>
      )}
    </div>
  );
};

/**
 * Inline loading dots for message typing indicator
 */
export const TypingIndicator: React.FC = () => {
  return (
    <div className="flex items-center gap-1 p-3">
      <span className="w-2 h-2 bg-neutral-400 dark:bg-neutral-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
      <span className="w-2 h-2 bg-neutral-400 dark:bg-neutral-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
      <span className="w-2 h-2 bg-neutral-400 dark:bg-neutral-500 rounded-full animate-bounce" />
    </div>
  );
};

/**
 * Loading skeleton for task cards
 */
export const TaskCardSkeleton: React.FC = () => {
  return (
    <div className="animate-pulse">
      <div className="bg-neutral-100 dark:bg-neutral-900 rounded-lg p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div className="space-y-2 flex-1">
            <div className="h-5 bg-neutral-200 dark:bg-neutral-800 rounded w-3/4" />
            <div className="h-4 bg-neutral-200 dark:bg-neutral-800 rounded w-1/2" />
          </div>
          <div className="h-6 w-16 bg-neutral-200 dark:bg-neutral-800 rounded" />
        </div>
        <div className="flex gap-2">
          <div className="h-5 w-12 bg-neutral-200 dark:bg-neutral-800 rounded-full" />
          <div className="h-5 w-16 bg-neutral-200 dark:bg-neutral-800 rounded-full" />
        </div>
      </div>
    </div>
  );
};
