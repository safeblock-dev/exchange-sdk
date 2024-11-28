
# SafeBlock Exchange SDK


This SDK facilitates interactions with both EVM and TON networks, supporting cross-chain swaps, on-chain exchanges, and bridging functionalities. It is designed for developers building decentralized applications requiring seamless blockchain integrations.

## Features

- **EVM and TON Network Support**: Unified interfaces for handling blockchain operations across Ethereum Virtual Machine (EVM) and TON networks.
- **Cross-Chain Transactions**: Simplifies bridging tokens and assets between different networks.
- **Multi-Call Optimization**: Efficiently batches calls to minimize on-chain interactions and reduce gas costs.
- **Dynamic Network Configuration**: Supports multiple networks with easily configurable settings.
- **Comprehensive Simulation**: Simulates routes and transactions before execution.
- **Strongly Typed with TypeScript**: Ensures type safety and reduces runtime errors.

## Installation

Install the SDK using npm or yarn:

```bash
npm install @safeblock/exchange-sdk
# or
yarn add @safeblock/exchange-sdk
```

## Getting Started

### Importing the SDK

```typescript
import { SafeBlock } from "@safeblock/exchange-sdk"

const sdk = new SafeBlock({
  backend: {
    url: "https://api.safeblock.com"
  },
  tonClient: {
    endpoint: "https://ton-api.io",
    apiKey: "your-ton-api-key"
  }
})
```

### Example: Finding Routes

```typescript
import { Address, Amount, bnb } from "@safeblock/blockchain-utils"

const request = {
  tokenIn: { network: bnb, address: Address.from("0xTokenInAddress"), decimals: 18 },
  tokenOut: { network: bnb, address: Address.from("0xTokenOutAddress"), decimals: 18 },
  amountIn: Amount.from(1, 18, true),
  amountOut: Amount.from(0, 18, true), // any amount
  exactInput: true,
  slippageReadablePercent: 1 // e.g. 1%
}

const routes = await sdk.findRoutes(request) // => Error or list of routes
```

### Example: Creating a Transaction

```typescript
const route = routes[0] // Select a route from the simulation results
const quota = await sdk.createQuota(Address.from("0xYourAddress"), route) // => Error or quota
```

## Testing

Tests are located in the `__specs__` folder and can be run using Vitest:

```bash
npm run test
```

## License

This project is licensed under the Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License.  
For more information, visit: [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/).
