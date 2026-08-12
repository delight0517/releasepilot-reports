# 영상 추가하는 법

두 가지 방식이 있다 — 하나만 채우면 된다.

**A) 유튜브에 이미 올린 영상**

`../videos.json`에 `youtube` 필드만 채우면 된다. 썸네일은 유튜브에서 자동으로
가져온다:

```json
{
  "id": "unique-slug",
  "title": "영상 제목",
  "date": "2026-08-12",
  "youtube": "https://youtu.be/xxxxxxxxxxx"
}
```

**B) 이 저장소에 직접 올리는 영상 파일**

`.mp4` 파일과 썸네일(`.jpg`)을 이 폴더에 넣고, `../videos.json`에 `file`/`thumbnail`
필드로 채운다:

```json
{
  "id": "unique-slug",
  "title": "영상 제목",
  "date": "2026-08-12",
  "file": "example.mp4",
  "thumbnail": "example-thumb.jpg"
}
```

영상 파일 직접 업로드는 저장소 용량을 빨리 키우니, 짧은 클립이 아니면 A) 유튜브
방식을 권장한다. 반영은 `git add`, `git commit`, `git push`.
