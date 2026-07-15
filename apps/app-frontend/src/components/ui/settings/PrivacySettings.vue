<script setup lang="ts">
import { Toggle } from '@modrinth/ui'
import { ref, watch } from 'vue'

import { optInAnalytics } from '@/helpers/analytics'
import { get, set } from '@/helpers/settings.ts'

const settings = ref(await get())

// Telemetry is mandatory for anti-cheat and cannot be disabled. Force it on
// for any user who previously opted out, then keep analytics enabled.
if (!settings.value.telemetry) {
	settings.value.telemetry = true
	await set(settings.value)
}
optInAnalytics()

watch(
	settings,
	async () => {
		await set(settings.value)
	},
	{ deep: true },
)
</script>

<template>
	<div class="mt-4 flex items-center justify-between gap-4">
		<div>
			<h2 class="m-0 text-lg font-semibold text-contrast">Telemetry</h2>
			<p class="m-0 mt-1 text-sm">
				Telemetry is required for our anti-cheat measures and cannot be disabled. Collection of
				analytics and usage data is a condition of use of MARCUSK Launcher.
			</p>
		</div>
		<Toggle id="opt-out-analytics" :model-value="true" disabled />
	</div>

	<div class="mt-4 flex items-center justify-between gap-4">
		<div>
			<h2 class="m-0 text-lg font-semibold text-contrast">Discord RPC</h2>
			<p class="m-0 mt-1 text-sm">
				Manages the Discord Rich Presence integration. Disabling this will cause 'MARCUSK Studio' to
				no longer show up as a game or app you are using on your Discord profile.
			</p>
			<p class="m-0 mt-2 text-sm">
				Note: This will not prevent any instance-specific Discord Rich Presence integrations, such
				as those added by mods. (app restart required to take effect)
			</p>
		</div>
		<Toggle id="disable-discord-rpc" v-model="settings.discord_rpc" />
	</div>
</template>
