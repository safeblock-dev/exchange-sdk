import { arbitrum, avalanche, bnb, mainnet, optimism, matic, ton } from "@safeblock/blockchain-utils"
import selectAddress from "@safeblock/blockchain-utils/dist/utils/select-address"
import { Network } from "ethers"


const contractAddresses = {
  entryPoint: (network: Network) => selectAddress(network, {
    //[bnb.name]: "0x9AE4De30ad3943e3b65E5DF41e8FB8CC0F0213d7",
    default: "0x9AE4De30ad3943e3b65E5DF41e8FB8CC0F0213d7"
  }),

  quoter: (network: Network) => selectAddress(network, {
    default: "0x13e6aC30fC8E37792F18b1e3D75B8266B0A93734"
  }),

  offchainOracle: (network: Network) => selectAddress(network, {
    default: "0x00000000000D6FFc74A8feb35aF5827bf57f6786"
  }),

  stargateUSDTPool: (network: Network) => selectAddress(network, {
    [matic.name]: "0xd47b03ee6d86Cf251ee7860FB2ACf9f91B9fD4d7",
    [mainnet.name]: "0x933597a323Eb81cAe705C5bC29985172fd5A3973",
    [avalanche.name]: "0x12dC9256Acc9895B076f6638D628382881e62CeE",
    [arbitrum.name]: "0xcE8CcA271Ebc0533920C83d39F417ED6A0abB7D0",
    [optimism.name]: "0x19cFCE47eD54a88614648DC3f19A5980097007dD",
    default: "0x138EB30f73BC423c6455C53df6D89CB01d9eBc63"
  }),

  usdtParams: (network: Network) => selectAddress(network, {
    [matic.name]: { address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", decimals: 6 },
    [mainnet.name]: { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
    [avalanche.name]: { address: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7", decimals: 6 },
    [arbitrum.name]: { address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", decimals: 6 },
    [optimism.name]: { address: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58", decimals: 6 },
    [ton.name]: { address: "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs", decimals: 6 },
    default: { address: "0x55d398326f99059fF775485246999027B3197955", decimals: 18 }
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
    [optimism.name]: 30111
  }

  return map[network.name] ?? -1
}

function apiNetworkNamesMapping(network: Network) {
  const map: Record<string, string> = {
    [mainnet.name]: "NETWORK_ETH",
    [bnb.name]: "NETWORK_BSC",
    [matic.name]: "NETWORK_POL",
    [avalanche.name]: "NETWORK_AVAX",
    [arbitrum.name]: "NETWORK_ARB",
    [optimism.name]: "NETWORK_OP"
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