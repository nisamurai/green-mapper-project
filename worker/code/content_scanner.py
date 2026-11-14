import base64
import json
import logging
import os

logger = logging.getLogger(__name__)


def ollama_url() -> str:
    explicit = os.getenv("OLLAMA_API_URL")
    if explicit:
        return explicit
    host = os.getenv("OLLAMA_HOST", "localhost:11434")
    if host.startswith("http://") or host.startswith("https://"):
        return f"{host.rstrip('/')}/api/chat"
    return f"http://{host}/api/chat"


def ollama_model() -> str:
    return os.getenv("OLLAMA_MODEL", "llava:7b")


class ContentScanner:
    async def scan(self, issue: dict, files: list[bytes]) -> dict:
        raise NotImplementedError


class StubContentScanner(ContentScanner):
    def __init__(self, verified: bool):
        self.verified = verified

    async def scan(self, issue: dict, files: list[bytes]) -> dict:
        return {
            "verified": self.verified,
            "message": "" if self.verified else "stub",
        }


class OllamaContentScanner(ContentScanner):
    async def scan(self, issue: dict, files: list[bytes]) -> dict:
        images_b64 = [base64.b64encode(file).decode("utf-8") for file in files]
        payload = {
            "model": ollama_model(),
            "stream": False,
            "format": {
                "type": "object",
                "properties": {
                    "verified": {"type": "boolean"},
                    "message": {"type": "string"},
                },
                "required": ["verified", "message"],
            },
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "Ты модератор изображений для городских заявок. "
                        "Анализируй только то, что видно на изображении. "
                        "Запрещенным считай: порнографию/обнаженку, жестокость, кровь и шок-контент, "
                        "самоповреждение, оружие, наркотики, экстремистскую символику. "
                        "Ответ верни строго в JSON: "
                        '{"verified": true|false, "message": "..."}. '
                        "Если verified=true, message должен быть пустой строкой. "
                        "Если verified=false, message должен быть коротким пояснением на русском."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        "Проверь изображение и контекст заявки ниже. "
                        "Ответ верни только в заданном JSON-формате.\n\n"
                        f"Данные заявки:\n{json.dumps(issue, ensure_ascii=False)}"
                    ),
                    "images": images_b64,
                },
            ],
        }
        body = json.dumps(payload, ensure_ascii=False)
        from aiohttp import ClientSession, ClientTimeout
        from aiohttp_retry import RetryClient, RandomRetry

        timeout = ClientTimeout(total=10)
        retry_options = RandomRetry(attempts=5)
        try:
            async with ClientSession(timeout=timeout) as session:
                retry_client = RetryClient(session)
                async with retry_client.post(
                    ollama_url(),
                    headers={"Content-Type": "application/json"},
                    retry_options=retry_options,
                    data=body,
                ) as request:
                    request.raise_for_status()
                    response = await request.json()
        except Exception as error:
            logger.error("ошибка при обращении к ollama: %s", error, exc_info=True)
            raise

        content = response.get("message", {}).get("content", "")
        if not content:
            raise RuntimeError(f"Ollama returned empty message.content. Raw response: {response}")
        try:
            parsed = json.loads(content)
        except json.JSONDecodeError as error:
            raise RuntimeError(f"Failed to parse model JSON content: {content}") from error

        required_keys = {"verified", "message"}
        if not required_keys.issubset(parsed.keys()):
            raise RuntimeError(
                f"Parsed JSON misses required fields. Got: {parsed}, required: {required_keys}"
            )
        parsed["verified"] = bool(parsed["verified"])
        parsed["message"] = str(parsed["message"]).strip()
        return parsed


def build_scanner() -> ContentScanner:
    stub = os.getenv("CONTENT_SCANNER_STUB")
    if stub is not None and stub != "":
        return StubContentScanner(verified=stub.lower() == "true")
    if os.getenv("SKIP_LLM") == "true":
        return StubContentScanner(verified=False)
    return OllamaContentScanner()
