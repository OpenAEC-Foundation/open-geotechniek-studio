"""Local regression checks; OpenPGP uses an ephemeral test key only."""
import importlib.util, json, os, shutil, subprocess, tempfile, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('version',ROOT/'scripts/version.py')
version=importlib.util.module_from_spec(spec);spec.loader.exec_module(version)

class VersionTests(unittest.TestCase):
    def test_versions(self):
        for value in ['2026.44.0','2026.1.12','2026.53.0']:
            self.assertEqual(version.validate(value),value)
        for value in ['26.44.0','2026.03.0','2026.0.0','2025.53.0','2026.44.65536']:
            with self.assertRaises(ValueError): version.validate(value)
    def test_sync_and_check_in_temporary_checkout(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);app=root/'apps/desktop'
            for name in ['packages/core/package.json','packages/native/Cargo.toml','packages/native/Cargo.lock','apps/desktop/package.json','apps/desktop/package-lock.json','apps/desktop/src-tauri/tauri.conf.json','apps/desktop/src-tauri/Cargo.toml','apps/desktop/src-tauri/Cargo.lock','snap/snapcraft.yaml','apps/desktop/src/i18n/locales/en/common.json','apps/desktop/src/i18n/locales/nl/common.json']:
                dest=root/name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy(ROOT/name,dest)
            old_root,old_app=version.ROOT,version.APP
            try:
                version.ROOT,version.APP=root,app
                version.set_version('2026.45.2');version.check('2026.45.2')
                data=json.loads((app/'package.json').read_text());self.assertEqual(data['version'],'2026.45.2')
            finally: version.ROOT,version.APP=old_root,old_app

@unittest.skipUnless(shutil.which('gpg'),'GnuPG unavailable')
class SigningTests(unittest.TestCase):
    def test_sign_verify_tamper_and_missing_key(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);home=root/'key';home.mkdir(mode=0o700)
            env={**os.environ,'GNUPGHOME':str(home)}
            def gpg(*args, **kwargs):
                return subprocess.run(['gpg','--batch',*args],env=env,check=True,capture_output=True,**kwargs)
            gpg('--passphrase','','--quick-generate-key','Geotechniek CI fixture <ci@example.invalid>','ed25519','sign','0')
            key=gpg('--armor','--export-secret-keys').stdout.decode()
            listing=gpg('--with-colons','--list-secret-keys').stdout.decode()
            fingerprint=next(line.split(':')[9] for line in listing.splitlines() if line.startswith('fpr:'))
            out=root/'release-artifacts';out.mkdir()
            for name in ['fixture.deb','fixture.AppImage','SHA256SUMS.txt']: (out/name).write_text('test fixture only\n')
            runenv={**env,'OPENAEC_GPG_PRIVATE_KEY':key,'OPENAEC_GPG_FINGERPRINT':fingerprint}
            script=str(ROOT/'scripts/ci/sign-linux.sh')
            subprocess.run(['bash',script],env=runenv,cwd=root,check=True,capture_output=True)
            gpg('--verify',str(out/'fixture.deb.asc'),str(out/'fixture.deb'))
            self.assertTrue((out/'SHA256SUMS-linux.txt.asc').exists())
            (out/'fixture.deb').write_text('tampered\n')
            with self.assertRaises(subprocess.CalledProcessError): gpg('--verify',str(out/'fixture.deb.asc'),str(out/'fixture.deb'))
            missing={k:v for k,v in env.items() if not k.startswith('OPENAEC_GPG_')}
            result=subprocess.run(['bash',script],env=missing,cwd=root,capture_output=True)
            self.assertNotEqual(result.returncode,0)
            subprocess.run(['gpgconf','--kill','gpg-agent'],env=env,capture_output=True)

if __name__=='__main__': unittest.main()
