/**
 * TipTap Highlight Extension
 * Custom extension for highlighting text with click handlers and metadata
 * Supports bidirectional navigation between editor and validation results
 */

import { Mark, mergeAttributes } from '@tiptap/core';
import { logger } from './logger';

export interface HighlightOptions {
  multicolor: boolean;
  HTMLAttributes: Record<string, unknown>;
  onHighlightClick?: (issueId: string, chunkIndex: number) => void;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    highlight: {
      /**
       * Set a highlight mark with metadata
       */
      setHighlight: (attributes?: { issueId?: string; chunkIndex?: number; color?: string }) => ReturnType;
      /**
       * Toggle a highlight mark with metadata
       */
      toggleHighlight: (attributes?: { issueId?: string; chunkIndex?: number; color?: string }) => ReturnType;
      /**
       * Unset a highlight mark
       */
      unsetHighlight: () => ReturnType;
      /**
       * Remove all highlights from the document
       */
      clearAllHighlights: () => ReturnType;
    };
  }
}

/**
 * Highlight Mark Extension
 * Allows marking text with colored highlights and attaching metadata (issueId, chunkIndex)
 */
export const Highlight = Mark.create<HighlightOptions>({
  name: 'highlight',

  addOptions() {
    return {
      multicolor: true,
      HTMLAttributes: {},
      onHighlightClick: undefined,
    };
  },

  addAttributes() {
    return {
      issueId: {
        default: null,
        parseHTML: element => element.getAttribute('data-issue-id'),
        renderHTML: attributes => {
          if (!attributes.issueId) {
            return {};
          }
          return {
            'data-issue-id': attributes.issueId,
          };
        },
      },
      chunkIndex: {
        default: null,
        parseHTML: element => {
          const value = element.getAttribute('data-chunk-index');
          return value ? parseInt(value, 10) : null;
        },
        renderHTML: attributes => {
          if (attributes.chunkIndex === null || attributes.chunkIndex === undefined) {
            return {};
          }
          return {
            'data-chunk-index': attributes.chunkIndex,
          };
        },
      },
      color: {
        default: '#fef3c7',
        parseHTML: element => element.getAttribute('data-color'),
        renderHTML: attributes => {
          if (!attributes.color) {
            return {};
          }
          return {
            'data-color': attributes.color,
            style: `background-color: ${attributes.color}; cursor: pointer; padding: 2px 0; border-radius: 2px;`,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'mark[data-issue-id]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['mark', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setHighlight:
        attributes =>
        ({ commands }) => {
          logger.debug('Setting highlight', { attributes }, 'HighlightExtension');
          return commands.setMark(this.name, attributes);
        },
      toggleHighlight:
        attributes =>
        ({ commands }) => {
          logger.debug('Toggling highlight', { attributes }, 'HighlightExtension');
          return commands.toggleMark(this.name, attributes);
        },
      unsetHighlight:
        () =>
        ({ commands }) => {
          logger.debug('Unsetting highlight', undefined, 'HighlightExtension');
          return commands.unsetMark(this.name);
        },
      clearAllHighlights:
        () =>
        ({ editor, state }) => {
          logger.info('Clearing all highlights from document', undefined, 'HighlightExtension');
          
          try {
            const { doc } = state;
            const tr = state.tr;
            let modified = false;
            
            // Traverse the document and remove all highlight marks
            doc.descendants((node, pos) => {
              if (node.marks.some(mark => mark.type.name === this.name)) {
                const from = pos;
                const to = pos + node.nodeSize;
                
                // Remove highlight mark from this node
                tr.removeMark(from, to, editor.schema.marks[this.name]);
                modified = true;
                
                logger.debug('Removed highlight mark', { from, to }, 'HighlightExtension');
              }
            });
            
            if (modified) {
              // Dispatch the transaction directly
              editor.view.dispatch(tr);
              logger.success('All highlights cleared successfully', undefined, 'HighlightExtension');
              return true;
            }
            
            logger.debug('No highlights found to clear', undefined, 'HighlightExtension');
            return true;
          } catch (error) {
            logger.error('Error clearing highlights', {
              error: error instanceof Error ? error.message : 'Unknown error',
            }, 'HighlightExtension');
            return false;
          }
        },
    };
  },

  // Add click event listener to highlighted text
  onSelectionUpdate() {
    const { editor } = this;
    
    // Check if click is on a highlight
    if (!editor.isActive(this.name)) {
      return;
    }
    
    // Get current mark attributes
    const mark = editor.state.selection.$from.marks().find(m => m.type.name === this.name);
    
    if (mark && mark.attrs.issueId) {
      const { issueId, chunkIndex } = mark.attrs;
      
      logger.info('Highlight clicked', {
        issueId,
        chunkIndex,
      }, 'HighlightExtension');
      
      // Call the callback if provided
      if (this.options.onHighlightClick) {
        this.options.onHighlightClick(issueId, chunkIndex);
      }
    }
  },
});

