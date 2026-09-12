from document_worker.chunk import chunk_text


class TestChunkText:
    def test_짧은_텍스트는_청크_하나로_반환한다(self):
        chunks = chunk_text("hello world", target_tokens=100)

        assert len(chunks) == 1
        assert chunks[0].chunk_index == 0
        assert chunks[0].content == "hello world"
        assert chunks[0].token_count > 0

    def test_긴_텍스트는_여러_청크로_나뉜다(self):
        words = " ".join(f"word{i}" for i in range(500))

        chunks = chunk_text(words, target_tokens=50)

        assert len(chunks) > 1
        assert [c.chunk_index for c in chunks] == list(range(len(chunks)))

    def test_청크를_이어붙이면_원문_단어가_모두_포함된다(self):
        words = [f"word{i}" for i in range(200)]
        text = " ".join(words)

        chunks = chunk_text(text, target_tokens=30, overlap_tokens=0)
        joined_words = " ".join(c.content for c in chunks).split()

        for word in words:
            assert word in joined_words

    def test_빈_텍스트는_빈_리스트를_반환한다(self):
        assert chunk_text("", target_tokens=100) == []

    def test_공백만_있는_텍스트는_빈_리스트를_반환한다(self):
        assert chunk_text("   \n\t  ", target_tokens=100) == []
