#!/usr/bin/env python3
"""
BUILD YOUR OWN GARDEN — 웹사이트 + 휴먼 갤러리 서버

여러 사람이 동시에 접속해서 정원을 저장해도
모두 같은 HUMAN GALLERY를 보게 됩니다. (파이썬만 있으면 됨, 설치 필요 없음)

    python3 server.py            → http://localhost:8000
    PORT=3000 python3 server.py  → 다른 포트로

저장된 정원:  gardens/<id>.png  +  gardens/gardens.json
"""

import base64
import binascii
import json
import os
import re
import secrets
import socket
import threading
import time
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
GARDENS = ROOT / "gardens"
INDEX = GARDENS / "gardens.json"

API = "/api/gardens"
MAX_BODY = 25 * 1024 * 1024       # 정원 이미지 한 장 (PNG, base64) 최대 크기
MAX_TITLE = 60
TOTAL_FRAGMENTS = 200
PNG_PREFIX = "data:image/png;base64,"
UNTITLED = "UNTITLED GARDEN"
PURGED_MARK = GARDENS / ".untitled-purged"

# 동시에 여러 명이 저장해도 목록이 꼬이지 않도록
write_lock = threading.Lock()


def read_gardens():
    try:
        return json.loads(INDEX.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def write_gardens(gardens):
    GARDENS.mkdir(exist_ok=True)
    temp = INDEX.with_suffix(".tmp")
    temp.write_text(json.dumps(gardens, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(temp, INDEX)  # 한 번에 바꿔서 읽는 중인 사람에게 반쯤 쓴 파일이 보이지 않게


def purge_untitled_once():
    """제목 없이 저장된 정원을 한 번 정리 (처음 실행할 때만)"""
    if PURGED_MARK.exists():
        return
    with write_lock:
        gardens = read_gardens()
        kept = [g for g in gardens if str(g.get("title", "")).strip() not in ("", UNTITLED)]
        for garden in gardens:
            if garden not in kept:
                (ROOT / garden.get("image", "")).unlink(missing_ok=True)
        if len(kept) != len(gardens):
            write_gardens(kept)
            print(f"제목 없는 정원 {len(gardens) - len(kept)}개를 지웠습니다.")
        GARDENS.mkdir(exist_ok=True)
        PURGED_MARK.touch()


def to_int(value, low, high):
    try:
        return max(low, min(high, int(value)))
    except (TypeError, ValueError):
        return low


class GardenHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def route(self):
        return self.path.split("?", 1)[0]

    # ---------- 목록 ----------

    def do_GET(self):
        if self.route() == API:
            self.send_json(read_gardens())
            return
        super().do_GET()

    # ---------- 저장 ----------

    def do_POST(self):
        if self.route() != API:
            self.send_error(HTTPStatus.NOT_FOUND)
            return

        length = to_int(self.headers.get("Content-Length"), 0, MAX_BODY + 1)
        if length <= 0 or length > MAX_BODY:
            self.send_json({"error": "The garden image is too large."}, HTTPStatus.REQUEST_ENTITY_TOO_LARGE)
            return

        try:
            data = json.loads(self.rfile.read(length))
            image = data["image"]
            if not isinstance(image, str) or not image.startswith(PNG_PREFIX):
                raise ValueError
            png = base64.b64decode(image[len(PNG_PREFIX):], validate=True)
            if not png.startswith(b"\x89PNG\r\n\x1a\n"):
                raise ValueError
        except (ValueError, KeyError, TypeError, binascii.Error, json.JSONDecodeError):
            self.send_json({"error": "The garden could not be read."}, HTTPStatus.BAD_REQUEST)
            return

        title = " ".join(str(data.get("title", "")).split())[:MAX_TITLE] or UNTITLED
        garden_id = time.strftime("%Y%m%d-%H%M%S") + "-" + secrets.token_hex(3)

        entry = {
            "id": garden_id,
            "title": title,
            "fragments": to_int(data.get("fragments"), 0, TOTAL_FRAGMENTS),
            "seconds": to_int(data.get("seconds"), 0, 10 ** 7),
            "image": f"gardens/{garden_id}.png",
            "createdAt": int(time.time() * 1000),
        }

        with write_lock:
            GARDENS.mkdir(exist_ok=True)
            (GARDENS / f"{garden_id}.png").write_bytes(png)
            gardens = read_gardens()
            gardens.append(entry)
            write_gardens(gardens)

        self.send_json(entry, HTTPStatus.CREATED)

    # ---------- 영상: 일부분 요청 (Safari는 이게 있어야 영상이 재생됨) ----------

    def send_head(self):
        requested = self.headers.get("Range")
        match = re.fullmatch(r"bytes=(\d*)-(\d*)", (requested or "").strip())
        path = self.translate_path(self.path)
        if not match or match.group(1) + match.group(2) == "" or not os.path.isfile(path):
            return super().send_head()

        try:
            source = open(path, "rb")
        except OSError:
            self.send_error(HTTPStatus.NOT_FOUND)
            return None

        size = os.fstat(source.fileno()).st_size
        if match.group(1):
            start = int(match.group(1))
            end = min(int(match.group(2)), size - 1) if match.group(2) else size - 1
        else:
            start = max(0, size - int(match.group(2)))
            end = size - 1

        if start > end or start >= size:
            source.close()
            self.send_response(HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
            self.send_header("Content-Range", f"bytes */{size}")
            self.end_headers()
            return None

        self.send_response(HTTPStatus.PARTIAL_CONTENT)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.send_header("Accept-Ranges", "bytes")
        self.end_headers()
        source.seek(start)
        self.range_left = end - start + 1
        return source

    def copyfile(self, source, outputfile):
        left = getattr(self, "range_left", None)
        self.range_left = None
        try:
            if left is None:
                super().copyfile(source, outputfile)
                return
            while left > 0:
                chunk = source.read(min(256 * 1024, left))
                if not chunk:
                    break
                outputfile.write(chunk)
                left -= len(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass  # 영상을 넘기거나 멈추면 브라우저가 연결을 끊음

    # ---------- 도우미 ----------

    def send_json(self, payload, status=HTTPStatus.OK):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        # 저장 요청만 기록 (이미지 수백 장 요청은 생략)
        if self.command == "POST":
            super().log_message(format, *args)


def local_address():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
            probe.connect(("8.8.8.8", 80))
            return probe.getsockname()[0]
    except OSError:
        return None


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    host = os.environ.get("HOST", "0.0.0.0")
    purge_untitled_once()
    server = ThreadingHTTPServer((host, port), GardenHandler)

    print(f"BUILD YOUR OWN GARDEN → http://localhost:{port}")
    address = local_address()
    if address and host == "0.0.0.0":
        print(f"같은 와이파이의 다른 기기 → http://{address}:{port}")
    print("종료: Ctrl+C")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
