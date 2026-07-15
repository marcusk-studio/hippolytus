<script setup>
import {
	ClipboardCopyIcon,
	EyeIcon,
	FolderOpenIcon,
	PlayIcon,
	PlusIcon,
	SortAscIcon,
	StopCircleIcon,
	TrashIcon,
} from '@modrinth/assets'
import {
	Accordion,
	DropdownSelect,
	formatLoader,
	injectNotificationManager,
	useVIntl,
} from '@modrinth/ui'
import { useStorage } from '@vueuse/core'
import dayjs from 'dayjs'
import { computed, ref } from 'vue'

import ContextMenu from '@/components/ui/ContextMenu.vue'
import Instance from '@/components/ui/Instance.vue'
import ConfirmDeleteInstanceModal from '@/components/ui/modal/ConfirmDeleteInstanceModal.vue'
import { install_duplicate_instance } from '@/helpers/install'
import { remove } from '@/helpers/instance'

const { handleError } = injectNotificationManager()

const { formatMessage } = useVIntl()

const props = defineProps({
	instances: {
		type: Array,
		default() {
			return []
		},
	},
	label: {
		type: String,
		default: '',
	},
})
const instanceOptions = ref(null)
const instanceComponents = ref(null)

const currentDeleteInstance = ref(null)
const confirmModal = ref(null)

async function deleteInstance() {
	if (currentDeleteInstance.value) {
		instanceComponents.value = instanceComponents.value.filter(
			(x) => x.instance.id !== currentDeleteInstance.value,
		)
		await remove(currentDeleteInstance.value).catch(handleError)
	}
}

async function duplicateInstance(p) {
	await install_duplicate_instance(p).catch(handleError)
}

const handleRightClick = (event, instanceId) => {
	const item = instanceComponents.value.find((x) => x.instance.id === instanceId)
	const baseOptions = [
		{ name: 'add_content' },
		{ type: 'divider' },
		{ name: 'edit' },
		{ name: 'duplicate' },
		{ name: 'open' },
		{ name: 'copy' },
		{ type: 'divider' },
		{
			name: 'delete',
			color: 'danger',
		},
	]

	instanceOptions.value.showMenu(
		event,
		item,
		item.playing
			? [
					{
						name: 'stop',
						color: 'danger',
					},
					...baseOptions,
				]
			: [
					{
						name: 'play',
						color: 'primary',
					},
					...baseOptions,
				],
	)
}

const handleOptionsClick = async (args) => {
	switch (args.option) {
		case 'play':
			args.item.play(null, 'InstanceGridContextMenu')
			break
		case 'stop':
			args.item.stop(null, 'InstanceGridContextMenu')
			break
		case 'add_content':
			await args.item.addContent()
			break
		case 'edit':
			await args.item.seeInstance()
			break
		case 'duplicate':
			if (args.item.instance.install_stage == 'installed')
				await duplicateInstance(args.item.instance.id)
			break
		case 'open':
			await args.item.openFolder()
			break
		case 'copy':
			await navigator.clipboard.writeText(args.item.instance.id)
			break
		case 'delete':
			currentDeleteInstance.value = args.item.instance.id
			confirmModal.value.show()
			break
	}
}

const state = useStorage(
	`${props.label}-grid-display-state`,
	{
		group: 'Group',
		sortBy: 'Name',
		collapsedGroups: [],
	},
	localStorage,
	{ mergeDefaults: true },
)

const collapsedSectionKeys = computed(() => new Set(state.value.collapsedGroups ?? []))

const getSectionKey = (sectionName) => `${state.value.group}:${sectionName}`

const isSectionCollapsed = (sectionName) => {
	return collapsedSectionKeys.value.has(getSectionKey(sectionName))
}

const setSectionCollapsed = (sectionName, collapsed) => {
	const sectionKey = getSectionKey(sectionName)
	const collapsedSections = new Set(state.value.collapsedGroups ?? [])

	if (collapsed) {
		collapsedSections.add(sectionKey)
	} else {
		collapsedSections.delete(sectionKey)
	}

	state.value.collapsedGroups = [...collapsedSections]
}

