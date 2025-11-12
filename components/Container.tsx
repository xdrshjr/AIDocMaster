/**
 * Container Component
 * Main content area that displays the active task's content
 */

'use client';

import { useEffect } from 'react';
import { logger } from '@/lib/logger';

interface ContainerProps {
  children: React.ReactNode;
}

const Container = ({ children }: ContainerProps) => {
  useEffect(() => {
    logger.component('Container', 'mounted');
  }, []);

  return (
    <main className="flex-1 bg-background overflow-auto">
      <div className="h-full p-8">
        {children}
      </div>
    </main>
  );
};

export default Container;

