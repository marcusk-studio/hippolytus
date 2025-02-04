import { posthog } from 'posthog-js'

export const initAnalytics = () => {
  posthog.init('phc_POpL1yZ9chHj2zRqMu4GCofU5PDXeKIyUEfwXp7NCZ9', {
    persistence: 'localStorage',
  })
}

export const debugAnalytics = () => {
  posthog.debug()
}

export const optOutAnalytics = () => {
  posthog.opt_out_capturing()
}

export const optInAnalytics = () => {
  posthog.opt_in_capturing()
}

export const trackEvent = (eventName, properties) => {
  posthog.capture(eventName, properties)
}
