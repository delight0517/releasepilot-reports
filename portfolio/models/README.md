# 3D 작업 추가하는 법

1. `.glb`(권장, 단일 파일) 또는 `.gltf` 파일을 이 폴더에 넣는다. 필요하면 포스터
   이미지(로딩 전 미리보기, `.jpg`/`.png`)도 같이 넣는다.
2. `../models.json`에 아래 형식으로 한 줄 추가한다:

```json
{
  "id": "unique-slug",
  "title": "작업 제목",
  "file": "example.glb",
  "poster": "example-poster.jpg",
  "caption": "짧은 설명 (재료, 제작 배경 등)"
}
```

3. `git add`, `git commit`, `git push`로 반영한다.

페이지는 구글의 `<model-viewer>` 웹 컴포넌트로 렌더링한다 — 방문자가 드래그로
회전, 스크롤/핀치로 확대·축소할 수 있는 실제 3D 뷰어다. 파일 용량이 크면
(예: 30MB 이상) 로딩이 느려지니, 가능하면 [gltf-transform](https://gltf-transform.dev/)
등으로 압축한 뒤 올리는 걸 권장한다.
