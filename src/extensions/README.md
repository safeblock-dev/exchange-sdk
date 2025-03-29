# Documentation for the Vendor Extensions

This documentation provides information about the extensions shipped
with the SDK.

_**Note**: The `PriceStorageExtension` and `TokensListExtension` are required for the SDK to work correctly._

## Table of Contents

- [PriceStorageExtension](#pricestorageextension)
- [TokensListExtension](#tokenslistextension)
- [TokensExtension](#tokensextension)

## PriceStorageExtension

An extension that adds the ability to fetch and update token prices.

### Configuration

```ts
import { PriceStorageExtension } from "@safeblock/exchange-sdk/extensions"

new PriceStorageExtension(env.sdk, env.eventBus, {
  // Optional. Token prices auto-update interval
  updateInterval: 6_000,

  // Optional. Minimal timeout between force refetch
  // calls in milliseconds
  forceRefetchTimeout: 200
})
```

### Declared Events

- `onPriceStorageInitialLoadFinished()`
  \
  Called when the initial token price update is complete


- `onPriceStoragePricesUpdated()`
  \
  Called each time the token prices are updated


- `onPriceStorageForceRefetch()`
  \
  Called each time the `forceRefetch` method is invoked

### Public Methods

- `waitInitialFetch(pollingInterval?): Promise<void>`
  \
  Creates a `Promise` object that resolves only after the initial price loading has finished.  
  **Arguments**:
    - `pollingInterval?: number` — determines how frequently the extension polls its internal state to see if the
      initial loading has finished


- `forceRefetch(): Promise<void>`
  \
  Manually refreshes the token prices


- `getPrice(tokenOrNetwork, address?): Amount`
  \
  Retrieves the price of a token.  
  **Arguments**:
    - `tokenOrNetwork: BasicToken | Network` — a token object or a network pointer
    - `address?: Address` — the token address (used only if `tokenOrNetwork` is a network pointer)

## TokensListExtension

An extension that adds a managed token list to the SDK.

### Configuration

```ts
import { TokensListExtension } from "@safeblock/exchange-sdk/extensions"

new TokensListExtension(
  env.sdk,
  env.eventBus,
  // Optional, initial tokens list in one of the following types:
  // Record<string, BasicToken[]> | Map<string, BasicToken[]> | [string, BasicToken[]][]
  initialTokensList
)
```

### Declared Events

- `onTokenAdded(token: BasicToken)`
  \
  Called when a new token is added


- `onTokenRemoved(token: BasicToken)`
  \
  Called when a token is removed

### Public Methods

- `exist(token: BasicToken): boolean`
  \
  Checks if the specified token is already in the token list


- `get(network: Network, address: Address): BasicToken | null`
  \
  Retrieves a token by its network pointer and address. Returns `BasicToken` or `null` if the token is not found


- `add(token: BasicToken): this`
  \
  Adds a token to the list


- `remove(token: BasicToken): this`
  \
  Removes a token from the list


- `get tokensList(): BasicToken[]`
  \
  Returns all tokens that have been added to the list


- `list(network: Network): BasicToken[]`
  \
  Returns all tokens in the list that belong to the specified network


- `get networks(): Network[]`
  \
  Returns a list of network pointers for which tokens exist in the list

## TokensExtension

An extension for interacting with SafeBlock token APIs.

### Configuration

```ts
import { TokensExtension } from "@safeblock/exchange-sdk/extensions"

new TokensExtension(env.sdk, env.config)
```

### Declared Events

Does not declare any events

### Public Methods

- `reset()`
  \
  Resets the current balance update task and clears all stored user balances


- `balanceOf(of: Address, token: BasicToken): Amount`
  \
  Returns the stored balance of the `token` for the specified address


- `findTokens(query, options?): Promise<BasicToken[] | null>`
  \
  Searches for tokens by name, symbol, or address using the SafeBlock API  
  **Arguments**:
    - `query: string` — a part or full name, symbol, or address of the token to search
    - `options?: FindTokenOptions` — additional search parameters


- `fetchBalances(of: Address): Promise<void>`
  \
  Initiates an update procedure to retrieve the token balances for a specific address


- `as(of: Address)`
  \
  Returns an object that provides the `balanceOf` and `fetchBalances` methods without requiring the address as the first
  argument. Similar to using `bind`.

### Custom Types

```ts
interface FindTokensOptions {
  // A list of networks to search on.
  // If not specified, the search will be performed on all available networks
  networks?: Network[]

  // The maximum number of tokens in the response
  maxTokensPerRequest?: number
}
```