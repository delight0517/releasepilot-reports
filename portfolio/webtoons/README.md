# 웹툰 추가하는 법

1. 이 폴더 안에 작품별 하위 폴더를 만든다 (예: `my-toon-title/`).
2. 그 안에 표지 이미지 하나와, 위에서부터 읽히는 순서대로 컷 이미지들을 번호를
   붙여 넣는다 (`01.jpg`, `02.jpg`, ...).
3. `../webtoons.json`에 아래 형식으로 한 편(에피소드) 추가한다:

```json
{
  "id": "unique-slug",
  "slug": "my-toon-title",
  "title": "작품 제목",
  "cover": "cover.jpg",
  "panels": ["01.jpg", "02.jpg", "03.jpg"]
}
```

`panels` 배열의 순서 그대로 세로로 이어 붙여서, 실제 웹툰 앱처럼 위에서
아래로 스크롤하며 읽는 화면이 만들어진다. 반영은 `git add`, `git commit`, `git push`.