const filteredResults = computed(() => {
	const { group = 'Group', sortBy = 'Name' } = state.value

	const instances = [...props.instances]

	if (sortBy === 'Name') {
		instances.sort((a, b) => {
			return a.name.localeCompare(b.name)
		})
	}

	if (sortBy === 'Game version') {
		instances.sort((a, b) => {
			return a.game_version.localeCompare(b.game_version, undefined, { numeric: true })
		})
	}

	if (sortBy === 'Last played') {
		instances.sort((a, b) => {
			return dayjs(b.last_played ?? 0).diff(dayjs(a.last_played ?? 0))
		})
	}

	if (sortBy === 'Date created') {
		instances.sort((a, b) => {
			return dayjs(b.date_created).diff(dayjs(a.date_created))
		})
	}

	if (sortBy === 'Date modified') {
		instances.sort((a, b) => {
			return dayjs(b.date_modified).diff(dayjs(a.date_modified))
		})
	}

	const instanceMap = new Map()

	if (group === 'Loader') {
		instances.forEach((instance) => {
			const loader = formatLoader(formatMessage, instance.loader)
			if (!instanceMap.has(loader)) {
				instanceMap.set(loader, [])
			}

			instanceMap.get(loader).push(instance)
		})
	} else if (group === 'Game version') {
		instances.forEach((instance) => {
			if (!instanceMap.has(instance.game_version)) {
				instanceMap.set(instance.game_version, [])
			}

			instanceMap.get(instance.game_version).push(instance)
		})
	} else if (group === 'Group') {
		instances.forEach((instance) => {
			if (instance.groups.length === 0) {
				instance.groups.push('None')
			}

			for (const category of instance.groups) {
				if (!instanceMap.has(category)) {
					instanceMap.set(category, [])
				}

				instanceMap.get(category).push(instance)
			}
		})
	} else {
		return instanceMap.set('None', instances)
	}

	// For 'name', we intuitively expect the sorting to apply to the name of the group first, not just the name of the instance
	// ie: Category A should come before B, even if the first instance in B comes before the first instance in A
	if (sortBy === 'Name') {
		const sortedEntries = [...instanceMap.entries()].sort((a, b) => {
			// None should always be first
			if (a[0] === 'None' && b[0] !== 'None') {
				return -1
			}
			if (a[0] !== 'None' && b[0] === 'None') {
				return 1
			}
			return a[0].localeCompare(b[0])
		})
		instanceMap.clear()
		sortedEntries.forEach((entry) => {
			instanceMap.set(entry[0], entry[1])
		})
	}
	// default sorting would do 1.20.4 < 1.8.9 because 2 < 8
	// localeCompare with numeric=true puts 1.8.9 < 1.20.4 because 8 < 20
	if (group === 'Game version') {
		const sortedEntries = [...instanceMap.entries()].sort((a, b) => {
			return a[0].localeCompare(b[0], undefined, { numeric: true })
		})
		instanceMap.clear()
		sortedEntries.forEach((entry) => {
			instanceMap.set(entry[0], entry[1])
		})
	}

	return instanceMap
})
</script>
<template>
	<div class="grid-display-container">
		<div class="controls-section">
			<div class="controls-row">
				<div class="filter-section">
					<div class="filter-group">
						<SortAscIcon class="filter-icon" />
						<DropdownSelect
							v-slot="{ selected }"
							v-model="state.sortBy"
							name="Sort Dropdown"
							class="filter-dropdown"
							:options="['Name', 'Last played', 'Date created', 'Date modified', 'Game version']"
							placeholder="Sort by..."
						>
							<span class="filter-label">Sort: </span>
							<span class="filter-value">{{ selected }}</span>
						</DropdownSelect>
					</div>
				</div>
			</div>
		</div>

		<div class="instances-container">
			<Accordion
				v-for="instanceSection in Array.from(filteredResults, ([key, value]) => ({
					key,
					value,
				}))"
				:key="instanceSection.key"
				:divider="false"
				:open-by-default="!isSectionCollapsed(instanceSection.key)"
				class="instance-section"
				@on-open="setSectionCollapsed(instanceSection.key, false)"
				@on-close="setSectionCollapsed(instanceSection.key, true)"
			>
				<template v-if="instanceSection.key !== 'None'" #title>
					<span class="section-title">{{ instanceSection.key }}</span>
				</template>
				<section class="instances-grid">
					<Instance
						v-for="instance in instanceSection.value"
						ref="instanceComponents"
						:key="instance.id + instance.install_stage"
						:instance="instance"
						@contextmenu.prevent.stop="(event) => handleRightClick(event, instance.id)"
					/>
				</section>
			</Accordion>
		</div>

		<ConfirmDeleteInstanceModal ref="confirmModal" @delete="deleteInstance" />
		<ContextMenu ref="instanceOptions" @option-clicked="handleOptionsClick">
			<template #play> <PlayIcon /> Play </template>
			<template #stop> <StopCircleIcon /> Stop </template>
			<template #add_content> <PlusIcon /> Add content </template>
			<template #edit> <EyeIcon /> View instance </template>
			<template #duplicate> <ClipboardCopyIcon /> Duplicate instance</template>
			<template #delete> <TrashIcon /> Delete </template>
			<template #open> <FolderOpenIcon /> Open folder </template>
			<template #copy> <ClipboardCopyIcon /> Copy path </template>
		</ContextMenu>
	</div>
