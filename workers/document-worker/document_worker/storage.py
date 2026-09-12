"""boto3-backed ObjectStorage, pointed at the same S3-compatible endpoint
(Supabase Storage) as apps/web/lib/storage.ts's presigned-URL side.

NOT verified against a real bucket in this session -- no object storage
credentials available here (structurally reviewed only, same honesty
caveat as malware_scan.py).
"""

from __future__ import annotations

import boto3


class S3ObjectStorage:
    def __init__(
        self,
        *,
        endpoint_url: str,
        region: str,
        bucket: str,
        access_key_id: str,
        secret_access_key: str,
    ):
        self._bucket = bucket
        self._client = boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            region_name=region,
            aws_access_key_id=access_key_id,
            aws_secret_access_key=secret_access_key,
        )

    def download(self, storage_key: str) -> bytes:
        response = self._client.get_object(Bucket=self._bucket, Key=storage_key)
        return response["Body"].read()
