import logging
import os

from .content_scanner import ContentScanner, build_scanner
from .issue_api import IssueApi, IssueBackendApi

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s"
)
logger = logging.getLogger(__name__)


def load_issue_files(issue: dict) -> list[bytes]:
    from minio import Minio

    bucket = os.getenv("MINIO_MAIN_BUCKET", "")
    client = Minio(
        f"{'minio' if os.getenv('IN_CONTAINER') else 'localhost'}:9000",
        access_key=os.getenv("MINIO_ROOT_USER"),
        secret_key=os.getenv("MINIO_ROOT_PASSWORD"),
        secure=False,
    )
    return [
        client.get_object(
            bucket_name=bucket, object_name=link.replace(f"{bucket}/", "")
        ).read()
        for link in issue["links"]
    ]


async def handle_issue_created(
    data: dict,
    message=None,
    scanner: ContentScanner | None = None,
    api: IssueApi | None = None,
    load_files=load_issue_files,
):
    issue_id = data.get("issueId")
    timestamp = data.get("timestamp")
    logger.info(f"Processing issue {issue_id} created at {timestamp}")
    scanner = scanner or build_scanner()
    api = api or IssueBackendApi()

    try:
        issue = await api.get_issue(issue_id)
    except Exception as error:
        logger.error(f"ошибка при чтении заявки: {error}", exc_info=True)
        raise

    try:
        files = load_files(issue)
    except Exception as error:
        logger.error(f"ошибка при получении фотографий: {error}", exc_info=True)
        raise

    llm_answer = await scanner.scan(issue, files)

    try:
        if not llm_answer["verified"]:
            logger.warning(
                f"issue was not accepted, message: {llm_answer['message']}"
            )
        else:
            logger.info(f"issue was accepted, message: {llm_answer['message']}")
        await api.put_llm_answer(issue_id, not llm_answer["verified"])
    except Exception as error:
        logger.error(
            f"не удалось сообщить беку о результате проверки: {error}", exc_info=True
        )
        raise

    logger.info(f"Issue {issue_id} processed successfully")
    return
