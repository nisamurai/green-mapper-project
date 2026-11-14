import json
import asyncio
import logging

from .content_scanner import OllamaContentScanner

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s"
)
logger = logging.getLogger(__name__)


async def moderate_image(issue: dict, files: list[bytes]) -> dict:
    return await OllamaContentScanner().scan(issue, files)



def read_image_bytes(path: str) -> bytes:
    with open(path, "rb") as f:
        return f.read()

async def main() -> int:
    checks = [
        {
            "image_base": ["test_images/pic1.png", "test_images/pic2.png"],
            "request_data": {
                "shortDescription": "Огурец",
                "fullDescription": "На фото виден огурец.",
                "address": "г. Тест, ул. Примерная, д. 52",
            },
        },
    ]
    has_error = False

    for index, item in enumerate(checks):
        base = item["image_base"]
        try:
            images = [read_image_bytes(file) for file in base]
            result = await moderate_image(item["request_data"], images)
            print(f"\n=== test {index} ===")
            print(json.dumps(result, ensure_ascii=False, indent=2))
        except Exception as e:
            has_error = True
            print(e)
            print(f"\n=== {base} ===")
            print(f"ERROR: {e}")

    return 1 if has_error else 0


if __name__ == "__main__":
    asyncio.run(main())
