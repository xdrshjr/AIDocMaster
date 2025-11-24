"""
AutoWriterAgent
---------------

LangGraph based agent dedicated to the AI Document Auto-Writer feature.
It composes a multi-step workflow:

1. Intent detection (LLM) – determines whether writing is required.
2. Parameter extraction (LLM) – extracts paragraph count, tone, etc.
3. LangGraph workflow – outline -> section drafting -> refinement -> compile.
4. Streaming status events so the frontend can render an elegant timeline.

The agent exposes a synchronous generator interface so Flask can stream
Server-Sent Events (SSE) back to the UI.
"""

from __future__ import annotations

import logging
import operator
from typing import Annotated, Dict, Generator, List, Optional, TypedDict

from langchain_core.messages import SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import END, StateGraph

from .writer_intent import (
    IntentResult,
    WriterParameters,
    analyze_intent,
    extract_writer_parameters,
    parse_json_block,
)

logger = logging.getLogger(__name__)


class WriterLLMConfig:
    def __init__(
        self,
        api_key: str,
        api_url: str,
        model: str,
        max_retries: int = 3,
        timeout: int = 90,
    ):
        self.api_key = api_key
        self.api_url = api_url
        self.model = model
        self.max_retries = max_retries
        self.timeout = timeout

    def get_llm(self, temperature: float = 0.7, streaming: bool = False):
        return ChatOpenAI(
            model=self.model,
            temperature=temperature,
            api_key=self.api_key,
            base_url=self.api_url,
            max_retries=self.max_retries,
            timeout=self.timeout,
            streaming=streaming,
        )


class WriterState(TypedDict, total=False):
    user_prompt: str
    language: str
    parameters: WriterParameters
    outline: List[Dict[str, str]]
    completed_sections: Annotated[List[Dict[str, str]], operator.add]
    refined_sections: Annotated[List[str], operator.add]
    final_article_markdown: str
    final_article_html: str
    llm_config: WriterLLMConfig
    error_message: Optional[str]


def build_outline(state: WriterState) -> WriterState:
    llm = state["llm_config"].get_llm(temperature=0.4)
    params = state["parameters"]
    section_count = params["paragraph_count"]

    prompt = (
        "你是一名高级结构化写作专家。根据用户需求和参数生成段落大纲。\n"
        f"用户输入：{state['user_prompt']}\n"
        f"段落数量：{section_count}\n"
        f"语调：{params['tone']}，目标读者：{params['audience']}\n"
        "输出 JSON 数组，每个元素格式：\n"
        "{\n"
        '  "title": "段落标题",\n'
        '  "summary": "50字以内概述"\n'
        "}\n"
    )

    response = llm.invoke(prompt)
    outline = []
    payload = parse_json_block(response.content if hasattr(response, "content") else str(response))
    outline = []
    if isinstance(payload, list):
        for i, item in enumerate(payload):
            outline.append({
                "title": item.get("title", f"段落 {i + 1}") if isinstance(item, dict) else f"段落 {i + 1}",
                "summary": (item.get("summary") if isinstance(item, dict) else params["topic"]) or params["topic"],
            })
    elif isinstance(payload, dict) and "outline" in payload and isinstance(payload["outline"], list):
        for i, item in enumerate(payload["outline"]):
            outline.append({
                "title": item.get("title", f"段落 {i + 1}") if isinstance(item, dict) else f"段落 {i + 1}",
                "summary": (item.get("summary") if isinstance(item, dict) else params["topic"]) or params["topic"],
            })

    if not outline:
        outline = [
            {"title": f"段落 {i + 1}", "summary": params["topic"]}
            for i in range(section_count)
        ]

    if len(outline) < section_count:
        remainder = section_count - len(outline)
        outline.extend(
            {"title": f"段落 {len(outline) + idx + 1}", "summary": params["topic"]}
            for idx in range(remainder)
        )

    state["outline"] = outline[:section_count]
    logger.info("[AutoWriter] Outline generated", extra={"sections": len(state["outline"])})
    return state


