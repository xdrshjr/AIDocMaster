import os
import sys
import unittest

TEST_DIR = os.path.dirname(__file__)
BACKEND_ROOT = os.path.abspath(os.path.join(TEST_DIR, ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

from agent.writer_intent import normalize_parameters, parse_json_block


class WriterIntentHelpersTest(unittest.TestCase):
    def test_parse_json_block_plain(self):
        payload = parse_json_block('{"should_write": true}')
        self.assertTrue(payload.get("should_write"))

    def test_parse_json_block_with_code_fence(self):
        raw = """```json
        {"title": "Hello"}
        ```"""
        payload = parse_json_block(raw)
        self.assertEqual(payload.get("title"), "Hello")

    def test_normalize_parameters_bounds(self):
        params = normalize_parameters({
            "paragraph_count": 1,
            "temperature": 2,
            "max_tokens": 100,
            "keywords": "invalid"
        })
        self.assertEqual(params["paragraph_count"], 3)
        self.assertLessEqual(params["temperature"], 1.5)
        self.assertGreaterEqual(params["max_tokens"], 600)
        self.assertIsInstance(params["keywords"], list)


if __name__ == "__main__":
    unittest.main()

