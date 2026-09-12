# Spec section 30 (필수 보안 통제): "Python 추출 worker는 non-root, 읽기 전용
# 루트, 네트워크 egress 기본 차단, CPU/메모리/시간 제한." The read-only
# filesystem, egress block, and CPU/memory/time limits are runtime
# controls (docker run --read-only, a network policy, --cpus/--memory/
# timeout) applied when this image is actually run, not something a
# Dockerfile alone can enforce -- this file only sets up what it can:
# a non-root user and no more than the needed dependencies.
#
# NOT verified in this session (no Docker available -- confirmed, not
# assumed). There is also no queue consumer entrypoint yet (Upstash
# QStash integration is deferred until Phase 4+ per the Milestone 2
# plan), so this currently packages the extract/chunk/malware_scan
# library code only -- CMD is a placeholder until that consumer exists.

FROM python:3.14-slim

RUN useradd --create-home --uid 10001 --shell /usr/sbin/nologin worker

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY document_worker ./document_worker

USER worker

# Placeholder: replace once a queue-consuming entrypoint (e.g. main.py)
# exists to actually process DOCUMENT_PROCESS jobs.
CMD ["python", "-c", "import document_worker; print('document-worker image OK, no consumer entrypoint yet')"]
