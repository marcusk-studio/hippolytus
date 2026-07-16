import { onMounted, onUnmounted, ref } from 'vue'

/**
 * Returns a TresCanvas `render-mode` that drops to `manual` (stops the
 * continuous render loop, and with it the GPU work) while the window is hidden
 * or unfocused, and back to `always` when it returns to the foreground.
 *
 * Bind the returned ref to `<TresCanvas :render-mode="...">`.
 */
export function useForegroundRenderMode() {
	const renderMode = ref<'always' | 'manual'>('always')

	function sync() {
		renderMode.value = document.hidden || !document.hasFocus() ? 'manual' : 'always'
	}

	onMounted(() => {
		document.addEventListener('visibilitychange', sync)
		window.addEventListener('focus', sync)
		window.addEventListener('blur', sync)
		sync()
	})

	onUnmounted(() => {
		document.removeEventListener('visibilitychange', sync)
		window.removeEventListener('focus', sync)
		window.removeEventListener('blur', sync)
	})

	return renderMode
}
