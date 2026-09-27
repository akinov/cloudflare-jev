import { cloudflareTest } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

process.env.TRIAGE_TOKEN ??= 'test-token'

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      remoteBindings: false,
      miniflare: {
        bindings: {
          TRIAGE_TOKEN: 'test-token',
        },
      },
    }),
  ],
})
