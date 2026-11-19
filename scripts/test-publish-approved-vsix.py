import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import sys
sys.dont_write_bytecode = True
import zipfile

spec = importlib.util.spec_from_file_location('publisher', Path(__file__).with_name('publish-approved-vsix.py'))
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)


class ArtifactValidation(unittest.TestCase):
    def test_rejects_unsafe_inputs(self):
        for tag in ['main', 'v1.8.0;echo bad', '../v1.8.0', 'v01.8.0', 'v1.8.0-rc1']:
            with self.assertRaises(ValueError):
                publisher.validate_inputs(tag, 'a' * 64)
        with self.assertRaises(ValueError):
            publisher.validate_inputs('v1.8.0', 'bad')

    def test_approved_identity_and_tampering(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'c4x-1.8.0.vsix'
            manifest = dict(name='c4x', publisher='jpantsjoha', version='1.8.0')
            with zipfile.ZipFile(path, 'w') as archive:
                archive.writestr('extension/package.json', json.dumps(manifest))
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            checksum = f'{digest}  {path.name}\n'
            publisher.validate_vsix(path, 'v1.8.0', digest, checksum, manifest)
            for other in [dict(manifest, version='1.7.0'), dict(manifest, publisher='other')]:
                with self.assertRaises(ValueError):
                    publisher.validate_vsix(path, 'v1.8.0', digest, checksum, other)
            with self.assertRaises(ValueError):
                publisher.validate_vsix(path, 'v1.8.0', digest, 'bad checksum', manifest)
            path.write_bytes(path.read_bytes() + b'tampered')
            with self.assertRaises(ValueError):
                publisher.validate_vsix(path, 'v1.8.0', digest, checksum, manifest)


if __name__ == '__main__':
    unittest.main()
