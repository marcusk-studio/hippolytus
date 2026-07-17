import { useRenderLoop } from '@tresjs/core'
import * as THREE from 'three'
import { computed, type ComputedRef, type Ref, ref, watch } from 'vue'

import type { SkinPreviewAnimationConfig } from './types'
import { useClickImpulse } from './use-click-impulse'

type AnimationFinishedListener = (
	event: THREE.AnimationMixerEventMap['finished'] & {
		readonly type: 'finished'
		readonly target: THREE.AnimationMixer
	},
) => void

export const INTERACT_ANIMATION_NAME = 'interact'

const INTERACT_VISIBLE_DURATION_SECONDS = 0.5

type MaybeReadonlyRef<T> = Ref<T> | ComputedRef<T>

export function useSkinPreviewAnimation(
	animationConfig: MaybeReadonlyRef<SkinPreviewAnimationConfig | undefined>,
) {
	const mixer = ref<THREE.AnimationMixer | null>(null)
	const actions = ref<Record<string, THREE.AnimationAction>>({})
	const clock = new THREE.Clock()
	const currentAnimation = ref<string>('')
	const randomAnimationTimer = ref<number | null>(null)
	const lastRandomAnimation = ref<string>('')
	const animationFinishedListeners: AnimationFinishedListener[] = []

	const {
		clickImpulseOffsetX,
		clickImpulseRotationZ,
		clickImpulseScaleX,
		clickImpulseScaleY,
		damageFlashIntensity,
		addClickImpulse,
		update: updateClickFeedback,
		reset: resetClickFeedback,
	} = useClickImpulse()

	const baseAnimation = computed(() => animationConfig.value?.baseAnimation ?? '')
	const randomAnimations = computed(() => animationConfig.value?.randomAnimations ?? [])
	const transitionDuration = computed(() => animationConfig.value?.transitionDuration || 0.3)

	function initializeAnimations(loadedScene: THREE.Object3D, clips: THREE.AnimationClip[]) {
		if (!clips || clips.length === 0) {
			console.warn('No animation clips found in the model')
			return
		}

		mixer.value = new THREE.AnimationMixer(loadedScene)
		clock.start()
		actions.value = {}

		clips.forEach((clip) => {
			if (clip.name === INTERACT_ANIMATION_NAME) {
				clip.duration = INTERACT_VISIBLE_DURATION_SECONDS
			}

			const action = mixer.value!.clipAction(clip)

			action.setLoop(THREE.LoopOnce, 1)
			action.clampWhenFinished = true
			actions.value[clip.name] = action
		})

		if (baseAnimation.value && actions.value[baseAnimation.value]) {
			actions.value[baseAnimation.value].setLoop(THREE.LoopRepeat, Infinity)
			playAnimation(baseAnimation.value, true)
			setupRandomAnimationLoop()
		} else {
			console.warn(`Base animation "${baseAnimation.value}" not found`)

			const firstAnimationName = Object.keys(actions.value)[0]
			if (firstAnimationName) {
				actions.value[firstAnimationName].setLoop(THREE.LoopRepeat, Infinity)
				playAnimation(firstAnimationName, true)
			}
		}
	}

	function playAnimation(name: string, immediate = false) {
		if (!mixer.value || !actions.value[name]) {
			console.warn(`Animation "${name}" not found!`)
			return false
		}

		const action = actions.value[name]

		if (currentAnimation.value === name && action.isRunning() && name !== baseAnimation.value) {
			console.log(`Animation "${name}" is already running, ignoring request`)
			return false
		}

		Object.entries(actions.value).forEach(([actionName, actionInstance]) => {
			if (actionName !== name && actionInstance.isRunning()) {
				actionInstance.fadeOut(transitionDuration.value)
			}
		})

		action.reset()

		if (name === baseAnimation.value) {
			action.setLoop(THREE.LoopRepeat, Infinity)
		} else {
			action.setLoop(THREE.LoopOnce, 1)
			action.clampWhenFinished = true

			const onFinished: AnimationFinishedListener = (event) => {
				if (event.action === action) {
					removeAnimationFinishedListener(onFinished)
					if (currentAnimation.value === name && baseAnimation.value) {
						action.fadeOut(transitionDuration.value)
						const baseAction = actions.value[baseAnimation.value]
						if (baseAction) {
							baseAction.reset()
							baseAction.fadeIn(transitionDuration.value)
							baseAction.play()
							currentAnimation.value = baseAnimation.value
						}
					}
				}
			}

			addAnimationFinishedListener(onFinished)
		}

		if (immediate) {
			action.setEffectiveWeight(1)
		} else {
			action.fadeIn(transitionDuration.value)
		}
		action.play()

		if (immediate) {
			mixer.value.update(0)
		}

		currentAnimation.value = name
		return true
	}

	function setupRandomAnimationLoop() {
		const interval = animationConfig.value?.randomAnimationInterval || 10000

		function scheduleNextAnimation() {
			if (randomAnimationTimer.value) {
				clearTimeout(randomAnimationTimer.value)
			}

			randomAnimationTimer.value = window.setTimeout(() => {
				if (randomAnimations.value.length > 0 && currentAnimation.value === baseAnimation.value) {
					const availableAnimations = randomAnimations.value.filter(
						(anim) => anim !== lastRandomAnimation.value,
					)
					const animationsToChooseFrom =
						availableAnimations.length > 0 ? availableAnimations : randomAnimations.value

					const randomIndex = Math.floor(Math.random() * animationsToChooseFrom.length)
					const randomAnimationName = animationsToChooseFrom[randomIndex]

					if (actions.value[randomAnimationName]) {
						lastRandomAnimation.value = randomAnimationName
						playRandomAnimation(randomAnimationName)
					}
				} else {
					scheduleNextAnimation()
				}
			}, interval)
		}

		scheduleNextAnimation()
	}

	function playRandomAnimation(name: string) {
		if (!mixer.value || !actions.value[name]) {
			console.warn(`Animation "${name}" not found!`)
			return
		}

		const action = actions.value[name]

		if (currentAnimation.value === name && action.isRunning()) {
			console.log(`Animation "${name}" is already running, ignoring request`)
			return
		}

		const baseAction = baseAnimation.value ? actions.value[baseAnimation.value] : undefined
		if (baseAction?.isRunning()) {
			baseAction.fadeOut(transitionDuration.value)
		}

		action.reset()
		action.setLoop(THREE.LoopOnce, 1)
		action.clampWhenFinished = true
		action.setEffectiveTimeScale(1)
		action.fadeIn(transitionDuration.value)
		action.play()

		currentAnimation.value = name

		const onFinished: AnimationFinishedListener = (event) => {
			if (event.action === action) {
				removeAnimationFinishedListener(onFinished)
				if (currentAnimation.value === name && baseAnimation.value) {
					action.fadeOut(transitionDuration.value)
					const nextBaseAction = actions.value[baseAnimation.value]
					if (nextBaseAction) {
						nextBaseAction.reset()
						nextBaseAction.setEffectiveTimeScale(1)
						nextBaseAction.fadeIn(transitionDuration.value)
						nextBaseAction.play()
						currentAnimation.value = baseAnimation.value

						setupRandomAnimationLoop()
					}
				}
			}
		}

		addAnimationFinishedListener(onFinished)
	}

	function playInteractAnimation() {
		if (actions.value[INTERACT_ANIMATION_NAME]) {
			playRandomAnimation(INTERACT_ANIMATION_NAME)
		}
	}

	function playClickInteraction() {
		addClickImpulse()
		playInteractAnimation()
	}

	function stopAnimations() {
		if (mixer.value) {
			mixer.value.stopAllAction()
		}
		currentAnimation.value = ''
	}

	function getAvailableAnimations(): string[] {
		return Object.keys(actions.value)
	}

	function clearRandomAnimationTimer() {
		if (randomAnimationTimer.value) {
			clearTimeout(randomAnimationTimer.value)
			randomAnimationTimer.value = null
		}
	}

	function addAnimationFinishedListener(listener: AnimationFinishedListener) {
		mixer.value?.addEventListener('finished', listener)
		animationFinishedListeners.push(listener)
	}

	function removeAnimationFinishedListener(
		listener: AnimationFinishedListener,
		targetMixer = mixer.value,
	) {
		targetMixer?.removeEventListener('finished', listener)

		const index = animationFinishedListeners.indexOf(listener)
		if (index !== -1) {
			animationFinishedListeners.splice(index, 1)
		}
	}

	function clearAnimationFinishedListeners(targetMixer = mixer.value) {
		animationFinishedListeners.forEach((listener) => {
			targetMixer?.removeEventListener('finished', listener)
		})
		animationFinishedListeners.length = 0
	}

	function cleanupAnimationState(root: THREE.Object3D | null) {
		clearRandomAnimationTimer()

		const currentMixer = mixer.value
		if (currentMixer) {
			clearAnimationFinishedListeners(currentMixer)
			currentMixer.stopAllAction()

			if (root) {
				currentMixer.uncacheRoot(root)
			}
		}

		mixer.value = null
		actions.value = {}
		currentAnimation.value = ''
		lastRandomAnimation.value = ''
		resetClickFeedback()
	}

	watch(
		() => animationConfig.value,
		(newConfig) => {
			clearRandomAnimationTimer()

			if (mixer.value && newConfig?.baseAnimation && actions.value[newConfig.baseAnimation]) {
				playAnimation(newConfig.baseAnimation)
				setupRandomAnimationLoop()
			}
		},
		{ deep: true },
	)

	const { onLoop } = useRenderLoop()
	onLoop(() => {
		const delta = clock.getDelta()

		if (mixer.value) {
			mixer.value.update(delta)
		}

		updateClickFeedback(delta)
	})

	return {
		clickImpulseOffsetX,
		clickImpulseRotationZ,
		clickImpulseScaleX,
		clickImpulseScaleY,
		cleanupAnimationState,
		currentAnimation,
		damageFlashIntensity,
		getAvailableAnimations,
		initializeAnimations,
		playAnimation,
		playClickInteraction,
		stopAnimations,
	}
}
