# SafeBlock Exchange SDK

The SafeBlock Exchange SDK is a comprehensive toolkit for building decentralized
applications with cross-chain swap, bridging, and token management functionalities.
It streamlines interactions with EVM-based networks through a clean extension system,
supporting default modules for tokens, price retrieval, and event handling.

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
    - [Importing the SDK](#importing-the-sdk)
    - [Extensions](#extensions)
    - [Default Extensions Configuration](#default-extensions-configuration)
    - [Finding Routes](#finding-routes)
    - [Creating a Quote](#creating-a-quote)
    - [Split Swapping](#split-swapping)
- [Advanced Usage](#advanced-usage)
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
    - [Debugging Extensions](#debugging-extensions)
    - [Extensions Load Order](#extensions-load-order)
- [Testing](#testing)
- [License](#license)

## Installation

Install the SDK using npm or yarn:

```bash
npm add @safeblock/exchange-sdk
# or
yarn add @safeblock/exchange-sdk
```

If you want to get the latest features or just test preview builds, install the SDK from the preview channel

```bash
npm[yarn] add @safeblock/exchange-sdk@preview
```

_**Note**: Pre-release builds may be unstable or contain features that may be completely changed or removed after
release or in future preview updates of the same version._

## Usage

_This section touches on basic SDK concepts and provides enough knowledge to get you started with confidence_

### Importing the SDK

Below is an example SDK configuration.

```typescript
import { SafeBlock } from "@safeblock/exchange-sdk"

const sdk = new SafeBlock({
  // Optional, default is 20, will skip all routes with a price impact
  // more than 20 percent
  routePriceDifferenceLimit: 20,

  // Optional, processor for SDK debug logs, disabled by
  // default. Enable it only if you need to debug
  // extension or experience troubles using SDK
  debugLogListener: console.log,

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
import { Address, Amount, bnb, ExchangeRequest } from "@safeblock/blockchain-utils"

const request: ExchangeRequest = {
  tokenIn: { network: bnb, address: Address.from("0xTokenInAddress"), decimals: 18 },
  tokensOut: [
    { network: bnb, address: Address.from("0xTokenOutAddress"), decimals: 18 }
  ],
  amountIn: Amount.from(1, 18, true),
  amountOutReadablePercentages: [
    100 // Split swap percentage, use 100 for signle token exchanges
  ],
  amountsOut: [
    Amount.from(0, 18, true), // Any amount, because exactInput is true
  ],
  exactInput: true,
  slippageReadablePercent: 1 // e.g. 1%
}

const route = await sdk.findRoute(request) // => SdkException or SimulatedRoute
```

### Creating a Quote

A quote is a representation of a swap that contains all the data for the
upcoming swap and ready-to-use calldata for the transaction:

```typescript
// Pass here a route from the simulation result to create exchange quota
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

### Split Swapping

Starting with `v1.1.0-preview.1`, the SDK now has the ability to perform split swaps.

Split swap is the exchange of one token for several other tokens
within one or more networks. An example of obtaining a split swap quota:

```ts
// Let's imagine that we have tokenA - input token
// and tokenB, tokenC - output tokens...

const request: ExchangeRequest = {
  tokenIn: tokenA,
  tokensOut: [
    tokenB, // Specify all output tokens
    tokenC
  ],
  amountIn: Amount.from(10, tokenA.decimals, true),
  amountOutReadablePercentages: [
    50, // Select the share percentage of output amounts
    50  // In this case you will exchange 5 tokenA 
        // to tokenB and 5 tokenA to tokenC       
  ],
  amountsOut: [
    Amount.from(0, 18, true), // Any amount, because exactInput is true
    Amount.from(0, 18, true)  // But should always have same length as tokensOut array
  ],
  exactInput: true, // Should always be true for split swap
  slippageReadablePercent: 1 // e.g. 1%
}

// What happens next is the same as a normal exchange...
```

As you can see, split swap is virtually no different from regular swap.

Although we try to provide the best possible SDK experience, the Split swap feature has some limitations:

- You cannot perform split swaps for tokens on different networks: you can swap a token from one network for multiple
  tokens on another network, but all output tokens must be on the same target network
- Cannot perform exact output exchanges: due to the complexity of the split-exchange logic, it is currently impossible
  to specify the exact amount you would like to receive in each output token

## Advanced Usage

_This section touches on the more advanced concepts and techniques required for advanced SDK interaction_

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

**Note**: The extension system has been available since SDK version `v1.0.0-preview.4`.

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

### Debugging Extensions

You can debug extensions using standard SDK debug logging interface `debugLogListener`:

```ts
const sdk = new SafeBlock({
  // ... configuration
  debugLogListener: console.log
})
```

Code below will output SDK debug logs into browser's or application's console

When you initialize the extensions, you will see the following messages:

```text
Init: Loading extensions (2): TokensListExtension, PriceStorageExtension
Init: Successfully initialized 2 extensions
```

If there is nothing else in the `Init` section except such messages, it means that all
your extensions have been initialized successfully

In case of extension initialization errors, the extensions themselves will
be disabled and the following will appear in the logs:

```text
Init: Loading extensions (3): TokensListExtension, PriceStorageExtension, MyInvalidExtension
Init: Error due MyInvalidExtension (#2) initialization: <reason>
Init: Successfully initialized 2 extensions
```

List of standard extension initialization errors:

| Message                                                                               | Description                                                                                                                                          |
|---------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------|
| Extension cannot be processed due to invalid constructor                              | Extension with specific index not extends SdkExtension or extends it incorrectly                                                                     |
| Cannot use default name for extension initialization                                  | Default name `SdkExtension` cannot be used as extension name                                                                                         |
| Extension with same name already initialized                                          | _Describes itself_                                                                                                                                   |
| Extension attempted to declare events that already been declared by another extension | Example: if previous extension already declared event `onTokenAdded`, there will be init error when another extension attempts to declare same event |
| Extension attempted to declare event with invalid name                                | Extension event names should match following regex: `^(?!\d)(?!\d+$)[a-zA-Z][a-zA-Z0-9]*$`                                                           |
| Initialization method raised error: \<message\>                                       | When trying to call `.onInitialize` method there is error raised                                                                                     |

In a standard configuration, extensions with initialization errors
will simply not be added to the extension pool and the user will
not be able to access them.

In some situations, when initialization problems prevent further operation
of the SDK, the initialization process may be terminated with an error
of `Fatal` type, in which case the SDK will not be able to continue functioning.

### Extensions Load Order

The order in which extensions are initialized is determined by their index in the extension array.

It is strongly recommended to add critical extensions such as `TokensListExtension` and `PriceStoreExtension` to the
array first and only then other custom extensions, so when attempts are made to declare overlapping events or initialize 
extensions with identical names, the invalid extensions will be disabled rather than the critical ones.

## Testing

Tests are located in the `__specs__` folder and can be run using Vitest:

```bash
npm run test
```

## License

This project is licensed under the Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License.  
For more information, visit: [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/).