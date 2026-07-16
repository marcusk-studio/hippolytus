<!--
	Two player models side by side, each animated independently. A lightweight
	director loops idle on both (with staggered one-shot flourishes so they never
	sync) and occasionally plays a shared interaction emote before returning to
	idle. Interaction emotes are converted from Emotecraft JSON (see emote-clip.ts).

	Passing `debug` reveals a calibration overlay for tuning placements/animations;
	it is off in normal use and unlocked via the developer feature flags.
-->
<template>
	<!-- eslint-disable vue/no-undef-components -->
	<div
		ref="container"
		class="relative w-full h-full select-none"
		@pointerdown="onDown"
		@pointermove="onMove"
		@pointerup="onUp"
		@pointerleave="onUp"
		@wheel="onWheel"
	>
		<TresCanvas
			alpha
			:antialias="true"
			:dpr="[1, 1.5]"
			:renderer-options="{
				outputColorSpace: THREE.SRGBColorSpace,
				toneMapping: THREE.NoToneMapping,
				toneMappingExposure: 10.0,
			}"
		>
			<Suspense>
				<Group :position="[left.x, left.y, left.z]" :rotation="[0, left.ry, 0]">
					<primitive v-if="leftScene" :object="leftScene" />
				</Group>
			</Suspense>

			<Suspense>
				<Group :position="[right.x, right.y, right.z]" :rotation="[0, right.ry, 0]">
					<primitive v-if="rightScene" :object="rightScene" />
				</Group>
			</Suspense>

			<TresPerspectiveCamera
				:make-default.camel="true"
				:fov="42"
				:position="[0, 0.15, 4]"
				:look-at="[0, 0, 0]"
			/>

			<TresAmbientLight :intensity="2" />
			<TresDirectionalLight :position="[-3, 4, -2]" :intensity="1.2" />
		</TresCanvas>

		<div
			v-if="debug"
			class="absolute w-max cursor-move rounded bg-black/70 px-2 py-1 font-mono text-[11px] leading-tight text-white"
			:style="{ left: hud.x + 'px', top: hud.y + 'px' }"
			@pointerdown.stop="onHudDown"
		>
			<div :class="active === 'left' ? 'text-brand' : ''">
				LEFT&nbsp; x {{ left.x.toFixed(2) }} y {{ left.y.toFixed(2) }} z {{ left.z.toFixed(2) }} ry
				{{ left.ry.toFixed(2) }}
			</div>
			<div :class="active === 'right' ? 'text-brand' : ''">
				RIGHT x {{ right.x.toFixed(2) }} y {{ right.y.toFixed(2) }} z {{ right.z.toFixed(2) }} ry
				{{ right.ry.toFixed(2) }}
			</div>
			<label class="mt-1 flex items-center gap-1">
				anim
				<select v-model="selectedAnim" class="bg-black/60 text-white outline-none">
					<option v-for="name in clipNames" :key="name" :value="name">{{ name }}</option>
				</select>
			</label>
			<div class="mt-1 flex gap-1">
				<button
					class="rounded px-2 py-0.5"
					:class="demo ? 'bg-brand text-black' : 'bg-white/15 hover:bg-white/25'"
					@click="toggleDemo"
				>
					{{ demo ? 'stop' : 'demo' }}
				</button>
				<button class="rounded bg-white/15 px-2 py-0.5 hover:bg-white/25" @click="copyState">
					{{ copied ? 'copied!' : 'copy' }}
				</button>
				<button class="rounded bg-white/15 px-2 py-0.5 hover:bg-white/25" @click="reset">
					reset
				</button>
			</div>
			<div class="mt-1 opacity-60">
				{{
					demo
						? 'director running · stop to edit'
						: 'drag move · middle-drag or Q/E rotate · wheel depth'
				}}
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ClassicPlayerModel } from '@modrinth/assets'
import { TresCanvas, useRenderLoop } from '@tresjs/core'
import * as THREE from 'three'
import { computed, onMounted, onUnmounted, reactive, ref, toRef, watch } from 'vue'

import { useSkinPreviewScene } from '#ui/composables/skin-rendering'

import { emoteToClip } from './emote-clip'

const props = withDefaults(
	defineProps<{
		leftTextureSrc: string
		rightTextureSrc: string
		debug?: boolean
	}>(),
	{ debug: false },
)