def write_section(state: WriterState) -> WriterState:
    outline = state["outline"]
    completed_count = len(state.get("completed_sections", []))
    if completed_count >= len(outline):
        return state

    section = outline[completed_count]
    params = state["parameters"]

    llm = state["llm_config"].get_llm(temperature=params["temperature"])
    previous_snippets = "\n".join(
        f"{idx + 1}. {item['title']}: {item['content'][:120]}"
        for idx, item in enumerate(state.get("completed_sections", []))
    )

    prompt = SystemMessage(
        content=(
            f"你是一名专业写作者，语言为{params['language']}。\n"
            f"主题：{params['topic']}\n"
            f"目标读者：{params['audience']}\n"
            f"语调：{params['tone']}\n"
            f"必备关键词：{', '.join(params['keywords']) or '无'}\n"
            f"之前段落内容（供参考）：\n{previous_snippets or '无'}\n"
            f"请写作段落《{section['title']}》，要求紧扣概述：{section['summary']}，字数 250-400 字。\n"
            "内容需要结构清晰，使用自然段，语言流畅。"
        )
    )

    response = llm.invoke([prompt])
    drafted_section = {
        "title": section["title"],
        "content": response.content.strip() if hasattr(response, "content") else str(response),
    }

    logger.debug("[AutoWriter] Section drafted", extra={
        "index": completed_count + 1,
        "title": drafted_section["title"],
    })

    return {
        "completed_sections": [drafted_section],
    }


def should_continue_writing(state: WriterState) -> str:
    completed_count = len(state.get("completed_sections", []))
    total = len(state["outline"])
    return "continue" if completed_count < total else "done"


def refine_article(state: WriterState) -> WriterState:
    llm = state["llm_config"].get_llm(temperature=0.3)
    sections = state.get("completed_sections", [])
    combined_text = "\n\n".join(
        f"{section['title']}\n{section['content']}" for section in sections
    )

    prompt = (
        "请将以下多段内容润色成语言更加连贯、衔接自然的正文，保留原有结构和关键信息。\n"
        "输出纯文本，不需要额外说明。\n"
        f"{combined_text}"
    )

    response = llm.invoke(prompt)
    refined_text = response.content if hasattr(response, "content") else str(response)

    return {
        "refined_sections": [refined_text],
    }


def compile_article(state: WriterState) -> WriterState:
    sections = state.get("completed_sections", [])
    
    # Directly compile from completed sections without refinement
    markdown_parts = []
    for section in sections:
        markdown_parts.append(f"## {section['title']}\n\n{section['content']}\n")
    markdown = "\n".join(markdown_parts)

    state["final_article_markdown"] = markdown.strip()
    state["final_article_html"] = build_html_from_sections(sections)

    logger.info("[AutoWriter] Article compiled", extra={
        "sections": len(sections),
        "length": len(state["final_article_markdown"]),
    })
    return state


def build_html_from_sections(sections: List[Dict[str, str]]) -> str:
    html_parts = []
    for section in sections:
        html_parts.append(f"<h2>{section['title']}</h2>")
        for paragraph in section["content"].split("\n"):
            clean = paragraph.strip()
            if clean:
                html_parts.append(f"<p>{clean}</p>")
    return "".join(html_parts)


def create_writer_workflow() -> StateGraph:
    workflow = StateGraph(WriterState)
    workflow.add_node("outline", build_outline)
    workflow.add_node("write_section", write_section)
    workflow.add_node("compile", compile_article)

    workflow.set_entry_point("outline")
    workflow.add_edge("outline", "write_section")
    workflow.add_conditional_edges(
        "write_section",
        should_continue_writing,
        {
            "continue": "write_section",
            "done": "compile",
        },
    )
    workflow.add_edge("compile", END)

    return workflow.compile()


