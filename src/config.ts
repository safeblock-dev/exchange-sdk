import { arbitrum, avalanche, bnb, mainnet, optimism, matic, base } from "@safeblock/blockchain-utils"
import selectAddress from "@safeblock/blockchain-utils/dist/utils/select-address"
import { Network } from "ethers"
import { SdkConfig } from "~/sdk"


const contractAddresses = {
  entryPoint: (network: Network, config?: SdkConfig) => selectAddress(network, config?.contractAddresses?.entryPoint ?? {
    default: "0x9AE4De30ad3943e3b65E5DF41e8FB8CC0F0213d7"
  }),

  quoter: (network: Network, config?: SdkConfig) => selectAddress(network, config?.contractAddresses?.quoter ?? {
    default: "0x13e6aC30fC8E37792F18b1e3D75B8266B0A93734"
  }),

  offchainOracle: (network: Network) => selectAddress(network, {
    default: "0x00000000000D6FFc74A8feb35aF5827bf57f6786"
  }),

  stargateUSDCPool: (network: Network) => selectAddress(network, {
    [matic.name]: "0x9Aa02D4Fae7F58b8E8f34c66E756cC734DAc7fe4",
    [mainnet.name]: "0xc026395860Db2d07ee33e05fE50ed7bD583189C7",
    [avalanche.name]: "0x5634c4a5FEd09819E3c46D86A965Dd9447d86e47",
    [arbitrum.name]: "0xe8CDF27AcD73a434D661C84887215F7598e7d0d3",
    [optimism.name]: "0xcE8CcA271Ebc0533920C83d39F417ED6A0abB7D0",
    [base.name]: "0x27a16dc786820B16E5c9028b75B99F6f604b5d26",
    default: "0x962Bd449E630b0d928f308Ce63f1A21F02576057"
  }),

  usdcParams: (network: Network) => selectAddress(network, {
    [matic.name]: { address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", decimals: 6 },
    [mainnet.name]: { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
    [avalanche.name]: { address: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", decimals: 6 },
    [arbitrum.name]: { address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6 },
    [optimism.name]: { address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", decimals: 6 },
    [base.name]: { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
    default: { address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18 }
  }),

  multicall: (network: Network) => selectAddress(network, {
    default: "0xcA11bde05977b3631167028862bE2a173976CA11"
  })
}

const publicBackendURL = "https://api.safeblock.com"

const exchangeConstants = {
  versionsMap: {
    "PAIR_VERSION_UNISWAP_V2": "0",
    "PAIR_VERSION_UNISWAP_V3": "8"
  } as Record<string, string>,

  defaultV2Fee: "1e"
}

function stargateNetworksMapping(network: Network) {
  const map: Record<string, number> = {
    [mainnet.name]: 30101,
    [bnb.name]: 30102,
    [matic.name]: 30109,
    [avalanche.name]: 30106,
    [arbitrum.name]: 30110,
    [optimism.name]: 30111,
    [base.name]: 30184
  }

  return map[network.name] ?? -1
}

function apiNetworkNamesMapping(network: Network) {
  const map: Record<string, string> = {
    [mainnet.name]: "NETWORK_ETHEREUM",
    [bnb.name]: "NETWORK_BINANCE",
    [matic.name]: "NETWORK_POLYGON",
    [avalanche.name]: "NETWORK_AVALANCHE",
    [arbitrum.name]: "NETWORK_ARBITRUM",
    [optimism.name]: "NETWORK_OPTIMISM",
    [base.name]: "NETWORK_BASE"
  }

  return map[network.name] ?? "NETWORK_UNSPECIFIED"
}

export {
  contractAddresses,
  publicBackendURL,
  exchangeConstants,
  stargateNetworksMapping,
  apiNetworkNamesMapping
}