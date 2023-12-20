# vue-use-cancellable-async-state
Cancellable version of VueUse `useAsyncState`

## Install
```bash
$ npm install @muxiu1997/vue-use-cancellable-async-state
```

```js
import useCancellableAsyncState from '@muxiu1997/vue-use-cancellable-async-state'
```

## Usage
```typescript
import axios from 'axios'
import useCancellableAsyncState from '@muxiu1997/vue-use-cancellable-async-state'

const { state, isReady, isLoading } = useCancellableAsyncState(
  (onCancel) => {
    const abortController = new AbortController()

    onCancel(() => abortController.abort())

    const id = args?.id || 1
    return axios.get(
      `https://jsonplaceholder.typicode.com/todos/${id}`,
      { signal: abortController.signal },
    )
  },
  {},
)
```

## License
[MIT](./LICENSE)
