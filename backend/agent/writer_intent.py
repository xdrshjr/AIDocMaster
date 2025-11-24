"""
Writer intent and parameter extraction helpers.

These helpers are shared by the AutoWriter agent and can be unit tested
without performing real LLM calls by injecting fake responses.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional, TypedDict

logger = logging.getLogger(__name__)


class IntentResult(TypedDict):
    should_write: bool
    confidence: float
    reason: str


class WriterParameters(TypedDict, total=False):
    title: str
    topic: str
    language: str
    tone: str
    audience: str
    paragraph_count: int
    temperature: float
    max_tokens: int
    keywords: List[str]
    format: str


def parse_json_block(text: str):
    """
    Extract JSON payload from a raw LLM response.

    Supports fenced blocks (```json ... ```), generic code fences,
    or plain JSON text.
    """
    if not text:
        return {}

    stripped = text.strip()

    if "```json" in stripped:
        start = stripped.find("```json") + len("```json")
        end = stripped.find("```", start)
        stripped = stripped[start:end].strip()
    elif stripped.startswith("```"):
        start = stripped.find("```") + len("```")
        end = stripped.find("```", start)
        stripped = stripped[start:end].strip()

    try:
        return json.loads(stripped)
    except json.JSONDecodeError as error:
        logger.debug("[WriterIntent] Failed to parse JSON block", extra={
            "error": str(error),
            "preview": stripped[:200],
        })
        return {}


def normalize_parameters(raw: Dict) -> WriterParameters:
    """
    Normalize writer parameters returned by the LLM.

    Ensures sane defaults and data types so downstream code
    can rely on consistent structure.
    """
    defaults: WriterParameters = {
        "title": raw.get("title") or raw.get("topic") or "AI Generated Article",
        "topic": raw.get("topic") or raw.get("title") or "AI Generated Article",
        "language": (raw.get("language") or "zh").lower(),
        "tone": raw.get("tone") or "professional",
        "audience": raw.get("audience") or "general",
        "paragraph_count": int(raw.get("paragraph_count") or raw.get("segments") or 5),
        "temperature": float(raw.get("temperature") or 0.7),
        "max_tokens": int(raw.get("max_tokens") or 1200),
        "keywords": raw.get("keywords") or [],
        "format": raw.get("format") or "article",
    }

    if defaults["paragraph_count"] < 3:
        defaults["paragraph_count"] = 3
    if defaults["paragraph_count"] > 12:
        defaults["paragraph_count"] = 12

    if not isinstance(defaults["keywords"], list):
        defaults["keywords"] = []

    defaults["keywords"] = [str(keyword).strip() for keyword in defaults["keywords"] if keyword]

    temperature = defaults["temperature"]
    defaults["temperature"] = max(0.0, min(temperature, 1.5))

    max_tokens = defaults["max_tokens"]
    defaults["max_tokens"] = max(600, min(max_tokens, 4000))

    return defaults


def build_intent_prompt(user_prompt: str) -> str:
    return (
        "你是一个意图分析专家。判断用户是否请求完整的文档/文章写作任务。\n"
        "请输出 JSON，格式为：\n"
        "{\n"
        '  "should_write": true|false,\n'
        '  "confidence": 0-1之间的小数,\n'
        '  "reason": "简要理由"\n'
        "}\n"
        f"用户输入：{user_prompt}"
    )


def build_parameter_prompt(user_prompt: str) -> str:
    return (
        "你是一个专业的写作参数提取代理。请严格返回 JSON，包含文稿所需参数。\n"
        "示例：\n"
        "{\n"
        '  "title": "AI助力的金融风控白皮书",\n'
        '  "topic": "金融风控中的人工智能",\n'
        '  "language": "zh",\n'
        '  "tone": "正式且可信",\n'
        '  "audience": "银行风控团队",\n'
        '  "paragraph_count": 6,\n'
        '  "temperature": 0.6,\n'
        '  "max_tokens": 1500,\n'
        '  "keywords": ["模型治理", "监管合规"],\n'
        '  "format": "白皮书"\n'
        "}\n"
        "务必根据用户输入自适应段落数量、语调、关键词和生成参数。若用户指定模型或参数，请尊重。\n"
        f"用户输入：{user_prompt}"
    )


def analyze_intent(llm, user_prompt: str) -> IntentResult:
    prompt = build_intent_prompt(user_prompt)
    response = llm.invoke(prompt)
    payload = parse_json_block(response.content if hasattr(response, "content") else str(response))

    intent = IntentResult(
        should_write=bool(payload.get("should_write", True)),
        confidence=float(payload.get("confidence", 0.75)),
        reason=payload.get("reason", "模型判断该意图需要文档写作。"),
    )

    logger.info("[WriterIntent] Intent decision", extra=intent)
    return intent


def extract_writer_parameters(llm, user_prompt: str) -> WriterParameters:
    prompt = build_parameter_prompt(user_prompt)
    response = llm.invoke(prompt)
    payload = parse_json_block(response.content if hasattr(response, "content") else str(response))
    params = normalize_parameters(payload)

    logger.info("[WriterIntent] Writer parameters extracted", extra={
        "title": params["title"],
        "paragraph_count": params["paragraph_count"],
        "tone": params["tone"],
        "temperature": params["temperature"],
    })
    return params


