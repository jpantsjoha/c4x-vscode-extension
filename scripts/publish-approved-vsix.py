#!/usr/bin/env python3
"""Promote an approved GitHub release asset; never build or execute its contents."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import urllib.error
import urllib.request
import zipfile

REPO = 'jpantsjoha/c4x-vscode-extension'
REGISTRY = 'https://open-vsx.org'


def validate_inputs(tag, digest):
    if not re.fullmatch(r'v(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)', tag):
        raise ValueError('Expected a stable semantic version tag')
    if not re.fullmatch(r'[a-f0-9]{64}', digest):
        raise ValueError('Expected a lowercase SHA-256 digest')


def validate_vsix(path, tag, digest, checksum, source_manifest):
    if hashlib.sha256(path.read_bytes()).hexdigest() != digest:
        raise ValueError('VSIX does not match independently approved digest')
    if checksum.strip() != f'{digest}  {path.name}':
        raise ValueError('Release checksum disagrees with approved digest')
    with zipfile.ZipFile(path) as archive:
        if archive.namelist().count('extension/package.json') != 1:
            raise ValueError('Missing or duplicate package manifest')
        manifest = json.loads(archive.read('extension/package.json'))
    for key, expected in [('name', 'c4x'), ('publisher', 'jpantsjoha'), ('version', tag[1:])]:
        if manifest.get(key) != expected or source_manifest.get(key) != expected:
            raise ValueError(f'Artifact/source {key} mismatch')


def gh(*args):
    return subprocess.check_output(['gh', *args], text=True)


def registry_digest(version):
    # Fixed destination and filename: do not follow URLs supplied by registry metadata.
    url = f'{REGISTRY}/api/jpantsjoha/c4x/{version}/file/jpantsjoha.c4x-{version}.vsix'
    try:
        with urllib.request.urlopen(url, timeout=60) as response:
            h = hashlib.sha256()
            while block := response.read(1024 * 1024):
                h.update(block)
            return h.hexdigest()
    except urllib.error.HTTPError as error:
        if error.code == 404:
            return None
        raise


def main():
    if os.environ.get('GITHUB_REPOSITORY') != REPO or os.environ.get('GITHUB_REF') != 'refs/heads/main':
        raise ValueError('Publishing is restricted to the public repository main workflow')
    tag, digest = os.environ['RELEASE_TAG'], os.environ['EXPECTED_SHA256']
    validate_inputs(tag, digest)
    release = json.loads(gh('release', 'view', tag, '--repo', REPO, '--json', 'tagName,isDraft,isPrerelease'))
    if release != {'tagName': tag, 'isDraft': False, 'isPrerelease': False}:
        raise ValueError('Expected an existing published stable release')
    ref = json.loads(gh('api', f'repos/{REPO}/git/ref/tags/{tag}'))['object']
    if ref['type'] != 'tag':
        raise ValueError('Release tag must be annotated')
    commit = json.loads(gh('api', f'repos/{REPO}/git/tags/{ref["sha"]}'))['object']
    if commit['type'] != 'commit':
        raise ValueError('Tag must directly identify a commit')
    comparison = json.loads(gh('api', f'repos/{REPO}/compare/{commit["sha"]}...main'))
    if comparison['status'] not in ('ahead', 'identical'):
        raise ValueError('Tagged commit is not on main')
    source = json.loads(gh('api', f'repos/{REPO}/contents/package.json?ref={commit["sha"]}', '-H', 'Accept: application/vnd.github.raw+json'))
    with tempfile.TemporaryDirectory(prefix='c4x-publish-') as directory:
        path = Path(directory) / f'c4x-{tag[1:]}.vsix'
        gh('release', 'download', tag, '--repo', REPO, '--dir', directory,
           '--pattern', path.name, '--pattern', 'SHA256SUMS')
        validate_vsix(path, tag, digest, (Path(directory) / 'SHA256SUMS').read_text(), source)
        existing = registry_digest(tag[1:])
        if existing is not None and existing != digest:
            raise ValueError('Existing registry version has different bytes; do not overwrite')
        if existing is None:
            env = os.environ.copy()
            # Explicitly exclude stored PATs: this lane must use the registered OIDC identity.
            env.pop('OVSX_PAT', None)
            subprocess.run(['npx', '--yes', 'ovsx@1.2.0', 'publish', str(path), '--trusted-publishing'], env=env, check=True)
            if registry_digest(tag[1:]) != digest:
                raise ValueError('Published registry download does not match approved digest')
        receipt = f'Open VSX {tag}: verified SHA-256 `{digest}`; source `{commit["sha"]}`.\n'
        print(receipt)
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as summary:
            summary.write(receipt)


if __name__ == '__main__':
    main()
