# Validation evidence

Local verification on 2026-09-21, macOS arm64. All test inputs were synthetic.

| Check | Observed result |
|---|---|
| Rust workspace | 20 tests passed: 13 core, 7 VPN |
| Rust quality | Format check and Clippy with warnings denied passed |
| Collector | 9 tests passed, including a real local Redis instance |
| Browser capture origin matcher | 1 test passed |
| VPN enrollment / Python control protocol | 3 tests passed |
| Frontend | TypeScript and Vite production build passed |
| Native shell | Tauri compiled and executable launched without startup error |
| Local model | Installed qwen3:0.6b returned a real response and two reviewable extraction proposals |
| Application simulation | 6 separate SQLCipher installations, 30 provider requests, 6 rejected revoked-grant requests, 6 private reports |
| VPN simulation | 18 encrypted bidirectional exchanges over real localhost UDP, 12 fresh-key rotations with accelerated policy time |
| User interface | Login, memory creation/editing, scoped sharing, model response, receipt, revocation and navigation exercised; 430px viewport had no horizontal overflow; no JavaScript errors observed |
| Deployment syntax | Shell checks and Compose configuration validation passed |

Run `./scripts/bootstrap.sh` then `./scripts/verify.sh` to repeat local checks with no application instance already listening on the fixture ports. Set `OMNI_TEST_REDIS_URL` to a dedicated test Redis database to include the Redis integration test. Without that variable, it is explicitly skipped. `npm run simulate` writes its machine-readable assertions to `.omni/simulation-latest.json` and returns a nonzero exit status on failure. Runtime evidence is excluded from Git; GitHub Actions uploads the synthetic report produced by its own run.

The simulated provider responses and logical rotation clock are test fixtures. WireGuard, SQLCipher, grants, OpenDP and collector transactions execute real code. These checks do not establish production throughput, unique-human analytics, an operating-system sandbox, or a signed VPN application. The local Docker daemon was unavailable, so the image build and privileged Linux kernel-WireGuard interoperability test are assigned to GitHub Actions. Read the actual workflow result before treating those checks as successful.
