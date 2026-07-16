<script setup lang="ts">
import { DualSkinPreview, injectNotificationManager } from '@modrinth/ui'
import { computed, ref } from 'vue'

import { get_available_skins, get_normalized_skin_texture } from '@/helpers/skins'
import { useTheming } from '@/store/state'

const PARTNER_SKIN = 'https://mc-heads.net/skin/xMARCUSKx'

const { handleError } = injectNotificationManager()
const themeStore = useTheming()

const skinTexture = ref('')
const debug = computed(() => themeStore.getFeatureFlag('dual_skin_debug'))

// Guards against overlapping refreshes (e.g. rapid account switches) resolving
// out of order: only the latest call is allowed to write skinTexture.
let refreshToken = 0

async function refresh() {
	const token = ++refreshToken
	const commit = (value: string) => {
		if (token === refreshToken) skinTexture.value = value
	}

	const skins = await get_available_skins().catch(handleError)
	const equipped = (skins ?? []).find((skin) => skin.is_equipped) ?? null

	if (!equipped?.texture) {
		commit('')
		return
	}

	try {
		commit(await get_normalized_skin_texture(equipped))
	} catch (error) {
		if (equipped.texture.startsWith('data:image/')) {
			commit(equipped.texture)
		} else {
			handleError(error as Error)
			commit('')
		}
	}
}

defineExpose({ refresh })

await refresh()
</script>

<template>
	<!-- Height lives here so the sidebar slot collapses when there's no skin. -->
	<div v-if="skinTexture" class="h-[22rem]">
		<DualSkinPreview
			:left-texture-src="skinTexture"
			:right-texture-src="PARTNER_SKIN"
			:debug="debug"
		/>
	</div>
</template>
