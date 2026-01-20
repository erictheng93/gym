import { createDirectus, rest, authentication } from '@directus/sdk'
import type { DirectusSchema } from '@gym-nexus/shared/types'

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()

  const directus = createDirectus<DirectusSchema>(config.public.directusUrl)
    .with(rest({ credentials: 'include' }))
    .with(authentication('session', { credentials: 'include' }))

  return {
    provide: {
      directus
    }
  }
})
