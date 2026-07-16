<template>
	<NewModal ref="modal" :header="formatMessage(messages.header)" :on-hide="reset">
		<div class="max-w-[31rem] flex flex-col gap-6">
			<Admonition
				type="warning"
				:header="formatMessage(messages.warningTitle)"
				:body="formatMessage(messages.warningBody)"
			/>
			<div v-if="fileName" class="overflow-x-auto whitespace-nowrap text-sm text-secondary">
				{{ fileName }}
			</div>
			<div>
				<p class="mt-0 leading-tight">
					{{ formatMessage(messages.body) }}
				</p>
				<p class="text-orange font-semibold mb-0 leading-tight">
					{{ formatMessage(messages.malwareStatement) }}
				</p>
			</div>
			<div class="flex gap-2 justify-end">
				<ButtonStyled type="outlined">
					<button @click="cancel">
						<XIcon />
						{{ formatMessage(commonMessages.cancelButton) }}
					</button>
				</ButtonStyled>
				<ButtonStyled color="orange">
					<button :disabled="isProceeding" @click="proceed">
						<SpinnerIcon v-if="isProceeding" class="animate-spin" />
						<CircleArrowRightIcon v-else />
						{{ formatMessage(messages.installAnyway) }}
					</button>
				</ButtonStyled>
			</div>
		</div>
	</NewModal>
</template>

<script setup lang="ts">
import { CircleArrowRightIcon, SpinnerIcon, XIcon } from '@modrinth/assets'
import {
	Admonition,
	ButtonStyled,
	commonMessages,
	defineMessages,
	NewModal,
	useVIntl,
} from '@modrinth/ui'
import { ref, useTemplateRef } from 'vue'

const { formatMessage } = useVIntl()

const modal = useTemplateRef('modal')
const onProceed = ref<() => Promise<void>>()
const isProceeding = ref(false)
const fileName = ref('')

const messages = defineMessages({
	header: {
		id: 'unknown-pack-warning-modal.header',
		defaultMessage: 'Confirm installation',
	},
	warningTitle: {
		id: 'unknown-pack-warning-modal.warning.title',
		defaultMessage: 'Unknown file warning',
	},
	warningBody: {
		id: 'unknown-pack-warning-modal.warning.body',
		defaultMessage: `We couldn't find this file on Modrinth. We strongly recommend only installing files from sources you trust.`,
	},
	body: {
		id: 'unknown-pack-warning-modal.body',
		defaultMessage: `A file is only reviewed if it’s uploaded to Modrinth, regardless of its file format (including .mrpack).`,
	},
	malwareStatement: {
		id: 'unknown-pack-warning-modal.malware-statement',
		defaultMessage: `Malware is often distributed through modpack files by sharing them on platforms like Discord.`,
	},
	installAnyway: {
		id: 'unknown-pack-warning-modal.install-anyway',
		defaultMessage: `Install anyway`,
	},
})

function show(createInstance: () => Promise<void>, selectedFileName = '') {
	onProceed.value = createInstance
	fileName.value = selectedFileName

	modal.value?.show()
}

function reset() {
	onProceed.value = undefined
	fileName.value = ''
}

function cancel() {
	modal.value?.hide()
}

function proceed() {
	if (!onProceed.value) {
		return
	}

	const createInstance = onProceed.value
	modal.value?.hide()
	// noinspection ES6MissingAwait
	createInstance()
}

defineExpose({ show })
</script>
