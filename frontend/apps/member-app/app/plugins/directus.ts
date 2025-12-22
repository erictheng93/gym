import { createDirectus, rest, authentication } from '@directus/sdk'
import type { DirectusSchema } from '@gym-nexus/shared/types'

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()

  const directus = createDirectus<DirectusSchema>(config.public.directusUrl)
    .with(rest())
    .with(authentication('cookie', { credentials: 'include' }))

  return {
    provide: {
      directus
    }
  }
})
