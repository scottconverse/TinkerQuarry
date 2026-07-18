# Code Signing Policy

**Windows installers are code-signed beginning with v1.5.0**, using Azure Trusted Signing
(Microsoft's managed signing service; the GitHub action is published as
`azure/artifact-signing-action`). The signing process below was proven end-to-end on a test
artifact on 2026-07-11, and v1.5.0 is the first shipped release built with it.
Releases v1.4.0 and earlier are unsigned; their published SHA-256 checksums remain the
integrity mechanism for verifying those downloads.

## How a release gets signed

1. The installer is built locally by the maintainer behind the repo's `pnpm test:release` gate
   (unchanged) and uploaded to a **draft** GitHub release together with `SHA256SUMS.txt` and
   `release-manifest.json`.
2. The maintainer runs the **Sign installer** workflow
   ([.github/workflows/sign-installer.yml](.github/workflows/sign-installer.yml)) with the
   release tag. The workflow downloads the installer from the draft release, sends it to Azure
   for signing, and Azure signs it with its HSM-held certificate.
3. The workflow verifies the result in the same run (`signtool verify /pa /v` must show a valid
   signature, a timestamp, and a chain to a public CA), then recomputes the installer's SHA-256
   and re-uploads the signed installer with corrected `SHA256SUMS.txt` and
   `release-manifest.json`. **Checksums are always regenerated after signing** — signing changes
   the file's hash.
4. The release is published only after the signed assets are in place.

## Keys and access

- The private key lives in Azure Trusted Signing's HSM. It is not exportable and is never
  present in this repository, in CI, or on any developer machine.
- Azure authenticates the signing request against credentials stored as GitHub Actions repo
  secrets; only maintainers with write access can run the signing workflow.
- Author / approver: https://github.com/scottconverse

## What is signed

- Windows installer/executable artifacts published on GitHub Releases (v1.5.0+).

## Verifying a download

- Check the Authenticode signature: `signtool verify /pa /v <installer.exe>` (or right-click →
  Properties → Digital Signatures).
- Check the SHA-256 checksum against the release's `SHA256SUMS.txt`.

## Distribution

Releases are published at: https://github.com/scottconverse/TinkerQuarry/releases

## Privacy

This software will not transfer any information to other networked systems unless specifically
requested by the user.
