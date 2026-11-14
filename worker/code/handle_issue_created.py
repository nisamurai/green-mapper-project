import logging
import os

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


async def handle_issue_created(*args, **kwargs):
    raise RuntimeError("Handler is not configured")
