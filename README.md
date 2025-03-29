# SafeBlock Exchange SDK

This SDK facilitates interactions with EVM networks, supporting cross-chain swaps,
on-chain exchanges, and bridging functionalities. It is designed for developers
building decentralized applications requiring seamless blockchain integrations.

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
    - [Importing the SDK](#importing-the-sdk)
    - [Extensions](#extensions)
    - [Default Extensions Configuration](#default-extensions-configuration)
    - [Finding Routes](#finding-routes)
    - [Creating a Quote](#creating-a-quote)
    - [Subscribing for Events](#subscribing-for-events)
    - [Unsubscribing from Events](#unsubscribing-from-events)
    - [Events List](#events-list)
- [Executing Transactions](#executing-transactions)
    - [Ethers](#ethers)
    - [Other Libraries](#other-libraries)
- [Extensions API](#extensions-api)
    - [Configuring Extension](#configuring-extension)
    - [Events Bus](#events-bus)
    - [Using Mixins](#using-mixins)
- [Testing](#testing)
- [License](#license)

## Installation

Install the SDK using npm or yarn:

```bash
npm install @safeblock/exchange-sdk
# or
yarn add @safeblock/exchange-sdk
```

## Usage

### Importing the SDK

Below is an example SDK configuration.

```typescript
import { SafeBlock } from "@safeblock/exchange-sdk"

const sdk = new SafeBlock({
  // Optional, default is 20, will skip all routes with a price impact
  // more than 20 percent
  routePriceDifferenceLimit: 20,

  // Soft limit for the number of routes in a batch call,
  // will try to retrieve as many direct routes as possible
  // and 3 more indirect routes
  routesCountLimit: 3,

  // Maximum number of routes in a single batch call, default is 30
  // setting more than 40 may cause unpredictable errors
  routesCountHardLimit: 30,

  extensions: environment => [
    // Extensions list, should contain at least
    // TokensListExtension and PriceStorageExtension      
  ],

  backend: {
    url: "https://api.safeblock.com",
    headers: {} // Optional: set authorization headers if needed
  }
})
```

_**Note**: Starting with v1.0.0, for the SDK to function properly, in addition to the standard configuration, you must
set up the default extensions._

### Extensions

Extensions are custom code that extend the functionality
of the SDK. By default, the following set of extensions is available:

| Extension Name        | Description                                                          |
|-----------------------|----------------------------------------------------------------------|
| TokensListExtension   | An extension that adds a managed token list to the SDK.              |
| PriceStorageExtension | An extension that adds the ability to fetch and update token prices. |
| TokensExtension       | An extension for interacting with SafeBlock token APIs.              |

_**Note**: For the SDK to work correctly, at least the TokensListExtension and PriceStorageExtension are required;
without these extensions, the SDK will throw an error when you try to initialize._

For more information about each of these standard extensions, see
the [Vendor Extensions README.md](/src/extensions/README.md).

### Accessing Extensions

To access extensions, you can use the following method:

```ts
import { TokensListExtension } from "@safeblock/exchange-sdk/extensions"

sdk.extension(TokensListExtension).add(basicToken)
```

If the extension was not found, or if an error occurred during its initialization,
this code will throw an exception. If you want to run certain code blocks only when the extension has been obtained
successfully, you can use the following method:

```ts
sdk.withExtension(TokensListExtension, extension => {
// This block will only run if the requested extension is successfully obtained
})
```

_**Note**: You can still wrap the first approach in a `try/catch`, which will work as well._

### Default Extensions Configuration

Below is the minimal working extensions configuration for the SDK:

```ts
const sdk = new SafeBlock({
// ... other configuration options
  extensions: env => [
    new TokensListExtension(env.sdk, env.eventBus),
    new PriceStorageExtension(env.sdk, env.eventBus)
  ]
})
```

_**Note**: For the PriceStorageExtension to work correctly, you need to add
at least two tokens for each network to the token list, one of which must be USDC._

### Finding Routes

After setting up the SDK, you can start obtaining exchange data. The first step is to find routes:

```typescript
import { Address, Amount, bnb } from "@safeblock/blockchain-utils"

const request = {
  tokenIn: { network: bnb, address: Address.from("0xTokenInAddress"), decimals: 18 },
  tokenOut: { network: bnb, address: Address.from("0xTokenOutAddress"), decimals: 18 },
  amountIn: Amount.from(1, 18, true),
  amountOut: Amount.from(0, 18, true), // Any amount, because exactInput is true
  exactInput: true,
  slippageReadablePercent: 1 // e.g. 1%
}

const routes = await sdk.findRoutes(request) // => SdkError or list of routes
```

### Creating a Quote

A quote is a representation of a swap that contains all the data for the
upcoming swap and ready-to-use calldata for the transaction:

```typescript
// Select a route from the simulation results
// Routes array is sorted by price impact, from lower to higher
// so the first entry will be the best route provided
const route = routes[0]
const quota = await sdk.createQuotaFromRoute(Address.from("0xYourAddress"), route) // => Error or quota
```

If you don't need detailed route management, you can simplify the code and get the quote right away:

```typescript
import { Address } from "@safeblock/blockchain-utils"

const request = {
  /* same as in previous example */
}

const task = sdk.updateTask()

const quota = await sdk.createQuota(Address.from("0xYourAddress"), request, task)
```

This method automatically calculates the routes and returns the best possible quote.

### Subscribing for Events

During operation, both the SDK and its extensions may generate certain events.
You can subscribe to the events you need as follows:

```ts
// This event comes from the TokensListExtension, which is called
// each time a new token is added
const identifier = sdk.addListener("onTokenAdded", basicToken => {
  // ...
})
```

This structure will return an object of type `EventIdentifier`, which can be used
to safely remove the handler.

You can also add an event handler that only triggers once:

```ts
sdk.addListenerOnce("onTokenAdded", () => {})
```

### Unsubscribing from Events

Event handlers are removed as follows:

```ts
// Remove a handler by reference to the function
sdk.removeListener("onTokenAdded", () => {})

// Remove a handler by its identifier
sdk.removeListener("onTokenAdded", identifier)

// Remove all handlers for a specific event
sdk.removeListener("onTokenAdded")
```

### Events List

By default, the SDK only has the `onExtensionsInitializationFinished` event available,
which is called after the SDK is fully initialized. Information about events declared by extensions
can be found in each extension’s documentation.

_**Pro tip**: If an extension lacks documentation, you can identify its declared events by checking
the `events` field in the extension’s code._

## Executing Transactions

The final step of an exchange is executing the transactions obtained in the previous steps.

### Ethers

If you use the ethers library to interact with contracts, you can
easily prepare transactions for posting using the SDK:

```typescript
const quota: ExchangeQuota = {} // from the previous example
const signer = JsonRpcSigner // your ethers signer

for (const data of quota.executorCallData) {
  const transaction = await sdk.prepareEthersTransaction(data, signer)

// In case of any errors, the prepareEthersTransaction method will return
// a standard SdkException error
  if (transaction instanceof SdkException) {
    console.log("Error occurred", transaction.code, transaction.message)
    return
  }

  const tx = signer.sendTransaction(transaction)

  console.log("Transaction sent:", tx.hash)

  const receipt = await tx.wait(1)
}
```

**Warning**: Most likely, the transaction array will include an approval transaction,
so it is strongly recommended to wait for the execution of the first transaction
before starting subsequent ones to avoid simulation errors.

### Other Libraries

If you prefer to use any other library besides ethers, you can just as easily
build a transaction manually:

```typescript
// quota and signer variables are the same as in the previous example

for (const data of quota.executorCallData) {
// Basic transaction parameters
  const transactionData = data.callData // transaction data
  const network = data.network.chainId // chain ID of the network where the transaction should be sent
  const value = data.value // native amount, may be undefined
  const to = data.to // destination address

// First, estimate the gas consumption of the transaction
  const gasEstimation = 1 // replace with actual logic

// Now get current fee data or only gasPrice
  const gasPrice = 1 // replace with actual logic

// In this example we use BigNumber, but you can use any library of your choice
  const gasLimit = new BigNumber(estimation).multipliedBy(callData.gasLimitMultiplier ?? 1).toFixed(0)

// With the data gathered above, we can send the transaction: just
// package it with your library and sign with your wallet
}
```

## Extensions API

**Note**: The extension system has been available since SDK version v1.0.0-preview.4.

Any extension for the SDK is a class that extends the abstract `SdkExtension` class and implements its methods.
A basic extension looks like this:

```ts
import { SdkExtension } from "@safeblock/exchange-sdk"

class TestExtension extends SdkExtension {
  // A unique name for your extension
  static override name = "TestExtension"

  public events = {}

  // This function is called once during extension initialization
  public onInitialize(): void {}

  constructor() {
    super()
  }
}
```

You can add this extension to the SDK\'s extension section, and it will be initialized, but it will not perform any
functionality yet.

### Configuring Extension

Although the extension supports any activity, it requires specific permissions
to access the SDK\'s internal data.

Currently, the following internal data structures can be accessed by an extension:

| Structure | Description                                    |
|-----------|------------------------------------------------|
| eventsBus | The SDK\'s shared event bus                    |
| sdk       | The current SDK instance (public methods only) |
| mixins    | The mixin subsystem                            |
| config    | The configuration of the current SDK instance  |

All of the above data structures are available in the `environment` object in the SDK\'s `extensions` configuration:

```ts
const sdk = new SafeBlock({
  extensions: environment => [
    // ...
  ]
})
```

An extension can access these data structures through the constructor. Let's modify our previous extension example to
access the SDK instance in the extension:

```ts
import { SafeBlock } from "@safeblock/exchange-sdk"

class TestExtension extends SdkExtension {
  // ... no changes

  constructor(private readonly sdk: SafeBlock) {
    super()
  }
}
```

Now the extension has access to the public methods of the SDK instance.
It is considered good practice to make the requested variables optional, so that
the end user can decide what data to expose.

An example of how to initialize this extension:

```ts
const sdk = new SafeBlock({
  extensions: environment => [
    new TestExtension(environment.sdk)
  ]
})
```

### Events Bus

The event bus is a subsystem that creates, stores, and triggers various events.

An extension can call any existing events as well as declare its own events, which
the end user can then subscribe to. Let’s expand our extension:

```ts
import { SdkExtension, type PartialEventBus } from "@safeblock/exchange-sdk"

const events = {
  // Declare the events that our extension can trigger
  // The return data type doesn’t matter; we use null for convenience.
  onTestExtensionCall: () => null,

  // Here is an example of an event with arguments
  onTestExtensionCallWithArgs: (date: number) => null
}

class TestExtension extends SdkExtension {
  static override name = "TestExtension"

  public events = events

  constructor(private readonly eventsBus: PartialEventBus<typeof events>) {
    super()
  }

  public onInitialize() {}

  public callExtension() {
    // If everything is set up correctly, the emitEvent function will automatically pick up
    // the event types declared here. Since onTestExtensionCall has no arguments,
    // we can call it without any.
    this.eventsBus.emitEvent("onTestExtensionCall")

    // This is how we call an event with arguments
    this.eventsBus.emitEvent("onTestExtensionCallWithArgs", Date.now())
  }
}
```

If you also need to call events from other extensions, simply widen the event bus type in the constructor:

```ts
import { TokensListExtension } from "@safeblock/exchange-sdk/extensions"

type TokensListExtensionEvents = typeof TokensListExtension["prototype"]["events"]

class TestExtension extends SdkExtension {
  // ... no changes

  constructor(private readonly eventsBus: PartialEventBus<typeof events & TokensListExtensionEvents>) {
    super()

    // Now you can emit events from TokensListExtension as well
    eventsBus.emitEvent("onTokenAdded", basicToken)
  }
}
```

All events from all extensions are automatically typed once they are added to the SDK configuration:

```ts
const sdk = new SafeBlock({
  extensions: environment => [
    new TestExtension(environment.sdk)
  ]
})

// addListener now supports default events, onTestExtensionCall, and onTestExtensionCallWithArgs
sdk.addListener("...", /* ... */)
```

### Using Mixins

Mixins are a subsystem of the SDK that allow extensions to modify the SDK\'s internal logic.

_**Note**: Currently, the mixin system is in a prototype stage and only allows changes
to specifically defined parts of the SDK\'s core. In future updates, extensions will
be able to declare their own mixins._

Let's use our previous extension and add logic to modify the gas usage calculation for transactions:

```ts
// ... no changes

import { type SdkMixins } from "@safeblock/exchange-sdk"

class TestExtension extends SdkExtension {
  // ... no changes

  constructor(/* ... no changes */ private readonly mixins: SdkMixins) {
    super()
  }

  public onInitialize() {
    this.mixins.addMixin(
      "internal",
      "computeOnchainTradeGasUsage",
      "routeInitialGasUsage",
      value => value * 2
    )
  }

  // ... no changes
}
```

In this example, the extension modifies the amount of gas used by the swap execution contract, doubling the initial gas
usage.

**You can find the list of available mixins here:** [MIXINS.md](MIXINS.md)

## Testing

Tests are located in the `__specs__` folder and can be run using Vitest:

```bash
npm run test
```

## License

This project is licensed under the Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License.  
For more information, visit: [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/).