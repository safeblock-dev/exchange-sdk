import { arbitrum, avalanche, base, bnb, gnosis, mainnet, matic, optimism, scroll, selectAddress, units } from "@safeblock/blockchain-utils"
import { Network } from "ethers"
import { SdkConfig } from "~/sdk"


const contractAddresses = {
  entryPoint: (network: Network, config?: SdkConfig) => selectAddress(network, config?.contractAddresses?.entryPoint ?? {
    default: "0xA5487594bD2303AF225f8c15E80CED0Da883A0E8",
    [units.name]: "0x65DfbA5338137e0De3c7e9C11D9BFEd0B02c33b8"
  }),

  quoter: (network: Network, config?: SdkConfig) => selectAddress(network, config?.contractAddresses?.quoter ?? {
    default: "0x13e6aC30fC8E37792F18b1e3D75B8266B0A93734",
    [units.name]: "0xdF735aCD459014f793E3E7d27F5C598381E23A21"
  }),

  offchainOracle: (network: Network) => selectAddress(network, {
    [scroll.name]: "0xA2a3F952427c22e208a8298fd2346B8e664964b1",
    [units.name]: "0xdd4ec4bFecAb02CbE60CdBA8De49821a1105c24f",
    default: "0x00000000000D6FFc74A8feb35aF5827bf57f6786"
  }),

  stargateUSDCPool: (network: Network) => selectAddress(network, {
    [matic.name]: "0x9Aa02D4Fae7F58b8E8f34c66E756cC734DAc7fe4",
    [mainnet.name]: "0xc026395860Db2d07ee33e05fE50ed7bD583189C7",
    [avalanche.name]: "0x5634c4a5FEd09819E3c46D86A965Dd9447d86e47",
    [arbitrum.name]: "0xe8CDF27AcD73a434D661C84887215F7598e7d0d3",
    [optimism.name]: "0xcE8CcA271Ebc0533920C83d39F417ED6A0abB7D0",
    [base.name]: "0x27a16dc786820B16E5c9028b75B99F6f604b5d26",
    [scroll.name]: "0x3Fc69CC4A842838bCDC9499178740226062b14E4",
    [gnosis.name]: "0xB1EeAD6959cb5bB9B20417d6689922523B2B86C3",
    default: "0x962Bd449E630b0d928f308Ce63f1A21F02576057"
  }),

  usdcParams: (network: Network) => selectAddress(network, {
    [matic.name]: { address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", decimals: 6 },
    [mainnet.name]: { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
    [avalanche.name]: { address: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", decimals: 6 },
    [arbitrum.name]: { address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6 },
    [optimism.name]: { address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", decimals: 6 },
    [base.name]: { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
    [scroll.name]: { address: "0x06eFdBFf2a14a7c8E15944D1F4A48F9F95F663A4", decimals: 6 },
    [gnosis.name]: { address: "0x2a22f9c3b484c3629090FeED35F17Ff8F88f76F0", decimals: 6 },
    [units.name]: { address: "0xEb19000D90f17FFbd3AD9CDB8915D928F4980fD1", decimals: 6 },
    default: { address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18 }
  }),

  multicall: (network: Network) => selectAddress(network, {
    default: "0xcA11bde05977b3631167028862bE2a173976CA11"
  })
}

const publicBackendURL = "https://api.safeblock.com"

const exchangeConstants = {
  versionsMap: {
    "uniswap_v2": "0",
    "uniswap_v3": "8"
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
    [base.name]: 30184,
    [scroll.name]: 30214,
    [gnosis.name]: 30145
  }

  return map[network.name] ?? -1
}

export {
  contractAddresses,
  publicBackendURL,
  exchangeConstants,
  stargateNetworksMapping
}