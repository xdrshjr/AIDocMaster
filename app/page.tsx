'use client';

import { useState } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Taskbar from '@/components/Taskbar';
import AIDocValidationContainer from '@/components/AIDocValidationContainer';
import { FileCheck } from 'lucide-react';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { logger } from '@/lib/logger';

export default function Home() {
  const dict = getDictionary('en'); // Default to English
  
  const [tasks] = useState([
    {
      id: 'ai-doc-validation',
      title: dict.taskbar.aiDocValidation,
      icon: <FileCheck className="w-4 h-4" />,
      isActive: true,
    },
  ]);

  const [activeTaskId, setActiveTaskId] = useState('ai-doc-validation');
  const [editorContent, setEditorContent] = useState<string>('');
  const [isExportReady, setIsExportReady] = useState(false);

  const handleTaskChange = (taskId: string) => {
    logger.info('Active task changed', { taskId }, 'Home');
    setActiveTaskId(taskId);
  };

  const handleContentChange = (content: string) => {
    setEditorContent(content);
  };

  const handleExportReadyChange = (ready: boolean) => {
    setIsExportReady(ready);
  };

  const handleExport = async () => {
    logger.info('Export initiated', undefined, 'Home');
    
    try {
      const content = editorContent;
      
      if (!content || content.length === 0) {
        logger.warn('No content to export', undefined, 'Home');
        alert('No content to export. Please upload and edit a document first.');
        return;
      }

      logger.debug('Preparing document for export', { contentLength: content.length }, 'Home');

      // Use html-docx-js for client-side conversion
      const { default: htmlDocx } = await import('html-docx-js/dist/html-docx');
      
      // Create a complete HTML document
      const completeHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: 'Calibri', sans-serif; font-size: 11pt; }
              p { margin: 0 0 10pt 0; }
              h1 { font-size: 16pt; font-weight: bold; }
              h2 { font-size: 14pt; font-weight: bold; }
            </style>
          </head>
          <body>
            ${content}
          </body>
        </html>
      `;

      // Convert HTML to DOCX
      logger.debug('Converting HTML to DOCX', undefined, 'Home');
      const converted = htmlDocx.asBlob(completeHtml);

      // Create download link
      const url = URL.createObjectURL(converted);
      const a = document.createElement('a');
      a.href = url;
      a.download = `edited-document-${Date.now()}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      logger.success('Document exported successfully', { fileName: a.download }, 'Home');

    } catch (error) {
      logger.error('Failed to export document', {
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Home');
      alert('Failed to export document. Please try again.');
    }
  };

  return (
    <div className="h-screen flex flex-col">
      <Header 
        title={dict.header.title}
        showExport={activeTaskId === 'ai-doc-validation'}
        onExport={handleExport}
        exportDisabled={!isExportReady}
      />
      
      <div className="flex-1 flex overflow-hidden">
        <Taskbar tasks={tasks} onTaskChange={handleTaskChange} />
        
        <main className="flex-1 bg-background overflow-hidden">
          {activeTaskId === 'ai-doc-validation' && (
            <AIDocValidationContainer 
              onExportRequest={handleExport}
              onContentChange={handleContentChange}
              onExportReadyChange={handleExportReadyChange}
            />
          )}
        </main>
      </div>
      
      <Footer copyright={dict.footer.copyright} />
    </div>
  );
}