const container = ref<HTMLElement | null>(null)

type Placement = { x: number; y: number; z: number; ry: number }
interface Scene {
	name: string
	weight: number
	stagger?: boolean
	left: Placement
	right: Placement
}

// Curated placements. BASE is where the two idle; each interaction repositions
// them, weighted so narutonew stays rare. meeting is staggered so one leads.
const BASE = {
	left: { x: -0.699, y: -0.707, z: -0.1, ry: 0.494 },
	right: { x: 0.625, y: -0.727, z: -0.15, ry: -0.589 },
}
const INTERACTIONS: Scene[] = [
	{
		name: 'meeting',
		weight: 3,
		stagger: true,
		left: { x: -0.605, y: -0.779, z: -0.05, ry: 2.224 },
		right: { x: 0.561, y: -0.772, z: -0.05, ry: -0.853 },
	},
	{
		name: 'Inspect',
		weight: 3,
		left: { x: -0.605, y: -0.779, z: -0.05, ry: 2.224 },
		right: { x: 0.59, y: -0.762, z: -0.05, ry: -0.952 },
	},
	{
		name: 'penguin',
		weight: 3,
		left: { x: -0.449, y: -0.714, z: -0.05, ry: 0.363 },
		right: { x: 0.625, y: -0.727, z: -0.15, ry: -0.401 },
	},
	{
		name: 'narutonew',
		weight: 1,
		left: { x: -0.36, y: -0.715, z: -0.05, ry: 1.203 },
		right: { x: 0.882, y: -0.657, z: -0.05, ry: 1.111 },
	},
]
const IDLE_SUBS = ['idle_sub_1', 'idle_sub_2', 'idle_sub_3']
const MODEL_CLIPS = ['idle', 'idle_sub_1', 'idle_sub_2', 'idle_sub_3', 'interact']

const left = reactive({ ...BASE.left })
const right = reactive({ ...BASE.right })
const leftTarget: Placement = { ...BASE.left }
const rightTarget: Placement = { ...BASE.right }
const active = ref<'left' | 'right'>('left')
const copied = ref(false)
const hud = reactive({ x: 8, y: 8 })

const demo = ref(false)
const flourishTimer: { left?: number; right?: number } = {}
let eventTimer: number | undefined
let interacting = false

// Convert each bundled interaction emote into a clip once, keyed by file name.
const emoteFiles = import.meta.glob('./emotes/*.json', { eager: true }) as Record<string, unknown>
const emoteClips: Record<string, THREE.AnimationClip> = {}
for (const [path, json] of Object.entries(emoteFiles)) {
	const name = path.split('/').pop()!.replace('.json', '')
	const data = (json as { default?: unknown }).default ?? json
	const clip = emoteToClip(data, name)
	if (clip) emoteClips[name] = clip
}
const clipNames = [...MODEL_CLIPS, ...Object.keys(emoteClips).sort()]
const selectedAnim = ref('idle')

const modelSrc = computed(() => ClassicPlayerModel)
const noCape = computed<string | undefined>(() => undefined)

type Rig = {
	mixer: THREE.AnimationMixer
	clips: Record<string, THREE.AnimationClip>
	current?: THREE.AnimationAction
}
const rigs: Partial<Record<'left' | 'right', Rig>> = {}

function makeInit(side: 'left' | 'right') {
	return (scene: THREE.Object3D, gltfClips: THREE.AnimationClip[]) => {
		const mixer = new THREE.AnimationMixer(scene)
		const clips: Record<string, THREE.AnimationClip> = { ...emoteClips }
		for (const clip of gltfClips) clips[clip.name] = clip
		rigs[side] = { mixer, clips }
		if (demo.value && !interacting) {
			baseIdle(side)
			scheduleFlourish(side)
		} else {
			const clip = clips[selectedAnim.value]
			playOn(side, selectedAnim.value, side === 'right' && clip ? clip.duration / 2 : 0)
		}
	}
}

function cleanup(side: 'left' | 'right') {
	return () => {
		rigs[side]?.mixer.stopAllAction()
		rigs[side] = undefined
	}
}

