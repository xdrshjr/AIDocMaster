'use client';

import { useState } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Taskbar from '@/components/Taskbar';
import Container from '@/components/Container';
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

  const handleTaskChange = (taskId: string) => {
    logger.info('Active task changed', { taskId }, 'Home');
    setActiveTaskId(taskId);
  };

  return (
    <div className="h-screen flex flex-col">
      <Header title={dict.header.title} />
      
      <div className="flex-1 flex overflow-hidden">
        <Taskbar tasks={tasks} onTaskChange={handleTaskChange} />
        
        <Container>
          <div className="flex flex-col items-center justify-center h-full">
            <div className="max-w-2xl text-center space-y-6">
              <h1 className="text-5xl font-bold tracking-tight text-foreground border-b-4 border-primary pb-4 inline-block">
                {dict.container.welcomeTitle}
              </h1>
              <p className="text-xl text-muted-foreground">
                {dict.container.welcomeDescription}
              </p>
              <div className="mt-8 p-8 bg-card border-4 border-border shadow-lg">
                <p className="text-lg text-card-foreground">
                  Ready to validate your documents with AI-powered precision
                </p>
              </div>
            </div>
          </div>
        </Container>
      </div>
      
      <Footer copyright={dict.footer.copyright} />
    </div>
  );
}
