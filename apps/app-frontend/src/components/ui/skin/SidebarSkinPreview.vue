<script setup lang="ts">
import { injectNotificationManager, SkinPreviewRenderer } from '@modrinth/ui'
import { computed, ref } from 'vue'

import type { Cape, Skin } from '@/helpers/skins'
import {
	get_available_capes,
	get_available_skins,
	get_normalized_skin_texture,
} from '@/helpers/skins'

const { handleError } = injectNotificationManager()

const equippedSkin = ref<Skin | null>(null)
const capes = ref<Cape[]>([])
const skinTexture = ref('')

const equippedCape = computed(() =>
	equippedSkin.value?.cape_id
		? capes.value.find((c) => c.id === equippedSkin.value?.cape_id)
		: undefined,
)

async function refresh() {
	const skins = await get_available_skins().catch(handleError)
	equippedSkin.value = (skins ?? []).find((skin) => skin.is_equipped) ?? null
	capes.value = (await get_available_capes().catch(handleError)) ?? []

	if (!equippedSkin.value?.texture) {
		skinTexture.value = ''
		return
	}

	try {
		skinTexture.value = await get_normalized_skin_texture(equippedSkin.value)
	} catch (error) {
		if (equippedSkin.value.texture.startsWith('data:image/')) {
			skinTexture.value = equippedSkin.value.texture
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
	<SkinPreviewRenderer
		v-if="skinTexture"
		:texture-src="skinTexture"
		:cape-src="equippedCape?.texture"
		:variant="equippedSkin?.variant"
		:initial-rotation="-Math.PI / 8"
		:show-controls-hint="false"
	/>
</template>
