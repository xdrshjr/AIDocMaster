/**
 * Header Component
 * Top navigation bar for the application
 */

'use client';

import { logger } from '@/lib/logger';
import { useEffect } from 'react';

interface HeaderProps {
  title: string;
}

const Header = ({ title }: HeaderProps) => {
  useEffect(() => {
    logger.component('Header', 'mounted');
  }, []);

  return (
    <header className="h-8 bg-background border-b-4 border-border flex items-center px-4 shadow-sm">
      <div className="flex items-center justify-between w-full">
        <h1 className="text-lg font-bold tracking-tight text-foreground">
          {title}
        </h1>
        <div className="flex items-center gap-2">
          {/* Placeholder for future actions like settings, user menu, etc. */}
        </div>
      </div>
    </header>
  );
};

export default Header;

