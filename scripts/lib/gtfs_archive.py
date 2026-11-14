"""Bounded GTFS ZIP/CSV reader using Python's maintained standard library (PSF license).

Never extracts paths. Imports are side-effect free for isolated Vitest security tests.
"""
import csv
import datetime
import hashlib
import io
import json
import pathlib
import stat
import sys
import time
import urllib.request
import zipfile

SOURCE = 'https://smtt.ro/transit/gtfs/maps/smtt-timisoara-ro.zip'
MAX_ARCHIVE = 64 * 1024 * 1024
MAX_EXPANDED = 256 * 1024 * 1024
MAX_FILE = 128 * 1024 * 1024
MAX_FILES = 128
KNOWN = {'agency.txt', 'stops.txt', 'routes.txt', 'trips.txt', 'stop_times.txt',
         'calendar.txt', 'calendar_dates.txt', 'feed_info.txt', 'shapes.txt', 'frequencies.txt', 'attributions.txt'}


def read_csv(text, name):
    csv.field_size_limit(65536)
    records = csv.reader(io.StringIO(text, newline=''), strict=True)
    columns = next(records, None)
    if not columns or any(not c or c != c.strip() for c in columns) or len(set(columns)) != len(columns) or len(columns) > 128:
        raise ValueError(f'{name}: invalid/duplicate CSV headers')
    rows = []
    for row in records:
        if len(row) != len(columns):
            raise ValueError(f'{name}: line {records.line_num}: expected {len(columns)} fields, got {len(row)}')
        if any('\x00' in cell for cell in row):
            raise ValueError(f'{name}: NUL in CSV')
        rows.append(dict(zip(columns, row)))
        if len(rows) > 2_000_000:
            raise ValueError(f'{name}: too many records')
    return {'columns': columns, 'rows': rows}


def read_archive(path):
    if pathlib.Path(path).stat().st_size > MAX_ARCHIVE:
        raise ValueError('archive exceeds 64 MiB')
    result = {}
    with zipfile.ZipFile(path) as archive:
        entries = archive.infolist()
        if len(entries) > MAX_FILES:
            raise ValueError('too many ZIP entries')
        if sum(e.file_size for e in entries) > MAX_EXPANDED:
            raise ValueError('expanded archive exceeds 256 MiB')
        roots = set()
        paths = set()
        for entry in entries:
            path = pathlib.PurePosixPath(entry.filename)
            raw_parts = entry.filename.rstrip('/').split('/')
            if (entry.orig_filename != entry.filename or '\x00' in entry.filename or path.is_absolute() or '\\' in entry.filename or ':' in entry.filename or
                    any(part in ('..', '.', '') for part in raw_parts) or len(raw_parts) > 2):
                raise ValueError('unsafe or unexpected ZIP path')
            if entry.filename in paths:
                raise ValueError('duplicate ZIP path')
            paths.add(entry.filename)
            if stat.S_ISLNK(entry.external_attr >> 16) or entry.flag_bits & 1:
                raise ValueError('symlink/encrypted ZIP entry unsupported')
            if entry.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED):
                raise ValueError('unsupported ZIP compression')
            if entry.file_size > MAX_FILE:
                raise ValueError('ZIP member exceeds 128 MiB')
            if entry.is_dir():
                continue
            roots.add(str(path.parent))
            # Read even unretained files to verify CRC/truncation and the declared size.
            with archive.open(entry) as stream:
                data = stream.read(MAX_FILE + 1)
            if len(data) != entry.file_size or len(data) > MAX_FILE:
                raise ValueError('ZIP size mismatch')
            if path.suffix.lower() == '.txt':
                text = data.decode('utf-8-sig', errors='strict')
                if path.name in KNOWN:
                    if path.name in result:
                        raise ValueError('duplicate GTFS filename')
                    result[path.name] = read_csv(text, path.name)
        if len(roots) != 1:
            raise ValueError('expected GTFS files in one directory')
    return result


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise ValueError('redirect rejected: update the reviewed fixed SMTT source explicitly')


def download(path):
    started = time.monotonic()
    request = urllib.request.Request(SOURCE, headers={
        'User-Agent': 'VLAIQ-FLOW-UniHack2026/0.1 (bounded GTFS snapshot)', 'Accept': 'application/zip'})
    opener = urllib.request.build_opener(NoRedirect())
    with opener.open(request, timeout=15) as response:
        if response.status != 200:
            raise ValueError(f'HTTP {response.status}')
        declared = response.headers.get('Content-Length')
        if declared and int(declared) > MAX_ARCHIVE:
            raise ValueError('archive exceeds 64 MiB')
        data = bytearray()
        while True:
            chunk = response.read(65536)
            if not chunk:
                break
            data.extend(chunk)
            if len(data) > MAX_ARCHIVE or time.monotonic() - started > 45:
                raise ValueError('download size/time limit exceeded')
        if not data.startswith(b'PK\x03\x04'):
            raise ValueError('response is not a ZIP archive')
        content_type = response.headers.get_content_type()
        if content_type not in ('application/zip', 'application/octet-stream', 'application/x-zip-compressed'):
            raise ValueError(f'unexpected content type: {content_type}')
        if declared and int(declared) != len(data):
            raise ValueError('truncated HTTP body')
    pathlib.Path(path).write_bytes(data)
    return {'source': SOURCE, 'fetchedAt': datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00', 'Z'),
            'sha256': hashlib.sha256(data).hexdigest(), 'archiveBytes': len(data)}


if __name__ == '__main__':
    try:
        # Fail without touching the last good digest if a pathological input exhausts the budget.
        if sys.platform == 'linux':
            import resource
            resource.setrlimit(resource.RLIMIT_AS, (1536 * 1024 * 1024, 1536 * 1024 * 1024))
        if sys.argv[1] == '--download':
            print(json.dumps(download(sys.argv[2])))
        elif sys.argv[1] == '--archive':
            result = read_archive(sys.argv[2])
            pathlib.Path(sys.argv[3]).write_text(json.dumps(result, ensure_ascii=False), encoding='utf-8')
        else:
            raise ValueError('expected --download or --archive')
    except Exception as error:
        print(f'GTFS ingestion failed: {type(error).__name__}: {error}', file=sys.stderr)
        sys.exit(1)
