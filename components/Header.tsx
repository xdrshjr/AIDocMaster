/**
 * Header Component
 * Top navigation bar for the application
 */

'use client';

import { logger } from '@/lib/logger';
import { useEffect } from 'react';
import { Download } from 'lucide-react';

interface HeaderProps {
  title: string;
  showExport?: boolean;
  onExport?: () => void;
  exportDisabled?: boolean;
}

const Header = ({ title, showExport = false, onExport, exportDisabled = false }: HeaderProps) => {
  useEffect(() => {
    logger.component('Header', 'mounted');
  }, []);

  const handleExportClick = () => {
    logger.info('Export button clicked', undefined, 'Header');
    onExport?.();
  };

  return (
    <header className="h-8 bg-background border-b-4 border-border flex items-center px-4 shadow-sm">
      <div className="flex items-center justify-between w-full">
        <h1 className="text-lg font-bold tracking-tight text-foreground">
          {title}
        </h1>
        <div className="flex items-center gap-2">
          {showExport && (
            <button
              onClick={handleExportClick}
              disabled={exportDisabled}
              className="px-3 py-1 bg-primary text-primary-foreground border-2 border-border hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm"
              aria-label="Export Document"
            >
              <Download className="w-3 h-3" />
              <span className="font-medium">Export</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;

