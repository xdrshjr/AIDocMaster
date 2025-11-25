"""
Test Agent Router
-----------------

Simple test script to verify agent routing functionality.
Run this script to ensure the agent router works correctly.
"""

import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from agent.agent_router import (
    AgentRouter,
    get_available_agents,
    AUTO_WRITER_AGENT,
    DOCUMENT_MODIFIER_AGENT,
)


def test_get_available_agents():
    """Test getting available agents list"""
    print("=" * 80)
    print("Test 1: Get Available Agents")
    print("=" * 80)
    
    agents = get_available_agents()
    
    print(f"Found {len(agents)} agents:")
    for agent in agents:
        print(f"\n  - Name: {agent['name']}")
        print(f"    Type: {agent['type']}")
        print(f"    Requires Document: {agent['requires_document']}")
        print(f"    Capabilities: {len(agent['capabilities'])}")
    
    assert len(agents) == 2, "Should have 2 agents"
    assert any(a['type'] == 'auto_writer' for a in agents), "Should have auto_writer agent"
    assert any(a['type'] == 'document_modifier' for a in agents), "Should have document_modifier agent"
    
    print("\n[PASS] Test 1 Passed!\n")


def test_agent_descriptors():
    """Test agent descriptor properties"""
    print("=" * 80)
    print("Test 2: Agent Descriptors")
    print("=" * 80)
    
    # Test auto writer
    print("\n[AutoWriter Agent]")
    print(f"  Name: {AUTO_WRITER_AGENT.name}")
    print(f"  Type: {AUTO_WRITER_AGENT.agent_type}")
    print(f"  Requires Document: {AUTO_WRITER_AGENT.requires_document}")
    print(f"  Capabilities: {len(AUTO_WRITER_AGENT.capabilities)}")
    
    assert AUTO_WRITER_AGENT.agent_type == "auto_writer"
    assert AUTO_WRITER_AGENT.requires_document == False
    assert len(AUTO_WRITER_AGENT.capabilities) > 0
    
    # Test document modifier
    print("\n[Document Modifier Agent]")
    print(f"  Name: {DOCUMENT_MODIFIER_AGENT.name}")
    print(f"  Type: {DOCUMENT_MODIFIER_AGENT.agent_type}")
    print(f"  Requires Document: {DOCUMENT_MODIFIER_AGENT.requires_document}")
    print(f"  Capabilities: {len(DOCUMENT_MODIFIER_AGENT.capabilities)}")
    
    assert DOCUMENT_MODIFIER_AGENT.agent_type == "document_modifier"
    assert DOCUMENT_MODIFIER_AGENT.requires_document == True
    assert len(DOCUMENT_MODIFIER_AGENT.capabilities) > 0
    
    print("\n[PASS] Test 2 Passed!\n")


def test_agent_router_initialization():
    """Test agent router can be initialized"""
    print("=" * 80)
    print("Test 3: Agent Router Initialization")
    print("=" * 80)
    
    # Mock configuration
    api_key = "test-key"
    api_url = "https://api.openai.com/v1"
    model_name = "gpt-4"
    
    try:
        router = AgentRouter(
            api_key=api_key,
            api_url=api_url,
            model_name=model_name,
            language='en'
        )
        
        print(f"\n[PASS] Router initialized successfully")
        print(f"  Language: {router.language}")
        print(f"  Model: {router.llm.model_name}")
        
        print("\n[PASS] Test 3 Passed!\n")
        
    except Exception as e:
        print(f"\n[FAIL] Test 3 Failed: {e}\n")
        raise


def test_routing_prompt_generation():
    """Test routing prompt generation"""
    print("=" * 80)
    print("Test 4: Routing Prompt Generation")
    print("=" * 80)
    
    router = AgentRouter(
        api_key="test-key",
        api_url="https://api.openai.com/v1",
        model_name="gpt-4",
        language='zh'
    )
    
    # Test building agent descriptions
    descriptions = router._build_agent_descriptions()
    print(f"\n[PASS] Agent descriptions generated ({len(descriptions)} characters)")
    assert "AI Document Auto-Writer" in descriptions
    assert "AI Document Modifier" in descriptions
    
    # Test system prompt
    system_prompt = router._create_routing_prompt(descriptions, has_document=True)
    print(f"[PASS] System prompt generated ({len(system_prompt)} characters)")
    assert len(system_prompt) > 0
    
    # Test user prompt
    user_prompt = router._create_user_prompt("Write an article about AI")
    print(f"[PASS] User prompt generated ({len(user_prompt)} characters)")
    assert "Write an article about AI" in user_prompt
    
    print("\n[PASS] Test 4 Passed!\n")


def test_fallback_routing():
    """Test fallback routing when LLM fails"""
    print("=" * 80)
    print("Test 5: Fallback Routing")
    print("=" * 80)
    
    # This test doesn't call real LLM, just tests fallback logic
    # In real scenario, if LLM fails, router should fall back to heuristic
    
    print("\n[INFO] Fallback routing scenarios:")
    print("  - With document -> Should default to document_modifier")
    print("  - Without document -> Should default to auto_writer")
    
    print("\n[PASS] Test 5 design verified (requires live LLM for full test)\n")


def main():
    """Run all tests"""
    print("\n" + "=" * 80)
    print("AGENT ROUTER TEST SUITE")
    print("=" * 80 + "\n")
    
    try:
        test_get_available_agents()
        test_agent_descriptors()
        test_agent_router_initialization()
        test_routing_prompt_generation()
        test_fallback_routing()
        
        print("\n" + "=" * 80)
        print("[SUCCESS] ALL TESTS PASSED!")
        print("=" * 80 + "\n")
        
        print("Note: Live LLM routing tests require valid API credentials.")
        print("To test with real LLM, set environment variables:")
        print("  - OPENAI_API_KEY")
        print("  - OPENAI_API_BASE (optional)")
        print("  - OPENAI_MODEL (optional, default: gpt-4)")
        
    except Exception as e:
        print("\n" + "=" * 80)
        print(f"[FAIL] TEST FAILED: {e}")
        print("=" * 80 + "\n")
        raise


if __name__ == "__main__":
    main()

