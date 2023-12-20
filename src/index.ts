import { ref, shallowRef, watch } from 'vue-demi'

import type { Ref, UnwrapRef } from 'vue-demi'

export type Fn = () => void

function noop() {}

function promiseTimeout(
  ms: number,
  throwOnTimeout = false,
  reason = 'Timeout',
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (throwOnTimeout) {
      setTimeout(() => reject(reason), ms)
    }
    else { setTimeout(resolve, ms) }
  })
}

export interface UseCancellableAsyncStateOptions<Shallow extends boolean, D = any> {
  /**
   * Delay for executing the promise. In milliseconds.
   *
   * @default 0
   */
  delay?: number

  /**
   * Execute the promise right after the function is invoked.
   * Will apply the delay if any.
   *
   * When set to false, you will need to execute it manually.
   *
   * @default true
   */
  immediate?: boolean

  /**
   * Callback when error is caught.
   */
  onError?: (e: unknown) => void

  /**
   * Callback when success is caught.
   * @param {D} data
   */
  onSuccess?: (data: D) => void

  /**
   * Sets the state to initialState before executing the promise.
   *
   * This can be useful when calling the execute function more than once (for
   * example, to refresh data). When set to false, the current state remains
   * unchanged until the promise resolves.
   *
   * @default true
   */
  resetOnExecute?: boolean

  /**
   * Use shallowRef.
   *
   * @default true
   */
  shallow?: Shallow
  /**
   *
   * An error is thrown when executing the execute function
   *
   * @default false
   */
  throwError?: boolean
}

export interface UseCancellableAsyncStateReturnBase<Data, Params extends any[], Shallow extends boolean> {
  state: Shallow extends true ? Ref<Data> : Ref<UnwrapRef<Data>>
  isReady: Ref<boolean>
  isLoading: Ref<boolean>
  error: Ref<unknown>
  execute: (delay?: number, ...args: Params) => Promise<Data>
}

export type UseCancellableAsyncStateReturn<Data, Params extends any[], Shallow extends boolean> =
  UseCancellableAsyncStateReturnBase<Data, Params, Shallow>
  & PromiseLike<UseCancellableAsyncStateReturnBase<Data, Params, Shallow>>

/**
 * Handle overlapping executions.
 *
 * @param cancelCallback The provided callback is invoked when a re-invocation of the execute function is triggered before the previous one finished
 */
export type CancellableAsyncStateOnCancel = (cancelCallback: Fn) => void

/**
 * Cancellable version of `useAsyncState`.
 *
 * @param promise         The cancellable promise / async function to be resolved
 * @param initialState    The initial state, used until the first evaluation finishes
 * @param options
 */
export default function useCancellableAsyncState<Data, Params extends any[] = [], Shallow extends boolean = true >(
  promise: Promise<Data> | ((onCancel: CancellableAsyncStateOnCancel, ...args: Params) => Promise<Data>),
  initialState: Data,
  options?: UseCancellableAsyncStateOptions<Shallow, Data>,
): UseCancellableAsyncStateReturn<Data, Params, Shallow> {
  const {
    immediate = true,
    delay = 0,
    onError = noop,
    onSuccess = noop,
    resetOnExecute = true,
    shallow = true,
    throwError,
  } = options ?? {}
  const state = shallow ? shallowRef(initialState) : ref(initialState)
  const isReady = ref(false)
  const isLoading = ref(false)
  const error = shallowRef<unknown | undefined>(undefined)

  let counter = 0
  let cleanup: Fn | undefined
  const onCancel = (fn: Fn) => {
    cleanup = () => {
      fn()
      cleanup = void 0
    }
  }

  async function execute(delay = 0, ...args: any[]) {
    counter++
    if (cleanup) cleanup()

    const counterAtBeginning = counter
    let hasFinished = false

    if (resetOnExecute) state.value = initialState
    error.value = undefined
    isReady.value = false
    isLoading.value = true

    if (delay > 0) await promiseTimeout(delay)

    const _promise = typeof promise === 'function'
      ? promise(((cancelCallback) => {
        onCancel(() => {
          isLoading.value = false

          if (!hasFinished) cancelCallback()
        })
      }) as CancellableAsyncStateOnCancel, ...args as Params)
      : promise

    try {
      const data = await _promise
      if (counterAtBeginning === counter) {
        state.value = data
        isReady.value = true
        onSuccess(data)
      }
    }
    catch (e) {
      error.value = e
      onError(e)
      if (throwError) throw e
    }
    finally {
      if (counterAtBeginning === counter) isLoading.value = false

      hasFinished = true
    }

    return state.value as Data
  }

  if (immediate) execute(delay)

  const shell: UseCancellableAsyncStateReturnBase<Data, Params, Shallow> = {
    state: state as Shallow extends true ? Ref<Data> : Ref<UnwrapRef<Data>>,
    isReady,
    isLoading,
    error,
    execute,
  }

  function waitUntilIsLoaded() {
    return new Promise<UseCancellableAsyncStateReturnBase<Data, Params, Shallow>>((resolve, reject) => {
      let stop: (() => void) | null = null
      const watcher = new Promise((watcherResolve) => {
        stop = watch(
          isLoading,
          (v) => {
            if (!v) {
              stop?.()
              watcherResolve(v)
            }
          },
          {
            flush: 'sync',
            immediate: true,
          },
        )
      })

      watcher
        .then(() => resolve(shell))
        .catch(reject)
    })
  }

  return {
    ...shell,
    then(onFulfilled, onRejected) {
      return waitUntilIsLoaded()
        .then(onFulfilled, onRejected)
    },
  }
}
