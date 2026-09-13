import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from env_file import parse_env_file  # noqa: E402


class TestParseEnvFile:
    def test_key_value_쌍을_파싱한다(self, tmp_path):
        env_file = tmp_path / ".env.local"
        env_file.write_text("FOO=bar\nBAZ=qux\n", encoding="utf-8")

        result = parse_env_file(env_file)

        assert result == {"FOO": "bar", "BAZ": "qux"}

    def test_주석과_빈줄을_무시한다(self, tmp_path):
        env_file = tmp_path / ".env.local"
        env_file.write_text("# comment\nFOO=bar\n\n# another\nBAZ=qux\n", encoding="utf-8")

        result = parse_env_file(env_file)

        assert result == {"FOO": "bar", "BAZ": "qux"}

    def test_값에_등호가_포함되어도_첫번째_등호만_구분자로_쓴다(self, tmp_path):
        env_file = tmp_path / ".env.local"
        env_file.write_text("DATABASE_URL=postgres://a:b@c/d?x=1\n", encoding="utf-8")

        result = parse_env_file(env_file)

        assert result == {"DATABASE_URL": "postgres://a:b@c/d?x=1"}

    def test_파일이_없으면_빈_딕셔너리를_반환한다(self, tmp_path):
        result = parse_env_file(tmp_path / "missing.env")

        assert result == {}
