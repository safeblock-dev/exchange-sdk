
# SafeBlock Exchange SDK


This SDK facilitates interactions with EVM networks, supporting cross-chain swaps, 
on-chain exchanges, and bridging functionalities. It is designed for developers 
building decentralized applications requiring seamless blockchain integrations.

## Table of Contents
- [Installation](#installation)
- [Usage](#usage)
  - [Importing the SDK](#importing-the-sdk)
  - [Finding Routes](#finding-routes)
  - [Creating a Quote](#creating-a-quote)
- [Executing Transactions](#executing-transactions)
  - [Ethers](#ethers)
  - [Other Libraries](#other-libraries)
- [Subscribing for Events](#subscribing-for-events)
- [Tokens Extension](#tokens-extension)

## Installation

Install the SDK using npm or yarn:

```bash
npm install @safeblock/exchange-sdk
# or
yarn add @safeblock/exchange-sdk
```

## Usage

### Importing the SDK

```typescript
import { SafeBlock } from "@safeblock/exchange-sdk"

const sdk = new SafeBlock({
  tokensList: {}, // Optional, initial tokens list

  // Optional, default is 20, will skip all routes that has price impact
  // more than 20 percents
  routePriceDifferenceLimit: 20,

  // Soft limit for routes count in batch call,
  // will try to retrieve as much as possible direct routes
  // and 3 more indirect routes
  routesCountLimit: 3,
  
  // Maximum routes in single batch call, default is 30
  // more than 40 can lead to unpredictable exceptions
  routesCountHardLimit: 30,
  
  backend: {
    url: "https://api.safeblock.com",
    headers: {} // Optional, setup authorization headers if needed
  },
  
  // Optional
  priceStorage: {
    // Optional, time in milliseconds between price update cycles
    updateInterval: 15_000
  }
})
```

### Finding Routes

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

A quota is a representation of a swap that contains all the data for the 
upcoming swap and a ready calldata for the transaction

```typescript
const route = routes[0] // Select a route from the simulation results
const quota = await sdk.createQuotaFromRoute(Address.from("0xYourAddress"), route) // => Error or quota
```

If you don't need detailed route management, you can simplify the code and get quota right away:

```typescript
import { Address } from "@safeblock/blockchain-utils"

const request = {
  /* Same as in previous example */
}

const task = sdk.updateTask()

const quota = await sdk.createQuota(Address.from("0xYourAddress"), request, task)
```

This method will automatically calculate the routes and return you the best quota possible

## Executing Transactions

### Ethers

If you use the ethers library to interact with contracts, you can 
easily prepare transactions for posting using SDK:

```typescript
const quota: ExchangeQuota = {} // From previous example
const signer = JsonRpcSigner // Your ethers signer

for (const data of quota.executorCallData) {
  const transaction = await sdk.prepareEthersTransaction(data, signer)

  // In case of any errors, the prepareEthersTransaction method will return
  // a standard SdkException error
  if (transaction instanceof SdkException) {
    console.log("Error occured", transaction.code, transaction.message)
    return
  }

  const tx = signer.sendTransaction(transaction)

  console.log("Transaction sent:", tx.hash)

  const receipt = await tx.wait(1)
}
```

Warning. Most likely, the transaction array will contain an approval transaction,
so it is strongly recommended to wait for the execution of the first transaction 
before starting the execution of subsequent ones to avoid simulation errors

### Other Libraries

If you prefer to use any other library besides ethers, you can just as easily
build a transaction to send manually:

```typescript
// quota and signer variables are the same as in previous example

for (const data of quota.executorCallData) {
  // There is the basic transaction params
  const transactionData = data.callData // Transaction data
  const network = data.network.chainId // Chain id of the network where transaction should be sent to
  const value = data.value // Native amount, may be undefined
  const to = data.to // Destination address
  
  // First, you need to estimate transaction gas consumption
  const gasEstimation = 1 // Replace with actual logic
  
  // Now you need to get current fee data or only gasPrice
  const gasPrice = 1 // Replace with actual logic
  
  // In this example we used BigNumber, but you can use anything you like
  const gasLimit = new BigNumber(estimation).multipliedBy(callData.gasLimitMultiplier ?? 1).toFixed(0)
  
  // With data gathered above we are now able to send transaction, just 
  // pack it with your library and sign with a wallet
}
```

## Subscribing for Events

SDK supports the ability to subscribe to specific events that occur under the hood:

| Event name    | Description                                                                |
|---------------|----------------------------------------------------------------------------|
| initialized   | Will be called after completing the receipt of balances for the first time |
| pricesUpdated | Will be called every time the prices in priceStorage are updated           |
| tokenAdded    | Will be called after the token is added to tokensList                      |
| tokenRemoved  | Will be called after the token is removed from the tokensList              |

Usage example:

```typescript
import { Address, bnb } from "@safeblock/blockchain-utils"

// Lets create logic that will log wBNB price right after SDK priceStorage initialization
sdk.addEventListener("initialized", sdk => {
  const network = bnb

  // Get price of wrapped BNB token
  const price = sdk.priceStorage.getPrice(network, Address.wrappedOf(network))
  
  // In this case, if the token is added to the SDK, the price is unambiguously received
  
  console.log("wBNB price:", price.toReadableBigNumber().toFixed())
})

// To remove specific listener use following syntax
sdk.removeCallback("initialized", /* listener */)

// You can also remove all listeners of specific event...
sdk.removeCallback("initialized")

// ... or event remove all listeners
sdk.cleanEventListeners()
```

## Tokens Extension
Tokens extension allows you to find tokens using 
SafeBlock API and get their balances for a specific 
account directly from the blockchain. Below is a 
simple example of finding tokens and getting their balances.
```typescript

const list = await sdk.tokensExtension.findTokens("MyCoolTokenName")

list.forEach(token => sdk.tokensList.add(token))

sdk.priceStorage.forceRefetch()
const accountBalance = sdk.tokensExtension.as(Address.from("0x...accountAddress..."))

await accountBalance.fetchBalances()

// Balance of the first token in the list
accountBalance.balanceOf(list[0])
```

All token balances are automatically cached, but the number of cached balances 
cannot exceed 5,000 entries per account

The example above uses the `.as(address)` syntax, but you can do without it:

```typescript
const accountAddress = Address.from("0x...")
const token = list[0]

await sdk.tokensExtension.fetchBalances(accountAddress)
sdk.tokensExtension.balanceOf(accountAddress, token)
```

## Testing

Tests are located in the `__specs__` folder and can be run using Vitest:

```bash
npm run test
```

## License

This project is licensed under the Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License.  
For more information, visit: [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/).