class AutoWriterAgent:
    def __init__(self, api_key: str, api_url: str, model_name: str, language: str = "zh"):
        self.language = language
        self.config = WriterLLMConfig(api_key=api_key, api_url=api_url, model=model_name)
        self.intent_llm = self.config.get_llm(temperature=0.0)
        self.workflow = create_writer_workflow()

    def _status_event(self, phase: str, message: str, timeline: Optional[List[Dict]] = None):
        return {
            "type": "status",
            "phase": phase,
            "message": message,
            "timeline": timeline,
        }

    def run(self, user_prompt: str) -> Generator[Dict, None, None]:
        logger.info("[AutoWriter] Agent run started", extra={
            "prompt_preview": user_prompt[:120],
        })

        try:
            timeline = [
                {"id": "intent", "label": "意图识别", "state": "active"},
                {"id": "params", "label": "参数提取", "state": "upcoming"},
                {"id": "outline", "label": "结构设计", "state": "upcoming"},
                {"id": "writing", "label": "段落写作", "state": "upcoming"},
                {"id": "deliver", "label": "结果输出", "state": "upcoming"},
            ]

            yield self._status_event("intent", "正在分析任务意图...", timeline)
            intent: IntentResult = analyze_intent(self.intent_llm, user_prompt)

            if not intent["should_write"]:
                yield {
                    "type": "error",
                    "message": "当前指令不需要生成文档",
                    "reason": intent["reason"],
                }
                return

            timeline[0]["state"] = "complete"
            timeline[1]["state"] = "active"
            yield self._status_event("parameterizing", "提取写作关键参数...", timeline)

            parameters: WriterParameters = extract_writer_parameters(self.intent_llm, user_prompt)
            yield {
                "type": "parameters",
                "parameters": parameters,
            }

            timeline[1]["state"] = "complete"
            timeline[2]["state"] = "active"
            yield self._status_event("outlining", "构建文档结构...", timeline)

            initial_state: WriterState = {
                "user_prompt": user_prompt,
                "language": self.language,
                "parameters": parameters,
                "completed_sections": [],
                "llm_config": self.config,
            }

            # Stream graph execution for fine-grained progress
            section_index = 0
            drafted_sections: List[Dict[str, str]] = []
            final_state = None
            compile_handled = False
            
            for event in self.workflow.stream(
                initial_state,
                stream_mode="values",
            ):
                logger.debug("[AutoWriter] Workflow event received", extra={
                    "event_keys": list(event.keys()),
                })
                for node_name, state_update in event.items():
                    # state_update might be a dict or other type, check safely
                    is_dict = isinstance(state_update, dict)
                    logger.debug("[AutoWriter] Processing node", extra={
                        "node_name": node_name,
                        "is_dict": is_dict,
                        "has_final_markdown": is_dict and "final_article_markdown" in state_update,
                        "has_final_html": is_dict and "final_article_html" in state_update,
                    })
                    if node_name == "outline":
                        timeline[2]["state"] = "complete"
                        timeline[3]["state"] = "active"
                        yield self._status_event(
                            "writing",
                            "文档结构已设计完成，开始生成内容...",
                            timeline,
                        )
                    elif node_name == "write_section" and is_dict and "completed_sections" in state_update:
                        # Update timeline when first section starts
                        if timeline[2]["state"] != "complete":
                            timeline[2]["state"] = "complete"
                        if timeline[3]["state"] != "active":
                            timeline[3]["state"] = "active"

                        section_index += 1
                        section = state_update["completed_sections"][-1]
                        drafted_sections.append(section)
                        
                        if section_index == 1:
                            yield self._status_event(
                                "writing",
                                "开始生成正文内容...",
                                timeline,
                            )
                        
                        # Check if this is the last section
                        is_last_section = section_index >= parameters["paragraph_count"]
                        
                        yield self._status_event(
                            "writing",
                            f"正在完成段落 {section_index}/{parameters['paragraph_count']}",
                            timeline,
                        )
                        yield {
                            "type": "section_progress",
                            "current": section_index,
                            "total": parameters["paragraph_count"],
                            "title": section["title"],
                            "content": section["content"],
                        }
                        yield {
                            "type": "article_draft",
                            "html": build_html_from_sections(drafted_sections),
                        }
                        
                        # If last section, mark writing as complete and prepare for compile
                        if is_last_section:
                            timeline[3]["state"] = "complete"
                            timeline[4]["state"] = "active"
                            logger.info("[AutoWriter] All sections completed, preparing final article", extra={
                                "total_sections": section_index,
                                "timeline_state": timeline[3]["state"],
                            })
                            
                            # Generate final article immediately
                            final_html = build_html_from_sections(drafted_sections)
                            final_markdown_parts = []
                            for section in drafted_sections:
                                final_markdown_parts.append(f"## {section['title']}\n\n{section['content']}\n")
                            final_markdown = "\n".join(final_markdown_parts).strip()
                            
                            yield self._status_event("delivering", "文稿已完成，正在推送...", timeline)
                            timeline[4]["state"] = "complete"
                            yield {
                                "type": "complete",
                                "summary": "AI Auto-Writer 任务完成。",
                                "final_markdown": final_markdown,
                                "final_html": final_html,
                                "title": parameters["title"],
                                "timeline": timeline,
                            }
                            compile_handled = True
                    elif node_name == "compile" and is_dict:
                        compile_handled = True
                        final_markdown = state_update.get("final_article_markdown", "")
                        final_html = state_update.get("final_article_html", "")
                        # Ensure writing phase is marked complete
                        if timeline[3]["state"] != "complete":
                            timeline[3]["state"] = "complete"
                        timeline[4]["state"] = "active"

                        logger.info("[AutoWriter] Compile node reached, sending final status", extra={
                            "final_markdown_length": len(final_markdown),
                            "final_html_length": len(final_html),
                            "timeline_states": [t["state"] for t in timeline],
                        })

                        yield self._status_event("delivering", "文稿已完成，正在推送...", timeline)
                        
                        # Mark deliver as complete in timeline
                        timeline[4]["state"] = "complete"
                        yield {
                            "type": "complete",
                            "summary": "AI Auto-Writer 任务完成。",
                            "final_markdown": final_markdown,
                            "final_html": final_html,
                            "title": parameters["title"],
                            "timeline": timeline,
                        }
                        final_state = state_update

            # If compile node wasn't captured in stream, check final state
            if not compile_handled:
                logger.warning("[AutoWriter] Compile node not captured in stream, checking final state")
                # Invoke workflow to get final state
                try:
                    final_state = self.workflow.invoke(initial_state)
                    if "final_article_markdown" in final_state or "final_article_html" in final_state:
                        final_markdown = final_state.get("final_article_markdown", "")
                        final_html = final_state.get("final_article_html", "")
                        
                        # Ensure all phases are complete
                        if timeline[3]["state"] != "complete":
                            timeline[3]["state"] = "complete"
                        timeline[4]["state"] = "complete"
                        
                        logger.info("[AutoWriter] Sending complete event from final state", extra={
                            "final_markdown_length": len(final_markdown),
                            "final_html_length": len(final_html),
                        })
                        
                        yield self._status_event("delivering", "文稿已完成，正在推送...", timeline)
                        yield {
                            "type": "complete",
                            "summary": "AI Auto-Writer 任务完成。",
                            "final_markdown": final_markdown,
                            "final_html": final_html,
                            "title": parameters["title"],
                            "timeline": timeline,
                        }
                except Exception as e:
                    logger.error("[AutoWriter] Failed to get final state", extra={
                        "error": str(e),
                    }, exc_info=True)

            logger.info("[AutoWriter] Agent workflow finished")

        except Exception as error:
            logger.error("[AutoWriter] Agent failed", extra={
                "error": str(error),
            }, exc_info=True)
            yield {
                "type": "error",
                "message": "Auto-Writer 执行失败",
                "error": str(error),
            }


if __name__ == "__main__":
    import os

    api_key = os.environ.get("WRITER_API_KEY")
    api_url = os.environ.get("WRITER_API_URL", "https://api.openai.com/v1")
    model = os.environ.get("WRITER_MODEL", "gpt-4o-mini")

    if not api_key:
        raise SystemExit("Please set WRITER_API_KEY environment variable.")

    agent = AutoWriterAgent(api_key=api_key, api_url=api_url, model_name=model, language="zh")
    example_prompt = "请帮我写一篇面向消费电子行业的年度趋势报告，5段，语气专业。"

    for event in agent.run(example_prompt):
        print(event)

