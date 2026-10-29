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
cd release-artifacts
cp SHA256SUMS.txt SHA256SUMS-linux.txt
for package in *.AppImage *.deb *.tar.gz *.tgz SHA256SUMS-linux.txt; do
  [[ -e "$package" ]] || continue
  test -f "$package"
  printf '%s' "${OPENAEC_GPG_PASSPHRASE:-}" | gpg --batch --yes --pinentry-mode loopback --passphrase-fd 0 --local-user "$fingerprint" --armor --detach-sign "$package"
  gpg --batch --verify "$package.asc" "$package"
done
gpg --armor --export "$fingerprint" > linux-signing-public-key.asc
printf '%s\n' "$fingerprint" > linux-signing-fingerprint.txt
