#!/usr/bin/env python3
"""새 사진 묶음이 기존 사진(예: acting/assets/)과 같은 원본의 재추출/재크롭본인지
픽셀 단위 average-hash로 빠르게 판별한다. 외부 API·pip 설치 없이 표준 Pillow만
사용(이 프로젝트의 zero-API 원칙 — [[reference_icon_check_handoff]]와 동일 계열).

2026-08-13: 클로이 박이 Notion에서 받은 15장을 기존 14장과 사람이 직접 눈으로
대조하느라 시간을 많이 썼다("신규 15장 전부가 기존과 같은 사진의 재추출본"으로
판명). 다음부턴 이 스크립트로 먼저 걸러내고, 실제로 다른 후보만 사람이 본다.

사용법:
    python3 scripts/dedupe_images.py <existing_dir> <candidate_dir> [--threshold 8]

출력: 각 후보 파일이 기존 어떤 파일과 몇 bit 차이(hamming distance)로 가장
가까운지 표로 출력. threshold(기본 8/64bit) 이하면 "DUPLICATE"로 표시.
"""
import sys
import argparse
from pathlib import Path

from PIL import Image


def ahash(path, hash_size=8):
    img = Image.open(path).convert("L").resize(
        (hash_size, hash_size), Image.LANCZOS
    )
    pixels = list(img.getdata())
    avg = sum(pixels) / len(pixels)
    bits = "".join("1" if p > avg else "0" for p in pixels)
    return int(bits, 2)


def hamming(a, b):
    return bin(a ^ b).count("1")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("existing_dir")
    parser.add_argument("candidate_dir")
    parser.add_argument("--threshold", type=int, default=8)
    args = parser.parse_args()

    existing = {}
    for p in sorted(Path(args.existing_dir).glob("*")):
        if p.suffix.lower() in (".jpg", ".jpeg", ".png", ".heic"):
            try:
                existing[p.name] = ahash(p)
            except Exception as e:
                print(f"  (skip {p.name}: {e})", file=sys.stderr)

    if not existing:
        print("기존 폴더에 이미지가 없습니다.")
        return

    print(f"{'후보 파일':40} {'가장 가까운 기존 파일':30} {'차이(bit)':>10}  판정")
    print("-" * 100)
    for p in sorted(Path(args.candidate_dir).glob("*")):
        if p.suffix.lower() not in (".jpg", ".jpeg", ".png", ".heic"):
            continue
        try:
            h = ahash(p)
        except Exception as e:
            print(f"{p.name:40} (읽기 실패: {e})")
            continue
        best_name, best_dist = min(
            ((name, hamming(h, eh)) for name, eh in existing.items()),
            key=lambda x: x[1],
        )
        verdict = "DUPLICATE" if best_dist <= args.threshold else "new"
        print(f"{p.name:40} {best_name:30} {best_dist:>10}  {verdict}")


if __name__ == "__main__":
    main()
