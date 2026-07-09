# Code Signing Policy

**Current state (v1.4.0): release artifacts are NOT yet code-signed.** Windows SmartScreen will
warn when running the beta installer; the README and User Manual document the prompt and how to
verify the published SHA-256 checksums instead. The policy below describes the signing process
this project is onboarding toward with SignPath Foundation, and takes effect with the first
signed release.

## Windows — SignPath Foundation (planned)
Free code signing provided by SignPath.io, certificate by SignPath Foundation.

### What will be signed
- Windows installer/executable artifacts published on GitHub Releases

### Build and signing process
- Artifacts submitted for signing will be built from this repository using GitHub Actions
  (GitHub-hosted runners only). Until that CI release pipeline exists, releases are built by the
  maintainer with the repo's `pnpm test:release` gate and published with SHA-256 checksums —
  and remain unsigned.
- Only CI-built artifacts will be submitted to SignPath for signing
- The private key is held by SignPath (HSM-backed); this project does not store the private key

### Team roles
- Author (commit access): https://github.com/scottconverse
- Approver (approves each signing request): https://github.com/scottconverse
- Policy: Each signing request requires explicit approval by the maintainer

## Distribution
Releases (currently unsigned, with SHA-256 checksums) are published at:
https://github.com/scottconverse/TinkerQuarry/releases

## Privacy
This software will not transfer any information to other networked systems unless specifically requested by the user.
