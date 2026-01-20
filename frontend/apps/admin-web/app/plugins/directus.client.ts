import { createDirectus, rest, authentication } from '@directus/sdk'
import type { DirectusSchema } from '~/types/directus'

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()

  // Use 'json' mode for token-based auth (works better with SSR)
  // Tokens are stored in memory and sent via Authorization header
  const directus = createDirectus<DirectusSchema>(config.public.directusUrl)
    .with(authentication('json'))
    .with(rest())

  return {
    provide: {
      directus
    }
  }
})
