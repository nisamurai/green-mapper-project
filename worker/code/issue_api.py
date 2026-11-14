import logging
import os

logger = logging.getLogger(__name__)


class IssueApi:
    async def get_issue(self, issue_id) -> dict:
        raise NotImplementedError

    async def put_llm_answer(self, issue_id, mature: bool) -> None:
        raise NotImplementedError


class IssueBackendApi(IssueApi):
    def __init__(self):
        self.back_host = "backend" if os.getenv("IN_CONTAINER") else "localhost"
        self.secret = os.getenv("BETTER_AUTH_SECRET", "")

    async def get_issue(self, issue_id) -> dict:
        from aiohttp import ClientSession, ClientTimeout
        from aiohttp_retry import RetryClient, RandomRetry

        timeout = ClientTimeout(total=10)
        retry_options = RandomRetry(attempts=5)
        async with ClientSession(timeout=timeout) as session:
            retry_client = RetryClient(session)
            async with retry_client.get(
                f"http://{self.back_host}:3000/reports/{issue_id}",
                headers={"x-service-key": self.secret},
                retry_options=retry_options,
            ) as response:
                response.raise_for_status()
                return await response.json()

    async def put_llm_answer(self, issue_id, mature: bool) -> None:
        from aiohttp import ClientSession, ClientTimeout
        from aiohttp_retry import RetryClient, RandomRetry

        timeout = ClientTimeout(total=10)
        retry_options = RandomRetry(attempts=5)
        async with ClientSession(timeout=timeout) as session:
            retry_client = RetryClient(session)
            async with retry_client.put(
                f"http://{self.back_host}:3000/reports/{issue_id}/llm_answer",
                headers={"x-service-key": self.secret},
                json={"matureContent": mature},
                retry_options=retry_options,
            ) as response:
                response.raise_for_status()
                logger.info("issue %s moved to the next status", issue_id)