function playOn(side: 'left' | 'right', name: string, timeOffset = 0, once = false) {
	const rig = rigs[side]
	const clip = rig?.clips[name]
	if (!rig || !clip) return
	const next = rig.mixer.clipAction(clip)
	next.reset()
	next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity)
	next.clampWhenFinished = once
	if (rig.current && rig.current !== next) {
		rig.current.fadeOut(0.2)
		next.fadeIn(0.2)
	}
	next.play()
	if (timeOffset) next.time = timeOffset
	rig.current = next
}

watch(selectedAnim, (name) => {
	if (demo.value) return
	playOn('left', name)
	playOn('right', name)
})

function setScene(s: { left: Placement; right: Placement }) {
	Object.assign(leftTarget, s.left)
	Object.assign(rightTarget, s.right)
}

function playScene(s: Scene) {
	playOn('left', s.name)
	// Stagger: the right character trails by half the clip so one leads.
	const clip = rigs.right?.clips[s.name]
	playOn('right', s.name, s.stagger ? (clip ? clip.duration / 2 : 0.8) : 0)
}

function weightedPick(list: Scene[]): Scene {
	const total = list.reduce((sum, s) => sum + s.weight, 0)
	let r = Math.random() * total
	for (const s of list) if ((r -= s.weight) < 0) return s
	return list[0]
}

// Each character loops base idle and, on its own timer, plays a one-shot
// flourish then returns to idle — so the two never sync during idle.
function baseIdle(side: 'left' | 'right') {
	const clip = rigs[side]?.clips.idle
	playOn(side, 'idle', clip ? Math.random() * clip.duration : 0)
}

function scheduleFlourish(side: 'left' | 'right') {
	window.clearTimeout(flourishTimer[side])
	flourishTimer[side] = window.setTimeout(
		() => {
			if (!demo.value || interacting) return
			const sub = IDLE_SUBS[Math.floor(Math.random() * IDLE_SUBS.length)]
			const clip = rigs[side]?.clips[sub]
			playOn(side, sub, 0, true)
			window.setTimeout(
				() => {
					if (!demo.value || interacting) return
					playOn(side, 'idle')
					scheduleFlourish(side)
				},
				clip ? clip.duration * 1000 : 800,
			)
		},
		7000 + Math.random() * 8000,
	)
}

function startIdleAmbient() {
	interacting = false
	setScene(BASE)
	baseIdle('left')
	baseIdle('right')
	scheduleFlourish('left')
	scheduleFlourish('right')
}

// Interactions are rare punctuation: both play in sync (meeting staggered),
// hold briefly, then everyone returns to idle.
function runEvent() {
	if (!demo.value) return
	interacting = true
	window.clearTimeout(flourishTimer.left)
	window.clearTimeout(flourishTimer.right)
	const scene = weightedPick(INTERACTIONS)
	setScene(scene)
	playScene(scene)
	const clip = rigs.left?.clips[scene.name]
	const hold = Math.max(4000, (clip ? clip.duration * 1000 : 4000) * 1.5)
	eventTimer = window.setTimeout(() => {
		startIdleAmbient()
		scheduleEvent()
	}, hold)
}

function scheduleEvent() {
	window.clearTimeout(eventTimer)
	eventTimer = window.setTimeout(runEvent, 25000 + Math.random() * 25000)
}

function clearDirectorTimers() {
	window.clearTimeout(flourishTimer.left)
	window.clearTimeout(flourishTimer.right)
	window.clearTimeout(eventTimer)
}

function startDirector() {
	demo.value = true
	startIdleAmbient()
	scheduleEvent()
}

function toggleDemo() {
	demo.value = !demo.value
	clearDirectorTimers()
	if (demo.value) startDirector()
}

const { scene: leftScene } = useSkinPreviewScene({
	selectedModelSrc: modelSrc,
	textureSrc: toRef(props, 'leftTextureSrc'),
	capeSrc: noCape,
	initializeAnimations: makeInit('left'),
	cleanupAnimationState: cleanup('left'),
})

const { scene: rightScene } = useSkinPreviewScene({
	selectedModelSrc: modelSrc,
	textureSrc: toRef(props, 'rightTextureSrc'),
	capeSrc: noCape,
	initializeAnimations: makeInit('right'),
	cleanupAnimationState: cleanup('right'),
})

function ease(cur: Placement, tgt: Placement, k: number) {
	cur.x += (tgt.x - cur.x) * k
	cur.y += (tgt.y - cur.y) * k
	cur.z += (tgt.z - cur.z) * k
	cur.ry += (tgt.ry - cur.ry) * k
}

