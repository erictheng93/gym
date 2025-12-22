import { createDirectus, rest, authentication } from '@directus/sdk'
import type { DirectusSchema } from '~/types/directus'

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()

  const directus = createDirectus<DirectusSchema>(config.public.directusUrl)
    .with(authentication('cookie', { credentials: 'include' }))
    .with(rest({ credentials: 'include' }))

  return {
    provide: {
      directus
    }
  }
})
