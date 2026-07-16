// Converts an Emotecraft emote.json into a rotation-only THREE.AnimationClip.
//
// Rotation-only on purpose: Emotecraft translation offsets are relative to each
// part's rest position, which would need additive blending against the model's
// base transforms. Rotation reads as the emote well enough here and dodges that.
// ROT_SIGN maps emote pitch/yaw/roll onto this model's axis conventions.
import * as THREE from 'three'

const NODE: Record<string, string> = {
	head: 'Head',
	torso: 'Body',
	rightArm: 'Right_Arm',
	leftArm: 'Left_Arm',
	rightLeg: 'Right_Leg',
	leftLeg: 'Left_Leg',
}

// Calibratable: emote pitch/yaw/roll → our node X/Y/Z rotation.
const ROT_SIGN = { pitch: -1, yaw: -1, roll: 1 }

type Keyframe = { tick: number; value: number; easing: string }

function easeFraction(name: string, t: number): number {
	const x = Math.min(1, Math.max(0, t))
	switch ((name || 'LINEAR').toUpperCase()) {
		case 'CONSTANT':
			return x >= 1 ? 1 : 0
		case 'LINEAR':
			return x
		case 'EASEINSINE':
			return 1 - Math.cos((x * Math.PI) / 2)
		case 'EASEOUTSINE':
			return Math.sin((x * Math.PI) / 2)
		case 'EASEINOUTSINE':
			return -(Math.cos(Math.PI * x) - 1) / 2
		case 'EASEINQUAD':
			return x * x
		case 'EASEOUTQUAD':
			return 1 - (1 - x) * (1 - x)
		case 'EASEINOUTQUAD':
			return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2
		case 'EASEINCUBIC':
			return x * x * x
		case 'EASEOUTCUBIC':
			return 1 - Math.pow(1 - x, 3)
		case 'EASEINOUTCUBIC':
			return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
		default:
			return x
	}
}

function sampler(keyframes: Keyframe[]): (tick: number) => number {
	const kfs = keyframes.slice().sort((a, b) => a.tick - b.tick)
	return (tick: number) => {
		if (!kfs.length) return 0
		let lo: Keyframe | null = null
		let hi: Keyframe | null = null
		for (const k of kfs) {
			if (k.tick <= tick) lo = k
			if (k.tick > tick && hi === null) hi = k
		}
		// Before the first keyframe: interpolate from the rest value (0).
		if (lo === null) {
			const first = kfs[0]
			const span = first.tick || 1
			return first.value * easeFraction(first.easing, tick / span)
		}
		if (hi === null) return lo.value
		const span = hi.tick - lo.tick || 1
		return lo.value + (hi.value - lo.value) * easeFraction(hi.easing, (tick - lo.tick) / span)
	}
}

export interface EmoteClipOptions {
	/**
	 * Drop arm yaw. Some emotes twist the arms via yaw as part of a translation-
	 * based pose (e.g. penguin's flippers); with translation dropped that yaw
	 * reads as a needless spin, so it can be suppressed per emote.
	 */
	dropArmYaw?: boolean
}

const ARM_PARTS = new Set(['rightArm', 'leftArm'])

export function emoteToClip(
	json: unknown,
	clipName: string,
	options: EmoteClipOptions = {},
): THREE.AnimationClip | null {
	const root = json as Record<string, unknown>
	const emote = (root.emote as Record<string, unknown>) ?? root
	const moves = (emote.moves as Record<string, unknown>[]) ?? []
	if (!moves.length) return null

	const degrees = !!emote.degrees
	const toRad = degrees ? Math.PI / 180 : 1
	const endTick =
		(emote.endTick as number) ?? Math.max(20, ...moves.map((m) => (m.tick as number) ?? 0))

	const IGNORE = new Set(['tick', 'easing', 'turn', 'comment', 'name'])
	const parts: Record<string, Record<string, Keyframe[]>> = {}
	for (const move of moves) {
		const tick = (move.tick as number) ?? 0
		const easing = (move.easing as string) ?? 'LINEAR'
		for (const part of Object.keys(move)) {
			if (IGNORE.has(part)) continue
			const axes = move[part]
			if (!axes || typeof axes !== 'object') continue
			parts[part] ??= {}
			for (const [axis, value] of Object.entries(axes as Record<string, number>)) {
				;(parts[part][axis] ??= []).push({ tick, value, easing })
			}
		}
	}

	const fps = 30
	const times: number[] = []
	for (let tk = 0; tk <= endTick; tk += 20 / fps) times.push(tk)
	if (times[times.length - 1] !== endTick) times.push(endTick)

	const tracks: THREE.KeyframeTrack[] = []
	for (const [part, axes] of Object.entries(parts)) {
		const node = NODE[part]
		if (!node) continue
		const pitch = sampler(axes.pitch ?? [])
		const yaw = options.dropArmYaw && ARM_PARTS.has(part) ? () => 0 : sampler(axes.yaw ?? [])
		const roll = sampler(axes.roll ?? [])
		const quatValues: number[] = []
		const secs: number[] = []
		for (const tk of times) {
			secs.push(tk / 20)
			const euler = new THREE.Euler(
				ROT_SIGN.pitch * pitch(tk) * toRad,
				ROT_SIGN.yaw * yaw(tk) * toRad,
				ROT_SIGN.roll * roll(tk) * toRad,
				'XYZ',
			)
			const q = new THREE.Quaternion().setFromEuler(euler)
			quatValues.push(q.x, q.y, q.z, q.w)
		}
		tracks.push(new THREE.QuaternionKeyframeTrack(`${node}.quaternion`, secs, quatValues))
	}

	if (!tracks.length) return null
	return new THREE.AnimationClip(clipName, endTick / 20, tracks)
}