const { onLoop } = useRenderLoop()
onLoop(({ delta }: { delta: number }) => {
	rigs.left?.mixer.update(delta)
	rigs.right?.mixer.update(delta)
	if (demo.value) {
		const k = Math.min(1, delta * 6)
		ease(left, leftTarget, k)
		ease(right, rightTarget, k)
	}
})

let dragMode: 'move' | 'rotate' | null = null
let lastX = 0
let lastY = 0
let worldPerPx = 0.003

function targetPlacement() {
	return active.value === 'left' ? left : right
}

function onDown(e: PointerEvent) {
	if (!props.debug) return
	const rect = container.value?.getBoundingClientRect()
	if (rect) {
		active.value = e.clientX - rect.left < rect.width / 2 ? 'left' : 'right'
		const visibleHeight = 2 * 4 * Math.tan((42 * Math.PI) / 180 / 2)
		worldPerPx = visibleHeight / rect.height
	}
	dragMode = e.button === 1 ? 'rotate' : 'move'
	if (e.button === 1) e.preventDefault()
	lastX = e.clientX
	lastY = e.clientY
}

function onMove(e: PointerEvent) {
	if (!dragMode || demo.value) return
	const t = targetPlacement()
	if (dragMode === 'rotate') {
		t.ry += (e.clientX - lastX) * 0.01
	} else {
		t.x += (e.clientX - lastX) * worldPerPx
		t.y -= (e.clientY - lastY) * worldPerPx
	}
	lastX = e.clientX
	lastY = e.clientY
}

function onUp() {
	dragMode = null
}

function onWheel(e: WheelEvent) {
	if (!props.debug || demo.value) return
	e.preventDefault()
	targetPlacement().z += (e.deltaY > 0 ? 1 : -1) * 0.05
}

function onKey(e: KeyboardEvent) {
	if (!props.debug || demo.value) return
	const tag = (e.target as HTMLElement)?.tagName
	if (tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA') return
	if (e.key === 'q' || e.key === 'Q') targetPlacement().ry += 0.05
	else if (e.key === 'e' || e.key === 'E') targetPlacement().ry -= 0.05
}

let hudLastX = 0
let hudLastY = 0

function onHudMove(e: PointerEvent) {
	hud.x += e.clientX - hudLastX
	hud.y += e.clientY - hudLastY
	hudLastX = e.clientX
	hudLastY = e.clientY
}

function onHudUp() {
	window.removeEventListener('pointermove', onHudMove)
	window.removeEventListener('pointerup', onHudUp)
}

function onHudDown(e: PointerEvent) {
	if ((e.target as HTMLElement).closest('button, select')) return
	hudLastX = e.clientX
	hudLastY = e.clientY
	window.addEventListener('pointermove', onHudMove)
	window.addEventListener('pointerup', onHudUp)
}

function reset() {
	Object.assign(left, BASE.left)
	Object.assign(right, BASE.right)
}

function round(n: number) {
	return Math.round(n * 1000) / 1000
}

async function copyState() {
	const snapshot = {
		anim: selectedAnim.value,
		left: { x: round(left.x), y: round(left.y), z: round(left.z), ry: round(left.ry) },
		right: { x: round(right.x), y: round(right.y), z: round(right.z), ry: round(right.ry) },
	}
	const text = JSON.stringify(snapshot, null, 2)
	try {
		await navigator.clipboard.writeText(text)
	} catch {
		const ta = document.createElement('textarea')
		ta.value = text
		document.body.appendChild(ta)
		ta.select()
		document.execCommand('copy')
		ta.remove()
	}
	copied.value = true
	window.setTimeout(() => (copied.value = false), 1200)
}

onMounted(() => {
	const rect = container.value?.getBoundingClientRect()
	if (rect) hud.y = rect.height - 96
	window.addEventListener('keydown', onKey)
	startDirector()
})

onUnmounted(() => {
	clearDirectorTimers()
	window.removeEventListener('keydown', onKey)
	window.removeEventListener('pointermove', onHudMove)
	window.removeEventListener('pointerup', onHudUp)
	rigs.left?.mixer.stopAllAction()
	rigs.right?.mixer.stopAllAction()
})
</script>
