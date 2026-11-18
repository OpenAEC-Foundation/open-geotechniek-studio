#!/usr/bin/env bash
set -euo pipefail
: "${OPENAEC_GPG_PRIVATE_KEY:?Linux signing key is required}"
: "${OPENAEC_GPG_FINGERPRINT:?Expected public fingerprint is required}"
export GNUPGHOME
GNUPGHOME=$(mktemp -d)
chmod 700 "$GNUPGHOME"
trap 'gpgconf --kill gpg-agent; rm -rf "$GNUPGHOME"' EXIT
printf '%s' "$OPENAEC_GPG_PRIVATE_KEY" | gpg --batch --import
fingerprint=$(printf '%s' "$OPENAEC_GPG_FINGERPRINT" | tr -d '[:space:]' | tr '[:lower:]' '[:upper:]')
[[ "$fingerprint" =~ ^([A-F0-9]{40}|[A-F0-9]{64})$ ]]
actual=$(gpg --batch --with-colons --list-secret-keys "$fingerprint" | awk -F: '$1=="fpr" {print $10; exit}')
test "$actual" = "$fingerprint"
artifact_dir=${1:-release-artifacts}
checksum_name=${2:-SHA256SUMS-linux.txt}
case "$checksum_name" in
  SHA256SUMS-linux.txt|SHA256SUMS-snap.txt) ;;
  *) echo 'Unsupported checksum manifest name' >&2; exit 1 ;;
esac
cd "$artifact_dir"
cp SHA256SUMS.txt "$checksum_name"
for package in *.AppImage *.deb *.snap *.tar.gz *.tgz "$checksum_name"; do
  [[ -e "$package" ]] || continue
  test -f "$package"
  printf '%s' "${OPENAEC_GPG_PASSPHRASE:-}" | gpg --batch --yes --pinentry-mode loopback --passphrase-fd 0 --local-user "$fingerprint" --armor --detach-sign "$package"
  gpg --batch --verify "$package.asc" "$package"
done
gpg --armor --export "$fingerprint" > linux-signing-public-key.asc
printf '%s\n' "$fingerprint" > linux-signing-fingerprint.txt
