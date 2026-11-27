import { defineConfig, type Plugin } from 'vite'

/**
 * Public URL of the deployed site (must end with "/").
 * Set automatically by the deploy workflow; the default is used for local builds; override with SITE_URL=... npm run build
 */
const SITE_URL = (process.env.SITE_URL || 'https://911idonotcode.github.io/shipit/').replace(/\/*$/, '/')

/** Publishes the Bluesky OAuth client metadata document next to index.html. */
function oauthClientMetadata(): Plugin {
  return {
    name: 'atproto-client-metadata',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'client-metadata.json',
        source: JSON.stringify(
          {
            client_id: `${SITE_URL}client-metadata.json`,
            client_name: '24 Days of Run-Mas',
            client_uri: SITE_URL,
            redirect_uris: [SITE_URL],
            scope: 'atproto transition:generic',
            grant_types: ['authorization_code', 'refresh_token'],
            response_types: ['code'],
            application_type: 'web',
            token_endpoint_auth_method: 'none',
            dpop_bound_access_tokens: true,
          },
          null,
          2,
        ),
      })
    },
  }
}

export default defineConfig(({ command }) => ({
  base: command === 'build' ? new URL(SITE_URL).pathname : '/',
  plugins: [oauthClientMetadata()],
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
}))
