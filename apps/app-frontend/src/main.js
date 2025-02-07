import { createApp } from 'vue'
import router from '@/routes'
import App from '@/App.vue'
import { createPinia } from 'pinia'
import FloatingVue from 'floating-vue'
import 'floating-vue/dist/style.css'
import { createPlugin } from '@vintl/vintl/plugin'
import * as Sentry from '@sentry/vue'

const VIntlPlugin = createPlugin({
  controllerOpts: {
    defaultLocale: 'en-US',
    locale: 'en-US',
    locales: [
      {
        tag: 'en-US',
        meta: {
          displayName: 'American English',
        },
      },
    ],
  },
  globalMixin: true,
  injectInto: [],
})

const pinia = createPinia()

let app = createApp(App)

Sentry.init({
  app,
  dsn: 'https://03f2ad671fafdadbe2a4c11ae884f4c5@o4508388109451264.ingest.de.sentry.io/4508609682014288',
  integrations: [Sentry.browserTracingIntegration({ router })],
  tracesSampleRate: 0.1,
})

app.use(router)
app.use(pinia)
app.use(FloatingVue, {
  themes: {
    'ribbit-popout': {
      $extend: 'dropdown',
      placement: 'bottom-end',
      instantMove: true,
      distance: 8,
    },
  },
})
app.use(VIntlPlugin)

app.mount('#app')
