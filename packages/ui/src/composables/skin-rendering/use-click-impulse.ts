import { ref } from 'vue'

/**
 * The click-feedback state machine for a skin preview: each click adds energy
 * that decays over time and drives a shake/squash recoil, and clicking fast
 * enough to max it out flashes the model red as if it were taking damage.
 *
 * Frame-driven by the caller via `update(delta)` so it can share whichever
 * render loop already exists rather than starting its own.
 */

const CLICK_IMPULSE_MAX_ENERGY = 5
const CLICK_IMPULSE_ENERGY_PER_CLICK = 1
const DAMAGE_FLASH_MIN_CLICKS_PER_SECOND = 2
const CLICK_IMPULSE_DECAY_PER_SECOND =
	DAMAGE_FLASH_MIN_CLICKS_PER_SECOND * CLICK_IMPULSE_ENERGY_PER_CLICK
const CLICK_IMPULSE_BASE_SPEED = 18
const CLICK_IMPULSE_SPEED_BOOST = 7
const CLICK_IMPULSE_OFFSET_X = 0.035
const CLICK_IMPULSE_ROTATION_Z = 0.055
const CLICK_IMPULSE_SCALE_X = 0.018
const CLICK_IMPULSE_SCALE_Y = 0.025
const DAMAGE_FLASH_DURATION_SECONDS = 0.2
const DAMAGE_FLASH_REPEAT_DELAY_SECONDS = 0.5
const DAMAGE_FLASH_MAX_INTENSITY = 0.7

export function useClickImpulse() {
	const clickImpulseEnergy = ref(0)
	const clickImpulsePhase = ref(0)
	const clickImpulseOffsetX = ref(0)
	const clickImpulseRotationZ = ref(0)
	const clickImpulseScaleX = ref(1)
	const clickImpulseScaleY = ref(1)
	const damageFlashIntensity = ref(0)

	let damageFlashRemainingSeconds = 0
	let damageFlashCooldownSeconds = 0

	function triggerDamageFlash() {
		damageFlashRemainingSeconds = DAMAGE_FLASH_DURATION_SECONDS
		damageFlashCooldownSeconds = DAMAGE_FLASH_DURATION_SECONDS + DAMAGE_FLASH_REPEAT_DELAY_SECONDS
		damageFlashIntensity.value = DAMAGE_FLASH_MAX_INTENSITY
	}

	function addClickImpulse() {
		clickImpulseEnergy.value = Math.min(
			CLICK_IMPULSE_MAX_ENERGY,
			clickImpulseEnergy.value + CLICK_IMPULSE_ENERGY_PER_CLICK,
		)

		if (clickImpulseEnergy.value >= CLICK_IMPULSE_MAX_ENERGY && damageFlashCooldownSeconds <= 0) {
			triggerDamageFlash()
		}
	}

	function updateClickImpulse(delta: number) {
		const energy = Math.max(0, clickImpulseEnergy.value - CLICK_IMPULSE_DECAY_PER_SECOND * delta)
		clickImpulseEnergy.value = energy

		if (energy <= 0) {
			clickImpulseOffsetX.value = 0
			clickImpulseRotationZ.value = 0
			clickImpulseScaleX.value = 1
			clickImpulseScaleY.value = 1
			return
		}

		const intensity = energy / CLICK_IMPULSE_MAX_ENERGY
		clickImpulsePhase.value +=
			delta * (CLICK_IMPULSE_BASE_SPEED + energy * CLICK_IMPULSE_SPEED_BOOST)

		const shake = Math.sin(clickImpulsePhase.value) * intensity
		const squash = Math.abs(Math.sin(clickImpulsePhase.value * 1.7)) * intensity

		clickImpulseOffsetX.value = shake * CLICK_IMPULSE_OFFSET_X
		clickImpulseRotationZ.value = shake * CLICK_IMPULSE_ROTATION_Z
		clickImpulseScaleX.value = 1 + squash * CLICK_IMPULSE_SCALE_X
		clickImpulseScaleY.value = 1 - squash * CLICK_IMPULSE_SCALE_Y
	}

	function updateDamageFlash(delta: number) {
		damageFlashCooldownSeconds = Math.max(0, damageFlashCooldownSeconds - delta)

		if (damageFlashRemainingSeconds <= 0) {
			damageFlashIntensity.value = 0
			return
		}

		damageFlashRemainingSeconds = Math.max(0, damageFlashRemainingSeconds - delta)
		damageFlashIntensity.value =
			DAMAGE_FLASH_MAX_INTENSITY * (damageFlashRemainingSeconds / DAMAGE_FLASH_DURATION_SECONDS)
	}

	function update(delta: number) {
		updateClickImpulse(delta)
		updateDamageFlash(delta)
	}

	function reset() {
		clickImpulseEnergy.value = 0
		clickImpulsePhase.value = 0
		clickImpulseOffsetX.value = 0
		clickImpulseRotationZ.value = 0
		clickImpulseScaleX.value = 1
		clickImpulseScaleY.value = 1
		damageFlashRemainingSeconds = 0
		damageFlashCooldownSeconds = 0
		damageFlashIntensity.value = 0
	}

	return {
		clickImpulseOffsetX,
		clickImpulseRotationZ,
		clickImpulseScaleX,
		clickImpulseScaleY,
		damageFlashIntensity,
		addClickImpulse,
		update,
		reset,
	}
}
