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

async function refresh() {
	const skins = await get_available_skins().catch(handleError)
	const equipped = (skins ?? []).find((skin) => skin.is_equipped) ?? null

	if (!equipped?.texture) {
		skinTexture.value = ''
		return
	}

	try {
		skinTexture.value = await get_normalized_skin_texture(equipped)
	} catch (error) {
		if (equipped.texture.startsWith('data:image/')) {
			skinTexture.value = equipped.texture
		} else {
			handleError(error as Error)
			skinTexture.value = ''
		}
	}
}

defineExpose({ refresh })

await refresh()
</script>

<template>
	<DualSkinPreview
		v-if="skinTexture"
		:left-texture-src="skinTexture"
		:right-texture-src="PARTNER_SKIN"
		:debug="debug"
	/>
</template>
