import unittest

from code.content_scanner import StubContentScanner
from code.handle_issue_created import handle_issue_created


class MemoryIssueApi:
    def __init__(self):
        self.issue = {
            "issueId": 7,
            "statusId": 5,
            "matureContent": False,
            "links": [],
            "authorPoints": 4,
        }
        self.mature = None
        self.points = 4

    async def get_issue(self, issue_id):
        return self.issue

    async def put_llm_answer(self, issue_id, mature: bool):
        self.mature = mature
        self.issue["statusId"] = 1
        self.issue["matureContent"] = mature


class RejectScanner(StubContentScanner):
    def __init__(self):
        super().__init__(verified=False)
        self.calls = 0

    async def scan(self, issue, files):
        self.calls += 1
        return await super().scan(issue, files)


class ModerationTests(unittest.IsolatedAsyncioTestCase):
    async def test_rejection_does_not_call_ollama_and_keeps_points(self):
        api = MemoryIssueApi()
        scanner = RejectScanner()
        await handle_issue_created(
            {"issueId": 7, "timestamp": "2026-01-01T00:00:00Z"},
            None,
            scanner,
            api,
            load_files=lambda issue: [],
        )
        self.assertEqual(scanner.calls, 1)
        self.assertTrue(api.mature)
        self.assertEqual(api.issue["statusId"], 1)
        self.assertTrue(api.issue["matureContent"])
        self.assertEqual(api.points, 4)


if __name__ == "__main__":
    unittest.main()
