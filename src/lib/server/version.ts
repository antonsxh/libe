import pkg from '../../../package.json' with { type: 'json' };

/**
 * The server's own version: `package.json`, which the release pipeline sets to the version it
 * builds (`scripts/release.ts set-version`). `0.0.0` = a development build.
 */
export const SERVER_VERSION: string = pkg.version;
