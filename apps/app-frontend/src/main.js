import 'floating-vue/dist/style.css'
import 'overlayscrollbars/overlayscrollbars.css'

import * as Sentry from '@sentry/vue'
import { VueScanPlugin } from '@taijased/vue-render-tracker'
import { VueQueryPlugin } from '@tanstack/vue-query'
import FloatingVue from 'floating-vue'
import { createPinia } from 'pinia'
import { createApp } from 'vue'

import App from '@/App.vue'
import { overlayScrollbarsDirective } from '@/directives/overlayScrollbars'
import i18nPlugin from '@/plugins/i18n'
import i18nDebugPlugin from '@/plugins/i18n-debug'
import router from '@/routes'
import { useError } from '@/store/error.js'

const vueScan = new VueScanPlugin({
	enabled: false, // Enable or disable the tracker
	showOverlay: true, // Show overlay to visualize renders
	log: false, // Log render events to the console
	playSound: false, // Play sound on each render
})

const pinia = createPinia()

let app = createApp(App)

Sentry.init({
	app,
	dsn: 'https://03f2ad671fafdadbe2a4c11ae884f4c5@o4508388109451264.ingest.de.sentry.io/4508609682014288',
	integrations: [Sentry.browserTracingIntegration({ router })],
	tracesSampleRate: 0.1,
})

app.use(VueQueryPlugin)
app.use(vueScan)
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
		'dismissable-prompt': {
			$extend: 'dropdown',
			placement: 'bottom-start',
		},
	},
})
app.use(i18nPlugin)
app.use(i18nDebugPlugin)
app.directive('overlay-scrollbars', overlayScrollbarsDirective)

app.mount('#app')

window.addEventListener('unhandledrejection', (event) => {
	console.error('Unhandled promise rejection:', event.reason)
	const error = useError()
	error.showError(event.reason, 'Unhandled Promise Rejection')
})
