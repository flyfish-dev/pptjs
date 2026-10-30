# @file-viewer/ppt distribution

This repository distributes the compiled Apache-2.0 binary PowerPoint preview
runtime and its trusted npm publishing workflow. The TypeScript development
repository and the retired native engine's history remain private.

```sh
npm install @file-viewer/ppt
```

The package contains JavaScript, declarations, README, LICENSE and notices.
Implementation TypeScript, source maps, fonts, native WASM, customer files and
private test inputs are excluded. See the package README for browser integration,
migration from the native 0.3.x runtime, and rendering limitations.

Oracle performs builds, browser/Worker checks and installed Vite/Webpack consumer
tests. The final GitHub-hosted job verifies the same frozen bytes and publishes
through npm OIDC. It uses no persistent npm token or interactive npm login and
does not rebuild or repack the candidate.

Legacy native releases retain their original licenses and watermark requirements.
The Apache-2.0 grant for this implementation does not relicense those releases.

[Documentation](https://doc.file-viewer.app/guide/on-demand-renderers) ·
[Report an issue](https://github.com/flyfish-dev/file-viewer/issues) ·
[Support](https://dev.flyfish.group/shop)