</template>

<style lang="scss" scoped>
.grid-display-container {
	display: flex;
	flex-direction: column;
	gap: 1rem;
	height: 100%;
}

.controls-section {
	display: flex;
	flex-direction: column;
	gap: 0.75rem;
	padding: 0.75rem;
	background: #0a0101;
	border-radius: 1rem;
	box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
	flex-shrink: 0;
}

.controls-row {
	display: flex;
	gap: 1rem;
	align-items: center;
	flex-wrap: wrap;
}

.filter-section {
	display: flex;
	gap: 0.5rem;
	flex-wrap: wrap;
	flex-shrink: 0;
	height: 100%;

	.filter-group {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 0.5rem;
		transition: all 0.2s ease;
		max-width: 250px;
		height: 100%;

		&:hover {
			background: rgba(255, 255, 255, 0.15);
		}

		.filter-icon {
			width: 1rem;
			height: 1rem;
			color: var(--color-secondary);
		}

		.filter-dropdown {
			min-width: 5rem;
			max-width: 150px;
		}

		.filter-label {
			font-weight: 600;
			color: var(--color-contrast);
			font-size: 0.875rem;
		}

		.filter-value {
			font-weight: 500;
			color: var(--color-brand);
			font-size: 0.875rem;
		}
	}
}

.instances-container {
	display: flex;
	flex-direction: column;
	gap: 2rem;
	flex: 1;
	min-height: 0;
	overflow-y: auto;
	padding-right: 0.5rem;
	max-height: 100%;

	&::-webkit-scrollbar {
		width: 8px;
	}

	&::-webkit-scrollbar-track {
		background: rgba(255, 255, 255, 0.05);
		border-radius: 4px;
	}

	&::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.2);
		border-radius: 4px;

		&:hover {
			background: rgba(255, 255, 255, 0.3);
		}
	}

	scrollbar-width: thin;
	scrollbar-color: rgba(255, 255, 255, 0.2) rgba(255, 255, 255, 0.05);
}

.instance-section {
	display: flex;
	flex-direction: column;
	gap: 1rem;
	width: 100%;

	.section-title {
		margin: 0;
		font-size: 1.5rem;
		font-weight: 700;
		white-space: nowrap;
		padding: 0.5rem 1rem;
		background: var(--color-brand);
		border-radius: 0.5rem;
		color: white;
	}
}

.instances-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
	gap: 1.5rem;
	width: 100%;
}

// Responsive adjustments
@media (max-width: 768px) {
	.controls-section {
		padding: 0.5rem;
	}

	.controls-row {
		flex-direction: column;
		align-items: stretch;
		gap: 0.75rem;
	}

	.filter-section {
		justify-content: center;

		.filter-group {
			width: 100%;
			max-width: 250px;
		}
	}

	.instances-grid {
		grid-template-columns: 1fr;
		gap: 1rem;
	}

	.section-title {
		font-size: 1.25rem !important;
	}
}

@media (max-width: 480px) {
	.grid-display-container {
		gap: 0.75rem;
	}

	.controls-section {
		gap: 0.5rem;
	}

	.filter-group {
		padding: 0.25rem 0.375rem !important;
	}
}
</style>
