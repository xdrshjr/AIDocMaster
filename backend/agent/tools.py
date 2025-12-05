"""
Document Tools for Agent
Provides tools for searching and modifying document content
Supports both HTML string and paragraph array formats
"""

import logging
import json
from typing import Dict, Any, List, Optional, Union


logger = logging.getLogger(__name__)


class DocumentTools:
    """
    Tools for document manipulation
    Provides search and modify capabilities for the agent
    Supports paragraph-based operations
    """
    
    def __init__(self, initial_content: Union[str, List[Dict[str, Any]]] = ""):
        """
        Initialize document tools
        
        Args:
            initial_content: Initial document content (HTML string or paragraphs array)
        """
        # Determine content type
        if isinstance(initial_content, list):
            self.paragraphs = initial_content
            self.document_content = self._paragraphs_to_html(initial_content)
            self.content_type = 'paragraphs'
            logger.info('DocumentTools initialized with paragraphs', extra={
                'paragraph_count': len(initial_content),
            })
        else:
            self.document_content = initial_content if isinstance(initial_content, str) else ""
            self.paragraphs = []
            self.content_type = 'html'
            logger.info('DocumentTools initialized with HTML', extra={
                'content_length': len(self.document_content),
            })
    
    def _paragraphs_to_html(self, paragraphs: List[Dict[str, Any]]) -> str:
        """Convert paragraphs array to HTML string"""
        if not paragraphs:
            return ""
        # Sort by index to ensure correct order
        sorted_paragraphs = sorted(paragraphs, key=lambda p: p.get('index', 0))
        return '\n'.join(p.get('content', '') for p in sorted_paragraphs)
    
    def _html_to_paragraphs(self, html: str) -> List[Dict[str, Any]]:
        """Convert HTML string to paragraphs array (simplified)"""
        # This is a simplified version - in production, you'd want more sophisticated parsing
        # For now, split by common paragraph tags
        import re
        paragraphs = []
        # Split by paragraph-level tags
        parts = re.split(r'(<p[^>]*>.*?</p>|<h[1-6][^>]*>.*?</h[1-6]>|<li[^>]*>.*?</li>)', html, flags=re.DOTALL)
        index = 0
        for part in parts:
            if part.strip() and not part.strip().startswith('<'):
                # Text content
                paragraphs.append({
                    'id': f'para-{index}',
                    'index': index,
                    'content': f'<p>{part.strip()}</p>',
                    'text': part.strip(),
                })
                index += 1
            elif part.strip() and (part.strip().startswith('<p') or part.strip().startswith('<h') or part.strip().startswith('<li')):
                # HTML element
                text = re.sub(r'<[^>]+>', '', part).strip()
                if text:
                    paragraphs.append({
                        'id': f'para-{index}',
                        'index': index,
                        'content': part.strip(),
                        'text': text,
                    })
                    index += 1
        return paragraphs if paragraphs else [{'id': 'para-0', 'index': 0, 'content': html, 'text': re.sub(r'<[^>]+>', '', html).strip()}]
    
    @staticmethod
    def get_tool_descriptions() -> str:
        """
        Get descriptions of available tools for the agent
        
        Returns:
            Formatted string describing all available tools
        """
        return """Available Tools:

1. search_document_paragraphs(query: str) -> Dict
   - Description: Intelligently search for paragraphs in the document using flexible matching
   - Input: query (string) - Can be keywords, title, partial text, or any search term
   - Output: {
       "found": boolean,
       "matches": [
           {
               "paragraph_id": "para-0",
               "paragraph_index": 0,
               "text": "paragraph plain text",
               "paragraph_content": "paragraph HTML content",
               "relevance_score": 100,
               "match_type": "exact|all_words|heading|partial|sequence"
           }
       ],
       "total_matches": number
     }
   - Matching strategies (in priority order):
     * Exact match: Query exactly appears in paragraph (highest relevance, score 100)
     * All words: All query words appear in paragraph (score 80)
     * Heading match: Paragraph is a heading/title and matches query (score 70)
     * Partial match: Some query words appear in paragraph (score 50+)
     * Sequence match: Query characters appear in order (score 5+)
   - Results are sorted by relevance score (highest first)
   - Use this to find paragraphs that need to be modified, even with partial keywords or titles

2. modify_document_paragraph(paragraph_id: str, new_content: str) -> Dict
   - Description: Replace a specific paragraph's content
   - Input:
     * paragraph_id (string) - ID of the paragraph to modify (e.g., "para-0")
     * new_content (string) - New HTML content for the paragraph
   - Output: {
       "success": boolean,
       "paragraph_id": "para-0",
       "message": "description of what was changed",
       "updated_paragraphs": [list of all paragraphs]
     }
   - Use this to modify a specific paragraph
   - The left panel will update automatically after successful modification

3. get_document_paragraphs() -> Dict
   - Description: Get all document paragraphs
   - Input: None
   - Output: {
       "paragraphs": [
           {
               "id": "para-0",
               "index": 0,
               "content": "paragraph HTML",
               "text": "paragraph plain text"
           }
       ],
       "total_paragraphs": number
     }
   - Use this to review all paragraphs before planning changes

4. add_document_paragraph(index: int, content: str) -> Dict
   - Description: Add a new paragraph at a specific index
   - Input:
     * index (int) - Position to insert the paragraph
     * content (string) - HTML content for the new paragraph
   - Output: {
       "success": boolean,
       "paragraph_id": "para-X",
       "message": "description of what was added",
       "updated_paragraphs": [list of all paragraphs]
     }
   - Use this to add new paragraphs to the document

5. delete_document_paragraph(paragraph_id: str) -> Dict
   - Description: Delete a specific paragraph
   - Input:
     * paragraph_id (string) - ID of the paragraph to delete
   - Output: {
       "success": boolean,
       "paragraph_id": "para-0",
       "message": "description of what was deleted",
       "updated_paragraphs": [list of remaining paragraphs]
     }
   - Use this to remove paragraphs from the document
"""
    
    def search_document_paragraphs(self, query: str) -> Dict[str, Any]:
        """
        Search for paragraphs in the document using intelligent matching
        Supports exact match, partial match, keyword match, and title matching
        
        Args:
            query: Text to search for (can be keywords, title, or partial text)
            
        Returns:
            Dictionary with search results, sorted by relevance
        """
        logger.info('[TOOL] search_document_paragraphs called', extra={
            'tool': 'search_document_paragraphs',
            'query_preview': query[:50] + '...' if len(query) > 50 else query,
            'query_length': len(query),
            'paragraph_count': len(self.paragraphs) if self.content_type == 'paragraphs' else 0,
        })
        
        if not query:
            logger.warning('[TOOL] Empty search query provided')
            result = {
                "found": False,
                "matches": [],
                "message": "Search query cannot be empty"
            }
            logger.debug('[TOOL] search_document_paragraphs result', extra={'result': result})
            return result
        
        # Ensure paragraphs are loaded
        if self.content_type == 'html' and not self.paragraphs:
            self.paragraphs = self._html_to_paragraphs(self.document_content)
            logger.debug('[TOOL] Converted HTML to paragraphs for search', extra={
                'paragraph_count': len(self.paragraphs),
            })
        
        query_lower = query.lower().strip()
        query_words = [w for w in query_lower.split() if len(w) > 1]  # Filter out single characters
        
        matches = []
        
        # Search in each paragraph with multiple matching strategies
        for para in self.paragraphs:
            para_text = para.get('text', '').lower()
            para_content = para.get('content', '').lower()
            para_html = para.get('content', '')
            
            # Calculate relevance score
            relevance_score = 0
            match_type = None
            
            # Strategy 1: Exact match (highest priority)
            if query_lower in para_text:
                relevance_score += 100
                match_type = "exact"
                logger.debug('[TOOL] Exact match found', extra={
                    'paragraph_id': para.get('id'),
                })
            
            # Strategy 2: All query words present (high priority)
            elif query_words and all(word in para_text for word in query_words):
                relevance_score += 80
                match_type = "all_words"
                logger.debug('[TOOL] All words match found', extra={
                    'paragraph_id': para.get('id'),
                })
            
            # Strategy 3: Title/heading match (check if paragraph is a heading and query matches)
            elif any(tag in para_html.lower() for tag in ['<h1', '<h2', '<h3', '<h4', '<h5', '<h6']):
                if query_lower in para_text or any(word in para_text for word in query_words):
                    relevance_score += 70
                    match_type = "heading"
                    logger.debug('[TOOL] Heading match found', extra={
                        'paragraph_id': para.get('id'),
                    })
            
            # Strategy 4: Partial word match (medium priority)
            elif query_words and any(word in para_text for word in query_words):
                matched_words = sum(1 for word in query_words if word in para_text)
                relevance_score += 50 + (matched_words * 10)
                match_type = "partial"
                logger.debug('[TOOL] Partial match found', extra={
                    'paragraph_id': para.get('id'),
                    'matched_words': matched_words,
                })
            
            # Strategy 5: Character sequence match (lower priority)
            elif len(query_lower) >= 3:
                # Check if query characters appear in order in paragraph
                query_chars = list(query_lower)
                para_chars = list(para_text)
                char_pos = 0
                for char in query_chars:
                    if char_pos < len(para_chars) and char in para_chars[char_pos:]:
                        char_pos = para_chars.index(char, char_pos) + 1
                        relevance_score += 5
                    else:
                        break
                if relevance_score > 0:
                    match_type = "sequence"
                    logger.debug('[TOOL] Character sequence match found', extra={
                        'paragraph_id': para.get('id'),
                    })
            
            # Add to matches if any match found
            if relevance_score > 0:
                matches.append({
                    "paragraph_id": para.get('id', ''),
                    "paragraph_index": para.get('index', 0),
                    "text": para.get('text', ''),
                    "paragraph_content": para.get('content', ''),
                    "relevance_score": relevance_score,
                    "match_type": match_type,
                })
                logger.debug('[TOOL] Match added to results', extra={
                    'paragraph_id': para.get('id'),
                    'relevance_score': relevance_score,
                    'match_type': match_type,
                })
        
        # Sort by relevance score (highest first)
        matches.sort(key=lambda x: x.get('relevance_score', 0), reverse=True)
        
        result = {
            "found": len(matches) > 0,
            "matches": matches,
            "total_matches": len(matches),
            "message": f"Found {len(matches)} paragraph(s) matching the search query" if matches else "No paragraphs found matching the search query"
        }
        
        logger.info('[TOOL] search_document_paragraphs completed', extra={
            'found': result['found'],
            'matches_count': result['total_matches'],
            'matched_paragraph_ids': [m['paragraph_id'] for m in matches[:5]],  # Log top 5
            'top_relevance': matches[0].get('relevance_score') if matches else 0,
        })
        logger.debug('[TOOL] search_document_paragraphs detailed result', extra={
            'result': str(result)[:500],
        })
        
        return result
    
    def modify_document_paragraph(self, paragraph_id: str, new_content: str) -> Dict[str, Any]:
        """
        Modify a specific paragraph by ID
        
        Args:
            paragraph_id: ID of the paragraph to modify
            new_content: New HTML content for the paragraph
            
        Returns:
            Dictionary with modification results
        """
        logger.info('[TOOL] modify_document_paragraph called', extra={
            'tool': 'modify_document_paragraph',
            'paragraph_id': paragraph_id,
            'new_content_length': len(new_content),
            'new_content_preview': new_content[:80] + '...' if len(new_content) > 80 else new_content,
            'paragraph_count_before': len(self.paragraphs) if self.content_type == 'paragraphs' else 0,
        })
        
        if not paragraph_id:
            logger.warning('[TOOL] Empty paragraph_id provided')
            result = {
                "success": False,
                "paragraph_id": paragraph_id,
                "message": "Paragraph ID cannot be empty",
                "updated_paragraphs": self.paragraphs if self.content_type == 'paragraphs' else []
            }
            logger.debug('[TOOL] modify_document_paragraph result', extra={'result': result})
            return result
        
        # Ensure paragraphs are loaded
        if self.content_type == 'html' and not self.paragraphs:
            self.paragraphs = self._html_to_paragraphs(self.document_content)
            logger.debug('[TOOL] Converted HTML to paragraphs for modification', extra={
                'paragraph_count': len(self.paragraphs),
            })
        
        # Find the paragraph
        para_index = -1
        for idx, para in enumerate(self.paragraphs):
            para_id = para.get('id', '')
            # Try exact match first
            if para_id == paragraph_id:
                para_index = idx
                break
            # Try case-insensitive match
            elif para_id.lower() == paragraph_id.lower():
                para_index = idx
                logger.info('[TOOL] Found paragraph with case-insensitive match', extra={
                    'requested_id': paragraph_id,
                    'actual_id': para_id,
                })
                break
        
        if para_index == -1:
            # Log detailed information for debugging
            available_ids = [p.get('id', '') for p in self.paragraphs]
            logger.warning('[TOOL] Paragraph not found', extra={
                'paragraph_id': paragraph_id,
                'paragraph_id_type': type(paragraph_id).__name__,
                'paragraph_id_repr': repr(paragraph_id),
                'available_ids': available_ids,
                'available_ids_count': len(available_ids),
                'paragraph_count': len(self.paragraphs),
            })
            
            # Try to find similar IDs (for better error message)
            similar_ids = [pid for pid in available_ids if paragraph_id.lower() in pid.lower() or pid.lower() in paragraph_id.lower()]
            
            error_message = f"Paragraph with ID '{paragraph_id}' not found."
            if similar_ids:
                error_message += f" Did you mean one of these: {', '.join(similar_ids[:3])}?"
            else:
                error_message += f" Available paragraph IDs: {', '.join(available_ids[:5])}" + ("..." if len(available_ids) > 5 else "")
            
            result = {
                "success": False,
                "paragraph_id": paragraph_id,
                "message": error_message,
                "available_ids": available_ids,
                "similar_ids": similar_ids,
                "updated_paragraphs": self.paragraphs
            }
            return result
        
        # Update the paragraph
        import re
        old_content = self.paragraphs[para_index].get('content', '')
        self.paragraphs[para_index]['content'] = new_content
        self.paragraphs[para_index]['text'] = re.sub(r'<[^>]+>', '', new_content).strip()
        
        # Update document_content
        self.document_content = self._paragraphs_to_html(self.paragraphs)
        
        result = {
            "success": True,
            "paragraph_id": paragraph_id,
            "message": f"Successfully updated paragraph '{paragraph_id}'",
            "updated_paragraphs": self.paragraphs
        }
        
        logger.info('[TOOL] modify_document_paragraph completed successfully', extra={
            'paragraph_id': paragraph_id,
            'paragraph_index': para_index,
            'old_content_length': len(old_content),
            'new_content_length': len(new_content),
        })
        logger.debug('[TOOL] modify_document_paragraph detailed result', extra={
            'result': str(result)[:500],
        })
        
        return result
    
    def _find_similar_text(self, search_text: str, max_distance: int = 5) -> Optional[str]:
        """
        Find similar text in document for helpful error messages
        
        Args:
            search_text: Text to find similar matches for
            max_distance: Maximum edit distance for suggestions
            
        Returns:
            Similar text if found, None otherwise
        """
        if len(search_text) < 5:
            return None
        
        # Try finding partial matches (first few words)
        words = search_text.split()
        if len(words) > 2:
            first_words = ' '.join(words[:2])
            if first_words.lower() in self.document_content.lower():
                # Find the actual occurrence
                pos = self.document_content.lower().find(first_words.lower())
                if pos != -1:
                    # Extract context
                    end_pos = min(pos + len(search_text) + 20, len(self.document_content))
                    similar = self.document_content[pos:end_pos].strip()
                    logger.debug('[TOOL] Found partial match for suggestion', extra={
                        'search_text': search_text[:50],
                        'similar_text': similar[:50],
                    })
                    return similar
        
        return None
    
    def get_document_paragraphs(self) -> Dict[str, Any]:
        """
        Get all document paragraphs
        
        Returns:
            Dictionary with paragraphs array
        """
        logger.info('[TOOL] get_document_paragraphs called', extra={
            'tool': 'get_document_paragraphs',
            'content_type': self.content_type,
            'paragraph_count': len(self.paragraphs) if self.content_type == 'paragraphs' else 0,
        })
        
        # Ensure paragraphs are loaded
        if self.content_type == 'html' and not self.paragraphs:
            self.paragraphs = self._html_to_paragraphs(self.document_content)
            logger.debug('[TOOL] Converted HTML to paragraphs', extra={
                'paragraph_count': len(self.paragraphs),
            })
        
        result = {
            "paragraphs": self.paragraphs,
            "total_paragraphs": len(self.paragraphs),
            "message": f"Document contains {len(self.paragraphs)} paragraph(s)"
        }
        
        logger.debug('[TOOL] get_document_paragraphs result', extra={
            'total_paragraphs': result['total_paragraphs'],
            'paragraph_ids': [p.get('id') for p in self.paragraphs],
        })
        
        return result
    
    def add_document_paragraph(self, index: int, content: str) -> Dict[str, Any]:
        """
        Add a new paragraph at a specific index
        
        Args:
            index: Position to insert the paragraph
            content: HTML content for the new paragraph
            
        Returns:
            Dictionary with modification results
        """
        logger.info('[TOOL] add_document_paragraph called', extra={
            'tool': 'add_document_paragraph',
            'index': index,
            'content_length': len(content),
        })
        
        # Ensure paragraphs are loaded
        if self.content_type == 'html' and not self.paragraphs:
            self.paragraphs = self._html_to_paragraphs(self.document_content)
        
        import re
        # Create new paragraph
        new_para_id = f'para-{len(self.paragraphs)}'
        new_para = {
            'id': new_para_id,
            'index': index,
            'content': content,
            'text': re.sub(r'<[^>]+>', '', content).strip(),
        }
        
        # Insert at index
        self.paragraphs.insert(index, new_para)
        
        # Re-index all paragraphs
        for idx, para in enumerate(self.paragraphs):
            para['index'] = idx
        
        # Update document_content
        self.document_content = self._paragraphs_to_html(self.paragraphs)
        
        result = {
            "success": True,
            "paragraph_id": new_para_id,
            "message": f"Successfully added paragraph at index {index}",
            "updated_paragraphs": self.paragraphs
        }
        
        logger.info('[TOOL] add_document_paragraph completed', extra={
            'paragraph_id': new_para_id,
            'index': index,
            'total_paragraphs': len(self.paragraphs),
        })
        
        return result
    
    def delete_document_paragraph(self, paragraph_id: str) -> Dict[str, Any]:
        """
        Delete a specific paragraph
        
        Args:
            paragraph_id: ID of the paragraph to delete
            
        Returns:
            Dictionary with modification results
        """
        logger.info('[TOOL] delete_document_paragraph called', extra={
            'tool': 'delete_document_paragraph',
            'paragraph_id': paragraph_id,
        })
        
        # Ensure paragraphs are loaded
        if self.content_type == 'html' and not self.paragraphs:
            self.paragraphs = self._html_to_paragraphs(self.document_content)
        
        # Find and remove the paragraph
        para_index = -1
        for idx, para in enumerate(self.paragraphs):
            if para.get('id') == paragraph_id:
                para_index = idx
                break
        
        if para_index == -1:
            logger.warning('[TOOL] Paragraph not found for deletion', extra={
                'paragraph_id': paragraph_id,
                'available_ids': [p.get('id') for p in self.paragraphs],
            })
            result = {
                "success": False,
                "paragraph_id": paragraph_id,
                "message": f"Paragraph with ID '{paragraph_id}' not found",
                "updated_paragraphs": self.paragraphs
            }
            return result
        
        # Remove the paragraph
        self.paragraphs.pop(para_index)
        
        # Re-index all paragraphs
        for idx, para in enumerate(self.paragraphs):
            para['index'] = idx
        
        # Update document_content
        self.document_content = self._paragraphs_to_html(self.paragraphs)
        
        result = {
            "success": True,
            "paragraph_id": paragraph_id,
            "message": f"Successfully deleted paragraph '{paragraph_id}'",
            "updated_paragraphs": self.paragraphs
        }
        
        logger.info('[TOOL] delete_document_paragraph completed', extra={
            'paragraph_id': paragraph_id,
            'paragraph_index': para_index,
            'total_paragraphs': len(self.paragraphs),
        })
        
        return result
    
    def execute_tool(self, tool_name: str, **kwargs) -> Dict[str, Any]:
        """
        Execute a tool by name
        
        Args:
            tool_name: Name of the tool to execute
            **kwargs: Tool arguments
            
        Returns:
            Tool execution result
        """
        logger.info('[TOOL] Executing tool', extra={
            'tool_name': tool_name,
            'tool_args_keys': list(kwargs.keys()),
            'tool_args_preview': str(kwargs)[:200] + '...' if len(str(kwargs)) > 200 else str(kwargs),
        })
        
        try:
            if tool_name == "search_document_paragraphs":
                result = self.search_document_paragraphs(kwargs.get("query", ""))
            elif tool_name == "modify_document_paragraph":
                result = self.modify_document_paragraph(
                    kwargs.get("paragraph_id", ""),
                    kwargs.get("new_content", "")
                )
            elif tool_name == "get_document_paragraphs":
                result = self.get_document_paragraphs()
            elif tool_name == "add_document_paragraph":
                result = self.add_document_paragraph(
                    kwargs.get("index", 0),
                    kwargs.get("content", "")
                )
            elif tool_name == "delete_document_paragraph":
                result = self.delete_document_paragraph(kwargs.get("paragraph_id", ""))
            else:
                valid_tools = [
                    "get_document_paragraphs", 
                    "search_document_paragraphs", 
                    "modify_document_paragraph",
                    "add_document_paragraph",
                    "delete_document_paragraph"
                ]
                logger.error('[TOOL] Unknown tool requested', extra={
                    'tool_name': tool_name,
                    'valid_tools': valid_tools,
                })
                result = {
                    "success": False,
                    "message": f"Unknown tool: {tool_name}. Only these tools are available: {', '.join(valid_tools)}. Please use one of the valid tools.",
                    "error": f"Invalid tool name: {tool_name}"
                }
            
            logger.info('[TOOL] Tool execution completed', extra={
                'tool_name': tool_name,
                'success': result.get('success', result.get('found', True)),
                'result_message': result.get('message', '')[:100],
            })
            
            return result
            
        except Exception as e:
            logger.error('[TOOL] Tool execution failed', extra={
                'tool_name': tool_name,
                'error': str(e),
                'error_type': type(e).__name__,
            }, exc_info=True)
            return {
                "success": False,
                "message": f"Tool execution error: {str(e)}",
                "error": str(e)
            }

