/**
 * AgentListDialog Component
 * Displays available AI agents with their capabilities and use cases
 */

'use client';

import { useEffect, useState } from 'react';
import { X, Bot, FileText, PenTool, Loader2 } from 'lucide-react';
import { logger } from '@/lib/logger';
import { buildApiUrl } from '@/lib/apiConfig';

interface AgentCapability {
  type: string;
  name: string;
  description: string;
  capabilities: string[];
  typical_requests: string[];
  requires_document: boolean;
}

interface AgentListDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const AgentListDialog = ({ isOpen, onClose }: AgentListDialogProps) => {
  const [agents, setAgents] = useState<AgentCapability[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadAgents();
    }
  }, [isOpen]);

  const loadAgents = async () => {
    logger.info('Loading available agents', undefined, 'AgentListDialog');
    setIsLoading(true);
    setError(null);

    try {
      const apiUrl = await buildApiUrl('/api/agents');
      logger.debug('Fetching agents from API', { apiUrl }, 'AgentListDialog');

      const response = await fetch(apiUrl);

      if (!response.ok) {
        throw new Error(`Failed to load agents: ${response.statusText}`);
      }

      const data = await response.json();
      const agentList = data.agents || [];

      logger.info('Agents loaded successfully', {
        count: agentList.length,
        types: agentList.map((a: AgentCapability) => a.type),
      }, 'AgentListDialog');

      setAgents(agentList);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Failed to load agents', { error: errorMessage }, 'AgentListDialog');
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const getAgentIcon = (agentType: string) => {
    switch (agentType) {
      case 'auto_writer':
        return <PenTool className="w-6 h-6 text-blue-500" />;
      case 'document_modifier':
        return <FileText className="w-6 h-6 text-green-500" />;
      default:
        return <Bot className="w-6 h-6 text-gray-500" />;
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-background border border-border rounded-lg shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30">
          <div className="flex items-center gap-3">
            <Bot className="w-6 h-6 text-primary" />
            <h2 className="text-xl font-semibold text-foreground">
              Available AI Agents
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
            aria-label="Close agent list"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading agents...</p>
            </div>
          )}

          {error && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-center">
              <p className="text-sm text-destructive font-medium">
                Failed to load agents
              </p>
              <p className="text-xs text-muted-foreground mt-1">{error}</p>
              <button
                onClick={loadAgents}
                className="mt-3 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 transition-colors"
              >
                Retry
              </button>
            </div>
          )}

          {!isLoading && !error && agents.length === 0 && (
            <div className="text-center py-12">
              <Bot className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-sm text-muted-foreground">No agents available</p>
            </div>
          )}

          {!isLoading && !error && agents.length > 0 && (
            <div className="space-y-6">
              {agents.map((agent, index) => (
                <div
                  key={agent.type}
                  className="bg-card border border-border rounded-lg p-6 hover:shadow-lg transition-shadow"
                >
                  {/* Agent Header */}
                  <div className="flex items-start gap-4 mb-4">
                    <div className="flex-shrink-0 p-3 bg-muted rounded-lg">
                      {getAgentIcon(agent.type)}
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-foreground mb-1">
                        {agent.name}
                      </h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {agent.description}
                      </p>
                      {agent.requires_document && (
                        <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-1 bg-amber-500/10 border border-amber-500/20 rounded text-xs text-amber-600 dark:text-amber-400">
                          <FileText className="w-3 h-3" />
                          Requires document to be loaded
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Capabilities */}
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-foreground mb-2">
                      Capabilities:
                    </h4>
                    <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {agent.capabilities.map((capability, capIndex) => (
                        <li
                          key={capIndex}
                          className="flex items-start gap-2 text-sm text-muted-foreground"
                        >
                          <span className="text-primary mt-0.5">•</span>
                          <span>{capability}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Typical Requests */}
                  <div>
                    <h4 className="text-sm font-medium text-foreground mb-2">
                      Example Requests:
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {agent.typical_requests.map((request, reqIndex) => (
                        <span
                          key={reqIndex}
                          className="inline-block px-3 py-1.5 bg-muted text-muted-foreground text-xs rounded-full border border-border hover:border-primary/50 transition-colors"
                        >
                          &quot;{request}&quot;
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border bg-muted/30">
          <p className="text-xs text-muted-foreground text-center">
            When Agent Mode is enabled, your request will be automatically routed to the most appropriate agent.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AgentListDialog;

